"""Do exit rules reduce losses on Vietnamese equities better than holding less equity?

Run from the repository root (no network needed; the data is committed)::

    uv run --project backend python research/exit_rules/run.py

Prints markdown tables and writes them to ``results.md`` next to this file. The
output is deterministic: fixed data (checked against ``manifest.json``), fixed
bootstrap seed, fixed synthetic seeds, no timestamps.

Five tests, each comparing every rule with buy-and-hold *and* with a static mix
holding the rule's own average equity exposure:

  A. VN30 index: parameters fitted on 2012-2018, judged on 2019-2026; and fixed
     textbook parameters over the whole period.
  B. Each VN30 constituent individually (from 2015 or listing), fixed
     parameters, sells blocked on floor days.
  C. Equal-weight basket of the constituents listed by 2015.
  D. Stationary block bootstrap of VN30: 200 paths, mean block 20 days.
  E. The project's synthetic generator, seeds 0-199 (the original setting of the
     question, as a cross-check).

Everything runs twice: cash earning 0%, then 4%/yr (a Vietnamese deposit-rate
proxy), since a 0% cash rate penalises rules that spend time out of the market.

Methodology and interpretation: docs/experiments/exit-rules.md.
"""

from __future__ import annotations

import hashlib
import json
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from exitlab import (
    RULES,
    WARMUP,
    Costs,
    Metrics,
    Rule,
    Series,
    measure,
    simulate,
    static_mix,
)

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
DATA_PATH = HERE / "data.csv"
MANIFEST_PATH = HERE / "manifest.json"
RESULTS_PATH = HERE / "results.md"

IN_SAMPLE_END = "2019-01-01"  # VN30 fit: everything before this date
CONSTITUENTS_FROM = "2015-01-01"
MIN_EVALUATION_DAYS = 500
#: When fitting, a rule may give up at most this much CAGR against buy-and-hold.
FIT_CAGR_TOLERANCE = 0.02

BOOTSTRAP_PATHS = 200
BOOTSTRAP_MEAN_BLOCK = 20
BOOTSTRAP_SEED = 20261030
SYNTHETIC_SEEDS = range(200)

CASH_RATES = (0.0, 0.04)
INDICES = ("VN30", "VNINDEX")


# ------------------------------------------------------------------------ data


def load_prices() -> tuple[pd.DataFrame, list[str]]:
    """Wide close-price table (dates x tickers) after the documented cleaning."""
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    digest = hashlib.sha256(DATA_PATH.read_bytes()).hexdigest()
    if digest != manifest["files"]["data.csv"]:
        sys.exit(f"data.csv does not match manifest.json ({digest[:12]}...). Refusing to run.")

    raw = pd.read_csv(DATA_PATH, parse_dates=["date"])
    notes = [f"{len(raw):,} rows, {raw.ticker.nunique()} symbols, SHA-256 `{digest[:16]}...`"]

    # Before its 2018-05-18 listing the VHM symbol carried a different company's
    # history; the two are unrelated and must not be spliced.
    stale_vhm = (raw.ticker == "VHM") & (raw.date < "2018-05-18")
    raw = raw[~stale_vhm]
    notes.append(
        f"dropped {int(stale_vhm.sum()):,} VHM rows dated before its 2018-05-18 listing"
    )

    if raw.duplicated(["date", "ticker"]).any() or (raw.close <= 0).any():
        sys.exit("duplicate or non-positive closes in data.csv")
    prices = raw.pivot(index="date", columns="ticker", values="close").sort_index()
    return prices, notes


def log_returns(prices: pd.Series) -> pd.Series:
    """Close-to-close log returns of one ticker; dates it did not trade are skipped,
    so a suspension shows up as one multi-day return rather than invented flat days."""
    p = prices.dropna()
    return np.log(p / p.shift(1)).dropna()


# ------------------------------------------------------------------ evaluation


@dataclass(frozen=True)
class Outcome:
    rule: Metrics
    static: Metrics
    buy_hold: Metrics


