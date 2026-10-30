"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAnalysisData } from "@/components/analysis-data-provider";
import { SimulatedDataNotice } from "@/components/feedback/simulated-data-notice";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { WhatIfWorkbench } from "@/components/what-if/what-if-workbench";
import { formatDateRange } from "@/lib/format";
import {
  alignPrices,
  parseMarketCsv,
  prepareInputs,
  type WhatIfInputs,
} from "@/lib/what-if";

/**
 * What-if: change the portfolio and see how its historical risk changes.
 *
 * Prices come from the same market file the displayed analysis was computed
 * from — the bundled demo CSV, fetched from `public/demo`, or the file the
 * user uploaded, which the data provider keeps for this purpose. The tickers,
 * original weights and date range are taken from the displayed analysis, so
 * the page follows whatever dataset the rest of the dashboard shows and has
 * no ticker or figure of its own.
 */

type LoadState =
  | { key: string; status: "ready"; inputs: WhatIfInputs }
  | { key: string; status: "error"; message: string };

async function loadMarketText(marketFile: File | null): Promise<string> {
  if (marketFile) return marketFile.text();
  const response = await fetch("/demo/market_data.csv");
  if (!response.ok) throw new Error("Could not load the bundled market data.");
  return response.text();
}

export default function WhatIfPage() {
  const { analysis, source, marketFile } = useAnalysisData();
  const { metadata, portfolio } = analysis;

  const tickers = useMemo(() => portfolio.weights.map((w) => w.ticker), [portfolio.weights]);
  const originalWeights = useMemo(
    () => portfolio.weights.map((w) => w.weight),
    [portfolio.weights],
  );

  const fileForSource = source === "upload" ? marketFile : null;
  const tickerKey = tickers.join(",");
  // Identifies the dataset the inputs were built from. A result for any other
  // key is stale, and remounting the workbench on a new key resets its sliders
  // to the new portfolio's weights.
  const key = [
    source,
    fileForSource ? `${fileForSource.name}:${fileForSource.size}:${fileForSource.lastModified}` : "",
    tickerKey,
    metadata.startDate,
    metadata.endDate,
  ].join("|");

  const [state, setState] = useState<LoadState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tickerList = tickerKey.split(",");

    loadMarketText(fileForSource)
      .then((text) => {
        const aligned = alignPrices(
          parseMarketCsv(text),
          tickerList,
          metadata.startDate,
          metadata.endDate,
        );
        return prepareInputs(aligned);
      })
      .then(
        (inputs) => {
          if (!cancelled) setState({ key, status: "ready", inputs });
        },
        (error: unknown) => {
          if (!cancelled) {
            setState({
              key,
              status: "error",
              message: error instanceof Error ? error.message : String(error),
            });
          }
        },
      );

    return () => {
      cancelled = true;
    };
  }, [key, tickerKey, fileForSource, metadata.startDate, metadata.endDate]);

  const current = state?.key === key ? state : null;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-ink">What-if</h1>
          <p className="mt-0.5 text-[13px] text-ink-secondary">
            Change the equity weights and how much of your capital is in equities at all,
            and see how the historical risk changes.
          </p>
        </div>
        <SimulatedDataNotice />
      </div>

      {current === null && (
        <Panel>
          <PanelBody className="flex items-center gap-2 text-[13px] text-ink-secondary">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-aqua" />
            Loading prices…
          </PanelBody>
        </Panel>
      )}

      {current?.status === "error" && (
        <Panel>
          <PanelHeader>
            <PanelTitle>Prices could not be loaded</PanelTitle>
          </PanelHeader>
          <PanelBody>
            <p className="text-[12px] leading-relaxed text-ink-secondary">
              {current.message}
            </p>
          </PanelBody>
        </Panel>
      )}

      {current?.status === "ready" && (
        <WhatIfWorkbench
          key={key}
          inputs={current.inputs}
          originalWeights={originalWeights}
        />
      )}

      <Panel>
        <PanelHeader>
          <PanelTitle>How to read this page</PanelTitle>
        </PanelHeader>
        <PanelBody className="flex flex-col gap-3">
          <p className="text-[12px] leading-relaxed text-ink-secondary">
            Every figure is historical: it describes what this mix would have
            experienced over{" "}
            {formatDateRange(metadata.startDate, metadata.endDate)}, using{" "}
            {source === "upload" ? "your uploaded prices" : "the bundled dataset"}. Weights
            are held fixed throughout, cash earns nothing, and no rebalancing costs,
            taxes or liquidity limits are modelled. A lower historical VaR does not
            guarantee lower future losses — markets can behave in ways the sample never
            showed.
          </p>
          <p className="text-[12px] leading-relaxed text-ink-secondary">
            Choosing how much to hold in equities, sized up front to the loss you can
            tolerate, is the lever this page is built around: in an experiment on
            Vietnamese price data, no stop-loss or exit rule reliably did better than
            simply holding less equity from the start. The page informs that choice; it
            does not recommend buying or selling any particular stock.
          </p>
          <p className="text-[12px] leading-relaxed text-ink-muted">
            VaR and expected shortfall here are measured on simple daily returns of the
            whole capital, so the VND amounts are exact multiples of the capital entered.
            For the original portfolio they can therefore differ by a few hundredths of a
            percentage point from the Overview, which reports them on log returns.
          </p>
        </PanelBody>
      </Panel>
    </div>
  );
}
