import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { formatDateRange, formatInteger, formatNumber } from "@/lib/format";
import type { AnalysisMetadata, DataQuality } from "@/types/analysis";

const STATUS_TONE = {
  pass: { tone: "success", label: "PASS" },
  warning: { tone: "amber", label: "WARNING" },
  fail: { tone: "coral", label: "FAIL" },
} as const;

/** Data-quality output block from PRD 11.1. */
export function DataQualityStrip({
  metadata,
  dataQuality,
}: {
  metadata: AnalysisMetadata;
  dataQuality: DataQuality;
}) {
  const status = STATUS_TONE[dataQuality.status];

  const items = [
    { label: "Analysis period", value: formatDateRange(metadata.startDate, metadata.endDate) },
    { label: "Aligned observations", value: formatInteger(dataQuality.alignedObservations) },
    { label: "Assets", value: formatInteger(metadata.assets) },
    { label: "Observations removed", value: formatInteger(dataQuality.rowsRemoved) },
    { label: "Duplicate records", value: formatInteger(dataQuality.duplicateRecords) },
    { label: "Weight total", value: formatNumber(dataQuality.weightTotal, 4) },
  ];

  return (
    <Panel className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-muted">
          Data status
        </span>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col">
            <dt className="text-[10px] uppercase tracking-[0.08em] text-ink-muted">
              {item.label}
            </dt>
            <dd className="tabular font-mono text-[13px] text-ink-secondary">{item.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
