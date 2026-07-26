"""FastAPI application entry point.

Start locally with::

    uv run --directory backend uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.v1.router import router as v1_router
from app.core.config import allowed_origins

app = FastAPI(
    title="VN Portfolio Risk Auditor API",
    version=__version__,
    description=(
        "Risk measurement, model validation and stress testing for a small equity "
        "portfolio. Educational research prototype; not investment advice."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(allowed_origins()),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(v1_router)
