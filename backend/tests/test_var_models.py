"""VaR estimator tests (PRD 9.4 - 9.6, 20.1)."""

from __future__ import annotations

import numpy as np
import pytest
from scipy import stats

from app.schemas.analysis import VarModel
from app.services.var_models import (
    QUANTILE_METHOD,
    estimate_var,
    ewma_normal_var,
    historical_var,
    normal_quantile,
    parametric_normal_var,
    to_losses,
)
from tests.conftest import FLOAT_TOL


class TestNormalQuantile:
    """``statistics.NormalDist`` replaces ``scipy.stats.norm`` at runtime."""

    @pytest.mark.parametrize("confidence", [0.5, 0.9, 0.95, 0.975, 0.99, 0.995, 0.999])
    def test_matches_scipy_to_machine_precision(self, confidence: float) -> None:
        assert normal_quantile(confidence) == pytest.approx(
            float(stats.norm.ppf(confidence)), rel=1e-12
        )

    def test_reproduces_the_textbook_values(self) -> None:
        assert normal_quantile(0.95) == pytest.approx(1.6448536269514722, abs=1e-12)
        assert normal_quantile(0.99) == pytest.approx(2.3263478740408408, abs=1e-12)

    @pytest.mark.parametrize("confidence", [0.0, 1.0, -0.1, 1.5])
    def test_rejects_a_confidence_outside_the_unit_interval(self, confidence: float) -> None:
        with pytest.raises(ValueError):
            normal_quantile(confidence)


class TestLossConvention:
    def test_losses_are_the_negation_of_returns(self) -> None:
        returns = np.array([0.01, -0.02, 0.0])
        assert np.allclose(to_losses(returns), [-0.01, 0.02, 0.0], atol=FLOAT_TOL)


class TestHistoricalVar:
    def test_known_loss_vector_produces_the_documented_quantile(self) -> None:
        # Losses 0.01 .. 0.05. With linear interpolation the 95% point sits at
        # index 4 * 0.95 = 3.8, i.e. 80% of the way from 0.04 to 0.05.
        returns = np.array([-0.01, -0.02, -0.03, -0.04, -0.05])
        assert historical_var(returns, 0.95) == pytest.approx(0.048, abs=1e-12)

    def test_agrees_with_numpy_under_the_declared_method(self) -> None:
        rng = np.random.default_rng(3)
        returns = rng.standard_normal(500) * 0.01
        expected = float(np.quantile(-returns, 0.95, method=QUANTILE_METHOD))
        assert historical_var(returns, 0.95) == pytest.approx(expected, rel=1e-12)

    def test_higher_confidence_never_produces_a_smaller_var(self) -> None:
        rng = np.random.default_rng(5)
        returns = rng.standard_normal(2000) * 0.012
        assert historical_var(returns, 0.99) >= historical_var(returns, 0.95)

    def test_cannot_exceed_the_worst_loss_in_the_sample(self) -> None:
        # The structural limitation of Historical Simulation: it cannot imagine
        # a loss larger than one it has already seen.
        rng = np.random.default_rng(9)
        returns = rng.standard_normal(500) * 0.01
        assert historical_var(returns, 0.999) <= float(np.max(-returns))

    def test_is_translation_equivariant(self) -> None:
        rng = np.random.default_rng(13)
        returns = rng.standard_normal(300) * 0.01
        shifted = returns + 0.005
        assert historical_var(shifted, 0.95) == pytest.approx(
            historical_var(returns, 0.95) - 0.005, abs=1e-12
        )


class TestParametricNormalVar:
    def test_matches_a_manually_calculated_example(self) -> None:
        returns = np.array([0.01, -0.01, 0.02, -0.02])
        # mean = 0
        # sample variance = (0.0001 + 0.0001 + 0.0004 + 0.0004) / 3
        # sigma = sqrt(0.001 / 3)
        sigma = float(np.sqrt(0.001 / 3))
        expected = -0.0 + 1.6448536269514722 * sigma
        assert parametric_normal_var(returns, 0.95) == pytest.approx(expected, rel=1e-12)

    def test_subtracts_the_mean(self) -> None:
        # A positive drift lowers the loss threshold by exactly that drift.
        rng = np.random.default_rng(17)
        base = rng.standard_normal(400) * 0.01
        assert parametric_normal_var(base + 0.003, 0.95) == pytest.approx(
            parametric_normal_var(base, 0.95) - 0.003, abs=1e-12
        )

    def test_scales_linearly_with_volatility(self) -> None:
        rng = np.random.default_rng(19)
        returns = rng.standard_normal(400) * 0.01
        centred = returns - returns.mean()
        assert parametric_normal_var(centred * 2, 0.95) == pytest.approx(
            parametric_normal_var(centred, 0.95) * 2, rel=1e-10
        )

    def test_higher_confidence_never_produces_a_smaller_var(self) -> None:
        rng = np.random.default_rng(23)
        returns = rng.standard_normal(400) * 0.01
        assert parametric_normal_var(returns, 0.99) >= parametric_normal_var(returns, 0.95)

    def test_understates_the_tail_of_a_fat_tailed_sample(self) -> None:
        # The known weakness of the Normal assumption, asserted rather than
        # asserted-in-prose: Student-t returns breach a Normal VaR too often.
        rng = np.random.default_rng(29)
        returns = stats.t.rvs(df=3, size=20_000, random_state=rng) * 0.004
        normal_estimate = parametric_normal_var(returns, 0.99)
        empirical = historical_var(returns, 0.99)
        assert normal_estimate < empirical


