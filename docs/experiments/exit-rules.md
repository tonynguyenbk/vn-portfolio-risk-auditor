# Do exit rules reduce losses better than holding less equity?

A research experiment on Vietnamese equities, kept separate from the web
application. It changes nothing on the dashboard.

| | |
|---|---|
| Code | [`research/exit_rules/`](../../research/exit_rules/) |
| Full output | [`research/exit_rules/results.md`](../../research/exit_rules/results.md) (generated, deterministic) |
| Reproduce | `uv run --project backend python research/exit_rules/run.py` (no network needed) |
| Mechanics tests | `backend/tests/test_exit_rules_experiment.py` |

All figures below are from that run. Nothing here is investment advice.

---

## 1. The question

Retail investors in Vietnam are routinely advised to "cut losses at −7%", and
risk-management texts recommend trailing stops, volatility targeting or
drawdown limits. Each of these rules reduces losses compared with buy-and-hold.
That much is close to automatic: a rule that spends part of its time in cash
holds less equity on average, and less equity means smaller drawdowns.

The question that matters is narrower:

> **Does the rule's *timing* add anything, or would simply holding less equity
> all the time have done as well?**

So every rule is compared with two benchmarks: buy-and-hold, and a **static
mix** that holds a constant equity fraction equal to the rule's own average
exposure. A rule that is 80% invested on average is judged against an 80/20
equity/cash mix. Beating buy-and-hold on drawdown is expected. Beating the
static mix is the actual test.

## 2. Short answer

**No, not reliably.** On real Vietnamese data, every rule except the fixed stop
reduced drawdown against buy-and-hold, at a cost of roughly 2–4 percentage
points of annual return (about 6 for a trailing stop on single stocks). Against
the static mix, though, no rule did better on both return and drawdown in a
majority of the 30 constituents or the 200 bootstrap paths. Volatility targeting gave
somewhat shallower drawdowns in 60–70% of cases, but it gave up more return to
get them: its return per unit of drawdown was better than the static mix's in
only 30–41% of cases.

The one result that looked like a clear win, a VaR-breach rule fitted on
2013–2018 VN30 data, did well on 2019–2026 but did not carry over to the
individual stocks or the bootstrap paths. It is best read as fitting one
historical path.

On the project's synthetic generator, volatility targeting *did* clearly beat the
static mix. That difference has a specific cause, covered in §6.

---

## 3. Data and cleaning

| | |
|---|---|
| Source | Vietcap chart endpoint `trading.vietcap.com.vn/api/chart/OHLCChart/gap-chart`, public, undocumented, no authentication |
| Use | Personal, non-commercial research (approved by the project owner) |
| Request | Daily bars, `to` frozen at 2026-10-30 00:00 UTC, `countBack` 5000 |
| Symbols | VN30 index, VN-Index, and the 30 VN30 constituents as of the fetch date |
| Price basis | Vendor-adjusted close for stocks; the indices are price indices |
| Size | 110,380 rows, 3.4 MB, committed with a SHA-256 manifest |

`fetch_data.py` uses only the standard library and writes `data.csv` plus
`manifest.json`. `run.py` refuses to run if the file does not match the
manifest's checksum. Re-fetching is **not** expected to reproduce the file byte
for byte even with the frozen `to`, because the vendor re-adjusts historical
closes after every new corporate action. That is why the data is committed:
the checksum pins the data these results came from.

Cleaning, all in `run.py`:

- **VHM before 2018-05-18 is dropped (1,413 rows).** Before Vinhomes listed, the
  endpoint's VHM history belongs to a different company. Joining the two would
  create a fake price jump.
- Missing dates are **never forward-filled** (the same rule as
  [methodology §2.2](../methodology.md)). A stock that did not trade simply has
  no return that day. A suspension shows up as one return covering several days.
- The basket uses only dates on which every member traded.
- The check rejects duplicate (date, ticker) pairs and non-positive closes. There
  were none.

| Series | Period used | Returns |
|---|---|---:|
| VN30 index | 2012-02-07 → 2026-10-29 | 3,675 |
| Constituents | from 2015-01-01 or listing, if ≥ 750 returns | 30 stocks |
| Equal-weight basket | 16 members listed by 2015, 2015 → 2026 | — |

---

## 4. Method

### 4.1 Execution model

