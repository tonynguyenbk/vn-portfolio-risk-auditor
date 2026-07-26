import { cn } from "@/lib/utils";

type Tone = "neutral" | "aqua" | "amber" | "coral" | "success";

const tones: Record<Tone, string> = {
  neutral: "border-line bg-surface-2 text-ink-secondary",
  aqua: "border-aqua/40 bg-[var(--aqua-soft)] text-aqua",
  amber: "border-amber/40 bg-amber/10 text-amber",
  coral: "border-coral/40 bg-[var(--coral-soft)] text-coral",
  success: "border-success/40 bg-success/10 text-success",
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ tone = "neutral", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
        "text-[11px] font-medium uppercase tracking-[0.06em]",
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
