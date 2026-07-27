"""Risk-contribution and correlation tests (PRD 9.8, 9.10, 20.1)."""

from __future__ import annotations

import numpy as np
import pytest

from app.services.risk_contribution import (
    correlation_from_covariance,
    covariance_matrix,
    portfolio_volatility,
    risk_contributions,
)
from tests.conftest import FLOAT_TOL


@pytest.fixture
def sample_returns() -> np.ndarray:
    rng = np.random.default_rng(53)
    market = rng.standard_normal(1000) * 0.01
    betas = np.array([1.2, 0.9, 1.05])
    idiosyncratic = rng.standard_normal((1000, 3)) * np.array([0.008, 0.011, 0.006])
    return market[:, None] * betas + idiosyncratic


class TestCovarianceAndCorrelation:
    def test_covariance_is_square_and_symmetric(self, sample_returns: np.ndarray) -> None:
        cov = covariance_matrix(sample_returns)
        assert cov.shape == (3, 3)
        assert np.allclose(cov, cov.T, atol=FLOAT_TOL)

    def test_matches_a_hand_computed_covariance(self) -> None:
        # Comparing against np.cov would be a tautology: the implementation is
        # a call to np.cov. This works the n-1 denominator out by hand instead.
        #
        #   x = [1, 2, 3, 4]      mean 2.5
        #   y = [2, 4, 5, 9]      mean 5.0
        #   cov(x, y) = ((-1.5)(-3) + (-0.5)(-1) + (0.5)(0) + (1.5)(4)) / 3
        #             = (4.5 + 0.5 + 0 + 6) / 3 = 11 / 3
        #   var(x)    = (2.25 + 0.25 + 0.25 + 2.25) / 3 = 5 / 3
        observations = np.array([[1.0, 2.0], [2.0, 4.0], [3.0, 5.0], [4.0, 9.0]])
        cov = covariance_matrix(observations)

        assert cov[0][0] == pytest.approx(5.0 / 3.0, rel=1e-14)
        assert cov[0][1] == pytest.approx(11.0 / 3.0, rel=1e-14)
        assert cov[1][0] == pytest.approx(11.0 / 3.0, rel=1e-14)

    def test_correlation_has_a_unit_diagonal(self, sample_returns: np.ndarray) -> None:
        correlation = correlation_from_covariance(covariance_matrix(sample_returns))
        assert np.allclose(np.diag(correlation), 1.0, atol=FLOAT_TOL)

    def test_correlation_stays_within_the_valid_range(
        self, sample_returns: np.ndarray
    ) -> None:
        correlation = correlation_from_covariance(covariance_matrix(sample_returns))
        assert correlation.min() >= -1.0
        assert correlation.max() <= 1.0

    def test_matches_numpy_corrcoef(self, sample_returns: np.ndarray) -> None:
        expected = np.corrcoef(sample_returns, rowvar=False)
        result = correlation_from_covariance(covariance_matrix(sample_returns))
        assert np.allclose(result, expected, atol=1e-12)

    def test_perfectly_correlated_assets_give_exactly_one(self) -> None:
        # Without the clip this overshoots to 1.0000000000000002 and fails a
        # downstream range check.
        base = np.random.default_rng(59).standard_normal(200)
        duplicated = np.column_stack([base, base * 2.0])
        correlation = correlation_from_covariance(covariance_matrix(duplicated))
        assert correlation[0, 1] <= 1.0
        assert correlation[0, 1] == pytest.approx(1.0, abs=1e-12)

    def test_a_zero_variance_asset_is_rejected(self) -> None:
        constant = np.column_stack([np.ones(50), np.random.default_rng(61).standard_normal(50)])
        with pytest.raises(ValueError, match="zero variance"):
            correlation_from_covariance(covariance_matrix(constant))

    def test_a_single_observation_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="at least two"):
            covariance_matrix(np.array([[0.01, 0.02]]))

    def test_a_one_dimensional_input_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="two-dimensional"):
            covariance_matrix(np.array([0.01, 0.02, 0.03]))


