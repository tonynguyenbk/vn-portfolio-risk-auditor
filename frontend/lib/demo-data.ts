/**
 * The bundled demonstration analysis.
 *
 * Both files are produced by the Python engine — `backend/scripts/
 * precompute_demo_analysis.py` — running on the bundled real market data
 * (frozen by `backend/scripts/fetch_market_data.py`), and are
 * imported at build time so the demo renders from static HTML with no request
 * to the API. That is what keeps the deployed site instant and working even
 * when the backend is asleep on a free tier.
 *
 * The figures here are therefore real output of the real engine, not mock
 * values. What makes that safe rather than a way of freezing stale numbers is
 * that CI regenerates them and fails if anything would differ, so they cannot
 * drift away from the code that produced them.
 *
 * The casts are unavoidable: TypeScript infers literal types from imported
 * JSON (`"pass"` rather than `DataStatus`), so the payload is asserted against
 * the shared contract instead. The Python side is what actually guarantees the
 * shape, via the Pydantic models these types mirror.
 */

import analysisJson from "@/public/demo/analysis.json";
import backtestJson from "@/public/demo/backtest.json";
import manifestJson from "@/public/demo/manifest.json";
import stressJson from "@/public/demo/stress.json";
import type {
  AnalysisResult,
  BacktestResult,
  RiskLimits,
  StressBundle,
} from "@/types/analysis";

export const demoAnalysis = analysisJson as unknown as AnalysisResult;
export const demoBacktest = backtestJson as unknown as BacktestResult;
export const demoStress = stressJson as unknown as StressBundle;

export interface DemoManifest {
  generator: string;
  isSimulated: boolean;
  description: string;
  source: {
    provider: string;
    url: string;
    method: string;
    terms: string;
  };
  retrievalDate: string;
  adjustment: string;
  /** Requested period. */
  startDate: string;
  endDate: string;
  firstObservation: string;
  lastObservation: string;
  tradingDays: number;
  tickers: string[];
  benchmark: string;
  files: Record<string, string>;
}

export const demoManifest = manifestJson as unknown as DemoManifest;

/** What the bundled dataset is, in one line. Shown wherever the demo is labelled. */
export const DEMO_DATA_DESCRIPTION =
  "Real historical data (adjusted closes, source: Vietcap), 2015-01 → 2026-10";

/** The full label, including the disclaimer that must accompany it. */
export const DEMO_DATA_NOTICE = `${DEMO_DATA_DESCRIPTION}. Educational prototype — not investment advice.`;

/**
 * Demonstration risk limits (PRD 8.4). These are illustrative internal
 * thresholds a user would set, not legal or regulatory requirements, and they
 * match the defaults the backend applies.
 */
export const DEFAULT_LIMITS: RiskLimits = {
  maxVar95Pct: 0.02,
  maxSingleAssetWeight: 0.3,
  maxSectorWeight: 0.45,
  maxStressLossPct: 0.08,
  testSignificance: 0.05,
};
