import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import OverviewPage from "@/app/page";
import ReportPage from "@/app/report/page";

describe("Overview dashboard", () => {
  it("shows the four primary metric cards in the first viewport", () => {
    render(<OverviewPage />);
    // PRD 11.3 fixes exactly these four.
    expect(screen.getByText("Annual volatility")).toBeInTheDocument();
    expect(screen.getByText("VaR 95%")).toBeInTheDocument();
    expect(screen.getByText("Expected shortfall 95%")).toBeInTheDocument();
    expect(screen.getByText("Maximum drawdown")).toBeInTheDocument();
  });

  it("labels every figure as simulated data (PRD 0.8)", () => {
    render(<OverviewPage />);
    expect(
      screen.getByText(/Educational prototype • Simulated data/),
    ).toBeInTheDocument();
  });

  it("renders metric values as percentages rather than raw decimals", () => {
    render(<OverviewPage />);
    const values = screen.getAllByText(/^-?\d+\.\d{2}%$/);
    expect(values.length).toBeGreaterThanOrEqual(4);
  });

  it("gives every data table an accessible caption", () => {
    render(<OverviewPage />);
    const tables = screen.getAllByRole("table");
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      expect(within(table).getByText(/.+/, { selector: "caption" })).toBeInTheDocument();
    }
  });

  it("states the assumptions alongside the results (PRD 0.9)", () => {
    render(<OverviewPage />);
    expect(screen.getByText("Rolling window")).toBeInTheDocument();
    expect(screen.getByText("Quantile method")).toBeInTheDocument();
    expect(screen.getByText(/Losses and VaR reported as positive magnitudes/)).toBeInTheDocument();
  });
});

describe("Report", () => {
  it("carries the required educational-use disclaimer (PRD 18)", () => {
    render(<ReportPage />);
    expect(
      screen.getByText(/does not provide investment\s+advice, predict market direction/),
    ).toBeInTheDocument();
  });

  it("qualifies the model choice rather than declaring a winner (PRD 12)", () => {
    render(<ReportPage />);
    expect(screen.getByText("Best-calibrated tested model")).toBeInTheDocument();
  });

  it("warns that a Kupiec pass is not proof of model correctness (PRD 9.12)", () => {
    render(<ReportPage />);
    expect(
      screen.getByText(/not proof that the model is correct/),
    ).toBeInTheDocument();
  });
});
