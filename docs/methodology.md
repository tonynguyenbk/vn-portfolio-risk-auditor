# Methodology

How every figure the application reports is produced, in enough detail that a
reader can reproduce it from the formulas rather than trust the code.

Sections map to PRD 9. Where a choice was available, the choice and its reason
are stated: an unstated convention is the most common way a risk number becomes
unreproducible.

---

## 1. Conventions

These hold everywhere, in the engine, the API and the interface.

| Quantity | Convention |
|---|---|
| Returns | Logarithmic |
| Rates and risk figures | Decimals, never percentages, until display |
| Losses, VaR, Expected Shortfall | **Positive** magnitudes |
| Drawdown | **Negative** |
| Annualisation | 252 trading days |
| Empirical quantiles | Linear interpolation between order statistics |
| Unavailable metric | `null`, never `0` |

The sign conventions matter more than they look. A VaR of `0.0235` means "a
2.35% loss", so larger always means more risk; a drawdown of `-0.547` means a
54.7% decline. Mixing the two is the single easiest way to produce a risk report
that is internally inconsistent and looks fine.

---

## 2. Returns

### 2.1 Asset returns

For price `P` of asset `i` on day `t`:

```
r_{i,t} = ln( P_{i,t} / P_{i,t-1} )
```

Log returns are used because they are additive through time, which makes the
wealth curve and the variance recursions well behaved.

The first observation carries no return and is dropped, so a price history of
`N` days yields `N - 1` returns. This one-off difference propagates: a 2,088-day
price history gives 2,087 returns, and a 250-day rolling window then leaves
1,837 backtest days.

### 2.2 Alignment

Assets are aligned on the **intersection** of their trading dates. Any date on
which one selected asset did not trade is dropped for all of them.

Missing observations are **never forward-filled**. Carrying a price forward
invents a day on which the asset did not move, which biases volatility downward
and understates every risk figure derived from it. The data-quality report
states how many observations were removed, and warns when more than 2% of
candidate dates were lost.

### 2.3 Portfolio returns

Under fixed weights `w`:

```
r_{p,t} = Σ_i w_i · r_{i,t}
```

This is an approximation, and the PRD requires it to be named as one: the log
return of a weighted sum is not the weighted sum of log returns. The error is
second-order and negligible at daily horizons, but it is an assumption, not an
identity.

Weights are held fixed throughout. No rebalancing, transaction costs, taxes or
liquidity constraints are modelled.

### 2.4 Wealth curve

```
W_0 = 100,   W_t = W_{t-1} · exp(r_{p,t})
```

Implemented as `100 · exp(cumsum(r))`, the closed form of that recursion, which
avoids accumulating rounding error step by step. A test verifies the closed form
against the step-by-step loop.

---

## 3. Risk metrics

### 3.1 Annualised volatility

```
σ_annual = σ_daily · √252
```

`σ_daily` is the **sample** standard deviation (`n − 1` denominator).

Volatility measures dispersion in both directions. It is not a loss measure, and
a portfolio can have modest volatility and a severe tail.

### 3.2 Maximum drawdown

Running peak and drawdown:

```
M_t = max_{s ≤ t} W_s
D_t = W_t / M_t − 1
MDD = min_t D_t
```

The reported peak is the running maximum **in force at the trough**, not the
global maximum of the series. These differ whenever the worst drawdown does not
begin at the all-time high — for `100 → 120 → 90 → 150 → 200` the worst drawdown
is −25% from the 120 peak, not anything measured from 200. Getting this wrong
produces a plausible-looking number attached to the wrong dates.

### 3.3 Concentration

```
C_max = max_i w_i
HHI   = Σ_i w_i²
w_s   = Σ_{i ∈ s} w_i          (sector weight)
```

HHI ranges from `1/n` for an equally weighted portfolio to `1` for a single
holding. No qualitative label is attached to any of these; concentration is
judged only against user-defined limits.

---

## 4. Value at Risk

Loss is defined as `L_t = −r_{p,t}`, so losses are positive.

For confidence level `α`, VaR is the corresponding loss quantile:

```
P( L > VaR_α ) = 1 − α
```

Three estimators are implemented, each over a rolling window of the most recent
`W` observations (250 by default).

### 4.1 Historical Simulation

```
VaR^HS_α = Q_α( L_{t−W} … L_{t−1} )
```

