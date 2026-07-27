import { render, type RenderResult } from "@testing-library/react";
import { AnalysisDataProvider } from "@/components/analysis-data-provider";
import { AnalysisParamsProvider } from "@/components/analysis-params-provider";

/**
 * Render inside the same provider stack the root layout supplies.
 *
 * Both providers are needed by nearly every component now: one holds the
 * user's parameter selections, the other holds whichever analysis is being
 * displayed. Wrapping here rather than in each test keeps the tests exercising
 * the real composition instead of a simplified one.
 */
export function renderWithProviders(ui: React.ReactElement): RenderResult {
  return render(
    <AnalysisParamsProvider>
      <AnalysisDataProvider>{ui}</AnalysisDataProvider>
    </AnalysisParamsProvider>,
  );
}
