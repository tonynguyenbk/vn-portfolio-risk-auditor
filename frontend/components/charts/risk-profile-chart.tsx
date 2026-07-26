"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Button } from "@/components/ui/button";
import { downsample } from "@/lib/chart-utils";
import { formatDate, formatNumber, formatPercent } from "@/lib/format";
import type { BacktestPoint, CurvePoint } from "@/types/analysis";

type View = "portfolio" | "loss";
type Range = "1Y" | "3Y" | "5Y" | "ALL";

const RANGE_DAYS: Record<Range, number> = {
  "1Y": 252,
  "3Y": 756,
  "5Y": 1260,
  ALL: Number.MAX_SAFE_INTEGER,
};

/**
 * One flat row type for both views. Recharts ignores keys a series does not
 * reference, and a single shape keeps the data table below the chart simple.
 */
interface ChartRow {
  date: string;
  portfolio?: number;
  benchmark?: number | null;
  loss?: number;
  varThreshold?: number;
  exception?: number | null;
}

interface RiskProfileChartProps {
  wealthCurve: CurvePoint[];
  benchmarkCurve: CurvePoint[] | null;
  backtestSeries: BacktestPoint[];
  confidenceLabel: string;
  modelLabel: string;
}

interface TooltipEntry {
  name?: string;
  dataKey?: string | number;
  value?: number | string;
  color?: string;
}

