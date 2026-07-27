"""End-to-end analysis tests (PRD 20.3).

Exercises the orchestrator on the real demonstration dataset, so these cover
the same path the dashboard takes.
"""

from __future__ import annotations

import pandas as pd
import pytest

from app.schemas.analysis import (
    AnalysisConfig,
    DataStatus,
    LimitStatus,
    RiskLimits,
    Severity,
    VarModel,
)
from app.services.analysis import AnalysisBlockedError, run_analysis
from scripts.generate_demo_data import SEED, generate_market_data, generate_portfolio


@pytest.fixture(scope="module")
def market() -> pd.DataFrame:
    return generate_market_data(SEED)


@pytest.fixture(scope="module")
def portfolio() -> pd.DataFrame:
    return generate_portfolio()


@pytest.fixture(scope="module")
def bundle(market: pd.DataFrame, portfolio: pd.DataFrame):
    return run_analysis(
        market, portfolio, dataset_name="demo", is_simulated=True
    )


class TestMetadataAndQuality:
    def test_flags_the_dataset_as_simulated(self, bundle) -> None:
        assert bundle.result.metadata.is_simulated is True

    def test_reports_the_analysed_period_and_size(self, bundle) -> None:
        metadata = bundle.result.metadata
        assert metadata.assets == 5
        assert metadata.observations > 2000
        assert metadata.start_date < metadata.end_date

    def test_clean_demo_data_passes_validation(self, bundle) -> None:
        assert bundle.result.data_quality.status is DataStatus.PASS
        assert bundle.result.data_quality.rows_removed == 0
        assert bundle.result.data_quality.weight_total == pytest.approx(1.0, abs=1e-9)


class TestMetrics:
    def test_volatility_is_positive_and_plausible_for_equities(self, bundle) -> None:
        volatility = bundle.result.metrics.annualised_volatility
        assert 0.05 < volatility < 1.0

    def test_drawdown_is_negative_with_ordered_dates(self, bundle) -> None:
        mdd = bundle.result.metrics.maximum_drawdown
        assert mdd.value < 0
        assert mdd.peak_date <= mdd.trough_date

    def test_every_requested_model_and_confidence_is_estimated(self, bundle) -> None:
        estimates = bundle.result.metrics.var
        assert len(estimates) == 6
        assert {e.model for e in estimates} == set(VarModel)

    def test_all_var_estimates_are_positive_loss_magnitudes(self, bundle) -> None:
        assert all(e.value > 0 for e in bundle.result.metrics.var)

    def test_expected_shortfall_exceeds_var_at_the_same_confidence(self, bundle) -> None:
        for es in bundle.result.metrics.expected_shortfall:
            matching = next(
                e
                for e in bundle.result.metrics.var
                if e.model is VarModel.HISTORICAL and e.confidence == es.confidence
            )
            assert es.value >= matching.value


class TestPortfolioBlock:
    def test_curves_are_populated_and_start_at_the_base_index(self, bundle) -> None:
        wealth = bundle.result.portfolio.wealth_curve
        assert len(wealth) > 2000
        assert wealth[0].value == pytest.approx(100.0, abs=1e-9)

    def test_drawdown_curve_is_never_positive(self, bundle) -> None:
        assert all(point.value <= 1e-12 for point in bundle.result.portfolio.drawdown_curve)

    def test_benchmark_curve_is_present_for_the_demo_dataset(self, bundle) -> None:
        assert bundle.result.portfolio.benchmark_curve is not None
        assert len(bundle.result.portfolio.benchmark_curve) > 2000

    def test_sector_weights_sum_to_one(self, bundle) -> None:
        total = sum(s.weight for s in bundle.result.portfolio.sector_weights)
        assert total == pytest.approx(1.0, abs=1e-9)

    def test_a_missing_benchmark_degrades_gracefully(
        self, market: pd.DataFrame, portfolio: pd.DataFrame
    ) -> None:
        # PRD 15.3 requires the analysis to continue without a benchmark.
        config = AnalysisConfig(benchmark_ticker="DOES_NOT_EXIST")
        result = run_analysis(market, portfolio, config).result
        assert result.portfolio.benchmark_curve is None


