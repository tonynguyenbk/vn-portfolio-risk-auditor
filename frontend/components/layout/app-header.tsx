"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/model-audit", label: "Model Audit" },
  { href: "/stress-test", label: "Stress Test" },
  { href: "/report", label: "Report" },
] as const;

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg-elevated/95 backdrop-blur">
      <div className="flex h-16 items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <ShieldCheck aria-hidden="true" className="h-5 w-5 text-aqua" />
          <span className="flex flex-col leading-tight">
            <span className="text-[15px] font-bold tracking-[0.02em] text-ink">
              VN RISK AUDITOR
            </span>
            <span className="hidden text-[11px] text-ink-muted lg:block">
              Portfolio risk intelligence for Vietnam&apos;s equity market
            </span>
          </span>
        </Link>

        <nav aria-label="Sections" className="ml-2 min-w-0 flex-1">
          {/* Horizontal scroll keeps all four sections reachable on mobile
              without collapsing them behind a menu (PRD 13.11). */}
          <ul className="flex gap-1 overflow-x-auto">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-3 text-[13px]",
                      "transition-colors duration-150",
                      active
                        ? "bg-[var(--aqua-soft)] font-[650] text-aqua"
                        : "text-ink-secondary hover:bg-surface-hover hover:text-ink",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Badge tone="aqua" className="hidden sm:inline-flex">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-aqua"
            />
            Data OK
          </Badge>
          <Badge tone="amber">
            <span className="sm:hidden">Prototype</span>
            <span className="hidden sm:inline">Educational prototype</span>
          </Badge>
          <InfoTooltip
            label="this prototype"
            content="An educational research prototype. It measures and validates portfolio risk on simulated data. It does not give investment advice, predict prices, or place trades."
          />
        </div>
      </div>
    </header>
  );
}
