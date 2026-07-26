"use client";

import { useId, useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface InfoTooltipProps {
  /** What the term means - not a restatement of the label (PRD 15.2). */
  content: string;
  label: string;
  className?: string;
}

/**
 * Definition tooltip for technical terms.
 *
 * Opens on hover, on keyboard focus, and on click. The click path is what
 * makes it usable on touch devices, which PRD 13.11 requires.
 */
export function InfoTooltip({ content, label, className }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span className={cn("relative inline-flex", className)}>
      <button
        type="button"
        aria-label={`What is ${label}?`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-muted transition-colors duration-150 hover:bg-surface-hover hover:text-ink-secondary"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
      >
        <Info aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            "absolute left-1/2 top-7 z-50 w-60 -translate-x-1/2 rounded-md",
            "border border-line-strong bg-bg-elevated p-3 text-left",
            "text-[12px] font-normal normal-case leading-relaxed tracking-normal text-ink-secondary",
            "shadow-[var(--shadow-panel)]",
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
