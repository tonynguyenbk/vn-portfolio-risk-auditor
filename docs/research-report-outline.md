# Research report — outline and writing guide

Structure follows PRD 19. Target length 8–12 pages.

This is a scaffold, not a draft. The numbers below are the ones the current
implementation produces; the argument connecting them is yours to write, and
writing it is most of the intellectual work. Where a section needs a judgement
rather than a figure, that is flagged.

**Working title:** *VN Portfolio Risk Auditor: A Prototype Risk Monitoring,
Model-Validation, and Stress-Testing Platform for Vietnam's Equity Market*

---

## Abstract (~200 words, write last)

One sentence each: the problem, the data, the models, the validation method, the
prototype, the main finding, the principal limitation.

The finding worth leading with is the one the results actually support: *at
95% the estimators are hard to tell apart, but at 99% every one of them is
rejected — the tail of real Vietnamese large-cap returns is heavier than any of
the three models assumes, and the Normal model fails worst there.*

Claim only what five large caps over 2015–2026 can support. The data is real
(adjusted closes from Vietcap) but it is one small, survivor-selected portfolio,
and the abstract must say so.

---

## 1. Introduction (~1 page)

- Quantitative finance context: risk measurement as a discipline distinct from
  return forecasting.
- Portfolio market risk and why a single number is insufficient.
- **The central gap**: models are routinely calculated and rarely validated. Any
  model can produce a VaR figure; whether that figure was breached about as often
  as it promised is a separate, testable question that is frequently skipped.
- Emerging-market motivation: thinner liquidity, higher volatility, shorter
  usable history — conditions under which model choice matters more.
- Research aim and the five research questions (PRD 6.2).

State early what the data is and is not: real daily adjusted closes for five
HOSE large caps and the VN-Index, 2015–2026, from an undocumented public
endpoint. The regimes in it — the 2018 correction, the March 2020 crash, the
2022 bond-market and property stress, the April 2025 tariff shock — are
historical, not designed in, so the estimator comparison is a test against
market behaviour rather than against a generator's assumptions.

---

## 2. Literature and theoretical framework (~2 pages)

### 2.1 Modern Portfolio Theory
Markowitz (1952). Portfolio return, variance, covariance, correlation,
diversification. Ground the risk-contribution decomposition here.

### 2.2 Downside risk
VaR as a loss quantile. Expected Shortfall as the conditional tail mean.
Rockafellar & Uryasev on CVaR. Why volatility alone is insufficient: it is
symmetric and says nothing about tail shape.

Worth making explicit: VaR is not coherent (it fails subadditivity), ES is.

### 2.3 VaR estimation
Historical Simulation, Parametric Normal, EWMA (RiskMetrics), Monte Carlo as an
extension. For each: the assumption it makes and the failure mode that follows
from it.

### 2.4 Model validation
Walk-forward backtesting. Exception rate. Kupiec (1995) unconditional coverage.
Christoffersen on independence and conditional coverage — cite as the gap this
implementation does not close. Basel market-risk backtesting requirements as the
regulatory analogue.

### 2.5 Stress testing
Historical versus hypothetical scenarios. Why linear scenario analysis
understates real episodes. Risk limits as internal governance.

---

## 3. Methodology (~2 pages)

Condense [methodology.md](methodology.md). Every formula, every convention.

Give these their own paragraphs — they are the parts a marker can check:

- **Sign and quantile conventions.** Losses positive, drawdown negative, linear
  interpolation between order statistics, stated rather than inherited.
- **EWMA initialisation.** Sample variance of the window, then consume the whole
  window; the returned value is a one-step-ahead forecast.
- **The walk-forward rule.** Observations `[t−W, t)` and nothing else. Explain
  why this is the methodological core, and how it was tested adversarially rather
  than by inspection.
- **Kupiec in log space**, with the `x=0` and `x=T` limits taken directly.
- **Independent verification.** Standard-library implementations cross-checked
  against SciPy — argue why two agreeing implementations is stronger evidence
  than one asserted.

### Data

