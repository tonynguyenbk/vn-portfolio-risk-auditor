import { describe, expect, it } from "vitest";
import {
  alignPrices,
  covarianceMatrix,
  expectedShortfallAtFraction,
  historicalExpectedShortfall,
  historicalVar,
  maxEquityFraction,
  maximumDrawdown,
  normaliseWeights,
  parseMarketCsv,
  portfolioVolatility,
  quantileLinear,
  resetWeights,
  riskContributions,
  setWeight,
  worstWindowLoss,
} from "@/lib/what-if";

/**
 * Unit tests for the What-if arithmetic on hand-checkable inputs. Agreement
 * with the Python engine on realistic data is the job of
 * `what-if-parity.test.ts`.
 */

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("quantiles, VaR and Expected Shortfall", () => {
  // Losses 1..10 % in scrambled order; returns are their negatives.
  const losses = [0.03, 0.07, 0.01, 0.1, 0.05, 0.02, 0.09, 0.04, 0.08, 0.06];
  const returns = losses.map((l) => -l);

  it("interpolates linearly between order statistics, as NumPy does", () => {
    // h = (10 - 1) * 0.95 = 8.55 -> x[8] + 0.55 (x[9] - x[8]) = 0.09 + 0.0055
    expect(quantileLinear(losses, 0.95)).toBeCloseTo(0.0955, 15);
    expect(quantileLinear(losses, 0)).toBe(0.01);
    expect(quantileLinear(losses, 1)).toBe(0.1);
  });

  it("reports VaR as a positive loss and ES as the mean beyond it", () => {
    expect(historicalVar(returns, 0.95)).toBeCloseTo(0.0955, 15);
    // Only the 10% loss is at or beyond 9.55%.
    expect(historicalExpectedShortfall(returns, 0.95)).toBeCloseTo(0.1, 15);
    // h = 9 * 0.8 = 7.2 -> 0.08 + 0.2 * 0.01 = 0.082; tail {0.09, 0.10}.
    expect(historicalVar(returns, 0.8)).toBeCloseTo(0.082, 15);
    expect(historicalExpectedShortfall(returns, 0.8)).toBeCloseTo(0.095, 15);
  });

  it("never reports ES below VaR", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
    for (let trial = 0; trial < 20; trial++) {
      const series = Array.from({ length: 50 + trial * 13 }, () => rand() * 0.06);
      for (const c of [0.9, 0.95, 0.99]) {
        expect(historicalExpectedShortfall(series, c)!).toBeGreaterThanOrEqual(
          historicalVar(series, c)!,
        );
      }
    }
  });

  it("returns null rather than zero when there is too little data", () => {
    expect(historicalVar([0.01], 0.95)).toBeNull();
    expect(historicalExpectedShortfall([], 0.95)).toBeNull();
    expect(worstWindowLoss([0.01, 0.02], 5)).toBeNull();
    expect(maximumDrawdown([])).toBeNull();
  });
});

describe("path measures", () => {
  it("measures drawdown from the running peak, not the global one", () => {
    // 100 -> 120 -> 90 -> 150 -> 200: worst is -25% from the 120 peak.
    const wealth = [100, 120, 90, 150, 200];
    const r = wealth.slice(1).map((w, i) => Math.log(w / wealth[i]));
    expect(maximumDrawdown(r)).toBeCloseTo(-0.25, 12);
  });

  it("finds the worst run of consecutive days as a positive simple loss", () => {
    const r = [0.01, -0.02, -0.03, 0.0, -0.01, 0.02, 0.05];
    // Worst 3-day sum is -0.05 (days 1..3) -> 1 - e^-0.05.
    expect(worstWindowLoss(r, 3)).toBeCloseTo(1 - Math.exp(-0.05), 15);
  });
});

describe("Euler risk contribution", () => {
  const returns = [
    [0.01, 0.02, -0.01],
    [-0.02, -0.01, 0.0],
    [0.015, 0.005, 0.01],
    [-0.005, -0.02, 0.02],
    [0.0, 0.01, -0.015],
  ];
  const cov = covarianceMatrix(returns);
  const w = [0.5, 0.3, 0.2];

  it("sums component contributions exactly to portfolio volatility", () => {
    const rows = riskContributions(cov, w, ["A", "B", "C"])!;
    expect(sum(rows.map((r) => r.contribution))).toBeCloseTo(portfolioVolatility(cov, w), 15);
    expect(sum(rows.map((r) => r.contributionPct))).toBeCloseTo(1, 15);
  });

  it("leaves percentage shares unchanged when the equity fraction scales", () => {
    const full = riskContributions(cov, w, ["A", "B", "C"])!;
    const scaled = riskContributions(cov, w.map((x) => x * 0.4), ["A", "B", "C"])!;
    scaled.forEach((row, i) => expect(row.contributionPct).toBeCloseTo(full[i].contributionPct, 12));
  });

  it("is undefined, not zero, for an all-cash portfolio", () => {
    expect(riskContributions(cov, [0, 0, 0], ["A", "B", "C"])).toBeNull();
  });
});

