/**
 * Client for the Python risk engine.
 *
 * Only used for *uploaded* portfolios. The bundled demonstration is
 * precomputed and imported at build time, so the page a first-time visitor
 * lands on never touches this module — which is what lets the site work while
 * the API is asleep on a free tier.
 *
 * The base URL comes from `NEXT_PUBLIC_API_URL` so that moving the backend
 * between hosts is a configuration change rather than a code change. Empty by
 * default, meaning same-origin `/api/v1/...`.
 */

import type {
  AnalysisParams,
  AnalysisResult,
  BacktestResult,
  RiskLimits,
  StressResult,
} from "@/types/analysis";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** How long to wait before giving up. Generous: a cold serverless start is slow. */
const REQUEST_TIMEOUT_MS = 60_000;

export interface ApiErrorDetail {
  code: string;
  message: string;
  issues?: { code: string; message: string; severity: string }[];
}

/**
 * An error carrying the structured code the API returns (PRD 16.4), so the UI
 * can react to *what* failed rather than pattern-matching a message.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly issues: { code: string; message: string; severity: string }[];

  constructor(status: number, detail: ApiErrorDetail) {
    super(detail.message);
    this.name = "ApiError";
    this.status = status;
    this.code = detail.code;
    this.issues = detail.issues ?? [];
  }
}

export const OFFLINE_MESSAGE =
  "Could not reach the analysis service. The bundled demonstration is unaffected — " +
  "it is precomputed and does not depend on the service being available.";

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...init, signal: controller.signal });
  } catch (cause) {
    // Network failure, CORS rejection, or the timeout above. PRD 20.3 requires
    // backend unavailability to produce a recoverable message rather than a
    // stack trace.
    throw new ApiError(0, {
      code: cause instanceof Error && cause.name === "AbortError" ? "TIMEOUT" : "OFFLINE",
      message: OFFLINE_MESSAGE,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let detail: ApiErrorDetail = {
      code: "UNKNOWN",
      message: `The service responded with ${response.status}.`,
    };
    try {
      const body = await response.json();
      if (body?.detail && typeof body.detail === "object") detail = body.detail;
    } catch {
      // A non-JSON error body leaves the fallback above in place.
    }
    throw new ApiError(response.status, detail);
  }

  return (await response.json()) as T;
}

function analysisFormData(
  marketFile: File,
  portfolioFile: File,
  params: AnalysisParams,
  limits: RiskLimits,
): FormData {
  const form = new FormData();
  form.append("market_file", marketFile);
  form.append("portfolio_file", portfolioFile);
  form.append(
    "config_json",
    JSON.stringify({
      rollingWindow: params.rollingWindow,
      confidenceLevels: [0.95, 0.99],
      models: params.models,
      ewmaLambda: params.ewmaLambda,
      benchmarkTicker: params.benchmark || null,
      notionalValue: params.notionalValue,
    }),
  );
  form.append("limits_json", JSON.stringify(limits));
  return form;
}

export async function checkHealth(): Promise<boolean> {
  try {
    await request<{ status: string }>("/api/v1/health", { method: "GET" });
    return true;
  } catch {
    return false;
  }
}

export function analyse(
  marketFile: File,
  portfolioFile: File,
  params: AnalysisParams,
  limits: RiskLimits,
): Promise<AnalysisResult> {
  return request<AnalysisResult>("/api/v1/analyse", {
    method: "POST",
    body: analysisFormData(marketFile, portfolioFile, params, limits),
  });
}

export function backtest(
  marketFile: File,
  portfolioFile: File,
  params: AnalysisParams,
  limits: RiskLimits,
): Promise<BacktestResult> {
  return request<BacktestResult>("/api/v1/backtest", {
    method: "POST",
    body: analysisFormData(marketFile, portfolioFile, params, limits),
  });
}

export function stressTest(
  weights: { ticker: string; weight: number; sector: string }[],
  shocks: Record<string, number>,
  stressLimit: number,
  notionalValue: number | null,
): Promise<StressResult> {
  return request<StressResult>("/api/v1/stress-test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      weights,
      scenario: { type: "custom", name: "Custom adverse scenario", shocks },
      stressLimit,
      notionalValue,
    }),
  });
}
