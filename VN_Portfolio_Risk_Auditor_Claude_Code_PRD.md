# VN Portfolio Risk Auditor

## Product Requirements Document and Claude Code Implementation Specification

**Document purpose:** This file is the single source of truth for implementing the project in Claude Code inside VS Code.

**Working title:** VN Portfolio Risk Auditor  
**Research title:** *VN Portfolio Risk Auditor: A Prototype Risk Monitoring, Model-Validation, and Stress-Testing Platform for Vietnam's EquitVy Market*  
**Vietnamese title:** *VN Portfolio Risk Auditor: Nền tảng nguyên mẫu giám sát, kiểm định mô hình và kiểm tra sức chịu đựng rủi ro cho danh mục cổ phiếu Việt Nam*  
**Version:** 1.0  
**Product language:** English-first interface; Vietnamese translation may be added later  
**Target:** A polished university-application portfolio project by a Vietnamese high-school student interested in quantitative finance

---

# 0. Instructions for Claude Code

Read this entire document before writing code.

1. Treat this specification as the source of truth.
2. Do not add brokerage connectivity, live trading, order placement, stock recommendations, or portfolio gamification.
3. This is an educational and research prototype using historical or clearly labeled simulated data.
4. Implement the project in phases. Do not attempt every feature in one uncontrolled pass.
5. Start by inspecting the repository. If it is empty, scaffold the monorepo described in this document.
6. Before each phase:
   - state the files that will be created or modified;
   - state the acceptance criteria;
   - implement the smallest complete vertical slice;
   - run relevant tests, linting, and builds.
7. Do not display fabricated analytical results as if they came from real Vietnamese market data.
8. Until a real cleaned dataset is supplied, use deterministic simulated demonstration data and show the label:

   > Educational prototype • Simulated data

9. All risk results must show their assumptions, date range, confidence level, rolling window, model, and unit.
10. Preserve temporal ordering during model validation. Never allow future data to enter a historical forecast.

## Recommended first Claude Code command

After placing this file in the project root, use:

```text
Read VN_Portfolio_Risk_Auditor_Claude_Code_PRD.md completely.
Inspect the current repository and propose a phased implementation plan.
Then implement Phase 1 only: the responsive Institutional Midnight dashboard
using deterministic mock data. Do not implement the numerical backend until the
dashboard has passed linting, tests, and a production build.
```

---

# 1. Executive summary

VN Portfolio Risk Auditor is a web-based prototype that accepts:

- historical price data for a small Vietnamese equity portfolio;
- portfolio weights and sector labels;
- risk-model parameters;
- user-defined risk limits;
- historical or hypothetical stress scenarios.

It produces:

- a portfolio health dashboard;
- volatility, drawdown, Value at Risk, and Expected Shortfall estimates;
- concentration, correlation, and risk-contribution analysis;
- walk-forward backtesting results for multiple VaR models;
- a Kupiec proportion-of-failures test;
- historical and hypothetical stress-test results;
- a downloadable portfolio risk-audit report.

The system does **not** predict whether a stock will rise or fall. It answers:

> How much downside risk does this portfolio contain, where does the risk come from, how would it respond to adverse scenarios, and can the selected risk model be trusted on the tested data?

---

# 2. Problem statement

Different market-risk models can produce materially different risk estimates for the same portfolio. A risk estimate is not useful merely because it can be calculated; it should also be checked against later observations.

The project addresses four practical questions:

1. **Risk magnitude:** How large could a portfolio loss be under ordinary model assumptions?
2. **Risk source:** Which assets or sectors contribute most to total portfolio risk?
3. **Model reliability:** Does the model produce approximately the expected number of VaR exceptions?
4. **Scenario resilience:** How might the portfolio respond to a specified adverse historical or hypothetical scenario?

The prototype mirrors part of the workflow of a quantitative risk analyst in a fund-management or financial-risk team. It is not a production system for an actual fund.

---

# 3. Intended users

## 3.1 Primary user

A simulated institutional portfolio-risk analyst who needs to:

- inspect a portfolio;
- quantify downside risk;
- identify concentration;
- compare risk models;
- validate a model through backtesting;
- run stress scenarios;
- export a concise report.

## 3.2 Secondary users

- finance and economics students;
- teachers demonstrating portfolio risk;
- university admissions reviewers evaluating the applicant's work;
- researchers exploring risk measurement in an emerging-market context.

## 3.3 User roles represented by the product

| Role | Responsibility |
|---|---|
| Portfolio manager | Constructs or supplies the portfolio |
| Risk analyst | Measures and challenges the portfolio's risk |
| Model validator | Checks whether risk forecasts behave as expected |
| Decision-maker | Reviews the resulting risk report |

The application primarily supports the **risk analyst** and **model validator**, not the portfolio manager's stock-selection process.

---

# 4. Scope

## 4.1 MVP scope

- One responsive web application.
- One portfolio at a time.
- Five to ten Vietnamese equities plus a VN-Index benchmark.
- Daily historical observations.
- Long-form CSV upload and bundled demo dataset.
- Fixed user-supplied portfolio weights.
- One-day forecast horizon.
- Rolling window of 250 trading observations by default.
- Confidence levels of 95% and 99%.
- Three core VaR models:
  1. Historical Simulation;
  2. Parametric Normal VaR;
  3. EWMA Normal VaR.
- Historical Expected Shortfall.
- Portfolio volatility and maximum drawdown.
- Correlation and concentration analysis.
- Volatility risk contribution by asset.
- Walk-forward VaR backtesting.
- Kupiec unconditional-coverage test.
- Historical and custom stress testing.
- Downloadable summary report.

## 4.2 Phase 2 extensions

- Monte Carlo VaR with a Student-t distribution.
- Conditional coverage or independence testing.
- Sector-level risk contribution.
- Comparison of normal- and high-volatility regimes.
- Vietnamese-language interface.
- PDF report generation with charts.
- Additional benchmarks or asset classes.

## 4.3 Explicit non-goals

Do not implement:

