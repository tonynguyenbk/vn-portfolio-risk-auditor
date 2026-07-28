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

The finding worth leading with is the one the results actually support: *the
three estimators disagree, and the disagreement is systematic rather than
random — the adaptive estimator survives validation at both confidence levels
while the static ones do not, and the Normal model fails specifically in the
tail.*

Do not claim anything about Vietnamese markets. The data is simulated and the
abstract must say so.

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

State early that the data is simulated and explain why that is acceptable for
the question being asked: the study evaluates *estimator behaviour under known
conditions*, and a generated series lets the regime structure be known rather
than inferred.

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

Generated, seed 42, five fictional tickers plus a benchmark, 2,088 trading days
spanning 2018-01-01 to 2025-12-31. Market-factor model with asset-specific betas
and idiosyncratic noise, plus two deliberate high-volatility windows.

Be explicit that the regime structure is *designed in*, and say why: it makes the
comparison between adaptive and static estimators observable rather than a matter
of luck.

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
| Analysis period | 2018-01-01 → 2025-12-31 |
| Aligned observations | 2,088 |
| Assets | 5 + benchmark |
| Annualised volatility | 24.63% |
| Maximum drawdown | −54.68% |

### 5.2 Risk metrics at the full-sample level

| Metric | Value |
|---|---|
| One-day VaR 95% (Historical) | 2.35% |
| Expected Shortfall 95% | 3.63% |
| Largest risk contributor | ASSET_B (29.7% of portfolio volatility, on a 25% weight) |
| HHI | 0.2100 |

Note that ES exceeds VaR by roughly 55% — the tail is materially worse than the
threshold alone suggests, which is the empirical answer to RQ5.

### 5.3 Model comparison and backtest — the core result

Walk-forward, 250-day window, 1,837 test days:

| Model | Conf. | Exceptions | Expected | Rate | Kupiec LR | p | Result |
|---|---:|---:|---:|---:|---:|---:|---|
| Historical Simulation | 95% | 116 | 91.9 | 6.31% | 6.19 | 0.0128 | fail |
| Historical Simulation | 99% | 34 | 18.4 | 1.85% | 10.74 | 0.0010 | fail |
| Parametric Normal | 95% | 109 | 91.9 | 5.93% | 3.19 | 0.0741 | pass |
| Parametric Normal | 99% | 39 | 18.4 | 2.12% | 17.70 | <0.0001 | fail |
| EWMA Normal | 95% | 105 | 91.9 | 5.72% | 1.90 | 0.1683 | pass |
| EWMA Normal | 99% | 23 | 18.4 | 1.25% | 1.09 | 0.2961 | pass |

Two findings to develop:

1. **EWMA is the only estimator not rejected at either level.** Every model
   under-forecasts risk on this data, but the adaptive one under-forecasts least.
2. **Parametric Normal passes at 95% and fails decisively at 99%.** This is the
   signature of a thin-tailed assumption: adequate through the body of the
   distribution, badly wrong in the extreme tail. A model can be "validated" at
   one confidence level and be unusable at another.

### 5.4 Stress testing

| Scenario | Period | Impact |
|---|---|---:|
| Worst trading week | 2019-10-07 → 2019-10-14 | −22.99% |
| Worst month | 2019-09-17 → 2019-10-15 | −15.23% |
| Worst quarter | 2022-11-15 → 2023-02-07 | −24.28% |

Worth a sentence: the worst *week* is more severe than the worst *month*,
because the month window contains a partial recovery. Horizon choice changes the
answer, which is itself a finding about how stress tests are specified.

Compare the −22.99% week against the 2.35% one-day 95% VaR and discuss what that
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
- **What validation adds.** Had the study stopped at calculation, all three
  models would have looked equally usable — they produce VaR figures within
  0.2 percentage points of each other. Only the backtest separates them.
- **Practical use.** How a risk analyst would read this output, and what decision
  it would inform.
- **What the prototype cannot do.** Route to [limitations.md](limitations.md).

---

## 7. Limitations (~0.75 page)

Condense [limitations.md](limitations.md). Do not soften it. The credibility of
sections 5 and 6 depends on this section being unflinching.

Prioritise: simulated data; fixed weights; correlations treated as stable; ~18
tail observations at 99%; the Kupiec test's blindness to clustering; linear
single-period stress testing; no production validation.

---

## 8. Conclusion (~0.5 page)

- Answer each research question explicitly, in order, in one or two sentences.
- **RQ2 has a clear answer** (EWMA); **RQ3 does not** — say so rather than
  implying one.
- State what was learned, including what failed during development.
- Propose extensions: Monte Carlo with Student-t, conditional-coverage testing,
  regime comparison, real data, liquidity-adjusted stress testing.

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

**Precision over enthusiasm.** "The EWMA model was not rejected at either
confidence level" is stronger and more accurate than "EWMA was the best model".

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
