"use client";

import { FlaskConical, Upload } from "lucide-react";
import { useAnalysisData } from "@/components/analysis-data-provider";
import { DEMO_DATA_DESCRIPTION } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

/**
 * The data-provenance label PRD 0.8 requires above every page of figures.
 *
 * The bundled demonstration is real historical market data, so it is labelled
 * as such — with its source and period, and with the not-investment-advice
 * disclaimer. Uploaded data gets a different label.
 *
 * Driven by which dataset is on screen rather than hard-coded, because the
 * claim has to track the data: describing a user's own upload as the bundled
 * Vietcap series would be as much a misstatement as omitting the label from the
 * demo. (The component keeps its historical name, from when the bundled data
 * was synthetic, to avoid churning every page that imports it.)
 */
export function SimulatedDataNotice({ className }: { className?: string }) {
  const { source } = useAnalysisData();

  if (source === "upload") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-2",
          className,
        )}
      >
        <Upload aria-hidden="true" className="h-4 w-4 shrink-0 text-aqua" />
        <p className="text-[12px] leading-snug text-ink-secondary">
          <span className="font-[650] text-ink">Analysing uploaded data</span>
          {" — "}
          figures below were computed from the files you supplied. This remains an
          educational prototype and is not a production risk system.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border border-amber/30 bg-amber/[0.07] px-3 py-2",
        className,
      )}
    >
      <FlaskConical aria-hidden="true" className="h-4 w-4 shrink-0 text-amber" />
      <p className="text-[12px] leading-snug text-ink-secondary">
        <span className="font-[650] text-amber">{DEMO_DATA_DESCRIPTION}.</span>{" "}
        Educational prototype — not investment advice.
      </p>
    </div>
  );
}
