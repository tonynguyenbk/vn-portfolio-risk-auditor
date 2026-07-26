"""Version 1 routes.

Only ``/health`` exists at Phase 2. The analysis, backtest and stress-test
endpoints of PRD 16.3 arrive with the phases that implement the calculations
behind them — publishing an endpoint that returns placeholder numbers would
violate PRD 0.7.
"""

from __future__ import annotations

from fastapi import APIRouter

from app import __version__
from app.schemas.analysis import HealthResponse

router = APIRouter(prefix="/api/v1")


@router.get("/health", response_model=HealthResponse, tags=["system"])
async def health() -> HealthResponse:
    """Liveness probe (PRD 16.3)."""
    return HealthResponse(status="ok", version=__version__)
