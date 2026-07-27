# Data dictionary

Definitions for every dataset the project reads, and the record that must be
completed before any real market data is used.

---

## 1. Market data — `market_data.csv`

Long form: one row per ticker per trading day.

| Column | Type | Required | Description |
|---|---|---|---|
| `date` | ISO `YYYY-MM-DD` | Yes | Trading day. Must parse; unparseable rows are dropped and counted. |
| `ticker` | Uppercase string | Yes | Instrument identifier. Trimmed and upper-cased on load. |
| `close` | Positive number | Yes | Closing price. Non-numeric or non-positive rows are dropped — a zero or negative price cannot yield a log return. |
| `adjusted_close` | Positive number | No | Preferred over `close` when present; the engine reports which basis it used. |
| `volume` | Integer | No | Not used in any calculation. Present for completeness. |
| `sector` | String | No | Used for sector concentration. Defaults to `Unclassified`. |

**Constraints**

- `(date, ticker)` must be unique. Duplicates are removed keeping the first
  occurrence, counted, and reported as a data-quality warning.
- Assets are aligned on the **intersection** of their trading dates. Any date on
  which a selected asset did not trade is dropped for all of them.
- Missing observations are **never forward-filled**.

**Example**

```csv
date,ticker,close,volume,sector
2018-01-01,ASSET_A,99.91,2241650,Technology
2018-01-01,ASSET_B,83.48,1604834,Banking
2018-01-01,VNINDEX,961.86,0,Benchmark
```

---

## 2. Portfolio — `portfolio.csv`

| Column | Type | Required | Description |
|---|---|---|---|
| `ticker` | Uppercase string | Yes | Must exist in the market dataset. |
| `weight` | Number in [0, 1] | Yes | Portfolio weight. |
| `sector` | String | No | Falls back to `Unclassified`. |

**Validation rules** (each produces a specific error code)

| Rule | Code |
|---|---|
| Weights sum to 1 within 1e-6 | `WEIGHT_SUM` |
| No negative weights — this version is long-only | `NEGATIVE_WEIGHT` |
| At least 2 assets | `TOO_FEW_ASSETS` |
| At most 10 assets | `TOO_MANY_ASSETS` |
| Every ticker present in the market data | `TICKER_NOT_IN_MARKET_DATA` |
| Weights numeric | `WEIGHT_NOT_NUMERIC` |

**Example**

```csv
ticker,weight,sector
ASSET_A,0.25,Technology
ASSET_B,0.25,Banking
ASSET_C,0.20,Consumer
ASSET_D,0.15,Materials
ASSET_E,0.15,Retail
```

---

## 3. History requirements

| Condition | Effect |
|---|---|
| Aligned observations < `rolling_window + 1` | Analysis **blocked** (`INSUFFICIENT_HISTORY`) |
| Aligned observations < `rolling_window + 100` | Warning (`THIN_HISTORY`); analysis proceeds |
| More than 2% of candidate dates lost to alignment | Warning (`EXCESSIVE_ALIGNMENT_LOSS`) |

---

## 4. The bundled demonstration dataset

**Synthetic. Fictional tickers. Not observed market data.**

| Property | Value |
|---|---|
| Generator | `backend/scripts/generate_demo_data.py` |
| Seed | 42 |
| Period | 2018-01-01 → 2025-12-31 |
| Trading days | 2,088 (weekdays; Vietnamese market holidays are not modelled) |
| Rows | 12,528 |
| Instruments | ASSET_A … ASSET_E, plus VNINDEX as benchmark |

**Construction.** A common market factor drives all assets, each with its own
beta and idiosyncratic volatility. A slow volatility cycle is overlaid with two
deliberate stress windows, so the series contains both calm and turbulent
regimes — without which the comparison between adaptive and static estimators
would have nothing to bite on.

| Ticker | Sector | Weight | Beta | Idiosyncratic vol | Start price |
|---|---|---:|---:|---:|---:|
| ASSET_A | Technology | 0.25 | 1.15 | 0.0110 | 100.25 |
| ASSET_B | Banking | 0.25 | 1.30 | 0.0090 | 82.10 |
| ASSET_C | Consumer | 0.20 | 0.85 | 0.0080 | 54.40 |
| ASSET_D | Materials | 0.15 | 1.05 | 0.0125 | 31.75 |
| ASSET_E | Retail | 0.15 | 0.95 | 0.0100 | 47.60 |

**Reproducibility.** `frontend/public/demo/manifest.json` records the seed and a
SHA-256 of each file. Regeneration must leave the checksums unchanged; this is
verified, not assumed. Line endings are forced to LF via `.gitattributes`,
without which a Windows checkout would alter the files and break that check for a
reason unrelated to the data.

---

## 5. Precomputed analysis

Produced by `backend/scripts/precompute_demo_analysis.py` and imported by the
dashboard at build time.

| File | Contents |
|---|---|
| `analysis.json` | Full `AnalysisResult` — metrics, curves, correlation, contributions, limits, assumptions |
| `backtest.json` | Walk-forward series for the primary pair, plus a summary row per model × confidence |
| `stress.json` | Three historical scenarios located in the dataset and replayed against the weights |

These must be regenerated whenever the engine or the dataset changes.

---

## 6. Record to complete before using real data

**Nothing below is filled in. No real market data is in this repository.**

PRD 8.6 requires each of these to be recorded before any result derived from real
data is reported.

| Field | Value |
|---|---|
| Source | *(not yet supplied)* |
| Retrieval date | |
| Licence / terms of use | |
| Terms reviewed on | |
| Redistribution permitted? | |
| Ticker coverage | |
| Period covered | |
| Price basis (`close` / `adjusted_close`) | |
| Corporate-action adjustment method | |
| Missing-data handling | |
| Rows removed during cleaning, and why | |
| Final analysis period after alignment | |
| Known gaps or anomalies | |

**Before retrieving programmatically**

- Review the source's current terms; they change.
- Prefer a documented API or an allowed file download over scraping.
- Preserve attribution.
- Freeze the retrieved dataset and checksum it, so results stay reproducible when
  the upstream source changes.
- Do not make the application depend on an unstable unofficial endpoint — it must
  remain fully demonstrable on the bundled synthetic dataset.

**Candidate sources** noted during project conception (terms unreviewed):

- Yahoo Finance VN-Index historical data
- CafeF historical VN-Index data
- World Bank Indicators API, for optional macroeconomic extensions

---

## 7. Privacy

Uploaded files are parsed in memory and discarded. Nothing is written to disk,
nothing is retained after the response is built, and no personal data, account
identifier or credential is collected at any point.
