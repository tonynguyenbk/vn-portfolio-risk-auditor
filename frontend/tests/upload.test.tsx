import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ControlRail } from "@/components/layout/control-rail";
import { DatasetPicker } from "@/components/inputs/dataset-picker";
import { SimulatedDataNotice } from "@/components/feedback/simulated-data-notice";
import { demoAnalysis } from "@/lib/demo-data";
import { renderWithProviders } from "./test-utils";

/**
 * Upload flow (PRD 15.1, 15.3, 20.3).
 *
 * `fetch` is stubbed rather than hitting a live service, so these run offline
 * and deterministically. The Python side of each response shape is covered by
 * the backend's own API tests; what matters here is how the interface behaves
 * when the service succeeds, rejects the data, or cannot be reached at all.
 */

const csv = (name: string) =>
  new File(["date,ticker,close\n2024-01-01,AAA,100\n"], name, { type: "text/csv" });

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

async function attachBothFiles(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText(/source/i), "upload");
  await user.upload(screen.getByLabelText(/market data/i), csv("market.csv"));
  await user.upload(screen.getByLabelText(/portfolio/i), csv("portfolio.csv"));
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Dataset picker", () => {
  it("hides the file inputs until upload is chosen", () => {
    renderWithProviders(<DatasetPicker />);
    expect(screen.queryByLabelText(/market data/i)).not.toBeInTheDocument();
  });

  it("keeps the analyse button disabled until both files are attached", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DatasetPicker />);

    await user.selectOptions(screen.getByLabelText(/source/i), "upload");
    const button = screen.getByRole("button", { name: /analyse uploaded files/i });
    expect(button).toBeDisabled();

    await user.upload(screen.getByLabelText(/market data/i), csv("market.csv"));
    expect(button).toBeDisabled();

    await user.upload(screen.getByLabelText(/portfolio/i), csv("portfolio.csv"));
    expect(button).toBeEnabled();
  });
});

describe("A successful upload", () => {
  it("replaces the displayed analysis and drops the simulated-data label", async () => {
    const uploaded = structuredClone(demoAnalysis);
    uploaded.metadata.isSimulated = false;
    uploaded.metadata.datasetName = "uploaded dataset";

    vi.mocked(fetch).mockResolvedValue(jsonResponse(uploaded));

    const user = userEvent.setup();
    renderWithProviders(
      <>
        <DatasetPicker />
        <SimulatedDataNotice />
      </>,
    );

    expect(screen.getByText(/Educational prototype • Simulated data/)).toBeInTheDocument();

    await attachBothFiles(user);
    await user.click(screen.getByRole("button", { name: /analyse uploaded files/i }));

    // The label has to track the data: leaving "Simulated data" over a user's
    // real portfolio would be as much a misstatement as omitting it.
    await waitFor(() => {
      expect(screen.getByText(/Analysing uploaded data/)).toBeInTheDocument();
    });
    expect(
      screen.queryByText(/Educational prototype • Simulated data/),
    ).not.toBeInTheDocument();
  });

  it("offers a way back to the bundled demonstration", async () => {
    const uploaded = structuredClone(demoAnalysis);
    uploaded.metadata.isSimulated = false;
    vi.mocked(fetch).mockResolvedValue(jsonResponse(uploaded));

    const user = userEvent.setup();
    renderWithProviders(
      <>
        <DatasetPicker />
        <SimulatedDataNotice />
      </>,
    );

    await attachBothFiles(user);
    await user.click(screen.getByRole("button", { name: /analyse uploaded files/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /back to bundled demo/i })).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /back to bundled demo/i }));
    expect(screen.getByText(/Educational prototype • Simulated data/)).toBeInTheDocument();
  });
});

describe("When the data is rejected", () => {
  it("surfaces the structured validation issues rather than a bare failure", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        {
          detail: {
            code: "ANALYSIS_BLOCKED",
            message: "Portfolio weights total 90.00%.",
            issues: [
              {
                code: "WEIGHT_SUM",
                message: "Portfolio weights total 90.00%. Adjust them to 100%.",
                severity: "breach",
              },
            ],
          },
        },
        422,
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<DatasetPicker />);

    await attachBothFiles(user);
    await user.click(screen.getByRole("button", { name: /analyse uploaded files/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Adjust them to 100%/);
  });
});

