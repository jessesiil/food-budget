"""
food-budget — FastAPI backend.

Phase 0 scope: prove the wiring works.
- /health     : liveness check (used by keep-alive pingers and hosting platforms)
- /api/hello  : trivial endpoint to confirm the frontend can reach the backend
- /api/test-db: reads from the _ping table to confirm the database connection works

Real product/purchase endpoints come in Phase 1.
"""

import os
from contextlib import contextmanager
import logging

import psycopg
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
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
