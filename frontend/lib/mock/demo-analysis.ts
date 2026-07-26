/**
 * ============================================================================
 * PHASE 1 SCAFFOLDING - THROWAWAY MODULE
 * ============================================================================
 *
 * Deterministic demonstration data so the Institutional Midnight dashboard can
 * be built and reviewed before any numerical backend exists (PRD 22, Phase 1).
 *
 * This is NOT the project's risk engine. The real implementation is Python and
 * lives in `backend/app/services/` from Phase 2 onward. In Phase 3 this whole
 * file is deleted and the dashboard reads a precomputed JSON payload produced
 * by that engine. Nothing here should be treated as a reference implementation
 * or ported to Python: the formulas below are simplified for presentation and
 * carry none of the unit tests PRD 20.1 requires.
 *
 * Everything it produces is labelled "Educational prototype - Simulated data"
 * in the UI, per PRD 0.8.
 *
 * Reproducibility: seeded with 42 (PRD 8.6). Same seed in, same numbers out.
 */

import type {
  AnalysisResult,
  AssetWeight,
  BacktestPoint,
  BacktestSummaryRow,
  ConfidenceLevel,
  CurvePoint,
  LimitWarning,
  RiskContribution,
  RiskLimits,
  VarModel,
} from "@/types/analysis";
import { mulberry32, normalFrom } from "./rng";

const SEED = 42;
const START_DATE = "2018-01-01";
const END_DATE = "2025-12-31";
const TRADING_DAYS_PER_YEAR = 252;
const DEFAULT_WINDOW = 250;
const EWMA_LAMBDA = 0.94;

/** Standard normal quantiles for the two confidence levels PRD 4.1 fixes. */
const Z: Record<ConfidenceLevel, number> = {
  0.95: 1.6448536269514722,
  0.99: 2.3263478740408408,
};

/** Fictional tickers and weights taken from the PRD 8.2 example portfolio. */
const ASSETS = [
  { ticker: "ASSET_A", weight: 0.25, sector: "Technology", beta: 1.15, idioVol: 0.0110 },
  { ticker: "ASSET_B", weight: 0.25, sector: "Banking", beta: 1.30, idioVol: 0.0090 },
  { ticker: "ASSET_C", weight: 0.20, sector: "Consumer", beta: 0.85, idioVol: 0.0080 },
  { ticker: "ASSET_D", weight: 0.15, sector: "Materials", beta: 1.05, idioVol: 0.0125 },
  { ticker: "ASSET_E", weight: 0.15, sector: "Retail", beta: 0.95, idioVol: 0.0100 },
] as const;

export const DEFAULT_LIMITS: RiskLimits = {
  maxVar95Pct: 0.02,
  maxSingleAssetWeight: 0.3,
  maxSectorWeight: 0.45,
  maxStressLossPct: 0.08,
  testSignificance: 0.05,
};

// ---------------------------------------------------------------------------
// Small numeric helpers
// ---------------------------------------------------------------------------

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation (n-1 denominator). */
function stdev(xs: number[]): number {
  const m = mean(xs);
  const ss = xs.reduce((acc, x) => acc + (x - m) ** 2, 0);
  return Math.sqrt(ss / (xs.length - 1));
}

/**
 * Empirical quantile using linear interpolation between order statistics -
 * equivalent to numpy's default `method="linear"`. PRD 9.4 requires the
 * convention to be stated rather than left implicit.
 */
function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

/**
 * Complementary error function, Abramowitz & Stegun 7.1.26.
 * Used for the chi-squared(1) survival function: for one degree of freedom,
 * P(X > x) = erfc(sqrt(x / 2)), which avoids needing a stats library here.
 */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + z / 2);
  const ans =
    t *
    Math.exp(
      -z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
        t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
          t * (-0.82215223 + t * 0.17087277))))))))
    );
  return x >= 0 ? ans : 2 - ans;
}

function chiSquared1PValue(lr: number): number {
  if (!Number.isFinite(lr) || lr <= 0) return 1;
  return Math.min(1, Math.max(0, erfc(Math.sqrt(lr / 2))));
}

