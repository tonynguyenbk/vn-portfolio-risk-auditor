"""Validation and data-quality tests (PRD 8.5, 20.1)."""

from __future__ import annotations

import pandas as pd
import pytest

from app.schemas.analysis import DataStatus
from app.services.data_validation import (
    DataValidationError,
    ValidationReport,
    clean_market_frame,
    validate_history,
    validate_portfolio,
)


class TestCleanMarketFrame:
    def test_accepts_well_formed_data_unchanged(self, long_market_frame: pd.DataFrame) -> None:
        cleaned, removed, duplicates = clean_market_frame(long_market_frame)
        assert len(cleaned) == 4
        assert removed == 0
        assert duplicates == 0

    def test_missing_required_column_raises(self) -> None:
        frame = pd.DataFrame({"date": ["2024-01-01"], "ticker": ["AAA"]})
        with pytest.raises(DataValidationError, match="close"):
            clean_market_frame(frame)

    def test_drops_rows_with_unparseable_dates(
        self, long_market_frame: pd.DataFrame
    ) -> None:
        broken = long_market_frame.copy()
        broken.loc[0, "date"] = "not-a-date"
        cleaned, removed, _ = clean_market_frame(broken)
        assert removed == 1
        assert len(cleaned) == 3

    def test_drops_non_positive_prices(self, long_market_frame: pd.DataFrame) -> None:
        broken = long_market_frame.copy()
        broken.loc[1, "close"] = -5.0
        cleaned, removed, _ = clean_market_frame(broken)
        assert removed == 1
        assert bool((cleaned["close"] > 0).all())

    def test_drops_non_numeric_prices(self, long_market_frame: pd.DataFrame) -> None:
        broken = long_market_frame.copy()
        broken["close"] = broken["close"].astype(object)
        broken.loc[2, "close"] = "n/a"
        _, removed, _ = clean_market_frame(broken)
        assert removed == 1

    def test_counts_and_removes_duplicate_date_ticker_pairs(
        self, long_market_frame: pd.DataFrame
    ) -> None:
        duplicated = pd.concat([long_market_frame, long_market_frame.iloc[[0]]])
        cleaned, _, duplicates = clean_market_frame(duplicated)
        assert duplicates == 1
        assert not cleaned.duplicated(subset=["date", "ticker"]).any()

    def test_normalises_ticker_case_and_whitespace(
        self, long_market_frame: pd.DataFrame
    ) -> None:
        messy = long_market_frame.copy()
        messy.loc[0, "ticker"] = "  aaa  "
        cleaned, _, _ = clean_market_frame(messy)
        assert "AAA" in set(cleaned["ticker"])

    def test_output_is_sorted_by_date(self, long_market_frame: pd.DataFrame) -> None:
        shuffled = long_market_frame.iloc[::-1]
        cleaned, _, _ = clean_market_frame(shuffled)
        assert cleaned["date"].is_monotonic_increasing


class TestValidatePortfolio:
    def test_valid_portfolio_passes(self, valid_portfolio: pd.DataFrame) -> None:
        report = ValidationReport()
        validate_portfolio(valid_portfolio, {"AAA", "BBB"}, report)
        assert report.status is DataStatus.PASS
        assert report.can_run

    def test_weights_not_summing_to_one_block_the_analysis(self) -> None:
        portfolio = pd.DataFrame({"ticker": ["AAA", "BBB"], "weight": [0.6, 0.36]})
        report = ValidationReport()
        validate_portfolio(portfolio, {"AAA", "BBB"}, report)

        assert report.status is DataStatus.FAIL
        assert not report.can_run
        assert any(issue.code == "WEIGHT_SUM" for issue in report.issues)
        # The message quotes the actual total, as PRD 15.3 illustrates.
        assert "96.00%" in report.issues[0].message

    def test_weights_within_tolerance_are_accepted(self) -> None:
        portfolio = pd.DataFrame({"ticker": ["AAA", "BBB"], "weight": [0.5, 0.5 + 1e-9]})
        report = ValidationReport()
        validate_portfolio(portfolio, {"AAA", "BBB"}, report)
        assert report.can_run

    def test_negative_weight_is_rejected_because_the_mvp_is_long_only(self) -> None:
        portfolio = pd.DataFrame({"ticker": ["AAA", "BBB"], "weight": [1.2, -0.2]})
        report = ValidationReport()
        validate_portfolio(portfolio, {"AAA", "BBB"}, report)
        assert any(issue.code == "NEGATIVE_WEIGHT" for issue in report.issues)

    def test_ticker_absent_from_market_data_is_rejected(self) -> None:
        portfolio = pd.DataFrame({"ticker": ["AAA", "ZZZ"], "weight": [0.5, 0.5]})
        report = ValidationReport()
        validate_portfolio(portfolio, {"AAA", "BBB"}, report)

        assert not report.can_run
        assert any(issue.code == "TICKER_NOT_IN_MARKET_DATA" for issue in report.issues)

    def test_single_asset_portfolio_is_rejected(self) -> None:
        portfolio = pd.DataFrame({"ticker": ["AAA"], "weight": [1.0]})
        report = ValidationReport()
        validate_portfolio(portfolio, {"AAA"}, report)
        assert any(issue.code == "TOO_FEW_ASSETS" for issue in report.issues)

    def test_more_than_ten_assets_is_rejected(self) -> None:
        tickers = [f"T{i:02d}" for i in range(11)]
        portfolio = pd.DataFrame({"ticker": tickers, "weight": [1 / 11] * 11})
        report = ValidationReport()
        validate_portfolio(portfolio, set(tickers), report)
        assert any(issue.code == "TOO_MANY_ASSETS" for issue in report.issues)


class TestValidateHistory:
    def test_ample_history_passes(self) -> None:
        report = ValidationReport()
        validate_history(1000, 1000, rolling_window=250, report=report)
        assert report.status is DataStatus.PASS

    def test_history_below_the_window_blocks_the_analysis(self) -> None:
        report = ValidationReport()
        validate_history(180, 180, rolling_window=250, report=report)

        assert not report.can_run
        message = report.issues[0].message
        assert "180" in message and "251" in message

    def test_thin_history_warns_without_blocking(self) -> None:
        report = ValidationReport()
        validate_history(300, 300, rolling_window=250, report=report)

        assert report.status is DataStatus.WARNING
        assert report.can_run
        assert any(issue.code == "THIN_HISTORY" for issue in report.issues)

    def test_losing_more_than_two_percent_to_alignment_warns(self) -> None:
        report = ValidationReport()
        validate_history(960, 1000, rolling_window=250, report=report)

        assert any(issue.code == "EXCESSIVE_ALIGNMENT_LOSS" for issue in report.issues)
        assert report.can_run

    def test_small_alignment_loss_is_not_flagged(self) -> None:
        report = ValidationReport()
        validate_history(995, 1000, rolling_window=250, report=report)
        assert not any(issue.code == "EXCESSIVE_ALIGNMENT_LOSS" for issue in report.issues)


class TestReportStatusEscalation:
    def test_a_warning_does_not_downgrade_an_existing_failure(self) -> None:
        from app.schemas.analysis import Severity

        report = ValidationReport()
        report.add("A", "blocking", Severity.BREACH)
        report.add("B", "advisory", Severity.WARNING)

        assert report.status is DataStatus.FAIL
        assert not report.can_run
