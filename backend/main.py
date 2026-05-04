"""
food-budget - FastAPI backend.

Phase 0 endpoints (wiring check):
- /health         : liveness check (used by keep-alive pingers and hosting platforms)
- /api/hello      : trivial endpoint to confirm the frontend can reach the backend
- /api/test-db    : reads from the _ping table to confirm the database connection works

Phase 1 endpoints (product + purchase management):
- GET    /api/stores              : list all stores
- POST   /api/stores              : add a new store
- GET    /api/products            : list all pantry products
- POST   /api/products            : add a new product to the pantry
- PUT    /api/products/{id}       : update a product
- DELETE /api/products/{id}       : delete a product
- GET    /api/purchases/last-price : last price for a product+store combination
- POST   /api/purchases/batch     : log multiple purchases in one transaction
- POST   /api/purchases           : log a purchase
- GET    /api/purchases           : list purchases (with filters)
- PUT    /api/purchases/{id}      : update a purchase
- DELETE /api/purchases/{id}      : delete a purchase
- GET    /api/dashboard/spend     : daily spend totals for a month
- GET    /api/dashboard/categories: spend by category for a month
- GET    /api/dashboard/macros    : daily macro totals (protein, carbs, fat) for a week
"""

from __future__ import annotations

import os
import json
from contextlib import contextmanager
from datetime import datetime, timedelta
from datetime import date as _Date
from typing import Literal
import logging

