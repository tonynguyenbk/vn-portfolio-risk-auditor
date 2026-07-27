"""Analytical payload schemas.

These mirror ``frontend/types/analysis.ts`` field for field. When one changes,
the other must change with it.

Conventions enforced here (PRD 21.3 requires them to be explicit):
  * rates, returns and risk figures are DECIMALS, never percentages;
  * losses, VaR and Expected Shortfall are POSITIVE magnitudes;
  * drawdown is NEGATIVE;
  * dates are ISO ``YYYY-MM-DD``;
  * a metric that cannot be computed is ``None``, never ``0``.
"""

from datetime import date
from enum import StrEnum

from pydantic import Field

from app.schemas.common import CamelModel


class DataStatus(StrEnum):
    PASS = "pass"
    WARNING = "warning"
    FAIL = "fail"


class LimitStatus(StrEnum):
    WITHIN_LIMIT = "within_limit"
    WARNING = "warning"
    BREACH = "breach"


class VarModel(StrEnum):
    HISTORICAL = "historical"
    PARAMETRIC_NORMAL = "parametric_normal"
    EWMA_NORMAL = "ewma_normal"


class Severity(StrEnum):
    WARNING = "warning"
    BREACH = "breach"


# --------------------------------------------------------------------------- #
# Inputs
# --------------------------------------------------------------------------- #


class AnalysisConfig(CamelModel):
    """Analysis configuration (PRD 8.3)."""

    start_date: date | None = None
    end_date: date | None = None
    rolling_window: int = Field(default=250, ge=20, le=2000)
    forecast_horizon_days: int = Field(default=1, ge=1, le=1)
    confidence_levels: list[float] = Field(default_factory=lambda: [0.95, 0.99])
    models: list[VarModel] = Field(
        default_factory=lambda: [
            VarModel.HISTORICAL,
            VarModel.PARAMETRIC_NORMAL,
            VarModel.EWMA_NORMAL,
        ]
    )
    ewma_lambda: float = Field(default=0.94, gt=0.0, lt=1.0)
    benchmark_ticker: str | None = "VNINDEX"
    # Optional. When present, monetary output is labelled a *simulated* notional
    # amount in the UI, never real capital (PRD 8.3).
    notional_value: float | None = Field(default=None, gt=0)


class RiskLimits(CamelModel):
    """User-defined demonstration thresholds (PRD 8.4).

    These are illustrative internal limits, not legal or regulatory rules.
    """

    max_var95_pct: float = Field(default=0.02, gt=0)
    max_single_asset_weight: float = Field(default=0.30, gt=0, le=1)
    max_sector_weight: float = Field(default=0.45, gt=0, le=1)
    max_stress_loss_pct: float = Field(default=0.08, gt=0)
    test_significance: float = Field(default=0.05, gt=0, lt=1)


# --------------------------------------------------------------------------- #
# Outputs
# --------------------------------------------------------------------------- #


class AnalysisMetadata(CamelModel):
    dataset_name: str
    is_simulated: bool
    start_date: date
    end_date: date
    observations: int
    assets: int


class DataQualityIssue(CamelModel):
    code: str
    message: str
    severity: Severity


class DataQuality(CamelModel):
    status: DataStatus
    warnings: list[DataQualityIssue] = Field(default_factory=list)
    rows_removed: int = 0
    duplicate_records: int = 0
    aligned_observations: int = 0
    weight_total: float


class AssetWeight(CamelModel):
    ticker: str
    weight: float
    sector: str


class SectorWeight(CamelModel):
    sector: str
    weight: float


class CurvePoint(CamelModel):
    date: date
    value: float


class PortfolioBlock(CamelModel):
    weights: list[AssetWeight]
    sector_weights: list[SectorWeight]
    wealth_curve: list[CurvePoint]
    benchmark_curve: list[CurvePoint] | None = None
    drawdown_curve: list[CurvePoint]


class DrawdownDetail(CamelModel):
    value: float
    peak_date: date
    trough_date: date


class VarEstimate(CamelModel):
    model: VarModel
    confidence: float
    value: float


class ExpectedShortfallEstimate(CamelModel):
    confidence: float
    value: float


