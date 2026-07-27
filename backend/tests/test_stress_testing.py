"""Stress testing tests (PRD 9.14, 20.1).

PRD 20.1 names two properties explicitly — the weighted shock equals the dot
product, and the contributions sum to the total portfolio shock. Both are here,
along with the historical-replay path.
"""

from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd
import pytest

from app.services.stress_testing import (
    apply_shocks,
    historical_scenario,
    historical_shocks,
    worst_historical_window,
)
from scripts.generate_demo_data import SEED, generate_market_data, generate_portfolio
from tests.conftest import FLOAT_TOL

WEIGHTS = {"AAA": 0.5, "BBB": 0.3, "CCC": 0.2}


@pytest.fixture(scope="module")
def demo_prices() -> pd.DataFrame:
    from app.services.data_validation import clean_market_frame
    from app.services.returns import pivot_long_prices

    cleaned, _, _ = clean_market_frame(generate_market_data(SEED))
    return pivot_long_prices(cleaned)


@pytest.fixture(scope="module")
def demo_weights() -> dict[str, float]:
    portfolio = generate_portfolio()
    return dict(zip(portfolio["ticker"], portfolio["weight"], strict=True))


class TestCustomShocks:
    def test_the_weighted_shock_equals_the_dot_product(self) -> None:
        shocks = {"AAA": -0.10, "BBB": -0.05, "CCC": 0.02}
        result = apply_shocks(WEIGHTS, shocks)

        expected = float(
            np.array([0.5, 0.3, 0.2]) @ np.array([-0.10, -0.05, 0.02])
        )
        assert result.portfolio_impact == pytest.approx(expected, abs=FLOAT_TOL)
        assert result.portfolio_impact == pytest.approx(-0.061, abs=FLOAT_TOL)

    def test_contributions_sum_to_the_total_portfolio_shock(self) -> None:
        shocks = {"AAA": -0.12, "BBB": -0.03, "CCC": -0.20}
        result = apply_shocks(WEIGHTS, shocks)

        total = sum(impact.contribution for impact in result.impacts)
        assert total == pytest.approx(result.portfolio_impact, abs=FLOAT_TOL)

    def test_each_contribution_is_its_own_weight_times_its_own_shock(self) -> None:
        shocks = {"AAA": -0.10, "BBB": -0.05, "CCC": 0.02}
        result = apply_shocks(WEIGHTS, shocks)

        for impact in result.impacts:
            assert impact.contribution == pytest.approx(
                impact.weight * impact.shock, abs=FLOAT_TOL
            )

    def test_an_unshocked_asset_is_treated_as_unmoved(self) -> None:
        result = apply_shocks(WEIGHTS, {"AAA": -0.10})
        assert result.portfolio_impact == pytest.approx(-0.05, abs=FLOAT_TOL)
        assert [i.shock for i in result.impacts if i.ticker == "BBB"] == [0.0]

    def test_a_shock_naming_an_unheld_asset_is_rejected(self) -> None:
        # Far more likely a typo or a mismatched file than an intention;
        # discarding it silently would understate the impact.
        with pytest.raises(KeyError, match="ZZZ"):
            apply_shocks(WEIGHTS, {"ZZZ": -0.10})

    def test_an_empty_portfolio_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="no holdings"):
            apply_shocks({}, {"AAA": -0.1})

    def test_a_zero_shock_vector_produces_no_impact(self) -> None:
        result = apply_shocks(WEIGHTS, {"AAA": 0.0, "BBB": 0.0, "CCC": 0.0})
        assert result.portfolio_impact == pytest.approx(0.0, abs=FLOAT_TOL)
        assert result.loss == 0.0
        assert result.largest_contributor is None


