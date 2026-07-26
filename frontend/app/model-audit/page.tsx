import { RiskProfileChart } from "@/components/charts/risk-profile-chart";
import { SimulatedDataNotice } from "@/components/feedback/simulated-data-notice";
import { AssumptionsFooter } from "@/components/panels/assumptions-footer";
import { ModelAuditTable } from "@/components/panels/model-audit-table";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { DEFAULT_LIMITS, demoAnalysis, demoBacktest } from "@/lib/demo-data";

const DEFINITIONS = [
  {
    term: "Walk-forward backtesting",
    body: "At every test date the model is estimated using only observations from before that date, then asked to forecast the next day. This ordering is what prevents information from the future leaking into a historical forecast.",
  },
  {
    term: "Exception",
    body: "A day on which the realised loss exceeded the VaR threshold that had been forecast for it. A well-calibrated 95% model should produce these on about 5% of days.",
  },
  {
    term: "Kupiec unconditional coverage",
    body: "A likelihood-ratio test of the null hypothesis that the true exception probability equals 1 minus the confidence level. The statistic is compared against a chi-squared distribution with one degree of freedom.",
  },
  {
    term: "Exception severity",
    body: "The average size of losses on exception days. Two models can produce the same number of exceptions while differing sharply in how bad those days were.",
  },
];

export default function ModelAuditPage() {
  const analysis = demoAnalysis;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-ink">Model audit</h1>
          <p className="mt-0.5 text-[13px] text-ink-secondary">
            Whether each VaR model produced the number of exceptions its confidence level
            implies, tested walk-forward so no forecast sees its own outcome.
          </p>
        </div>
        <SimulatedDataNotice />
      </div>

      <ModelAuditTable
        rows={demoBacktest.summary}
        significance={DEFAULT_LIMITS.testSignificance}
      />

      <RiskProfileChart
        wealthCurve={analysis.portfolio.wealthCurve}
        benchmarkCurve={analysis.portfolio.benchmarkCurve}
        backtestSeries={demoBacktest.series}
        confidenceLabel="95%"
        modelLabel="Historical Simulation"
      />

      <Panel>
        <PanelHeader>
          <PanelTitle>Definitions</PanelTitle>
        </PanelHeader>
        <PanelBody>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
            {DEFINITIONS.map((definition) => (
              <div key={definition.term} className="flex flex-col gap-1">
                <dt className="text-[13px] font-[650] text-ink">{definition.term}</dt>
                <dd className="text-[12px] leading-relaxed text-ink-secondary">
                  {definition.body}
                </dd>
              </div>
            ))}
          </dl>
        </PanelBody>
      </Panel>

      <AssumptionsFooter
        assumptions={analysis.assumptions}
        metadata={analysis.metadata}
      />
    </div>
  );
}
