# Limitations

What this prototype cannot tell you, and why.

A risk tool that lists its own limitations honestly is more useful than one that
does not, because every number it produces is conditional on assumptions the
reader has to be able to see. This document is written to be read *before* the
results, not after.

---

## 1. The data: five survivors, prices only, from an unofficial endpoint

The bundled dataset is real: daily adjusted closes for FPT, VCB, HPG, MWG and
VNM and the VN-Index, 2015-01-05 to 2026-10-29, retrieved from Vietcap. Its
provenance is recorded in [`data/DATA_DICTIONARY.md`](../data/DATA_DICTIONARY.md).
Real data brings its own limits, and they bound what any result can claim.

**Survivorship and selection.** The five stocks were chosen in 2026 as large,
liquid, well-known HOSE names. Every one of them survived the whole period and
grew into a market leader; none of the companies that were delisted, collapsed
or shrank over the same years is represented. A portfolio picked with hindsight
looks better — higher return, and plausibly lower tail risk — than one an
investor could have picked in 2015. The results describe *this* portfolio, not
the Vietnamese market and not VN30 constituents in general.

**Five stocks is a small, concentrated sample.** Statements such as "Parametric
Normal was well calibrated at 95%" describe how these estimators behaved on one
portfolio over one stretch of history. A different selection, weighting or
period could reverse them.

**Price data only.** Closes and daily volume, nothing else. There are no
bid-ask spreads, no order-book depth, no intraday prices, no transaction-level
data and no free-float or foreign-ownership-limit information. Liquidity risk —
including the limit-down days on which HOSE stocks often cannot be sold at all —
is therefore invisible to every figure here.

**Daily price limits truncate observed returns.** HOSE caps a stock's daily move
at ±7%. A crash that would have been −15% in one day appears as several
consecutive −7% days instead. That spreads a single loss over multiple
observations and makes one-day VaR and ES look less extreme than the economic
loss actually was.

**The source is an undocumented endpoint.** It has no published terms, no
versioning and no service guarantee. It can change shape, re-base its
adjustments, revise history or disappear without notice. The committed CSVs are
frozen and checksummed precisely so that results remain reproducible when that
happens — but a re-fetch today may not reproduce them, and the adjustment
method is the provider's, not one this project can inspect.

## 2. Fixed weights

Weights are held constant across the entire analysis period. No rebalancing is
modelled, and neither are transaction costs, taxes, bid-ask spreads, or the
market impact of trading.

A real portfolio drifts as prices move. A portfolio that started 25/25/20/15/15
does not stay there for nearly twelve years. Fixed weights make the analysis tractable
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

At 99% confidence over 2,700 test days, 27 exceptions are expected. Any
statistic computed from a few dozen events carries wide uncertainty, and the
Kupiec test's asymptotic χ² approximation is at its weakest there.

Treat the 99% column as indicative. The 95% results, with 135 expected
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

## 10. Corporate-action adjustment is the provider's

Real price series need adjustment for dividends, splits, bonus shares and
rights issues; an unadjusted series shows an artificial drop on the ex-date
that a model will read as a loss. Vietnamese stocks pay frequent stock
dividends, so this matters more here than in many markets.

The demonstration closes arrive already adjusted by Vietcap, and are used as
supplied. The provider does not document its method — in particular whether
rights issues are adjusted and how cash dividends are back-propagated — so the
project cannot verify it. The retrieval script does check for symptoms: any
daily move beyond the ±7% HOSE limit would indicate a missed adjustment, and
none was found. That is evidence against gross errors, not proof of a correct
adjustment.

Adjusted closes are stored in the `close` column, so the engine reports `close`
as its price basis. User uploads can instead supply an `adjusted_close` column,
which the engine prefers and reports.

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