class TestEulerDecomposition:
    def test_contributions_sum_to_portfolio_volatility(
        self, sample_returns: np.ndarray
    ) -> None:
        # The identity that makes the decomposition meaningful (PRD 9.10).
        cov = covariance_matrix(sample_returns)
        weights = np.array([0.5, 0.3, 0.2])
        sigma_p = portfolio_volatility(cov, weights)

        rows = risk_contributions(cov, weights, ["A", "B", "C"])
        total = sum(row.contribution for row in rows)

        assert total == pytest.approx(sigma_p, rel=1e-12)

    def test_percentage_contributions_sum_to_one(
        self, sample_returns: np.ndarray
    ) -> None:
        cov = covariance_matrix(sample_returns)
        weights = np.array([0.5, 0.3, 0.2])
        rows = risk_contributions(cov, weights, ["A", "B", "C"])
        assert sum(row.contribution_pct for row in rows) == pytest.approx(1.0, rel=1e-12)

    def test_a_zero_weight_asset_contributes_nothing(
        self, sample_returns: np.ndarray
    ) -> None:
        cov = covariance_matrix(sample_returns)
        weights = np.array([0.6, 0.4, 0.0])
        rows = risk_contributions(cov, weights, ["A", "B", "C"])
        assert rows[2].contribution == pytest.approx(0.0, abs=FLOAT_TOL)
        assert rows[2].contribution_pct == pytest.approx(0.0, abs=FLOAT_TOL)

    def test_an_uncorrelated_portfolio_splits_risk_by_weighted_variance(self) -> None:
        # With a diagonal covariance matrix, RC_i = w_i^2 * var_i / sigma_p.
        cov = np.diag([0.0004, 0.0009])
        weights = np.array([0.5, 0.5])
        sigma_p = portfolio_volatility(cov, weights)

        rows = risk_contributions(cov, weights, ["A", "B"])

        assert rows[0].contribution == pytest.approx(0.25 * 0.0004 / sigma_p, rel=1e-12)
        assert rows[1].contribution == pytest.approx(0.25 * 0.0009 / sigma_p, rel=1e-12)

    def test_a_more_volatile_asset_contributes_more_at_equal_weight(self) -> None:
        cov = np.diag([0.0001, 0.0016])
        rows = risk_contributions(cov, np.array([0.5, 0.5]), ["quiet", "volatile"])
        assert rows[1].contribution_pct > rows[0].contribution_pct

    def test_weight_and_contribution_can_diverge(self, sample_returns: np.ndarray) -> None:
        # The point of the whole panel: risk share is not weight share.
        cov = covariance_matrix(sample_returns)
        weights = np.array([0.2, 0.6, 0.2])
        rows = risk_contributions(cov, weights, ["A", "B", "C"])
        assert any(
            abs(row.contribution_pct - row.weight) > 0.01 for row in rows
        ), "contributions tracked weights exactly, so the fixture is not informative"

    def test_marginal_contribution_matches_the_analytic_derivative(
        self, sample_returns: np.ndarray
    ) -> None:
        # MRC_i is d(sigma_p)/d(w_i); check it against a numerical derivative.
        cov = covariance_matrix(sample_returns)
        weights = np.array([0.5, 0.3, 0.2])
        rows = risk_contributions(cov, weights, ["A", "B", "C"])

        epsilon = 1e-7
        for i, row in enumerate(rows):
            bumped = weights.copy()
            bumped[i] += epsilon
            numerical = (
                portfolio_volatility(cov, bumped) - portfolio_volatility(cov, weights)
            ) / epsilon
            assert row.marginal_contribution == pytest.approx(numerical, rel=1e-5)


class TestValidation:
    def test_mismatched_covariance_and_weight_dimensions_are_rejected(self) -> None:
        with pytest.raises(ValueError, match="3x3"):
            risk_contributions(np.eye(3), np.array([0.5, 0.5]), ["A", "B"])

    def test_a_non_square_covariance_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="square"):
            portfolio_volatility(np.ones((2, 3)), np.array([0.5, 0.5]))

    def test_mismatched_ticker_count_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="same length"):
            risk_contributions(np.eye(2) * 0.01, np.array([0.5, 0.5]), ["A"])

    def test_a_zero_volatility_portfolio_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="zero"):
            risk_contributions(np.zeros((2, 2)), np.array([0.5, 0.5]), ["A", "B"])