function ChartTooltip({
  active,
  payload,
  label,
  view,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  view: View;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border border-line-strong bg-bg-elevated p-2.5 shadow-[var(--shadow-panel)]">
      <p className="mb-1.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted">
        {typeof label === "string" ? formatDate(label) : label}
      </p>
      <ul className="flex flex-col gap-1">
        {payload
          .filter((entry) => entry.value !== null && entry.value !== undefined)
          .map((entry) => (
            <li
              key={String(entry.dataKey)}
              className="flex items-center gap-2 text-[12px] text-ink-secondary"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="flex-1">{entry.name}</span>
              <span className="tabular font-mono text-ink">
                {view === "portfolio"
                  ? formatNumber(Number(entry.value))
                  : formatPercent(Number(entry.value))}
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}

export function RiskProfileChart({
  wealthCurve,
  benchmarkCurve,
  backtestSeries,
  confidenceLabel,
  modelLabel,
}: RiskProfileChartProps) {
  const [view, setView] = useState<View>("portfolio");
  const [range, setRange] = useState<Range>("ALL");
  const [showTable, setShowTable] = useState(false);

  const data = useMemo<ChartRow[]>(() => {
    const take = RANGE_DAYS[range];

    if (view === "portfolio") {
      const wealth = wealthCurve.slice(-take);
      const benchmark = benchmarkCurve?.slice(-take) ?? [];
      const benchmarkByDate = new Map(benchmark.map((p) => [p.date, p.value]));
      return downsample(
        wealth.map((p) => ({
          date: p.date,
          portfolio: p.value,
          benchmark: benchmarkByDate.get(p.date) ?? null,
        })),
      );
    }

    return downsample(
      backtestSeries.slice(-take).map((p) => ({
        date: p.date,
        loss: p.loss,
        varThreshold: p.varThreshold,
        // Scatter only renders points with a value, so non-exceptions are null.
        exception: p.isException ? p.loss : null,
      })),
    );
  }, [view, range, wealthCurve, benchmarkCurve, backtestSeries]);

  const axisStyle = { fill: "var(--text-muted)", fontSize: 11 };

  return (
    <Panel>
      <PanelHeader>
        <div className="flex items-center gap-1.5">
          <PanelTitle>Portfolio risk profile</PanelTitle>
          <InfoTooltip
            label="the risk profile chart"
            content="Portfolio view shows a normalised wealth index starting at 100. Loss view shows each day's realised loss against the VaR threshold forecast for that day, with breaches marked."
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl<View>
            label="Chart view"
            value={view}
            onChange={setView}
            className="w-auto"
            options={[
              { value: "portfolio", label: "Portfolio" },
              { value: "loss", label: "Loss" },
            ]}
          />
          <SegmentedControl<Range>
            label="Date range"
            value={range}
            onChange={setRange}
            className="w-auto"
            options={[
              { value: "1Y", label: "1Y" },
              { value: "3Y", label: "3Y" },
              { value: "5Y", label: "5Y" },
              { value: "ALL", label: "All" },
            ]}
          />
        </div>
      </PanelHeader>

      <PanelBody className="pr-2">
        <div className="h-[320px] w-full sm:h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="date"
                tick={axisStyle}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                minTickGap={48}
                tickFormatter={(value: string) => value.slice(0, 7)}
              />
              <YAxis
                tick={axisStyle}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(value: number) =>
                  view === "portfolio" ? value.toFixed(0) : `${(value * 100).toFixed(1)}%`
                }
              />
              <Tooltip
                content={<ChartTooltip view={view} />}
                cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, color: "var(--text-secondary)", paddingTop: 8 }}
                iconType="plainline"
              />

              {view === "portfolio" ? (
                <>
                  <Line
                    type="monotone"
                    dataKey="portfolio"
                    name="Portfolio (index, 100 = start)"
                    stroke="var(--aqua)"
                    strokeWidth={1.8}
                    dot={false}
                    isAnimationActive={false}
                  />
                  {benchmarkCurve && (
                    <Line
                      type="monotone"
                      dataKey="benchmark"
                      name="VNINDEX benchmark"
                      stroke="var(--text-muted)"
                      strokeWidth={1.2}
                      strokeDasharray="4 4"
                      dot={false}
                      isAnimationActive={false}
                    />
                  )}
                </>
              ) : (
                <>
                  <Line
                    type="monotone"
                    dataKey="loss"
                    name="Realised loss"
                    stroke="var(--blue)"
                    strokeWidth={1.1}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="varThreshold"
                    name={`VaR ${confidenceLabel} threshold — ${modelLabel}`}
                    stroke="var(--coral)"
                    strokeWidth={1.6}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Scatter
                    dataKey="exception"
                    name="Exception (loss above threshold)"
                    fill="var(--coral)"
                    shape="circle"
                    isAnimationActive={false}
                  />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* PRD 15.4 - chart data must also be reachable as a table. */}
        <div className="mt-3 flex justify-end">
          <Button
            variant="ghost"
            className="min-h-9 px-2 text-[12px]"
            onClick={() => setShowTable((v) => !v)}
            aria-expanded={showTable}
          >
            {showTable ? "Hide" : "Show"} chart data as a table
          </Button>
        </div>

        {showTable && (
          <div className="mt-2 max-h-72 overflow-auto rounded-md border border-line">
            <table className="w-full text-left text-[12px]">
              <caption className="sr-only">
                Underlying values for the portfolio risk profile chart
              </caption>
              <thead className="sticky top-0 bg-surface-2 text-ink-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Date</th>
                  {view === "portfolio" ? (
                    <>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Portfolio</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Benchmark</th>
                    </>
                  ) : (
                    <>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Loss</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">VaR</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Exception</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="text-ink-secondary">
                {data.map((row) => (
                  <tr key={row.date} className="border-t border-line">
                    <td className="px-3 py-1.5">{formatDate(row.date)}</td>
                    {view === "portfolio" ? (
                      <>
                        <td className="tabular px-3 py-1.5 text-right font-mono">
                          {formatNumber(row.portfolio ?? null)}
                        </td>
                        <td className="tabular px-3 py-1.5 text-right font-mono">
                          {formatNumber(row.benchmark ?? null)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="tabular px-3 py-1.5 text-right font-mono">
                          {formatPercent(row.loss ?? null)}
                        </td>
                        <td className="tabular px-3 py-1.5 text-right font-mono">
                          {formatPercent(row.varThreshold ?? null)}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {row.exception != null ? "Yes" : "—"}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}
