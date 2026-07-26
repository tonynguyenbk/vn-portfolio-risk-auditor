import { AlertTriangle, ShieldAlert, ShieldCheck } from "lucide-react";
import { Panel, PanelBody, PanelHeader, PanelTitle, Eyebrow } from "@/components/ui/panel";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LimitsBlock, RiskContribution, RiskLimits } from "@/types/analysis";

interface RiskStatusPanelProps {
  limits: LimitsBlock;
  riskLimits: RiskLimits;
  var95: number;
  contributions: RiskContribution[];
}

/**
 * Risk status panel (PRD 13.9).
 *
 * Colour here encodes position against a *user-defined* threshold, not
 * investment quality. PRD 13.9 is explicit that a portfolio is never labelled
 * "safe", so the within-limit wording stays descriptive.
 */
const STATUS_PRESENTATION = {
  within_limit: {
    label: "Within user-defined limits",
    tone: "text-aqua",
    ring: "border-aqua/40 bg-[var(--aqua-soft)]",
    Icon: ShieldCheck,
  },
  warning: {
    label: "Warning — limit approached",
    tone: "text-amber",
    ring: "border-amber/40 bg-amber/10",
    Icon: AlertTriangle,
  },
  breach: {
    label: "Breach — limit exceeded",
    tone: "text-coral",
    ring: "border-coral/40 bg-[var(--coral-soft)]",
    Icon: ShieldAlert,
  },
} as const;

export function RiskStatusPanel({
  limits,
  riskLimits,
  var95,
  contributions,
}: RiskStatusPanelProps) {
  const presentation = STATUS_PRESENTATION[limits.status];
  const { Icon } = presentation;
  const ranked = [...contributions].sort((a, b) => b.contributionPct - a.contributionPct);
  const largest = ranked[0];
  const utilisation = Math.min(1, var95 / riskLimits.maxVar95Pct);

  return (
    <Panel className="flex h-full flex-col">
      <PanelHeader>
        <div className="flex items-center gap-1.5">
          <PanelTitle>Risk status</PanelTitle>
          <InfoTooltip
            label="risk status"
            content="Compares current results against the demonstration risk limits you set. These are illustrative internal thresholds, not regulatory requirements."
          />
        </div>
      </PanelHeader>

      <PanelBody className="flex flex-1 flex-col gap-4">
        <div className={cn("flex items-center gap-2.5 rounded-md border p-3", presentation.ring)}>
          <Icon aria-hidden="true" className={cn("h-5 w-5 shrink-0", presentation.tone)} />
          <span className={cn("text-[13px] font-[650]", presentation.tone)}>
            {presentation.label}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <Eyebrow>VaR 95% vs limit</Eyebrow>
            <span className="tabular font-mono text-[13px] text-ink">
              {formatPercent(var95)}
              <span className="text-ink-muted"> / {formatPercent(riskLimits.maxVar95Pct)}</span>
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-bg"
            role="img"
            aria-label={`Value at Risk is ${formatPercent(var95)} against a limit of ${formatPercent(riskLimits.maxVar95Pct)}`}
          >
            <div
              className={cn(
                "h-full rounded-full",
                var95 > riskLimits.maxVar95Pct ? "bg-coral" : "bg-aqua",
              )}
              style={{ width: `${utilisation * 100}%` }}
            />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-0.5">
            <dt>
              <Eyebrow>Warnings</Eyebrow>
            </dt>
            <dd className="tabular font-mono text-[20px] font-[650] text-ink">
              {limits.warnings.length}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt>
              <Eyebrow>Top contributor</Eyebrow>
            </dt>
            <dd className="font-mono text-[20px] font-[650] text-ink">{largest.ticker}</dd>
          </div>
        </dl>

        <div className="flex flex-col gap-2">
          <Eyebrow>Volatility contribution</Eyebrow>
          <ul className="flex flex-col gap-1.5">
            {ranked.map((row) => (
              <li key={row.ticker} className="flex items-center gap-2">
                <span className="w-16 shrink-0 font-mono text-[11px] text-ink-secondary">
                  {row.ticker}
                </span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg">
                  <span
                    className="block h-full rounded-full bg-aqua/70"
                    style={{ width: `${Math.max(2, row.contributionPct * 100)}%` }}
                  />
                </span>
                <span className="tabular w-14 shrink-0 text-right font-mono text-[11px] text-ink-secondary">
                  {formatPercent(row.contributionPct, 1)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {limits.warnings.length > 0 && (
          <ul className="mt-auto flex flex-col gap-1.5 border-t border-line pt-3">
            {limits.warnings.map((warning) => (
              <li
                key={warning.code + warning.message}
                className="flex gap-2 text-[12px] leading-snug text-ink-secondary"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                    warning.severity === "breach" ? "bg-coral" : "bg-amber",
                  )}
                />
                {/* Severity is stated in text as well as colour (PRD 15.4). */}
                <span>
                  <span className="sr-only">{warning.severity}: </span>
                  {warning.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PanelBody>
    </Panel>
  );
}
