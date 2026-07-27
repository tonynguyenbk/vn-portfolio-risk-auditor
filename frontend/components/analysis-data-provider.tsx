"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { ApiError, analyse, backtest } from "@/lib/api";
import { demoAnalysis, demoBacktest, demoStress } from "@/lib/demo-data";
import type {
  AnalysisParams,
  AnalysisResult,
  BacktestResult,
  HistoricalScenario,
  RiskLimits,
} from "@/types/analysis";

/**
 * Holds whichever analysis the dashboard is currently displaying.
 *
 * Seeded with the bundled demonstration, which is imported statically and so
 * is present in the very first render — no loading state, no request, nothing
 * to fail. Uploading a portfolio replaces it with a result from the live API.
 *
 * The seeded default is the reason a visitor never waits: the expensive path
 * exists only for people who bring their own data, and they have a reason to
 * tolerate a wait that a first-time reader does not.
 */

export type DataSource = "demo" | "upload";
export type UploadState = "idle" | "uploading" | "complete" | "error";

interface AnalysisDataContextValue {
  analysis: AnalysisResult;
  backtestResult: BacktestResult;
  scenarios: HistoricalScenario[];
  source: DataSource;
  uploadState: UploadState;
  /** Structured failure from the last upload attempt, if any. */
  error: ApiError | null;
  runUpload: (
    marketFile: File,
    portfolioFile: File,
    params: AnalysisParams,
    limits: RiskLimits,
  ) => Promise<void>;
  resetToDemo: () => void;
}

const AnalysisDataContext = createContext<AnalysisDataContextValue | null>(null);

export function AnalysisDataProvider({ children }: { children: React.ReactNode }) {
  const [analysis, setAnalysis] = useState<AnalysisResult>(demoAnalysis);
  const [backtestResult, setBacktestResult] = useState<BacktestResult>(demoBacktest);
  const [scenarios, setScenarios] = useState<HistoricalScenario[]>(demoStress.scenarios);
  const [source, setSource] = useState<DataSource>("demo");
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [error, setError] = useState<ApiError | null>(null);

  const runUpload = useCallback(
    async (
      marketFile: File,
      portfolioFile: File,
      params: AnalysisParams,
      limits: RiskLimits,
    ) => {
      setUploadState("uploading");
      setError(null);

      try {
        // Both requests re-parse the same files server-side. Combining them
        // would be faster, but keeping /analyse and /backtest separate matches
        // the API contract in PRD 16.3 and keeps a failure in the slower
        // backtest from discarding a completed analysis.
        const result = await analyse(marketFile, portfolioFile, params, limits);
        setAnalysis(result);
        setSource("upload");

        const backtested = await backtest(marketFile, portfolioFile, params, limits);
        setBacktestResult(backtested);

        // Historical scenarios are precomputed for the demo only; an uploaded
        // dataset has none until the user defines one, and showing the demo's
        // episodes against uploaded weights would be flatly wrong.
        setScenarios([]);
        setUploadState("complete");
      } catch (caught) {
        setError(
          caught instanceof ApiError
            ? caught
            : new ApiError(0, { code: "UNKNOWN", message: String(caught) }),
        );
        setUploadState("error");
      }
    },
    [],
  );

  const resetToDemo = useCallback(() => {
    setAnalysis(demoAnalysis);
    setBacktestResult(demoBacktest);
    setScenarios(demoStress.scenarios);
    setSource("demo");
    setUploadState("idle");
    setError(null);
  }, []);

  const value = useMemo(
    () => ({
      analysis,
      backtestResult,
      scenarios,
      source,
      uploadState,
      error,
      runUpload,
      resetToDemo,
    }),
    [analysis, backtestResult, scenarios, source, uploadState, error, runUpload, resetToDemo],
  );

  return (
    <AnalysisDataContext.Provider value={value}>{children}</AnalysisDataContext.Provider>
  );
}

export function useAnalysisData(): AnalysisDataContextValue {
  const ctx = useContext(AnalysisDataContext);
  if (!ctx) {
    throw new Error("useAnalysisData must be used inside AnalysisDataProvider");
  }
  return ctx;
}
