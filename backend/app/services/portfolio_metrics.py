"""Portfolio-level risk metrics (PRD 9.2 and 9.3).

Every function returns plain Python floats rather than NumPy scalars, because
PRD 16.4 forbids leaking NumPy types into API responses — they do not serialise
cleanly and force the frontend to guess at the runtime type.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import numpy as np
import pandas as pd

from app.services.returns import drawdown_curve

TRADING_DAYS_PER_YEAR = 252


def annualised_volatility(
    returns: pd.Series,
    trading_days_per_year: int = TRADING_DAYS_PER_YEAR,
) -> float:
    """``sigma_annual = sigma_daily * sqrt(252)`` (PRD 9.2).

    Uses the **sample** standard deviation (``n - 1`` denominator), the standard
    choice when the observations are a sample rather than the whole population.
    """
    if len(returns) < 2:
        raise ValueError("at least two observations are required to estimate volatility")

    daily = float(returns.std(ddof=1))
    return daily * float(np.sqrt(trading_days_per_year))


@dataclass(frozen=True)
class MaximumDrawdown:
    """Deepest peak-to-trough decline, with the dates that produced it.

    ``value`` is negative or zero; ``-0.183`` means an 18.3% decline.
    """

    value: float
    peak_date: date
    trough_date: date


def maximum_drawdown(wealth: pd.Series) -> MaximumDrawdown:
    """Largest decline from a prior peak, and where it happened (PRD 9.3).

    The reported peak is the running maximum *in force at the trough*, not the
    global maximum of the series — those differ whenever the worst drawdown is
    not the one that starts at the all-time high.
    """
    if wealth.empty:
        raise ValueError("cannot compute drawdown from an empty wealth curve")

    drawdowns = drawdown_curve(wealth)
    trough_position = int(np.argmin(drawdowns.to_numpy()))
    trough_date = drawdowns.index[trough_position]
    worst = float(drawdowns.iloc[trough_position])

    # The peak in force at the trough is the last date at or before it whose
    # value equals the running maximum there.
    running_peak_value = float(wealth.iloc[: trough_position + 1].max())
    peak_slice = wealth.iloc[: trough_position + 1]
    peak_date = peak_slice[peak_slice == running_peak_value].index[-1]

    return MaximumDrawdown(
        value=worst,
        peak_date=_as_date(peak_date),
        trough_date=_as_date(trough_date),
    )


def herfindahl_hirschman_index(weights: pd.Series | np.ndarray | list[float]) -> float:
    """``HHI = sum_i w_i^2`` (PRD 9.9).

    Ranges from ``1/n`` for an equally weighted portfolio to ``1`` when a single
    holding accounts for everything. No qualitative label is attached: PRD 9.9
    requires concentration to be judged against user-defined limits instead.
    """
    array = np.asarray(weights, dtype=float)
    return float(np.sum(array**2))


def sector_weights(weights: pd.Series, sectors: pd.Series) -> pd.Series:
    """Sum portfolio weights within each sector, largest first (PRD 9.9)."""
    grouped = weights.groupby(sectors).sum()
    return grouped.sort_values(ascending=False)


def _as_date(value: object) -> date:
    """Normalise a pandas index label to a plain ``datetime.date``."""
    return pd.Timestamp(value).date()  # type: ignore[arg-type]