class TestRiskContributionAndCorrelation:
    def test_contributions_sum_to_one(self, bundle) -> None:
        total = sum(row.contribution_pct for row in bundle.result.risk_contribution)
        assert total == pytest.approx(1.0, rel=1e-9)

    def test_correlation_matrix_is_square_symmetric_and_bounded(self, bundle) -> None:
        correlation = bundle.result.correlation
        size = len(correlation.tickers)
        assert len(correlation.matrix) == size

        for i in range(size):
            assert correlation.matrix[i][i] == pytest.approx(1.0, abs=1e-9)
            for j in range(size):
                assert correlation.matrix[i][j] == pytest.approx(
                    correlation.matrix[j][i], abs=1e-12
                )
                assert -1.0 <= correlation.matrix[i][j] <= 1.0

    def test_concentration_reports_the_largest_holding(self, bundle) -> None:
        concentration = bundle.result.concentration
        largest = max(bundle.result.portfolio.weights, key=lambda w: w.weight)
        assert concentration.largest_weight == pytest.approx(largest.weight)
        assert concentration.hhi > 0.2  # five holdings, so HHI >= 0.2


class TestLimits:
    def test_a_generous_limit_set_produces_no_warnings(
        self, market: pd.DataFrame, portfolio: pd.DataFrame
    ) -> None:
        relaxed = RiskLimits(
            max_var95_pct=0.5,
            max_single_asset_weight=1.0,
            max_sector_weight=1.0,
        )
        result = run_analysis(market, portfolio, limits=relaxed).result
        assert result.limits.status is LimitStatus.WITHIN_LIMIT
        assert result.limits.warnings == []

    def test_a_tight_var_limit_is_reported_as_a_breach(
        self, market: pd.DataFrame, portfolio: pd.DataFrame
    ) -> None:
        strict = RiskLimits(max_var95_pct=0.0001)
        result = run_analysis(market, portfolio, limits=strict).result
        assert result.limits.status is LimitStatus.BREACH
        assert any(w.code == "VAR_95_LIMIT" for w in result.limits.warnings)

    def test_a_tight_sector_limit_warns_without_breaching(
        self, market: pd.DataFrame, portfolio: pd.DataFrame
    ) -> None:
        limits = RiskLimits(max_var95_pct=0.5, max_sector_weight=0.10)
        result = run_analysis(market, portfolio, limits=limits).result
        assert result.limits.status is LimitStatus.WARNING
        assert all(w.severity is Severity.WARNING for w in result.limits.warnings)


class TestUnassessedLimitsAreNeverReportedAsPassing:
    """A limit that was not checked must never read as a limit that passed.

    Regression guard for a false-safety defect found in review: when the
    configured confidence levels omitted 0.95, no VaR-95 figure existed, the
    limit comparison was silently skipped, and the response came back
    ``within_limit`` with no warnings — over a portfolio whose actual VaR was
    50% above the configured limit. The UI rendered that as a green shield.

    This is the same epistemic point the project already makes about the Kupiec
    test: not rejecting is not the same as passing.
    """

    def test_omitting_the_95_percent_level_does_not_yield_a_clean_bill_of_health(
        self, market: pd.DataFrame, portfolio: pd.DataFrame
    ) -> None:
        config = AnalysisConfig(confidence_levels=[0.975, 0.99])
        limits = RiskLimits(max_var95_pct=0.02)

        result = run_analysis(market, portfolio, config, limits).result

        assert result.limits.status is not LimitStatus.WITHIN_LIMIT
        assert any(w.code == "VAR_95_NOT_ASSESSED" for w in result.limits.warnings)

    def test_the_unassessed_warning_says_plainly_that_it_is_not_a_pass(
        self, market: pd.DataFrame, portfolio: pd.DataFrame
    ) -> None:
        config = AnalysisConfig(confidence_levels=[0.99])
        result = run_analysis(market, portfolio, config).result

        warning = next(w for w in result.limits.warnings if w.code == "VAR_95_NOT_ASSESSED")
        assert "not a pass" in warning.message.lower()

    def test_the_check_still_runs_when_95_percent_is_present(
        self, market: pd.DataFrame, portfolio: pd.DataFrame
    ) -> None:
        # The guard must not fire when the check genuinely happened, or every
        # normal run would carry a spurious warning.
        config = AnalysisConfig(confidence_levels=[0.95, 0.99])
        result = run_analysis(market, portfolio, config).result

        assert not any(w.code == "VAR_95_NOT_ASSESSED" for w in result.limits.warnings)

    def test_within_limit_is_only_reachable_when_every_check_ran_and_passed(
        self, market: pd.DataFrame, portfolio: pd.DataFrame
    ) -> None:
        relaxed = RiskLimits(
            max_var95_pct=0.5, max_single_asset_weight=1.0, max_sector_weight=1.0
        )
        with_check = run_analysis(
            market, portfolio, AnalysisConfig(confidence_levels=[0.95]), relaxed
        ).result
        without_check = run_analysis(
            market, portfolio, AnalysisConfig(confidence_levels=[0.99]), relaxed
        ).result

        assert with_check.limits.status is LimitStatus.WITHIN_LIMIT
        assert without_check.limits.status is not LimitStatus.WITHIN_LIMIT


