import { describe, expect, it } from "vitest";
import fixture from "./fixtures/whatif-parity.json";
import {
  alignPrices,
  maxEquityFraction,
  parseMarketCsv,
  portfolioLogReturns,
  prepareInputs,
  summariseRisk,
  expectedShortfallAtFraction,
} from "@/lib/what-if";

/**
 * Parity with the Python engine.
 *
 * `backend/scripts/whatif_parity_fixture.py` ran the engine's own functions on
 * the CSV embedded in the fixture; these tests push the same text through the
 * browser implementation and require the same figures. The backend suite
 * separately checks the fixture is still what the engine produces, so neither
 * side can drift unnoticed.
 */

const TOLERANCE = 1e-9;

function close(actual: number | null, expected: number | null) {
  if (expected === null) {
    expect(actual).toBeNull();
    return;
  }
  expect(actual).not.toBeNull();
  expect(Math.abs(actual! - expected)).toBeLessThan(TOLERANCE);
}

const aligned = alignPrices(parseMarketCsv(fixture.csv), fixture.tickers);
const inputs = prepareInputs(aligned);

describe("What-if parity with the Python engine", () => {
  it("cleans and aligns the price set identically", () => {
    expect(aligned.dates).toHaveLength(fixture.alignedObservations);
    expect(inputs.assetReturns).toHaveLength(fixture.returnObservations);
    expect(aligned.dates[0]).toBe(fixture.firstDate);
    expect(aligned.dates.at(-1)).toBe(fixture.lastDate);
  });

  for (const testCase of fixture.cases) {
    it(`reproduces every figure at f=${testCase.equityFraction}, ${testCase.confidence * 100}%`, () => {
      const got = summariseRisk(
        inputs,
        testCase.weights,
        testCase.equityFraction,
        testCase.confidence,
      );
      const want = testCase.expected;

      close(got.var, want.var);
      close(got.expectedShortfall, want.expectedShortfall);
      close(got.annualisedVolatility, want.annualisedVolatility);
      close(got.maximumDrawdown, want.maximumDrawdown);
      close(got.worstFiveDayLoss, want.worstFiveDayLoss);
      close(got.portfolioVolatilityDaily, want.portfolioVolatilityDaily);

      if (want.riskContribution === null) {
        expect(got.contributions).toBeNull();
      } else {
        expect(got.contributions).toHaveLength(want.riskContribution.length);
        want.riskContribution.forEach((row, i) => {
          const mine = got.contributions![i];
          expect(mine.ticker).toBe(row.ticker);
          close(mine.weight, row.weight);
          close(mine.contribution, row.contribution);
          close(mine.contributionPct, row.contributionPct);
        });
      }
    });
  }

  for (const check of fixture.maxEquityFraction) {
    it(`finds the same maximum equity fraction for a ${check.tolerancePct * 100}% tolerance`, () => {
      const portfolioLog = portfolioLogReturns(inputs.assetReturns, check.weights);
      const f = maxEquityFraction(portfolioLog, check.confidence, check.tolerancePct);
      close(f, check.expectedFraction);
      close(
        expectedShortfallAtFraction(portfolioLog, f!, check.confidence),
        check.expectedShortfallAtFraction,
      );
    });
  }
});
