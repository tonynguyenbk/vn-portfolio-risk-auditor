import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatPValue,
  formatPercent,
  formatSignedPercent,
} from "@/lib/format";

describe("formatPercent", () => {
  it("converts a decimal to a percentage string", () => {
    expect(formatPercent(0.0214)).toBe("2.14%");
  });

  it("renders an em dash rather than a misleading zero when a metric is unavailable", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(Number.NaN)).toBe("—");
  });

  it("keeps drawdown negative", () => {
    expect(formatPercent(-0.1832)).toBe("-18.32%");
  });
});

describe("formatSignedPercent", () => {
  it("marks gains explicitly so the direction is never ambiguous", () => {
    expect(formatSignedPercent(0.05)).toBe("+5.00%");
    expect(formatSignedPercent(-0.05)).toBe("-5.00%");
  });
});

describe("formatPValue", () => {
  it("does not print a very small p-value as exactly zero", () => {
    expect(formatPValue(0.00001)).toBe("<0.0001");
  });

  it("prints four decimals otherwise", () => {
    expect(formatPValue(0.0432)).toBe("0.0432");
  });
});

describe("formatDate", () => {
  it("renders an ISO date in a human-readable form", () => {
    expect(formatDate("2025-12-31")).toBe("31 Dec 2025");
  });
});
