import { describe, expect, it } from "vitest";
import {
  backtestSeriesCsv,
  backtestSummaryCsv,
  metricsCsv,
  stressCsv,
} from "@/lib/csv-export";
import { demoAnalysis, demoBacktest, demoStress } from "@/lib/demo-data";

/**
 * PRD 22's exit condition for the reporting phase is that exported content
 * matches the on-screen analysis. These check that property directly: every
 * assertion compares a CSV field against the object the components render.
 */

function parse(csv: string): string[][] {
  return csv
    .split("\r\n")
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => line.split(","));
}

describe("metrics export", () => {
  const csv = metricsCsv(demoAnalysis);

  it("records the dataset and its simulated status in the header", () => {
    expect(csv).toContain("# Simulated data,true");
    expect(csv).toContain(demoAnalysis.metadata.datasetName);
  });

  it("states the assumptions needed to reproduce the figures", () => {
    expect(csv).toContain("# Rolling window,250");
    expect(csv).toContain("# Trading days per year,252");
    expect(csv).toContain("# Quantile method");
  });

  it("exports volatility as the same decimal the dashboard shows", () => {
    const row = parse(csv).find((r) => r[0] === "annualised_volatility");
    expect(Number(row![3])).toBe(demoAnalysis.metrics.annualisedVolatility);
  });

  it("exports drawdown as a negative decimal", () => {
    const row = parse(csv).find((r) => r[0] === "maximum_drawdown");
    expect(Number(row![3])).toBe(demoAnalysis.metrics.maximumDrawdown.value);
    expect(Number(row![3])).toBeLessThan(0);
  });

  it("exports one row per VaR estimate", () => {
    const rows = parse(csv).filter((r) => r[0] === "value_at_risk");
    expect(rows).toHaveLength(demoAnalysis.metrics.var.length);
  });

  it("exports risk contributions that still sum to one", () => {
    const rows = parse(csv).filter((r) =>
      demoAnalysis.riskContribution.some((c) => c.ticker === r[0]),
    );
    const total = rows.reduce((acc, r) => acc + Number(r[4]), 0);
    expect(total).toBeCloseTo(1, 6);
  });
});

describe("model audit export", () => {
  const csv = backtestSummaryCsv(demoAnalysis, demoBacktest);
  const rows = parse(csv);

  it("exports one row per model and confidence pair", () => {
    expect(rows).toHaveLength(demoBacktest.summary.length + 1); // + header row
  });

  it("carries the Kupiec verdict unchanged", () => {
    const body = rows.slice(1);
    for (const [i, row] of body.entries()) {
      expect(row[row.length - 1]).toBe(demoBacktest.summary[i].result);
    }
  });

  it("writes an undefined mean severity as empty rather than zero", () => {
    // A null must not become 0 on the way out; 0 would read as "costless
    // breaches" instead of "no breaches".
    const withNull = {
      ...demoBacktest,
      summary: [{ ...demoBacktest.summary[0], meanExceptionSeverity: null }],
    };
    const cells = parse(backtestSummaryCsv(demoAnalysis, withNull))[1];
    expect(cells[7]).toBe("");
  });
});

describe("backtest series export", () => {
  const csv = backtestSeriesCsv(demoAnalysis, demoBacktest);

  it("exports every test day", () => {
    expect(parse(csv)).toHaveLength(demoBacktest.series.length + 1);
  });

  it("keeps the exception flag consistent with the threshold comparison", () => {
    const body = parse(csv).slice(1);
    for (const row of body) {
      const [, loss, threshold, isException] = row;
      expect(isException).toBe(String(Number(loss) > Number(threshold)));
    }
  });
});

describe("stress export", () => {
  const csv = stressCsv(demoAnalysis, demoStress.scenarios);

  it("exports one row per asset per scenario", () => {
    const expected = demoStress.scenarios.reduce((acc, s) => acc + s.impacts.length, 0);
    expect(parse(csv)).toHaveLength(expected + 1);
  });

  it("carries the period each scenario replayed", () => {
    for (const scenario of demoStress.scenarios) {
      expect(csv).toContain(scenario.periodStart!);
    }
  });
});

describe("CSV escaping", () => {
  it("quotes a field containing a comma so columns do not shift", () => {
    const analysis = structuredClone(demoAnalysis);
    analysis.metadata.datasetName = "Portfolio, revised";
    expect(metricsCsv(analysis)).toContain('"Portfolio, revised"');
  });

  it("doubles embedded quotes per RFC 4180", () => {
    const analysis = structuredClone(demoAnalysis);
    analysis.portfolio.weights[0].sector = 'Banking "core"';
    expect(metricsCsv(analysis)).toContain('"Banking ""core"""');
  });
});
