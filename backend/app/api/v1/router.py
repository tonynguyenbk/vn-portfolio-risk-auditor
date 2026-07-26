"""Version 1 routes.

Uploads are read into memory, parsed and discarded. Nothing is written to disk
and nothing is retained after the response is built, which is what PRD 17
requires of portfolio data.
"""

from __future__ import annotations

import io
import json

import pandas as pd
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app import __version__
from app.core.config import MAX_UPLOAD_BYTES
from app.schemas.analysis import (
    AnalysisConfig,
    AnalysisResult,
    Assumptions,
    BacktestPoint,
    BacktestResponse,
    BacktestSummaryRow,
    HealthResponse,
    RiskLimits,
)
from app.services.analysis import AnalysisBlockedError, run_analysis
from app.services.backtesting import BacktestResult, compare_models, walk_forward_backtest
from app.services.data_validation import DataValidationError
from app.services.portfolio_metrics import TRADING_DAYS_PER_YEAR
from app.services.var_models import QUANTILE_METHOD_DESCRIPTION

router = APIRouter(prefix="/api/v1")


@router.get("/health", response_model=HealthResponse, tags=["system"])
async def health() -> HealthResponse:
    """Liveness probe (PRD 16.3)."""
    return HealthResponse(status="ok", version=__version__)


@router.post("/analyse", response_model=AnalysisResult, tags=["analysis"])
async def analyse(
    market_file: UploadFile = File(...),
    portfolio_file: UploadFile = File(...),
    config_json: str | None = Form(default=None),
    limits_json: str | None = Form(default=None),
) -> AnalysisResult:
    """Run a full portfolio risk analysis (PRD 16.3)."""
    market = await _read_csv(market_file, "market_file")
    portfolio = await _read_csv(portfolio_file, "portfolio_file")
    config = _parse_model(config_json, AnalysisConfig, "config_json")
    limits = _parse_model(limits_json, RiskLimits, "limits_json")

    try:
        bundle = run_analysis(market, portfolio, config, limits)
    except AnalysisBlockedError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "ANALYSIS_BLOCKED",
                "message": str(exc),
                "issues": [issue.model_dump(by_alias=True) for issue in exc.report.issues],
            },
        ) from exc
    except DataValidationError as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_INPUT", "message": str(exc)},
        ) from exc
    except (ValueError, KeyError) as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": "CALCULATION_ERROR", "message": str(exc)},
        ) from exc

    return bundle.result


@router.post("/backtest", response_model=BacktestResponse, tags=["analysis"])
async def backtest(
    market_file: UploadFile = File(...),
    portfolio_file: UploadFile = File(...),
    config_json: str | None = Form(default=None),
    limits_json: str | None = Form(default=None),
) -> BacktestResponse:
    """Walk-forward backtest every selected model, with the Kupiec test."""
    market = await _read_csv(market_file, "market_file")
    portfolio = await _read_csv(portfolio_file, "portfolio_file")
    config = _parse_model(config_json, AnalysisConfig, "config_json") or AnalysisConfig()
    limits = _parse_model(limits_json, RiskLimits, "limits_json") or RiskLimits()

    try:
        bundle = run_analysis(market, portfolio, config, limits)
        series = bundle.portfolio_return_series

        results = compare_models(
            series,
            models=list(config.models),
            confidence_levels=list(config.confidence_levels),
            window=config.rolling_window,
            lambda_=config.ewma_lambda,
            significance=limits.test_significance,
        )
        primary = walk_forward_backtest(
            series,
            model=config.models[0],
            confidence=config.confidence_levels[0],
            window=config.rolling_window,
            lambda_=config.ewma_lambda,
            significance=limits.test_significance,
        )
    except AnalysisBlockedError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": "ANALYSIS_BLOCKED", "message": str(exc)},
        ) from exc
    except (ValueError, KeyError) as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": "CALCULATION_ERROR", "message": str(exc)},
        ) from exc

    return BacktestResponse(
        series=[
            BacktestPoint(
                date=point.date,
                loss=point.loss,
                var_threshold=point.var_threshold,
                is_exception=point.is_exception,
            )
            for point in primary.series
        ],
        summary=[_to_summary_row(result) for result in results],
        assumptions=Assumptions(
            rolling_window=config.rolling_window,
            forecast_horizon_days=config.forecast_horizon_days,
            ewma_lambda=config.ewma_lambda,
            trading_days_per_year=TRADING_DAYS_PER_YEAR,
            quantile_method=QUANTILE_METHOD_DESCRIPTION,
            price_basis="close",
        ),
    )


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _to_summary_row(result: BacktestResult) -> BacktestSummaryRow:
    return BacktestSummaryRow(
        model=result.model,
        confidence=result.confidence,
        observations=result.observations,
        expected_exceptions=result.kupiec.expected_exceptions,
        actual_exceptions=result.exceptions,
        exception_rate=result.kupiec.exception_rate,
        average_var=result.average_var,
        mean_exception_severity=result.mean_exception_severity,
        kupiec_lr=result.kupiec.statistic,
        kupiec_p_value=result.kupiec.p_value,
        result=result.kupiec.verdict,
    )


async def _read_csv(upload: UploadFile, field: str) -> pd.DataFrame:
    """Parse an uploaded CSV without ever writing it to disk (PRD 17)."""
    raw = await upload.read()

    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail={
                "code": "FILE_TOO_LARGE",
                "message": (
                    f"{field} is {len(raw) / 1_048_576:.1f} MB; the limit is "
                    f"{MAX_UPLOAD_BYTES / 1_048_576:.0f} MB."
                ),
            },
        )
    if not raw:
        raise HTTPException(
            status_code=400,
            detail={"code": "EMPTY_FILE", "message": f"{field} is empty."},
        )

    try:
        return pd.read_csv(io.BytesIO(raw))
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "UNPARSEABLE_CSV",
                "message": f"{field} could not be parsed as CSV: {exc}",
            },
        ) from exc


def _parse_model(payload: str | None, model: type, field: str):
    if payload is None or not payload.strip():
        return None
    try:
        return model.model_validate(json.loads(payload))
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_JSON", "message": f"{field} is not valid JSON: {exc}"},
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_CONFIG", "message": f"{field} is invalid: {exc}"},
        ) from exc
