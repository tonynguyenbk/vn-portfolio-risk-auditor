/**
 * Shape of every analytical payload the UI renders.
 *
 * This mirrors the response contract in PRD section 16.3. It is defined in
 * Phase 1 deliberately: the dashboard is built against this contract first, so
 * the Phase 2/3 Python backend has a fixed target to satisfy rather than the
 * other way round.
 *
 * Deviation from PRD 16.3: field names are camelCase here instead of the
 * snake_case shown in the spec. The backend will emit camelCase via a Pydantic
 * alias generator so that a single convention holds end to end and no mapping
 * layer is needed.
 *
 * Convention notes (PRD 21.3 requires these to be explicit):
 *  - All rates, returns and risk figures are DECIMALS, not percentages.
 *    0.0214 means 2.14%. Formatting happens in the frontend only.
 *  - Losses and VaR/ES are POSITIVE magnitudes. A VaR of 0.0214 is a 2.14%
 *    loss threshold.
 *  - Drawdown is NEGATIVE. -0.183 is an 18.3% decline from the prior peak.
 *  - Dates are ISO `YYYY-MM-DD`.
 *  - A metric that cannot be computed is `null`, never 0.
 */

export type DataStatus = "pass" | "warning" | "fail";
export type LimitStatus = "within_limit" | "warning" | "breach";
export type VarModel = "historical" | "parametric_normal" | "ewma_normal";
export type ConfidenceLevel = 0.95 | 0.99;

export const MODEL_LABELS: Record<VarModel, string> = {
  historical: "Historical Simulation",
  parametric_normal: "Parametric Normal",
  ewma_normal: "EWMA Normal",
};

export interface AnalysisMetadata {
  datasetName: string;
  /** Drives the "Simulated data" labelling required by PRD 0.8. */
  isSimulated: boolean;
  startDate: string;
  endDate: string;
  observations: number;
  assets: number;
}

export interface DataQualityIssue {
  code: string;
  message: string;
  severity: "warning" | "breach";
}

export interface DataQuality {
  status: DataStatus;
  warnings: DataQualityIssue[];
  rowsRemoved: number;
  duplicateRecords: number;
  alignedObservations: number;
  weightTotal: number;
}

export interface AssetWeight {
  ticker: string;
  weight: number;
  sector: string;
}

export interface SectorWeight {
  sector: string;
  weight: number;
}

export interface CurvePoint {
  date: string;
  value: number;
}

export interface PortfolioBlock {
  weights: AssetWeight[];
  sectorWeights: SectorWeight[];
  wealthCurve: CurvePoint[];
  benchmarkCurve: CurvePoint[] | null;
  drawdownCurve: CurvePoint[];
}

export interface VarEstimate {
  model: VarModel;
  confidence: ConfidenceLevel;
  /** Positive loss magnitude, decimal. */
  value: number;
}

export interface ExpectedShortfallEstimate {
  confidence: ConfidenceLevel;
  value: number;
}

export interface DrawdownDetail {
  value: number;
  peakDate: string;
  troughDate: string;
}

export interface Metrics {
  annualisedVolatility: number;
  maximumDrawdown: DrawdownDetail;
  var: VarEstimate[];
  expectedShortfall: ExpectedShortfallEstimate[];
}

export interface Concentration {
  largestWeight: number;
  largestWeightTicker: string;
  largestSectorWeight: number;
  largestSectorName: string;
  hhi: number;
}

export interface RiskContribution {
  ticker: string;
  weight: number;
  /** Component contribution to portfolio volatility, in volatility units. */
  contribution: number;
  /** Share of total portfolio volatility. Should sum to ~1 across assets. */
  contributionPct: number;
  breachesLimit: boolean;
}

export interface CorrelationMatrix {
  tickers: string[];
  matrix: number[][];
}

export interface LimitWarning {
  code: string;
  message: string;
  severity: "warning" | "breach";
}

export interface LimitsBlock {
  status: LimitStatus;
  warnings: LimitWarning[];
}

/**
 * Every analytical response must carry the assumptions used to produce it
 * (PRD 0.9 and 16.4). The UI renders these next to the numbers.
 */
export interface Assumptions {
  rollingWindow: number;
  forecastHorizonDays: number;
  ewmaLambda: number;
  tradingDaysPerYear: number;
  quantileMethod: string;
  returnType: "log";
  weightsFixed: boolean;
  priceBasis: "close" | "adjusted_close";
}

export interface AnalysisResult {
  metadata: AnalysisMetadata;
  dataQuality: DataQuality;
  portfolio: PortfolioBlock;
  metrics: Metrics;
  /** Null when the analysis could not derive it (PRD 16.4). */
  concentration: Concentration | null;
  riskContribution: RiskContribution[];
  correlation: CorrelationMatrix | null;
  limits: LimitsBlock;
  assumptions: Assumptions;
}

/** Backtest series point, used by the Model Audit VaR-vs-loss chart. */
export interface BacktestPoint {
  date: string;
  /** Realised loss, positive magnitude. */
  loss: number;
  varThreshold: number;
  isException: boolean;
}

export interface BacktestSummaryRow {
  model: VarModel;
  confidence: ConfidenceLevel;
  observations: number;
  expectedExceptions: number;
  actualExceptions: number;
  exceptionRate: number;
  averageVar: number;
  meanExceptionSeverity: number;
  kupiecLr: number;
  kupiecPValue: number;
  result: "pass" | "fail";
}

export interface BacktestResult {
  /** Series for the primary model/confidence pair, used by the exception chart. */
  series: BacktestPoint[];
  summary: BacktestSummaryRow[];
  assumptions: Assumptions;
}

/** User-controlled analysis parameters (PRD 10.1). */
export interface AnalysisParams {
  dataset: "demo" | "upload";
  confidence: ConfidenceLevel;
  rollingWindow: number;
  models: VarModel[];
  ewmaLambda: number;
  benchmark: string;
  notionalValue: number | null;
  startDate: string;
  endDate: string;
}

export interface RiskLimits {
  maxVar95Pct: number;
  maxSingleAssetWeight: number;
  maxSectorWeight: number;
  maxStressLossPct: number;
  testSignificance: number;
}
