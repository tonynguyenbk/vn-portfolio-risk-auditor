"""Build the parity fixture for the browser-side What-if calculations.

Run from the repository root::

    uv run --directory backend python scripts/whatif_parity_fixture.py

Writes ``frontend/tests/fixtures/whatif-parity.json``.

Why this exists
---------------
The What-if page recomputes risk in the browser, because a slider that fires a
request per drag is unusable and the free-tier API may be asleep. That puts a
second implementation of the maths in TypeScript, and a second implementation
is only trustworthy if something checks it against the first.

This script runs the **real engine functions** — the same ones the API calls —
on a small, fixed, hand-built price set and records every figure the page
shows. A Vitest suite then feeds the identical CSV through ``lib/what-if.ts``
and requires agreement to ~1e-9. The dataset is deliberately independent of
the shipped demo files, so replacing those cannot silently change what the
parity test asserts.

The input is adversarial in small ways the engine handles and the port must
too: a ticker missing on some dates (intersection alignment, no forward-fill),
a duplicate ``(date, ticker)`` row with a conflicting price (first one wins),
a non-positive price (dropped) and a benchmark row that is not in the
portfolio.

Equity fraction ``f`` mixes the equity sleeve with cash earning zero. Cash is
mixed in on *simple* returns, ``R_t = f * (exp(r_p,t) - 1)``, because that is
where the mix is linear; VaR and Expected Shortfall are taken on ``R_t``.
Volatility, drawdown and the worst five-day loss use the log of the mixed
growth factor, ``g_t = ln(1 + R_t)``, which equals ``r_p,t`` when ``f = 1``.
"""

from __future__ import annotations

import argparse
import io
import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.services.data_validation import clean_market_frame
from app.services.expected_shortfall import historical_expected_shortfall
from app.services.portfolio_metrics import annualised_volatility, maximum_drawdown
from app.services.returns import (
    align_on_common_dates,
    log_returns,
    pivot_long_prices,
    portfolio_returns,
    wealth_curve,
)
from app.services.risk_contribution import (
    covariance_matrix,
    portfolio_volatility,
    risk_contributions,
)
from app.services.var_models import historical_var

SEED = 20260101
TRADING_DAYS = 260
TICKERS = ("AAA", "BBB", "CCC", "DDD")
BENCHMARK = "BENCH"
WORST_WINDOW_DAYS = 5

CASES: tuple[dict[str, Any], ...] = (
    {"weights": [0.25, 0.25, 0.25, 0.25], "equityFraction": 1.0, "confidence": 0.95},
    {"weights": [0.4, 0.3, 0.2, 0.1], "equityFraction": 0.6, "confidence": 0.95},
    {"weights": [0.1, 0.2, 0.3, 0.4], "equityFraction": 0.35, "confidence": 0.99},
    {"weights": [0.5, 0.0, 0.5, 0.0], "equityFraction": 0.0, "confidence": 0.95},
)
#: Tolerated one-day loss as a fraction of capital, for the f* check.
TOLERANCES = (0.01, 0.02, 1.0)


def build_market_csv(seed: int = SEED) -> str:
    """A small correlated, fat-tailed price set with deliberate defects."""
    rng = np.random.default_rng(seed)
    dates = pd.bdate_range("2024-01-01", periods=TRADING_DAYS)

    market = rng.standard_t(4, TRADING_DAYS) * 0.009
    betas = np.array([0.8, 1.1, 1.3, 0.6])
    idio_scale = np.array([0.008, 0.012, 0.015, 0.01])
    idio = rng.standard_t(5, (TRADING_DAYS, len(TICKERS))) * idio_scale
    asset_r = market[:, None] * betas + idio
    starts = np.array([50.0, 120.0, 25.0, 80.0])
    prices = starts * np.exp(np.cumsum(asset_r, axis=0))
    bench = 1200.0 * np.exp(np.cumsum(market))

    rows: list[dict[str, Any]] = []
    for t, day in enumerate(dates):
        iso = day.date().isoformat()
        for i, ticker in enumerate(TICKERS):
            # CCC does not trade on a handful of days: those dates must be
            # dropped for every asset, not forward-filled.
            if ticker == "CCC" and t in (17, 18, 140):
                continue
            rows.append({"date": iso, "ticker": ticker, "close": round(prices[t, i], 2)})
        rows.append({"date": iso, "ticker": BENCHMARK, "close": round(bench[t], 2)})

    frame = pd.DataFrame(rows)
    frame["sector"] = frame["ticker"].map(
        {"AAA": "Technology", "BBB": "Banking", "CCC": "Real Estate, Construction",
         "DDD": "Consumer", BENCHMARK: "Index"}
    )

    defects = pd.DataFrame(
        [
            # Conflicting duplicate: the engine keeps the first occurrence.
            {"date": dates[60].date().isoformat(), "ticker": "BBB", "close": 1.0,
             "sector": "Banking"},
            # Non-positive price: cannot yield a log return, row is dropped.
            {"date": dates[200].date().isoformat(), "ticker": "DDD", "close": 0.0,
             "sector": "Consumer"},
        ]
    )
    frame = pd.concat([frame, defects], ignore_index=True)
    frame["volume"] = 1000
    frame = frame[["date", "ticker", "close", "volume", "sector"]]
    return frame.to_csv(index=False, lineterminator="\n")


