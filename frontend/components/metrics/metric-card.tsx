import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string;
  /** Model or calculation basis, e.g. "Historical Simulation". */
  basis: string;
  /** One short line of context: period, window, convention. */
  context: string;
  /** Plain-language definition, not a restatement of the label (PRD 15.2). */
  definition: string;
}

/**
 * Primary metric card (PRD 11.3 and 13.7).
 *
 * Deliberately monochrome: colour here would imply that a number is "good" or
 * "bad", which PRD 11.3 forbids. Colour is reserved for limit status, where it
 * encodes a user-defined threshold rather than investment quality.
 */
export function MetricCard({ label, value, basis, context, definition }: MetricCardProps) {
  return (
    <Panel
      className={cn(
        "flex flex-col gap-2 p-4",
        "transition-colors duration-150 hover:border-line-strong",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-muted">
          {label}
        </span>
        <InfoTooltip label={label} content={definition} />
      </div>

      <span className="tabular font-mono text-[30px] font-[650] leading-none text-ink">
        {value}
      </span>

      <div className="mt-auto flex flex-col gap-0.5 pt-1">
        <span className="text-[12px] text-ink-secondary">{basis}</span>
        <span className="text-[11px] text-ink-muted">{context}</span>
      </div>
    </Panel>
  );
}
