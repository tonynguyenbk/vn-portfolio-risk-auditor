import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS, demoAnalysis, demoBacktest, demoManifest } from "@/lib/demo-data";
import { downsample } from "@/lib/chart-utils";

/**
 * Contract tests over the precomputed payload.
 *
 * The numerical correctness of these figures is established by the Python
 * suite in `backend/tests/`, which is where the engine lives. What these check
 * is that the artefact the dashboard actually imports has the shape, signs and
 * internal consistency the UI assumes — the failure mode being a payload
 * regenerated from changed code that no longer matches what the components
 * expect.
 */

describe("demo manifest", () => {
  it("records the seed so the dataset can be reproduced", () => {
    expect(demoManifest.seed).toBe(42);
    expect(demoManifest.isSimulated).toBe(true);
  });

  it("covers the five demonstration assets plus the benchmark", () => {
    expect(demoManifest.tickers).toHaveLength(6);
    expect(demoManifest.tickers).toContain("VNINDEX");
  });
});

describe("analysis payload", () => {
  it("is labelled as simulated so the UI can never present it as real data", () => {
    expect(demoAnalysis.metadata.isSimulated).toBe(true);
  });

  it("carries portfolio weights that sum to one within tolerance", () => {
    const total = demoAnalysis.portfolio.weights.reduce((acc, w) => acc + w.weight, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("decomposes volatility into contributions that sum to the whole", () => {
    const total = demoAnalysis.riskContribution.reduce(
      (acc, row) => acc + row.contributionPct,
      0,
    );
    expect(total).toBeCloseTo(1, 6);
  });

  it("reports VaR and Expected Shortfall as positive loss magnitudes", () => {
    for (const estimate of demoAnalysis.metrics.var) {
      expect(estimate.value).toBeGreaterThan(0);
    }
    for (const estimate of demoAnalysis.metrics.expectedShortfall) {
      expect(estimate.value).toBeGreaterThan(0);
    }
  });

  it("never reports a smaller VaR at higher confidence for the same model", () => {
    const models = ["historical", "parametric_normal", "ewma_normal"] as const;
    for (const model of models) {
      const at95 = demoAnalysis.metrics.var.find(
        (v) => v.model === model && v.confidence === 0.95,
      );
      const at99 = demoAnalysis.metrics.var.find(
        (v) => v.model === model && v.confidence === 0.99,
      );
      expect(at95).toBeDefined();
      expect(at99).toBeDefined();
      expect(at99!.value).toBeGreaterThanOrEqual(at95!.value);
    }
  });

  it("reports Expected Shortfall at least as large as VaR", () => {
    for (const es of demoAnalysis.metrics.expectedShortfall) {
      const matching = demoAnalysis.metrics.var.find(
        (v) => v.model === "historical" && v.confidence === es.confidence,
      );
      expect(es.value).toBeGreaterThanOrEqual(matching!.value);
    }
  });

  it("reports maximum drawdown as a negative value with ordered peak and trough", () => {
    const mdd = demoAnalysis.metrics.maximumDrawdown;
    expect(mdd.value).toBeLessThan(0);
    expect(mdd.peakDate <= mdd.troughDate).toBe(true);
  });

  it("starts the wealth curve at the normalised base of 100", () => {
    expect(demoAnalysis.portfolio.wealthCurve[0].value).toBeCloseTo(100, 6);
  });

  it("keeps every drawdown at or below zero", () => {
    for (const point of demoAnalysis.portfolio.drawdownCurve) {
      expect(point.value).toBeLessThanOrEqual(1e-9);
    }
  });

  it("has a symmetric correlation matrix with a unit diagonal", () => {
    const correlation = demoAnalysis.correlation;
    expect(correlation).not.toBeNull();
    const { matrix } = correlation!;

    for (let i = 0; i < matrix.length; i++) {
      expect(matrix[i][i]).toBeCloseTo(1, 9);
      for (let j = 0; j < matrix.length; j++) {
        expect(matrix[i][j]).toBeCloseTo(matrix[j][i], 12);
        expect(matrix[i][j]).toBeGreaterThanOrEqual(-1);
        expect(matrix[i][j]).toBeLessThanOrEqual(1);
      }
    }
  });

  it("states the assumptions that produced the numbers", () => {
    const { assumptions } = demoAnalysis;
    expect(assumptions.rollingWindow).toBe(250);
    expect(assumptions.tradingDaysPerYear).toBe(252);
    expect(assumptions.returnType).toBe("log");
    expect(assumptions.weightsFixed).toBe(true);
  });

  it("flags a limit breach consistently with the reported VaR", () => {
    const var95 = demoAnalysis.metrics.var.find(
      (v) => v.model === "historical" && v.confidence === 0.95,
    )!;
    const breached = var95.value > DEFAULT_LIMITS.maxVar95Pct;
    const reported = demoAnalysis.limits.warnings.some((w) => w.code === "VAR_95_LIMIT");
    expect(reported).toBe(breached);
  });
});

describe("backtest payload", () => {
  it("produces exactly N minus window walk-forward forecasts", () => {
    // Returns lose one observation relative to prices, hence the extra -1.
    const expected =
      demoAnalysis.metadata.observations - 1 - demoBacktest.assumptions.rollingWindow;
    expect(demoBacktest.series).toHaveLength(expected);
  });

  it("flags an exception exactly when the loss exceeds its own threshold", () => {
    for (const point of demoBacktest.series) {
      expect(point.isException).toBe(point.loss > point.varThreshold);
    }
  });

  it("scores every model and confidence pair over the same number of days", () => {
    expect(demoBacktest.summary).toHaveLength(6);
    const counts = new Set(demoBacktest.summary.map((row) => row.observations));
    expect(counts.size).toBe(1);
  });

  it("keeps Kupiec statistics and p-values in valid ranges", () => {
    for (const row of demoBacktest.summary) {
      expect(row.kupiecLr).toBeGreaterThanOrEqual(0);
      expect(row.kupiecPValue).toBeGreaterThanOrEqual(0);
      expect(row.kupiecPValue).toBeLessThanOrEqual(1);
      expect(row.actualExceptions).toBeLessThanOrEqual(row.observations);
    }
  });

  it("agrees between the Kupiec verdict and the significance threshold", () => {
    for (const row of demoBacktest.summary) {
      const expected =
        row.kupiecPValue < DEFAULT_LIMITS.testSignificance ? "fail" : "pass";
      expect(row.result).toBe(expected);
    }
  });

  it("derives the exception rate from the counts it reports", () => {
    for (const row of demoBacktest.summary) {
      expect(row.exceptionRate).toBeCloseTo(row.actualExceptions / row.observations, 10);
    }
  });
});

describe("downsample", () => {
  it("leaves a short series untouched", () => {
    const points = [1, 2, 3];
    expect(downsample(points, 10)).toBe(points);
  });

  it("reduces a long series to about the requested size", () => {
    const points = Array.from({ length: 2000 }, (_, i) => i);
    const result = downsample(points, 400);
    expect(result.length).toBeLessThanOrEqual(401);
    expect(result.length).toBeGreaterThan(300);
  });

  it("always keeps the final point so the series ends on its real last date", () => {
    const points = Array.from({ length: 1001 }, (_, i) => i);
    const result = downsample(points, 100);
    expect(result[result.length - 1]).toBe(1000);
  });
});