| | |
|---|---|
| Signal | Computed from data up to and including the close of day *t* |
| Trade | Executed at the close of day *t* + 1 |
| First return earned | Day *t* + 2, so `exposure[t] = target[t − 2]` |
| Costs | 0.15% brokerage per side, plus 0.10% sales tax on the value sold, charged on every change in exposure |
| Cash | 0% (main run) and 4%/yr (sensitivity, a proxy for Vietnamese deposit rates) |
| Floor days | Single stocks only: a *sale* cannot execute at a close down ≥ 6.5% (the HOSE limit is −7%); the order rolls to the next close. Purchases are never blocked |
| Warm-up | Rules stay inactive for the first 250 days, which seed the EWMA. Every metric excludes those days, for every strategy |
| Start | All strategies start fully invested, so no entry cost is charged |

The lag is applied in one place (`exitlab.simulate`), and the test suite checks
it adversarially, the same way [methodology §7.1](../methodology.md) checks the
backtest. A −50% day at *t* must leave every rule's exposure on days ≤ *t* + 1
unchanged bit for bit. A matching test checks that a shock *does* change
exposure at *t* + 2, so the first test cannot pass vacuously.

### 4.2 Rules

| Rule | Logic | Fixed parameters | Grid when fitted |
|---|---|---|---|
| Fixed stop from cost | Sell when the price is 7% below the entry price; buy back after 20 days at the new price | 7%, 20 d | 5, 7, 10, 15% |
| Trailing stop | Sell when the price is *x* below its high since entry; re-enter after *w* days | 10%, 20 d | *x* ∈ 5–20%, *w* ∈ 10, 20, 60 d |
| Volatility targeting | Hold `min(1, σ* / σ̂)`, with σ̂ the EWMA (λ = 0.94) forecast; trade only when the target moves more than 10 pp | σ* = 0.75 × the series' own volatility over the warm-up | σ* ∈ 10–25% |
| VaR-breach exit | Go to cash after *k* exceptions of the 95% EWMA VaR within 20 days; re-enter after 20 days with no exception | *k* = 3 | *k* ∈ 2–5 |
| Drawdown control | Cut to 50% equity when the price is *a* below its running high; return to 100% once the drawdown recovers to *a*/2 | *a* = 20% | *a* ∈ 10–25% |

### 4.3 Benchmarks and metrics

- **Buy-and-hold**: 100% equity, never traded.
- **Static mix**: constant equity fraction *k* = mean exposure of the rule over
  the same window, with the remainder in cash. It is treated exactly like a
  rule's constant-exposure stretches: held at a fixed fraction with no
  rebalancing cost.
- **CAGR**, **maximum drawdown** (negative, measured from starting capital),
  **ES95**: the historical one-day Expected Shortfall of net simple returns
  (linear quantile, as in [methodology §5](../methodology.md)), **time in
  market** (mean exposure), and **whipsaw rate**: the share of exits after which
  the price was higher 20 trading days later, measured from the execution close.
- **CAGR / |max DD|**: used only to say which side of a return-versus-drawdown
  trade-off came out ahead.

### 4.4 The five tests

| | Test | Parameters | Purpose |
|---|---|---|---|
| A | VN30 index | fitted on 2013–2018, judged on 2019–2026; also fixed | The usual way a rule is "validated", on the index investors actually watch |
| B | 30 constituents one by one, floor-day rule on | fixed | Does it generalise across stocks? |
| C | Equal-weight basket of the 16 constituents listed by 2015 | fixed | A diversified portfolio |
| D | Stationary block bootstrap of VN30 (Politis–Romano, circular), 200 paths, mean block 20 days, seed 20261030 | fixed | Does it survive other orderings of the same returns? |
| E | The project's generator (`generate_market_data`, seeds 0–199), demo weights | fixed | The setting where the idea was first explored |

Fitting objective in test A: the shallowest in-sample max drawdown among
parameters whose in-sample CAGR is no more than 2%/yr below buy-and-hold.

The synthetic test imports the generator *function* from
`backend/scripts/generate_demo_data.py`. It never reads the shipped demo files,
so it does not depend on which dataset the dashboard ships.

---

## 5. Results (cash at 0%)

### 5.1 VN30, fitted in-sample, judged out-of-sample (test A1)

In-sample 2013-02-01 → 2018-12-28, out-of-sample 2019-01-02 → 2026-10-29.