- price prediction;
- LSTM stock forecasting;
- buy, sell, or hold recommendations;
- expected-return optimization in the MVP;
- live brokerage accounts;
- order placement;
- real-money portfolio tracking;
- authentication;
- payment;
- social trading;
- leaderboards;
- gamified profit simulations;
- scraping that violates a data provider's terms;
- claims that the prototype is suitable for regulatory reporting.

---

# 5. Practical application

The product is a prototype decision-support and model-audit tool.

| System result | Practical interpretation |
|---|---|
| One-day VaR | Estimated loss threshold under a selected model and confidence level |
| Expected Shortfall | Average loss in observations beyond the VaR threshold |
| Maximum drawdown | Largest historical decline from a prior portfolio peak |
| Correlation matrix | Whether assets tend to move together |
| Concentration measure | Whether weights are dominated by a small number of holdings |
| Risk contribution | Which holding drives portfolio volatility |
| VaR exception rate | Whether the model tends to understate or overstate downside risk |
| Kupiec test | Whether the observed exception frequency is statistically compatible with the stated confidence level |
| Stress-test loss | Portfolio response to an explicitly specified adverse scenario |
| Limit warning | Whether a user-defined internal risk threshold has been exceeded |

The product informs review. It does not automatically alter a portfolio.

---

# 6. Research aim, questions, and hypotheses

## 6.1 Research aim

To design and evaluate a reproducible web-based prototype for measuring, explaining, and validating downside risk in a small Vietnamese equity portfolio.

## 6.2 Research questions

**RQ1.** How do Historical Simulation, Parametric Normal VaR, and EWMA Normal VaR differ in their one-day 95% and 99% risk estimates?

**RQ2.** Which model produces an exception frequency most consistent with its stated confidence level during walk-forward backtesting?

**RQ3.** Does model performance differ between ordinary and high-volatility market regimes?

**RQ4.** Which assets and sectors contribute most to total portfolio risk?

**RQ5.** What additional information do Expected Shortfall and stress testing provide beyond VaR?

## 6.3 Formal backtesting hypothesis

For a VaR model with confidence level \(\alpha\):

\[
H_0: p = 1-\alpha
\]

where \(p\) is the probability of a VaR exception.

For 95% VaR:

\[
H_0: p=0.05
\]

The alternative is:

\[
H_1: p\neq 0.05
\]

Do not describe failure to reject \(H_0\) as proof that the model is correct. It means only that the available exception count is not statistically inconsistent with the target frequency under this test.

## 6.4 Optional empirical hypotheses

These are hypotheses to test, not predetermined conclusions:

- Model exception rates differ across estimation methods.
- A static Normal model may behave differently in high-volatility periods than an adaptive EWMA model.
- VaR alone does not describe the severity of losses after an exception; Expected Shortfall adds tail-severity information.

---

# 7. Scientific and theoretical foundations

## 7.1 Modern Portfolio Theory

The portfolio-level foundation comes from Modern Portfolio Theory and Harry Markowitz's portfolio-selection framework.

For asset-return vector \(\mathbf{r}_t\) and weight vector \(\mathbf{w}\):

\[
r_{p,t}=\mathbf{w}^{T}\mathbf{r}_t
\]

Portfolio variance:

\[
\sigma_p^2=\mathbf{w}^{T}\mathbf{\Sigma}\mathbf{w}
\]

where \(\mathbf{\Sigma}\) is the asset-return covariance matrix.

This supports:

- portfolio return aggregation;
- diversification analysis;
- covariance and correlation analysis;
- volatility calculation;
- risk-contribution decomposition.

## 7.2 Downside-risk measurement

Define portfolio loss as:

\[
L_t=-r_{p,t}
\]

For confidence level \(\alpha\), VaR is the corresponding loss quantile:

\[
\operatorname{VaR}_{\alpha}=Q_{\alpha}(L)
\]

For a continuous loss distribution:

\[
P(L>\operatorname{VaR}_{\alpha})=1-\alpha
\]

Expected Shortfall:

\[
ES_{\alpha}=E[L\mid L>\operatorname{VaR}_{\alpha}]
\]

VaR answers how large a selected loss threshold is. Expected Shortfall describes the average severity after the threshold has been exceeded.

## 7.3 Statistical foundations

The project uses:

- means and variances;
- standard deviation;
- covariance and correlation;
- empirical and parametric quantiles;
- Normal distribution;
- exponentially weighted variance;
- Monte Carlo simulation in Phase 2;
- rolling-window time-series evaluation;
- likelihood-ratio hypothesis testing.

## 7.4 Model validation

The central scientific distinction is between **calculation** and **validation**.

At each test date:

1. use only prior observations;
2. fit or calculate the risk model;
3. forecast the next day's loss threshold;
4. observe the next day's realized loss;
5. record whether the loss exceeded the forecast threshold.

This walk-forward procedure prevents future-data leakage.

## 7.5 Stress testing

Stress testing is scenario analysis, not probability forecasting. It asks:

> If the specified shocks occurred, what would their approximate effect on this portfolio be?

For asset shocks \(s_i\):

\[
\text{Portfolio shock}=\sum_{i=1}^{n}w_i s_i
\]

## 7.6 Relationship to CFA

The CFA curriculum overlaps with this project through:

- risk and return;
- portfolio construction;
- covariance and correlation;
- diversification;
- institutional investors;
- risk management;
- CAPM and beta.

However, CFA is a professional curriculum, not the project's sole scientific theory. The academic foundation should be cited through original research and authoritative risk-management references.

CAPM is optional in the MVP. Include portfolio beta only if a reliable VN-Index benchmark series is supplied:

\[
\beta_p=\frac{\operatorname{Cov}(r_p,r_m)}{\operatorname{Var}(r_m)}
\]

Efficient-frontier optimization is not required because the MVP audits an existing portfolio rather than constructing an optimal one.

---

# 8. Data specification

## 8.1 Market-data input

Use a long-form CSV:

```csv
date,ticker,close,volume,sector
2020-01-02,ASSET_A,100.25,1200000,Technology
2020-01-02,ASSET_B,82.10,900000,Banking
2020-01-02,VNINDEX,960.99,0,Benchmark
```