class TestEwmaNormalVar:
    def test_constant_returns_give_zero_volatility_and_zero_excess_var(self) -> None:
        returns = np.full(300, 0.001)
        # No dispersion, so VaR reduces to minus the mean.
        assert ewma_normal_var(returns, 0.95) == pytest.approx(-0.001, abs=1e-12)

    def test_initialisation_is_the_sample_variance_of_the_window(self) -> None:
        # With lambda -> 1 the recursion barely updates, so the estimate must
        # converge on the plain sample standard deviation. This pins the
        # documented initialisation (PRD 9.6).
        rng = np.random.default_rng(31)
        returns = rng.standard_normal(500) * 0.01
        mu = float(np.mean(returns))
        sigma = float(np.std(returns, ddof=1))

        almost_static = ewma_normal_var(returns, 0.95, lambda_=0.999999)
        expected = -mu + 1.6448536269514722 * sigma
        assert almost_static == pytest.approx(expected, rel=1e-4)

    def test_reacts_faster_to_a_volatility_jump_than_the_equally_weighted_model(
        self,
    ) -> None:
        # This is the behaviour the whole model audit is designed to detect:
        # 240 calm days followed by 10 turbulent ones.
        rng = np.random.default_rng(37)
        calm = rng.standard_normal(240) * 0.004
        turbulent = rng.standard_normal(10) * 0.030
        returns = np.concatenate([calm, turbulent])

        assert ewma_normal_var(returns, 0.95) > parametric_normal_var(returns, 0.95)

    def test_a_lower_lambda_weights_recent_observations_more_heavily(self) -> None:
        rng = np.random.default_rng(41)
        returns = np.concatenate([rng.standard_normal(240) * 0.004, np.full(10, 0.05)])
        responsive = ewma_normal_var(returns, 0.95, lambda_=0.80)
        sluggish = ewma_normal_var(returns, 0.95, lambda_=0.99)
        assert responsive > sluggish

    @pytest.mark.parametrize("lambda_", [0.0, 1.0, -0.5, 1.5])
    def test_rejects_a_lambda_outside_the_unit_interval(self, lambda_: float) -> None:
        returns = np.array([0.01, -0.01, 0.02])
        with pytest.raises(ValueError, match="lambda"):
            ewma_normal_var(returns, 0.95, lambda_=lambda_)


class TestDispatch:
    @pytest.mark.parametrize("model", list(VarModel))
    def test_every_model_is_reachable_and_returns_a_float(self, model: VarModel) -> None:
        rng = np.random.default_rng(43)
        returns = rng.standard_normal(300) * 0.01
        value = estimate_var(returns, model, 0.95)
        assert type(value) is float
        assert np.isfinite(value)

    @pytest.mark.parametrize("model", list(VarModel))
    def test_a_positive_var_is_reported_for_a_loss_making_series(
        self, model: VarModel
    ) -> None:
        rng = np.random.default_rng(47)
        returns = rng.standard_normal(300) * 0.01
        assert estimate_var(returns, model, 0.95) > 0


class TestInputValidation:
    @pytest.mark.parametrize(
        "model", [VarModel.HISTORICAL, VarModel.PARAMETRIC_NORMAL, VarModel.EWMA_NORMAL]
    )
    def test_a_single_observation_is_rejected(self, model: VarModel) -> None:
        with pytest.raises(ValueError, match="at least two"):
            estimate_var(np.array([0.01]), model, 0.95)

    def test_non_finite_values_are_rejected(self) -> None:
        with pytest.raises(ValueError, match="non-finite"):
            historical_var(np.array([0.01, np.nan, 0.02]), 0.95)

    def test_infinite_values_are_rejected(self) -> None:
        with pytest.raises(ValueError, match="non-finite"):
            historical_var(np.array([0.01, np.inf, 0.02]), 0.95)
