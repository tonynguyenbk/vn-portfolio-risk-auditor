"""Portfolio metric tests (PRD 20.1)."""

from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd
import pytest

from app.services.portfolio_metrics import (
    TRADING_DAYS_PER_YEAR,
    annualised_volatility,
    herfindahl_hirschman_index,
    maximum_drawdown,
    sector_weights,
)
from tests.conftest import FLOAT_TOL


class TestAnnualisedVolatility:
    def test_constant_returns_produce_zero_volatility(self) -> None:
        returns = pd.Series([0.01] * 30, index=pd.bdate_range("2024-01-01", periods=30))
        assert annualised_volatility(returns) == pytest.approx(0.0, abs=FLOAT_TOL)

    def test_annualisation_uses_the_square_root_of_252(self) -> None:
        rng = np.random.default_rng(7)
        returns = pd.Series(
            rng.standard_normal(500) * 0.01,
            index=pd.bdate_range("2020-01-01", periods=500),
        )
        daily = float(returns.std(ddof=1))
        expected = daily * np.sqrt(TRADING_DAYS_PER_YEAR)
        assert annualised_volatility(returns) == pytest.approx(expected, rel=1e-12)

    def test_scaling_returns_scales_volatility_proportionally(self) -> None:
        rng = np.random.default_rng(11)
        returns = pd.Series(
            rng.standard_normal(200) * 0.01,
            index=pd.bdate_range("2020-01-01", periods=200),
        )
        assert annualised_volatility(returns * 3) == pytest.approx(
            annualised_volatility(returns) * 3, rel=1e-12
        )

    def test_a_single_observation_is_rejected(self) -> None:
        returns = pd.Series([0.01], index=pd.bdate_range("2024-01-01", periods=1))
        with pytest.raises(ValueError, match="at least two"):
            annualised_volatility(returns)


class TestMaximumDrawdown:
    def test_monotonically_increasing_wealth_has_no_drawdown(self) -> None:
        wealth = pd.Series(
            [100.0, 105.0, 110.0], index=pd.bdate_range("2024-01-01", periods=3)
        )
        assert maximum_drawdown(wealth).value == pytest.approx(0.0, abs=FLOAT_TOL)

    def test_known_peak_trough_sequence_and_its_dates(self) -> None:
        index = pd.to_datetime(
            ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"]
        )
        wealth = pd.Series([100.0, 125.0, 80.0, 90.0, 130.0], index=index)

        result = maximum_drawdown(wealth)

        assert result.value == pytest.approx(80.0 / 125.0 - 1.0, abs=FLOAT_TOL)
        assert result.peak_date == date(2024, 1, 2)
        assert result.trough_date == date(2024, 1, 3)

    def test_reports_the_peak_in_force_at_the_trough_not_the_global_maximum(self) -> None:
        # The deepest drawdown runs 120 -> 90 (-25%), and happens before the
        # series reaches its global maximum of 200.
        index = pd.to_datetime(
            ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"]
        )
        wealth = pd.Series([100.0, 120.0, 90.0, 150.0, 200.0], index=index)

        result = maximum_drawdown(wealth)

        assert result.value == pytest.approx(-0.25, abs=FLOAT_TOL)
        assert result.peak_date == date(2024, 1, 2)
        assert result.trough_date == date(2024, 1, 3)

    def test_returns_a_plain_python_float_not_a_numpy_scalar(self) -> None:
        # PRD 16.4 forbids leaking NumPy types into API responses.
        wealth = pd.Series([100.0, 80.0], index=pd.bdate_range("2024-01-01", periods=2))
        assert type(maximum_drawdown(wealth).value) is float

    def test_empty_series_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="empty"):
            maximum_drawdown(pd.Series(dtype=float))


class TestConcentration:
    def test_equal_weights_give_the_minimum_hhi(self) -> None:
        # For n equally weighted assets, HHI = 1/n.
        assert herfindahl_hirschman_index([0.25] * 4) == pytest.approx(0.25, abs=FLOAT_TOL)

    def test_a_single_holding_gives_an_hhi_of_one(self) -> None:
        assert herfindahl_hirschman_index([1.0]) == pytest.approx(1.0, abs=FLOAT_TOL)

    def test_concentrated_portfolio_scores_higher_than_diversified(self) -> None:
        concentrated = herfindahl_hirschman_index([0.7, 0.1, 0.1, 0.1])
        diversified = herfindahl_hirschman_index([0.25, 0.25, 0.25, 0.25])
        assert concentrated > diversified

    def test_sector_weights_sum_within_each_sector(self) -> None:
        weights = pd.Series([0.25, 0.25, 0.30, 0.20], index=["A", "B", "C", "D"])
        sectors = pd.Series(
            ["Banking", "Banking", "Technology", "Retail"], index=["A", "B", "C", "D"]
        )

        result = sector_weights(weights, sectors)

        assert result["Banking"] == pytest.approx(0.50, abs=FLOAT_TOL)
        assert result.sum() == pytest.approx(1.0, abs=FLOAT_TOL)
        # Sorted largest first, so the leading entry is the concentration to report.
        assert result.index[0] == "Banking"