### Required columns

- `date`: ISO date in `YYYY-MM-DD`;
- `ticker`: non-empty uppercase identifier;
- `close`: positive numeric closing value.

### Optional columns

- `adjusted_close`;
- `volume`;
- `sector`.

If a reliable `adjusted_close` is present, prefer it and report that choice. Otherwise use `close` and disclose the limitation related to corporate actions.

## 8.2 Portfolio input

```csv
ticker,weight,sector
ASSET_A,0.25,Technology
ASSET_B,0.25,Banking
ASSET_C,0.20,Consumer
ASSET_D,0.15,Materials
ASSET_E,0.15,Retail
```

### Validation rules

- Every portfolio ticker must exist in the market dataset.
- Every weight must be finite and non-negative.
- MVP is long-only.
- Weights must sum to 1 within tolerance \(10^{-6}\).
- At least two assets are required.
- Maximum of ten assets in the first version.

## 8.3 Analysis configuration

```json
{
  "start_date": "2018-01-01",
  "end_date": "2025-12-31",
  "rolling_window": 250,
  "forecast_horizon_days": 1,
  "confidence_levels": [0.95, 0.99],
  "models": [
    "historical",
    "parametric_normal",
    "ewma_normal"
  ],
  "ewma_lambda": 0.94,
  "benchmark_ticker": "VNINDEX",
  "notional_value": null
}
```

`notional_value` is optional. If omitted, report risk only as a percentage. If supplied, label monetary output as a **simulated notional amount**, not real capital.

## 8.4 Risk-limit configuration

Limits are user-defined demonstration thresholds, not legal or regulatory rules:

```json
{
  "max_var_95_pct": 0.02,
  "max_single_asset_weight": 0.30,
  "max_sector_weight": 0.45,
  "max_stress_loss_pct": 0.08,
  "test_significance": 0.05
}
```

## 8.5 Data quality rules

The data-validation report must check:

- duplicate date-ticker pairs;
- invalid or missing dates;
- missing tickers;
- non-numeric prices;
- non-positive prices;
- insufficient history;
- missing portfolio assets;
- weight-sum failure;
- overlapping date range across assets;
- excessive missing observations.

For the MVP:

- align assets on the common intersection of trading dates;
- never forward-fill returns;
- show how many observations were removed;
- warn if more than 2% of candidate observations are lost;
- require at least `rolling_window + 100` aligned observations for a meaningful demonstration;
- disable analysis if fewer than `rolling_window + 1` observations exist.

## 8.6 Demonstration dataset

Until cleaned historical Vietnamese data is provided:

- generate deterministic synthetic daily prices;
- use random seed `42`;
- include five fictional tickers plus `VNINDEX`;
- create plausible correlation and volatility differences;
- do not label synthetic values as real stock-market observations;
- display `Educational prototype • Simulated data` throughout the interface;
- place the generator script in `backend/scripts/generate_demo_data.py`;
- save the generated dataset in `frontend/public/demo/`.

When real data is later added, record:

- source;
- retrieval date;
- license or usage restrictions;
- ticker coverage;
- adjustment method;
- missing-data method;
- final analysis period;
- data-cleaning decisions.

---

# 9. Calculation specification

## 9.1 Return series

Use log returns for risk modeling:

\[
r_{i,t}=\ln\left(\frac{P_{i,t}}{P_{i,t-1}}\right)
\]

Portfolio log return under fixed weights:

\[
r_{p,t}=\sum_{i=1}^{n}w_i r_{i,t}
\]

Document the simplifying assumption that weights remain fixed for daily risk calculation.

For the displayed wealth curve, use the portfolio return series consistently:

\[
W_t=W_{t-1}\exp(r_{p,t})
\]

Set \(W_0=100\) for a normalized index.

## 9.2 Annualized volatility

\[
\sigma_{\text{annual}}=\sigma_{\text{daily}}\sqrt{252}
\]

Show:

- value as a percentage;
- calculation period;
- 252-trading-day convention.

## 9.3 Maximum drawdown

Running peak:

\[
M_t=\max_{s\leq t}W_s
\]

Drawdown:

\[
D_t=\frac{W_t}{M_t}-1
\]

Maximum drawdown:

\[
\operatorname{MDD}=\min_t D_t
\]

Display maximum drawdown as a negative percentage and identify its peak and trough dates.

## 9.4 Historical VaR

For rolling loss sample \(L_{t-W},\ldots,L_{t-1}\):

\[
\operatorname{VaR}^{HS}_{\alpha,t}
=Q_{\alpha}(L_{t-W:t-1})
\]

Use a clearly documented quantile convention. In Python, choose and test a specific NumPy quantile method rather than relying on an unstated default.

## 9.5 Parametric Normal VaR

For rolling portfolio-return mean \(\mu_t\), standard deviation \(\sigma_t\), and Normal quantile \(z_{\alpha}\):

\[
\operatorname{VaR}^{N}_{\alpha,t}
=-\mu_t+z_{\alpha}\sigma_t
\]

Report VaR as a positive loss magnitude.

## 9.6 EWMA Normal VaR

Default decay factor:

\[
\lambda=0.94
\]

Variance update:

\[
\sigma_t^2=
\lambda\sigma_{t-1}^2+
(1-\lambda)(r_{p,t-1}-\mu)^2
\]

Then:

\[
\operatorname{VaR}^{EWMA}_{\alpha,t}
=-\mu+z_{\alpha}\sigma_t
\]

Initialization must be documented and unit tested. A practical initialization is the sample variance of the first rolling window.

## 9.7 Expected Shortfall

Historical Expected Shortfall:

\[
ES_{\alpha}=
\operatorname{mean}\{L_t:L_t\geq\operatorname{VaR}_{\alpha}\}
\]

Handle the case of no observations beyond the threshold explicitly.

Optional Parametric Normal ES:

\[
ES_{\alpha}^{N}=
-\mu+\sigma
\frac{\phi(z_{\alpha})}{1-\alpha}
\]

where \(\phi\) is the standard Normal density.

## 9.8 Correlation matrix

Compute Pearson correlation on aligned daily asset log returns.

