import { describe, expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { renderWithProviders as render } from "./test-utils";
import fixture from "./fixtures/whatif-parity.json";
import { WhatIfWorkbench } from "@/components/what-if/what-if-workbench";
import { alignPrices, parseMarketCsv, prepareInputs } from "@/lib/what-if";

/**
 * The interactive panels, driven by the parity fixture's prices so the test
 * does not depend on whichever dataset is currently shipped in public/demo.
 */

const inputs = prepareInputs(alignPrices(parseMarketCsv(fixture.csv), fixture.tickers));
const originalWeights = [0.4, 0.3, 0.2, 0.1];

function renderWorkbench() {
  return render(<WhatIfWorkbench inputs={inputs} originalWeights={originalWeights} />);
}

function fractionSlider() {
  return screen.getByLabelText("Equity fraction") as HTMLInputElement;
}

describe("What-if workbench", () => {
  it("compares the original and What-if portfolios in a captioned table", () => {
    renderWorkbench();
    const table = screen.getByRole("table", { name: /original portfolio and the What-if mix/ });
    expect(within(table).getByText("VaR 95%, 1-day")).toBeInTheDocument();
    expect(within(table).getByText("Expected shortfall 95%")).toBeInTheDocument();
    expect(within(table).getByText("Worst 5-day loss")).toBeInTheDocument();
    // Unchanged mix: no deltas yet.
    expect(within(table).getAllByText("No change").length).toBeGreaterThan(0);
  });

  it("formats capital and tolerance with Vietnamese grouping", () => {
    renderWorkbench();
    expect(screen.getByDisplayValue("500.000.000")).toBeInTheDocument();
    expect(screen.getByDisplayValue("10.000.000")).toBeInTheDocument();
  });

  it("shows lower risk when the equity fraction is reduced", () => {
    renderWorkbench();
    fireEvent.change(fractionSlider(), { target: { value: "0.5" } });
    expect(screen.getAllByText("less risk").length).toBeGreaterThanOrEqual(5);
  });

  it("sets the largest equity fraction whose ES fits the tolerated loss", () => {
    renderWorkbench();
    // Tolerate 1% of capital: 5,000,000 on 500,000,000.
    fireEvent.change(screen.getByLabelText(/Max one-day loss I can tolerate/), {
      target: { value: "5.000.000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Max equity fraction within my limit/ }));

    const expected = fixture.maxEquityFraction.find((c) => c.tolerancePct === 0.01)!;
    expect(Number(fractionSlider().value)).toBeCloseTo(expected.expectedFraction, 9);
    expect(screen.getByText("Within your limit")).toBeInTheDocument();
  });

  it("restores the original mix on reset", () => {
    renderWorkbench();
    fireEvent.change(fractionSlider(), { target: { value: "0.3" } });
    fireEvent.change(screen.getByLabelText("AAA weight, percent"), { target: { value: "70" } });
    fireEvent.click(screen.getByRole("button", { name: /Reset to original/ }));
    expect(Number(fractionSlider().value)).toBe(1);
    expect(screen.getByLabelText("AAA weight, percent")).toHaveValue(40);
  });
});
