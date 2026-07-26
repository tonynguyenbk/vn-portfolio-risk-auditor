/**
 * Display formatting.
 *
 * The API returns decimals (PRD 16.4); every percentage the user sees is
 * produced here. Keeping this in one module is what makes the "same numbers on
 * screen and in the report" acceptance criterion (PRD 20.3) checkable.
 */

/** 0.0214 -> "2.14%" */
export function formatPercent(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

/** Signed variant, used for drawdown and shock inputs. 0.0214 -> "+2.14%" */
export function formatSignedPercent(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(digits)}%`;
}

export function formatNumber(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

export function formatInteger(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString("en-US");
}

/**
 * Monetary output is always labelled as a simulated notional amount elsewhere
 * in the UI (PRD 8.3); this only handles the digits.
 */
export function formatNotional(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/** p-values below the printable threshold should not read as exactly zero. */
export function formatPValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value < 0.0001) return "<0.0001";
  return value.toFixed(4);
}

/** "2025-12-31" -> "31 Dec 2025" */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${d} ${months[m - 1]} ${y}`;
}

export function formatDateRange(start: string, end: string): string {
  return `${formatDate(start)} – ${formatDate(end)}`;
}

export function formatConfidence(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}
