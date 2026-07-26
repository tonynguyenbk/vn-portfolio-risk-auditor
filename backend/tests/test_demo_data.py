"""Demonstration dataset tests (PRD 8.6, 20.1).

The demo data underpins every screenshot and every figure a reviewer will see,
so its reproducibility is a property worth testing rather than assuming.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.services.data_validation import (
    ValidationReport,
    clean_market_frame,
    validate_portfolio,
)
from app.services.returns import (
    align_on_common_dates,
    log_returns,
    pivot_long_prices,
    portfolio_returns,
)
from scripts.generate_demo_data import (
    DEMO_ASSETS,
    SEED,
    generate_market_data,
    generate_portfolio,
)
from tests.conftest import FLOAT_TOL


@pytest.fixture(scope="module")
def market() -> pd.DataFrame:
    return generate_market_data(SEED)


class TestDeterminism:
    def test_the_same_seed_reproduces_the_dataset_exactly(self) -> None:
        first = generate_market_data(SEED)
        second = generate_market_data(SEED)
        pd.testing.assert_frame_equal(first, second)

    def test_a_different_seed_produces_different_prices(self, market: pd.DataFrame) -> None:
        other = generate_market_data(SEED + 1)
        assert not market["close"].equals(other["close"])


class TestShape:
    def test_contains_the_five_assets_plus_the_benchmark(self, market: pd.DataFrame) -> None:
        tickers = set(market["ticker"])
        assert tickers == {a.ticker for a in DEMO_ASSETS} | {"VNINDEX"}

    def test_has_the_columns_the_prd_schema_requires(self, market: pd.DataFrame) -> None:
        assert {"date", "ticker", "close"}.issubset(market.columns)

    def test_every_ticker_has_the_same_number_of_observations(
        self, market: pd.DataFrame
    ) -> None:
        counts = market.groupby("ticker").size()
        assert counts.nunique() == 1

    def test_supplies_enough_history_for_a_250_day_rolling_analysis(
        self, market: pd.DataFrame
    ) -> None:
        # PRD 8.5 wants rolling_window + 100 observations for a meaningful demo.
        assert market["date"].nunique() >= 250 + 100

    def test_all_prices_are_strictly_positive(self, market: pd.DataFrame) -> None:
        assert bool((market["close"] > 0).all())

    def test_dates_are_iso_formatted(self, market: pd.DataFrame) -> None:
        assert market["date"].str.match(r"^\d{4}-\d{2}-\d{2}$").all()

    def test_contains_no_weekend_dates(self, market: pd.DataFrame) -> None:
        weekdays = pd.to_datetime(market["date"]).dt.dayofweek
        assert bool((weekdays < 5).all())


class TestPortfolioFile:
    def test_weights_sum_to_one(self) -> None:
        portfolio = generate_portfolio()
        assert portfolio["weight"].sum() == pytest.approx(1.0, abs=FLOAT_TOL)

    def test_is_long_only(self) -> None:
        assert bool((generate_portfolio()["weight"] >= 0).all())

    def test_has_between_two_and_ten_assets(self) -> None:
        assert 2 <= len(generate_portfolio()) <= 10


class TestEndToEndThroughTheServices:
    """The generated data must survive the pipeline it was made for."""

    def test_passes_validation_and_produces_a_usable_return_series(
        self, market: pd.DataFrame
    ) -> None:
        cleaned, removed, duplicates = clean_market_frame(market)
        assert removed == 0
        assert duplicates == 0

        portfolio = generate_portfolio()
        report = ValidationReport()
        validate_portfolio(portfolio, set(cleaned["ticker"]), report)
        assert report.can_run

        wide = pivot_long_prices(cleaned)
        tickers = list(portfolio["ticker"])
        aligned = align_on_common_dates(wide, tickers)

        # Every asset trades on every date, so nothing should be lost.
        assert len(aligned) == cleaned["date"].nunique()

        returns = log_returns(aligned)
        weights = dict(zip(portfolio["ticker"], portfolio["weight"], strict=True))
        series = portfolio_returns(returns, weights)

        assert len(series) == len(aligned) - 1
        assert bool(np.isfinite(series.to_numpy()).all())

    def test_the_generated_series_shows_volatility_variation(
        self, market: pd.DataFrame
    ) -> None:
        # The generator deliberately builds in calm and turbulent regimes so the
        # model-audit phase has something to distinguish. Verify they survived.
        cleaned, _, _ = clean_market_frame(market)
        wide = pivot_long_prices(cleaned)
        returns = log_returns(align_on_common_dates(wide, ["ASSET_A"]))

        rolling = returns["ASSET_A"].rolling(60).std().dropna()
        assert float(rolling.max() / rolling.min()) > 2.0