def evaluate(
    s: Series,
    rule: Rule,
    costs: Costs,
    *,
    floor: bool = False,
    params: tuple | None = None,
    start: int = WARMUP,
    stop: int | None = None,
) -> Outcome:
    """One rule on one series, with both benchmarks measured over the same window."""
    stop = len(s) if stop is None else stop
    net, exposure = simulate(rule.target(s, params), s.r, costs, floor_blocks_sells=floor)
    rule_m = measure(net, exposure, s.price, start, stop)

    static_net, k = static_mix(exposure[start:stop], s.r[start:stop], costs)
    flat = np.full(stop - start, k)
    static_m = measure(static_net, flat, s.price[start:stop], 0, stop - start)

    bh_net, bh_exp = simulate(np.ones(len(s)), s.r, costs)
    bh_m = measure(bh_net, bh_exp, s.price, start, stop)
    return Outcome(rule_m, static_m, bh_m)


def fit(s: Series, rule: Rule, costs: Costs, split: int) -> tuple:
    """Shallowest in-sample drawdown among parameters that keep CAGR within
    ``FIT_CAGR_TOLERANCE`` of buy-and-hold. Only days before ``split`` are scored."""
    best, best_params = None, None
    for params in rule.grid:
        o = evaluate(s, rule, costs, params=params, stop=split)
        if o.rule.cagr >= o.buy_hold.cagr - FIT_CAGR_TOLERANCE and (
            best is None or o.rule.max_drawdown > best
        ):
            best, best_params = o.rule.max_drawdown, params
    return best_params if best_params is not None else rule.params_for(s)


def calmar(m: Metrics) -> float:
    """CAGR per unit of max drawdown: the trade-off between the two in one number."""
    return m.cagr / abs(m.max_drawdown)


def cross_section(series: list[Series], costs: Costs, floor: bool = False) -> pd.DataFrame:
    """Fixed-parameter outcome of every rule on every series, as one row each."""
    rows = []
    for i, s in enumerate(series):
        for rule in RULES:
            o = evaluate(s, rule, costs, floor=floor)
            rows.append(
                {
                    "series": i,
                    "rule": rule.name,
                    "d_cagr_bh": o.rule.cagr - o.buy_hold.cagr,
                    "d_mdd_bh": o.rule.max_drawdown - o.buy_hold.max_drawdown,
                    "d_cagr_st": o.rule.cagr - o.static.cagr,
                    "d_mdd_st": o.rule.max_drawdown - o.static.max_drawdown,
                    "d_es_st": o.rule.es95 - o.static.es95,
                    "calmar_beats_st": calmar(o.rule) > calmar(o.static),
                    "exposure": o.rule.exposure,
                    "exits": o.rule.exits,
                    "whipsaw": o.rule.whipsaw,
                }
            )
    return pd.DataFrame(rows)


# ------------------------------------------------------------------- the tests


def vn30_series(prices: pd.DataFrame) -> tuple[Series, pd.DatetimeIndex]:
    r = log_returns(prices["VN30"])
    return Series.from_log_returns(r.to_numpy()), r.index


def constituent_series(prices: pd.DataFrame) -> tuple[list[Series], list[str]]:
    out, names = [], []
    for ticker in [t for t in prices.columns if t not in INDICES]:
        r = log_returns(prices.loc[prices.index >= CONSTITUENTS_FROM, ticker])
        if len(r) - WARMUP >= MIN_EVALUATION_DAYS:
            out.append(Series.from_log_returns(r.to_numpy()))
            names.append(ticker)
    return out, names


def basket_series(prices: pd.DataFrame) -> tuple[Series, list[str], pd.DatetimeIndex]:
    """Equal weight, rebalanced daily, of the constituents trading on the first day of 2015.

    Survivorship-biased by construction: these are *today's* VN30 members.
    """
    sub = prices.loc[prices.index >= CONSTITUENTS_FROM, [c for c in prices if c not in INDICES]]
    sub = sub.loc[:, sub.iloc[0].notna()].dropna()
    simple = sub.pct_change().dropna()
    r = np.log1p(simple.mean(axis=1))
    return Series.from_log_returns(r.to_numpy()), list(sub.columns), r.index


