"use client";

import { useMemo, useState } from "react";
import { Calculator, RotateCcw } from "lucide-react";
import { useAnalysisParams } from "@/components/analysis-params-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Eyebrow, Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  formatConfidence,
  formatPercent,
  formatVnd,
  formatVndInput,
  parseVndInput,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  maxEquityFraction,
  portfolioLogReturns,
  resetWeights,
  setWeight,
  summariseRisk,
  type RiskSummary,
  type WhatIfInputs,
} from "@/lib/what-if";
import type { ConfidenceLevel } from "@/types/analysis";

/**
 * The interactive part of the What-if page.
 *
 * Everything is recomputed in the browser from the aligned asset returns on
 * each change, through `lib/what-if.ts`, whose figures are pinned to the
 * Python engine by a parity test. Nothing here recommends a trade: the page
 * shows how the historical risk figures move when the user changes the mix.
 */

export const DEFAULT_CAPITAL_VND = 500_000_000;
export const DEFAULT_TOLERANCE_VND = 10_000_000;

type Direction = "up" | "down" | "flat";

/** Risk direction of a change; `magnitude` maps a value to "how much risk". */
function direction(
  original: number | null,
  next: number | null,
  magnitude: (v: number) => number = (v) => v,
): Direction | null {
  if (original === null || next === null) return null;
  const d = magnitude(next) - magnitude(original);
  if (Math.abs(d) < 1e-12) return "flat";
  return d > 0 ? "up" : "down";
}

function Delta({
  dir,
  text,
}: {
  dir: Direction | null;
  text: string;
}) {
  if (dir === null) return <span className="text-ink-muted">—</span>;
  if (dir === "flat") return <span className="text-ink-muted">No change</span>;
  return (
    <span className={cn(dir === "up" ? "text-coral" : "text-aqua")}>
      <span aria-hidden="true">{dir === "up" ? "▲" : "▼"}</span>{" "}
      {text}
      <span className="sr-only">{dir === "up" ? " more risk" : " less risk"}</span>
    </span>
  );
}

function pp(a: number | null, b: number | null): string {
  if (a === null || b === null) return "—";
  return `${(Math.abs(b - a) * 100).toFixed(2)} pp`;
}

interface MetricRow {
  label: string;
  definition: string;
  original: number | null;
  next: number | null;
  /** Show a VND equivalent under the percentage. */
  money?: boolean;
  /** Drawdown is negative; its risk is its magnitude. */
  magnitude?: (v: number) => number;
}

