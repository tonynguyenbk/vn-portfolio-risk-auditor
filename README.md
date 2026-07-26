# VN Portfolio Risk Auditor

A web prototype that audits the downside risk of a small Vietnamese equity portfolio:
how much risk it carries, where that risk comes from, how it responds to adverse
scenarios, and — the part most tools skip — whether the risk model itself can be
trusted on the data it was tested against.

> **Educational prototype • Simulated data.** Every figure currently shown is computed
> from a deterministic generated series, not from observed market data. This project
> does not provide investment advice, predict market direction, or execute trades.

The full specification lives in
[VN_Portfolio_Risk_Auditor_Claude_Code_PRD.md](VN_Portfolio_Risk_Auditor_Claude_Code_PRD.md)
and is the source of truth for everything below.

---

## What problem it addresses

Different market-risk models can produce materially different risk estimates for the
same portfolio. A risk number is not useful merely because it can be calculated — it
should also be checked against what happened next. The prototype separates two things
that are often conflated:

| | |
|---|---|
| **Calculation** | Producing a Value at Risk figure from historical returns |
| **Validation** | Testing, walk-forward, whether that figure was breached about as often as its confidence level implies |

It answers four questions: how large a loss is plausible, which holdings drive the
risk, whether the chosen model is well calibrated, and what a specified adverse
scenario would do to the portfolio.

## Current status

Phase 1 of 7 is complete: the responsive Institutional Midnight dashboard, running on
deterministic simulated data.

| Phase | Scope | Status |
|---|---|---|
| 1 | Institutional Midnight UI, deterministic mock data | **Done** |
| 2 | FastAPI backend, schemas, validation, demo-data generator | **Done** |
| 3 | Core risk analysis: VaR, ES, correlation, concentration, risk contribution | Not started |
| 4 | Walk-forward backtesting and the Kupiec test | Not started |
| 5 | Stress testing, including historical scenarios | Not started |
| 6 | Reporting and CSV export | Not started |
| 7 | Research report, documentation, deployment | Not started |

The numbers on screen today come from `frontend/lib/mock/demo-analysis.ts`, a
throwaway module that exists only so the interface could be designed and reviewed
before any numerical backend was written. It is deleted in Phase 3 and replaced by
output from the Python engine. It carries none of the unit tests the real engine
requires, and nothing in it should be treated as a reference implementation.

## Stack

**Frontend** — Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Recharts,
local shadcn-style components, Vitest + React Testing Library.

**Backend** (from Phase 2) — Python 3.11+, FastAPI, Pydantic, pandas, NumPy, pytest.

Two deliberate choices worth flagging:

- **SciPy is a test-only dependency.** The two statistical functions this project needs
  have closed forms in the standard library: the chi-squared survival function with one
  degree of freedom is `math.erfc(sqrt(LR/2))`, and normal quantiles come from
  `statistics.NormalDist`. SciPy is kept in the test suite as an independent oracle to
  verify those implementations, which is stronger evidence of correctness than calling
  SciPy directly would be — and keeps the deployed bundle small enough for a free
  serverless tier.
- **Field names are camelCase**, not the snake_case shown in PRD 16.3. The backend will
  emit camelCase through a Pydantic alias generator so one convention holds end to end
  and no mapping layer is needed.

## Running it

Requires Node.js 20.9+ and Python 3.11+.

### Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run test` | Vitest suite |
| `npm run lint` | ESLint (Next.js 16 removed `next lint`; `next build` no longer lints) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run verify` | All four, in order |

### Backend

Dependencies are managed with [uv](https://docs.astral.sh/uv/), which writes a
lockfile so a clean clone resolves to the same versions.

```bash
uv sync --directory backend --all-groups
uv run --directory backend uvicorn app.main:app --reload --port 8000
```

| Command | Purpose |
|---|---|
| `uv run --directory backend pytest` | Test suite |
| `uv run --directory backend ruff check .` | Lint |
| `uv run --directory backend ruff format .` | Format |

Without uv, `python -m venv .venv` followed by `pip install -e "backend[dev]"`
works too; uv is a convenience, not a requirement.

### Regenerating the demonstration dataset

```bash
uv run --directory backend python scripts/generate_demo_data.py
```

Writes `market_data.csv`, `portfolio.csv` and `manifest.json` into
`frontend/public/demo/`. The manifest records the seed and a SHA-256 of each
file, so regeneration can be *verified* identical rather than assumed:
re-running the command must leave the checksums unchanged.

## Conventions

These are fixed across the codebase and stated in the UI next to every result:

- Returns are **logarithmic**; the portfolio return is the weighted sum under fixed weights.
- All rates and risk figures are **decimals** in data, formatted as percentages only at
  the point of display.
- Losses, VaR and Expected Shortfall are **positive magnitudes**. Drawdown is negative.
- Volatility is annualised on a **252-trading-day** convention.
- Empirical quantiles use **linear interpolation** between order statistics.
- A metric that cannot be computed is `null`, never `0`.
- Backtesting is **walk-forward**: each forecast uses only observations strictly before
  its test date.

## What it deliberately does not do

No price prediction, no buy/sell/hold recommendations, no portfolio optimisation in the
MVP, no brokerage connectivity, no order placement, no authentication, no gamification.
A Kupiec PASS is reported as "not statistically inconsistent with the target rate",
never as proof that a model is correct, and no portfolio is ever labelled "safe".

## Known advisories

`npm audit` reports 12 high-severity findings. All of them are transitive
development or build-time dependencies, and `npm audit fix --force` "resolves"
them by downgrading Next.js to 9.3.3 — a change that would destroy the project.
They are therefore accepted deliberately, and reviewed again whenever
dependencies are bumped:

| Chain | Reaches production? | Reasoning |
|---|---|---|
| `eslint → minimatch → brace-expansion` | No | Lint tooling; never bundled or shipped |
| `next → postcss` | No | Runs at build time only |
| `next → sharp` (libvips CVEs) | No | Only used by `next/image`, which this project uses zero times |

Next.js 16.2.12 is the current stable release, and the advisory covers every
version up to `16.3.0-preview.7`, so there is nothing to upgrade to yet.

## Licence and data

The bundled dataset is synthetic and generated from seed 42. When real market data is
introduced, its source, retrieval date, licence terms, adjustment method and cleaning
decisions will be recorded in `data/DATA_DICTIONARY.md` before use.
