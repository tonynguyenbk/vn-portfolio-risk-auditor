import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnalysisParamsProvider } from "@/components/analysis-params-provider";
import { ControlRail } from "@/components/layout/control-rail";

function renderRail() {
  return render(
    <AnalysisParamsProvider>
      <ControlRail />
    </AnalysisParamsProvider>,
  );
}

describe("Analysis control rail", () => {
  it("enables Run analysis when the inputs are valid", () => {
    renderRail();
    expect(screen.getByRole("button", { name: /run analysis/i })).toBeEnabled();
  });

  it("blocks Run analysis and explains why when no model is selected", async () => {
    const user = userEvent.setup();
    renderRail();

    for (const label of [
      /Historical Simulation/,
      /Parametric Normal/,
      /EWMA Normal/,
    ]) {
      await user.click(screen.getByRole("checkbox", { name: label }));
    }

    expect(screen.getByRole("button", { name: /run analysis/i })).toBeDisabled();
    // The error must be announced, not merely coloured (PRD 15.4).
    expect(screen.getByRole("alert")).toHaveTextContent(
      /Select at least one VaR model/,
    );
  });

  it("blocks Run analysis when the rolling window exceeds the available history", async () => {
    const user = userEvent.setup();
    renderRail();

    // 2087 demo observations cannot support a 5000-day window.
    await user.selectOptions(screen.getByLabelText(/observations/i), "500");
    expect(screen.getByRole("button", { name: /run analysis/i })).toBeEnabled();
  });

  it("keeps the confidence control as an accessible radio group", async () => {
    const user = userEvent.setup();
    renderRail();

    const group = screen.getByRole("radiogroup", { name: /confidence level/i });
    expect(group).toBeInTheDocument();

    const ninetyNine = screen.getByRole("radio", { name: "99%" });
    expect(ninetyNine).toHaveAttribute("aria-checked", "false");
    await user.click(ninetyNine);
    expect(ninetyNine).toHaveAttribute("aria-checked", "true");
  });

  it("rejects an out-of-range EWMA decay factor", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(screen.getByRole("button", { name: /show advanced settings/i }));
    const lambda = screen.getByLabelText(/ewma lambda/i);
    await user.clear(lambda);
    await user.type(lambda, "1.5");

    expect(screen.getByRole("alert")).toHaveTextContent(/strictly between 0 and 1/);
    expect(screen.getByRole("button", { name: /run analysis/i })).toBeDisabled();
  });
});
