"""Analysis orchestration.

Turns a market file, a portfolio file and a configuration into the
:class:`AnalysisResult` the dashboard renders. The individual calculations live
in sibling modules; this one owns the order they happen in and the assembly of
the response.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from app.schemas.analysis import (
    AnalysisConfig,
    AnalysisMetadata,
    AnalysisResult,
    AssetWeight,
    Assumptions,
    Concentration,
    CorrelationMatrix,
    CurvePoint,
    DataQuality,
    DrawdownDetail,
    ExpectedShortfallEstimate,
    LimitsBlock,
    LimitStatus,
    LimitWarning,
    Metrics,
    PortfolioBlock,
    RiskContribution,
    RiskLimits,
    SectorWeight,
    Severity,
    VarEstimate,
    VarModel,
)
from app.services.data_validation import (
    ValidationReport,
    clean_market_frame,
    validate_history,
    validate_portfolio,
)
from app.services.expected_shortfall import historical_expected_shortfall
from app.services.portfolio_metrics import (
    TRADING_DAYS_PER_YEAR,
    annualised_volatility,
    herfindahl_hirschman_index,
    maximum_drawdown,
    sector_weights,
)
from app.services.returns import (
    align_on_common_dates,
    drawdown_curve,
    log_returns,
    pivot_long_prices,
    portfolio_returns,
    wealth_curve,
)
from app.services.risk_contribution import (
    correlation_from_covariance,
    covariance_matrix,
    risk_contributions,
)
from app.services.var_models import QUANTILE_METHOD_DESCRIPTION, estimate_var


class AnalysisBlockedError(Exception):
    """Raised when validation forbids the analysis from running (PRD 10.2)."""

    def __init__(self, report: ValidationReport) -> None:
        self.report = report
        messages = "; ".join(issue.message for issue in report.issues)
        super().__init__(messages or "the supplied data cannot support this analysis")


@dataclass
class AnalysisBundle:
    """The response, plus the intermediates the backtest endpoint reuses."""

    result: AnalysisResult
    portfolio_return_series: pd.Series
    asset_returns: pd.DataFrame


def run_analysis(
    market: pd.DataFrame,
    portfolio: pd.DataFrame,
    config: AnalysisConfig | None = None,
    limits: RiskLimits | None = None,
    dataset_name: str = "uploaded dataset",
    is_simulated: bool = False,
) -> AnalysisBundle:
    """Validate, compute and assemble a complete analysis."""
    config = config or AnalysisConfig()
    limits = limits or RiskLimits()
    report = ValidationReport()

    cleaned, rows_removed, duplicate_records = clean_market_frame(market)
    report.rows_removed = rows_removed
    report.duplicate_records = duplicate_records
    if duplicate_records:
        report.add(
            "DUPLICATE_RECORDS",
            f"{duplicate_records} duplicate (date, ticker) record(s) were removed, "
            "keeping the first occurrence of each.",
            Severity.WARNING,
        )

    portfolio = _normalise_portfolio(portfolio)
    validate_portfolio(portfolio, set(cleaned["ticker"]), report)
    if not report.can_run:
        raise AnalysisBlockedError(report)

    tickers = list(portfolio["ticker"])
    weights_map = dict(zip(portfolio["ticker"], portfolio["weight"], strict=True))

    wide = pivot_long_prices(cleaned)
    wide = _apply_date_range(wide, config)
    candidate_dates = len(wide)
    aligned = align_on_common_dates(wide, tickers)

    validate_history(len(aligned), candidate_dates, config.rolling_window, report)
    if not report.can_run:
        raise AnalysisBlockedError(report)

    asset_returns = log_returns(aligned)
    series = portfolio_returns(asset_returns, weights_map)

    wealth = wealth_curve(series)
    drawdowns = drawdown_curve(wealth)
    mdd = maximum_drawdown(wealth)

    benchmark_curve = _benchmark_curve(wide, config, aligned.index)

    covariance = covariance_matrix(asset_returns.to_numpy())
    weight_vector = np.array([weights_map[t] for t in tickers], dtype=float)
    contributions = risk_contributions(covariance, weight_vector, tickers)
    correlation = correlation_from_covariance(covariance)

    sectors = _sector_map(portfolio)
    sector_series = sector_weights(
        pd.Series(weight_vector, index=tickers),
        pd.Series([sectors[t] for t in tickers], index=tickers),
    )

    var_estimates = [
        VarEstimate(
            model=model,
            confidence=confidence,
            value=estimate_var(
                series.to_numpy(), model, confidence, config.ewma_lambda
            ),
        )
        for model in config.models
        for confidence in config.confidence_levels
    ]
    es_estimates = [
        ExpectedShortfallEstimate(
            confidence=confidence,
            value=historical_expected_shortfall(series.to_numpy(), confidence),
        )
        for confidence in config.confidence_levels
    ]

    largest_row = max(contributions, key=lambda row: row.weight)
    concentration = Concentration(
        largest_weight=largest_row.weight,
        largest_weight_ticker=largest_row.ticker,
        largest_sector_weight=float(sector_series.iloc[0]),
        largest_sector_name=str(sector_series.index[0]),
        hhi=herfindahl_hirschman_index(weight_vector),
    )

    limits_block = _evaluate_limits(
        var_estimates=var_estimates,
        weights=weights_map,
        sectors=sector_series,
        limits=limits,
    )

    result = AnalysisResult(
        metadata=AnalysisMetadata(
            dataset_name=dataset_name,
            is_simulated=is_simulated,
            start_date=pd.Timestamp(aligned.index[0]).date(),
            end_date=pd.Timestamp(aligned.index[-1]).date(),
            observations=len(aligned),
            assets=len(tickers),
        ),
        data_quality=DataQuality(
            status=report.status,
            warnings=report.issues,
            rows_removed=report.rows_removed,
            duplicate_records=report.duplicate_records,
            aligned_observations=report.aligned_observations,
            weight_total=report.weight_total,
        ),
        portfolio=PortfolioBlock(
            weights=[
                AssetWeight(ticker=t, weight=weights_map[t], sector=sectors[t])
                for t in tickers
            ],
            sector_weights=[
                SectorWeight(sector=str(name), weight=float(value))
                for name, value in sector_series.items()
            ],
            wealth_curve=_to_curve(wealth),
            benchmark_curve=benchmark_curve,
            drawdown_curve=_to_curve(drawdowns),
        ),
        metrics=Metrics(
            annualised_volatility=annualised_volatility(series),
            maximum_drawdown=DrawdownDetail(
                value=mdd.value,
                peak_date=mdd.peak_date,
                trough_date=mdd.trough_date,
            ),
            var=var_estimates,
            expected_shortfall=es_estimates,
        ),
        concentration=concentration,
        risk_contribution=[
            RiskContribution(
                ticker=row.ticker,
                weight=row.weight,
                contribution=row.contribution,
                contribution_pct=row.contribution_pct,
                breaches_limit=row.weight > limits.max_single_asset_weight,
            )
            for row in contributions
        ],
        correlation=CorrelationMatrix(
            tickers=tickers,
            matrix=[[float(v) for v in row] for row in correlation],
        ),
        limits=limits_block,
        assumptions=Assumptions(
            rolling_window=config.rolling_window,
            forecast_horizon_days=config.forecast_horizon_days,
            ewma_lambda=config.ewma_lambda,
            trading_days_per_year=TRADING_DAYS_PER_YEAR,
            quantile_method=QUANTILE_METHOD_DESCRIPTION,
            price_basis="close",
        ),
    )

    return AnalysisBundle(
        result=result,
        portfolio_return_series=series,
        asset_returns=asset_returns,
    )


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _normalise_portfolio(portfolio: pd.DataFrame) -> pd.DataFrame:
    frame = portfolio.copy()
    frame["ticker"] = frame["ticker"].astype("string").str.strip().str.upper()
    frame["weight"] = pd.to_numeric(frame["weight"], errors="coerce")
    if "sector" not in frame.columns:
        frame["sector"] = "Unclassified"
    frame["sector"] = frame["sector"].fillna("Unclassified").astype(str)
    return frame.reset_index(drop=True)


def _sector_map(portfolio: pd.DataFrame) -> dict[str, str]:
    return dict(zip(portfolio["ticker"], portfolio["sector"], strict=True))


def _apply_date_range(wide: pd.DataFrame, config: AnalysisConfig) -> pd.DataFrame:
    frame = wide
    if config.start_date is not None:
        frame = frame[frame.index >= pd.Timestamp(config.start_date)]
    if config.end_date is not None:
        frame = frame[frame.index <= pd.Timestamp(config.end_date)]
    return frame


def _benchmark_curve(
    wide: pd.DataFrame,
    config: AnalysisConfig,
    dates: pd.Index,
) -> list[CurvePoint] | None:
    """Normalised benchmark index, or ``None`` when it is unavailable.

    PRD 15.3 requires an absent benchmark to degrade gracefully rather than
    fail, so this returns ``None`` and the UI omits the comparison.
    """
    ticker = config.benchmark_ticker
    if not ticker or ticker not in wide.columns:
        return None

    prices = wide.loc[:, ticker].reindex(dates).dropna()
    if len(prices) < 2:
        return None

    returns = np.log(prices / prices.shift(1)).iloc[1:]
    return _to_curve(wealth_curve(returns))


def _to_curve(series: pd.Series) -> list[CurvePoint]:
    return [
        CurvePoint(date=pd.Timestamp(index).date(), value=float(value))
        for index, value in series.items()
    ]


def _lookup_var(estimates: list[VarEstimate], confidence: float) -> float | None:
    """Historical VaR at ``confidence``, falling back to any model at that level.

    Historical Simulation is the reference for limit checking because it makes
    no distributional assumption. If the user deselected it, any available
    model at the same confidence is used rather than skipping the check.

    Returns ``None`` only when nothing was estimated at that confidence level at
    all. Callers must treat that as "not assessed", never as "passed" — see
    :func:`_evaluate_limits`.
    """
    for estimate in estimates:
        if estimate.model is VarModel.HISTORICAL and estimate.confidence == confidence:
            return estimate.value
    for estimate in estimates:
        if estimate.confidence == confidence:
            return estimate.value
    return None


def _evaluate_limits(
    var_estimates: list[VarEstimate],
    weights: dict[str, float],
    sectors: pd.Series,
    limits: RiskLimits,
) -> LimitsBlock:
    """Compare results against the user-defined demonstration limits (PRD 8.4).

    The VaR lookup happens *inside* this function rather than at the call site,
    so a check cannot be skipped without this code knowing it was skipped.

    That distinction is the whole point. If the configured confidence levels do
    not include 95%, no VaR-95 figure exists, and reporting "within limit"
    would assert something the analysis never tested — the false-safety signal
    a risk tool must never emit. An unassessed limit therefore raises a warning
    of its own, and only a run in which every check was performed and passed can
    reach ``WITHIN_LIMIT``. It is the same distinction the project already makes
    about the Kupiec test: not rejecting is not the same as passing.
    """
    warnings: list[LimitWarning] = []

    var95 = _lookup_var(var_estimates, 0.95)

    if var95 is None:
        warnings.append(
            LimitWarning(
                code="VAR_95_NOT_ASSESSED",
                severity=Severity.WARNING,
                message=(
                    "The VaR 95% limit could not be checked because no model was "
                    "evaluated at 95% confidence. This is not a pass: the limit was "
                    "not tested. Include 0.95 in the confidence levels to enable it."
                ),
            )
        )
    elif var95 > limits.max_var95_pct:
        warnings.append(
            LimitWarning(
                code="VAR_95_LIMIT",
                severity=Severity.BREACH,
                message=(
                    f"One-day VaR 95% of {var95 * 100:.2f}% exceeds the user-defined "
                    f"limit of {limits.max_var95_pct * 100:.2f}%."
                ),
            )
        )

    for ticker, weight in weights.items():
        if weight > limits.max_single_asset_weight:
            warnings.append(
                LimitWarning(
                    code="SINGLE_ASSET_WEIGHT",
                    severity=Severity.WARNING,
                    message=(
                        f"{ticker} holds {weight * 100:.1f}% of the portfolio, above "
                        f"the {limits.max_single_asset_weight * 100:.0f}% single-asset "
                        "limit."
                    ),
                )
            )

    for sector, weight in sectors.items():
        if float(weight) > limits.max_sector_weight:
            warnings.append(
                LimitWarning(
                    code="SECTOR_WEIGHT",
                    severity=Severity.WARNING,
                    message=(
                        f"{sector} represents {float(weight) * 100:.1f}% of the "
                        f"portfolio, above the {limits.max_sector_weight * 100:.0f}% "
                        "sector limit."
                    ),
                )
            )

    if any(w.severity is Severity.BREACH for w in warnings):
        status = LimitStatus.BREACH
    elif warnings:
        status = LimitStatus.WARNING
    else:
        status = LimitStatus.WITHIN_LIMIT

    return LimitsBlock(status=status, warnings=warnings)
