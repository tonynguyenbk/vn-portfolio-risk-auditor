"""Precompute the demonstration analysis as static JSON.

Run from the repository root::

    uv run --directory backend python scripts/precompute_demo_analysis.py

Writes ``analysis.json`` and ``backtest.json`` into ``frontend/public/demo/``.

Why this exists
---------------
The deployed frontend reads these files instead of calling the API. That makes
the demonstration path — which is what almost every visitor sees — completely
independent of whether the Python service is awake, which matters because free
hosting tiers put idle services to sleep and a cold start can take the better
part of a minute. The live API is then only needed for user uploads, where a
short wait is acceptable and can be shown honestly in the UI.

This is *not* a way of hard-coding results. The numbers here are produced by
the same engine the API runs, on the same generated dataset, and regenerating
is a single command. The one rule that keeps it honest: this script must be
re-run whenever the engine or the dataset changes, or the dashboard will show
figures the current code no longer produces. CI runs it and fails if the output
would differ.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from app.schemas.analysis import (
    AnalysisConfig,
    Assumptions,
    BacktestPoint,
    BacktestResponse,
    BacktestSummaryRow,
    RiskLimits,
)
from app.services.analysis import run_analysis
from app.services.backtesting import compare_models, walk_forward_backtest
from app.services.portfolio_metrics import TRADING_DAYS_PER_YEAR
from app.services.var_models import QUANTILE_METHOD_DESCRIPTION
from scripts.generate_demo_data import SEED, generate_market_data, generate_portfolio

DATASET_NAME = "Simulated demonstration portfolio"

#: Curve points are display data; six decimals is far finer than a pixel.
#: Scalar metrics keep full precision.
CURVE_PRECISION = 6


def _round_curve(points: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for point in points:
        point["value"] = round(point["value"], CURVE_PRECISION)
    return points


def main() -> None:
    default_output = Path(__file__).resolve().parents[2] / "frontend" / "public" / "demo"

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=default_output)
    args = parser.parse_args()

    output_dir: Path = args.output
    output_dir.mkdir(parents=True, exist_ok=True)

    market = generate_market_data(SEED)
    portfolio = generate_portfolio()
    config = AnalysisConfig()
    limits = RiskLimits()

    bundle = run_analysis(
        market,
        portfolio,
        config,
        limits,
        dataset_name=DATASET_NAME,
        is_simulated=True,
    )

    analysis_payload = bundle.result.model_dump(by_alias=True, mode="json")
    for key in ("wealthCurve", "drawdownCurve", "benchmarkCurve"):
        curve = analysis_payload["portfolio"].get(key)
        if curve:
            _round_curve(curve)

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

    backtest = BacktestResponse(
        series=[
            BacktestPoint(
                date=point.date,
                loss=round(point.loss, CURVE_PRECISION),
                var_threshold=round(point.var_threshold, CURVE_PRECISION),
                is_exception=point.is_exception,
            )
            for point in primary.series
        ],
        summary=[
            BacktestSummaryRow(
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
            for result in results
        ],
        assumptions=Assumptions(
            rolling_window=config.rolling_window,
            forecast_horizon_days=config.forecast_horizon_days,
            ewma_lambda=config.ewma_lambda,
            trading_days_per_year=TRADING_DAYS_PER_YEAR,
            quantile_method=QUANTILE_METHOD_DESCRIPTION,
            price_basis="close",
        ),
    )

    _write(output_dir / "analysis.json", analysis_payload)
    _write(output_dir / "backtest.json", backtest.model_dump(by_alias=True, mode="json"))

    print(f"analysis.json  {len(analysis_payload['portfolio']['wealthCurve']):,} curve points")
    print(f"backtest.json  {len(backtest.series):,} test days, {len(backtest.summary)} rows")
    for row in backtest.summary:
        print(
            f"  {row.model.value:<18} {row.confidence:.0%}  "
            f"exceptions {row.actual_exceptions:>4} / {row.expected_exceptions:>6.1f}  "
            f"rate {row.exception_rate:.4f}  p={row.kupiec_p_value:.4f}  {row.result}"
        )


def _write(path: Path, payload: object) -> None:
    # newline="\n" keeps the file byte-identical across platforms, matching the
    # LF policy in .gitattributes.
    path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )


if __name__ == "__main__":
    main()