import psycopg
from psycopg.errors import ForeignKeyViolation
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Load .env if present (only for local development; on Render the env vars are
# set in the dashboard and load_dotenv is a no-op).
load_dotenv()

# Set up logging to output error details to server logs.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# Rate limiter using client IP address as the key.
limiter = Limiter(key_func=get_remote_address)

DATABASE_URL = os.getenv("DATABASE_URL")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN")
CORS_DEV_ORIGINS_STR = os.getenv("CORS_DEV_ORIGINS", "")

app = FastAPI(title="food-budget API", version="0.1.0")

# Wire rate limiter into app state and register exception handler for 429 responses.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS: which origins are allowed to call this API from a browser.
# Production frontend origin is required; dev origins are optional (for local development).

if not FRONTEND_ORIGIN:
    raise RuntimeError(
        "FRONTEND_ORIGIN is required. Set it in backend/.env or as an environment variable."
    )

# Parse comma-separated dev origins (if present) and combine with production origin.
cors_origins = [FRONTEND_ORIGIN]
if CORS_DEV_ORIGINS_STR:
    dev_origins = [o.strip() for o in CORS_DEV_ORIGINS_STR.split(",") if o.strip()]
    cors_origins.extend(dev_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

logger.info("FRONTEND_ORIGIN loaded: %s", FRONTEND_ORIGIN)


# Sorting whitelists for query safety
SORT_COLUMN_MAP = {
    "date": "pu.date",
    "price_total": "pu.price_total",
    "product_name": "p.name",
    "store_name": "s.name",
    "category": "p.category",
    "quantity": "pu.quantity",
}
SORT_DIR_MAP = {"asc": "ASC", "desc": "DESC"}


def get_month_boundaries(month_str: str | None) -> tuple[str, str, str]:
    """
    Parse month_str (YYYY-MM format) or use current month.
    Returns (month_str, first_day, next_month_first_day) as ISO date strings.
    """
    if month_str:
        try:
            dt = datetime.strptime(month_str, "%Y-%m")
        except ValueError:
            raise HTTPException(status_code=400, detail="month must be in YYYY-MM format")
    else:
        dt = datetime.now()

    year, month = dt.year, dt.month
    month_str = f"{year:04d}-{month:02d}"
    first_day = f"{year:04d}-{month:02d}-01"

    # Calculate next month's first day
    if month == 12:
        next_month_first_day = f"{year+1:04d}-01-01"
    else:
        next_month_first_day = f"{year:04d}-{month+1:02d}-01"

    return month_str, first_day, next_month_first_day


def get_week_boundaries(week_str: str | None) -> tuple[str, str]:
    """
    Parse week_str (YYYY-MM-DD format, must be a Monday) or use the Monday of the current week.
    Returns (week_start, week_end) as ISO date strings, where week_end is the Sunday.
    """
    if week_str:
        try:
            dt = datetime.strptime(week_str, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid week format, expected YYYY-MM-DD")

        # Check if it's a Monday (weekday 0 = Monday)
        if dt.weekday() != 0:
            raise HTTPException(status_code=400, detail="week must be a Monday (YYYY-MM-DD)")

        week_start = dt.isoformat()
    else:
        # Get Monday of current week
        today = datetime.now().date()
        days_since_monday = today.weekday()  # 0 = Monday, 6 = Sunday
        dt = today - timedelta(days=days_since_monday)
        week_start = dt.isoformat()

    # Calculate Sunday (6 days after Monday)
    week_end_date = datetime.strptime(week_start, "%Y-%m-%d").date() + timedelta(days=6)
    week_end = week_end_date.isoformat()

    return week_start, week_end


# Pydantic models for request/response validation and serialization.

class StoreIn(BaseModel):
    """Store creation request model."""
    name: str = Field(..., min_length=1, max_length=100)


class PresetModel(BaseModel):
    """A single quantity preset for a product."""
    quantity: float = Field(..., gt=0, le=100000)
    label: str = Field(..., max_length=50)


class ProductIn(BaseModel):
    """Product creation request model."""
    name: str = Field(..., max_length=200)
    brand: str | None = Field(None, max_length=200)
    calories_per_100g: float | None = Field(None, ge=0, le=1000)
    protein_per_100g: float | None = Field(None, ge=0, le=100)
    carbs_per_100g: float | None = Field(None, ge=0, le=100)
    fat_per_100g: float | None = Field(None, ge=0, le=100)
    notes: str | None = Field(None, max_length=1000)
    category: Literal['grocery','alcohol','nicotine','event','badminton','travel','other'] = 'grocery'
    unit: Literal['g','mL'] | None = None
    presets: list[PresetModel] = Field(default_factory=list, max_length=4)


class ProductOut(BaseModel):
    """Product response model."""
    id: int
    name: str
    brand: str | None
    calories_per_100g: float | None
    protein_per_100g: float | None
    carbs_per_100g: float | None
    fat_per_100g: float | None
    notes: str | None
    category: str
    unit: str | None
    presets: list[PresetModel] = []


class ProductUpdate(BaseModel):
    """Product update request model (all fields optional)."""
    name: str | None = Field(None, max_length=200)
    brand: str | None = Field(None, max_length=200)
    calories_per_100g: float | None = Field(None, ge=0, le=1000)
    protein_per_100g: float | None = Field(None, ge=0, le=100)
    carbs_per_100g: float | None = Field(None, ge=0, le=100)
    fat_per_100g: float | None = Field(None, ge=0, le=100)
    notes: str | None = Field(None, max_length=1000)
    category: Literal['grocery','alcohol','nicotine','event','badminton','travel','other'] | None = None
    unit: Literal['g','mL'] | None = None
    presets: list[PresetModel] | None = Field(None, max_length=4)


class PurchaseItemIn(BaseModel):
    """One item in a batch purchase."""
    product_id: int
    quantity: float | None = Field(None, gt=0, le=100000)
    price_total: float = Field(..., gt=0, le=10000)
    notes: str | None = Field(None, max_length=1000)


class BatchPurchaseIn(BaseModel):
    """Batch purchase request - one store, one date, multiple items."""
    store_id: int | None = None
    date: _Date
    items: list[PurchaseItemIn] = Field(..., min_length=1)


class PurchaseIn(BaseModel):
    """Purchase creation request model."""
    product_id: int
    store_id: int | None = None
    date: _Date
    quantity: float | None = Field(None, gt=0, le=100000)
    price_total: float = Field(..., gt=0, le=10000)
    notes: str | None = Field(None, max_length=1000)


class PurchaseOut(BaseModel):
    """Purchase response model."""
    id: int
    product_id: int
    product_name: str
    store_id: int | None
    store_name: str | None
    category: str
    date: _Date
    quantity: float | None
    price_total: float
    notes: str | None
    created_at: str


class PurchaseUpdate(BaseModel):
    """Purchase update request model (all fields optional)."""
    product_id: int | None = None
    store_id: int | None = None
    date: _Date | None = None
    quantity: float | None = Field(None, gt=0, le=100000)
    price_total: float | None = Field(None, gt=0, le=10000)
    notes: str | None = Field(None, max_length=1000)


class DailySpendOut(BaseModel):
    """Daily spend entry for dashboard."""
    date: str
    amount: float


class DashboardSpendOut(BaseModel):
    """Dashboard spend response."""
    month: str
    total: float
    days: list[DailySpendOut]


class CategorySpendOut(BaseModel):
    """Category spend entry for dashboard."""
    category: str
    amount: float


class DashboardCategoriesOut(BaseModel):
    """Dashboard categories response."""
    month: str
    total: float
    categories: list[CategorySpendOut]


class DailyMacroOut(BaseModel):
    """Daily macro entry for dashboard."""
    date: str
    protein_g: float
    carbs_g: float
    fat_g: float


class MacroTotalsOut(BaseModel):
    """Totals for macro dashboard."""
    protein_g: float
    carbs_g: float
    fat_g: float
    calories: float


class DashboardMacrosOut(BaseModel):
    """Dashboard macros response."""
    week_start: str
    week_end: str
    days: list[DailyMacroOut]
    totals: MacroTotalsOut


@contextmanager
def get_db():
    """Yield a Postgres connection. Closes automatically when the block exits."""
    if not DATABASE_URL:
        raise HTTPException(
            status_code=503,
            detail="DATABASE_URL is not configured. See backend/.env.example.",
        )
    try:
        conn = psycopg.connect(DATABASE_URL)
    except psycopg.Error as e:
        logger.error("Database connection failed: %s", e)
        raise HTTPException(
            status_code=503,
            detail="Database unavailable"
        )
    try:
        yield conn
    except psycopg.Error as e:
        logger.error("Database error during query execution: %s", e)
        raise HTTPException(
            status_code=503,
            detail="Database error"
        )
    finally:
        conn.close()


@app.get("/health")
@limiter.limit("120/minute")
def health(request: Request):
    """Liveness check. Always returns 200 unless the process is dead."""
    return {"status": "ok"}


@app.get("/api/hello")
@limiter.limit("30/minute")
def hello(request: Request):
    """Minimal endpoint used by the frontend's 'Test backend' button."""
    return {"message": "Hello from food-budget backend"}


@app.get("/api/test-db")
@limiter.limit("30/minute")
def test_db(request: Request):
    """Reads the most recent row from the _ping table. Proves DB connectivity."""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT message, created_at FROM _ping ORDER BY id DESC LIMIT 1"
            )
            row = cur.fetchone()
            if row is None:
                return {
                    "message": "Connected to DB but _ping table is empty.",
                    "created_at": None,
                }
            message, created_at = row
            return {
                "message": message,
                "created_at": created_at.isoformat() if created_at else None,
            }


@app.get("/api/stores", response_model=list[dict])
@limiter.limit("30/minute")
def get_stores(request: Request):
    """Returns all stores ordered by name."""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id, name FROM stores ORDER BY name ASC")
                rows = cur.fetchall()
                return [{"id": row[0], "name": row[1]} for row in rows]
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Unexpected error in get_stores: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/api/stores", response_model=dict, status_code=201)
@limiter.limit("10/minute")
def create_store(request: Request, store: StoreIn):
    """Creates a new store."""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                # Check for duplicate name (case-insensitive)
                cur.execute("SELECT id FROM stores WHERE lower(name) = lower(%s)", (store.name,))
                if cur.fetchone():
                    raise HTTPException(status_code=409, detail="A store with that name already exists.")
                cur.execute(
                    "INSERT INTO stores (name) VALUES (%s) RETURNING id, name",
                    (store.name,)
                )
                row = cur.fetchone()
                conn.commit()
                return {"id": row[0], "name": row[1]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Unexpected error in create_store: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/api/products", response_model=list[ProductOut])
@limiter.limit("30/minute")
def get_products(request: Request):
    """Returns all products ordered by name."""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, name, brand, calories_per_100g, protein_per_100g,
                           carbs_per_100g, fat_per_100g, notes, category, unit, presets
                    FROM products
                    ORDER BY name ASC
                    """
                )
                rows = cur.fetchall()
                return [
                    {
                        "id": row[0],
                        "name": row[1],
                        "brand": row[2],
                        "calories_per_100g": row[3],
                        "protein_per_100g": row[4],
                        "carbs_per_100g": row[5],
                        "fat_per_100g": row[6],
                        "notes": row[7],
                        "category": row[8],
                        "unit": row[9],
                        "presets": row[10] if row[10] else [],
                    }
                    for row in rows
                ]
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Unexpected error in get_products: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/api/products", response_model=ProductOut, status_code=201)
@limiter.limit("10/minute")
def create_product(request: Request, product: ProductIn):
    """Creates a new pantry product."""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO products
                    (name, brand, calories_per_100g, protein_per_100g,
                     carbs_per_100g, fat_per_100g, notes, category, unit, presets)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, name, brand, calories_per_100g, protein_per_100g,
                              carbs_per_100g, fat_per_100g, notes, category, unit, presets
                    """,
                    (
                        product.name,
                        product.brand,
                        product.calories_per_100g,
                        product.protein_per_100g,
                        product.carbs_per_100g,
                        product.fat_per_100g,
                        product.notes,
                        product.category,
                        product.unit,
                        json.dumps([p.model_dump() for p in product.presets]),
                    ),
                )
                row = cur.fetchone()
                conn.commit()
                return {
                    "id": row[0],
                    "name": row[1],
                    "brand": row[2],
                    "calories_per_100g": row[3],
                    "protein_per_100g": row[4],
                    "carbs_per_100g": row[5],
                    "fat_per_100g": row[6],
                    "notes": row[7],
                    "category": row[8],
                    "unit": row[9],
                    "presets": row[10] if row[10] else [],
                }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Unexpected error in create_product: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/api/purchases/last-price")
@limiter.limit("60/minute")
def get_last_price(
    request: Request,
    product_id: int = Query(..., description="Product ID"),
    store_id: int = Query(..., description="Store ID"),
):
    """Returns the price_total from the most recent purchase of a product at a store."""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT price_total
                    FROM purchases
                    WHERE product_id = %s AND store_id = %s
                    ORDER BY date DESC, created_at DESC
                    LIMIT 1
                    """,
                    (product_id, store_id),
                )
                row = cur.fetchone()
                return {"price": float(row[0]) if row else None}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Unexpected error in get_last_price: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/api/purchases/batch", response_model=list[PurchaseOut], status_code=201)
@limiter.limit("10/minute")
def create_purchases_batch(request: Request, batch: BatchPurchaseIn):
    """Creates multiple purchases in a single transaction."""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                # Validate store if provided
                if batch.store_id is not None:
                    cur.execute("SELECT id FROM stores WHERE id = %s", (batch.store_id,))
                    if cur.fetchone() is None:
                        raise HTTPException(status_code=404, detail="Store not found")

                results = []
                for item in batch.items:
                    # Validate product
                    cur.execute("SELECT name, category FROM products WHERE id = %s", (item.product_id,))
                    product_row = cur.fetchone()
                    if product_row is None:
                        raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")
                    product_name, category = product_row

                    cur.execute(
                        """
                        INSERT INTO purchases
                        (product_id, store_id, date, quantity, price_total, notes)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        RETURNING id, product_id, store_id, date, quantity,
                                  price_total, notes, created_at
                        """,
                        (item.product_id, batch.store_id, batch.date,
                         item.quantity, item.price_total, item.notes),
                    )
                    row = cur.fetchone()

                    # Fetch store name
                    store_name = None
                    if batch.store_id is not None:
                        cur.execute("SELECT name FROM stores WHERE id = %s", (batch.store_id,))
                        store_row = cur.fetchone()
                        store_name = store_row[0] if store_row else None

                    results.append({
                        "id": row[0],
                        "product_id": row[1],
                        "product_name": product_name,
                        "store_id": row[2],
                        "store_name": store_name,
                        "category": category,
                        "date": row[3],
                        "quantity": row[4],
                        "price_total": row[5],
                        "notes": row[6],
                        "created_at": row[7].isoformat() if row[7] else None,
                    })

                conn.commit()
                return results
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Unexpected error in create_purchases_batch: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/api/purchases", response_model=PurchaseOut, status_code=201)
@limiter.limit("10/minute")
def create_purchase(request: Request, purchase: PurchaseIn):
    """Logs a purchase."""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                # Validate product exists.
                cur.execute("SELECT id FROM products WHERE id = %s", (purchase.product_id,))
                if cur.fetchone() is None:
                    raise HTTPException(status_code=404, detail="Product not found")

                # Validate store exists if provided.
                if purchase.store_id is not None:
                    cur.execute("SELECT id FROM stores WHERE id = %s", (purchase.store_id,))
                    if cur.fetchone() is None:
                        raise HTTPException(status_code=404, detail="Store not found")

                # Insert purchase.
                cur.execute(
                    """
                    INSERT INTO purchases
                    (product_id, store_id, date, quantity, price_total, notes)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    RETURNING id, product_id, store_id, date, quantity,
                              price_total, notes, created_at
                    """,
                    (
                        purchase.product_id,
                        purchase.store_id,
                        purchase.date,
                        purchase.quantity,
                        purchase.price_total,
                        purchase.notes,
                    ),
                )
                row = cur.fetchone()
                purchase_id = row[0]
                product_id = row[1]
                store_id = row[2]

                # Fetch product name and category
                cur.execute(
                    "SELECT name, category FROM products WHERE id = %s",
                    (product_id,),
                )
                product_row = cur.fetchone()
                product_name = product_row[0]
                category = product_row[1]

                # Fetch store name if store_id exists
                store_name = None
                if store_id is not None:
                    cur.execute(
                        "SELECT name FROM stores WHERE id = %s",
                        (store_id,),
                    )
                    store_row = cur.fetchone()
                    store_name = store_row[0] if store_row else None

                conn.commit()
                return {
                    "id": purchase_id,
                    "product_id": product_id,
                    "product_name": product_name,
                    "store_id": store_id,
                    "store_name": store_name,
                    "category": category,
                    "date": row[3],
                    "quantity": row[4],
                    "price_total": row[5],
                    "notes": row[6],
                    "created_at": row[7].isoformat() if row[7] else None,
                }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Unexpected error in create_purchase: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/api/purchases", response_model=list[PurchaseOut])
@limiter.limit("30/minute")
def get_purchases(
    request: Request,
    month: str | None = Query(None, description="Filter by month (YYYY-MM format)"),
    category: str | None = Query(None, description="Filter by product category"),
    store_id: int | None = Query(None, description="Filter by store ID"),
    sort_by: str = Query("date", description="Column to sort by: date, price_total, product_name"),
    sort_dir: str = Query("desc", description="Sort direction: asc or desc"),
):
    """Returns all purchases with optional filters and sorting."""
    try:
        # Validate sort parameters
        if sort_by not in SORT_COLUMN_MAP:
            raise HTTPException(status_code=400, detail=f"Invalid sort_by: {sort_by}")
        if sort_dir not in SORT_DIR_MAP:
            raise HTTPException(status_code=400, detail=f"Invalid sort_dir: {sort_dir}")

        sort_column = SORT_COLUMN_MAP[sort_by]
        sort_direction = SORT_DIR_MAP[sort_dir]

        with get_db() as conn:
            with conn.cursor() as cur:
                # Build WHERE clause and params
                where_clauses = []
                params = []

                if month:
                    month_str, first_day, next_month_first_day = get_month_boundaries(month)
                    where_clauses.append("pu.date >= %s AND pu.date < %s")
                    params.extend([first_day, next_month_first_day])

                if category:
                    where_clauses.append("p.category = %s")
                    params.append(category)

                if store_id is not None:
                    where_clauses.append("pu.store_id = %s")
                    params.append(store_id)

                where_clause = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""

                # Build and execute query with safe sort column interpolation
                query = f"""
                    SELECT pu.id, pu.product_id, p.name, pu.store_id, s.name,
                           p.category, pu.date, pu.quantity, pu.price_total, pu.notes, pu.created_at
                    FROM purchases pu
                    JOIN products p ON p.id = pu.product_id
                    LEFT JOIN stores s ON s.id = pu.store_id
                    {where_clause}
                    ORDER BY {sort_column} {sort_direction}
                """
                cur.execute(query, params)
                rows = cur.fetchall()

                return [
                    {
                        "id": row[0],
                        "product_id": row[1],
                        "product_name": row[2],
                        "store_id": row[3],
                        "store_name": row[4],
                        "category": row[5],
                        "date": row[6],
                        "quantity": row[7],
                        "price_total": row[8],
                        "notes": row[9],
                        "created_at": row[10].isoformat() if row[10] else None,
                    }
                    for row in rows
                ]
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Unexpected error in get_purchases: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/api/dashboard/spend", response_model=DashboardSpendOut)
@limiter.limit("30/minute")
def get_dashboard_spend(
    request: Request,
    month: str | None = Query(None, description="Month in YYYY-MM format (defaults to current month)"),
):
    """Returns daily spend totals for the given month for a line chart."""
    try:
        month_str, first_day, next_month_first_day = get_month_boundaries(month)

        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT date::text, SUM(price_total)
                    FROM purchases
                    WHERE date >= %s AND date < %s
                    GROUP BY date
                    ORDER BY date
                    """,
                    (first_day, next_month_first_day),
                )
                rows = cur.fetchall()

                total = sum(float(row[1]) for row in rows)
                days = [
                    {"date": row[0], "amount": float(row[1])}
                    for row in rows
                ]

                return {
                    "month": month_str,
                    "total": total,
                    "days": days,
                }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Unexpected error in get_dashboard_spend: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/api/dashboard/categories", response_model=DashboardCategoriesOut)
@limiter.limit("30/minute")
def get_dashboard_categories(
    request: Request,
    month: str | None = Query(None, description="Month in YYYY-MM format (defaults to current month)"),
):
    """Returns total spend grouped by product category for the given month for a bar chart."""
    try:
        month_str, first_day, next_month_first_day = get_month_boundaries(month)

        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT p.category, SUM(pu.price_total)
                    FROM purchases pu
                    JOIN products p ON p.id = pu.product_id
                    WHERE pu.date >= %s AND pu.date < %s
                    GROUP BY p.category
                    ORDER BY SUM(pu.price_total) DESC
                    """,
                    (first_day, next_month_first_day),
                )
                rows = cur.fetchall()

                total = sum(float(row[1]) for row in rows)
                categories = [
                    {"category": row[0], "amount": float(row[1])}
                    for row in rows
                ]

                return {
                    "month": month_str,
                    "total": total,
                    "categories": categories,
                }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Unexpected error in get_dashboard_categories: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.put("/api/products/{product_id}", response_model=ProductOut)
@limiter.limit("10/minute")
def update_product(request: Request, product_id: int, product_update: ProductUpdate):
    """Updates a product by id. Only updates fields that are explicitly provided."""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                # Check if product exists
                cur.execute("SELECT id FROM products WHERE id = %s", (product_id,))
                if cur.fetchone() is None:
                    raise HTTPException(status_code=404, detail="Product not found")

                # Build UPDATE query based on fields that were provided
                update_fields = []
                update_values = []
                fields_set = product_update.model_fields_set

                if "name" in fields_set:
                    update_fields.append("name = %s")
                    update_values.append(product_update.name)
                if "brand" in fields_set:
                    update_fields.append("brand = %s")
                    update_values.append(product_update.brand)
                if "calories_per_100g" in fields_set:
                    update_fields.append("calories_per_100g = %s")
                    update_values.append(product_update.calories_per_100g)
                if "protein_per_100g" in fields_set:
                    update_fields.append("protein_per_100g = %s")
                    update_values.append(product_update.protein_per_100g)
                if "carbs_per_100g" in fields_set:
                    update_fields.append("carbs_per_100g = %s")
                    update_values.append(product_update.carbs_per_100g)
                if "fat_per_100g" in fields_set:
                    update_fields.append("fat_per_100g = %s")
                    update_values.append(product_update.fat_per_100g)
                if "notes" in fields_set:
                    update_fields.append("notes = %s")
                    update_values.append(product_update.notes)
                if "category" in fields_set:
                    update_fields.append("category = %s")
                    update_values.append(product_update.category)
                if "unit" in fields_set:
                    update_fields.append("unit = %s")
                    update_values.append(product_update.unit)
                if "presets" in fields_set:
                    preset_value = product_update.presets or []
                    update_fields.append("presets = %s")
                    update_values.append(json.dumps([p.model_dump() for p in preset_value]))

                # If no fields were provided, return the existing product
                if not update_fields:
                    cur.execute(
                        """
                        SELECT id, name, brand, calories_per_100g, protein_per_100g,
                               carbs_per_100g, fat_per_100g, notes, category, unit, presets
                        FROM products WHERE id = %s
                        """,
                        (product_id,)
                    )
                    row = cur.fetchone()
                    return {
                        "id": row[0],
                        "name": row[1],
                        "brand": row[2],
                        "calories_per_100g": row[3],
                        "protein_per_100g": row[4],
                        "carbs_per_100g": row[5],
                        "fat_per_100g": row[6],
                        "notes": row[7],
                        "category": row[8],
                        "unit": row[9],
                        "presets": row[10] if row[10] else [],
                    }

                # Execute UPDATE
                update_values.append(product_id)
                query = f"""
                    UPDATE products
                    SET {', '.join(update_fields)}
                    WHERE id = %s
                    RETURNING id, name, brand, calories_per_100g, protein_per_100g,
                              carbs_per_100g, fat_per_100g, notes, category, unit, presets
                """
                cur.execute(query, update_values)
                row = cur.fetchone()
                conn.commit()

                return {
                    "id": row[0],
                    "name": row[1],
                    "brand": row[2],
                    "calories_per_100g": row[3],
                    "protein_per_100g": row[4],
                    "carbs_per_100g": row[5],
                    "fat_per_100g": row[6],
                    "notes": row[7],
                    "category": row[8],
                    "unit": row[9],
                    "presets": row[10] if row[10] else [],
                }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Unexpected error in update_product: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.delete("/api/products/{product_id}", status_code=204)
@limiter.limit("10/minute")
def delete_product(request: Request, product_id: int):
    """Deletes a product by id. Returns 409 if product has purchase history."""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                # Check if product exists
                cur.execute("SELECT id FROM products WHERE id = %s", (product_id,))
                if cur.fetchone() is None:
                    raise HTTPException(status_code=404, detail="Product not found")

                # Try to delete the product
                try:
                    cur.execute("DELETE FROM products WHERE id = %s", (product_id,))
                    conn.commit()
                except ForeignKeyViolation:
                    conn.rollback()
                    raise HTTPException(
                        status_code=409,
                        detail="Cannot delete product with purchase history. Delete the purchases first."
                    )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Unexpected error in delete_product: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.put("/api/purchases/{purchase_id}", response_model=PurchaseOut)
@limiter.limit("10/minute")
def update_purchase(request: Request, purchase_id: int, purchase_update: PurchaseUpdate):
    """Updates a purchase by id. Only updates fields that are explicitly provided."""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                # Check if purchase exists
                cur.execute("SELECT id FROM purchases WHERE id = %s", (purchase_id,))
                if cur.fetchone() is None:
                    raise HTTPException(status_code=404, detail="Purchase not found")

                # Validate product_id if provided
                if "product_id" in purchase_update.model_fields_set:
                    cur.execute("SELECT id FROM products WHERE id = %s", (purchase_update.product_id,))
                    if cur.fetchone() is None:
                        raise HTTPException(status_code=404, detail="Product not found")

                # Validate store_id if provided
                if "store_id" in purchase_update.model_fields_set and purchase_update.store_id is not None:
                    cur.execute("SELECT id FROM stores WHERE id = %s", (purchase_update.store_id,))
                    if cur.fetchone() is None:
                        raise HTTPException(status_code=404, detail="Store not found")

                # Build UPDATE query based on fields that were provided
                update_fields = []
                update_values = []
                fields_set = purchase_update.model_fields_set

                if "product_id" in fields_set:
                    update_fields.append("product_id = %s")
                    update_values.append(purchase_update.product_id)
                if "store_id" in fields_set:
                    update_fields.append("store_id = %s")
                    update_values.append(purchase_update.store_id)
                if "date" in fields_set:
                    update_fields.append("date = %s")
                    update_values.append(purchase_update.date)
                if "quantity" in fields_set:
                    update_fields.append("quantity = %s")
                    update_values.append(purchase_update.quantity)
                if "price_total" in fields_set:
                    update_fields.append("price_total = %s")
                    update_values.append(purchase_update.price_total)
                if "notes" in fields_set:
                    update_fields.append("notes = %s")
                    update_values.append(purchase_update.notes)

                # If no fields were provided, return the existing purchase
                if not update_fields:
                    cur.execute(
                        """
                        SELECT pu.id, pu.product_id, p.name, pu.store_id, s.name,
                               p.category, pu.date, pu.quantity, pu.price_total, pu.notes, pu.created_at
                        FROM purchases pu
                        JOIN products p ON p.id = pu.product_id
                        LEFT JOIN stores s ON s.id = pu.store_id
                        WHERE pu.id = %s
                        """,
                        (purchase_id,)
                    )
                    row = cur.fetchone()
                    return {
                        "id": row[0],
                        "product_id": row[1],
                        "product_name": row[2],
                        "store_id": row[3],
                        "store_name": row[4],
                        "category": row[5],
                        "date": row[6],
                        "quantity": row[7],
                        "price_total": row[8],
                        "notes": row[9],
                        "created_at": row[10].isoformat() if row[10] else None,
                    }

                # Execute UPDATE
                update_values.append(purchase_id)
                query = f"""
                    UPDATE purchases
                    SET {', '.join(update_fields)}
                    WHERE id = %s
                    RETURNING id, product_id, store_id, date, quantity, price_total, notes, created_at
                """
                cur.execute(query, update_values)
                row = cur.fetchone()

                # Fetch product and store details for response
                product_id = row[1]
                store_id = row[2]

                cur.execute(
                    "SELECT name, category FROM products WHERE id = %s",
                    (product_id,)
                )
                product_row = cur.fetchone()
                product_name = product_row[0]
                category = product_row[1]

                store_name = None
                if store_id is not None:
                    cur.execute(
                        "SELECT name FROM stores WHERE id = %s",
                        (store_id,)
                    )
                    store_row = cur.fetchone()
                    store_name = store_row[0] if store_row else None

                conn.commit()
                return {
                    "id": row[0],
                    "product_id": product_id,
                    "product_name": product_name,
                    "store_id": store_id,
                    "store_name": store_name,
                    "category": category,
                    "date": row[3],
                    "quantity": row[4],
                    "price_total": row[5],
                    "notes": row[6],
                    "created_at": row[7].isoformat() if row[7] else None,
                }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Unexpected error in update_purchase: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.delete("/api/purchases/{purchase_id}", status_code=204)
@limiter.limit("10/minute")
def delete_purchase(request: Request, purchase_id: int):
    """Deletes a purchase by id."""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                # Check if purchase exists
                cur.execute("SELECT id FROM purchases WHERE id = %s", (purchase_id,))
                if cur.fetchone() is None:
                    raise HTTPException(status_code=404, detail="Purchase not found")

                # Delete the purchase
                cur.execute("DELETE FROM purchases WHERE id = %s", (purchase_id,))
                conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Unexpected error in delete_purchase: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/api/dashboard/macros", response_model=DashboardMacrosOut)
@limiter.limit("30/minute")
def get_dashboard_macros(
    request: Request,
    week: str | None = Query(None, description="Week start (Monday) in YYYY-MM-DD format (defaults to current week)"),
):
    """Returns daily macro totals (protein, carbs, fat in grams) for the given week."""
    try:
        week_start, week_end = get_week_boundaries(week)

        with get_db() as conn:
            with conn.cursor() as cur:
                # Query macro data for the week
                cur.execute(
                    """
                    SELECT pu.date,
                           SUM(p.protein_per_100g / 100.0 * pu.quantity),
                           SUM(p.carbs_per_100g / 100.0 * pu.quantity),
                           SUM(p.fat_per_100g / 100.0 * pu.quantity)
                    FROM purchases pu
                    JOIN products p ON p.id = pu.product_id
                    WHERE pu.date >= %s AND pu.date <= %s
                      AND p.unit IS NOT NULL
                      AND pu.quantity IS NOT NULL
                      AND p.protein_per_100g IS NOT NULL
                      AND p.carbs_per_100g IS NOT NULL
                      AND p.fat_per_100g IS NOT NULL
                    GROUP BY pu.date
                    ORDER BY pu.date ASC
                    """,
                    (week_start, week_end),
                )
                rows = cur.fetchall()

                # Create a mapping from date string to macro data
                macro_data = {}
                for date_str, protein, carbs, fat in rows:
                    macro_data[date_str] = {
                        "protein_g": float(protein) if protein else 0.0,
                        "carbs_g": float(carbs) if carbs else 0.0,
                        "fat_g": float(fat) if fat else 0.0,
                    }

                # Build full week skeleton (Mon-Sun)
                week_start_date = datetime.strptime(week_start, "%Y-%m-%d").date()
                days = []
                for i in range(7):  # 0=Monday through 6=Sunday
                    current_date = week_start_date + timedelta(days=i)
                    date_key = current_date.isoformat()
                    if date_key in macro_data:
                        days.append({
                            "date": date_key,
                            "protein_g": macro_data[date_key]["protein_g"],
                            "carbs_g": macro_data[date_key]["carbs_g"],
                            "fat_g": macro_data[date_key]["fat_g"],
                        })
                    else:
                        days.append({
                            "date": date_key,
                            "protein_g": 0.0,
                            "carbs_g": 0.0,
                            "fat_g": 0.0,
                        })

                # Calculate totals
                total_protein = sum(d["protein_g"] for d in days)
                total_carbs = sum(d["carbs_g"] for d in days)
                total_fat = sum(d["fat_g"] for d in days)
                total_calories = total_protein * 4 + total_carbs * 4 + total_fat * 9

                return {
                    "week_start": week_start,
                    "week_end": week_end,
                    "days": days,
                    "totals": {
                        "protein_g": total_protein,
                        "carbs_g": total_carbs,
                        "fat_g": total_fat,
                        "calories": total_calories,
                    },
                }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Unexpected error in get_dashboard_macros: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error")
