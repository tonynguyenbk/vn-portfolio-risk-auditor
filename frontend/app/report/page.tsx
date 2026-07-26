import { SimulatedDataNotice } from "@/components/feedback/simulated-data-notice";
import { AssumptionsFooter } from "@/components/panels/assumptions-footer";
import { ModelAuditTable } from "@/components/panels/model-audit-table";
import { PrintButton } from "@/components/report/print-button";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { DEFAULT_LIMITS, demoAnalysis, demoBacktest } from "@/lib/demo-data";
import { formatDateRange, formatPercent } from "@/lib/format";
import { MODEL_LABELS, type BacktestSummaryRow } from "@/types/analysis";

/**
 * Selects the model whose exception rate sits closest to its target, among
 * those the Kupiec test did not reject.
 *
 * PRD 12 forbids choosing a model merely because it reports the smallest VaR,
 * and requires an honest "no single model dominates" outcome when the criteria
 * disagree. The full multi-criteria rule (severity, stability across volatility
 * regimes) arrives with Phase 4; this covers calibration only, and says so.
 */
function bestCalibratedModel(rows: BacktestSummaryRow[]): string {
  const passing = rows.filter((row) => row.result === "pass");
  if (passing.length === 0) return "Inconclusive — no tested model passed the Kupiec test";

  const scored = passing
    .map((row) => ({
      row,
      distance: Math.abs(row.exceptionRate - (1 - row.confidence)),
    }))
    .sort((a, b) => a.distance - b.distance);

  // A near-tie is not a meaningful ranking.
  if (scored.length > 1 && Math.abs(scored[0].distance - scored[1].distance) < 0.0015) {
    return "No single model dominates all evaluation criteria";
  }

  return MODEL_LABELS[scored[0].row.model];
}

export default function ReportPage() {
  const analysis = demoAnalysis;
  const backtestSummary = demoBacktest.summary;
  const { metrics, metadata, concentration, limits } = analysis;

  const var95 = metrics.var.find((v) => v.model === "historical" && v.confidence === 0.95);
  const es95 = metrics.expectedShortfall.find((e) => e.confidence === 0.95);
  const topContributor = [...analysis.riskContribution].sort(
    (a, b) => b.contributionPct - a.contributionPct,
  )[0];

  const summaryRows: { label: string; value: string }[] = [
    { label: "Dataset", value: metadata.datasetName },
    {
      label: "Data period",
      value: formatDateRange(metadata.startDate, metadata.endDate),
    },
    { label: "Number of assets", value: String(metadata.assets) },
    { label: "Annualised volatility", value: formatPercent(metrics.annualisedVolatility) },
    { label: "Maximum drawdown", value: formatPercent(metrics.maximumDrawdown.value) },
    { label: "One-day VaR 95%", value: formatPercent(var95?.value ?? null) },
    { label: "Expected shortfall 95%", value: formatPercent(es95?.value ?? null) },
    { label: "Largest risk contributor", value: topContributor.ticker },
    { label: "Best-calibrated tested model", value: bestCalibratedModel(backtestSummary) },
    { label: "Risk-limit warnings", value: String(limits.warnings.length) },
    {
      label: "Largest concentration",
      value: concentration
        ? `${formatPercent(concentration.largestWeight, 1)} in ${concentration.largestWeightTicker}`
        : "—",
    },
  ];

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[24px] font-bold tracking-tight text-ink">
              Portfolio risk audit
            </h1>
            <p className="mt-0.5 text-[13px] text-ink-secondary">
              A self-contained summary of the analysis, its assumptions and its limits.
            </p>
          </div>
          <PrintButton />
        </div>
        <SimulatedDataNotice />
      </div>

      <Panel className="print-block">
        <PanelHeader>
          <PanelTitle>Executive summary</PanelTitle>
        </PanelHeader>
        <PanelBody>
          <dl className="flex flex-col">
            {summaryRows.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-6 border-b border-line/60 py-2 last:border-b-0"
              >
                <dt className="text-[13px] text-ink-secondary">{row.label}</dt>
                <dd className="tabular text-right font-mono text-[13px] text-ink">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </PanelBody>
      </Panel>

      <Panel className="print-block">
        <PanelHeader>
          <PanelTitle>Method</PanelTitle>
        </PanelHeader>
        <PanelBody className="flex flex-col gap-3 text-[12px] leading-relaxed text-ink-secondary">
          <p>
            Daily logarithmic returns are computed for each asset and aggregated to the
            portfolio using fixed user-supplied weights. Portfolio volatility is the
            sample standard deviation of those returns, annualised on a 252-trading-day
            convention. Maximum drawdown is measured on a normalised wealth index that
            starts at 100.
          </p>
          <p>
            One-day Value at Risk is estimated by three methods — Historical Simulation,
            Parametric Normal and EWMA Normal with a decay factor of{" "}
            {analysis.assumptions.ewmaLambda} — each over a rolling window of{" "}
            {analysis.assumptions.rollingWindow} observations. Expected Shortfall is the
            mean loss among observations beyond the corresponding VaR threshold. Losses
            and VaR are reported as positive magnitudes.
          </p>
          <p>
            Each model is validated walk-forward: at every test date the model is
            estimated using only prior observations, forecasts the next day&apos;s
            threshold, and is scored against the realised loss. The resulting exception
            counts are tested with the Kupiec unconditional-coverage likelihood ratio
            against a chi-squared distribution with one degree of freedom.
          </p>
        </PanelBody>
      </Panel>

      <ModelAuditTable rows={backtestSummary} significance={DEFAULT_LIMITS.testSignificance} />

      <Panel className="print-block">
        <PanelHeader>
          <PanelTitle>Limitations</PanelTitle>
        </PanelHeader>
        <PanelBody>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-[12px] leading-relaxed text-ink-secondary">
            <li>
              All figures derive from a deterministic simulated series, not from observed
              Vietnamese market data. They demonstrate the method, not the market.
            </li>
            <li>
              Weights are held fixed throughout. No rebalancing, transaction costs, taxes
              or liquidity constraints are modelled.
            </li>
            <li>
              The 99% results depend on a small number of tail observations and carry
              correspondingly wide uncertainty.
            </li>
            <li>
              Correlations are estimated over the whole period and treated as stable, which
              they are not — they typically rise during stress.
            </li>
            <li>
              A Kupiec PASS means the exception count is not statistically inconsistent
              with the target rate. It is not evidence that the model is correct, and the
              test says nothing about whether exceptions cluster in time.
            </li>
            <li>
              The prototype has not been validated for production or regulatory use.
            </li>
          </ul>
        </PanelBody>
      </Panel>

      {/* Carries the educational-use disclaimer PRD 18 requires as the closing
          item of the report, so it is not repeated as a separate block. */}
      <AssumptionsFooter assumptions={analysis.assumptions} metadata={metadata} />
    </div>
  );
}