Real daily closes, adjusted for dividends and splits by the provider (Vietcap),
for FPT, VCB, HPG, MWG and VNM plus the VN-Index as benchmark: 2,951 trading days
from 2015-01-05 to 2026-10-29, with identical trading calendars so alignment
drops nothing. Retrieved once, frozen and checksummed; provenance is recorded in
[`data/DATA_DICTIONARY.md`](../data/DATA_DICTIONARY.md).

Be explicit about selection: these are five of the largest, most liquid survivors
on the exchange, chosen in 2026. Results describe this portfolio, not the
Vietnamese market.

---

## 4. System design (~1 page)

User problem, inputs, outputs, architecture, calculation pipeline.

The two design decisions worth a paragraph each are in
[architecture.md](architecture.md): precomputing the demonstration so the site
does not depend on a sleeping backend, and writing the API contract before the
engine existed.

Include the architecture diagram.

---

## 5. Results (~2 pages)

### 5.1 Descriptive statistics

| Quantity | Value |
|---|---|
| Analysis period | 2015-01-05 → 2026-10-29 |
| Aligned observations | 2,951 |
| Assets | 5 + benchmark |
| Annualised volatility | 20.77% |
| Maximum drawdown | −35.20% (2022-04-06 → 2022-11-15) |

### 5.2 Risk metrics at the full-sample level

| Metric | Value |
|---|---|
| One-day VaR 95% (Historical) | 1.92% |
| One-day VaR 95% (Parametric Normal) | 2.09% |
| One-day VaR 95% (EWMA Normal) | 1.15% |
| Expected Shortfall 95% | 3.18% |
| Largest risk contributor | VCB (24.9% of portfolio volatility, on a 25% weight) |
| HHI | 0.2100 |

Note that ES exceeds VaR by roughly 66% — the tail is materially worse than the
threshold alone suggests, which is the empirical answer to RQ5.

The EWMA figure is low because it reflects the calm of the final weeks of the
sample, not because the portfolio is safer than the other two models imply.

### 5.3 Model comparison and backtest — the core result

Walk-forward, 250-day window, 2,700 test days:

| Model | Conf. | Exceptions | Expected | Rate | Kupiec LR | p | Result |
|---|---:|---:|---:|---:|---:|---:|---|
| Historical Simulation | 95% | 147 | 135.0 | 5.44% | 1.09 | 0.2959 | pass |
| Historical Simulation | 99% | 43 | 27.0 | 1.59% | 8.12 | 0.0044 | fail |
| Parametric Normal | 95% | 134 | 135.0 | 4.96% | 0.01 | 0.9296 | pass |
| Parametric Normal | 99% | 64 | 27.0 | 2.37% | 36.98 | <0.0001 | fail |
| EWMA Normal | 95% | 158 | 135.0 | 5.85% | 3.92 | 0.0477 | fail |
| EWMA Normal | 99% | 59 | 27.0 | 2.19% | 28.63 | <0.0001 | fail |

Three findings to develop:

1. **No estimator survives at 99%.** Every model under-forecasts the extreme
   tail of this portfolio, by a factor of 1.6 (Historical) to 2.4 (Parametric
   Normal) in exception count. The 99% question has no satisfactory answer among
   these three models, which is itself the result.
2. **Parametric Normal is near-perfect at 95% and worst at 99%.** 134 exceptions
   against 135 expected, then 64 against 27. This is the signature of a
   thin-tailed assumption: adequate through the body of the distribution, badly
   wrong in the extreme tail. A model can be "validated" at one confidence level
   and be unusable at another.
3. **EWMA is narrowly rejected at 95% (p = 0.048).** With λ = 0.94 the estimate
   tracks the last few weeks closely, so it is lowest in calm spells and is then
   caught out when volatility returns abruptly — as it did in March 2020 and
   April 2025. Adaptivity cuts both ways, and a p-value this close to 0.05
   deserves to be reported as borderline rather than as a clean failure.

### 5.4 Stress testing

