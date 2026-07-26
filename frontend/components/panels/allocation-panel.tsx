import { Panel, PanelBody, PanelHeader, PanelTitle, Eyebrow } from "@/components/ui/panel";
import { formatNumber, formatPercent } from "@/lib/format";
import type { AssetWeight, Concentration, SectorWeight } from "@/types/analysis";

/** Allocation and concentration output (PRD 11.2 and 11.4). */
export function AllocationPanel({
  weights,
  sectorWeights,
  concentration,
}: {
  weights: AssetWeight[];
  sectorWeights: SectorWeight[];
  concentration: Concentration;
}) {
  return (
    <Panel className="flex h-full flex-col">
      <PanelHeader>
        <PanelTitle>Allocation and concentration</PanelTitle>
      </PanelHeader>

      <PanelBody className="flex flex-1 flex-col gap-5">
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-0.5">
            <Eyebrow>Largest position</Eyebrow>
            <span className="tabular font-mono text-[16px] text-ink">
              {formatPercent(concentration.largestWeight, 1)}
            </span>
            <span className="text-[11px] text-ink-muted">
              {concentration.largestWeightTicker}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <Eyebrow>Largest sector</Eyebrow>
            <span className="tabular font-mono text-[16px] text-ink">
              {formatPercent(concentration.largestSectorWeight, 1)}
            </span>
            <span className="text-[11px] text-ink-muted">{concentration.largestSectorName}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <Eyebrow>HHI</Eyebrow>
            <span className="tabular font-mono text-[16px] text-ink">
              {formatNumber(concentration.hhi, 3)}
            </span>
            <span className="text-[11px] text-ink-muted">Herfindahl–Hirschman</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Eyebrow>By asset</Eyebrow>
          <table className="w-full text-left text-[12px]">
            <caption className="sr-only">Portfolio weights by asset</caption>
            <thead className="text-ink-muted">
              <tr>
                <th scope="col" className="pb-1.5 font-medium">Ticker</th>
                <th scope="col" className="pb-1.5 font-medium">Sector</th>
                <th scope="col" className="pb-1.5 text-right font-medium">Weight</th>
              </tr>
            </thead>
            <tbody className="text-ink-secondary">
              {weights.map((asset) => (
                <tr key={asset.ticker} className="border-t border-line">
                  <td className="py-1.5 font-mono text-ink">{asset.ticker}</td>
                  <td className="py-1.5">{asset.sector}</td>
                  <td className="tabular py-1.5 text-right font-mono">
                    {formatPercent(asset.weight, 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-auto flex flex-col gap-2">
          <Eyebrow>By sector</Eyebrow>
          <ul className="flex flex-col gap-1.5">
            {sectorWeights.map((sector) => (
              <li key={sector.sector} className="flex items-center gap-2">
                <span className="w-24 shrink-0 truncate text-[11px] text-ink-secondary">
                  {sector.sector}
                </span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg">
                  <span
                    className="block h-full rounded-full bg-blue/60"
                    style={{ width: `${sector.weight * 100}%` }}
                  />
                </span>
                <span className="tabular w-12 shrink-0 text-right font-mono text-[11px] text-ink-secondary">
                  {formatPercent(sector.weight, 0)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </PanelBody>
    </Panel>
  );
}