def bootstrap_series(r: np.ndarray) -> list[Series]:
    """Politis-Romano stationary bootstrap, circular, geometric block lengths."""
    rng = np.random.default_rng(BOOTSTRAP_SEED)
    n, p_new = len(r), 1.0 / BOOTSTRAP_MEAN_BLOCK
    paths = []
    for _ in range(BOOTSTRAP_PATHS):
        idx = np.empty(n, dtype=int)
        idx[0] = rng.integers(n)
        jump = rng.random(n) < p_new
        fresh = rng.integers(n, size=n)
        for t in range(1, n):
            idx[t] = fresh[t] if jump[t] else (idx[t - 1] + 1) % n
        paths.append(Series.from_log_returns(r[idx]))
    return paths


def synthetic_series() -> list[Series]:
    """The demo generator's fixed-weight portfolio, one path per seed.

    Imports the generator *function*; the shipped demo files are never read.
    """
    sys.path.insert(0, str(REPO / "backend"))
    from scripts.generate_demo_data import DEMO_ASSETS, generate_market_data

    weights = pd.Series({a.ticker: a.weight for a in DEMO_ASSETS})
    out = []
    for seed in SYNTHETIC_SEEDS:
        df = generate_market_data(seed)
        px = df.pivot(index="date", columns="ticker", values="close")[weights.index]
        r = np.log(px / px.shift(1)).dropna()
        out.append(Series.from_log_returns((r * weights).sum(axis=1).to_numpy()))
    return out


def diagnostics(r: np.ndarray) -> dict[str, float]:
    def ac(x: np.ndarray, lag: int) -> float:
        return float(np.corrcoef(x[:-lag], x[lag:])[0, 1])

    return {
        "vol": float(np.std(r, ddof=1) * np.sqrt(252)),
        "ac_r1": ac(r, 1),
        "ac_abs1": ac(np.abs(r), 1),
        "ac_abs20": ac(np.abs(r), 20),
        "ac_abs60": ac(np.abs(r), 60),
        # Base rate for the whipsaw metric: how often the price is higher 20
        # trading days after an arbitrary day, exit or not.
        "up20": float(np.mean(np.convolve(r, np.ones(20), mode="valid")[1:] > 0)),
    }


# ------------------------------------------------------------------ formatting


def pct(x: float, digits: int = 1) -> str:
    return "n/a" if np.isnan(x) else f"{x * 100:.{digits}f}%"


def pp(x: float, digits: int = 1) -> str:
    return "n/a" if np.isnan(x) else f"{x * 100:+.{digits}f}"


def share(x: pd.Series) -> str:
    return f"{(x.mean() * 100):.0f}%"


def table(header: list[str], rows: list[list[str]]) -> str:
    align = ["---"] + ["---:"] * (len(header) - 1)
    lines = ["| " + " | ".join(header) + " |", "| " + " | ".join(align) + " |"]
    lines += ["| " + " | ".join(row) + " |" for row in rows]
    return "\n".join(lines)


def fmt_params(rule: Rule, params: tuple) -> str:
    if rule.fn.__name__ in ("fixed_stop", "trailing_stop"):
        return f"stop {params[0]:.0%}, wait {params[1]}d"
    if rule.fn.__name__ == "vol_target":
        return f"target {params[0]:.1%}"
    if rule.fn.__name__ == "var_breach":
        return f"{params[0]} in {params[1]}d"
    return f"cut at {params[0]:.0%}"


def single_series_table(s: Series, costs: Costs, floor: bool = False) -> str:
    rows = []
    bh = None
    for rule in RULES:
        o = evaluate(s, rule, costs, floor=floor)
        bh = o.buy_hold
        rows.append([
            rule.name, pct(o.rule.cagr), pct(o.rule.max_drawdown), pct(o.rule.es95, 2),
            pct(o.rule.exposure, 0), str(o.rule.exits), pct(o.rule.whipsaw, 0),
            pct(o.static.cagr), pct(o.static.max_drawdown),
            pp(o.rule.cagr - o.static.cagr, 2), pp(o.rule.max_drawdown - o.static.max_drawdown),
        ])  # fmt: skip
    assert bh is not None
    rows.insert(0, ["Buy and hold", pct(bh.cagr), pct(bh.max_drawdown), pct(bh.es95, 2),
                    "100%", "0", "-", "-", "-", "-", "-"])  # fmt: skip
    return table(
        ["Rule", "CAGR", "Max DD", "ES95 (1d)", "In market", "Exits", "Whipsaw",
         "Static CAGR", "Static Max DD", "Δ CAGR vs static (pp)", "Δ Max DD vs static (pp)"],
        rows,
    )  # fmt: skip


