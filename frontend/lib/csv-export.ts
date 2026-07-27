/**
 * CSV export (PRD 22 Phase 6).
 *
 * Generated in the browser from the same objects the components render. That
 * is deliberate: PRD 22's exit condition for this phase is that exported
 * content matches the on-screen analysis, and the only way to guarantee that
 * rather than test for it is to have one source. A server-side exporter would
 * recompute, and recomputation is exactly where the two could silently diverge.
 *
 * Values are written as decimals, matching the API convention. A spreadsheet
 * can format them; a percentage string cannot be recomputed from.
 */

import type {
  AnalysisResult,
  BacktestResult,
  HistoricalScenario,
} from "@/types/analysis";

/**
 * Escape a value for CSV.
 *
 * Fields containing a comma, quote or newline are quoted, and embedded quotes
 * are doubled, per RFC 4180. Without this a sector named "Banking, Insurance"
 * would silently shift every column after it.
 */
function cell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  return rows.map((row) => row.map(cell).join(",")).join("\r\n");
}

/** Prefix every export with the provenance needed to interpret it. */
function header(analysis: AnalysisResult): (string | number)[][] {
  return [
    ["# VN Portfolio Risk Auditor — exported analysis"],
    ["# Dataset", analysis.metadata.datasetName],
    ["# Simulated data", String(analysis.metadata.isSimulated)],
    ["# Period", `${analysis.metadata.startDate} to ${analysis.metadata.endDate}`],
    ["# Observations", analysis.metadata.observations],
    ["# Rolling window", analysis.assumptions.rollingWindow],
    ["# EWMA lambda", analysis.assumptions.ewmaLambda],
    ["# Trading days per year", analysis.assumptions.tradingDaysPerYear],
    ["# Quantile method", analysis.assumptions.quantileMethod],
    ["# Convention", "decimals not percentages; losses and VaR positive; drawdown negative"],
    ["# Educational prototype — not investment advice"],
    [],
  ];
}

export function metricsCsv(analysis: AnalysisResult): string {
  const rows: (string | number | boolean | null)[][] = [
    ...header(analysis),
    ["metric", "model", "confidence", "value", "unit"],
    ["annualised_volatility", "", "", analysis.metrics.annualisedVolatility, "decimal"],
    ["maximum_drawdown", "", "", analysis.metrics.maximumDrawdown.value, "decimal"],
    ["maximum_drawdown_peak_date", "", "", analysis.metrics.maximumDrawdown.peakDate, "date"],
    ["maximum_drawdown_trough_date", "", "", analysis.metrics.maximumDrawdown.troughDate, "date"],
  ];

  for (const estimate of analysis.metrics.var) {
    rows.push(["value_at_risk", estimate.model, estimate.confidence, estimate.value, "decimal"]);
  }
  for (const estimate of analysis.metrics.expectedShortfall) {
    rows.push(["expected_shortfall", "historical", estimate.confidence, estimate.value, "decimal"]);
  }

  if (analysis.concentration) {
    rows.push(
      ["largest_weight", "", "", analysis.concentration.largestWeight, "decimal"],
      ["largest_weight_ticker", "", "", analysis.concentration.largestWeightTicker, "text"],
      ["largest_sector_weight", "", "", analysis.concentration.largestSectorWeight, "decimal"],
      ["hhi", "", "", analysis.concentration.hhi, "index"],
    );
  }

  rows.push([]);
  rows.push(["ticker", "sector", "weight", "risk_contribution", "risk_contribution_pct"]);
  for (const row of analysis.riskContribution) {
    const sector =
      analysis.portfolio.weights.find((w) => w.ticker === row.ticker)?.sector ?? "";
    rows.push([row.ticker, sector, row.weight, row.contribution, row.contributionPct]);
  }

  return toCsv(rows);
}

export function backtestSummaryCsv(
  analysis: AnalysisResult,
  backtest: BacktestResult,
): string {
  const rows: (string | number | boolean | null)[][] = [
    ...header(analysis),
    [
      "model",
      "confidence",
      "observations",
      "expected_exceptions",
      "actual_exceptions",
      "exception_rate",
      "average_var",
      "mean_exception_severity",
      "kupiec_lr",
      "kupiec_p_value",
      "result",
    ],
  ];

  for (const row of backtest.summary) {
    rows.push([
      row.model,
      row.confidence,
      row.observations,
      row.expectedExceptions,
      row.actualExceptions,
      row.exceptionRate,
      row.averageVar,
      // Empty, not 0: no exception days means the mean is undefined.
      row.meanExceptionSeverity,
      row.kupiecLr,
      row.kupiecPValue,
      row.result,
    ]);
  }

  return toCsv(rows);
}

export function backtestSeriesCsv(
  analysis: AnalysisResult,
  backtest: BacktestResult,
): string {
  const rows: (string | number | boolean | null)[][] = [
    ...header(analysis),
    ["date", "realised_loss", "var_threshold", "is_exception"],
  ];

  for (const point of backtest.series) {
    rows.push([point.date, point.loss, point.varThreshold, point.isException]);
  }

  return toCsv(rows);
}

export function stressCsv(
  analysis: AnalysisResult,
  scenarios: HistoricalScenario[],
): string {
  const rows: (string | number | boolean | null)[][] = [
    ...header(analysis),
    [
      "scenario",
      "period_start",
      "period_end",
      "ticker",
      "weight",
      "shock",
      "contribution",
      "portfolio_impact",
      "limit_status",
    ],
  ];

  for (const scenario of scenarios) {
    for (const impact of scenario.impacts) {
      rows.push([
        scenario.label,
        scenario.periodStart ?? "",
        scenario.periodEnd ?? "",
        impact.ticker,
        impact.weight,
        impact.shock,
        impact.contribution,
        scenario.portfolioImpact,
        scenario.limitStatus,
      ]);
    }
  }

  return toCsv(rows);
}

/**
 * Trigger a browser download.
 *
 * A BOM is prepended so Excel opens UTF-8 correctly; without it, non-ASCII
 * text is mangled on Windows, which matters for a project whose real dataset
 * will carry Vietnamese names.
 */
export function downloadCsv(filename: string, contents: string): void {
  const blob = new Blob([`﻿${contents}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
