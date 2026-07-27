# Limitations

What this prototype cannot tell you, and why.

A risk tool that lists its own limitations honestly is more useful than one that
does not, because every number it produces is conditional on assumptions the
reader has to be able to see. This document is written to be read *before* the
results, not after.

---

## 1. The data is simulated

Every figure currently displayed comes from a deterministic generated series,
not from observed Vietnamese market data. The tickers are invented.

This means the results demonstrate the **method**, not the market. Statements
like "EWMA was the best-calibrated model" describe how these estimators behaved
on this synthetic series and carry no implication about VN30 constituents, the
VN-Index, or any real portfolio.

The generator deliberately embeds two volatility regimes so the model audit has
something to distinguish. That makes the demonstration informative and also
makes it *easier* than reality: the regime shifts are cleaner than real ones, and
the return distribution is a mixture of Normals rather than whatever equity
returns actually are.

When real data is introduced, its source, retrieval date, licence, adjustment
method and cleaning decisions must be recorded in
[`data/DATA_DICTIONARY.md`](../data/DATA_DICTIONARY.md) before any result is
reported.

## 2. Fixed weights

Weights are held constant across the entire analysis period. No rebalancing is
modelled, and neither are transaction costs, taxes, bid-ask spreads, or the
market impact of trading.

A real portfolio drifts as prices move. A portfolio that started 25/25/20/15/15
does not stay there for eight years. Fixed weights make the analysis tractable
and reproducible, and they make it a description of a *hypothetical* portfolio
rather than any portfolio someone actually held.

## 3. The portfolio return is an approximation

`r_p = Σ wᵢ rᵢ` treats the portfolio log return as the weighted sum of asset log
returns. That is not an identity — the log of a weighted sum is not the weighted
sum of logs. The error is second-order and negligible at daily horizons, and it
is still an assumption.

## 4. Correlations are treated as stable

The correlation matrix and the covariance used for risk contribution are
estimated over the whole period and reported as single numbers.

They are not stable. Correlations typically **rise during market stress**, which
means diversification tends to fail exactly when it is most needed. A risk
decomposition computed in calm conditions understates how concentrated the
portfolio becomes in a crisis.

## 5. The 99% results rest on very few observations

At 99% confidence over 1,837 test days, roughly 18 exceptions are expected. Any
statistic computed from around eighteen events carries wide uncertainty, and the
Kupiec test's asymptotic χ² approximation is at its weakest there.

Treat the 99% column as indicative. The 95% results, with roughly 92 expected
exceptions, are on firmer ground.

## 6. What the Kupiec test does not test

Three separate limits:

**It is not proof of correctness.** Failing to reject the null means the observed
exception count is not statistically inconsistent with the target rate. It does
not mean the model is right, and with a modest sample the test has limited power
to detect a model that is moderately wrong.

**It is blind to clustering.** The test counts exceptions and ignores their
timing entirely. Ten breaches spread evenly across five years and ten breaches in
a single fortnight produce an identical statistic — but a portfolio breaching its
threshold on ten consecutive days is in a completely different situation.
Detecting that requires an independence or conditional-coverage test, which is
not implemented.

**It says nothing about severity.** A model can produce exactly the right number
of exceptions while those exceptions are catastrophically large. Expected
Shortfall partially addresses this; the test does not.

## 7. Model comparison uses one criterion

The "best-calibrated tested model" line ranks only on relative distance from the
target exception rate, among models the Kupiec test did not reject.

It does not weigh exception severity, stability across volatility regimes, or
computational cost — all of which the PRD names as criteria. The regime
comparison in particular is unimplemented, so a model that is well calibrated on
average while failing badly in turbulent periods would not be distinguished here.

## 8. Stress testing is linear and single-period

The scenario calculation is `wᵀs`. It therefore assumes:

- weights stay fixed through the event;
- shocks are simultaneous, with no path dependence;
- no liquidity constraints — every position can be held or sold at the modelled
  price;
- no second-round effects, no contagion, no correlation shift mid-crisis.

Real stress episodes tend to be **worse** than a weighted sum implies, for
exactly these reasons.

The historical episodes are also, by construction, the worst stretches *in the
sample*. That is a description of the past. It sets no bound on the future, and
the next crisis has no obligation to resemble the last one.

## 9. One-day horizon only

Every VaR and ES figure is a one-day forecast. Multi-day risk is not modelled,
and the common `√h` scaling rule is not applied — it assumes independent returns,
which volatility clustering violates.

## 10. No adjustment for corporate actions

The demonstration data uses closing prices. Real price series need adjustment for
dividends, splits and rights issues; an unadjusted series shows an artificial
drop on the ex-dividend date that a model will read as a loss.

The schema supports an `adjusted_close` column and the engine will prefer it and
report that it did. Until real data arrives with one, results carry this
limitation.

## 11. Not validated for any real use

This is a student prototype built for a university application portfolio. It has
not been validated against a production risk system, has not been reviewed by a
practitioner, and has no audit trail, access control, model-governance process or
change-control discipline of the kind a real risk function requires.

It should not be used to make investment decisions, and nothing in it is
suitable for regulatory reporting.

---

## What would be needed for a production system

Listing this honestly is part of the point of the exercise:

- Real, adjusted, licensed market data with a documented vendor and reconciliation process.
- Independence and conditional-coverage tests alongside unconditional coverage.
- Multi-horizon risk with a defensible scaling approach.
- Liquidity-adjusted stress testing with position-level constraints.
- Model governance: versioning, approval, periodic revalidation, challenger models.
- Audit trail of every analysis run and every parameter change.
- Authentication, authorisation and data segregation.
- Independent validation by someone who did not build it.

The gap between this prototype and that list is the honest answer to "is this
production-ready", and it is large.
