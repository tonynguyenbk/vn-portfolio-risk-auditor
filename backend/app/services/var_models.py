"""Value at Risk estimators (PRD 9.4 - 9.6).

Three conventions hold throughout and are relied on by the backtester:

* **Losses are positive.** ``L_t = -r_t``. A VaR of ``0.0216`` is a 2.16% loss
  threshold, so a larger number always means more risk.
* **Quantiles use linear interpolation** between order statistics — NumPy's
  ``method="linear"``. PRD 9.4 requires this to be stated rather than inherited
  from an unexamined default, because the seven interpolation schemes NumPy
  offers disagree materially in the tail, which is exactly where VaR lives.
* **Normal quantiles come from the standard library.** ``statistics.NormalDist``
  provides ``inv_cdf`` to full double precision, so SciPy is not needed at
  runtime; the test suite checks the two agree.
"""

from __future__ import annotations

from statistics import NormalDist

import numpy as np

from app.schemas.analysis import VarModel

#: NumPy quantile interpolation scheme. Named here so one edit changes it
#: everywhere and the assumptions block can report it truthfully.
QUANTILE_METHOD = "linear"
QUANTILE_METHOD_DESCRIPTION = "linear interpolation between order statistics"

DEFAULT_EWMA_LAMBDA = 0.94

_STANDARD_NORMAL = NormalDist()


def normal_quantile(confidence: float) -> float:
    """``z_alpha`` such that ``P(Z <= z_alpha) = confidence``."""
    if not 0.0 < confidence < 1.0:
        raise ValueError("confidence must lie strictly between 0 and 1")
    return _STANDARD_NORMAL.inv_cdf(confidence)


def to_losses(returns: np.ndarray) -> np.ndarray:
    """``L_t = -r_t`` (PRD 7.2)."""
    return -np.asarray(returns, dtype=float)


def historical_var(returns: np.ndarray, confidence: float) -> float:
    """Empirical quantile of the loss distribution (PRD 9.4).

    Makes no distributional assumption, which is its strength and its
    weakness: it can only produce losses of a size the sample already
    contains, so it cannot anticipate a shock larger than any yet observed.
    """
    _validate(returns, confidence)
    losses = to_losses(returns)
    return float(np.quantile(losses, confidence, method=QUANTILE_METHOD))


def parametric_normal_var(returns: np.ndarray, confidence: float) -> float:
    """``VaR = -mu + z_alpha * sigma`` under a Normal assumption (PRD 9.5).

    Uses the sample standard deviation with an ``n - 1`` denominator. The
    Normal assumption is the weak point: daily equity returns have fatter tails
    than a Normal, so this tends to understate risk at high confidence.
    """
    _validate(returns, confidence)
    array = np.asarray(returns, dtype=float)
    mu = float(np.mean(array))
    sigma = float(np.std(array, ddof=1))
    return -mu + normal_quantile(confidence) * sigma


def ewma_normal_var(
    returns: np.ndarray,
    confidence: float,
    lambda_: float = DEFAULT_EWMA_LAMBDA,
) -> float:
    """Exponentially weighted volatility with a Normal quantile (PRD 9.6).

    Variance recursion::

        sigma_t^2 = lambda * sigma_{t-1}^2 + (1 - lambda) * (r_{t-1} - mu)^2

    **Initialisation**, which PRD 9.6 requires to be documented and tested: the
    recursion starts from the sample variance of the supplied window, then
    consumes every observation in it. The value returned is therefore the
    one-step-ahead forecast conditioned on the whole window, not the in-sample
    variance of its last element.

    Because recent observations carry more weight, this reacts to a change in
    market conditions far faster than an equally weighted estimator — which is
    the property the model audit is designed to detect.
    """
    _validate(returns, confidence)
    if not 0.0 < lambda_ < 1.0:
        raise ValueError("EWMA lambda must lie strictly between 0 and 1")

    array = np.asarray(returns, dtype=float)
    mu = float(np.mean(array))
    variance = float(np.var(array, ddof=1))

    for observation in array:
        variance = lambda_ * variance + (1.0 - lambda_) * (observation - mu) ** 2

    return -mu + normal_quantile(confidence) * float(np.sqrt(variance))


def estimate_var(
    returns: np.ndarray,
    model: VarModel,
    confidence: float,
    lambda_: float = DEFAULT_EWMA_LAMBDA,
) -> float:
    """Dispatch to the requested estimator."""
    match model:
        case VarModel.HISTORICAL:
            return historical_var(returns, confidence)
        case VarModel.PARAMETRIC_NORMAL:
            return parametric_normal_var(returns, confidence)
        case VarModel.EWMA_NORMAL:
            return ewma_normal_var(returns, confidence, lambda_)


def _validate(returns: np.ndarray, confidence: float) -> None:
    array = np.asarray(returns, dtype=float)
    if array.size < 2:
        raise ValueError("at least two observations are required to estimate VaR")
    if not np.isfinite(array).all():
        raise ValueError("return series contains non-finite values")
    if not 0.0 < confidence < 1.0:
        raise ValueError("confidence must lie strictly between 0 and 1")
