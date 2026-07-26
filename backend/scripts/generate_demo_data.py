"""Generate the deterministic demonstration dataset (PRD 8.6).

Run from the repository root::

    uv run --directory backend python scripts/generate_demo_data.py

Writes three files into ``frontend/public/demo/``:

* ``market_data.csv``  - long-form daily prices, five fictional tickers + VNINDEX
* ``portfolio.csv``    - the demonstration weights
* ``manifest.json``    - seed, date range and SHA-256 of each CSV

The manifest exists so the dataset can be *frozen*: PRD 25 asks for a
reproducible project dataset, and a checksum is what turns "we regenerated it
and it looked similar" into a verifiable claim.

These are invented tickers, not real Vietnamese equities. Nothing generated
here may be presented as observed market data (PRD 0.7, 8.6).
"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

SEED = 42
START_DATE = date(2018, 1, 1)
END_DATE = date(2025, 12, 31)
BENCHMARK_TICKER = "VNINDEX"

MARKET_DRIFT = 0.00022
MARKET_VOLATILITY = 0.0092


@dataclass(frozen=True)
class DemoAsset:
    """One fictional instrument.

    ``beta`` scales its exposure to the common market factor and ``idio_vol``
    sets the size of its asset-specific noise. Together they produce the
    correlation and volatility differences PRD 8.6 asks the demo data to show.
    """

    ticker: str
    sector: str
    weight: float
    beta: float
    idio_vol: float
    start_price: float


DEMO_ASSETS: tuple[DemoAsset, ...] = (
    DemoAsset("ASSET_A", "Technology", 0.25, 1.15, 0.0110, 100.25),
    DemoAsset("ASSET_B", "Banking", 0.25, 1.30, 0.0090, 82.10),
    DemoAsset("ASSET_C", "Consumer", 0.20, 0.85, 0.0080, 54.40),
    DemoAsset("ASSET_D", "Materials", 0.15, 1.05, 0.0125, 31.75),
    DemoAsset("ASSET_E", "Retail", 0.15, 0.95, 0.0100, 47.60),
)


def business_days(start: date, end: date) -> pd.DatetimeIndex:
    """Weekdays between two dates. Vietnamese market holidays are not modelled."""
    return pd.bdate_range(start=start, end=end, freq="C", weekmask="Mon Tue Wed Thu Fri")


def volatility_scale(n: int) -> np.ndarray:
    """A slow volatility cycle plus two stress windows.

    Without regime variation the series is a featureless drift, and the whole
    point of the model-audit phase — comparing a static model against an
    adaptive one — has nothing to bite on.
    """
    t = np.arange(n)
    cycle = 1.0 + 0.35 * np.sin((t / n) * np.pi * 4)
    scale = cycle.copy()
    scale[int(n * 0.22) : int(n * 0.28)] *= 2.8
    scale[int(n * 0.63) : int(n * 0.71)] *= 2.2
    return scale


def generate_market_data(seed: int = SEED) -> pd.DataFrame:
    """Build the long-form price table."""
    dates = business_days(START_DATE, END_DATE)
    n = len(dates)
    rng = np.random.default_rng(seed)
    scale = volatility_scale(n)

    market_returns = MARKET_DRIFT + rng.standard_normal(n) * MARKET_VOLATILITY * scale

    records: list[pd.DataFrame] = []

    for asset in DEMO_ASSETS:
        idiosyncratic = rng.standard_normal(n) * asset.idio_vol * scale
        returns = asset.beta * market_returns + idiosyncratic
        prices = asset.start_price * np.exp(np.cumsum(returns))
        # Volume is decorative: it is not used by any calculation, but the PRD
        # schema allows the column and a realistic file should carry it.
        volume = rng.integers(400_000, 2_500_000, size=n)

        records.append(
            pd.DataFrame(
                {
                    "date": dates,
                    "ticker": asset.ticker,
                    "close": np.round(prices, 2),
                    "volume": volume,
                    "sector": asset.sector,
                }
            )
        )

    benchmark_prices = 960.99 * np.exp(np.cumsum(market_returns))
    records.append(
        pd.DataFrame(
            {
                "date": dates,
                "ticker": BENCHMARK_TICKER,
                "close": np.round(benchmark_prices, 2),
                "volume": 0,
                "sector": "Benchmark",
            }
        )
    )

    frame = pd.concat(records, ignore_index=True)
    frame = frame.sort_values(["date", "ticker"]).reset_index(drop=True)
    frame["date"] = frame["date"].dt.strftime("%Y-%m-%d")
    return frame


def generate_portfolio() -> pd.DataFrame:
    """The demonstration weights (PRD 8.2). They sum to exactly 1."""
    return pd.DataFrame(
        {
            "ticker": [a.ticker for a in DEMO_ASSETS],
            "weight": [a.weight for a in DEMO_ASSETS],
            "sector": [a.sector for a in DEMO_ASSETS],
        }
    )


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    default_output = Path(__file__).resolve().parents[2] / "frontend" / "public" / "demo"

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=default_output)
    parser.add_argument("--seed", type=int, default=SEED)
    args = parser.parse_args()

    output_dir: Path = args.output
    output_dir.mkdir(parents=True, exist_ok=True)

    market = generate_market_data(args.seed)
    portfolio = generate_portfolio()

    market_path = output_dir / "market_data.csv"
    portfolio_path = output_dir / "portfolio.csv"

    # newline="" keeps the checksum stable across platforms; without it Windows
    # would write CRLF and produce a different digest from CI.
    market.to_csv(market_path, index=False, lineterminator="\n")
    portfolio.to_csv(portfolio_path, index=False, lineterminator="\n")

    manifest = {
        "generator": "backend/scripts/generate_demo_data.py",
        "seed": args.seed,
        "isSimulated": True,
        "description": (
            "Deterministic synthetic price series. Fictional tickers. "
            "Not observed Vietnamese market data."
        ),
        "startDate": START_DATE.isoformat(),
        "endDate": END_DATE.isoformat(),
        "tradingDays": int(market["date"].nunique()),
        "tickers": [a.ticker for a in DEMO_ASSETS] + [BENCHMARK_TICKER],
        "files": {
            "market_data.csv": sha256_of(market_path),
            "portfolio.csv": sha256_of(portfolio_path),
        },
    }
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )

    print(f"Wrote {len(market):,} price rows to {market_path}")
    print(f"Wrote {len(portfolio)} portfolio rows to {portfolio_path}")
    print(f"Trading days: {manifest['tradingDays']:,}   seed: {args.seed}")


if __name__ == "__main__":
    main()