| Scenario | Period | Impact |
|---|---|---:|
| Worst trading week | 2025-04-01 → 2025-04-09 | −17.36% |
| Worst month | 2020-03-02 → 2020-03-30 | −27.09% |
| Worst quarter | 2019-12-27 → 2020-03-30 | −32.14% |

Worth a sentence: the worst *week* and the worst *month* come from different
episodes — the April 2025 US tariff announcement and the March 2020 COVID crash.
Horizon choice changes which crisis the stress test describes, which is itself a
finding about how stress tests are specified.

Compare the −17.36% week against the 1.92% one-day 95% VaR and discuss what that
gap means about extrapolating daily risk measures.

### 5.5 Risk contribution

Table of weight versus contribution. The point to draw out is any divergence
between the two — risk share is not weight share.

---

## 6. Discussion (~1.5 pages)

- **Why the models differ.** Connect each result to the assumption that produced
  it. Historical Simulation cannot exceed its sample. Parametric Normal has thin
  tails. EWMA weights recent observations and adapts.
- **Ordinary versus high-volatility periods.** RQ3. The regime comparison is not
  implemented, so treat this as a hypothesis the results are *consistent* with,
  and say clearly that it was not directly tested. Do not overclaim.
- **What validation adds.** Had the study stopped at calculation, the
  full-sample figures would have suggested Historical and Parametric Normal are
  interchangeable (1.92% against 2.09% at 95%). Only the backtest shows that they
  diverge sharply at 99%.
- **Practical use.** How a risk analyst would read this output, and what decision
  it would inform.
- **What the prototype cannot do.** Route to [limitations.md](limitations.md).

---

## 7. Limitations (~0.75 page)

Condense [limitations.md](limitations.md). Do not soften it. The credibility of
sections 5 and 6 depends on this section being unflinching.

Prioritise: five survivor large caps, prices only; fixed weights; correlations
treated as stable; ~27 expected tail observations at 99%; the Kupiec test's blindness to clustering; linear
single-period stress testing; no production validation.

---

## 8. Conclusion (~0.5 page)

- Answer each research question explicitly, in order, in one or two sentences.
- **RQ2 has a partial answer** — at 95% Historical and Parametric Normal are
  not rejected, at 99% nothing is; **RQ3 does not** — say so rather than
  implying one.
- State what was learned, including what failed during development.
- Propose extensions: Monte Carlo with Student-t, conditional-coverage testing,
  regime comparison, a broader survivorship-free universe, liquidity-adjusted
  stress testing.

---

## References

Full details in the PRD section 26. At minimum:

1. Markowitz, H. (1952). "Portfolio Selection." *The Journal of Finance*, 7(1), 77–91.
2. Kupiec, P. H. (1995). "Techniques for Verifying the Accuracy of Risk Measurement Models."
3. Rockafellar, R. T., & Uryasev, S. "Optimization of Conditional Value-at-Risk."
4. Basel Committee, market-risk backtesting requirements (MAR32).
5. Christoffersen, P. (1998). "Evaluating Interval Forecasts." — for the independence gap.
6. J.P. Morgan/Reuters, *RiskMetrics Technical Document* — for λ = 0.94.

---

## Writing notes

**Precision over enthusiasm.** "Parametric Normal was not rejected at 95%" is
stronger and more accurate than "Parametric Normal was the best model".

**Never write that a Kupiec pass proves a model correct.** It means the exception
count is not statistically inconsistent with the target rate. This distinction is
the single most important thing the report demonstrates you understand.

**Attribute every number.** Each figure should be traceable to a formula in
section 3 and reproducible from the repository.

**Own the failures.** The reflection required by PRD 24 asks what went wrong. The
honest answers from this build are worth writing down: a false-safety bug where an
unperformed limit check reported "within limit"; a metric returning `0` where the
project's own rules demanded `null`; a test asserting the opposite of its own
name; a line-ending policy that would have broken dataset reproducibility on a
fresh clone. Each was found by review rather than by the test suite, and that is
itself the finding — a test suite written by the same person who wrote the code
shares its blind spots.
