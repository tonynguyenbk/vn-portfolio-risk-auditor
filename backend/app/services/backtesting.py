"""Walk-forward VaR backtesting (PRD 9.11, 7.4).

This module is where the project's central claim lives: that a risk model has
been *validated*, not merely *calculated*. Everything else measures risk; this
checks whether the measurement could be trusted.

The rule that makes it meaningful is temporal. To forecast day ``t`` the model
sees observations ``[t - window, t)`` and nothing else — never day ``t`` itself
and never anything after it. Slicing is deliberately explicit here rather than
vectorised, because a rolling-window helper that quietly includes the current
observation would inflate every model's apparent accuracy while leaving the
output looking entirely reasonable. That failure is invisible in the numbers
and obvious in the code, so the code is kept obvious.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import numpy as np
import pandas as pd

from app.schemas.analysis import VarModel
from app.services.kupiec import KupiecResult, kupiec_test
from app.services.var_models import DEFAULT_EWMA_LAMBDA, estimate_var


@dataclass(frozen=True)
class BacktestPoint:
    """One test day: what was forecast, what happened, and whether it breached."""

    date: date
    loss: float
    var_threshold: float
    is_exception: bool


@dataclass(frozen=True)
class BacktestResult:
    model: VarModel
    confidence: float
    series: list[BacktestPoint]
    kupiec: KupiecResult
    average_var: float
    #: ``None`` when nothing breached. Undefined, not zero — see below.
    mean_exception_severity: float | None

    @property
    def observations(self) -> int:
        return len(self.series)

    @property
    def exceptions(self) -> int:
        return self.kupiec.exceptions


def walk_forward_backtest(
    returns: pd.Series,
    model: VarModel,
    confidence: float,
    window: int,
    lambda_: float = DEFAULT_EWMA_LAMBDA,
    significance: float = 0.05,
) -> BacktestResult:
    """Roll a VaR model forward through a return series.

    Produces exactly ``len(returns) - window`` forecasts: the first ``window``
    observations are consumed to estimate the first one and are never scored.

    Args:
        returns: portfolio log returns, indexed by date.
        model: which estimator to roll forward.
        confidence: VaR confidence level.
        window: estimation window length in observations.
        lambda_: EWMA decay, ignored by the other two models.
        significance: significance level for the Kupiec decision.
    """
    if window < 2:
        raise ValueError("the estimation window must contain at least two observations")
    if len(returns) <= window:
        raise ValueError(
            f"{len(returns)} observations cannot support a {window}-observation "
            f"window; at least {window + 1} are required"
        )
    # A module whose entire contract is temporal ordering should check its own
    # precondition. Out-of-order input would still pair each loss with its own
    # forecast, so the result would look correct while the dates attached to it
    # were meaningless — and "prior observations" would no longer mean prior.
    if not returns.index.is_monotonic_increasing:
        raise ValueError(
            "the return series must be sorted by date; walk-forward validation is "
            "meaningless on an unordered index"
        )
    if returns.index.has_duplicates:
        raise ValueError("the return series contains duplicate dates")

    values = returns.to_numpy(dtype=float)
    index = returns.index
    series: list[BacktestPoint] = []

    for t in range(window, len(values)):
        # Strictly prior observations only. The upper bound is exclusive, so
        # values[t] cannot influence the forecast made for it.
        estimation_window = values[t - window : t]
        threshold = estimate_var(estimation_window, model, confidence, lambda_)

        realised_loss = -float(values[t])
        series.append(
            BacktestPoint(
                date=pd.Timestamp(index[t]).date(),
                loss=realised_loss,
                var_threshold=threshold,
                is_exception=realised_loss > threshold,
            )
        )

    exceptions = [point for point in series if point.is_exception]

    kupiec = kupiec_test(
        observations=len(series),
        exceptions=len(exceptions),
        confidence=confidence,
        significance=significance,
    )

    return BacktestResult(
        model=model,
        confidence=confidence,
        series=series,
        kupiec=kupiec,
        average_var=float(np.mean([p.var_threshold for p in series])),
        # Mean severity is the average loss *on exception days*. With no
        # exceptions there are no days to average, so the quantity does not
        # exist. Returning 0.0 would read as "the breaches were costless"
        # rather than "there were no breaches", and would drag any average
        # taken over this column toward zero (PRD 16.4: null, never 0).
        mean_exception_severity=(
            float(np.mean([p.loss for p in exceptions])) if exceptions else None
        ),
    )


def compare_models(
    returns: pd.Series,
    models: list[VarModel],
    confidence_levels: list[float],
    window: int,
    lambda_: float = DEFAULT_EWMA_LAMBDA,
    significance: float = 0.05,
) -> list[BacktestResult]:
    """Backtest every model/confidence pair.

    Returns results in input order. No ranking is applied: PRD 12 forbids
    selecting a model on any single criterion, and in particular forbids
    preferring whichever reports the smallest VaR.
    """
    return [
        walk_forward_backtest(returns, model, confidence, window, lambda_, significance)
        for model in models
        for confidence in confidence_levels
    ]
