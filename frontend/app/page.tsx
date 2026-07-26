import { RiskProfileChart } from "@/components/charts/risk-profile-chart";
import { SimulatedDataNotice } from "@/components/feedback/simulated-data-notice";
import { MetricCard } from "@/components/metrics/metric-card";
import { AllocationPanel } from "@/components/panels/allocation-panel";
import { AssumptionsFooter } from "@/components/panels/assumptions-footer";
import { CorrelationHeatmap } from "@/components/panels/correlation-heatmap";
import { DataQualityStrip } from "@/components/panels/data-quality-strip";
import { RiskContributionPanel } from "@/components/panels/risk-contribution-panel";
import { RiskStatusPanel } from "@/components/panels/risk-status-panel";
import { DEFAULT_LIMITS, getDemoBundle } from "@/lib/mock/demo-analysis";
import { formatDate, formatPercent } from "@/lib/format";

export default function OverviewPage() {
  const { analysis, backtestSeries } = getDemoBundle();
  const { metrics, portfolio, concentration, correlation, limits, metadata } = analysis;

  const var95 =
    metrics.var.find((v) => v.model === "historical" && v.confidence === 0.95)?.value ?? null;
  const es95 = metrics.expectedShortfall.find((e) => e.confidence === 0.95)?.value ?? null;
  const mdd = metrics.maximumDrawdown;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-ink">Portfolio overview</h1>
          <p className="mt-0.5 text-[13px] text-ink-secondary">
            Downside risk, where it comes from, and how the portfolio has behaved over
            the analysis period.
          </p>
        </div>
        <SimulatedDataNotice />
      </div>

      <DataQualityStrip metadata={metadata} dataQuality={analysis.dataQuality} />

      {/* Four primary metrics, first viewport (PRD 11.3). */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Annual volatility"
          value={formatPercent(metrics.annualisedVolatility)}
          basis="Daily log returns × √252"
          context="Full analysis period"
          definition="How much the portfolio's value has fluctuated, scaled to a yearly figure. It measures dispersion in both directions, not the size of a loss."
        />
        <MetricCard
          label="VaR 95%"
          value={formatPercent(var95)}
          basis="Historical Simulation, 1-day"
          context={`${analysis.assumptions.rollingWindow}-day rolling window`}
          definition="A loss threshold: on roughly 5 days in 100, the one-day loss is expected to be worse than this. It says nothing about how much worse."
        />
        <MetricCard
          label="Expected shortfall 95%"
          value={formatPercent(es95)}
          basis="Historical, mean loss beyond VaR"
          context="Average severity of the worst 5% of days"
          definition="The average loss on days when the VaR threshold is breached. Where VaR marks the edge of the tail, this describes what is inside it."
        />
        <MetricCard
          label="Maximum drawdown"
          value={formatPercent(mdd.value)}
          basis="Peak to trough, normalised wealth"
          context={`${formatDate(mdd.peakDate)} → ${formatDate(mdd.troughDate)}`}
          definition="The largest cumulative decline from a previous high point. It shows the deepest loss an investor holding throughout would have lived through."
        />
      </div>

      {/* Main chart ~8 columns, risk status ~4 columns (PRD 13.4). */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <RiskProfileChart
            wealthCurve={portfolio.wealthCurve}
            benchmarkCurve={portfolio.benchmarkCurve}
            backtestSeries={backtestSeries}
            confidenceLabel="95%"
            modelLabel="Historical Simulation"
          />
        </div>
        <div className="xl:col-span-4">
          <RiskStatusPanel
            limits={limits}
            riskLimits={DEFAULT_LIMITS}
            var95={var95 ?? 0}
            contributions={analysis.riskContribution}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AllocationPanel
          weights={portfolio.weights}
          sectorWeights={portfolio.sectorWeights}
          concentration={concentration}
        />
        <div className="flex flex-col gap-4">
          <RiskContributionPanel rows={analysis.riskContribution} />
          <CorrelationHeatmap correlation={correlation} />
        </div>
      </div>

      <AssumptionsFooter assumptions={analysis.assumptions} metadata={metadata} />
    </div>
  );
}
