"""Euler decomposition of portfolio volatility (PRD 9.10).

Answers "where does the risk come from", which is a different question from
"where is the money". A holding can be small and still dominate risk if it is
volatile and moves with everything else; a large holding can contribute little
if it diversifies the rest.

The decomposition works because portfolio volatility is homogeneous of degree
one in the weights, so Euler's theorem gives ``sum_i w_i * d(sigma_p)/d(w_i) =
sigma_p`` exactly. That identity is asserted in the tests rather than assumed.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class ContributionRow:
    ticker: str
    weight: float
    marginal_contribution: float
    contribution: float
    contribution_pct: float


def covariance_matrix(returns: np.ndarray) -> np.ndarray:
    """Sample covariance of asset returns, ``n - 1`` denominator.

    ``returns`` is observations x assets, matching a pandas frame's layout.
    """
    array = np.asarray(returns, dtype=float)
    if array.ndim != 2:
        raise ValueError("returns must be a two-dimensional observations x assets array")
    if array.shape[0] < 2:
        raise ValueError("at least two observations are required to estimate covariance")

    return np.cov(array, rowvar=False, ddof=1)


def correlation_from_covariance(covariance: np.ndarray) -> np.ndarray:
    """Convert a covariance matrix to correlations, clipped to [-1, 1].

    The clip absorbs floating-point overshoot on the diagonal; without it a
    perfectly correlated pair can serialise as 1.0000000000000002 and fail a
    downstream range check.
    """
    cov = np.asarray(covariance, dtype=float)
    deviations = np.sqrt(np.diag(cov))
    if np.any(deviations <= 0):
        raise ValueError("an asset has zero variance; correlation is undefined")

    correlation = cov / np.outer(deviations, deviations)
    return np.clip(correlation, -1.0, 1.0)


def portfolio_volatility(covariance: np.ndarray, weights: np.ndarray) -> float:
    """``sigma_p = sqrt(w' Sigma w)``."""
    cov = np.asarray(covariance, dtype=float)
    w = np.asarray(weights, dtype=float)
    _validate_shapes(cov, w)

    variance = float(w @ cov @ w)
    if variance < 0:
        # Only reachable through floating-point error on a near-singular matrix.
        variance = 0.0
    return float(np.sqrt(variance))


def risk_contributions(
    covariance: np.ndarray,
    weights: np.ndarray,
    tickers: list[str],
) -> list[ContributionRow]:
    """Marginal, component and percentage contributions to portfolio volatility.

    ``MRC_i = (Sigma w)_i / sigma_p``  -  effect of a small increase in weight i
    ``RC_i  = w_i * MRC_i``            -  component contribution, sums to sigma_p
    ``RC%_i = RC_i / sigma_p``         -  share of total, sums to 1
    """
    cov = np.asarray(covariance, dtype=float)
    w = np.asarray(weights, dtype=float)
    _validate_shapes(cov, w)

    if len(tickers) != w.size:
        raise ValueError("tickers and weights must have the same length")

    sigma_p = portfolio_volatility(cov, w)
    if sigma_p == 0.0:
        raise ValueError("portfolio volatility is zero; contributions are undefined")

    marginal = (cov @ w) / sigma_p
    component = w * marginal

    return [
        ContributionRow(
            ticker=tickers[i],
            weight=float(w[i]),
            marginal_contribution=float(marginal[i]),
            contribution=float(component[i]),
            contribution_pct=float(component[i] / sigma_p),
        )
        for i in range(w.size)
    ]


def _validate_shapes(covariance: np.ndarray, weights: np.ndarray) -> None:
    if covariance.ndim != 2 or covariance.shape[0] != covariance.shape[1]:
        raise ValueError("covariance must be a square matrix")
    if weights.ndim != 1:
        raise ValueError("weights must be a one-dimensional vector")
    if covariance.shape[0] != weights.size:
        raise ValueError(
            f"covariance is {covariance.shape[0]}x{covariance.shape[1]} but "
            f"{weights.size} weights were supplied"
        )
