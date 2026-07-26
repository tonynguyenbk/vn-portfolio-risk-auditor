import { describe, expect, it } from "vitest";
import { getDemoBundle } from "@/lib/mock/demo-analysis";
import { mulberry32 } from "@/lib/mock/rng";

/**
 * These check structural invariants of the Phase 1 demonstration payload, not
 * the correctness of a risk engine. The engine is Python and gets its own
 * tests from Phase 2 (PRD 20.1); what matters here is that the dashboard is
 * fed self-consistent, reproducible, correctly-signed values.
 */

describe("deterministic generator", () => {
  it("produces an identical sequence for the same seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const first = Array.from({ length: 20 }, () => a());
    const second = Array.from({ length: 20 }, () => b());
    expect(first).toEqual(second);
  });

  it("produces a different sequence for a different seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(43);
    expect(a()).not.toBe(b());
  });
});

describe("demo analysis payload", () => {
  const { analysis, backtestSeries, backtestSummary } = getDemoBundle();

  it("is labelled as simulated so the UI can never present it as real data", () => {
    expect(analysis.metadata.isSimulated).toBe(true);
  });

  it("carries portfolio weights that sum to one within tolerance", () => {
    const total = analysis.portfolio.weights.reduce((acc, w) => acc + w.weight, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("decomposes volatility into contributions that sum to the whole", () => {
    // The Euler decomposition requires sum(RC_i) = sigma_p, so the percentage
    // shares must sum to 1 (PRD 9.10).
    const total = analysis.riskContribution.reduce((acc, r) => acc + r.contributionPct, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("reports VaR and Expected Shortfall as positive loss magnitudes", () => {
    for (const estimate of analysis.metrics.var) {
      expect(estimate.value).toBeGreaterThan(0);
    }
    for (const estimate of analysis.metrics.expectedShortfall) {
      expect(estimate.value).toBeGreaterThan(0);
    }
  });

  it("never reports a smaller VaR at higher confidence for the same model", () => {
    const models = ["historical", "parametric_normal", "ewma_normal"] as const;
    for (const model of models) {
      const at95 = analysis.metrics.var.find(
        (v) => v.model === model && v.confidence === 0.95,
      )!;
      const at99 = analysis.metrics.var.find(
        (v) => v.model === model && v.confidence === 0.99,
      )!;
      expect(at99.value).toBeGreaterThanOrEqual(at95.value);
    }
  });

  it("reports Expected Shortfall at least as large as VaR", () => {
    const var95 = analysis.metrics.var.find(
      (v) => v.model === "historical" && v.confidence === 0.95,
    )!;
    const es95 = analysis.metrics.expectedShortfall.find((e) => e.confidence === 0.95)!;
    expect(es95.value).toBeGreaterThanOrEqual(var95.value);
  });

  it("reports maximum drawdown as a negative value with ordered peak and trough", () => {
    const mdd = analysis.metrics.maximumDrawdown;
    expect(mdd.value).toBeLessThan(0);
    expect(mdd.peakDate <= mdd.troughDate).toBe(true);
  });

  it("has a symmetric correlation matrix with a unit diagonal", () => {
    const { matrix } = analysis.correlation;
    for (let i = 0; i < matrix.length; i++) {
      expect(matrix[i][i]).toBeCloseTo(1, 10);
      for (let j = 0; j < matrix.length; j++) {
        expect(matrix[i][j]).toBeCloseTo(matrix[j][i], 12);
        expect(matrix[i][j]).toBeGreaterThanOrEqual(-1.000001);
        expect(matrix[i][j]).toBeLessThanOrEqual(1.000001);
      }
    }
  });

  it("produces exactly N - window walk-forward forecasts", () => {
    const expected =
      analysis.metadata.observations - analysis.assumptions.rollingWindow;
    expect(backtestSeries.length).toBe(expected);
  });

  it("flags an exception exactly when the loss exceeds its own forecast threshold", () => {
    for (const point of backtestSeries) {
      expect(point.isException).toBe(point.loss > point.varThreshold);
    }
  });

  it("keeps Kupiec p-values inside the unit interval", () => {
    for (const row of backtestSummary) {
      expect(row.kupiecPValue).toBeGreaterThanOrEqual(0);
      expect(row.kupiecPValue).toBeLessThanOrEqual(1);
      expect(row.kupiecLr).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns a stable payload across calls, so the report matches the dashboard", () => {
    const again = getDemoBundle();
    expect(again.analysis.metrics.annualisedVolatility).toBe(
      analysis.metrics.annualisedVolatility,
    );
  });
});