function businessDays(start: string, end: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * Reduce a long series for charting. Recharts degrades noticeably past a few
 * thousand points and the extra resolution is invisible at screen width.
 * The final point is always kept so the series ends on the real last date.
 */
export function downsample<T>(points: T[], maxPoints = 420): T[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const out = points.filter((_, i) => i % step === 0);
  const lastPoint = points[points.length - 1];
  if (out[out.length - 1] !== lastPoint) out.push(lastPoint);
  return out;
}

// ---------------------------------------------------------------------------
// Series generation
// ---------------------------------------------------------------------------

/**
 * A slow volatility cycle plus two stress windows, so the demo series shows
 * both calm and turbulent regimes. Without this the drawdown chart is a
 * featureless drift and the risk dashboard has nothing to display.
 */
function volatilityScale(t: number, total: number): number {
  const cycle = 1 + 0.35 * Math.sin((t / total) * Math.PI * 4);
  const stressA = t > total * 0.22 && t < total * 0.28 ? 2.8 : 1;
  const stressB = t > total * 0.63 && t < total * 0.71 ? 2.2 : 1;
  return cycle * stressA * stressB;
}

interface GeneratedSeries {
  dates: string[];
  /** assetReturns[assetIndex][t] */
  assetReturns: number[][];
  portfolioReturns: number[];
  benchmarkReturns: number[];
}

function generateSeries(): GeneratedSeries {
  const dates = businessDays(START_DATE, END_DATE);
  const rand = mulberry32(SEED);
  const n = dates.length;

  const assetReturns: number[][] = ASSETS.map(() => []);
  const portfolioReturns: number[] = [];
  const benchmarkReturns: number[] = [];

  const marketDrift = 0.00022;
  const marketVol = 0.0092;

  for (let t = 0; t < n; t++) {
    const scale = volatilityScale(t, n);
    const marketShock = normalFrom(rand) * marketVol * scale;
    const market = marketDrift + marketShock;
    benchmarkReturns.push(market);

    let portfolio = 0;
    for (let i = 0; i < ASSETS.length; i++) {
      const a = ASSETS[i];
      const idiosyncratic = normalFrom(rand) * a.idioVol * scale;
      const r = a.beta * market + idiosyncratic;
      assetReturns[i].push(r);
      portfolio += a.weight * r;
    }
    portfolioReturns.push(portfolio);
  }

  return { dates, assetReturns, portfolioReturns, benchmarkReturns };
}

/** W_t = W_{t-1} * exp(r_t), normalised to W_0 = 100 (PRD 9.1). */
function wealthCurve(dates: string[], returns: number[]): CurvePoint[] {
  const out: CurvePoint[] = [];
  let w = 100;
  for (let t = 0; t < returns.length; t++) {
    w *= Math.exp(returns[t]);
    out.push({ date: dates[t], value: w });
  }
  return out;
}

function drawdownSeries(wealth: CurvePoint[]): {
  curve: CurvePoint[];
  maxDrawdown: number;
  peakDate: string;
  troughDate: string;
} {
  const curve: CurvePoint[] = [];
  let peak = -Infinity;
  let peakDate = wealth[0]?.date ?? START_DATE;
  let worst = 0;
  let worstPeakDate = peakDate;
  let worstTroughDate = peakDate;

  for (const point of wealth) {
    if (point.value > peak) {
      peak = point.value;
      peakDate = point.date;
    }
    const dd = point.value / peak - 1;
    curve.push({ date: point.date, value: dd });
    if (dd < worst) {
      worst = dd;
      worstPeakDate = peakDate;
      worstTroughDate = point.date;
    }
  }

  return { curve, maxDrawdown: worst, peakDate: worstPeakDate, troughDate: worstTroughDate };
}

function covarianceMatrix(assetReturns: number[][]): number[][] {
  const k = assetReturns.length;
  const means = assetReturns.map(mean);
  const n = assetReturns[0].length;
  const cov: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));

  for (let i = 0; i < k; i++) {
    for (let j = i; j < k; j++) {
      let acc = 0;
      for (let t = 0; t < n; t++) {
        acc += (assetReturns[i][t] - means[i]) * (assetReturns[j][t] - means[j]);
      }
      const value = acc / (n - 1);
      cov[i][j] = value;
      cov[j][i] = value;
    }
  }
  return cov;
}

