"""
food-budget — FastAPI backend.

Phase 0 endpoints (wiring check):
- /health         : liveness check (used by keep-alive pingers and hosting platforms)
- /api/hello      : trivial endpoint to confirm the frontend can reach the backend
- /api/test-db    : reads from the _ping table to confirm the database connection works

Phase 1 endpoints (product + purchase management):
- GET  /api/stores    : list all stores
- GET  /api/products  : list all pantry products
- POST /api/products  : add a new product to the pantry
- POST /api/purchases : log a purchase
"""

import os
from contextlib import contextmanager
from datetime import date
from typing import Literal
import logging

import psycopg
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
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


# Pydantic models for request/response validation and serialization.

class ProductIn(BaseModel):
    """Product creation request model."""
    name: str = Field(..., max_length=200)
    brand: str | None = Field(None, max_length=200)
    calories_per_100g: float | None = Field(None, ge=0, le=1000)
    protein_per_100g: float | None = Field(None, ge=0, le=100)
    carbs_per_100g: float | None = Field(None, ge=0, le=100)
    fat_per_100g: float | None = Field(None, ge=0, le=100)
    notes: str | None = Field(None, max_length=1000)
    category: Literal['grocery','alcohol','nicotine','event','badminton','other'] = 'grocery'
    unit: Literal['g','mL'] | None = None


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


class PurchaseIn(BaseModel):
    """Purchase creation request model."""
    product_id: int
    store_id: int | None = None
    date: date
    quantity: float | None = Field(None, gt=0, le=100000)
    price_total: float = Field(..., gt=0, le=10000)
    notes: str | None = Field(None, max_length=1000)


class PurchaseOut(BaseModel):
    """Purchase response model."""
    id: int
    product_id: int
    store_id: int | None
    date: date
    quantity: float | None
    price_total: float
    notes: str | None
    created_at: str


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
                           carbs_per_100g, fat_per_100g, notes, category, unit
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
                     carbs_per_100g, fat_per_100g, notes, category, unit)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, name, brand, calories_per_100g, protein_per_100g,
                              carbs_per_100g, fat_per_100g, notes, category, unit
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
                }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Unexpected error in create_product: %s", e)
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
                conn.commit()
                return {
                    "id": row[0],
                    "product_id": row[1],
                    "store_id": row[2],
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
,
                    "store_id": row[2],
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