describe("weights", () => {
  it("normalises to 100% and clips negatives", () => {
    expect(normaliseWeights([2, 1, 1])).toEqual([0.5, 0.25, 0.25]);
    expect(normaliseWeights([1, -1, 1])).toEqual([0.5, 0, 0.5]);
    expect(normaliseWeights([0, 0])).toEqual([0.5, 0.5]);
  });

  it("rescales the other weights proportionally when one moves", () => {
    const next = setWeight([0.5, 0.3, 0.2], 0, 0.2);
    expect(next[0]).toBe(0.2);
    expect(next[1]).toBeCloseTo(0.48, 15);
    expect(next[2]).toBeCloseTo(0.32, 15);
    expect(sum(next)).toBeCloseTo(1, 15);
  });

  it("shares the remainder equally when every other weight is zero", () => {
    expect(setWeight([1, 0, 0], 0, 0.4)).toEqual([0.4, 0.3, 0.3]);
  });

  it("clamps out-of-range input", () => {
    expect(setWeight([0.5, 0.5], 1, 1.7)).toEqual([0, 1]);
    expect(setWeight([0.5, 0.5], 1, -3)).toEqual([1, 0]);
  });

  it("resets to the original weights, normalised", () => {
    const original = [0.25, 0.25, 0.2, 0.15, 0.15];
    let edited = setWeight(original, 2, 0.9);
    edited = setWeight(edited, 0, 0.05);
    expect(edited).not.toEqual(original);
    expect(sum(edited)).toBeCloseTo(1, 15);
    expect(resetWeights(original)).toEqual(normaliseWeights(original));
    expect(sum(resetWeights(original))).toBeCloseTo(1, 15);
  });
});

describe("maximum equity fraction within a tolerated loss", () => {
  let seed = 11;
  const rand = () => ((seed = (seed * 48271) % 2147483647) / 2147483647) - 0.5;
  const portfolioLog = Array.from({ length: 500 }, () => rand() * 0.05);
  const esFull = expectedShortfallAtFraction(portfolioLog, 1, 0.95)!;

  it("scales ES linearly in the equity fraction on simple returns", () => {
    for (const f of [0.1, 0.37, 0.8]) {
      expect(expectedShortfallAtFraction(portfolioLog, f, 0.95)).toBeCloseTo(f * esFull, 14);
    }
  });

  it("lands exactly on the tolerance when the limit binds", () => {
    const tolerance = esFull * 0.4;
    const f = maxEquityFraction(portfolioLog, 0.95, tolerance)!;
    expect(f).toBeCloseTo(0.4, 12);
    expect(expectedShortfallAtFraction(portfolioLog, f, 0.95)).toBeCloseTo(tolerance, 14);
    // Slightly more equity would breach it.
    expect(expectedShortfallAtFraction(portfolioLog, f * 1.001, 0.95)!).toBeGreaterThan(
      tolerance,
    );
  });

  it("caps at 100% equity when the limit does not bind", () => {
    expect(maxEquityFraction(portfolioLog, 0.95, esFull * 2)).toBe(1);
  });

  it("returns zero equity for a zero tolerance", () => {
    expect(maxEquityFraction(portfolioLog, 0.95, 0)).toBe(0);
  });
});

describe("parsing and alignment", () => {
  const csv = [
    "﻿date,ticker,close,volume,sector",
    "2024-01-02,aaa,10,1,Tech",
    '2024-01-02,BBB,20,1,"Real Estate, Construction"',
    "2024-01-03,AAA,11,1,Tech",
    // BBB missing on the 3rd: the date is dropped for both, not filled.
    "2024-01-04,AAA,12,1,Tech",
    "2024-01-04,BBB,22,1,Banking",
    "2024-01-04,BBB,99,1,Banking", // duplicate: first wins
    "2024-01-05,AAA,0,1,Tech", // non-positive: dropped
    "2024-01-05,BBB,23,1,Banking",
    "2024-01-05,INDEX,1000,1,Index",
    "",
  ].join("\r\n");

  it("cleans rows the way the engine does", () => {
    const rows = parseMarketCsv(csv);
    expect(rows.find((r) => r.date === "2024-01-04" && r.ticker === "BBB")?.close).toBe(22);
    expect(rows.some((r) => r.close <= 0)).toBe(false);
    expect(rows.every((r) => r.ticker === r.ticker.toUpperCase())).toBe(true);
  });

  it("aligns on the intersection of trading dates for the selected tickers only", () => {
    const aligned = alignPrices(parseMarketCsv(csv), ["AAA", "BBB"]);
    expect(aligned.dates).toEqual(["2024-01-02", "2024-01-04"]);
    expect(aligned.prices).toEqual([
      [10, 20],
      [12, 22],
    ]);
  });

  it("applies an inclusive date range", () => {
    const aligned = alignPrices(parseMarketCsv(csv), ["AAA", "BBB"], "2024-01-03", null);
    expect(aligned.dates).toEqual(["2024-01-04"]);
  });

  it("refuses a ticker the data does not contain", () => {
    expect(() => alignPrices(parseMarketCsv(csv), ["AAA", "ZZZ"])).toThrow(/ZZZ/);
  });
});
