"use client";

import { useAnalysisParams } from "@/components/analysis-params-provider";
import { ModelAuditTable } from "@/components/panels/model-audit-table";
import type { BacktestSummaryRow } from "@/types/analysis";

/**
 * Filters the precomputed comparison by the models and confidence level
 * selected in the rail.
 *
 * All six model-by-confidence rows are computed by the Python engine ahead of
 * time, so this selection is a genuine view over real results rather than a
 * control that appears to do something and does not. Parameters that would
 * require re-running the engine — rolling window, EWMA decay, date range — are
 * disabled in the rail instead, because faking those would misrepresent what
 * the analysis actually tested.
 */
export function FilteredModelAudit({
  rows,
  significance,
}: {
  rows: BacktestSummaryRow[];
  significance: number;
}) {
  const { params } = useAnalysisParams();

  const visible = rows.filter(
    (row) => params.models.includes(row.model) && row.confidence === params.confidence,
  );

  return (
    <ModelAuditTable
      rows={visible}
      significance={significance}
      emptyMessage={
        params.models.length === 0
          ? "Select at least one model in the analysis rail to compare."
          : `No precomputed result at ${(params.confidence * 100).toFixed(0)}% confidence for the selected models.`
      }
    />
  );
}
