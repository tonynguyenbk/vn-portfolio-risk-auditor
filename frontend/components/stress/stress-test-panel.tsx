"use client";

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useAnalysisParams } from "@/components/analysis-params-provider";
import { Panel, PanelBody, PanelHeader, PanelTitle, Eyebrow } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { formatNotional, formatSignedPercent, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AssetWeight, RiskLimits } from "@/types/analysis";

/**
 * Scenario analysis (PRD 9.14).
 *
 * The whole calculation is the weighted sum of asset shocks, so it runs in the
 * browser. Deliberately framed as "if these shocks occurred", never as a
 * forecast: PRD 7.5 draws that line and the copy below keeps to it.
 *
 * Only the custom-shock path exists in Phase 1. Historical scenarios, which
 * derive shocks from a user-selected date range in the real dataset, arrive
 * with Phase 5.
 */

type PresetId = "custom" | "broad_decline" | "sector_shock" | "risk_off";

const PRESETS: Record<Exclude<PresetId, "custom">, { label: string; shocks: number[] }> = {
  // Ordered to match the asset list. All hypothetical, not observed events.
  broad_decline: { label: "Broad market decline", shocks: [-0.09, -0.11, -0.07, -0.08, -0.07] },
  sector_shock: { label: "Banking sector shock", shocks: [-0.03, -0.18, -0.02, -0.03, -0.04] },
  risk_off: { label: "Global risk-off", shocks: [-0.13, -0.14, -0.06, -0.12, -0.09] },
};

