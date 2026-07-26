import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The label PRD 0.8 requires on every screen while the app runs on generated
 * data. Its wording is fixed by the spec and should not be softened.
 */
export function SimulatedDataNotice({ className }: { className?: string }) {
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
