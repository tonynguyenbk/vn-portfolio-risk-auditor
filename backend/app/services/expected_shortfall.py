"""Expected Shortfall (PRD 9.7).

Where VaR marks the edge of the tail, Expected Shortfall describes what is
inside it: the average loss on the days the threshold is breached. Two
portfolios can share a VaR and differ greatly in ES, which is why PRD 6.2 RQ5
asks what ES adds beyond VaR.
"""

from __future__ import annotations

from statistics import NormalDist

import numpy as np

from app.services.var_models import historical_var, normal_quantile, to_losses

_STANDARD_NORMAL = NormalDist()


def historical_expected_shortfall(
    returns: np.ndarray,
    confidence: float,
    threshold: float | None = None,
) -> float:
    """Mean of losses at or beyond a VaR threshold.

    ``ES = mean{L_t : L_t >= VaR}``

    Args:
        returns: return series.
        confidence: used to derive the threshold when one is not supplied.
        threshold: an externally computed VaR to measure the tail against.
            Passing the parametric or EWMA figure here gives the average
            severity of the breaches *that model* would have suffered, which is
            how the tail severity of different models becomes comparable.

    PRD 9.7 requires the empty-tail case to be handled explicitly. It is
    unreachable when the threshold comes from this module's own quantile — an
    empirical quantile below 100% never exceeds the sample maximum, so the tail
    always contains at least one observation. It becomes reachable as soon as
    ``threshold`` is supplied, because a Normal-based VaR can sit above every
    loss the sample contains. In that case the threshold itself is returned: it
    is the tightest statement the sample supports, and it preserves the
    ``ES >= VaR`` relationship the rest of the system relies on.
    """
    if threshold is None:
        threshold = historical_var(returns, confidence)

    losses = to_losses(returns)
    tail = losses[losses >= threshold]

    if tail.size == 0:
        return threshold

    return float(np.mean(tail))


def parametric_normal_expected_shortfall(returns: np.ndarray, confidence: float) -> float:
    """Closed-form ES under a Normal assumption (PRD 9.7).

    ``ES = -mu + sigma * phi(z_alpha) / (1 - alpha)``

    where ``phi`` is the standard Normal density. Inherits the thin-tail
    problem of the Normal assumption, so it will generally sit below the
    historical figure on real return data.
    """
    array = np.asarray(returns, dtype=float)
    if array.size < 2:
        raise ValueError("at least two observations are required to estimate ES")

    mu = float(np.mean(array))
    sigma = float(np.std(array, ddof=1))
    z = normal_quantile(confidence)
    density = _STANDARD_NORMAL.pdf(z)

    return -mu + sigma * density / (1.0 - confidence)