| Rule | Fitted | OOS CAGR | OOS Max DD | OOS in market | Static CAGR | Static Max DD |
|---|---|---:|---:|---:|---:|---:|
| Buy and hold | — | 10.7% | −42.5% | 100% | — | — |
| Fixed stop from cost | 7%, 20 d | 10.7% | −42.5% | 100% | 10.7% | −42.5% |
| Trailing stop | 5%, 60 d | 6.3% | −19.1% | 43% | 5.1% | −20.8% |
| Vol targeting | σ* = 10% | 4.3% | −24.3% | 58% | 6.7% | −27.1% |
| **VaR-breach exit** | 4 in 20 d | **12.3%** | **−28.2%** | 89% | 9.6% | −38.5% |
| Drawdown control | 10% | 6.4% | −29.3% | 63% | 7.2% | −29.0% |

Taken alone, the VaR-breach rule looks excellent: it beat buy-and-hold on
*both* return and drawdown out-of-sample, and the out-of-sample period was
genuinely unseen during fitting. Sections 5.3–5.4 show why it does not hold up.

### 5.2 VN30, fixed parameters, 2013–2026 (test A2)

| Rule | CAGR | Max DD | ES95 | In market | Exits | Whipsaw | Δ CAGR vs static | Δ Max DD vs static |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Buy and hold | 9.3% | −48.1% | 3.11% | 100% | 0 | — | — | — |
| Fixed stop from cost | 8.9% | −48.1% | 3.11% | 99% | 1 | (1 exit) | −0.29 | −0.2 |
| Trailing stop | 5.3% | −35.7% | 2.72% | 87% | 23 | 70% | −2.88 | +7.4 |
| Vol targeting | 6.0% | −34.3% | 2.30% | 82% | 57 | 63% | −1.78 | +7.0 |
| VaR-breach exit | 6.2% | −24.4% | 2.48% | 77% | 25 | 60% | −1.16 | +14.8 |
| Drawdown control | 7.6% | −36.7% | 2.53% | 78% | 3 | (3 exits) | +0.05 | +3.1 |

Δ in percentage points, rule minus static mix. A positive Δ Max DD means a
shallower drawdown.

On this one path, four of the five rules have a shallower drawdown than their
static mix, and all but drawdown control pay for it with lower return.

### 5.3 Across stocks, bootstrap paths and synthetic seeds (tests B, D, E)

Share of series in which the rule beat its static mix. Each cell reads: better
max drawdown / better CAGR / better on both / better CAGR per unit of drawdown.

| Rule | Stocks (30) | VN30 bootstrap (200) | Synthetic (200) |
|---|---|---|---|
| Fixed stop from cost | 3% / 33% / 3% / 23% | 11% / 22% / 10% / 21% | 23% / 30% / 18% / 30% |
| Trailing stop | 40% / 27% / 17% / 27% | 34% / 24% / 16% / 25% | 51% / 37% / 32% / 39% |
| Vol targeting | 70% / 20% / 17% / 30% | 60% / 21% / 18% / 36% | **92% / 57% / 56% / 68%** |
| VaR-breach exit | 47% / 33% / 23% / 47% | 32% / 26% / 15% / 29% | 32% / 36% / 24% / 33% |
| Drawdown control | 57% / 50% / 40% / 50% | 58% / 38% / 28% / 53% | 35% / 32% / 15% / 36% |

Median difference against the static mix, CAGR (pp) / Max DD (pp):

| Rule | Stocks | VN30 bootstrap | Synthetic |
|---|---|---|---|
| Fixed stop from cost | −0.48 / −0.7 | +0.00 / −0.2 | +0.00 / −0.4 |
| Trailing stop | −3.28 / −1.5 | −1.63 / −3.6 | −1.65 / +0.1 |
| Vol targeting | −1.42 / +1.6 | −0.91 / +1.2 | **+0.43 / +9.9** |
| VaR-breach exit | −0.70 / −1.9 | −1.39 / −4.2 | −1.59 / −4.2 |
| Drawdown control | −0.39 / +0.8 | −0.63 / +1.3 | −0.91 / −2.0 |

Median difference against buy-and-hold, CAGR (pp) / Max DD (pp):