class TestLossAndContributor:
    def test_loss_is_a_positive_magnitude(self) -> None:
        result = apply_shocks(WEIGHTS, {"AAA": -0.10, "BBB": -0.10, "CCC": -0.10})
        assert result.portfolio_impact < 0
        assert result.loss == pytest.approx(0.10, abs=FLOAT_TOL)

    def test_a_favourable_scenario_reports_zero_loss_not_a_negative_one(self) -> None:
        result = apply_shocks(WEIGHTS, {"AAA": 0.05, "BBB": 0.05, "CCC": 0.05})
        assert result.portfolio_impact > 0
        assert result.loss == 0.0

    def test_the_largest_contributor_is_the_most_negative_not_the_largest_weight(
        self,
    ) -> None:
        # AAA carries the biggest weight, but BBB takes the bigger hit.
        result = apply_shocks(WEIGHTS, {"AAA": -0.02, "BBB": -0.30, "CCC": -0.01})
        assert result.largest_contributor == "BBB"

    def test_no_contributor_is_reported_when_nothing_fell(self) -> None:
        result = apply_shocks(WEIGHTS, {"AAA": 0.10, "BBB": 0.05, "CCC": 0.01})
        assert result.largest_contributor is None


class TestLimitStatus:
    def test_a_small_loss_is_within_the_limit(self) -> None:
        result = apply_shocks(WEIGHTS, {"AAA": -0.02}, stress_limit=0.08)
        assert result.limit_status == "within_limit"

    def test_a_loss_past_eighty_percent_of_the_limit_warns(self) -> None:
        # 0.08 * 0.8 = 0.064, so a 7% loss warns without breaching.
        result = apply_shocks(
            WEIGHTS, dict.fromkeys(WEIGHTS, -0.07), stress_limit=0.08
        )
        assert result.loss == pytest.approx(0.07, abs=FLOAT_TOL)
        assert result.limit_status == "warning"

    def test_a_loss_past_the_limit_breaches(self) -> None:
        result = apply_shocks(
            WEIGHTS, dict.fromkeys(WEIGHTS, -0.15), stress_limit=0.08
        )
        assert result.limit_status == "breach"


class TestNotional:
    def test_notional_impact_scales_the_portfolio_return(self) -> None:
        result = apply_shocks(
            WEIGHTS, dict.fromkeys(WEIGHTS, -0.10), notional_value=1_000_000
        )
        assert result.notional_impact == pytest.approx(-100_000.0, abs=1e-6)

    def test_notional_impact_is_none_when_no_notional_is_supplied(self) -> None:
        result = apply_shocks(WEIGHTS, {"AAA": -0.10})
        assert result.notional_impact is None


class TestHistoricalShocks:
    def test_uses_simple_returns_not_log_returns(self) -> None:
        # A halving must read as -50%, not ln(0.5) = -69%, because the figure
        # is applied multiplicatively to weights.
        prices = pd.DataFrame(
            {"AAA": [100.0, 80.0, 50.0]},
            index=pd.to_datetime(["2024-01-01", "2024-01-02", "2024-01-03"]),
        )
        shocks = historical_shocks(prices, date(2024, 1, 1), date(2024, 1, 3))
        assert shocks["AAA"] == pytest.approx(-0.5, abs=FLOAT_TOL)

    def test_measures_first_to_last_ignoring_the_path_between(self) -> None:
        prices = pd.DataFrame(
            {"AAA": [100.0, 300.0, 110.0]},
            index=pd.to_datetime(["2024-01-01", "2024-01-02", "2024-01-03"]),
        )
        shocks = historical_shocks(prices, date(2024, 1, 1), date(2024, 1, 3))
        assert shocks["AAA"] == pytest.approx(0.10, abs=FLOAT_TOL)

    def test_snaps_to_the_trading_days_inside_the_requested_window(
        self, demo_prices: pd.DataFrame
    ) -> None:
        # 2020-01-04 is a Saturday; the scenario must still resolve.
        shocks = historical_shocks(demo_prices, date(2020, 1, 4), date(2020, 2, 4))
        assert len(shocks) == len(demo_prices.columns)
        assert all(np.isfinite(v) for v in shocks.values())

    def test_an_inverted_date_range_is_rejected(self, demo_prices: pd.DataFrame) -> None:
        with pytest.raises(ValueError, match="must not fall after"):
            historical_shocks(demo_prices, date(2021, 6, 1), date(2021, 1, 1))

    def test_a_window_with_too_little_history_is_rejected(
        self, demo_prices: pd.DataFrame
    ) -> None:
        with pytest.raises(ValueError, match="at least two trading days"):
            historical_shocks(demo_prices, date(2019, 1, 5), date(2019, 1, 5))


