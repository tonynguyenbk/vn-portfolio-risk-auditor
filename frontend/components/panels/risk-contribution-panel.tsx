import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Badge } from "@/components/ui/badge";
import { formatPercent } from "@/lib/format";
import type { RiskContribution } from "@/types/analysis";

/**
 * Risk-contribution output (PRD 11.5). The percentage column must sum to
 * approximately 100%, which is the visible counterpart of the numerical check
 * PRD 9.10 requires of the engine.
 */
export function RiskContributionPanel({ rows }: { rows: RiskContribution[] }) {
  const ranked = [...rows].sort((a, b) => b.contributionPct - a.contributionPct);
  const total = ranked.reduce((acc, row) => acc + row.contributionPct, 0);

  return (
    <Panel className="flex h-full flex-col">
      <PanelHeader>
        <div className="flex items-center gap-1.5">
          <PanelTitle>Risk contribution</PanelTitle>
          <InfoTooltip
            label="risk contribution"
            content="How much of the portfolio's total volatility each holding is responsible for, accounting for how it co-moves with the others. A large weight does not always mean a large contribution."
          />
        </div>
      </PanelHeader>

      <PanelBody>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-[13px]">
            <caption className="sr-only">
              Volatility contribution by asset, sorted from largest to smallest
            </caption>
            <thead className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">
              <tr>
                <th scope="col" className="pb-2 font-medium">Asset</th>
                <th scope="col" className="pb-2 text-right font-medium">Weight</th>
                <th scope="col" className="pb-2 text-right font-medium">Contribution</th>
                <th scope="col" className="pb-2 pl-4 font-medium">Share</th>
                <th scope="col" className="pb-2 text-right font-medium">Limit</th>
              </tr>
            </thead>
            <tbody className="text-ink-secondary">
              {ranked.map((row) => (
                <tr key={row.ticker} className="border-t border-line">
                  <td className="py-2 font-mono text-ink">{row.ticker}</td>
                  <td className="tabular py-2 text-right font-mono">
                    {formatPercent(row.weight, 1)}
                  </td>
                  <td className="tabular py-2 text-right font-mono">
                    {formatPercent(row.contributionPct, 1)}
                  </td>
                  <td className="py-2 pl-4">
                    <span
                      className="flex h-1.5 w-full min-w-16 overflow-hidden rounded-full bg-bg"
                      role="img"
                      aria-label={`${row.ticker} contributes ${formatPercent(row.contributionPct, 1)} of portfolio volatility`}
                    >
                      <span
                        className="block h-full rounded-full bg-aqua/70"
                        style={{ width: `${Math.max(2, row.contributionPct * 100)}%` }}
                      />
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    {row.breachesLimit ? (
                      <Badge tone="coral">Breach</Badge>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line-strong text-ink-muted">
                <td className="pt-2 text-[12px]">Total</td>
                <td />
                <td className="tabular pt-2 text-right font-mono text-[12px]">
                  {formatPercent(total, 1)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </PanelBody>
    </Panel>
  );
}