def _mixed(series: pd.Series, fraction: float) -> tuple[np.ndarray, pd.Series]:
    simple = fraction * np.expm1(series.to_numpy())
    growth = pd.Series(np.log1p(simple), index=series.index, name="portfolio")
    return simple, growth


def _worst_window_loss(growth: pd.Series, days: int) -> float | None:
    if len(growth) < days:
        return None
    rolled = growth.rolling(days).sum().dropna()
    return float((1.0 - np.exp(rolled)).max())


def build_payload(seed: int = SEED) -> dict[str, Any]:
    csv_text = build_market_csv(seed)
    raw = pd.read_csv(io.StringIO(csv_text))
    cleaned, _, _ = clean_market_frame(raw)
    aligned = align_on_common_dates(pivot_long_prices(cleaned), list(TICKERS))
    asset_returns = log_returns(aligned)
    covariance = covariance_matrix(asset_returns.to_numpy())

    cases = []
    for case in CASES:
        weights = dict(zip(TICKERS, case["weights"], strict=True))
        fraction = case["equityFraction"]
        confidence = case["confidence"]

        series = portfolio_returns(asset_returns, weights)
        simple, growth = _mixed(series, fraction)
        effective = np.array(case["weights"], dtype=float) * fraction

        sigma = portfolio_volatility(covariance, effective)
        contributions = (
            [
                {
                    "ticker": row.ticker,
                    "weight": row.weight,
                    "contribution": row.contribution,
                    "contributionPct": row.contribution_pct,
                }
                for row in risk_contributions(covariance, effective, list(TICKERS))
            ]
            if sigma > 0
            else None
        )

        cases.append(
            {
                **case,
                "expected": {
                    "var": historical_var(simple, confidence),
                    "expectedShortfall": historical_expected_shortfall(simple, confidence),
                    "annualisedVolatility": annualised_volatility(growth),
                    "maximumDrawdown": maximum_drawdown(wealth_curve(growth)).value,
                    "worstFiveDayLoss": _worst_window_loss(growth, WORST_WINDOW_DAYS),
                    "portfolioVolatilityDaily": sigma,
                    "riskContribution": contributions,
                },
            }
        )

    # f* = largest equity fraction whose ES stays within a tolerated loss.
    base_weights = dict(zip(TICKERS, CASES[1]["weights"], strict=True))
    base_series = portfolio_returns(asset_returns, base_weights)
    es_full = historical_expected_shortfall(_mixed(base_series, 1.0)[0], 0.95)
    max_fraction = []
    for tolerance in TOLERANCES:
        fraction = min(1.0, tolerance / es_full) if es_full > 0 else 1.0
        max_fraction.append(
            {
                "weights": CASES[1]["weights"],
                "confidence": 0.95,
                "tolerancePct": tolerance,
                "expectedFraction": fraction,
                "expectedShortfallAtFraction": historical_expected_shortfall(
                    _mixed(base_series, fraction)[0], 0.95
                ),
            }
        )

    return {
        "generator": "backend/scripts/whatif_parity_fixture.py",
        "seed": seed,
        "tickers": list(TICKERS),
        "benchmark": BENCHMARK,
        "alignedObservations": len(aligned),
        "returnObservations": len(asset_returns),
        "firstDate": pd.Timestamp(aligned.index[0]).date().isoformat(),
        "lastDate": pd.Timestamp(aligned.index[-1]).date().isoformat(),
        "csv": csv_text,
        "cases": cases,
        "maxEquityFraction": max_fraction,
    }


def default_output() -> Path:
    root = Path(__file__).resolve().parents[2]
    return root / "frontend" / "tests" / "fixtures" / "whatif-parity.json"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=default_output())
    args = parser.parse_args()

    payload = build_payload()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
    print(f"Wrote {len(payload['cases'])} parity cases to {args.output}")


if __name__ == "__main__":
    main()