function correlationFromCovariance(cov: number[][]): number[][] {
  const sd = cov.map((row, i) => Math.sqrt(row[i]));
  return cov.map((row, i) => row.map((value, j) => value / (sd[i] * sd[j])));
}

/** Euler decomposition of portfolio volatility (PRD 9.10). */
function riskContributions(cov: number[][], weights: number[]): {
  contributions: RiskContribution[];
  portfolioVol: number;
} {
  const k = weights.length;
  const sigmaW = new Array(k).fill(0);
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) sigmaW[i] += cov[i][j] * weights[j];
  }
  const variance = weights.reduce((acc, w, i) => acc + w * sigmaW[i], 0);
  const portfolioVol = Math.sqrt(variance);

  const contributions = ASSETS.map((asset, i) => {
    const marginal = sigmaW[i] / portfolioVol;
    const contribution = weights[i] * marginal;
    return {
      ticker: asset.ticker,
      weight: weights[i],
      contribution,
      contributionPct: contribution / portfolioVol,
      breachesLimit: weights[i] > DEFAULT_LIMITS.maxSingleAssetWeight,
    };
  });

  return { contributions, portfolioVol };
}

// ---------------------------------------------------------------------------
// VaR models
// ---------------------------------------------------------------------------

/** Losses are positive magnitudes: L_t = -r_t (PRD 7.2). */
function toLosses(returns: number[]): number[] {
  return returns.map((r) => -r);
}

function historicalVar(losses: number[], confidence: number): number {
  return quantile([...losses].sort((a, b) => a - b), confidence);
}

function parametricVar(returns: number[], confidence: ConfidenceLevel): number {
  return -mean(returns) + Z[confidence] * stdev(returns);
}

/**
 * EWMA variance recursion, initialised from the sample variance of the window
 * (PRD 9.6 requires the initialisation to be stated).
 */
function ewmaVar(returns: number[], confidence: ConfidenceLevel, lambda = EWMA_LAMBDA): number {
  const mu = mean(returns);
  let variance = stdev(returns) ** 2;
  for (let t = 1; t < returns.length; t++) {
    variance = lambda * variance + (1 - lambda) * (returns[t - 1] - mu) ** 2;
  }
  return -mu + Z[confidence] * Math.sqrt(variance);
}

function varForModel(window: number[], model: VarModel, confidence: ConfidenceLevel): number {
  switch (model) {
    case "historical":
      return historicalVar(toLosses(window), confidence);
    case "parametric_normal":
      return parametricVar(window, confidence);
    case "ewma_normal":
      return ewmaVar(window, confidence);
  }
}

function expectedShortfall(losses: number[], varThreshold: number): number {
  const tail = losses.filter((l) => l >= varThreshold);
  // PRD 9.7 requires the empty-tail case to be handled explicitly rather than
  // silently returning NaN.
  if (tail.length === 0) return varThreshold;
  return mean(tail);
}

// ---------------------------------------------------------------------------
// Walk-forward backtest
// ---------------------------------------------------------------------------

/**
 * At each test date only observations strictly before it are used, which is
 * the temporal-ordering rule from PRD 7.4. The Python implementation in
 * Phase 4 is the one that gets the leakage tests; this exists so the chart has
 * exception markers to draw.
 */