export function StressTestPanel({
  weights,
  limits,
}: {
  weights: AssetWeight[];
  limits: RiskLimits;
}) {
  // Read straight from the rail so the optional notional entered there flows
  // through to the monetary line below without prop drilling from a server page.
  const { params } = useAnalysisParams();
  const notionalValue = params.notionalValue;
  const [preset, setPreset] = useState<PresetId>("broad_decline");
  const [shocks, setShocks] = useState<number[]>(PRESETS.broad_decline.shocks);

  const applyPreset = (id: PresetId) => {
    setPreset(id);
    if (id !== "custom") setShocks(PRESETS[id].shocks);
  };

  const updateShock = (index: number, value: number) => {
    setPreset("custom");
    setShocks((prev) => prev.map((s, i) => (i === index ? value : s)));
  };

  const result = useMemo(() => {
    // Portfolio shock = w^T s (PRD 9.14).
    const contributions = weights.map((asset, i) => ({
      ticker: asset.ticker,
      sector: asset.sector,
      weight: asset.weight,
      shock: shocks[i] ?? 0,
      contribution: asset.weight * (shocks[i] ?? 0),
    }));
    const total = contributions.reduce((acc, c) => acc + c.contribution, 0);
    const worst = [...contributions].sort((a, b) => a.contribution - b.contribution)[0];
    const loss = Math.abs(Math.min(0, total));

    let status: "within_limit" | "warning" | "breach" = "within_limit";
    if (loss > limits.maxStressLossPct) status = "breach";
    else if (loss > limits.maxStressLossPct * 0.8) status = "warning";

    return { contributions, total, worst, loss, status };
  }, [weights, shocks, limits.maxStressLossPct]);

  const statusPresentation = {
    within_limit: { label: "Within limit", tone: "aqua" as const },
    warning: { label: "Warning", tone: "amber" as const },
    breach: { label: "Breach", tone: "coral" as const },
  }[result.status];

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <Panel className="xl:col-span-7">
        <PanelHeader>
          <div className="flex items-center gap-1.5">
            <PanelTitle>Scenario definition</PanelTitle>
            <InfoTooltip
              label="stress testing"
              content="Applies a set of hypothetical price shocks to the current weights and reports the resulting portfolio impact. It answers 'what if this happened', not 'how likely is this'."
            />
          </div>
          <Button
            variant="ghost"
            className="min-h-9 px-2 text-[12px]"
            onClick={() => applyPreset("broad_decline")}
          >
            <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
            Reset
          </Button>
        </PanelHeader>

        <PanelBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Eyebrow>Hypothetical scenario</Eyebrow>
            <SegmentedControl<PresetId>
              label="Stress scenario preset"
              value={preset}
              onChange={applyPreset}
              options={[
                { value: "broad_decline", label: "Broad decline" },
                { value: "sector_shock", label: "Sector shock" },
                { value: "risk_off", label: "Risk-off" },
                { value: "custom", label: "Custom" },
              ]}
            />
            <p className="text-[11px] leading-snug text-ink-muted">
              These presets are illustrative constructions, not observed historical
              events. Adjusting any shock switches the scenario to Custom.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Eyebrow>Asset shocks</Eyebrow>
            {result.contributions.map((row, i) => (
              <div key={row.ticker} className="flex items-center gap-3">
                <label
                  htmlFor={`shock-${row.ticker}`}
                  className="w-20 shrink-0 font-mono text-[12px] text-ink"
                >
                  {row.ticker}
                </label>
                <input
                  id={`shock-${row.ticker}`}
                  type="range"
                  min={-0.4}
                  max={0.2}
                  step={0.005}
                  value={row.shock}
                  onChange={(e) => updateShock(i, Number(e.target.value))}
                  className="h-1.5 flex-1 accent-[var(--coral)]"
                  aria-valuetext={formatSignedPercent(row.shock, 1)}
                />
                <span className="tabular w-16 shrink-0 text-right font-mono text-[12px] text-ink-secondary">
                  {formatSignedPercent(row.shock, 1)}
                </span>
              </div>
            ))}
          </div>
        </PanelBody>
      </Panel>

      <Panel className="xl:col-span-5">
        <PanelHeader>
          <PanelTitle>Scenario result</PanelTitle>
          <Badge tone={statusPresentation.tone}>{statusPresentation.label}</Badge>
        </PanelHeader>

        <PanelBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Eyebrow>Estimated portfolio impact</Eyebrow>
            <span
              className={cn(
                "tabular font-mono text-[34px] font-[650] leading-none",
                result.total < 0 ? "text-coral" : "text-ink",
              )}
            >
              {formatSignedPercent(result.total)}
            </span>
            {notionalValue !== null && (
              <span className="text-[12px] text-ink-muted">
                {formatNotional(notionalValue * result.total)} on a simulated notional of{" "}
                {formatNotional(notionalValue)}
              </span>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-3 border-y border-line py-3">
            <div className="flex flex-col gap-0.5">
              <dt><Eyebrow>Largest contributor</Eyebrow></dt>
              <dd className="font-mono text-[15px] text-ink">{result.worst.ticker}</dd>
              <dd className="text-[11px] text-ink-muted">{result.worst.sector}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt><Eyebrow>Stress limit</Eyebrow></dt>
              <dd className="tabular font-mono text-[15px] text-ink">
                {formatPercent(limits.maxStressLossPct, 1)}
              </dd>
              <dd className="text-[11px] text-ink-muted">
                Loss {formatPercent(result.loss, 2)}
              </dd>
            </div>
          </dl>

          <div className="flex flex-col gap-2">
            <Eyebrow>Loss contribution by asset</Eyebrow>
            <table className="w-full text-left text-[12px]">
              <caption className="sr-only">
                Contribution of each asset to the total scenario impact
              </caption>
              <thead className="text-ink-muted">
                <tr>
                  <th scope="col" className="pb-1.5 font-medium">Asset</th>
                  <th scope="col" className="pb-1.5 text-right font-medium">Weight</th>
                  <th scope="col" className="pb-1.5 text-right font-medium">Shock</th>
                  <th scope="col" className="pb-1.5 text-right font-medium">Impact</th>
                </tr>
              </thead>
              <tbody className="text-ink-secondary">
                {result.contributions.map((row) => (
                  <tr key={row.ticker} className="border-t border-line">
                    <td className="py-1.5 font-mono text-ink">{row.ticker}</td>
                    <td className="tabular py-1.5 text-right font-mono">
                      {formatPercent(row.weight, 0)}
                    </td>
                    <td className="tabular py-1.5 text-right font-mono">
                      {formatSignedPercent(row.shock, 1)}
                    </td>
                    <td className="tabular py-1.5 text-right font-mono text-ink">
                      {formatSignedPercent(row.contribution)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line-strong">
                  <td className="pt-2 text-ink-muted">Total</td>
                  <td colSpan={2} />
                  <td className="tabular pt-2 text-right font-mono text-ink">
                    {formatSignedPercent(result.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}
