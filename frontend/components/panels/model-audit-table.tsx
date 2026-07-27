import { Badge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { formatConfidence, formatNumber, formatPercent, formatPValue } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MODEL_LABELS, type BacktestSummaryRow } from "@/types/analysis";

/**
 * Model-comparison table (PRD 11.6 and 9.11).
 *
 * The `result` column reports the Kupiec decision only. PRD 9.12 is explicit
 * that PASS is not evidence the model is correct, and PRD 12 forbids ranking
 * models by smallest VaR, so no "winner" is declared here.
 */
export function ModelAuditTable({
  rows,
  significance,
  emptyMessage,
}: {
  rows: BacktestSummaryRow[];
  significance: number;
  /** Shown instead of an empty table when the selection matches nothing. */
  emptyMessage?: string;
}) {
  return (
    <Panel>
      <PanelHeader>
        <div className="flex items-center gap-1.5">
          <PanelTitle>Model comparison</PanelTitle>
          <InfoTooltip
            label="the Kupiec test"
            content="Checks whether the number of days the loss exceeded the forecast threshold is statistically compatible with the number the confidence level implies. Too many exceptions suggests the model understates risk; too few suggests it overstates it."
          />
        </div>
        <span className="text-[11px] text-ink-muted">
          Significance level {formatPercent(significance, 0)}
        </span>
      </PanelHeader>

      <PanelBody>
        {rows.length === 0 && emptyMessage && (
          <p className="py-6 text-center text-[13px] text-ink-muted">{emptyMessage}</p>
        )}

        {/* Horizontally scrollable on narrow screens (PRD 13.11). */}
        <div className={cn("overflow-x-auto", rows.length === 0 && "hidden")}>
          <table className="w-full min-w-[860px] text-left text-[13px]">
            <caption className="sr-only">
              Walk-forward backtesting results and Kupiec unconditional coverage test by
              VaR model
            </caption>
            <thead className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">
              <tr>
                <th scope="col" className="pb-2 font-medium">Model</th>
                <th scope="col" className="pb-2 text-right font-medium">Conf.</th>
                <th scope="col" className="pb-2 text-right font-medium">Test obs.</th>
                <th scope="col" className="pb-2 text-right font-medium">Expected</th>
                <th scope="col" className="pb-2 text-right font-medium">Actual</th>
                <th scope="col" className="pb-2 text-right font-medium">Rate</th>
                <th scope="col" className="pb-2 text-right font-medium">Avg VaR</th>
                <th scope="col" className="pb-2 text-right font-medium">Mean severity</th>
                <th scope="col" className="pb-2 text-right font-medium">Kupiec LR</th>
                <th scope="col" className="pb-2 text-right font-medium">p-value</th>
                <th scope="col" className="pb-2 text-right font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="text-ink-secondary">
              {rows.map((row) => (
                <tr key={`${row.model}-${row.confidence}`} className="border-t border-line">
                  <td className="py-2.5 text-ink">{MODEL_LABELS[row.model]}</td>
                  <td className="tabular py-2.5 text-right font-mono">
                    {formatConfidence(row.confidence)}
                  </td>
                  <td className="tabular py-2.5 text-right font-mono">{row.observations}</td>
                  <td className="tabular py-2.5 text-right font-mono">
                    {formatNumber(row.expectedExceptions, 1)}
                  </td>
                  <td className="tabular py-2.5 text-right font-mono text-ink">
                    {row.actualExceptions}
                  </td>
                  <td className="tabular py-2.5 text-right font-mono">
                    {formatPercent(row.exceptionRate)}
                  </td>
                  <td className="tabular py-2.5 text-right font-mono">
                    {formatPercent(row.averageVar)}
                  </td>
                  <td className="tabular py-2.5 text-right font-mono">
                    {formatPercent(row.meanExceptionSeverity)}
                  </td>
                  <td className="tabular py-2.5 text-right font-mono">
                    {formatNumber(row.kupiecLr, 3)}
                  </td>
                  <td className="tabular py-2.5 text-right font-mono">
                    {formatPValue(row.kupiecPValue)}
                  </td>
                  <td className="py-2.5 text-right">
                    <Badge tone={row.result === "pass" ? "aqua" : "coral"}>{row.result}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-[12px] leading-relaxed text-ink-muted">
          <span className="font-[650] text-ink-secondary">Reading this table.</span>{" "}
          <span className="font-mono text-ink-secondary">PASS</span> means the observed
          exception count is not statistically inconsistent with the stated confidence
          level under this test. It is not proof that the model is correct, and a model
          is not preferable merely because it reports a smaller VaR.
        </p>
      </PanelBody>
    </Panel>
  );
}