| Rule | Stocks | VN30 bootstrap |
|---|---|---|
| Fixed stop from cost | −0.40 / −0.0 | +0.00 / +0.0 |
| Trailing stop | −6.32 / +7.6 | −2.82 / +0.9 |
| Vol targeting | −3.18 / +11.2 | −3.13 / +9.3 |
| VaR-breach exit | −3.10 / +5.4 | −3.44 / +3.3 |
| Drawdown control | −2.19 / +14.6 | −2.05 / +7.7 |

Median whipsaw rate: 52–57% across stocks, 60–61% across bootstrap paths, 50–56%
on synthetic data. **Base rate:** on VN30, the price was higher 20 days later
on 59% of *all* days. Exits on VN30 were therefore timed no better than a
randomly chosen day.

### 5.4 Equal-weight basket (test C)

On the 16-stock basket (2016–2026), two rules beat their static mix on both
measures: the VaR-breach exit (+0.34 pp CAGR, +15.4 pp max DD) and drawdown
control (+1.10 pp, +3.6 pp). Like the VN30 index, the basket is one historical
path, made of large caps, through the same 2018, 2020 and 2022 sell-offs. It
is a second view of the history that already flattered these rules in test A,
not independent evidence. It is also survivorship-biased (§7).

### 5.5 Sensitivity: cash earning 4% per year

Interest on cash improves every rule against buy-and-hold, by roughly 0.6–1.3
pp/yr in the cross-sections. The fixed stop, almost always invested, barely
moves. The cash rate hardly changes the comparison with the static
mix, because the static mix earns the same interest on its own cash. The
cross-sectional "beats static" shares move by at most 10 points (drawdown
control on bootstrap paths: 58% → 68% on drawdown), and no rule gets close to
beating the static mix on both measures in most cases. One extra single-path
result: with cash at 4%, the fitted trailing stop also beats its static mix
out-of-sample on VN30 (8.7% vs 7.4% CAGR, −16.8% vs −19.5% max DD), at 43% time
in market. Full tables are in `results.md`.

---

## 6. Interpretation

**Against buy-and-hold, the rules "work" for a boring reason.** They hold less
equity. Drawdowns shrink and return falls, in about the proportion a static mix
with the same exposure would show.

**Timing adds little on real data.** The static-mix comparison removes the
exposure effect, and what is left is close to noise. Volatility targeting is the
only rule with a consistent edge on drawdown (60–70% of real series). That edge
is small (median +1.2 to +1.6 pp) and costs about 1 pp/yr of return. Measured
as return per unit of drawdown, it loses to the static mix in most cases. The
stop rules sell after a fall, and in this market falls have often been followed
by rebounds. On VN30, exits saw the price higher 20 days later at least as often
(60–70%) as an arbitrary day did (59%).

**Why the synthetic generator says otherwise.** The generator was built to make
volatility regimes *visible* to the model audit. It has a slow volatility cycle
and two long stress windows at 2.2–2.8× normal volatility, with a constant drift
underneath. Volatility in those windows is highly persistent and predictable,
and stepping out of them costs only the drift. Volatility targeting is designed
for exactly that environment. The diagnostics in `results.md` show the
difference:

| | AC(\|r\|, 20) | AC(\|r\|, 60) |
|---|---:|---:|
| VN30, real | +0.095 | +0.010 |
| Synthetic, median | +0.256 | +0.185 |

Real VN30 volatility clusters for days to weeks and is largely gone after three
months. Synthetic volatility is still strongly autocorrelated at 60 days. A
result obtained on the generator therefore says something about the generator.
This is the same caution the project already applies to its own model audit
([limitations §1](../limitations.md)).

**Why the fitted VaR-breach rule is not evidence.** It was chosen from four
candidates on one path. It then succeeded on a later stretch of that same index,
whose particular sequence of sell-offs happened to suit it. The same rule with the same fixed parameters beat its static mix on
drawdown in under half of the individual stocks and about a third of bootstrap
paths. A result that appears on one path and disappears when the path is varied
is a property of that path.

**The fixed 7% stop from cost almost never fires for a long holder.** Once the
price has risen, a stop measured from cost can only trigger if the price falls
all the way back to 7% below the original entry, giving up the whole gain on the
way. Across stocks the median was two exits in eight to ten years. It is a rule for traders who keep re-entering, not
for someone holding a position.

---

## 7. Limitations