Output:

- symmetric heatmap;
- ticker labels;
- values in \([-1,1]\);
- tooltip with exact value;
- warning that historical correlation can change.

## 9.9 Concentration

Single-asset concentration:

\[
C_{\max}=\max_i w_i
\]

Herfindahl-Hirschman Index:

\[
HHI=\sum_i w_i^2
\]

Sector concentration:

\[
w_s=\sum_{i\in s}w_i
\]

Do not assign arbitrary qualitative labels without reference to user-defined limits.

## 9.10 Volatility risk contribution

Portfolio volatility:

\[
\sigma_p=\sqrt{\mathbf{w}^{T}\mathbf{\Sigma}\mathbf{w}}
\]

Marginal contribution:

\[
MRC_i=\frac{(\mathbf{\Sigma}\mathbf{w})_i}{\sigma_p}
\]

Component contribution:

\[
RC_i=w_iMRC_i
\]

Percentage contribution:

\[
RC^{\%}_i=\frac{RC_i}{\sigma_p}
\]

Check numerically that:

\[
\sum_i RC_i\approx\sigma_p
\]

## 9.11 Backtesting

For each test day \(t\):

1. take observations `[t-window, t)`;
2. estimate the model using only that slice;
3. calculate next-day VaR;
4. calculate realized loss \(L_t=-r_{p,t}\);
5. set exception indicator:

\[
I_t=
\begin{cases}
1,&L_t>\operatorname{VaR}_{\alpha,t}\\
0,&L_t\leq\operatorname{VaR}_{\alpha,t}
\end{cases}
\]

The result table must include:

- model;
- confidence level;
- test observations;
- expected exceptions;
- actual exceptions;
- exception rate;
- average VaR;
- mean exception severity;
- Kupiec statistic;
- Kupiec p-value;
- pass/fail at the selected significance level.

## 9.12 Kupiec unconditional-coverage test

Let:

- \(T\) be the number of backtest observations;
- \(x\) be the number of exceptions;
- \(p=1-\alpha\);
- \(\hat p=x/T\).

\[
LR_{uc}=
-2\ln
\left[
\frac{(1-p)^{T-x}p^x}
{(1-\hat p)^{T-x}\hat p^x}
\right]
\]

Under \(H_0\):

\[
LR_{uc}\sim\chi^2(1)
\]

Calculate:

\[
\text{p-value}=1-F_{\chi^2_1}(LR_{uc})
\]

Implementation requirements:

- calculate in log space to avoid underflow;
- safely handle `x = 0` and `x = T`;
- validate with known test cases;
- label `PASS` when `p-value >= significance`;
- label `FAIL` when `p-value < significance`;
- state that `PASS` is not proof of model correctness.

## 9.13 Volatility regimes

Phase 2:

1. calculate 20-day annualized realized volatility;
2. classify the top quartile as `High volatility`;
3. classify the remainder as `Normal volatility`;
4. compare exception rates and average VaR by regime.

The classification threshold must be calculated only from the appropriate historical sample when used predictively.

## 9.14 Stress testing

### Custom asset shocks

For shock vector \(\mathbf{s}\):

\[
\Delta V_p=\mathbf{w}^{T}\mathbf{s}
\]

Output:

- portfolio loss percentage;
- simulated notional loss if a notional value is supplied;
- loss contribution by asset;
- largest contributor;
- limit status.

### Historical scenario

For a user-selected historical date range:

- compute each asset's cumulative return over the interval;
- apply the supplied portfolio weights;
- show the total and asset-level effects;
- clearly display the scenario dates;
- do not imply the scenario is a forecast.

---

# 10. Product inputs

## 10.1 User-controlled inputs

| Input | Component | Default |
|---|---|---|
| Dataset | Demo/upload selector | Demo |
| Portfolio | Upload or preset | Five-asset demo |
| Date range | Date picker | Full available range |
| Rolling window | Numeric/select | 250 |
| Confidence | Segmented control | 95% |
| Model | Multi-select | All core models |
| EWMA lambda | Advanced input | 0.94 |
| Benchmark | Select | VNINDEX |
| Simulated notional | Optional numeric | Empty |
| Risk limits | Advanced panel | Demonstration defaults |
| Stress scenario | Historical/custom | Historical |

## 10.2 Input states

Implement:

- empty state;
- valid state;
- validation-warning state;
- blocking-error state;
- calculating state;
- completed state.

The `Run analysis` button must be disabled when:

- no data is available;
- weights are invalid;
- history is insufficient;
- required columns are missing.

---

# 11. Product outputs

## 11.1 Data-quality output

```text
Analysis period: [start]–[end]
Aligned observations: [N]
Assets: [N]
Missing observations removed: [N]
Duplicate records: [N]
Weight total: [value]
Data status: PASS / WARNING / FAIL
```

## 11.2 Portfolio-overview output

- allocation by asset;
- allocation by sector;
- normalized portfolio wealth curve;
- VN-Index benchmark curve when available;
- daily-return distribution;
- drawdown series.

## 11.3 Primary metrics

The first viewport must show four metric cards:

1. Annualized Volatility
2. VaR 95%
3. Expected Shortfall 95%
4. Maximum Drawdown

Each card contains:

- label;
- value;
- unit;
- model or calculation basis;
- small context line;
- tooltip with definition;
- no green/red implication of investment quality.

## 11.4 Concentration output

- largest position;
- largest sector;
- HHI;
- correlation heatmap;
- any user-defined limit breaches.

## 11.5 Risk-contribution output

Table:

| Asset | Portfolio weight | Volatility contribution | Contribution percentage | Limit flag |
|---|---:|---:|---:|---|

Chart:

- horizontal contribution bars or donut;
- total must approximately equal 100%;
- show exact values in tooltips.

## 11.6 Model-audit output

| Model | Confidence | Expected exceptions | Actual exceptions | Exception rate | Kupiec p-value | Result |
|---|---:|---:|---:|---:|---:|---|

Chart:

- realized portfolio loss;
- positive VaR threshold shown on the same loss scale;
- exception markers;
- model toggle;
- confidence toggle;
- time-range zoom.

