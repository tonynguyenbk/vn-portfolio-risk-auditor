import { SimulatedDataNotice } from "@/components/feedback/simulated-data-notice";
import { StressTestPanel } from "@/components/stress/stress-test-panel";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { DEFAULT_LIMITS, demoAnalysis } from "@/lib/demo-data";

export default function StressTestPage() {
  const analysis = demoAnalysis;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-ink">Stress test</h1>
          <p className="mt-0.5 text-[13px] text-ink-secondary">
            How the portfolio would respond to a specified adverse scenario, applied to
            the current weights.
          </p>
        </div>
        <SimulatedDataNotice />
      </div>

      <StressTestPanel weights={analysis.portfolio.weights} limits={DEFAULT_LIMITS} />

      <Panel>
        <PanelHeader>
          <PanelTitle>How to read a stress test</PanelTitle>
        </PanelHeader>
        <PanelBody className="flex flex-col gap-3">
          <p className="text-[12px] leading-relaxed text-ink-secondary">
            A stress test is scenario analysis, not probability forecasting. It answers a
            conditional question — if these particular shocks occurred, what would their
            approximate effect on this portfolio be — and attaches no likelihood to the
            scenario itself. A large stress loss does not mean the scenario is expected,
            and a small one does not mean the portfolio is protected.
          </p>
          <p className="text-[12px] leading-relaxed text-ink-secondary">
            The calculation applies each shock to its asset&apos;s weight and sums the
            results. It therefore assumes weights stay fixed through the event, ignores
            liquidity and transaction costs, and does not model second-round effects such
            as correlations rising as the shock unfolds. Real stress episodes tend to
            produce losses larger than a simple weighted sum implies.
          </p>
          <p className="text-[12px] leading-relaxed text-ink-muted">
            Historical scenarios — deriving shocks from a user-selected date range in the
            loaded dataset — are part of a later implementation phase. The presets above
            are constructed illustrations and do not correspond to observed events.
          </p>
        </PanelBody>
      </Panel>
    </div>
  );
}
