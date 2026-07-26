"""Shared fixtures and numerical tolerances.

PRD 20.4 requires tolerances to be documented rather than left to whatever
``assert a == b`` happens to do with floats. The constants below are the ones
every test in this suite uses.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

#: Tolerance for values that pass through a handful of float operations.
FLOAT_TOL = 1e-12
#: Looser tolerance for values accumulated over a long series, where rounding
#: compounds across thousands of additions.
SERIES_TOL = 1e-9


@pytest.fixture
def trading_dates() -> pd.DatetimeIndex:
    """Ten consecutive weekdays."""
    return pd.bdate_range("2024-01-01", periods=10)


@pytest.fixture
def flat_prices(trading_dates: pd.DatetimeIndex) -> pd.DataFrame:
    """Two assets whose prices never move."""
    return pd.DataFrame(
        {"AAA": np.full(len(trading_dates), 100.0), "BBB": np.full(len(trading_dates), 50.0)},
        index=trading_dates,
    )


@pytest.fixture
def doubling_prices(trading_dates: pd.DatetimeIndex) -> pd.DataFrame:
    """One asset that doubles every day, giving a known log return of ln(2)."""
    values = 10.0 * np.power(2.0, np.arange(len(trading_dates), dtype=float))
    return pd.DataFrame({"AAA": values}, index=trading_dates)


@pytest.fixture
def long_market_frame() -> pd.DataFrame:
    """Minimal well-formed long-form market data."""
    return pd.DataFrame(
        {
            "date": ["2024-01-01", "2024-01-01", "2024-01-02", "2024-01-02"],
            "ticker": ["AAA", "BBB", "AAA", "BBB"],
            "close": [100.0, 50.0, 101.0, 49.5],
            "sector": ["Technology", "Banking", "Technology", "Banking"],
        }
    )


@pytest.fixture
def valid_portfolio() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "ticker": ["AAA", "BBB"],
            "weight": [0.6, 0.4],
            "sector": ["Technology", "Banking"],
        }
    )
