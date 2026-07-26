import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { formatNumber } from "@/lib/format";
import type { CorrelationMatrix } from "@/types/analysis";

/**
 * Correlation heatmap (PRD 9.8 and 11.4).
 *
 * Positive and negative correlations get different hues, and magnitude drives
 * opacity. The exact value is printed in every cell as well, so colour is
 * never the only carrier of the information (PRD 15.4).
 */
function cellStyle(value: number): React.CSSProperties {
  const magnitude = Math.min(1, Math.abs(value));
  const hue = value >= 0 ? "51, 209, 198" : "255, 107, 107";
  return { backgroundColor: `rgba(${hue}, ${0.08 + magnitude * 0.42})` };
}

export function CorrelationHeatmap({ correlation }: { correlation: CorrelationMatrix }) {
  const { tickers, matrix } = correlation;

  return (
    <Panel className="flex h-full flex-col">
      <PanelHeader>
        <div className="flex items-center gap-1.5">
          <PanelTitle>Correlation matrix</PanelTitle>
          <InfoTooltip
            label="correlation"
            content="How closely two assets have moved together over the analysis period. Values near 1 moved together, near 0 moved independently, near -1 moved in opposite directions."
          />
        </div>
      </PanelHeader>

      <PanelBody className="flex flex-1 flex-col gap-3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[400px] border-separate border-spacing-0.5 text-[11px]">
            <caption className="sr-only">
              Pearson correlation of daily log returns between portfolio assets
            </caption>
            <thead>
              <tr>
                <th scope="col" className="w-16" />
                {tickers.map((ticker) => (
                  <th
                    key={ticker}
                    scope="col"
                    className="p-1 text-center font-mono font-medium text-ink-muted"
                  >
                    {ticker.replace("ASSET_", "")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, i) => (
                <tr key={tickers[i]}>
                  <th
                    scope="row"
                    className="pr-2 text-right font-mono font-medium text-ink-muted"
                  >
                    {tickers[i].replace("ASSET_", "")}
                  </th>
                  {row.map((value, j) => (
                    <td
                      key={tickers[j]}
                      style={cellStyle(value)}
                      title={`${tickers[i]} vs ${tickers[j]}: ${formatNumber(value, 4)}`}
                      className="tabular rounded-sm p-1.5 text-center font-mono text-ink"
                    >
                      {formatNumber(value, 2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-auto text-[11px] leading-snug text-ink-muted">
          Correlations are estimated over the full analysis period and are not stable
          through time. They frequently rise during market stress, which reduces the
          diversification benefit exactly when it is most needed.
        </p>
      </PanelBody>
    </Panel>
  );
}