class TestHistoricalScenario:
    def test_replays_a_real_interval_against_the_current_weights(
        self, demo_prices: pd.DataFrame, demo_weights: dict[str, float]
    ) -> None:
        result = historical_scenario(
            demo_prices, demo_weights, date(2020, 3, 1), date(2020, 4, 30)
        )

        assert result.period_start is not None
        assert result.period_end is not None
        assert result.period_start >= date(2020, 3, 1)
        assert result.period_end <= date(2020, 4, 30)
        assert len(result.impacts) == len(demo_weights)

    def test_contributions_still_sum_to_the_total(
        self, demo_prices: pd.DataFrame, demo_weights: dict[str, float]
    ) -> None:
        result = historical_scenario(
            demo_prices, demo_weights, date(2021, 1, 1), date(2021, 3, 31)
        )
        total = sum(impact.contribution for impact in result.impacts)
        assert total == pytest.approx(result.portfolio_impact, abs=1e-12)

    def test_only_held_assets_are_shocked_even_when_prices_carry_more(
        self, demo_prices: pd.DataFrame, demo_weights: dict[str, float]
    ) -> None:
        # The price frame includes VNINDEX; the portfolio does not hold it.
        assert "VNINDEX" in demo_prices.columns
        result = historical_scenario(
            demo_prices, demo_weights, date(2022, 1, 1), date(2022, 6, 30)
        )
        assert {i.ticker for i in result.impacts} == set(demo_weights)

    def test_an_unpriced_holding_is_rejected(self, demo_prices: pd.DataFrame) -> None:
        with pytest.raises(KeyError, match="NOPE"):
            historical_scenario(
                demo_prices, {"NOPE": 1.0}, date(2021, 1, 1), date(2021, 3, 1)
            )


class TestWorstHistoricalWindow:
    def test_finds_a_window_at_least_as_bad_as_any_other(
        self, demo_prices: pd.DataFrame, demo_weights: dict[str, float]
    ) -> None:
        start, end = worst_historical_window(demo_prices, demo_weights, window_days=20)
        worst = historical_scenario(demo_prices, demo_weights, start, end)

        # Sample other windows; none may be worse than the one reported.
        for offset in (100, 400, 900, 1500):
            probe_start = pd.Timestamp(demo_prices.index[offset]).date()
            probe_end = pd.Timestamp(demo_prices.index[offset + 20]).date()
            probe = historical_scenario(demo_prices, demo_weights, probe_start, probe_end)
            assert worst.portfolio_impact <= probe.portfolio_impact + 1e-12

    def test_the_window_spans_the_requested_number_of_trading_days(
        self, demo_prices: pd.DataFrame, demo_weights: dict[str, float]
    ) -> None:
        start, end = worst_historical_window(demo_prices, demo_weights, window_days=20)
        span = demo_prices.loc[
            (demo_prices.index >= pd.Timestamp(start))
            & (demo_prices.index <= pd.Timestamp(end))
        ]
        assert len(span) == 21  # inclusive of both endpoints

    def test_a_degenerate_window_is_rejected(
        self, demo_prices: pd.DataFrame, demo_weights: dict[str, float]
    ) -> None:
        with pytest.raises(ValueError, match="at least two"):
            worst_historical_window(demo_prices, demo_weights, window_days=1)
