import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variants: Record<Variant, string> = {
  // Aqua background, dark navy text, per PRD 13.6.
  primary:
    "bg-aqua text-[#04121d] font-[650] hover:brightness-110 disabled:bg-line disabled:text-ink-muted",
  secondary:
    "border border-line-strong bg-surface-2 text-ink hover:bg-surface-hover disabled:text-ink-muted",
  ghost: "text-ink-secondary hover:bg-surface-hover hover:text-ink",
};

export function Button({
  variant = "secondary",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        // 44px minimum touch target (PRD 13.6 and 13.11).
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm",
        "transition-[background-color,filter] duration-150",
        "disabled:cursor-not-allowed",
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