## 11.7 Stress-test output

```text
Scenario: [name]
Period or shocks: [details]
Estimated portfolio impact: [X%]
Simulated notional impact: [optional]
Largest loss contributor: [asset/sector]
Stress limit: [X%]
Limit status: WITHIN LIMIT / WARNING / BREACH
```

## 11.8 Executive risk-audit summary

```text
PORTFOLIO RISK AUDIT

Dataset: [name]
Data period: [start]–[end]
Number of assets: [N]
Annualized volatility: [X%]
Maximum drawdown: [X%]
One-day VaR 95%: [X%]
Expected Shortfall 95%: [X%]
Largest risk contributor: [asset]
Best-calibrated tested model: [model or inconclusive]
Backtesting result: [summary]
Stress-test impact: [X%]
Risk-limit warnings: [N]
```

Use `Best-calibrated tested model`, not `best model`, unless the selection rule is explicitly defined.

---

# 12. Model-selection rule

Do not select a model solely because it reports the smallest VaR.

Model comparison should consider:

1. exception rate distance from the target;
2. Kupiec result;
3. exception severity;
4. stability across time or volatility regimes;
5. methodological assumptions;
6. computation time as a secondary criterion.

If results conflict, output:

> No single model dominates all evaluation criteria.

This is an acceptable and scientifically honest conclusion.

---

# 13. Visual direction: Institutional Midnight

The selected design is **Option 1 — Institutional Midnight**.

The interface should resemble a premium institutional risk-monitoring product, not a retail trading platform.

## 13.1 Visual principles

- Dark, precise, analytical, and restrained.
- High information density with strong hierarchy.
- No candlestick trading terminal.
- No flashing prices.
- No profit celebrations.
- No neon casino aesthetic.
- Use color primarily to encode data state.
- Charts should be legible before they are decorative.

## 13.2 Design tokens

```css
:root {
  --bg: #07111f;
  --bg-elevated: #0a1726;
  --surface: #0d1b2a;
  --surface-2: #12263a;
  --surface-hover: #173149;
  --border: #20354a;
  --border-strong: #2b4862;

  --text: #f5f1e8;
  --text-secondary: #b9c8d5;
  --text-muted: #7f97aa;

  --aqua: #33d1c6;
  --aqua-soft: rgba(51, 209, 198, 0.14);
  --blue: #4ea7ff;
  --coral: #ff6b6b;
  --coral-soft: rgba(255, 107, 107, 0.14);
  --amber: #f5c451;
  --success: #46d38a;

  --shadow-panel: 0 18px 50px rgba(0, 0, 0, 0.24);
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
}
```

## 13.3 Typography

- Primary UI: `Inter`, `Manrope`, or system sans-serif.
- Numerical values: `IBM Plex Mono`, `JetBrains Mono`, or system monospace.
- Page title: 24–28 px, 700.
- Section heading: 16–18 px, 650–700.
- Metric value: 28–36 px, 650.
- Body: 14 px, 400–500.
- Supporting label: 11–12 px, uppercase with modest tracking.

Do not require an external font network request for the application to remain usable.

## 13.4 Desktop grid

Conceptual first viewport: `1440 × 900`, 16:10.

- Top header: 64 px.
- Left control rail: approximately 272–288 px.
- Main content: flexible 12-column grid.
- Outer page padding: 24 px.
- Main gaps: 16 px.
- Metric cards: four across on wide screens.
- Main chart: approximately eight columns.
- Risk-status panel: approximately four columns.

## 13.5 Header

Left:

```text
VN RISK AUDITOR
Portfolio risk intelligence for Vietnam's equity market
```

Navigation:

- Overview
- Model Audit
- Stress Test
- Report

Right:

- data-status pill;
- informational help icon;
- `Educational prototype` badge.

## 13.6 Left control rail

Sections:

1. Dataset
2. Portfolio
3. Date range
4. Confidence
5. Rolling window
6. Model
7. Advanced assumptions
8. Run analysis

The primary button:

```text
Run analysis
```

Button style:

- aqua background;
- dark navy text;
- 44 px minimum height;
- full width;
- clear focus ring;
- progress state while calculating.

## 13.7 Metric cards

Four cards:

- Annual Volatility;
- VaR 95%;
- Expected Shortfall;
- Max Drawdown.

Cards use:

- subtle navy gradient;
- one-pixel border;
- restrained glow only on focus/hover;
- monospace numeric values;
- tiny definition tooltip;
- no decorative percentage arrows unless comparing explicitly defined periods.

## 13.8 Main chart

Title:

```text
Portfolio risk profile
```

Controls:

- Portfolio / Loss view;
- model selector;
- confidence selector;
- date zoom.

Visual layers:

- aqua portfolio line;
- coral VaR threshold;
- coral exception markers;
- muted grid;
- neutral benchmark line when available.

## 13.9 Risk-status panel

Show:

- overall limit status;
- current VaR versus user-defined limit;
- number of warnings;
- largest risk contributor;
- compact contribution donut or bars.

Use:

- aqua for within-limit informational state;
- amber for warning;
- coral for breach;
- never label a portfolio `safe`.

## 13.10 Motion

- 150–220 ms panel and tooltip transitions.
- Chart lines may animate only on first render and must respect reduced-motion settings.
- No looping ambient animation.
- No pulsing alerts except a single non-repeating transition.

## 13.11 Responsive behavior

### Tablet

- control rail becomes a collapsible drawer;
- metric cards use two columns;
- chart and status panel stack.

### Mobile

- single-column layout;
- sticky compact `Run analysis` bar;
- horizontally scrollable model-audit table;
- chart tooltips must work with touch;
- navigation becomes tabs or a menu;
- minimum touch target 44 px.

---

# 14. Information architecture

## 14.1 Route strategy

MVP may use one route with anchored sections or four routes.

Recommended routes:

```text
/
/model-audit
/stress-test
/report
```

If implementation time is limited, use one route with tabs while preserving shareable section state in the URL.

## 14.2 Overview