The empirical quantile, using **linear interpolation between order statistics**
(NumPy's `method="linear"`). The convention is pinned in one constant and stated
in the assumptions block of every response, because the seven interpolation
schemes NumPy offers disagree precisely in the tail where VaR lives.

Makes no distributional assumption, which is its strength. Its limitation is
structural: it cannot produce a loss larger than one the sample already
contains, so it cannot anticipate an unprecedented shock.

### 4.2 Parametric Normal

```
VaR^N_α = −μ + z_α · σ
```

with `μ` and `σ` the sample mean and standard deviation of the window, and `z_α`
the standard Normal quantile.

Its weakness is the Normal assumption. Daily equity returns have fatter tails
than a Normal, so this systematically understates risk at high confidence — a
prediction the backtest results confirm sharply.

### 4.3 EWMA Normal

Variance recursion with decay `λ = 0.94` (the RiskMetrics convention):

```
σ²_t = λ · σ²_{t−1} + (1 − λ) · (r_{t−1} − μ)²
VaR^EWMA_α = −μ + z_α · σ_t
```

**Initialisation**, which the PRD requires to be documented and tested: the
recursion starts from the sample variance of the supplied window, then consumes
every observation in it. The value returned is therefore the one-step-ahead
forecast conditioned on the whole window, not the in-sample variance of its last
element. A test pins this by driving `λ → 1` and checking convergence on the
equally weighted estimate, and a second checks the recursion at the operating
`λ = 0.94` against its closed-form expansion.

Because recent observations carry more weight, this reacts to changing market
conditions far faster than an equally weighted estimator. That property is what
the model audit is designed to detect.

### 4.4 Normal quantiles without SciPy

`z_α` comes from `statistics.NormalDist().inv_cdf(α)` in the standard library.
The test suite verifies it against `scipy.stats.norm.ppf` to ≤ 7 × 10⁻¹⁶.

---

## 5. Expected Shortfall

```
ES_α = mean{ L_t : L_t ≥ VaR_α }
```

The average loss on days the threshold is breached. Where VaR marks the edge of
the tail, ES describes what is inside it — two portfolios can share a VaR and
differ greatly in ES.

`ES ≥ VaR` always holds under the positive-loss convention, by construction.

The empty-tail case is unreachable when the threshold comes from the same
empirical quantile, because a quantile below 100% never exceeds the sample
maximum. It becomes reachable when an external threshold is supplied — a
Normal-based VaR can sit above every loss in the sample — and in that case the
threshold itself is returned, which is the tightest statement the sample
supports and preserves `ES ≥ VaR`.

Optional closed form under a Normal assumption:

```
ES^N_α = −μ + σ · φ(z_α) / (1 − α)
```

---

## 6. Risk contribution

Portfolio volatility from the asset covariance matrix `Σ`:

```
σ_p = √( wᵀ Σ w )
```

Euler decomposition:

```
MRC_i = (Σw)_i / σ_p        marginal contribution
RC_i  = w_i · MRC_i         component contribution
RC%_i = RC_i / σ_p          share of total
```

Because `σ_p` is homogeneous of degree one in the weights, Euler's theorem gives
`Σ_i RC_i = σ_p` **exactly**. The tests assert that identity numerically, and
separately verify each `MRC_i` against a central-difference derivative.

This answers "where does the risk come from", which is a different question from
"where is the money". A small holding can dominate risk if it is volatile and
moves with everything else; a large one can contribute little if it diversifies.

---

## 7. Model validation

The distinction between **calculating** a risk figure and **validating** it is
the central methodological claim of this project.

### 7.1 Walk-forward procedure

At each test date `t`, with window `W`:

1. take observations `[t − W, t)` — strictly before `t`;
2. estimate the model on that slice alone;
3. forecast the next day's loss threshold;
4. observe the realised loss `L_t = −r_{p,t}`;
5. record an exception when `L_t > VaR_{α,t}`.

The comparison is a **strict** inequality: a loss exactly equal to its threshold
is not an exception.

Slicing is written explicitly rather than vectorised through a rolling helper. A
helper that quietly included the current observation would inflate every model's
apparent accuracy while leaving the output entirely plausible — a failure
invisible in the numbers and obvious in the code. The code is therefore kept
obvious at the cost of speed.

The guarantee is tested adversarially rather than structurally: a future
observation is replaced with a −50% day and every forecast is required to be
bit-for-bit unchanged, and a mid-series shock is required to leave earlier
forecasts untouched while moving later ones.

### 7.2 Kupiec unconditional coverage

Null hypothesis, for confidence level `α`:

```
H₀ : p = 1 − α
```

where `p` is the true exception probability. With `T` test days, `x` exceptions
and `p̂ = x/T`:

```
LR_uc = −2 · ln[ (1−p)^(T−x) · p^x  /  (1−p̂)^(T−x) · p̂^x ]
```

Asymptotically `LR_uc ~ χ²(1)` under `H₀`.

**Computed in log space.** The raw ratio underflows: at `T = 1838` and
`p = 0.05` the numerator alone is around `10⁻³⁰⁰`. Expanding to a difference of
log-likelihoods keeps every intermediate value representable.

**Boundary cases** take the limits directly rather than evaluating `0 · log(0)`,
which is `nan` in IEEE arithmetic and would silently poison the p-value:

```
x = 0  →  LR = −2 · T · ln(1 − p)
x = T  →  LR = −2 · T · ln(p)
```

Both arise in practice — a 99% model on a short sample often produces no
exceptions at all.

**p-value without SciPy.** For one degree of freedom the survival function has a
closed form:

```
P(X > x) = erfc( √(x/2) )
```

Verified against `scipy.stats.chi2.sf` to a worst relative error of
5 × 10⁻¹⁴, and the statistic itself cross-checked against an independently
constructed binomial log-likelihood difference (`scipy.stats.binom.logpmf`),
which is exact because the binomial coefficient cancels in the ratio.

### 7.3 What the test does not say

Failing to reject `H₀` is **not** evidence that a model is correct. It means only
that the observed exception count is not statistically inconsistent with the
target frequency under this test.

The test is also deliberately blind to *when* exceptions happened. Ten breaches
spread evenly across five years and ten breaches in a single fortnight produce an
identical statistic, though the second portfolio is in far more trouble.
Detecting that requires an independence or conditional-coverage test, which the
PRD places in a later phase.

### 7.4 Model selection

No model is selected on a single criterion, and never on reporting the smallest
VaR. The report ranks only among models the Kupiec test did not reject, on
**relative** distance from target:

```
| p̂ − (1−α) | / (1−α)
```

Relative, not absolute, because rows at 95% and 99% are compared against each
other and their targets differ five-fold. A 0.5 percentage-point miss is 10%
miscalibration at 95% and 50% at 99%; ranking on the raw difference would
systematically flatter the higher confidence level.

When two models are within a few percent of each other, the reported answer is
"no single model dominates all evaluation criteria", which is an acceptable and
honest conclusion.

---

## 8. Stress testing

Scenario analysis, **not** probability forecasting. It answers a conditional
question and attaches no likelihood to the scenario.

### 8.1 Custom shocks

For shock vector `s`:

```
ΔV_p = wᵀ s
```

Assets not named by the scenario are treated as unshocked. A shock naming an
asset the portfolio does not hold raises an error rather than being discarded,
because that is far more likely a typo or a mismatched file than an intention.

### 8.2 Historical replay

Shocks are derived from what the assets actually did over a user-selected
interval:

```
s_i = P_{i,end} / P_{i,start} − 1
```

**Simple returns, not log returns** — the only place in the codebase that leaves
log space. The figure is applied multiplicatively to weights, so a halving must
read as `−0.50`, not `ln(0.5) = −0.69`.

A replayed episode carries whatever co-movement the assets genuinely had,
including correlation behaviour a hand-built shock vector would have to guess at.

### 8.3 Limitations of the method

The calculation is linear in the shocks. It assumes weights stay fixed through
the event, ignores liquidity and transaction costs, and captures no second-round
effects such as correlations rising as a crisis unfolds. Real stress episodes
tend to produce losses larger than a weighted sum implies.

---

## 9. Reproducibility

- The demonstration dataset is generated from **seed 42** and its SHA-256 is
  recorded in `frontend/public/demo/manifest.json`. Regeneration is verified
  byte-identical rather than assumed.
- The analysis the dashboard displays is precomputed by the same engine the API
  runs, and must be regenerated whenever either the engine or the dataset
  changes.
- Dependencies are locked (`uv.lock`, `package-lock.json`).
- Line endings are normalised to LF, without which a Windows checkout would
  alter the CSVs and break the checksum verification for a reason unrelated to
  the data.

---

## 10. What none of this establishes

Every figure is backward-looking. A model that reproduced past losses well can
still fail when market behaviour changes, and the tests here measure calibration
on one synthetic series — they say nothing about Vietnamese markets, and nothing
about the future.

See [limitations.md](limitations.md) for the full account.
