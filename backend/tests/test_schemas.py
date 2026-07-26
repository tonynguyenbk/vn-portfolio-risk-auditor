"""Schema contract tests.

The frontend types in ``frontend/types/analysis.ts`` are camelCase. If these
tests fail, the two halves of the application have drifted apart.
"""

from __future__ import annotations

from datetime import date

import pytest
from pydantic import ValidationError

from app.schemas.analysis import (
    AnalysisConfig,
    Assumptions,
    DataQuality,
    DataStatus,
    RiskLimits,
    VarModel,
)


class TestCamelCaseSerialisation:
    def test_fields_serialise_to_camel_case(self) -> None:
        quality = DataQuality(
            status=DataStatus.PASS,
            rows_removed=3,
            duplicate_records=1,
            aligned_observations=1900,
            weight_total=1.0,
        )
        payload = quality.model_dump(by_alias=True)

        assert "rowsRemoved" in payload
        assert "alignedObservations" in payload
        assert "rows_removed" not in payload

    def test_models_accept_either_naming_convention(self) -> None:
        by_alias = DataQuality.model_validate(
            {
                "status": "pass",
                "rowsRemoved": 0,
                "duplicateRecords": 0,
                "alignedObservations": 10,
                "weightTotal": 1.0,
            }
        )
        by_field = DataQuality(
            status=DataStatus.PASS,
            rows_removed=0,
            duplicate_records=0,
            aligned_observations=10,
            weight_total=1.0,
        )
        assert by_alias == by_field

    def test_assumptions_round_trip(self) -> None:
        assumptions = Assumptions(
            rolling_window=250,
            forecast_horizon_days=1,
            ewma_lambda=0.94,
            trading_days_per_year=252,
            quantile_method="linear interpolation between order statistics",
            price_basis="close",
        )
        restored = Assumptions.model_validate(assumptions.model_dump(by_alias=True))
        assert restored == assumptions


class TestConfigValidation:
    def test_defaults_match_the_prd(self) -> None:
        config = AnalysisConfig()
        assert config.rolling_window == 250
        assert config.ewma_lambda == 0.94
        assert config.confidence_levels == [0.95, 0.99]
        assert set(config.models) == set(VarModel)
        assert config.notional_value is None

    @pytest.mark.parametrize("value", [0.0, 1.0, -0.5, 1.2])
    def test_ewma_lambda_must_lie_strictly_inside_the_unit_interval(
        self, value: float
    ) -> None:
        with pytest.raises(ValidationError):
            AnalysisConfig(ewma_lambda=value)

    def test_notional_value_must_be_positive_when_supplied(self) -> None:
        with pytest.raises(ValidationError):
            AnalysisConfig(notional_value=0)

    def test_unknown_fields_are_rejected_rather_than_ignored(self) -> None:
        # A typo in an uploaded config should surface, not be silently dropped.
        with pytest.raises(ValidationError):
            AnalysisConfig.model_validate({"rollingWindow": 250, "rollingWindwo": 100})

    def test_dates_parse_from_iso_strings(self) -> None:
        config = AnalysisConfig.model_validate(
            {"startDate": "2018-01-01", "endDate": "2025-12-31"}
        )
        assert config.start_date == date(2018, 1, 1)


class TestRiskLimits:
    def test_defaults_match_the_prd_demonstration_thresholds(self) -> None:
        limits = RiskLimits()
        assert limits.max_var95_pct == 0.02
        assert limits.max_single_asset_weight == 0.30
        assert limits.max_sector_weight == 0.45
        assert limits.max_stress_loss_pct == 0.08
        assert limits.test_significance == 0.05

    def test_significance_outside_the_unit_interval_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            RiskLimits(test_significance=1.0)