- inputs;
- data quality;
- four primary metrics;
- portfolio-risk chart;
- allocation;
- risk contribution;
- concentration;
- recent warnings.

## 14.3 Model Audit

- model-comparison table;
- VaR-versus-loss chart;
- exception markers;
- Kupiec results;
- definitions and assumptions;
- optional regime comparison.

## 14.4 Stress Test

- historical/custom scenario selector;
- shock editor;
- scenario output;
- asset and sector contribution;
- limit result;
- scenario explanation.

## 14.5 Report

- executive summary;
- methods;
- result tables;
- limitations;
- export controls.

---

# 15. Interaction requirements

## 15.1 Analysis workflow

1. Load demo data or upload files.
2. Validate data and weights immediately.
3. Show a compact validation report.
4. Enable `Run analysis`.
5. Display a deterministic progress state.
6. Render results.
7. Preserve selected parameters when navigating between sections.
8. Allow report export.

## 15.2 Tooltips and explanations

Every technical term must have a short explanation:

- volatility;
- VaR;
- Expected Shortfall;
- maximum drawdown;
- exception;
- Kupiec test;
- risk contribution;
- stress test.

Tooltips should explain meaning, not merely repeat the label.

## 15.3 Empty and error states

Examples:

```text
Upload market data to begin.
```

```text
Portfolio weights total 96%. Adjust them to 100% before analysis.
```

```text
Only 180 aligned observations are available. At least 251 are required
for a 250-day rolling analysis.
```

```text
The benchmark is unavailable. Portfolio beta and benchmark comparison
will be omitted.
```

## 15.4 Accessibility

- semantic HTML;
- visible keyboard focus;
- proper input labels;
- WCAG-aware color contrast;
- chart data also available as a table;
- color is not the only state indicator;
- reduced-motion support;
- accessible error summaries;
- screen-reader labels for icons.

---

# 16. Technical architecture

## 16.1 Recommended stack

### Frontend

- Next.js with App Router;
- TypeScript;
- Tailwind CSS;
- shadcn/ui-style local components;
- Recharts for charts;
- TanStack Table for analytical tables;
- React Hook Form;
- Zod;
- Lucide icons.

### Backend

- Python 3.11+;
- FastAPI;
- Pydantic;
- pandas;
- NumPy;
- SciPy;
- optional statsmodels;
- pytest.

### Tooling

- npm or pnpm, but choose one and commit one lockfile;
- Ruff for Python linting;
- Black or Ruff formatting;
- ESLint;
- Prettier;
- Vitest and React Testing Library;
- Docker Compose as an optional convenience;
- GitHub Actions after local tests work.

## 16.2 Suggested repository structure

```text
vn-risk-auditor/
├── VN_Portfolio_Risk_Auditor_Claude_Code_PRD.md
├── README.md
├── .gitignore
├── docker-compose.yml
├── frontend/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── model-audit/page.tsx
│   │   ├── stress-test/page.tsx
│   │   ├── report/page.tsx
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── layout/
│   │   ├── inputs/
│   │   ├── metrics/
│   │   ├── charts/
│   │   ├── tables/
│   │   └── feedback/
│   ├── lib/
│   │   ├── api.ts
│   │   ├── format.ts
│   │   └── validation.ts
│   ├── types/
│   ├── public/demo/
│   └── tests/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   ├── schemas/
│   │   ├── services/
│   │   │   ├── data_validation.py
│   │   │   ├── returns.py
│   │   │   ├── portfolio_metrics.py
│   │   │   ├── var_models.py
│   │   │   ├── expected_shortfall.py
│   │   │   ├── risk_contribution.py
│   │   │   ├── backtesting.py
│   │   │   ├── kupiec.py
│   │   │   └── stress_testing.py
│   │   └── core/
│   ├── scripts/
│   │   └── generate_demo_data.py
│   └── tests/
├── data/
│   ├── raw/
│   ├── processed/
│   └── DATA_DICTIONARY.md
└── docs/
    ├── methodology.md
    ├── limitations.md
    └── research-report-outline.md
```

## 16.3 Backend API

### Health

```http
GET /api/v1/health
```

Response:

```json
{
  "status": "ok",
  "version": "1.0.0"
}
```

### Analyse portfolio

```http
POST /api/v1/analyse
Content-Type: multipart/form-data
```

Fields:

- `market_file`;
- `portfolio_file`;
- `config_json`;
- `limits_json`.

Response shape:

```json
{
  "metadata": {
    "dataset_name": "demo",
    "is_simulated": true,
    "start_date": "2018-01-01",
    "end_date": "2025-12-31",
    "observations": 1900,
    "assets": 5
  },
  "data_quality": {
    "status": "pass",
    "warnings": [],
    "rows_removed": 0
  },
  "portfolio": {
    "weights": [],
    "sector_weights": [],
    "wealth_curve": [],
    "drawdown_curve": []
  },
  "metrics": {
    "annualised_volatility": 0.0,
    "maximum_drawdown": 0.0,
    "var": [],
    "expected_shortfall": []
  },
  "concentration": {
    "largest_weight": 0.0,
    "largest_sector_weight": 0.0,
    "hhi": 0.0
  },
  "risk_contribution": [],
  "correlation": {
    "tickers": [],
    "matrix": []
  },
  "limits": {
    "status": "within_limit",
    "warnings": []
  }
}
```

All example numeric zeros are schema placeholders, not analytical results.

### Backtest

```http
POST /api/v1/backtest
Content-Type: multipart/form-data
```

Response:

```json
{
  "series": [],
  "summary": [
    {
      "model": "historical",
      "confidence": 0.95,
      "observations": 0,
      "expected_exceptions": 0.0,
      "actual_exceptions": 0,
      "exception_rate": 0.0,
      "kupiec_lr": 0.0,
      "kupiec_p_value": 0.0,
      "result": "pass"
    }
  ]
}
```

### Stress test

```http
POST /api/v1/stress-test
Content-Type: application/json
```

Example request:

```json
{
  "weights": [
    {"ticker": "ASSET_A", "weight": 0.25}
  ],
  "scenario": {
    "type": "custom",
    "name": "Custom adverse scenario",
    "shocks": {
      "ASSET_A": -0.05
    }
  },
  "notional_value": null,
  "stress_limit": 0.08
}
```

