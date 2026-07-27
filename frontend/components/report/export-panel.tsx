"use client";

import { Download, Printer } from "lucide-react";
import { useAnalysisData } from "@/components/analysis-data-provider";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import {
  backtestSeriesCsv,
  backtestSummaryCsv,
  downloadCsv,
  metricsCsv,
  stressCsv,
} from "@/lib/csv-export";

/**
 * Export controls (PRD 14.5, 22 Phase 6).
 *
 * Printing rather than server-side PDF generation, which PRD 16.3 explicitly
 * permits so that reporting is not blocked on PDF tooling. Every CSV is built
 * from the same objects this page renders, so exported and displayed figures
 * cannot disagree.
 */
export function ExportPanel() {
  const { analysis, backtestResult, scenarios } = useAnalysisData();

  const stamp = analysis.metadata.endDate;
  const prefix = analysis.metadata.isSimulated ? "vn-risk-demo" : "vn-risk-audit";

  const exports = [
    {
      label: "Metrics and risk contribution",
      note: "Volatility, drawdown, VaR, Expected Shortfall, concentration, contributions.",
      filename: `${prefix}-metrics-${stamp}.csv`,
      build: () => metricsCsv(analysis),
      disabled: false,
    },
    {
      label: "Model audit summary",
      note: "One row per model and confidence level, with the Kupiec result.",
      filename: `${prefix}-model-audit-${stamp}.csv`,
      build: () => backtestSummaryCsv(analysis, backtestResult),
      disabled: backtestResult.summary.length === 0,
    },
    {
      label: "Backtest series",
      note: `Daily realised loss against its forecast threshold (${backtestResult.series.length.toLocaleString()} rows).`,
      filename: `${prefix}-backtest-series-${stamp}.csv`,
      build: () => backtestSeriesCsv(analysis, backtestResult),
      disabled: backtestResult.series.length === 0,
    },
    {
      label: "Stress scenarios",
      note: scenarios.length
        ? "Historical episodes replayed against the current weights."
        : "No precomputed scenarios for an uploaded dataset.",
      filename: `${prefix}-stress-${stamp}.csv`,
      build: () => stressCsv(analysis, scenarios),
      disabled: scenarios.length === 0,
    },
  ];

  return (
    <Panel className="no-print">
      <PanelHeader>
        <PanelTitle>Export</PanelTitle>
        <Button variant="primary" onClick={() => window.print()}>
          <Printer aria-hidden="true" className="h-4 w-4" />
          Print or save as PDF
        </Button>
      </PanelHeader>

      <PanelBody className="flex flex-col gap-3">
        <p className="text-[12px] leading-relaxed text-ink-muted">
          Every file is generated from the same figures shown on this page and carries a
          header recording the dataset, period and assumptions used. Values are decimals,
          not percentages, so they can be recomputed rather than only read.
        </p>

        <ul className="flex flex-col gap-2">
          {exports.map((item) => (
            <li
              key={item.label}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-bg/40 p-3"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[13px] text-ink">{item.label}</span>
                <span className="text-[11px] text-ink-muted">{item.note}</span>
              </div>
              <Button
                variant="secondary"
                className="min-h-9 shrink-0 px-3 text-[12px]"
                disabled={item.disabled}
                onClick={() => downloadCsv(item.filename, item.build())}
              >
                <Download aria-hidden="true" className="h-3.5 w-3.5" />
                CSV
              </Button>
            </li>
          ))}
        </ul>
      </PanelBody>
    </Panel>
  );
}