class Metrics(CamelModel):
    annualised_volatility: float
    maximum_drawdown: DrawdownDetail
    var: list[VarEstimate] = Field(default_factory=list)
    expected_shortfall: list[ExpectedShortfallEstimate] = Field(default_factory=list)


class Concentration(CamelModel):
    largest_weight: float
    largest_weight_ticker: str
    largest_sector_weight: float
    largest_sector_name: str
    hhi: float


class RiskContribution(CamelModel):
    ticker: str
    weight: float
    contribution: float
    contribution_pct: float
    breaches_limit: bool


class CorrelationMatrix(CamelModel):
    tickers: list[str]
    matrix: list[list[float]]


class LimitWarning(CamelModel):
    code: str
    message: str
    severity: Severity


class LimitsBlock(CamelModel):
    status: LimitStatus
    warnings: list[LimitWarning] = Field(default_factory=list)


class Assumptions(CamelModel):
    """Shipped with every analytical response (PRD 0.9 and 16.4)."""

    rolling_window: int
    forecast_horizon_days: int
    ewma_lambda: float
    trading_days_per_year: int
    quantile_method: str
    return_type: str = "log"
    weights_fixed: bool = True
    price_basis: str


class AnalysisResult(CamelModel):
    metadata: AnalysisMetadata
    data_quality: DataQuality
    portfolio: PortfolioBlock
    metrics: Metrics
    concentration: Concentration | None = None
    risk_contribution: list[RiskContribution] = Field(default_factory=list)
    correlation: CorrelationMatrix | None = None
    limits: LimitsBlock
    assumptions: Assumptions


class BacktestPoint(CamelModel):
    date: date
    #: Realised loss, positive magnitude.
    loss: float
    var_threshold: float
    is_exception: bool


class BacktestSummaryRow(CamelModel):
    model: VarModel
    confidence: float
    observations: int
    expected_exceptions: float
    actual_exceptions: int
    exception_rate: float
    average_var: float
    #: Null when no exception occurred: the mean of an empty set is undefined,
    #: and zero would misreport "no breaches" as "costless breaches".
    mean_exception_severity: float | None
    kupiec_lr: float
    kupiec_p_value: float
    #: "pass" means the exception count is not statistically inconsistent with
    #: the target rate. It is not proof the model is correct (PRD 9.12).
    result: str


class BacktestResponse(CamelModel):
    #: Series for the primary model/confidence pair, used by the exception chart.
    series: list[BacktestPoint] = Field(default_factory=list)
    summary: list[BacktestSummaryRow] = Field(default_factory=list)
    assumptions: Assumptions


# --------------------------------------------------------------------------- #
# Stress testing (PRD 9.14, 11.7, 16.3)
# --------------------------------------------------------------------------- #


class ScenarioType(StrEnum):
    CUSTOM = "custom"
    HISTORICAL = "historical"


class StressScenario(CamelModel):
    type: ScenarioType = ScenarioType.CUSTOM
    name: str = "Custom adverse scenario"
    #: Return shock per ticker, e.g. {"ASSET_A": -0.05}. Custom scenarios only.
    shocks: dict[str, float] = Field(default_factory=dict)
    #: Interval to replay. Historical scenarios only.
    start_date: date | None = None
    end_date: date | None = None


class StressTestRequest(CamelModel):
    weights: list[AssetWeight]
    scenario: StressScenario
    notional_value: float | None = Field(default=None, gt=0)
    stress_limit: float = Field(default=0.08, gt=0)


class AssetImpact(CamelModel):
    ticker: str
    weight: float
    shock: float
    contribution: float


class StressTestResponse(CamelModel):
    scenario_name: str
    scenario_type: ScenarioType
    #: Total portfolio return under the scenario. Negative for a loss.
    portfolio_impact: float
    #: Positive loss magnitude; 0.0 when the scenario is not a loss.
    loss: float
    impacts: list[AssetImpact] = Field(default_factory=list)
    #: None when no asset contributed negatively.
    largest_contributor: str | None = None
    #: Labelled a *simulated* notional amount in the UI, never real capital.
    notional_impact: float | None = None
    stress_limit: float
    limit_status: LimitStatus
    period_start: date | None = None
    period_end: date | None = None


class HealthResponse(CamelModel):
    status: str
    version: str
