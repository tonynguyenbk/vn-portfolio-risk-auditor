/**
 * Browser-side risk arithmetic for the What-if page.
 *
 * The page recomputes risk on every slider movement, so it cannot wait on the
 * API — which on a free tier may be asleep. This module is therefore a small
 * port of the engine functions the page needs, and it follows the engine's
 * conventions exactly (docs/methodology.md §1):
 *
 * - log returns, aligned on the intersection of trading dates, never
 *   forward-filled;
 * - decimals internally; losses, VaR and ES positive; drawdown negative;
 * - empirical quantiles by linear interpolation between order statistics
 *   (NumPy `method="linear"`);
 * - `null`, never `0`, when a figure cannot be computed.
 *
 * Parity is not assumed: `tests/what-if-parity.test.ts` feeds a fixture built
 * by the real Python engine (`backend/scripts/whatif_parity_fixture.py`)
 * through these functions and requires agreement to ~1e-9.
 *
 * **Equity fraction.** The rest of the capital is cash earning zero. The mix
 * is linear in *simple* returns, so the portfolio's daily simple return is
 * `R_t = f · (exp(r_p,t) − 1)` with `r_p,t = Σ w_i r_i,t` the engine's
 * log-return aggregation. VaR and ES are taken on `R_t`, which makes the VND
 * figure exactly `capital × loss`. Volatility, drawdown and the worst
 * five-day loss use `g_t = ln(1 + R_t)`, which equals `r_p,t` when `f = 1`, so
 * those match the Overview figures for the unchanged portfolio.
 *
 * Pure functions only: no React, no fetch, no formatting.
 */

export const TRADING_DAYS_PER_YEAR = 252;
export const WORST_WINDOW_DAYS = 5;

// --------------------------------------------------------------------------- //
// Parsing and alignment
// --------------------------------------------------------------------------- //

export interface PriceRow {
  date: string;
  ticker: string;
  close: number;
}

