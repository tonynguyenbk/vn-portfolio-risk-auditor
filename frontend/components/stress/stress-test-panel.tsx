"use client";

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useAnalysisParams } from "@/components/analysis-params-provider";
import { Panel, PanelBody, PanelHeader, PanelTitle, Eyebrow } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  formatDate,
  formatNotional,
  formatPercent,
  formatSignedPercent,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  AssetWeight,
  HistoricalScenario,
  LimitStatus,
  RiskLimits,
} from "@/types/analysis";

/**
 * Scenario analysis (PRD 9.14).
 *
 * Two paths, deliberately different in kind:
 *
 * **Historical** scenarios are replays of intervals the Python engine located
 * in the dataset, precomputed and shipped as static JSON. They are real
 * episodes measured against the current weights — including whatever the
 * assets' co-movement actually was — rather than a shock vector someone
 * invented.
 *
 * **Custom** shocks are computed here in the browser. The calculation is the
 * dot product `w' s`, and doing it locally is what makes the sliders respond
 * instantly instead of firing a request per drag. The same arithmetic exists in
 * `backend/app/services/stress_testing.py`, which is the authoritative
 * implementation, carries the PRD 20.1 tests, and serves uploaded portfolios.
 * The duplication is confined to one line and is the price of a usable control.
 *
 * Neither path is a forecast. PRD 7.5 is explicit that stress testing is
 * scenario analysis, and the copy on this page keeps to that.
 */

const STATUS_TONE: Record<LimitStatus, "aqua" | "amber" | "coral"> = {
  within_limit: "aqua",
  warning: "amber",
  breach: "coral",
};

const STATUS_LABEL: Record<LimitStatus, string> = {
  within_limit: "Within limit",
  warning: "Warning",
  breach: "Breach",
};

