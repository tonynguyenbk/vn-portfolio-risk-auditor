"""Expected Shortfall tests (PRD 9.7, 20.1)."""

from __future__ import annotations

import numpy as np
import pytest
from scipy import stats

from app.services.expected_shortfall import (
    historical_expected_shortfall,
    parametric_normal_expected_shortfall,
)
from app.services.var_models import historical_var, parametric_normal_var


class TestHistoricalExpectedShortfall:
    @pytest.mark.parametrize("seed", [67, 68, 69, 70, 71])
    @pytest.mark.parametrize("confidence", [0.95, 0.99])
    def test_is_at_least_as_large_as_var(self, seed: int, confidence: float) -> None:
        # Guaranteed by construction under the positive-loss convention: ES
        # averages the losses at or beyond the threshold.
        returns = np.random.default_rng(seed).standard_normal(1000) * 0.01
        assert historical_expected_shortfall(returns, confidence) >= historical_var(
            returns, confidence
        )

    def test_known_sample_averages_the_tail(self) -> None:
        # Losses 0.01 .. 0.10. The 90% quantile with linear interpolation is
        # 0.091, so the tail is {0.10} alone.
        returns = -np.arange(1, 11) / 100.0
        threshold = historical_var(returns, 0.90)
        assert threshold == pytest.approx(0.091, abs=1e-12)
        assert historical_expected_shortfall(returns, 0.90) == pytest.approx(0.10, abs=1e-12)

    def test_averages_several_tail_observations(self) -> None:
        # Losses 0.01 .. 0.10, 70% quantile = 0.073, tail = {0.08, 0.09, 0.10}.
        returns = -np.arange(1, 11) / 100.0
        assert historical_expected_shortfall(returns, 0.70) == pytest.approx(
            np.mean([0.08, 0.09, 0.10]), abs=1e-12
        )

    def test_the_tail_is_never_empty_for_a_quantile_derived_threshold(self) -> None:
        # An empirical quantile below 100% cannot exceed the sample maximum, so
        # at least one observation always sits in the tail. Documented because
        # it is what makes the guard below unreachable on this path.
        returns = np.array([0.01, 0.02, 0.03])
        result = historical_expected_shortfall(returns, 0.999)
        assert np.isfinite(result)
        assert result >= historical_var(returns, 0.999)

    def test_falls_back_to_the_threshold_when_no_loss_reaches_an_external_one(
        self,
    ) -> None:
        # Reachable once the threshold comes from elsewhere: a Normal-based VaR
        # can sit above every loss in the sample. PRD 9.7 requires this to be
        # handled explicitly rather than returning NaN.
        returns = np.array([0.01, 0.02, 0.03])
        external_threshold = 0.5

        result = historical_expected_shortfall(returns, 0.95, threshold=external_threshold)

        assert np.isfinite(result)
        assert result == pytest.approx(external_threshold)

    def test_an_external_threshold_selects_the_tail(self) -> None:
        # Losses 0.01 .. 0.10; a threshold of 0.085 admits the top two.
        returns = -np.arange(1, 11) / 100.0
        result = historical_expected_shortfall(returns, 0.95, threshold=0.085)
        assert result == pytest.approx(np.mean([0.09, 0.10]), abs=1e-12)

    def test_a_fatter_tail_raises_es_more_than_var(self) -> None:
        # The property that motivates reporting ES at all: it responds to tail
        # severity, which VaR is blind to.
        rng = np.random.default_rng(71)
        normal = rng.standard_normal(20_000) * 0.01
        fat = stats.t.rvs(df=3, size=20_000, random_state=rng) * 0.0058

        var_ratio = historical_var(fat, 0.95) / historical_var(normal, 0.95)
        es_ratio = historical_expected_shortfall(
            fat, 0.95
        ) / historical_expected_shortfall(normal, 0.95)

        assert es_ratio > var_ratio

    def test_higher_confidence_gives_a_larger_expected_shortfall(self) -> None:
        rng = np.random.default_rng(73)
        returns = rng.standard_normal(5000) * 0.01
        assert historical_expected_shortfall(
            returns, 0.99
        ) >= historical_expected_shortfall(returns, 0.95)


class TestParametricNormalExpectedShortfall:
    def test_matches_the_closed_form(self) -> None:
        rng = np.random.default_rng(79)
        returns = rng.standard_normal(2000) * 0.01

        mu = float(np.mean(returns))
        sigma = float(np.std(returns, ddof=1))
        z = float(stats.norm.ppf(0.95))
        expected = -mu + sigma * float(stats.norm.pdf(z)) / 0.05

        assert parametric_normal_expected_shortfall(returns, 0.95) == pytest.approx(
            expected, rel=1e-12
        )

    def test_exceeds_the_parametric_var(self) -> None:
        rng = np.random.default_rng(83)
        returns = rng.standard_normal(2000) * 0.01
        assert parametric_normal_expected_shortfall(
            returns, 0.95
        ) > parametric_normal_var(returns, 0.95)

    def test_understates_the_historical_figure_on_fat_tailed_data(self) -> None:
        rng = np.random.default_rng(89)
        returns = stats.t.rvs(df=3, size=20_000, random_state=rng) * 0.004
        assert parametric_normal_expected_shortfall(
            returns, 0.99
        ) < historical_expected_shortfall(returns, 0.99)

    def test_a_single_observation_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="at least two"):
            parametric_normal_expected_shortfall(np.array([0.01]), 0.95)