function backtest(
  dates: string[],
  returns: number[],
  model: VarModel,
  confidence: ConfidenceLevel,
  window = DEFAULT_WINDOW,
): { series: BacktestPoint[]; summary: BacktestSummaryRow } {
  const series: BacktestPoint[] = [];

  for (let t = window; t < returns.length; t++) {
    const slice = returns.slice(t - window, t);
    const varThreshold = varForModel(slice, model, confidence);
    const loss = -returns[t];
    series.push({
      date: dates[t],
      loss,
      varThreshold,
      isException: loss > varThreshold,
    });
  }

  const observations = series.length;
  const exceptions = series.filter((p) => p.isException);
  const actual = exceptions.length;
  const p = 1 - confidence;
  const pHat = actual / observations;

  // Kupiec unconditional coverage, computed in log space (PRD 9.12).
  let lr = 0;
  if (actual > 0 && actual < observations) {
    const logL0 = (observations - actual) * Math.log(1 - p) + actual * Math.log(p);
    const logL1 =
      (observations - actual) * Math.log(1 - pHat) + actual * Math.log(pHat);
    lr = -2 * (logL0 - logL1);
  } else if (actual === 0) {
    lr = -2 * (observations * Math.log(1 - p));
  } else {
    lr = -2 * (observations * Math.log(p));
  }

  const pValue = chiSquared1PValue(lr);

  return {
    series,
    summary: {
      model,
      confidence,
      observations,
      expectedExceptions: observations * p,
      actualExceptions: actual,
      exceptionRate: pHat,
      averageVar: mean(series.map((s) => s.varThreshold)),
      meanExceptionSeverity: actual > 0 ? mean(exceptions.map((e) => e.loss)) : 0,
      kupiecLr: lr,
      kupiecPValue: pValue,
      result: pValue >= DEFAULT_LIMITS.testSignificance ? "pass" : "fail",
    },
  };
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

function buildLimitWarnings(
  var95: number,
  weights: AssetWeight[],
  sectorWeights: { sector: string; weight: number }[],
): LimitWarning[] {
  const warnings: LimitWarning[] = [];

  if (var95 > DEFAULT_LIMITS.maxVar95Pct) {
    warnings.push({
      code: "VAR_95_LIMIT",
      severity: "breach",
      message: `One-day VaR 95% of ${(var95 * 100).toFixed(2)}% exceeds the user-defined limit of ${(DEFAULT_LIMITS.maxVar95Pct * 100).toFixed(2)}%.`,
    });
  }

  for (const w of weights) {
    if (w.weight > DEFAULT_LIMITS.maxSingleAssetWeight) {
      warnings.push({
        code: "SINGLE_ASSET_WEIGHT",
        severity: "warning",
        message: `${w.ticker} holds ${(w.weight * 100).toFixed(1)}% of the portfolio, above the ${(DEFAULT_LIMITS.maxSingleAssetWeight * 100).toFixed(0)}% single-asset limit.`,
      });
    }
  }

  for (const s of sectorWeights) {
    if (s.weight > DEFAULT_LIMITS.maxSectorWeight) {
      warnings.push({
        code: "SECTOR_WEIGHT",
        severity: "warning",
        message: `${s.sector} represents ${(s.weight * 100).toFixed(1)}% of the portfolio, above the ${(DEFAULT_LIMITS.maxSectorWeight * 100).toFixed(0)}% sector limit.`,
      });
    }
  }

  return warnings;
}

export interface DemoBundle {
  analysis: AnalysisResult;
  backtestSeries: BacktestPoint[];
  backtestSummary: BacktestSummaryRow[];
  benchmarkCurve: CurvePoint[];
}

let cache: DemoBundle | null = null;

/**
 * Build (and memoise) the full demonstration payload. Memoisation matters:
 * the walk-forward backtest runs several thousand rolling estimates and the
 * dashboard would otherwise redo them on every render.
 */
export function getDemoBundle(): DemoBundle {
  if (cache) return cache;

  const { dates, assetReturns, portfolioReturns, benchmarkReturns } = generateSeries();
  const weights = ASSETS.map((a) => a.weight);

  const wealth = wealthCurve(dates, portfolioReturns);
  const benchmark = wealthCurve(dates, benchmarkReturns);
  const dd = drawdownSeries(wealth);

  const cov = covarianceMatrix(assetReturns);
  const correlation = correlationFromCovariance(cov);
  const { contributions } = riskContributions(cov, weights);

  const losses = toLosses(portfolioReturns);
  const sortedLosses = [...losses].sort((a, b) => a - b);
  const hsVar95 = quantile(sortedLosses, 0.95);
  const hsVar99 = quantile(sortedLosses, 0.99);

  const assetWeights: AssetWeight[] = ASSETS.map((a) => ({
    ticker: a.ticker,
    weight: a.weight,
    sector: a.sector,
  }));

  const sectorMap = new Map<string, number>();
  for (const a of ASSETS) {
    sectorMap.set(a.sector, (sectorMap.get(a.sector) ?? 0) + a.weight);
  }
  const sectorWeights = [...sectorMap.entries()]
    .map(([sector, weight]) => ({ sector, weight }))
    .sort((a, b) => b.weight - a.weight);

  const largest = [...assetWeights].sort((a, b) => b.weight - a.weight)[0];
  const hhi = assetWeights.reduce((acc, w) => acc + w.weight ** 2, 0);

  const warnings = buildLimitWarnings(hsVar95, assetWeights, sectorWeights);
  const hasBreach = warnings.some((w) => w.severity === "breach");

  // Only the default model/confidence pair is backtested in Phase 1. The full
  // three-model comparison arrives with the Python engine in Phase 4.
  const primary = backtest(dates, portfolioReturns, "historical", 0.95);
  const summaries = (["historical", "parametric_normal", "ewma_normal"] as VarModel[]).map(
    (model) => backtest(dates, portfolioReturns, model, 0.95).summary,
  );

  const analysis: AnalysisResult = {
    metadata: {
      datasetName: "Simulated demonstration portfolio",
      isSimulated: true,
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      observations: dates.length,
      assets: ASSETS.length,
    },
    dataQuality: {
      status: "pass",
      warnings: [],
      rowsRemoved: 0,
      duplicateRecords: 0,
      alignedObservations: dates.length,
      weightTotal: weights.reduce((a, b) => a + b, 0),
    },
    portfolio: {
      weights: assetWeights,
      sectorWeights,
      wealthCurve: wealth,
      benchmarkCurve: benchmark,
      drawdownCurve: dd.curve,
    },
    metrics: {
      annualisedVolatility: stdev(portfolioReturns) * Math.sqrt(TRADING_DAYS_PER_YEAR),
      maximumDrawdown: {
        value: dd.maxDrawdown,
        peakDate: dd.peakDate,
        troughDate: dd.troughDate,
      },
      var: [
        { model: "historical", confidence: 0.95, value: hsVar95 },
        { model: "historical", confidence: 0.99, value: hsVar99 },
        { model: "parametric_normal", confidence: 0.95, value: parametricVar(portfolioReturns, 0.95) },
        { model: "parametric_normal", confidence: 0.99, value: parametricVar(portfolioReturns, 0.99) },
        { model: "ewma_normal", confidence: 0.95, value: ewmaVar(portfolioReturns, 0.95) },
        { model: "ewma_normal", confidence: 0.99, value: ewmaVar(portfolioReturns, 0.99) },
      ],
      expectedShortfall: [
        { confidence: 0.95, value: expectedShortfall(losses, hsVar95) },
        { confidence: 0.99, value: expectedShortfall(losses, hsVar99) },
      ],
    },
    concentration: {
      largestWeight: largest.weight,
      largestWeightTicker: largest.ticker,
      largestSectorWeight: sectorWeights[0].weight,
      largestSectorName: sectorWeights[0].sector,
      hhi,
    },
    riskContribution: contributions,
    correlation: {
      tickers: ASSETS.map((a) => a.ticker),
      matrix: correlation,
    },
    limits: {
      status: hasBreach ? "breach" : warnings.length > 0 ? "warning" : "within_limit",
      warnings,
    },
    assumptions: {
      rollingWindow: DEFAULT_WINDOW,
      forecastHorizonDays: 1,
      ewmaLambda: EWMA_LAMBDA,
      tradingDaysPerYear: TRADING_DAYS_PER_YEAR,
      quantileMethod: "linear interpolation between order statistics",
      returnType: "log",
      weightsFixed: true,
      priceBasis: "close",
    },
  };

  cache = {
    analysis,
    backtestSeries: primary.series,
    backtestSummary: summaries,
    benchmarkCurve: benchmark,
  };
  return cache;
}
