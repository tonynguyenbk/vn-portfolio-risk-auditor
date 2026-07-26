import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { formatDateRange, formatNumber } from "@/lib/format";
import type { AnalysisMetadata, Assumptions } from "@/types/analysis";

/**
 * PRD 0.9 requires every risk result to be shown together with the assumptions
 * that produced it. Rendering them once per page, next to the numbers, is what
 * makes the results reproducible by a reader rather than merely plausible.
 */
export function AssumptionsFooter({
  assumptions,
  metadata,
}: {
  assumptions: Assumptions;
  metadata: AnalysisMetadata;
}) {
  const rows: { label: string; value: string }[] = [
    { label: "Analysis period", value: formatDateRange(metadata.startDate, metadata.endDate) },
    { label: "Return definition", value: "Logarithmic daily returns" },
    { label: "Rolling window", value: `${assumptions.rollingWindow} trading observations` },
    { label: "Forecast horizon", value: `${assumptions.forecastHorizonDays} trading day` },
    { label: "Annualisation", value: `√${assumptions.tradingDaysPerYear} convention` },
    { label: "Quantile method", value: assumptions.quantileMethod },
    { label: "EWMA decay (λ)", value: formatNumber(assumptions.ewmaLambda, 2) },
    { label: "Price basis", value: assumptions.priceBasis === "close" ? "Closing price" : "Adjusted close" },
    {
      label: "Weighting",
      value: assumptions.weightsFixed
        ? "Fixed weights, no rebalancing modelled"
        : "Time-varying weights",
    },
    { label: "Sign convention", value: "Losses and VaR reported as positive magnitudes" },
  ];

  return (
    <Panel className="print-block">
      <PanelHeader>
        <PanelTitle>Assumptions and limitations</PanelTitle>
      </PanelHeader>
      <PanelBody className="flex flex-col gap-4">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex justify-between gap-4 border-b border-line/60 pb-1.5"
            >
              <dt className="text-[12px] text-ink-muted">{row.label}</dt>
              <dd className="text-right text-[12px] text-ink-secondary">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-col gap-2 rounded-md border border-line bg-bg/40 p-3">
          <p className="text-[12px] leading-relaxed text-ink-secondary">
            <span className="font-[650] text-ink">What this does not tell you.</span>{" "}
            Every figure above is backward-looking. A model that reproduced past losses
            well can still fail when market behaviour changes. Correlations rise under
            stress, fixed weights ignore rebalancing and transaction costs, and no
            liquidity effects are modelled. The 99% results rest on a small number of
            tail observations and should be read with particular caution.
          </p>
          <p className="text-[12px] leading-relaxed text-ink-muted">
            This prototype is for education and research. It does not provide investment
            advice, predict market direction, execute trades, or represent a production
            risk-management system.
          </p>
        </div>
      </PanelBody>
    </Panel>
  );
}
