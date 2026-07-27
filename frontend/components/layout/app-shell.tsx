"use client";

import { useEffect, useState } from "react";
import { Loader2, Play, SlidersHorizontal, X } from "lucide-react";
import { useAnalysisParams } from "@/components/analysis-params-provider";
import { AppHeader } from "./app-header";
import { ControlRail } from "./control-rail";
import { Button } from "@/components/ui/button";

/**
 * Application frame.
 *
 * Desktop keeps the analysis rail permanently docked on the left (PRD 13.4).
 * Below the `lg` breakpoint the rail collapses into an overlay drawer and a
 * compact sticky run bar takes over, which is the tablet/mobile behaviour
 * described in PRD 13.11.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { params, runState, runAnalysis, validation } = useAnalysisParams();
  const calculating = runState === "calculating";
  // Matches the rail: the bundled demonstration is already computed.
  const isPrecomputed = params.dataset === "demo";

  // Escape closes the drawer, and body scroll is locked while it is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <AppHeader />

      <div className="flex flex-1">
        <aside
          aria-label="Analysis controls"
          className="sticky top-16 hidden h-[calc(100vh-4rem)] w-72 shrink-0 border-r border-line bg-bg-elevated lg:block xl:w-[288px]"
        >
          <ControlRail />
        </aside>

        <main className="min-w-0 flex-1 px-4 pb-28 pt-4 sm:px-6 sm:pt-6 lg:pb-8">
          {children}
        </main>
      </div>

      {/* Compact sticky run bar - tablet and mobile only (PRD 13.11). */}
      <div className="no-print fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-line bg-bg-elevated/95 p-3 backdrop-blur lg:hidden">
        <Button
          variant="secondary"
          className="shrink-0"
          onClick={() => setDrawerOpen(true)}
          aria-haspopup="dialog"
        >
          <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
          Controls
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          onClick={runAnalysis}
          disabled={!validation.canRun || calculating || isPrecomputed}
        >
          {calculating ? (
            <>
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              Calculating…
            </>
          ) : (
            <>
              <Play aria-hidden="true" className="h-4 w-4" />
              Run analysis
            </>
          )}
        </Button>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close analysis controls"
            className="absolute inset-0 bg-black/60"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Analysis controls"
            className="absolute inset-y-0 left-0 flex w-[min(320px,88vw)] flex-col border-r border-line bg-bg-elevated"
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
              <span className="text-[13px] font-[650] text-ink">Analysis controls</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close analysis controls"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-secondary hover:bg-surface-hover hover:text-ink"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <ControlRail />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