/** Split one CSV line, honouring double-quoted fields ("Real Estate, X"). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

/** ISO `YYYY-MM-DD` for a date cell, or null when it cannot be read. */
function normaliseDate(raw: string): string | null {
  const value = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  const d = new Date(parsed);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Parse long-form market data (`date,ticker,close,...`), cleaned the way the
 * engine's `clean_market_frame` cleans it: rows with an unreadable date, an
 * empty ticker or a non-positive / non-numeric price are dropped, tickers are
 * trimmed and upper-cased, and of duplicate `(date, ticker)` pairs the first
 * occurrence wins.
 */
export function parseMarketCsv(text: string): PriceRow[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const header = splitCsvLine(lines[0] ?? "").map((h) => h.trim().toLowerCase());
  const di = header.indexOf("date");
  const ti = header.indexOf("ticker");
  const ci = header.indexOf("close");
  if (di < 0 || ti < 0 || ci < 0) {
    throw new Error("Market data is missing a date, ticker or close column.");
  }

  const seen = new Set<string>();
  const rows: PriceRow[] = [];
  for (let n = 1; n < lines.length; n++) {
    const line = lines[n];
    if (!line || !line.trim()) continue;
    const cells = splitCsvLine(line);
    const date = normaliseDate(cells[di] ?? "");
    const ticker = (cells[ti] ?? "").trim().toUpperCase();
    const closeCell = (cells[ci] ?? "").trim();
    const close = closeCell === "" ? NaN : Number(closeCell);
    if (!date || !ticker || !Number.isFinite(close) || close <= 0) continue;
    const key = `${date}|${ticker}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ date, ticker, close });
  }
  return rows;
}

export interface AlignedPrices {
  dates: string[];
  tickers: string[];
  /** `prices[t][i]`: close of `tickers[i]` on `dates[t]`. */
  prices: number[][];
}

/**
 * Wide price table restricted to `tickers`, keeping only dates on which every
 * one of them traded (intersection; nothing is forward-filled). Optional
 * inclusive `start` / `end` bounds mirror the engine's date-range filter.
 */
export function alignPrices(
  rows: PriceRow[],
  tickers: string[],
  start?: string | null,
  end?: string | null,
): AlignedPrices {
  const index = new Map(tickers.map((t, i) => [t, i]));
  const byDate = new Map<string, (number | undefined)[]>();
  for (const row of rows) {
    const i = index.get(row.ticker);
    if (i === undefined) continue;
    if (start && row.date < start) continue;
    if (end && row.date > end) continue;
    let slot = byDate.get(row.date);
    if (!slot) {
      // Filled, not sparse: `every` skips holes, which would let a missing
      // price through as if the asset had traded.
      slot = new Array<number | undefined>(tickers.length).fill(undefined);
      byDate.set(row.date, slot);
    }
    slot[i] = row.close;
  }

  const missing = tickers.filter((t) => !rows.some((r) => r.ticker === t));
  if (missing.length) {
    throw new Error(`Tickers absent from the price data: ${missing.join(", ")}`);
  }

  const dates = [...byDate.keys()].sort();
  const kept: string[] = [];
  const prices: number[][] = [];
  for (const date of dates) {
    const slot = byDate.get(date)!;
    if (slot.every((v) => v !== undefined)) {
      kept.push(date);
      prices.push(slot as number[]);
    }
  }
  return { dates: kept, tickers, prices };
}

/** `r_{i,t} = ln(P_{i,t} / P_{i,t-1})`; one fewer row than the prices. */
export function logReturns(prices: number[][]): number[][] {
  const out: number[][] = [];
  for (let t = 1; t < prices.length; t++) {
    out.push(prices[t].map((p, i) => Math.log(p / prices[t - 1][i])));
  }
  return out;
}

/** `r_p,t = Σ w_i r_i,t` — the engine's fixed-weight log aggregation. */
export function portfolioLogReturns(assetReturns: number[][], weights: number[]): number[] {
  return assetReturns.map((row) => row.reduce((acc, r, i) => acc + weights[i] * r, 0));
}

/** `R_t = f · (exp(r_p,t) − 1)`: equity sleeve plus cash earning zero. */
export function mixedSimpleReturns(portfolioLog: number[], fraction: number): number[] {
  return portfolioLog.map((r) => fraction * Math.expm1(r));
}

/** `g_t = ln(1 + R_t)`, the log growth of the mixed portfolio. */
export function mixedLogReturns(portfolioLog: number[], fraction: number): number[] {
  return portfolioLog.map((r) => Math.log1p(fraction * Math.expm1(r)));
}

// --------------------------------------------------------------------------- //
// Tail measures
// --------------------------------------------------------------------------- //

/** NumPy `quantile(..., method="linear")` on an unsorted sample. */
export function quantileLinear(values: number[], q: number): number {
  if (values.length === 0) throw new Error("cannot take a quantile of an empty sample");
  const sorted = [...values].sort((a, b) => a - b);
  const h = (sorted.length - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

/** Historical-simulation VaR of a return series, as a positive loss. */
export function historicalVar(returns: number[], confidence: number): number | null {
  if (returns.length < 2 || !returns.every(Number.isFinite)) return null;
  return quantileLinear(
    returns.map((r) => -r),
    confidence,
  );
}

/** `ES = mean{ L : L ≥ VaR }`, with VaR from the same empirical quantile. */
export function historicalExpectedShortfall(
  returns: number[],
  confidence: number,
): number | null {
  const threshold = historicalVar(returns, confidence);
  if (threshold === null) return null;
  const tail = returns.map((r) => -r).filter((l) => l >= threshold);
  if (tail.length === 0) return threshold;
  return tail.reduce((a, b) => a + b, 0) / tail.length;
}

// --------------------------------------------------------------------------- //
// Path measures
// --------------------------------------------------------------------------- //

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Sample standard deviation × √252. */
export function annualisedVolatility(logReturns: number[]): number | null {
  if (logReturns.length < 2) return null;
  const m = mean(logReturns);
  const ss = logReturns.reduce((acc, r) => acc + (r - m) ** 2, 0);
  return Math.sqrt(ss / (logReturns.length - 1)) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/**
 * Deepest peak-to-trough decline of `100 · exp(cumsum(r))`, with the 100
 * starting point included, as the engine builds it. Negative or zero.
 */
export function maximumDrawdown(logReturns: number[]): number | null {
  if (logReturns.length === 0) return null;
  let cum = 0;
  let peak = 100;
  let worst = 0;
  for (const r of logReturns) {
    cum += r;
    const wealth = 100 * Math.exp(cum);
    if (wealth > peak) peak = wealth;
    const dd = wealth / peak - 1;
    if (dd < worst) worst = dd;
  }
  return worst;
}

/**
 * Largest loss over any `days` consecutive trading days (a trading week by
 * default), as a positive simple loss `1 − exp(Σ g)`. Null below `days`
 * observations.
 */
export function worstWindowLoss(
  logReturns: number[],
  days: number = WORST_WINDOW_DAYS,
): number | null {
  if (logReturns.length < days) return null;
  let worst = -Infinity;
  for (let t = days - 1; t < logReturns.length; t++) {
    let sum = 0;
    for (let k = t - days + 1; k <= t; k++) sum += logReturns[k];
    worst = Math.max(worst, 1 - Math.exp(sum));
  }
  return worst;
}

// --------------------------------------------------------------------------- //
// Risk contribution
// --------------------------------------------------------------------------- //

/** Sample covariance (`n − 1`) of an observations × assets matrix. */
export function covarianceMatrix(returns: number[][]): number[][] {
  const n = returns.length;
  const k = returns[0]?.length ?? 0;
  if (n < 2) throw new Error("at least two observations are required");
  const means = Array.from({ length: k }, (_, i) => mean(returns.map((row) => row[i])));
  const cov = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let i = 0; i < k; i++) {
    for (let j = i; j < k; j++) {
      let s = 0;
      for (let t = 0; t < n; t++) s += (returns[t][i] - means[i]) * (returns[t][j] - means[j]);
      cov[i][j] = cov[j][i] = s / (n - 1);
    }
  }
  return cov;
}

/** `σ_p = √(wᵀ Σ w)`, daily. */
export function portfolioVolatility(cov: number[][], weights: number[]): number {
  const variance = weights.reduce(
    (acc, wi, i) => acc + wi * cov[i].reduce((s, c, j) => s + c * weights[j], 0),
    0,
  );
  return Math.sqrt(Math.max(0, variance));
}

export interface ContributionRow {
  ticker: string;
  weight: number;
  /** `RC_i = w_i (Σw)_i / σ_p`; sums to `σ_p`. */
  contribution: number;
  /** `RC_i / σ_p`; sums to 1. */
  contributionPct: number;
}

/** Euler decomposition of portfolio volatility; null when `σ_p = 0`. */
export function riskContributions(
  cov: number[][],
  weights: number[],
  tickers: string[],
): ContributionRow[] | null {
  const sigma = portfolioVolatility(cov, weights);
  if (sigma === 0) return null;
  return weights.map((w, i) => {
    const marginal = cov[i].reduce((s, c, j) => s + c * weights[j], 0) / sigma;
    const contribution = w * marginal;
    return { ticker: tickers[i], weight: w, contribution, contributionPct: contribution / sigma };
  });
}

// --------------------------------------------------------------------------- //
// Weights
// --------------------------------------------------------------------------- //

/** Clip negatives and scale to sum to one; equal weights if nothing is left. */
export function normaliseWeights(weights: number[]): number[] {
  const clipped = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const total = clipped.reduce((a, b) => a + b, 0);
  if (total === 0) return weights.map(() => 1 / weights.length);
  return clipped.map((w) => w / total);
}

/**
 * Set one weight and rescale the others proportionally so the sleeve still
 * sums to 100%. If the others are all zero, the remainder is shared equally.
 */
export function setWeight(weights: number[], index: number, value: number): number[] {
  const target = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  if (weights.length === 1) return [1];
  const othersTotal = weights.reduce((acc, w, i) => (i === index ? acc : acc + w), 0);
  const remainder = 1 - target;
  return weights.map((w, i) => {
    if (i === index) return target;
    if (othersTotal <= 0) return remainder / (weights.length - 1);
    return (w / othersTotal) * remainder;
  });
}

/** Weights the What-if starts from, and returns to on "Reset to original". */
export function resetWeights(original: number[]): number[] {
  return normaliseWeights(original);
}

// --------------------------------------------------------------------------- //
// Assembled summary and the equity-fraction rule
// --------------------------------------------------------------------------- //

export interface RiskSummary {
  /** One-day historical VaR as a fraction of capital. */
  var: number | null;
  expectedShortfall: number | null;
  annualisedVolatility: number | null;
  maximumDrawdown: number | null;
  worstFiveDayLoss: number | null;
  /** Daily `σ_p` of the whole capital, cash included. */
  portfolioVolatilityDaily: number;
  /** Null when the portfolio has no volatility (e.g. all cash). */
  contributions: ContributionRow[] | null;
}

export interface WhatIfInputs {
  tickers: string[];
  assetReturns: number[][];
  covariance: number[][];
}

export function prepareInputs(aligned: AlignedPrices): WhatIfInputs {
  const assetReturns = logReturns(aligned.prices);
  if (assetReturns.length < 2) {
    throw new Error("At least three aligned trading days are required.");
  }
  return { tickers: aligned.tickers, assetReturns, covariance: covarianceMatrix(assetReturns) };
}

export function summariseRisk(
  inputs: WhatIfInputs,
  weights: number[],
  fraction: number,
  confidence: number,
): RiskSummary {
  const portfolioLog = portfolioLogReturns(inputs.assetReturns, weights);
  const simple = mixedSimpleReturns(portfolioLog, fraction);
  const growth = mixedLogReturns(portfolioLog, fraction);
  const effective = weights.map((w) => w * fraction);

  return {
    var: historicalVar(simple, confidence),
    expectedShortfall: historicalExpectedShortfall(simple, confidence),
    annualisedVolatility: annualisedVolatility(growth),
    maximumDrawdown: maximumDrawdown(growth),
    worstFiveDayLoss: worstWindowLoss(growth, WORST_WINDOW_DAYS),
    portfolioVolatilityDaily: portfolioVolatility(inputs.covariance, effective),
    contributions: riskContributions(inputs.covariance, effective, inputs.tickers),
  };
}

/** Historical ES of the mixed portfolio at equity fraction `f`. */
export function expectedShortfallAtFraction(
  portfolioLog: number[],
  fraction: number,
  confidence: number,
): number | null {
  return historicalExpectedShortfall(mixedSimpleReturns(portfolioLog, fraction), confidence);
}

/**
 * Largest equity fraction `f ∈ [0, 1]` with `ES(f) ≤ tolerancePct`.
 *
 * On simple returns every daily loss scales by `f`, so the empirical quantile,
 * the tail set and therefore ES scale by `f` too: `ES(f) = f · ES(1)`. The
 * candidate `min(1, tolerance / ES(1))` follows directly. It is then checked
 * against the loss series itself, and a bisection takes over should the check
 * ever fail — so the answer stays correct even if that identity were broken by
 * a future change to how the mix is built.
 *
 * Returns null when ES cannot be computed.
 */
export function maxEquityFraction(
  portfolioLog: number[],
  confidence: number,
  tolerancePct: number,
): number | null {
  const full = expectedShortfallAtFraction(portfolioLog, 1, confidence);
  if (full === null || !Number.isFinite(tolerancePct)) return null;
  if (tolerancePct <= 0) return 0;
  if (full <= tolerancePct) return 1;

  const within = (f: number) => {
    const es = expectedShortfallAtFraction(portfolioLog, f, confidence);
    return es !== null && es <= tolerancePct * (1 + 1e-12);
  };

  const candidate = tolerancePct / full;
  if (within(candidate)) return candidate;

  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (within(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}
