"use client";

import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string | number> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group, e.g. "Confidence level". */
  label: string;
  className?: string;
}

/**
 * Radio-group segmented control. Uses real radio semantics rather than
 * buttons so screen readers announce the selected option and its position in
 * the set (PRD 15.4).
 */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  label,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex w-full gap-1 rounded-md border border-line bg-bg p-1",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-9 flex-1 rounded px-3 text-[13px] transition-colors duration-150",
              selected
                ? "bg-aqua font-[650] text-[#04121d]"
                : "text-ink-secondary hover:bg-surface-hover hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