export function WhatIfWorkbench({
  inputs,
  originalWeights,
}: {
  inputs: WhatIfInputs;
  /** The analysed portfolio's weights, in `inputs.tickers` order. */
  originalWeights: number[];
}) {
  const { params, setParams } = useAnalysisParams();
  const confidence = params.confidence;
  const tickers = inputs.tickers;

  const [weights, setWeights] = useState<number[]>(() => resetWeights(originalWeights));
  const [fraction, setFraction] = useState(1);
  const [capital, setCapital] = useState(DEFAULT_CAPITAL_VND);
  const [tolerance, setTolerance] = useState(DEFAULT_TOLERANCE_VND);
  const [maxResult, setMaxResult] = useState<{ fraction: number; signature: string } | null>(
    null,
  );

  const original = useMemo(
    () => summariseRisk(inputs, originalWeights, 1, confidence),
    [inputs, originalWeights, confidence],
  );
  const whatIf = useMemo(
    () => summariseRisk(inputs, weights, fraction, confidence),
    [inputs, weights, fraction, confidence],
  );

  const tolerancePct = capital > 0 ? tolerance / capital : null;
  const whatIfEsVnd = whatIf.expectedShortfall === null ? null : whatIf.expectedShortfall * capital;
  const withinLimit = whatIfEsVnd === null || capital <= 0 ? null : whatIfEsVnd <= tolerance;

  // The f* result describes the inputs it was computed for; once any of them
  // changes it is hidden rather than left on screen describing something else.
  const signature = `${weights.join(",")}|${capital}|${tolerance}|${confidence}`;
  const maxShown = maxResult && maxResult.signature === signature ? maxResult : null;

  const computeMaxFraction = () => {
    if (tolerancePct === null) return;
    const portfolioLog = portfolioLogReturns(inputs.assetReturns, weights);
    const f = maxEquityFraction(portfolioLog, confidence, tolerancePct);
    if (f === null) return;
    setFraction(f);
    setMaxResult({ fraction: f, signature });
  };

  const confLabel = formatConfidence(confidence);
  const rows: MetricRow[] = [
    {
      label: `VaR ${confLabel}, 1-day`,
      definition:
        "Historical simulation: the one-day loss exceeded on the worst days of the sample at this confidence level. Says nothing about how much worse those days were.",
      original: original.var,
      next: whatIf.var,
      money: true,
    },
    {
      label: `Expected shortfall ${confLabel}`,
      definition:
        "The average one-day loss on the days at or beyond the VaR threshold — what the tail actually looked like.",
      original: original.expectedShortfall,
      next: whatIf.expectedShortfall,
      money: true,
    },
    {
      label: "Annual volatility",
      definition:
        "Sample standard deviation of daily log returns × √252. Dispersion in both directions, not a loss measure.",
      original: original.annualisedVolatility,
      next: whatIf.annualisedVolatility,
    },
    {
      label: "Maximum drawdown",
      definition:
        "Deepest peak-to-trough decline of the wealth curve over the full sample.",
      original: original.maximumDrawdown,
      next: whatIf.maximumDrawdown,
      magnitude: (v) => -v,
    },
    {
      label: "Worst 5-day loss",
      definition:
        "Largest loss over any five consecutive trading days in the sample — the worst trading week.",
      original: original.worstFiveDayLoss,
      next: whatIf.worstFiveDayLoss,
      money: true,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* ---------------------------------------------------------------- */}
        <Panel className="xl:col-span-5">
          <PanelHeader>
            <div className="flex items-center gap-1.5">
              <PanelTitle>Your mix</PanelTitle>
              <InfoTooltip
                label="the What-if mix"
                content="Change how much of your capital is in equities and how the equity part is split. Cash is assumed to earn nothing. Every figure on the right is recomputed from the same historical prices."
              />
            </div>
            <Button
              variant="ghost"
              className="min-h-9 px-2 text-[12px]"
              onClick={() => {
                setWeights(resetWeights(originalWeights));
                setFraction(1);
              }}
            >
              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
              Reset to original
            </Button>
          </PanelHeader>

          <PanelBody className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="what-if-fraction">
                  <Eyebrow>Equity fraction</Eyebrow>
                </label>
                <span className="text-[11px] text-ink-muted">
                  Cash {formatPercent(1 - fraction, 1)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  id="what-if-fraction"
                  type="range"
                  min={0}
                  max={1}
                  step={0.005}
                  value={fraction}
                  onChange={(e) => setFraction(Number(e.target.value))}
                  className="h-1.5 flex-1 accent-[var(--aqua)]"
                  aria-valuetext={`${formatPercent(fraction, 1)} in equities`}
                />
                <PercentInput
                  label="Equity fraction, percent"
                  value={fraction}
                  onChange={(v) => setFraction(Math.min(1, Math.max(0, v)))}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-line pt-4">
              <div className="flex items-baseline justify-between gap-3">
                <Eyebrow>Equity sleeve weights</Eyebrow>
                <span className="text-[11px] text-ink-muted">Always sums to 100%</span>
              </div>
              {tickers.map((ticker, i) => (
                <div key={ticker} className="flex items-center gap-3">
                  <label
                    htmlFor={`what-if-weight-${ticker}`}
                    className="w-16 shrink-0 truncate font-mono text-[12px] text-ink"
                  >
                    {ticker}
                  </label>
                  <input
                    id={`what-if-weight-${ticker}`}
                    type="range"
                    min={0}
                    max={1}
                    step={0.005}
                    value={weights[i]}
                    onChange={(e) => setWeights((w) => setWeight(w, i, Number(e.target.value)))}
                    className="h-1.5 min-w-0 flex-1 accent-[var(--aqua)]"
                    aria-valuetext={formatPercent(weights[i], 1)}
                  />
                  <PercentInput
                    label={`${ticker} weight, percent`}
                    value={weights[i]}
                    onChange={(v) => setWeights((w) => setWeight(w, i, v))}
                  />
                </div>
              ))}
              <p className="text-[11px] leading-snug text-ink-muted">
                Moving one weight rescales the others in proportion, so the equity part
                stays fully invested. Original:{" "}
                {tickers
                  .map((t, i) => `${t} ${formatPercent(originalWeights[i], 0)}`)
                  .join(", ")}
                .
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 border-t border-line pt-4">
              <Field label="Capital (VND)">
                {(id) => (
                  <Input
                    id={id}
                    inputMode="numeric"
                    value={formatVndInput(capital)}
                    onChange={(e) => setCapital(parseVndInput(e.target.value))}
                    className="tabular font-mono"
                  />
                )}
              </Field>
              <Field
                label="Max one-day loss I can tolerate (VND)"
                hint={
                  tolerancePct === null
                    ? "Enter a capital amount above zero."
                    : `${formatPercent(tolerancePct, 2)} of capital`
                }
              >
                {(id) => (
                  <Input
                    id={id}
                    inputMode="numeric"
                    value={formatVndInput(tolerance)}
                    onChange={(e) => setTolerance(parseVndInput(e.target.value))}
                    className="tabular font-mono"
                  />
                )}
              </Field>
            </div>

            <div className="flex flex-col gap-2 border-t border-line pt-4">
              <Eyebrow>Confidence</Eyebrow>
              <SegmentedControl<ConfidenceLevel>
                label="Confidence level"
                value={confidence}
                onChange={(c) => setParams({ confidence: c })}
                options={[
                  { value: 0.95, label: "95%" },
                  { value: 0.99, label: "99%" },
                ]}
              />
              <p className="text-[11px] leading-snug text-ink-muted">
                Shared with the analysis controls, so it stays in step with the rest of
                the dashboard.
              </p>
            </div>
          </PanelBody>
        </Panel>

        {/* ---------------------------------------------------------------- */}
        <div className="flex flex-col gap-4 xl:col-span-7">
          <Panel>
            <PanelHeader>
              <div className="flex items-center gap-1.5">
                <PanelTitle>Original vs What-if</PanelTitle>
                <InfoTooltip
                  label="this comparison"
                  content="Original is the analysed portfolio, fully invested. What-if is your mix above. Both are measured over the same historical days."
                />
              </div>
              {withinLimit !== null && (
                <Badge tone={withinLimit ? "aqua" : "coral"}>
                  {withinLimit ? "Within your limit" : "Above your limit"}
                </Badge>
              )}
            </PanelHeader>

            <PanelBody className="flex flex-col gap-4">
              <StatusLine
                withinLimit={withinLimit}
                esVnd={whatIfEsVnd}
                tolerance={tolerance}
                confLabel={confLabel}
              />

              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-[13px]">
                  <caption className="sr-only">
                    Risk figures for the original portfolio and the What-if mix, with the
                    change between them
                  </caption>
                  <thead className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">
                    <tr>
                      <th scope="col" className="pb-2 font-medium">Measure</th>
                      <th scope="col" className="pb-2 text-right font-medium">Original</th>
                      <th scope="col" className="pb-2 text-right font-medium">What-if</th>
                      <th scope="col" className="pb-2 text-right font-medium">Change</th>
                    </tr>
                  </thead>
                  <tbody className="text-ink-secondary">
                    {rows.map((row) => {
                      const dir = direction(row.original, row.next, row.magnitude);
                      return (
                        <tr key={row.label} className="border-t border-line align-top">
                          <th scope="row" className="py-2 pr-2 font-normal text-ink">
                            <span className="inline-flex items-center gap-1">
                              {row.label}
                              <InfoTooltip label={row.label} content={row.definition} />
                            </span>
                          </th>
                          <ValueCell value={row.original} money={row.money} capital={capital} />
                          <ValueCell
                            value={row.next}
                            money={row.money}
                            capital={capital}
                            strong
                          />
                          <td className="tabular py-2 text-right font-mono text-[12px]">
                            <Delta dir={dir} text={pp(row.original, row.next)} />
                            {row.money && row.original !== null && row.next !== null && (
                              <span className="block text-[11px] text-ink-muted">
                                {formatVnd(Math.abs(row.next - row.original) * capital)}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] leading-snug text-ink-muted">
                Losses are shown as positive figures, drawdown as negative. ▲ means more
                risk than the original, ▼ less. VND amounts are the loss on the capital
                entered, cash included.
              </p>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader>
              <div className="flex items-center gap-1.5">
                <PanelTitle>Equity fraction within your limit</PanelTitle>
                <InfoTooltip
                  label="the equity fraction rule"
                  content="The largest share of capital in equities whose historical expected shortfall stays at or below the one-day loss you said you can tolerate, keeping the equity weights as they are."
                />
              </div>
            </PanelHeader>
            <PanelBody className="flex flex-col gap-3">
              <Button
                variant="primary"
                className="self-start"
                onClick={computeMaxFraction}
                disabled={tolerancePct === null}
              >
                <Calculator aria-hidden="true" className="h-4 w-4" />
                Max equity fraction within my limit
              </Button>
              {maxShown && (
                <MaxFractionResult
                  fraction={maxShown.fraction}
                  esFullPct={fullEquityEs(inputs, weights, confidence)}
                  capital={capital}
                  tolerance={tolerance}
                  confLabel={confLabel}
                />
              )}
              <p className="text-[12px] leading-relaxed text-ink-secondary">
                This is transparent arithmetic, not an optimiser. Holding a fraction{" "}
                <span className="font-mono">f</span> in equities and the rest in cash
                scales every past daily loss by <span className="font-mono">f</span>, so
                the expected shortfall scales by <span className="font-mono">f</span>{" "}
                too. The largest fraction within your limit is therefore{" "}
                <span className="font-mono">
                  min(100%, tolerated loss ÷ expected shortfall at 100% equity)
                </span>
                , checked against the loss series itself.
              </p>
              <p className="text-[12px] leading-relaxed text-ink-muted">
                It is computed from past data and is not a forecast. A future day can be
                worse than anything in the sample, and the button sets only the equity
                fraction — it never suggests which stocks to buy or sell.
              </p>
            </PanelBody>
          </Panel>
        </div>
      </div>

      <ContributionPanel original={original} whatIf={whatIf} tickers={tickers} weights={weights} originalWeights={originalWeights} fraction={fraction} />
    </div>
  );
}

function fullEquityEs(inputs: WhatIfInputs, weights: number[], confidence: number) {
  return summariseRisk(inputs, weights, 1, confidence).expectedShortfall;
}

function PercentInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      <input
        type="number"
        aria-label={label}
        min={0}
        max={100}
        step={0.1}
        value={Number((value * 100).toFixed(1))}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v / 100);
        }}
        className="tabular h-9 w-[4.5rem] rounded-md border border-line bg-bg px-2 text-right font-mono text-[12px] text-ink transition-colors duration-150 hover:border-line-strong"
      />
      <span className="text-[12px] text-ink-muted">%</span>
    </span>
  );
}

function ValueCell({
  value,
  money,
  capital,
  strong,
}: {
  value: number | null;
  money?: boolean;
  capital: number;
  strong?: boolean;
}) {
  return (
    <td className="tabular py-2 text-right font-mono">
      <span className={cn(strong ? "text-ink" : "text-ink-secondary")}>
        {formatPercent(value)}
      </span>
      {money && (
        <span className="block text-[11px] text-ink-muted">
          {value === null ? "—" : formatVnd(value * capital)}
        </span>
      )}
    </td>
  );
}

function StatusLine({
  withinLimit,
  esVnd,
  tolerance,
  confLabel,
}: {
  withinLimit: boolean | null;
  esVnd: number | null;
  tolerance: number;
  confLabel: string;
}) {
  if (withinLimit === null || esVnd === null) {
    return (
      <p className="text-[12px] text-ink-muted">
        Enter a capital amount to compare the expected shortfall with your limit.
      </p>
    );
  }
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-[12px] leading-snug",
        withinLimit
          ? "border-aqua/40 bg-[var(--aqua-soft)] text-ink-secondary"
          : "border-coral/40 bg-[var(--coral-soft)] text-ink-secondary",
      )}
      role="status"
    >
      <span className={cn("font-[650]", withinLimit ? "text-aqua" : "text-coral")}>
        {withinLimit ? "Within your limit." : "Above your limit."}
      </span>{" "}
      On the worst {confLabel === "95%" ? "5%" : "1%"} of past days, this mix lost{" "}
      <span className="font-mono text-ink">{formatVnd(esVnd)}</span> on average (expected
      shortfall {confLabel}), against the{" "}
      <span className="font-mono text-ink">{formatVnd(tolerance)}</span> you said you can
      tolerate.
    </div>
  );
}

