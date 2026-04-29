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

import psycopg
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Load .env if present (only for local development; on Render the env vars are
# set in the dashboard and load_dotenv is a no-op).
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN")

app = FastAPI(title="food-budget API", version="0.1.0")

# CORS: which origins are allowed to call this API from a browser.
# Local dev origins always allowed; production frontend origin pulled from env.
allowed_origins = [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]
if FRONTEND_ORIGIN:
    allowed_origins.append(FRONTEND_ORIGIN)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@contextmanager
def get_db():
    """Yield a Postgres connection. Closes automatically when the block exits."""
    if not DATABASE_URL:
        raise HTTPException(
            status_code=503,
            detail="DATABASE_URL is not configured. See backend/.env.example.",
        )
    conn = psycopg.connect(DATABASE_URL)
    try:
        yield conn
    finally:
        conn.close()


@app.get("/health")
def health():
    """Liveness check. Always returns 200 unless the process is dead."""
    return {"status": "ok"}


@app.get("/api/hello")
def hello():
    """Minimal endpoint used by the frontend's 'Test backend' button."""
    return {"message": "Hello from food-budget backend"}


@app.get("/api/test-db")
def test_db():
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