class TestAssumptionsAreReported:
    def test_every_analytical_response_carries_its_assumptions(self, bundle) -> None:
        # PRD 0.9 and 16.4.
        assumptions = bundle.result.assumptions
        assert assumptions.rolling_window == 250
        assert assumptions.trading_days_per_year == 252
        assert assumptions.return_type == "log"
        assert assumptions.weights_fixed is True
        assert "linear interpolation" in assumptions.quantile_method


class TestBlockedAnalyses:
    def test_weights_not_summing_to_one_block_the_run(self, market: pd.DataFrame) -> None:
        broken = pd.DataFrame(
            {"ticker": ["ASSET_A", "ASSET_B"], "weight": [0.6, 0.3], "sector": ["T", "B"]}
        )
        with pytest.raises(AnalysisBlockedError, match=r"96|90"):
            run_analysis(market, broken)

    def test_an_unknown_ticker_blocks_the_run(self, market: pd.DataFrame) -> None:
        broken = pd.DataFrame(
            {"ticker": ["ASSET_A", "NOPE"], "weight": [0.5, 0.5], "sector": ["T", "B"]}
        )
        with pytest.raises(AnalysisBlockedError, match="NOPE"):
            run_analysis(market, broken)

    def test_too_short_a_date_range_blocks_the_run(
        self, market: pd.DataFrame, portfolio: pd.DataFrame
    ) -> None:
        config = AnalysisConfig(start_date="2025-11-01", end_date="2025-12-31")
        with pytest.raises(AnalysisBlockedError, match="aligned observations"):
            run_analysis(market, portfolio, config)

    def test_the_blocking_report_is_available_on_the_exception(
        self, market: pd.DataFrame
    ) -> None:
        broken = pd.DataFrame(
            {"ticker": ["ASSET_A", "ASSET_B"], "weight": [0.6, 0.3], "sector": ["T", "B"]}
        )
        with pytest.raises(AnalysisBlockedError) as exc_info:
            run_analysis(market, broken)

        assert exc_info.value.report.status is DataStatus.FAIL
        assert len(exc_info.value.report.issues) > 0


class TestConfigurationIsHonoured:
    def test_a_narrower_date_range_shortens_the_analysis(
        self, market: pd.DataFrame, portfolio: pd.DataFrame
    ) -> None:
        config = AnalysisConfig(start_date="2022-01-01", end_date="2024-12-31")
        result = run_analysis(market, portfolio, config).result
        assert result.metadata.start_date.year == 2022
        assert result.metadata.end_date.year == 2024

    def test_selecting_one_model_produces_only_its_estimates(
        self, market: pd.DataFrame, portfolio: pd.DataFrame
    ) -> None:
        config = AnalysisConfig(models=[VarModel.EWMA_NORMAL], confidence_levels=[0.95])
        result = run_analysis(market, portfolio, config).result
        assert len(result.metrics.var) == 1
        assert result.metrics.var[0].model is VarModel.EWMA_NORMAL

    def test_the_ewma_lambda_changes_the_estimate(
        self, market: pd.DataFrame, portfolio: pd.DataFrame
    ) -> None:
        responsive = run_analysis(
            market,
            portfolio,
            AnalysisConfig(models=[VarModel.EWMA_NORMAL], ewma_lambda=0.80),
        ).result
        sluggish = run_analysis(
            market,
            portfolio,
            AnalysisConfig(models=[VarModel.EWMA_NORMAL], ewma_lambda=0.99),
        ).result
        assert responsive.metrics.var[0].value != sluggish.metrics.var[0].value


class TestSerialisation:
    def test_the_result_serialises_to_camel_case_json(self, bundle) -> None:
        payload = bundle.result.model_dump(by_alias=True, mode="json")
        assert "dataQuality" in payload
        assert "riskContribution" in payload
        assert "annualisedVolatility" in payload["metrics"]
        assert "data_quality" not in payload

    def test_no_numpy_scalars_survive_serialisation(self, bundle) -> None:
        # PRD 16.4: NumPy types must not reach the API surface.
        import json

        payload = bundle.result.model_dump(by_alias=True, mode="json")
        json.dumps(payload)  # raises TypeError on a NumPy scalar
