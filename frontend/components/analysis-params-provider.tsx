"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { AnalysisParams, VarModel } from "@/types/analysis";

/**
 * Holds the user-controlled analysis parameters from PRD 10.1.
 *
 * The provider is mounted in the root layout, so the values survive navigation
 * between Overview / Model Audit / Stress Test / Report. That satisfies PRD
 * 15.1.7 ("preserve selected parameters when navigating between sections").
 *
 * Phase 1 keeps this in memory only. PRD 14.1 also asks for shareable section
 * state in the URL; syncing to search params is deferred to the phase that
 * introduces real analysis runs, so that a URL never encodes a result the
 * backend cannot reproduce.
 */

export type RunState = "idle" | "calculating" | "complete";

export const DEFAULT_PARAMS: AnalysisParams = {
  dataset: "demo",
  confidence: 0.95,
  rollingWindow: 250,
  models: ["historical", "parametric_normal", "ewma_normal"],
  ewmaLambda: 0.94,
  benchmark: "VNINDEX",
  notionalValue: null,
  startDate: "2018-01-01",
  endDate: "2025-12-31",
};

interface ValidationResult {
  /** Blocks `Run analysis` entirely (PRD 10.2). */
  errors: string[];
  /** Shown but does not block. */
  warnings: string[];
  canRun: boolean;
}

interface AnalysisParamsContextValue {
  params: AnalysisParams;
  setParams: (patch: Partial<AnalysisParams>) => void;
  toggleModel: (model: VarModel) => void;
  runState: RunState;
  runAnalysis: () => void;
  validation: ValidationResult;
}

const AnalysisParamsContext = createContext<AnalysisParamsContextValue | null>(null);

/** Observations available in the bundled demo dataset. */
const DEMO_OBSERVATIONS = 2087;

function validate(params: AnalysisParams): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (params.models.length === 0) {
    errors.push("Select at least one VaR model before running the analysis.");
  }

  // PRD 8.5: analysis is disabled below rolling_window + 1 observations, and
  // warns below rolling_window + 100.
  if (DEMO_OBSERVATIONS < params.rollingWindow + 1) {
    errors.push(
      `Only ${DEMO_OBSERVATIONS} aligned observations are available. At least ${params.rollingWindow + 1} are required for a ${params.rollingWindow}-day rolling analysis.`,
    );
  } else if (DEMO_OBSERVATIONS < params.rollingWindow + 100) {
    warnings.push(
      `${DEMO_OBSERVATIONS} observations leaves a short backtest sample for a ${params.rollingWindow}-day window. Results will be indicative only.`,
    );
  }

  if (params.ewmaLambda <= 0 || params.ewmaLambda >= 1) {
    errors.push("EWMA lambda must lie strictly between 0 and 1.");
  }

  if (params.notionalValue !== null && params.notionalValue <= 0) {
    errors.push("Simulated notional value must be greater than zero.");
  }

  return { errors, warnings, canRun: errors.length === 0 };
}

export function AnalysisParamsProvider({ children }: { children: React.ReactNode }) {
  const [params, setParamsState] = useState<AnalysisParams>(DEFAULT_PARAMS);
  const [runState, setRunState] = useState<RunState>("complete");

  const setParams = useCallback((patch: Partial<AnalysisParams>) => {
    setParamsState((prev) => ({ ...prev, ...patch }));
  }, []);

  const toggleModel = useCallback((model: VarModel) => {
    setParamsState((prev) => ({
      ...prev,
      models: prev.models.includes(model)
        ? prev.models.filter((m) => m !== model)
        : [...prev.models, model],
    }));
  }, []);

  const validation = useMemo(() => validate(params), [params]);

  const runAnalysis = useCallback(() => {
    if (!validation.canRun) return;
    // Phase 1 renders precomputed demonstration data, so this only exercises
    // the progress state described in PRD 15.1.5. The real request lands in
    // Phase 3.
    setRunState("calculating");
    window.setTimeout(() => setRunState("complete"), 550);
  }, [validation.canRun]);

  const value = useMemo(
    () => ({ params, setParams, toggleModel, runState, runAnalysis, validation }),
    [params, setParams, toggleModel, runState, runAnalysis, validation],
  );

  return (
    <AnalysisParamsContext.Provider value={value}>
      {children}
    </AnalysisParamsContext.Provider>
  );
}

export function useAnalysisParams(): AnalysisParamsContextValue {
  const ctx = useContext(AnalysisParamsContext);
  if (!ctx) {
    throw new Error("useAnalysisParams must be used inside AnalysisParamsProvider");
  }
  return ctx;
}