### Report

The MVP may generate a printable HTML report in the frontend. A backend PDF endpoint is optional:

```http
POST /api/v1/report
```

Do not block the MVP on advanced PDF generation.

## 16.4 API principles

- Validate all uploads.
- Return structured error codes.
- Avoid returning pandas/NumPy scalar types directly.
- Use ISO dates.
- Return percentages as decimals; format in the frontend.
- Return null when a metric is unavailable.
- Include assumptions in every analytical response.
- Configure CORS only for required development and deployment origins.

---

# 17. State and privacy

The MVP does not need a database.

- Process uploaded files in memory or in short-lived temporary storage.
- Do not retain uploaded portfolio files after processing.
- Do not collect names, emails, account numbers, brokerage credentials, or transactions.
- Do not integrate third-party financial accounts.
- Store only harmless UI preferences in browser storage.

---

# 18. Report content

The downloadable or printable report should contain:

1. Executive summary
2. Dataset information
3. Data-quality assessment
4. Portfolio composition
5. Return and volatility
6. Maximum drawdown
7. VaR and Expected Shortfall
8. Correlation and concentration
9. Risk contribution
10. Backtesting
11. Kupiec test
12. Stress testing
13. User-defined limit warnings
14. Assumptions
15. Limitations
16. Educational-use disclaimer

Required disclaimer:

> This prototype is for education and research. It does not provide investment advice, predict market direction, execute trades, or represent a production risk-management system.

---

# 19. Research-report structure

## Abstract

Summarise the problem, data, models, validation method, prototype, main findings, and limitations.

## 1. Introduction

- quantitative finance context;
- portfolio market risk;
- need for model validation;
- Vietnamese emerging-market motivation;
- research aim and questions.

## 2. Literature and theoretical framework

### 2.1 Modern Portfolio Theory

- portfolio return;
- variance and covariance;
- correlation;
- diversification.

### 2.2 Downside risk

- VaR;
- Expected Shortfall;
- limitations of volatility alone.

### 2.3 VaR estimation

- Historical Simulation;
- Parametric Normal;
- EWMA;
- Monte Carlo as extension.

### 2.4 Model validation

- walk-forward backtesting;
- exception rate;
- Kupiec test;
- model risk.

### 2.5 Stress testing

- historical scenario;
- hypothetical scenario;
- risk limits.

## 3. Methodology

- data source and period;
- selected portfolio;
- cleaning;
- return calculation;
- model assumptions;
- rolling-window design;
- backtesting;
- statistical test;
- stress scenarios;
- software implementation.

## 4. System design

- user problem;
- inputs;
- outputs;
- architecture;
- interface;
- calculation pipeline.

## 5. Results

- descriptive statistics;
- risk metrics;
- model comparison;
- backtest results;
- stress tests;
- risk contribution.

## 6. Discussion

- interpretation;
- why models differ;
- ordinary versus high-volatility periods;
- practical use;
- what the prototype cannot do.

## 7. Limitations

- data quality;
- small sample at 99%;
- model assumptions;
- fixed weights;
- historical dependence;
- no transaction costs;
- no liquidity modeling;
- no production validation.

## 8. Conclusion

- answer each research question;
- identify whether one model dominated;
- state what was learned;
- propose extensions.

---

# 20. Test strategy

## 20.1 Backend unit tests

### Returns

- constant prices produce zero returns;
- a known price sequence produces known log returns;
- dates remain sorted;
- duplicate dates fail validation.

### Portfolio returns

- weights sum to one;
- one-asset portfolio equals the asset return;
- equal weights match the arithmetic weighted sum.

### Volatility

- constant returns produce zero volatility;
- annualization uses \(\sqrt{252}\).

### Drawdown

- monotonically increasing wealth produces zero drawdown;
- known peak-trough sequence produces expected drawdown.

### VaR

- known empirical loss vector produces a documented quantile;
- Parametric VaR matches a manually calculated example;
- higher confidence should not produce a smaller VaR for the same distribution.

### Expected Shortfall

- ES must be at least as large as VaR under the chosen positive-loss convention when tail observations exist.

### Risk contribution

- contribution total approximates portfolio volatility;
- zero-weight asset has zero contribution;
- covariance matrix validation rejects invalid shape.

### Backtesting

- no future observation is used in its own forecast;
- forecast count equals `N - rolling_window`;
- exceptions match direct comparison;
- model parameters use only the rolling slice.

### Kupiec

- known cases produce expected likelihood-ratio values;
- `x = 0` is handled;
- `x = T` is handled;
- p-values remain in `[0,1]`.

### Stress testing

- weighted shock equals the dot product;
- contribution sum equals total portfolio shock.

## 20.2 Frontend tests

- dashboard renders demo metrics;
- simulated-data badge is visible;
- invalid weight total disables analysis;
- upload errors are announced accessibly;
- model and confidence controls update displayed output;
- tables have accessible labels;
- mobile navigation works;
- report page prints without clipped content.

## 20.3 Integration tests

- demo files complete the analysis workflow;
- valid upload reaches result state;
- invalid file produces a structured error;
- backend unavailability produces a recoverable message;
- report uses the same analysis assumptions as the dashboard.

## 20.4 Numerical tolerances

Document tolerances in tests. Avoid exact floating-point equality where inappropriate.

---

# 21. Acceptance criteria

## 21.1 Functional

- User can load deterministic demo data.
- User can upload valid market and portfolio CSV files.
- System validates required columns and weights.
- System calculates portfolio return, volatility, drawdown, VaR, ES, concentration, correlation, and risk contribution.
- System performs walk-forward backtesting without future-data leakage.
- System calculates the Kupiec test.
- System runs a custom stress scenario.
- System displays user-defined limit warnings.
- User can print or export a coherent report.

## 21.2 Visual

- Interface follows Institutional Midnight tokens.
- First viewport clearly shows inputs, four primary metrics, main chart, and risk status.
- Desktop, tablet, and mobile layouts are usable.
- No retail-trading or gamified visual language.
- All simulated outputs are labeled.

