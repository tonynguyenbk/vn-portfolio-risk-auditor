"use client";

import { FlaskConical, Upload } from "lucide-react";
import { useAnalysisData } from "@/components/analysis-data-provider";
import { cn } from "@/lib/utils";

/**
 * The label PRD 0.8 requires while the app runs on generated data.
 *
 * Driven by `metadata.isSimulated` from the payload rather than hard-coded,
 * because the claim has to track the data. Leaving "Simulated data" on screen
 * over a user's real portfolio would be as much a misstatement as omitting it
 * from the demo — the point of the label is that it is accurate, not that it
 * is present.
 */
export function SimulatedDataNotice({ className }: { className?: string }) {
  const { analysis } = useAnalysisData();

  if (!analysis.metadata.isSimulated) {
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
        <span className="font-[650] text-amber">Educational prototype • Simulated data</span>
        {" — "}
        every figure below is computed from a deterministic generated series, not
        from observed Vietnamese market data.
      </p>
    </div>
  );
}
