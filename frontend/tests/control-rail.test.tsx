import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnalysisParamsProvider } from "@/components/analysis-params-provider";
import { ControlRail } from "@/components/layout/control-rail";
import { FilteredModelAudit } from "@/components/panels/filtered-model-audit";
import { demoBacktest } from "@/lib/demo-data";

function renderRail() {
  return render(
    <AnalysisParamsProvider>
      <ControlRail />
    </AnalysisParamsProvider>,
  );
}

describe("Analysis control rail", () => {
  it("does not offer to run an analysis that is already precomputed", () => {
    // The bundled demonstration is computed by the Python engine at build
    // time. A live-looking Run button here would fake a computation that is
    // not happening.
    renderRail();
    expect(screen.getByRole("button", { name: /run analysis/i })).toBeDisabled();
    expect(screen.getByText(/precomputed by the Python engine/i)).toBeInTheDocument();
  });

  it("disables the controls that would require re-running the engine", () => {
    renderRail();
    // Rolling window, date range and EWMA decay cannot change a precomputed
    // result, so they must not appear operable.
    expect(screen.getByLabelText(/observations/i)).toBeDisabled();
    expect(screen.getByLabelText(/^start$/i)).toBeDisabled();
    expect(screen.getByLabelText(/^end$/i)).toBeDisabled();
  });

  it("keeps the model checkboxes operable because they filter real results", () => {
    renderRail();
    for (const label of [/Historical Simulation/, /Parametric Normal/, /EWMA Normal/]) {
      expect(screen.getByRole("checkbox", { name: label })).toBeEnabled();
    }
  });

  it("reports a blocking error when no model is selected", async () => {
    const user = userEvent.setup();
    renderRail();

    for (const label of [/Historical Simulation/, /Parametric Normal/, /EWMA Normal/]) {
      await user.click(screen.getByRole("checkbox", { name: label }));
    }

    // The error must be announced, not merely coloured (PRD 15.4).
    expect(screen.getByRole("alert")).toHaveTextContent(/Select at least one VaR model/);
  });

  it("keeps the confidence control as an accessible radio group", async () => {
    const user = userEvent.setup();
    renderRail();

    expect(
      screen.getByRole("radiogroup", { name: /confidence level/i }),
    ).toBeInTheDocument();

    const ninetyNine = screen.getByRole("radio", { name: "99%" });
    expect(ninetyNine).toHaveAttribute("aria-checked", "false");
    await user.click(ninetyNine);
    expect(ninetyNine).toHaveAttribute("aria-checked", "true");
  });
});

/**
 * PRD 20.2 requires a test that the model and confidence controls update the
 * displayed output. These are that test — and they only became writable once
 * those controls actually drove something.
 */
describe("Model and confidence controls drive the audit table", () => {
  function renderAudit() {
    return render(
      <AnalysisParamsProvider>
        <ControlRail />
        <FilteredModelAudit rows={demoBacktest.summary} significance={0.05} />
      </AnalysisParamsProvider>,
    );
  }

  it("shows every selected model at the default confidence level", () => {
    renderAudit();
    const table = screen.getByRole("table");
    // Three models at 95%, since all three start selected.
    expect(table).toHaveTextContent("Historical Simulation");
    expect(table).toHaveTextContent("Parametric Normal");
    expect(table).toHaveTextContent("EWMA Normal");
  });

  it("removes a model from the table when it is deselected", async () => {
    const user = userEvent.setup();
    renderAudit();

    await user.click(screen.getByRole("checkbox", { name: /EWMA Normal/ }));

    const table = screen.getByRole("table");
    expect(table).not.toHaveTextContent("EWMA Normal");
    expect(table).toHaveTextContent("Historical Simulation");
  });

  it("switches the table to the other confidence level", async () => {
    const user = userEvent.setup();
    renderAudit();

    const before = screen.getByRole("table").textContent;
    await user.click(screen.getByRole("radio", { name: "99%" }));
    const after = screen.getByRole("table").textContent;

    expect(after).not.toBe(before);
    expect(screen.getByRole("table")).toHaveTextContent("99%");
  });

  it("explains an empty selection rather than showing a bare table", async () => {
    const user = userEvent.setup();
    renderAudit();

    for (const label of [/Historical Simulation/, /Parametric Normal/, /EWMA Normal/]) {
      await user.click(screen.getByRole("checkbox", { name: label }));
    }

    expect(screen.getByText(/Select at least one model/i)).toBeInTheDocument();
  });
});
