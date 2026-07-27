"""Stress testing (PRD 9.14).

Scenario analysis, **not** probability forecasting. Every function here answers
a conditional question — if these shocks occurred, what would their approximate
effect on this portfolio be — and attaches no likelihood to the scenario. PRD
7.5 draws that line and the wording of every message below keeps to it.

Two scenario types:

* **Custom** — the caller supplies a shock per asset. The portfolio impact is
  the weighted sum, ``Delta = w' s``.
* **Historical** — shocks are *derived* from what the assets actually did over
  a user-selected date range, so the scenario is a real episode replayed
  against the current weights rather than an invented one.

The linearity is the method's main limitation and is stated in the response:
weights are assumed fixed through the event, no liquidity or transaction costs
are modelled, and no second-round effects such as correlations rising mid-crisis
are captured. Real stress episodes tend to be worse than a weighted sum implies.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class AssetImpact:
    """One asset's share of the scenario outcome."""

    ticker: str
    weight: float
    #: Return shock applied to this asset, e.g. -0.09 for a 9% fall.
    shock: float
    #: ``weight * shock`` — this asset's contribution to the portfolio impact.
    contribution: float


@dataclass(frozen=True)
class StressResult:
    scenario_name: str
    #: Total portfolio return under the scenario. Negative for a loss.
    portfolio_impact: float
    #: Positive loss magnitude, or 0.0 when the scenario is not a loss.
    loss: float
    impacts: list[AssetImpact]
    #: The asset contributing the most negative amount, or None if nothing fell.
    largest_contributor: str | None
    #: Simulated notional loss. None unless a notional value was supplied.
    notional_impact: float | None
    #: One of "within_limit", "warning", "breach".
    limit_status: str
    #: Start and end of the replayed period. None for custom scenarios.
    period_start: date | None = None
    period_end: date | None = None


#: Fraction of the stress limit above which a scenario is flagged as a warning.
WARNING_THRESHOLD = 0.8


def apply_shocks(
    weights: Mapping[str, float],
    shocks: Mapping[str, float],
    scenario_name: str = "Custom adverse scenario",
    stress_limit: float = 0.08,
    notional_value: float | None = None,
    period_start: date | None = None,
    period_end: date | None = None,
) -> StressResult:
    """Apply a shock vector to the portfolio weights.

    ``Delta = sum_i w_i * s_i`` (PRD 9.14).

    Assets present in ``weights`` but absent from ``shocks`` are treated as
    unshocked, which is the sensible reading of "this scenario only names the
    assets it moves". Shocks naming an asset the portfolio does not hold raise,
    because that is far more likely to be a typo or a mismatched file than an
    intention, and silently discarding it would understate the impact.
    """
    if not weights:
        raise ValueError("the portfolio has no holdings to stress")

    unknown = sorted(set(shocks) - set(weights))
    if unknown:
        raise KeyError(f"shocks name assets the portfolio does not hold: {unknown}")

    impacts = [
        AssetImpact(
            ticker=ticker,
            weight=float(weight),
            shock=float(shocks.get(ticker, 0.0)),
            contribution=float(weight) * float(shocks.get(ticker, 0.0)),
        )
        for ticker, weight in weights.items()
    ]

    portfolio_impact = float(sum(impact.contribution for impact in impacts))
    loss = abs(min(0.0, portfolio_impact))

    negative = [impact for impact in impacts if impact.contribution < 0]
    largest = min(negative, key=lambda i: i.contribution).ticker if negative else None

    if loss > stress_limit:
        limit_status = "breach"
    elif loss > stress_limit * WARNING_THRESHOLD:
        limit_status = "warning"
    else:
        limit_status = "within_limit"

    return StressResult(
        scenario_name=scenario_name,
        portfolio_impact=portfolio_impact,
        loss=loss,
        impacts=impacts,
        largest_contributor=largest,
        notional_impact=(
            notional_value * portfolio_impact if notional_value is not None else None
        ),
        limit_status=limit_status,
        period_start=period_start,
        period_end=period_end,
    )


def historical_shocks(
    prices: pd.DataFrame,
    start: date,
    end: date,
) -> dict[str, float]:
    """Cumulative simple return of each asset over ``[start, end]`` (PRD 9.14).

    Uses the **simple** return ``P_end / P_start - 1`` rather than a log return,
    because the result is applied multiplicatively to portfolio weights: a 50%
    fall must read as ``-0.50``, not ``ln(0.5) = -0.69``. This is the one place
    in the codebase that does not work in log space, and the reason is that the
    quantity is a realised price change, not an input to a variance estimate.

    The window is inclusive at both ends and snaps to the nearest available
    trading days inside it, so a start date falling on a weekend or holiday does
    not silently produce an empty scenario.
    """
    if start > end:
        raise ValueError("the scenario start date must not fall after its end date")

    window = prices.loc[
        (prices.index >= pd.Timestamp(start)) & (prices.index <= pd.Timestamp(end))
    ]
    if len(window) < 2:
        raise ValueError(
            f"no usable price history between {start} and {end}; at least two "
            "trading days are required to measure a scenario"
        )

    first = window.iloc[0]
    last = window.iloc[-1]

    if bool((first <= 0).any()):
        raise ValueError("scenario start prices must be strictly positive")

    return {str(ticker): float(last[ticker] / first[ticker] - 1.0) for ticker in window.columns}


def historical_scenario(
    prices: pd.DataFrame,
    weights: Mapping[str, float],
    start: date,
    end: date,
    scenario_name: str | None = None,
    stress_limit: float = 0.08,
    notional_value: float | None = None,
) -> StressResult:
    """Replay a historical interval against the current weights."""
    held = [ticker for ticker in weights]
    missing = [ticker for ticker in held if ticker not in prices.columns]
    if missing:
        raise KeyError(f"tickers absent from the price data: {sorted(missing)}")

    all_shocks = historical_shocks(prices.loc[:, held], start, end)

    window = prices.loc[
        (prices.index >= pd.Timestamp(start)) & (prices.index <= pd.Timestamp(end))
    ]
    actual_start = pd.Timestamp(window.index[0]).date()
    actual_end = pd.Timestamp(window.index[-1]).date()

    return apply_shocks(
        weights=weights,
        shocks={ticker: all_shocks[ticker] for ticker in held},
        scenario_name=scenario_name or f"Historical replay {actual_start} to {actual_end}",
        stress_limit=stress_limit,
        notional_value=notional_value,
        period_start=actual_start,
        period_end=actual_end,
    )


def worst_historical_window(
    prices: pd.DataFrame,
    weights: Mapping[str, float],
    window_days: int = 20,
) -> tuple[date, date]:
    """Locate the trading window in which the portfolio fell furthest.

    Used to offer a scenario drawn from the data itself rather than an invented
    one. This is *descriptive* — it reports where the worst stretch was, and
    implies nothing about where the next one will be.
    """
    if window_days < 2:
        raise ValueError("a scenario window needs at least two trading days")
    if len(prices) <= window_days:
        raise ValueError(
            f"{len(prices)} observations cannot contain a {window_days}-day window"
        )

    held = list(weights)
    weight_vector = np.array([weights[t] for t in held], dtype=float)
    values = prices.loc[:, held].to_numpy(dtype=float)

    # Simple return of each asset across every window, weighted into a
    # portfolio impact; then take the worst.
    start_prices = values[:-window_days]
    end_prices = values[window_days:]
    impacts = ((end_prices / start_prices) - 1.0) @ weight_vector

    worst = int(np.argmin(impacts))
    return (
        pd.Timestamp(prices.index[worst]).date(),
        pd.Timestamp(prices.index[worst + window_days]).date(),
    )