def summary_table(d: pd.DataFrame) -> str:
    rows = []
    for rule in RULES:
        g = d[d.rule == rule.name]
        both = (g.d_mdd_st > 0) & (g.d_cagr_st > 0)
        rows.append([
            rule.name,
            pp(g.d_cagr_bh.median(), 2), pp(g.d_mdd_bh.median()),
            pp(g.d_cagr_st.median(), 2), pp(g.d_mdd_st.median()),
            share(g.d_mdd_st > 0), share(g.d_cagr_st > 0), share(both),
            share(g.calmar_beats_st),
            pct(g.exposure.median(), 0), f"{g.exits.median():.0f}", pct(g.whipsaw.median(), 0),
        ])  # fmt: skip
    return table(
        ["Rule", "Δ CAGR vs B&H", "Δ Max DD vs B&H", "Δ CAGR vs static", "Δ Max DD vs static",
         "Max DD better than static", "CAGR better than static", "Both better",
         "CAGR/\\|Max DD\\| better", "In market", "Exits", "Whipsaw"],
        rows,
    )  # fmt: skip


SUMMARY_NOTE = (
    "Medians across series; Δ in percentage points, rule minus benchmark. A positive "
    'Δ Max DD means a *shallower* drawdown. "Static" holds the rule\'s own average '
    "exposure at a constant fraction. Whipsaw = share of exits after which the price "
    'was higher 20 trading days later. "CAGR/|Max DD| better" asks whether the rule\'s '
    "return per unit of drawdown beat the static mix's, i.e. which side of the trade-off won."
)


# ------------------------------------------------------------------------ main


def report(costs: Costs, data: dict) -> list[str]:
    out = [f"## Cash earning {costs.cash_rate:.0%} per year", ""]

    # A. VN30, fitted and fixed
    s, dates = data["vn30"]
    split = int(np.searchsorted(dates, pd.Timestamp(IN_SAMPLE_END)))
    rows = []
    bh_oos = bh_is = None
    for rule in RULES:
        params = fit(s, rule, costs, split)
        is_o = evaluate(s, rule, costs, params=params, stop=split)
        oos = evaluate(s, rule, costs, params=params, start=split)
        bh_is, bh_oos = is_o.buy_hold, oos.buy_hold
        rows.append([
            rule.name, fmt_params(rule, params),
            pct(is_o.rule.cagr), pct(is_o.rule.max_drawdown),
            pct(oos.rule.cagr), pct(oos.rule.max_drawdown), pct(oos.rule.es95, 2),
            pct(oos.rule.exposure, 0), pct(oos.static.cagr), pct(oos.static.max_drawdown),
        ])  # fmt: skip
    assert bh_is is not None and bh_oos is not None
    rows.insert(0, ["Buy and hold", "-", pct(bh_is.cagr), pct(bh_is.max_drawdown),
                    pct(bh_oos.cagr), pct(bh_oos.max_drawdown), pct(bh_oos.es95, 2),
                    "100%", "-", "-"])  # fmt: skip
    first_eval = dates[WARMUP].date()
    out += [
        "### A1. VN30, parameters fitted in-sample, judged out-of-sample",
        "",
        f"In-sample {first_eval} to {dates[split - 1].date()} (after the {WARMUP}-day "
        f"warm-up), out-of-sample {dates[split].date()} to {dates[-1].date()}. Fitting "
        f"objective: shallowest in-sample max drawdown with CAGR no more than "
        f"{FIT_CAGR_TOLERANCE:.0%}/yr below buy-and-hold. The static mix holds the rule's "
        "average out-of-sample exposure.",
        "",
        table(["Rule", "Fitted", "IS CAGR", "IS Max DD", "OOS CAGR", "OOS Max DD",
               "OOS ES95", "OOS in market", "Static OOS CAGR", "Static OOS Max DD"], rows),
        "",
        f"### A2. VN30, fixed textbook parameters, {first_eval} to {dates[-1].date()}",
        "",
        single_series_table(s, costs),
        "",
    ]  # fmt: skip

    # B. constituents
    stocks, _ = data["stocks"]
    out += [
        f"### B. VN30 constituents one by one ({len(stocks)} stocks, from {CONSTITUENTS_FROM} "
        "or listing, sells blocked on floor days)",
        "",
        summary_table(cross_section(stocks, costs, floor=True)),
        "",
        SUMMARY_NOTE,
        "",
    ]

    # C. basket
    basket, members, bdates = data["basket"]
    out += [
        f"### C. Equal-weight basket of the {len(members)} constituents listed by 2015 "
        f"({bdates[WARMUP].date()} to {bdates[-1].date()})",
        "",
        single_series_table(basket, costs),
        "",
    ]

    # D. bootstrap
    out += [
        f"### D. VN30 stationary block bootstrap ({BOOTSTRAP_PATHS} paths, mean block "
        f"{BOOTSTRAP_MEAN_BLOCK} days, seed {BOOTSTRAP_SEED})",
        "",
        summary_table(cross_section(data["bootstrap"], costs)),
        "",
    ]

    # E. synthetic
    out += [
        f"### E. Synthetic generator cross-check ({len(SYNTHETIC_SEEDS)} seeds)",
        "",
        summary_table(cross_section(data["synthetic"], costs)),
        "",
    ]
    return out