## 21.3 Scientific

- Formula conventions are documented.
- Sign conventions are consistent.
- Quantile method is explicit.
- Backtesting is temporal and reproducible.
- Model comparison uses declared criteria.
- No result is predetermined.
- Limitations are visible.

## 21.4 Engineering

- Frontend lint passes.
- Frontend tests pass.
- Frontend production build passes.
- Backend lint passes.
- Backend tests pass.
- No credentials are committed.
- README contains reproducible setup steps.
- Demo workflow works from a clean clone.

---

# 22. Implementation phases

## Phase 1 — Institutional Midnight UI

Build:

- responsive shell;
- header and navigation;
- left analysis rail;
- metric cards;
- main risk-profile chart;
- risk-status panel;
- demo-data badge;
- static report preview.

Use deterministic mock values only and label them clearly.

**Exit condition:** polished responsive UI passes lint, tests, and production build.

## Phase 2 — Backend foundation

Build:

- FastAPI project;
- schemas;
- data validation;
- deterministic demo-data generator;
- return and portfolio-metric calculations.

**Exit condition:** backend unit tests pass.

## Phase 3 — Core risk analysis

Build:

- Historical VaR;
- Parametric Normal VaR;
- EWMA Normal VaR;
- Expected Shortfall;
- correlation;
- concentration;
- risk contribution.

**Exit condition:** tested API response renders in the dashboard.

## Phase 4 — Model validation

Build:

- walk-forward backtesting;
- exception series;
- Kupiec test;
- comparison table;
- exception chart.

**Exit condition:** temporal-leakage tests and known numerical tests pass.

## Phase 5 — Stress testing

Build:

- custom shocks;
- historical scenario;
- asset contribution;
- limit status.

**Exit condition:** scenario calculations and UI agree.

## Phase 6 — Reporting

Build:

- executive summary;
- methodology and limitations;
- printable report;
- CSV export of metrics and backtests.

**Exit condition:** exported content matches on-screen analysis.

## Phase 7 — Research and portfolio polish

Build:

- README;
- architecture diagram;
- methodology document;
- research report;
- three-minute demo script;
- screenshots;
- deployment instructions.

---

# 23. README requirements

The README should contain:

- project summary;
- problem statement;
- screenshot;
- feature list;
- scientific basis;
- technology stack;
- architecture;
- data schema;
- local setup;
- tests;
- example workflow;
- limitations;
- educational disclaimer;
- research references;
- author reflection.

Do not claim admission impact, professional suitability, or investment performance.

---

# 24. University-application deliverables

The completed portfolio package should include:

- deployed website;
- GitHub repository;
- cleaned or simulated dataset with data dictionary;
- 8–12 page research paper;
- risk-audit example report;
- research poster;
- two- to three-minute demonstration video;
- short personal reflection covering:
  - why this problem was selected;
  - what mathematical concepts were learned;
  - what failed during development;
  - how data leakage was prevented;
  - why limitations matter;
  - what would be required for a production system.

---

# 25. Data-source strategy

Potential historical-data references discussed during project conception:

- Yahoo Finance VN-Index historical page:  
  <https://finance.yahoo.com/quote/%5EVNINDEX.VN/history/>
- CafeF historical VN-Index data:  
  <https://cafef.vn/du-lieu/lich-su-giao-dich-symbol-vnindex/trang-1-0-tab-1.chn>
- World Bank Indicators API documentation for optional macroeconomic extensions:  
  <https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation>

Before programmatically retrieving data:

- review the source's current terms;
- prefer an allowed downloadable file or documented API;
- preserve source attribution;
- freeze a project dataset for reproducibility;
- do not make the MVP depend on an unstable unofficial API.

The application must remain fully demonstrable with the bundled simulated dataset.

---

# 26. Core references

1. Markowitz, H. (1952). “Portfolio Selection.” *The Journal of Finance*, 7(1), 77–91.  
   <https://onlinelibrary.wiley.com/doi/10.1111/j.1540-6261.1952.tb01525.x>

2. Rockafellar, R. T., and Uryasev, S. “Optimization of Conditional Value-at-Risk.”  
   <https://sites.math.washington.edu/~rtr/papers/rtr179-CVaR1.pdf>

3. Kupiec, P. H. (1995). “Techniques for Verifying the Accuracy of Risk Measurement Models.”  
   <https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6697>

4. Basel Committee, market-risk backtesting requirements.  
   <https://www.bis.org/basel_framework/chapter/MAR/32.htm>

5. CFA Institute, CFA Program Curriculum overview.  
   <https://www.cfainstitute.org/programs/cfa-program/curriculum>

6. CFA Institute, Portfolio Risk and Return.  
   <https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/portfolio-risk-return-part-1>

---

# 27. Final product definition

The final product is:

> A professional-looking, reproducible, educational web prototype that audits a small Vietnamese equity portfolio by quantifying downside risk, explaining the sources of risk, testing VaR model calibration, evaluating adverse scenarios, and exporting a transparent report.

The core output is:

> A portfolio risk-audit report showing how much risk is present, where it originates, how the portfolio responds to specified adverse scenarios, and whether the tested risk model's historical exception frequency is compatible with its stated confidence level.

The product is successful when a reviewer can:

1. understand the financial problem without specialist guidance;
2. upload or select data;
3. reproduce the analysis;
4. inspect the assumptions;
5. see that the model was tested rather than merely calculated;
6. distinguish simulated demonstration values from real empirical results;
7. understand the limitations;
8. recognise the connection between mathematics, programming, and institutional quantitative risk management.

---

# 28. Definition of done

The project is done when:

- the Institutional Midnight interface is complete and responsive;
- demo and upload workflows function;
- core metrics are numerically tested;
- backtesting does not use future data;
- the Kupiec test is implemented and documented;
- stress testing works;
- a report can be exported;
- assumptions and limitations are visible;
- all demonstration data is labeled;
- no investment recommendations or trading functions exist;
- setup is reproducible;
- the website, repository, report, poster, and demo video form one coherent admissions portfolio.