describe("Run analysis on the bundled dataset", () => {
  /**
   * Routes the two bundled CSV fetches to blobs and the API calls to JSON, so
   * the whole path — load files, POST, display — is exercised.
   */
  function mockDemoRun(analysisBody: unknown) {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/demo/")) {
        return { ok: true, status: 200, blob: async () => new Blob(["csv"]) } as Response;
      }
      if (url.includes("/backtest")) {
        return jsonResponse({ series: [], summary: [], assumptions: {} });
      }
      return jsonResponse(analysisBody);
    });
  }

  it("sends the bundled files to the engine and shows what comes back", async () => {
    const recomputed = structuredClone(demoAnalysis);
    recomputed.metrics.annualisedVolatility = 0.31;
    mockDemoRun(recomputed);

    const user = userEvent.setup();
    renderWithProviders(<ControlRail />);

    const button = screen.getByRole("button", { name: /run analysis/i });
    expect(button).toBeEnabled();
    await user.click(button);

    await waitFor(() => {
      const urls = vi.mocked(fetch).mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("/demo/market_data.csv"))).toBe(true);
      expect(urls.some((u) => u.includes("/demo/portfolio.csv"))).toBe(true);
      expect(urls.some((u) => u.includes("/api/v1/analyse"))).toBe(true);
    });
  });

  it("keeps the simulated-data label after a live run on the bundled data", async () => {
    // The engine marks any upload as real data because it cannot know the
    // provenance of a CSV. The caller does know, so the label must survive.
    const recomputed = structuredClone(demoAnalysis);
    recomputed.metadata.isSimulated = false;
    mockDemoRun(recomputed);

    const user = userEvent.setup();
    renderWithProviders(
      <>
        <ControlRail />
        <SimulatedDataNotice />
      </>,
    );

    await user.click(screen.getByRole("button", { name: /run analysis/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Educational prototype • Simulated data/),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/Analysing uploaded data/)).not.toBeInTheDocument();
  });

  it("reports a failed live run without discarding the displayed analysis", async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes("/demo/")) {
        return { ok: true, status: 200, blob: async () => new Blob(["csv"]) } as Response;
      }
      throw new TypeError("Failed to fetch");
    });

    const user = userEvent.setup();
    renderWithProviders(
      <>
        <ControlRail />
        <SimulatedDataNotice />
      </>,
    );

    await user.click(screen.getByRole("button", { name: /run analysis/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Could not reach the analysis service/);
    // The precomputed figures are still on screen.
    expect(screen.getByText(/Educational prototype • Simulated data/)).toBeInTheDocument();
  });
});

describe("When the service cannot be reached", () => {
  it("gives a recoverable message and says the demonstration is unaffected", async () => {
    // PRD 20.3: backend unavailability must produce a recoverable message.
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));

    const user = userEvent.setup();
    renderWithProviders(
      <>
        <DatasetPicker />
        <SimulatedDataNotice />
      </>,
    );

    await attachBothFiles(user);
    await user.click(screen.getByRole("button", { name: /analyse uploaded files/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Could not reach the analysis service/);
    expect(alert).toHaveTextContent(/bundled demonstration is unaffected/);

    // And the claim must be true: the demo is still on screen.
    expect(screen.getByText(/Educational prototype • Simulated data/)).toBeInTheDocument();
  });

  it("lets the user retry after a failure", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const user = userEvent.setup();
    renderWithProviders(<DatasetPicker />);

    await attachBothFiles(user);
    const button = screen.getByRole("button", { name: /analyse uploaded files/i });
    await user.click(button);

    await screen.findByRole("alert");
    // The button returns to an actionable state rather than staying stuck.
    expect(button).toBeEnabled();
  });
});
