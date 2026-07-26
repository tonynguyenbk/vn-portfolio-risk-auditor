import { cn } from "@/lib/utils";

/**
 * The base surface for every analytical block. Subtle navy gradient, one-pixel
 * border, no glow unless focused (PRD 13.7).
 */
export function Panel({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-line bg-gradient-to-b from-surface-2 to-surface",
        "shadow-[var(--shadow-panel)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function PanelTitle({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("text-[16px] font-[650] tracking-tight text-ink", className)}
      {...props}
    >
      {children}
    </h2>
  );
}

export function PanelBody({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-4", className)} {...props}>
      {children}
    </div>
  );
}

/** Small uppercase label used above values and in table headers (PRD 13.3). */
export function Eyebrow({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "text-[11px] font-medium uppercase tracking-[0.08em] text-ink-muted",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