- **Price data, not total return.** VN30 and VN-Index are price indices, so
  dividends are missing from buy-and-hold and from every rule while invested.
  Cash dividends in Vietnam are a few percent a year. This understates every
  strategy's absolute return in proportion to its exposure. It roughly cancels
  in the static-mix comparison, which matches exposure, but not exactly, since
  dividends are not paid evenly through time. How the vendor adjusts single-stock
  closes for cash dividends is not documented.
- **Survivorship bias.** The constituents and the basket are *today's* VN30
  members, followed back in time. Companies that were in the index and then
  fell out (often after poor performance) are missing, which flatters buy-and-hold
  and the basket's 19.5% CAGR. Its effect on the rules-versus-static comparison is
  smaller but unknown.
- **Undocumented source.** The endpoint is unofficial, may change without notice,
  and its adjustment method is not published. The committed file and checksum
  make *these* results reproducible. They do not certify the data.
- **One market history.** Tests A and C, and the stocks in B, all go through
  the same 2013–2026 market and are highly correlated with one another. Thirty
  stocks are not thirty independent experiments.
- **The bootstrap weakens volatility persistence.** Blocks averaging 20 days keep
  short-range clustering but break longer-range persistence: AC(|r|, 20) falls
  from 0.095 to 0.030. That works slightly against volatility targeting in test D.
  Test B, which uses real paths, points the same way.
- **Cash rate.** 0% understates what idle money earns, and a flat 4% ignores how
  Vietnamese deposit rates moved over 2013–2026. Both runs are reported; neither
  changes the conclusion.
- **Execution.** Fills at the close, with no slippage or market impact. The floor
  rule only approximates queues at the limit price, and applies only to single
  stocks. The static mix is rebalanced to a constant fraction at no cost, the
  same simplification the rules' constant-exposure stretches get.
- **Parameter choices.** The "textbook" parameters and grids are conventional, not
  optimised. Other rule designs, such as trend filters or longer cool-downs, were
  not tested.
- **Single-stock limits.** HOSE's ±7% limit also caps rebounds, and settlement
  (T+2) restricts selling newly bought shares. Neither is modelled beyond the
  floor rule.

---

## 8. Conclusion

On Vietnamese large caps from 2013 to 2026, exit rules reduced drawdowns
mainly by holding less equity. Once that is controlled for with a static mix of
the same average exposure, none of the five rules improved both return and
drawdown in a majority of stocks or bootstrap paths. Volatility targeting came
closest, trading about a percentage point of annual return for a slightly
shallower drawdown, and it lost on return per unit of drawdown. The most
impressive single result, a fitted VaR-breach rule on the VN30 index, did not
survive cross-sectional or bootstrap testing. The popular fixed 7% stop from
cost is close to inactive for a long-term holder.

The synthetic generator's clear verdict in favour of volatility targeting does
not replicate. It reflects the persistent volatility regimes the generator was
built to contain. For an investor who wants smaller drawdowns, the evidence here
supports holding less equity in the first place, which is simpler, cheaper and
did at least as well.

---

## Appendix: changes from the exploratory version

The study began as exploratory scripts. This clean version replicates them and
differs in these places:

| Item | Exploratory | This version | Effect |
|---|---|---|---|
| EWMA seed | Variance of the first 250 returns, used from day 0, so a small look-ahead in year one | Seeded at day 249; rules inactive and metrics excluded during the warm-up | None on the out-of-sample VN30 figures (identical: 12.3% / −28.2% vs 10.7% / −42.5%) |
| Synthetic vol target | Fixed σ* = 15% | 0.75 × warm-up volatility, the same rule as on real data | Same verdict: 92% of seeds better than static on drawdown (exploratory: about 93%) |
| Whipsaw reference price | Close after execution | Execution close | Range 46–70% here, against 55–75% before; base rate now reported (59% on VN30) |
| Cost against buy-and-hold | "About 1–4%/yr" | 1.7–4.0 pp on VN30 and 2–3.4 pp on bootstrap medians; **6.3 pp** for the trailing stop on single stocks | The trailing stop costs more on individual stocks than first reported |
| Basket | — | VaR-breach and drawdown control beat static on both measures | Reported, with the reasons it is weak evidence (§5.4) |
| Return per unit of drawdown | Not measured | Added | Shows that volatility targeting's drawdown edge on real data is paid for |