export function StressTestPanel({
  weights,
  limits,
  scenarios,
}: {
  weights: AssetWeight[];
  limits: RiskLimits;
  scenarios: HistoricalScenario[];
}) {
  const { params } = useAnalysisParams();
  const notionalValue = params.notionalValue;

  const [mode, setMode] = useState<"historical" | "custom">("historical");
  const [scenarioId, setScenarioId] = useState(scenarios[0]?.id ?? "");
  const [shocks, setShocks] = useState<number[]>(() => weights.map(() => -0.08));

  const selected = scenarios.find((s) => s.id === scenarioId) ?? scenarios[0];

  const custom = useMemo(() => {
    const impacts = weights.map((asset, i) => ({
      ticker: asset.ticker,
      sector: asset.sector,
      weight: asset.weight,
      shock: shocks[i] ?? 0,
      contribution: asset.weight * (shocks[i] ?? 0),
    }));
    const portfolioImpact = impacts.reduce((acc, i) => acc + i.contribution, 0);
    const loss = Math.abs(Math.min(0, portfolioImpact));

    const negative = impacts.filter((i) => i.contribution < 0);
    const largest = negative.length
      ? negative.reduce((a, b) => (a.contribution <= b.contribution ? a : b)).ticker
      : null;

    let limitStatus: LimitStatus = "within_limit";
    if (loss > limits.maxStressLossPct) limitStatus = "breach";
    else if (loss > limits.maxStressLossPct * 0.8) limitStatus = "warning";

    return { impacts, portfolioImpact, loss, largestContributor: largest, limitStatus };
  }, [weights, shocks, limits.maxStressLossPct]);

  const active =
    mode === "historical" && selected
      ? {
          impacts: selected.impacts.map((impact) => ({
            ...impact,
            sector: weights.find((w) => w.ticker === impact.ticker)?.sector ?? "",
          })),
          portfolioImpact: selected.portfolioImpact,
          loss: selected.loss,
          largestContributor: selected.largestContributor,
          limitStatus: selected.limitStatus,
        }
      : custom;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <Panel className="xl:col-span-7">
        <PanelHeader>
          <div className="flex items-center gap-1.5">
            <PanelTitle>Scenario definition</PanelTitle>
            <InfoTooltip
              label="stress testing"
              content="Applies a set of price shocks to the current weights and reports the resulting portfolio impact. It answers 'what if this happened', not 'how likely is this'."
            />
          </div>
          {mode === "custom" && (
            <Button
              variant="ghost"
              className="min-h-9 px-2 text-[12px]"
              onClick={() => setShocks(weights.map(() => -0.08))}
            >
              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
              Reset
            </Button>
          )}
        </PanelHeader>

        <PanelBody className="flex flex-col gap-4">
          <SegmentedControl<"historical" | "custom">
            label="Scenario type"
            value={mode}
            onChange={setMode}
            options={[
              { value: "historical", label: "Historical" },
              { value: "custom", label: "Custom shocks" },
            ]}
          />

          {mode === "historical" ? (
            <div className="flex flex-col gap-3">
              <Eyebrow>Episode</Eyebrow>
              <div className="flex flex-col gap-2">
                {scenarios.map((scenario) => {
                  const isSelected = scenario.id === selected?.id;
                  return (
                    <button
                      key={scenario.id}
                      type="button"
                      onClick={() => setScenarioId(scenario.id)}
                      aria-pressed={isSelected}
                      className={cn(
                        "flex flex-col gap-1 rounded-md border p-3 text-left transition-colors duration-150",
                        isSelected
                          ? "border-aqua/50 bg-[var(--aqua-soft)]"
                          : "border-line bg-bg hover:border-line-strong",
                      )}
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span
                          className={cn(
                            "text-[13px] font-[650]",
                            isSelected ? "text-aqua" : "text-ink",
                          )}
                        >
                          {scenario.label}
                        </span>
                        <span className="tabular font-mono text-[13px] text-coral">
                          {formatSignedPercent(scenario.portfolioImpact)}
                        </span>
                      </span>
                      <span className="text-[11px] text-ink-muted">
                        {scenario.periodStart && scenario.periodEnd
                          ? `${formatDate(scenario.periodStart)} – ${formatDate(scenario.periodEnd)}`
                          : scenario.description}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] leading-snug text-ink-muted">
                Each episode is a real interval located in the dataset and replayed
                against the current weights, not a constructed shock vector. Being the
                worst stretch in the sample says nothing about the next one.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Eyebrow>Asset shocks</Eyebrow>
              {custom.impacts.map((row, i) => (
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
                    onChange={(e) =>
                      setShocks((prev) =>
                        prev.map((s, index) => (index === i ? Number(e.target.value) : s)),
                      )
                    }
                    className="h-1.5 flex-1 accent-[var(--coral)]"
                    aria-valuetext={formatSignedPercent(row.shock, 1)}
                  />
                  <span className="tabular w-16 shrink-0 text-right font-mono text-[12px] text-ink-secondary">
                    {formatSignedPercent(row.shock, 1)}
                  </span>
                </div>
              ))}
              <p className="text-[11px] leading-snug text-ink-muted">
                A hypothetical vector you define. Because the shocks are set by hand, the
                result reflects your assumptions about how these assets move together —
                which the historical episodes measure instead of assuming.
              </p>
            </div>
          )}
        </PanelBody>
      </Panel>

      <Panel className="xl:col-span-5">
        <PanelHeader>
          <PanelTitle>Scenario result</PanelTitle>
          <Badge tone={STATUS_TONE[active.limitStatus]}>
            {STATUS_LABEL[active.limitStatus]}
          </Badge>
        </PanelHeader>

        <PanelBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Eyebrow>Estimated portfolio impact</Eyebrow>
            <span
              className={cn(
                "tabular font-mono text-[34px] font-[650] leading-none",
                active.portfolioImpact < 0 ? "text-coral" : "text-ink",
              )}
            >
              {formatSignedPercent(active.portfolioImpact)}
            </span>
            {notionalValue !== null && (
              <span className="text-[12px] text-ink-muted">
                {formatNotional(notionalValue * active.portfolioImpact)} on a simulated
                notional of {formatNotional(notionalValue)}
              </span>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-3 border-y border-line py-3">
            <div className="flex flex-col gap-0.5">
              <dt>
                <Eyebrow>Largest contributor</Eyebrow>
              </dt>
              <dd className="font-mono text-[15px] text-ink">
                {active.largestContributor ?? "—"}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt>
                <Eyebrow>Stress limit</Eyebrow>
              </dt>
              <dd className="tabular font-mono text-[15px] text-ink">
                {formatPercent(limits.maxStressLossPct, 1)}
              </dd>
              <dd className="text-[11px] text-ink-muted">
                Loss {formatPercent(active.loss, 2)}
              </dd>
            </div>
          </dl>

          <div className="flex flex-col gap-2">
            <Eyebrow>Impact by asset</Eyebrow>
            <div className="overflow-x-auto">
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
                  {active.impacts.map((row) => (
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
                      {formatSignedPercent(active.portfolioImpact)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}
