"""Return construction tests (PRD 20.1)."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.services.returns import (
    align_on_common_dates,
    drawdown_curve,
    log_returns,
    pivot_long_prices,
    portfolio_returns,
    wealth_curve,
)
from tests.conftest import FLOAT_TOL, SERIES_TOL


class TestLogReturns:
    def test_constant_prices_produce_zero_returns(self, flat_prices: pd.DataFrame) -> None:
        result = log_returns(flat_prices)
        assert np.allclose(result.to_numpy(), 0.0, atol=FLOAT_TOL)

    def test_known_sequence_produces_known_log_returns(
        self, doubling_prices: pd.DataFrame
    ) -> None:
        result = log_returns(doubling_prices)
        assert np.allclose(result["AAA"].to_numpy(), np.log(2.0), atol=FLOAT_TOL)

    def test_drops_exactly_one_observation(self, flat_prices: pd.DataFrame) -> None:
        assert len(log_returns(flat_prices)) == len(flat_prices) - 1

    def test_dates_remain_sorted(self, doubling_prices: pd.DataFrame) -> None:
        shuffled = doubling_prices.sample(frac=1.0, random_state=0)
        result = log_returns(shuffled.sort_index())
        assert result.index.is_monotonic_increasing

    def test_non_positive_price_is_rejected(self, flat_prices: pd.DataFrame) -> None:
        broken = flat_prices.copy()
        broken.iloc[3, 0] = 0.0
        with pytest.raises(ValueError, match="strictly positive"):
            log_returns(broken)

    def test_empty_frame_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="empty"):
            log_returns(pd.DataFrame())


class TestPivotAndAlign:
    def test_pivot_produces_one_column_per_ticker(
        self, long_market_frame: pd.DataFrame
    ) -> None:
        wide = pivot_long_prices(long_market_frame)
        assert sorted(wide.columns) == ["AAA", "BBB"]
        assert len(wide) == 2

    def test_duplicate_date_ticker_pairs_are_rejected(
        self, long_market_frame: pd.DataFrame
    ) -> None:
        duplicated = pd.concat([long_market_frame, long_market_frame.iloc[[0]]])
        with pytest.raises(ValueError, match="duplicate"):
            pivot_long_prices(duplicated)

    def test_alignment_drops_dates_where_an_asset_did_not_trade(self) -> None:
        wide = pd.DataFrame(
            {"AAA": [1.0, 2.0, 3.0], "BBB": [1.0, np.nan, 3.0]},
            index=pd.bdate_range("2024-01-01", periods=3),
        )
        aligned = align_on_common_dates(wide, ["AAA", "BBB"])
        # The middle date is dropped rather than forward-filled (PRD 8.5).
        assert len(aligned) == 2

    def test_unknown_ticker_is_rejected(self, long_market_frame: pd.DataFrame) -> None:
        wide = pivot_long_prices(long_market_frame)
        with pytest.raises(KeyError, match="CCC"):
            align_on_common_dates(wide, ["AAA", "CCC"])


class TestPortfolioReturns:
    def test_single_asset_portfolio_equals_the_asset_return(
        self, doubling_prices: pd.DataFrame
    ) -> None:
        returns = log_returns(doubling_prices)
        result = portfolio_returns(returns, {"AAA": 1.0})
        assert np.allclose(result.to_numpy(), returns["AAA"].to_numpy(), atol=FLOAT_TOL)

    def test_equal_weights_match_the_arithmetic_weighted_sum(self) -> None:
        returns = pd.DataFrame(
            {"AAA": [0.01, -0.02, 0.03], "BBB": [0.02, 0.01, -0.01]},
            index=pd.bdate_range("2024-01-01", periods=3),
        )
        result = portfolio_returns(returns, {"AAA": 0.5, "BBB": 0.5})
        expected = (returns["AAA"] + returns["BBB"]) / 2
        assert np.allclose(result.to_numpy(), expected.to_numpy(), atol=FLOAT_TOL)

    def test_weight_order_does_not_change_the_result(self) -> None:
        returns = pd.DataFrame(
            {"AAA": [0.01, -0.02], "BBB": [0.02, 0.01]},
            index=pd.bdate_range("2024-01-01", periods=2),
        )
        forward = portfolio_returns(returns, {"AAA": 0.7, "BBB": 0.3})
        reverse = portfolio_returns(returns, {"BBB": 0.3, "AAA": 0.7})
        assert np.allclose(forward.to_numpy(), reverse.to_numpy(), atol=FLOAT_TOL)

    def test_missing_ticker_is_rejected(self) -> None:
        returns = pd.DataFrame({"AAA": [0.01]}, index=pd.bdate_range("2024-01-01", periods=1))
        with pytest.raises(KeyError, match="BBB"):
            portfolio_returns(returns, {"AAA": 0.5, "BBB": 0.5})


class TestWealthCurve:
    def test_starts_at_the_base_value(self) -> None:
        returns = pd.Series([0.01, 0.02], index=pd.bdate_range("2024-01-02", periods=2))
        curve = wealth_curve(returns)
        assert curve.iloc[0] == pytest.approx(100.0, abs=FLOAT_TOL)

    def test_zero_returns_leave_wealth_unchanged(self) -> None:
        returns = pd.Series([0.0] * 5, index=pd.bdate_range("2024-01-02", periods=5))
        curve = wealth_curve(returns)
        assert np.allclose(curve.to_numpy(), 100.0, atol=FLOAT_TOL)

    def test_matches_the_step_by_step_recursion(self) -> None:
        rng = np.random.default_rng(0)
        returns = pd.Series(
            rng.standard_normal(50) * 0.01,
            index=pd.bdate_range("2024-01-02", periods=50),
        )
        curve = wealth_curve(returns)

        # W_t = W_{t-1} * exp(r_t), computed the slow way.
        expected = 100.0
        for r in returns:
            expected *= float(np.exp(r))

        assert curve.iloc[-1] == pytest.approx(expected, rel=SERIES_TOL)


class TestDrawdownCurve:
    def test_monotonically_increasing_wealth_has_zero_drawdown(self) -> None:
        wealth = pd.Series(
            [100.0, 101.0, 105.0, 110.0], index=pd.bdate_range("2024-01-01", periods=4)
        )
        assert np.allclose(drawdown_curve(wealth).to_numpy(), 0.0, atol=FLOAT_TOL)

    def test_drawdown_is_never_positive(self) -> None:
        wealth = pd.Series(
            [100.0, 90.0, 120.0, 60.0], index=pd.bdate_range("2024-01-01", periods=4)
        )
        assert bool((drawdown_curve(wealth) <= FLOAT_TOL).all())

    def test_known_peak_trough_sequence(self) -> None:
        # Peak 120, trough 60 -> 60/120 - 1 = -0.5
        wealth = pd.Series(
            [100.0, 120.0, 60.0, 90.0], index=pd.bdate_range("2024-01-01", periods=4)
        )
        assert drawdown_curve(wealth).min() == pytest.approx(-0.5, abs=FLOAT_TOL)
