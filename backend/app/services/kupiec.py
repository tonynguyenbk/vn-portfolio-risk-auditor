"""Kupiec unconditional-coverage test (PRD 9.12).

Tests ``H0: p = 1 - alpha``, where ``p`` is the true probability that a day's
loss exceeds its VaR forecast. The likelihood ratio

    LR_uc = -2 ln [ (1-p)^(T-x) p^x / ((1-p_hat)^(T-x) p_hat^x) ]

is asymptotically chi-squared with one degree of freedom under H0.

Two implementation notes that matter:

**Log space.** The ratio above underflows to zero for realistic ``T``: with
``T = 1838`` and ``p = 0.05`` the numerator alone is around ``1e-300``.
Expanding to a difference of log-likelihoods keeps every intermediate value in
a representable range, as PRD 9.12 requires.

**No SciPy.** For one degree of freedom the chi-squared survival function has a
closed form, ``P(X > x) = erfc(sqrt(x / 2))``, so the p-value needs nothing
beyond ``math``. The test suite checks this against ``scipy.stats.chi2.sf``.

What the result means is narrower than it looks. Failing to reject H0 is not
evidence that a model is correct — PRD 6.3 is explicit about this — and the
test is deliberately blind to *when* exceptions happened. Ten breaches spread
evenly across five years and ten breaches in a single fortnight produce an
identical statistic, though the second portfolio is in far more trouble.
Detecting that requires an independence test, which PRD 4.2 defers to Phase 2
of the research programme.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class KupiecResult:
    """Outcome of one unconditional-coverage test."""

    observations: int
    exceptions: int
    expected_exceptions: float
    exception_rate: float
    target_rate: float
    statistic: float
    p_value: float
    significance: float

    @property
    def rejected(self) -> bool:
        """Whether H0 is rejected at ``significance``."""
        return self.p_value < self.significance

    @property
    def verdict(self) -> str:
        """``"pass"`` when H0 survives.

        "pass" means only that the observed exception count is not
        statistically inconsistent with the target rate. It is not proof of
        model correctness, and the UI is required to say so (PRD 9.12).
        """
        return "fail" if self.rejected else "pass"


def chi_squared_1_sf(statistic: float) -> float:
    """``P(X > statistic)`` for ``X ~ chi-squared(1)``.

    Closed form via the complementary error function; see the module docstring.
    """
    if not math.isfinite(statistic) or statistic <= 0.0:
        return 1.0
    return min(1.0, max(0.0, math.erfc(math.sqrt(statistic / 2.0))))


def kupiec_test(
    observations: int,
    exceptions: int,
    confidence: float,
    significance: float = 0.05,
) -> KupiecResult:
    """Run the unconditional-coverage test.

    Args:
        observations: number of backtest days, ``T``.
        exceptions: number of days the loss exceeded its forecast, ``x``.
        confidence: the VaR confidence level, so the target rate is ``1 - it``.
        significance: threshold below which H0 is rejected.
    """
    if observations <= 0:
        raise ValueError("a backtest needs at least one observation")
    if not 0 <= exceptions <= observations:
        raise ValueError("exceptions must lie between 0 and the number of observations")
    if not 0.0 < confidence < 1.0:
        raise ValueError("confidence must lie strictly between 0 and 1")
    if not 0.0 < significance < 1.0:
        raise ValueError("significance must lie strictly between 0 and 1")

    target = 1.0 - confidence
    observed = exceptions / observations

    statistic = _likelihood_ratio(observations, exceptions, target)
    p_value = chi_squared_1_sf(statistic)

    return KupiecResult(
        observations=observations,
        exceptions=exceptions,
        expected_exceptions=observations * target,
        exception_rate=observed,
        target_rate=target,
        statistic=statistic,
        p_value=p_value,
        significance=significance,
    )


def _likelihood_ratio(observations: int, exceptions: int, target: float) -> float:
    """``LR_uc``, evaluated as a difference of log-likelihoods.

    The two boundary cases are handled by taking the limits directly rather
    than evaluating ``0 * log(0)``:

    * ``x = 0``  -> the observed rate is 0, so ``LR = -2 * T * ln(1 - p)``
    * ``x = T``  -> the observed rate is 1, so ``LR = -2 * T * ln(p)``

    Both arise in practice: a 99% model on a short sample often produces no
    exceptions at all, and ``0 * -inf`` is ``nan`` in IEEE arithmetic, which
    would silently poison the p-value.
    """
    successes = observations - exceptions

    if exceptions == 0:
        return -2.0 * observations * math.log(1.0 - target)
    if exceptions == observations:
        return -2.0 * observations * math.log(target)

    observed = exceptions / observations

    log_l_null = successes * math.log(1.0 - target) + exceptions * math.log(target)
    log_l_alt = successes * math.log(1.0 - observed) + exceptions * math.log(observed)

    statistic = -2.0 * (log_l_null - log_l_alt)

    # The unrestricted likelihood maximises the same family, so the ratio can
    # never favour H0. A small negative value here is pure rounding.
    return max(0.0, statistic)