function MaxFractionResult({
  fraction,
  esFullPct,
  capital,
  tolerance,
  confLabel,
}: {
  fraction: number;
  esFullPct: number | null;
  capital: number;
  tolerance: number;
  confLabel: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-line bg-bg p-3" role="status">
      <Eyebrow>Largest equity fraction within your limit</Eyebrow>
      <span className="tabular font-mono text-[28px] font-[650] leading-none text-aqua">
        {formatPercent(fraction, 1)}
      </span>
      <span className="text-[12px] text-ink-muted">
        {fraction >= 1
          ? `Even fully invested, the expected shortfall ${confLabel} (${formatVnd(
              esFullPct === null ? null : esFullPct * capital,
            )}) is within ${formatVnd(tolerance)}.`
          : `${formatVnd(tolerance)} ÷ ${formatVnd(
              esFullPct === null ? null : esFullPct * capital,
            )} expected shortfall ${confLabel} at 100% equity. Applied to the slider above; the rest stays in cash.`}
      </span>
    </div>
  );
}

function ContributionPanel({
  original,
  whatIf,
  tickers,
  weights,
  originalWeights,
  fraction,
}: {
  original: RiskSummary;
  whatIf: RiskSummary;
  tickers: string[];
  weights: number[];
  originalWeights: number[];
  fraction: number;
}) {
  return (
    <Panel>
      <PanelHeader>
        <div className="flex items-center gap-1.5">
          <PanelTitle>Risk contribution vs weight</PanelTitle>
          <InfoTooltip
            label="risk contribution"
            content="Each holding's share of portfolio volatility (Euler decomposition of the sample covariance of daily log returns). A holding can carry far more of the risk than of the money."
          />
        </div>
      </PanelHeader>
      <PanelBody className="flex flex-col gap-3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[13px]">
            <caption className="sr-only">
              Weight and share of volatility for each holding, original and What-if
            </caption>
            <thead className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">
              <tr>
                <th scope="col" className="pb-2 font-medium">Asset</th>
                <th scope="col" className="pb-2 text-right font-medium">Original weight</th>
                <th scope="col" className="pb-2 text-right font-medium">Original risk</th>
                <th scope="col" className="pb-2 text-right font-medium">What-if weight</th>
                <th scope="col" className="pb-2 text-right font-medium">What-if risk</th>
                <th scope="col" className="pb-2 pl-4 font-medium">Risk share</th>
              </tr>
            </thead>
            <tbody className="text-ink-secondary">
              {tickers.map((ticker, i) => {
                const share = whatIf.contributions?.[i]?.contributionPct ?? null;
                return (
                  <tr key={ticker} className="border-t border-line">
                    <td className="py-2 font-mono text-ink">{ticker}</td>
                    <td className="tabular py-2 text-right font-mono">
                      {formatPercent(originalWeights[i], 1)}
                    </td>
                    <td className="tabular py-2 text-right font-mono">
                      {formatPercent(original.contributions?.[i]?.contributionPct ?? null, 1)}
                    </td>
                    <td className="tabular py-2 text-right font-mono text-ink">
                      {formatPercent(weights[i] * fraction, 1)}
                    </td>
                    <td className="tabular py-2 text-right font-mono text-ink">
                      {formatPercent(share, 1)}
                    </td>
                    <td className="py-2 pl-4">
                      <span
                        className="flex h-1.5 w-full min-w-16 overflow-hidden rounded-full bg-bg"
                        role="img"
                        aria-label={`${ticker} carries ${formatPercent(share, 1)} of What-if volatility`}
                      >
                        <span
                          className="block h-full rounded-full bg-aqua/70"
                          style={{ width: `${share === null ? 0 : Math.max(2, share * 100)}%` }}
                        />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-line-strong text-ink-muted">
                <td className="pt-2 text-[12px]">Cash</td>
                <td className="tabular pt-2 text-right font-mono text-[12px]">0.0%</td>
                <td className="tabular pt-2 text-right font-mono text-[12px]">0.0%</td>
                <td className="tabular pt-2 text-right font-mono text-[12px]">
                  {formatPercent(1 - fraction, 1)}
                </td>
                <td className="tabular pt-2 text-right font-mono text-[12px]">0.0%</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-[11px] leading-snug text-ink-muted">
          Weights are shares of total capital. Cash has no volatility, so it carries none
          of the risk; holding more of it shrinks every figure above but leaves each
          holding&apos;s share of the remaining risk unchanged. Daily portfolio volatility:{" "}
          <span className="font-mono">{formatPercent(original.portfolioVolatilityDaily)}</span>{" "}
          original,{" "}
          <span className="font-mono">{formatPercent(whatIf.portfolioVolatilityDaily)}</span>{" "}
          What-if.
        </p>
      </PanelBody>
    </Panel>
  );
}
