"""Price alignment and return construction (PRD 9.1).

Conventions fixed here and relied on by every downstream module:

* Returns are **logarithmic**: ``r_t = ln(P_t / P_{t-1})``.
* The portfolio return under fixed weights is the weighted sum of asset log
  returns, ``r_p,t = sum_i w_i r_i,t``. This is an approximation — the log
  return of a weighted sum is not the weighted sum of log returns — and PRD 9.1
  requires the simplification to be documented rather than hidden.
* Missing observations are **dropped, never forward-filled** (PRD 8.5).
  Fabricating a price implies a trade that did not happen and biases volatility
  downward.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

import numpy as np
import pandas as pd

WEALTH_BASE = 100.0


def pivot_long_prices(frame: pd.DataFrame, price_column: str = "close") -> pd.DataFrame:
    """Reshape long-form ``date, ticker, close`` rows into a wide price table.

    Returns a frame indexed by date with one column per ticker, sorted
    chronologically. Duplicate ``(date, ticker)`` pairs raise, because silently
    picking one of two conflicting prices would corrupt every downstream figure.
    """
    duplicates = frame.duplicated(subset=["date", "ticker"]).sum()
    if duplicates:
        raise ValueError(
            f"{duplicates} duplicate (date, ticker) pair(s) present; "
            "resolve them before pivoting"
        )

    wide = frame.pivot(index="date", columns="ticker", values=price_column)
    return wide.sort_index()


def align_on_common_dates(prices: pd.DataFrame, tickers: Sequence[str]) -> pd.DataFrame:
    """Restrict to ``tickers`` and to dates on which all of them traded.

    PRD 8.5 requires alignment on the intersection of trading dates with no
    forward-filling, so rows where any selected ticker is missing are dropped.
    """
    missing = [t for t in tickers if t not in prices.columns]
    if missing:
        raise KeyError(f"tickers absent from the price data: {sorted(missing)}")

    return prices.loc[:, list(tickers)].dropna(how="any")


def log_returns(prices: pd.DataFrame) -> pd.DataFrame:
    """``r_{i,t} = ln(P_{i,t} / P_{i,t-1})``.

    The first row carries no return and is dropped, so the result has one fewer
    observation than the price history.
    """
    if prices.empty:
        raise ValueError("cannot compute returns from an empty price frame")
    if bool((prices <= 0).to_numpy().any()):
        raise ValueError("prices must be strictly positive to take logarithms")

    return np.log(prices / prices.shift(1)).iloc[1:]


def portfolio_returns(
    asset_returns: pd.DataFrame,
    weights: Mapping[str, float],
) -> pd.Series:
    """Aggregate asset returns into a portfolio series under fixed weights."""
    missing = [t for t in weights if t not in asset_returns.columns]
    if missing:
        raise KeyError(f"weighted tickers absent from the return data: {sorted(missing)}")

    tickers = list(weights)
    weight_vector = np.array([weights[t] for t in tickers], dtype=float)
    aligned = asset_returns.loc[:, tickers]

    return pd.Series(
        aligned.to_numpy() @ weight_vector,
        index=aligned.index,
        name="portfolio",
    )


def wealth_curve(returns: pd.Series, base: float = WEALTH_BASE) -> pd.Series:
    """Normalised wealth index, ``W_t = W_{t-1} * exp(r_t)`` with ``W_0 = base``.

    Implemented as ``base * exp(cumsum(r))``, which is the closed form of that
    recursion and avoids accumulating rounding error step by step.

    The series is one observation longer than ``returns``: a starting point of
    exactly ``base`` is prepended so the curve visibly begins at 100. Its date
    is inferred as one day before the first return, which is a labelling
    convenience — the first *return* still belongs to the date it is indexed by.
    """
    if returns.empty:
        raise ValueError("cannot build a wealth curve from an empty return series")

    values = base * np.exp(returns.cumsum())
    start_index = returns.index[0] - pd.Timedelta(days=1)
    start = pd.Series([base], index=[start_index], name=returns.name)

    return pd.concat([start, values])


def drawdown_curve(wealth: pd.Series) -> pd.Series:
    """``D_t = W_t / max_{s<=t} W_s - 1`` (PRD 9.3). Zero or negative throughout."""
    if wealth.empty:
        raise ValueError("cannot compute drawdown from an empty wealth curve")

    running_peak = wealth.cummax()
    return wealth / running_peak - 1.0
