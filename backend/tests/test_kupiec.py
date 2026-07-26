"""Kupiec test verification (PRD 9.12, 20.1).

The runtime deliberately avoids SciPy — the chi-squared(1) survival function is
computed with ``math.erfc`` and normal quantiles with ``statistics.NormalDist``.
That is only defensible if the implementations are checked against a trusted
reference, so SciPy appears here, in the tests, as an independent oracle.

Cross-checking this way is stronger evidence than calling SciPy in production
would have been: two independent implementations agreeing to machine precision
rules out an algebra error in a way that one implementation cannot.
"""

from __future__ import annotations

import math

import pytest
from scipy import stats

from app.services.kupiec import chi_squared_1_sf, kupiec_test


class TestChiSquaredSurvivalFunction:
    @pytest.mark.parametrize(
        "statistic",
        [1e-6, 0.001, 0.1, 0.5, 1.0, 2.0, 3.841, 6.635, 10.0, 25.0, 100.0],
    )
    def test_matches_scipy_to_machine_precision(self, statistic: float) -> None:
        assert chi_squared_1_sf(statistic) == pytest.approx(
            float(stats.chi2.sf(statistic, df=1)), rel=1e-12, abs=1e-15
        )

    def test_reproduces_the_textbook_critical_value(self) -> None:
        # The 5% critical value of chi-squared(1) is 3.8415.
        assert chi_squared_1_sf(3.841458820694124) == pytest.approx(0.05, abs=1e-9)

    def test_a_zero_or_negative_statistic_gives_a_p_value_of_one(self) -> None:
        assert chi_squared_1_sf(0.0) == 1.0
        assert chi_squared_1_sf(-1.0) == 1.0


class TestLikelihoodRatio:
    """Cross-checked against the binomial log-likelihood.

    The binomial coefficient is identical under both hypotheses and cancels in
    the ratio, so ``LR = -2 * (logpmf(x, T, p) - logpmf(x, T, p_hat))`` is an
    exact independent route to the same statistic.
    """

    @pytest.mark.parametrize(
        ("observations", "exceptions", "confidence"),
        [
            (250, 10, 0.95),
            (1838, 121, 0.95),
            (1838, 100, 0.95),
            (500, 3, 0.99),
            (1000, 61, 0.95),
            (750, 2, 0.99),
        ],
    )
    def test_matches_the_binomial_likelihood_ratio(
        self, observations: int, exceptions: int, confidence: float
    ) -> None:
        result = kupiec_test(observations, exceptions, confidence)

        target = 1.0 - confidence
        observed = exceptions / observations
        expected = -2.0 * (
            float(stats.binom.logpmf(exceptions, observations, target))
            - float(stats.binom.logpmf(exceptions, observations, observed))
        )

        assert result.statistic == pytest.approx(expected, rel=1e-10)

    def test_a_perfectly_calibrated_model_scores_exactly_zero(self) -> None:
        # 50 exceptions in 1000 days is exactly the 5% the model promises, so
        # the restricted and unrestricted likelihoods coincide.
        result = kupiec_test(observations=1000, exceptions=50, confidence=0.95)
        assert result.statistic == pytest.approx(0.0, abs=1e-12)
        assert result.p_value == pytest.approx(1.0, abs=1e-12)
        assert result.verdict == "pass"

    def test_the_statistic_grows_as_the_exception_rate_drifts_from_target(self) -> None:
        on_target = kupiec_test(1000, 50, 0.95).statistic
        slightly_off = kupiec_test(1000, 60, 0.95).statistic
        badly_off = kupiec_test(1000, 100, 0.95).statistic
        assert on_target < slightly_off < badly_off

    def test_the_statistic_is_never_negative(self) -> None:
        for exceptions in range(0, 201, 7):
            assert kupiec_test(200, min(exceptions, 200), 0.95).statistic >= 0.0


class TestBoundaryCases:
    """``x = 0`` and ``x = T`` both involve ``0 * log(0)`` and need limits."""

    def test_zero_exceptions_is_handled(self) -> None:
        result = kupiec_test(observations=100, exceptions=0, confidence=0.95)

        # Limit of the general expression: LR = -2 * T * ln(1 - p).
        assert result.statistic == pytest.approx(-2 * 100 * math.log(0.95), rel=1e-12)
        assert math.isfinite(result.statistic)
        assert 0.0 <= result.p_value <= 1.0

    def test_zero_exceptions_rejects_an_over_conservative_model(self) -> None:
        # Not a single breach in 1000 days at 95% means the model is far too
        # cautious; the test should say so.
        result = kupiec_test(observations=1000, exceptions=0, confidence=0.95)
        assert result.verdict == "fail"
        assert result.exception_rate == 0.0

    def test_every_day_an_exception_is_handled(self) -> None:
        result = kupiec_test(observations=100, exceptions=100, confidence=0.95)

        assert result.statistic == pytest.approx(-2 * 100 * math.log(0.05), rel=1e-12)
        assert math.isfinite(result.statistic)
        assert result.verdict == "fail"

    def test_a_single_observation_does_not_crash(self) -> None:
        for exceptions in (0, 1):
            result = kupiec_test(observations=1, exceptions=exceptions, confidence=0.95)
            assert math.isfinite(result.statistic)
            assert 0.0 <= result.p_value <= 1.0

    def test_no_underflow_on_a_long_sample(self) -> None:
        # The raw likelihood ratio underflows to zero here; computing in log
        # space is what keeps the statistic finite (PRD 9.12).
        result = kupiec_test(observations=10_000, exceptions=500, confidence=0.95)
        assert math.isfinite(result.statistic)
        assert result.statistic == pytest.approx(0.0, abs=1e-9)


class TestPValueRange:
    @pytest.mark.parametrize("observations", [10, 250, 1838, 5000])
    @pytest.mark.parametrize("rate", [0.0, 0.001, 0.05, 0.2, 0.5, 1.0])
    def test_p_values_stay_inside_the_unit_interval(
        self, observations: int, rate: float
    ) -> None:
        exceptions = round(observations * rate)
        result = kupiec_test(observations, exceptions, 0.95)
        assert 0.0 <= result.p_value <= 1.0


class TestReportedFields:
    def test_expected_exceptions_uses_the_target_rate(self) -> None:
        result = kupiec_test(observations=1000, exceptions=61, confidence=0.95)
        assert result.expected_exceptions == pytest.approx(50.0)
        assert result.target_rate == pytest.approx(0.05)
        assert result.exception_rate == pytest.approx(0.061)

    def test_verdict_follows_the_significance_level(self) -> None:
        # A borderline case flips as the significance level is raised.
        lenient = kupiec_test(1000, 63, 0.95, significance=0.01)
        strict = kupiec_test(1000, 63, 0.95, significance=0.10)
        assert lenient.verdict == "pass"
        assert strict.verdict == "fail"

    @pytest.mark.parametrize(
        ("observations", "exceptions", "confidence"),
        [(0, 0, 0.95), (10, 11, 0.95), (10, -1, 0.95), (10, 1, 0.0), (10, 1, 1.0)],
    )
    def test_invalid_inputs_are_rejected(
        self, observations: int, exceptions: int, confidence: float
    ) -> None:
        with pytest.raises(ValueError):
            kupiec_test(observations, exceptions, confidence)