def main() -> None:
    prices, notes = load_prices()
    vn30, dates = vn30_series(prices)
    stocks, names = constituent_series(prices)
    data = {
        "vn30": (vn30, dates),
        "stocks": (stocks, names),
        "basket": basket_series(prices),
        "bootstrap": bootstrap_series(vn30.r),
        "synthetic": synthetic_series(),
    }

    diag_rows = [["VN30 (real)", *diagnostics(vn30.r).values()]]
    synth = pd.DataFrame([diagnostics(s.r) for s in data["synthetic"]]).median()
    diag_rows.append(["Synthetic (median of seeds)", *synth.to_numpy()])
    boot = pd.DataFrame([diagnostics(s.r) for s in data["bootstrap"]]).median()
    diag_rows.append(["VN30 bootstrap (median of paths)", *boot.to_numpy()])
    diag = table(
        ["Series", "Ann. vol", "AC(r, 1)",
         "AC(\\|r\\|, 1)", "AC(\\|r\\|, 20)", "AC(\\|r\\|, 60)", "Higher 20d later"],
        [[n, pct(v), f"{a:+.3f}", f"{b:+.3f}", f"{c:+.3f}", f"{e:+.3f}", pct(u, 0)]
         for n, v, a, b, c, e, u in diag_rows],
    )  # fmt: skip

    lines = [
        "# Exit-rule experiment: results",
        "",
        "Generated by `research/exit_rules/run.py`; do not edit by hand. "
        "Interpretation: `docs/experiments/exit-rules.md`.",
        "",
        "## Data",
        "",
        *[f"- {n}" for n in notes],
        f"- VN30: {len(vn30):,} daily returns, {dates[0].date()} to {dates[-1].date()}",
        f"- Constituents tested individually: {', '.join(names)}",
        f"- Basket members: {', '.join(data['basket'][1])}",
        "",
        "Volatility persistence (autocorrelation of returns and of absolute returns), and "
        "the whipsaw base rate (share of all days on which the price was higher 20 trading "
        "days later):",
        "",
        diag,
        "",
        "Mechanics: signal at close t, trade at close t+1; 0.15% fee per side plus 0.10% "
        f"sales tax; rules inactive for a {WARMUP}-day warm-up which is excluded from every "
        "metric. ES95 is the historical one-day Expected Shortfall of net simple returns.",
        "",
    ]
    for rate in CASH_RATES:
        lines += report(Costs(cash_rate=rate), data)

    text = "\n".join(lines).rstrip() + "\n"
    # The tables contain "Δ"; Windows consoles default to cp1252.
    sys.stdout.reconfigure(encoding="utf-8")
    print(text)
    RESULTS_PATH.write_bytes(text.encode("utf-8"))


if __name__ == "__main__":
    main()
