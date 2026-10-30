"""Fetch the real demonstration dataset from Vietcap and freeze it.

Run from the repository root::

    uv run --directory backend python scripts/fetch_market_data.py

Writes three files into ``frontend/public/demo/``:

* ``market_data.csv``  - long-form daily adjusted closes, five HOSE stocks + VNINDEX
* ``portfolio.csv``    - the demonstration weights
* ``manifest.json``    - source, retrieval date, period, tickers and SHA-256 of each CSV

Source
------
Vietcap's chart endpoint (``POST /api/chart/OHLCChart/gap-chart``). It is an
undocumented public endpoint, used here for non-commercial educational research;
its terms are not formally published. Closes are returned already adjusted for
dividends and splits, and are used as supplied — no adjustment is applied here.

The request is frozen at ``TO_TIMESTAMP`` so that a re-run asks for exactly the
same window. That makes the fetch as deterministic as the source allows, but no
more: the provider can revise history or re-base its adjustments at any time.
That is why the committed CSVs, not this script, are the dataset of record, and
why CI verifies them against the checksums in ``manifest.json``
(``scripts/verify_demo_data.py``) rather than re-fetching.

Sanity checks
-------------
Each series is checked before anything is written, and the script exits
non-zero if any check fails:

* non-positive or non-finite prices, and duplicate dates;
* daily |log return| above 7.5% (HOSE's daily limit is ±7%, so a larger move in
  an adjusted series points to a bad print or a missed corporate action);
* gaps of more than 15 calendar days between consecutive trading days (Tet is
  the longest regular closure, at roughly nine or ten days).

Only the standard library is used for the network call, so this adds no
runtime dependency.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import math
import sys
import time
import urllib.request
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from itertools import pairwise
from pathlib import Path

from scripts.verify_demo_data import sha256_of

ENDPOINT = "https://trading.vietcap.com.vn/api/chart/OHLCChart/gap-chart"

START_DATE = date(2015, 1, 1)
END_DATE = date(2026, 10, 29)
#: 2026-10-30 00:00 UTC. Frozen so a re-run requests the identical window.
TO_TIMESTAMP = int(datetime(2026, 10, 30, tzinfo=UTC).timestamp())
#: Enough daily bars to reach well before START_DATE.
COUNT_BACK = 5000

BENCHMARK_TICKER = "VNINDEX"
BENCHMARK_SECTOR = "Benchmark"

#: Vietnam is UTC+7 with no daylight saving. Bars are stamped at 00:00 UTC,
#: but converting in local time keeps the date right even if that changes.
VIETNAM_OFFSET = timedelta(hours=7)

MAX_ABS_LOG_RETURN = 0.075
MAX_GAP_CALENDAR_DAYS = 15
PRICE_DECIMALS = 2
REQUEST_PAUSE_SECONDS = 1.0

ADJUSTMENT_NOTE = "adjusted close as provided by Vietcap"


@dataclass(frozen=True)
class Holding:
    ticker: str
    weight: float
    sector: str


PORTFOLIO: tuple[Holding, ...] = (
    Holding("FPT", 0.25, "Technology"),
    Holding("VCB", 0.25, "Banking"),
    Holding("HPG", 0.20, "Materials"),
    Holding("MWG", 0.15, "Retail"),
    Holding("VNM", 0.15, "Consumer"),
)


@dataclass(frozen=True)
class Bar:
    day: date
    close: float
    volume: int


class DataQualityError(RuntimeError):
    """A fetched series failed a sanity check. Nothing is written."""


def fetch_symbol(symbol: str) -> list[Bar]:
    """Request the daily history for one symbol and return it oldest first."""
    body = json.dumps(
        {
            "timeFrame": "ONE_DAY",
            "symbols": [symbol],
            "to": TO_TIMESTAMP,
            "countBack": COUNT_BACK,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        ENDPOINT,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        raw = response.read()

    # The endpoint gzips its body whether or not the client asked for it, and
    # urllib does not decompress transparently.
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)

    payload = json.loads(raw.decode("utf-8"))
    if not isinstance(payload, list) or len(payload) != 1:
        raise DataQualityError(f"{symbol}: unexpected response shape")
    series = payload[0]
    if series.get("symbol") != symbol:
        raise DataQualityError(f"{symbol}: response is for {series.get('symbol')!r}")

    closes, volumes, stamps = series["c"], series["v"], series["t"]
    if not len(closes) == len(volumes) == len(stamps):
        raise DataQualityError(f"{symbol}: arrays have different lengths")

    bars = [
        Bar(
            day=(datetime.fromtimestamp(int(t), tz=UTC) + VIETNAM_OFFSET).date(),
            close=float(c),
            volume=int(v) if v is not None else 0,
        )
        for c, v, t in zip(closes, volumes, stamps, strict=True)
    ]
    bars.sort(key=lambda bar: bar.day)
    return bars


def in_period(bars: list[Bar]) -> list[Bar]:
    return [bar for bar in bars if START_DATE <= bar.day <= END_DATE]


def check_series(symbol: str, bars: list[Bar]) -> list[str]:
    """Return every problem found in one series. Empty means it passed."""
    problems: list[str] = []

    if not bars:
        return [f"{symbol}: no observations in {START_DATE} .. {END_DATE}"]

    if bars[0].day - START_DATE > timedelta(days=MAX_GAP_CALENDAR_DAYS):
        problems.append(f"{symbol}: history starts late, on {bars[0].day}")
    if END_DATE - bars[-1].day > timedelta(days=MAX_GAP_CALENDAR_DAYS):
        problems.append(f"{symbol}: history ends early, on {bars[-1].day}")

    seen: set[date] = set()
    for bar in bars:
        if bar.day in seen:
            problems.append(f"{symbol}: duplicate date {bar.day}")
        seen.add(bar.day)
        if not math.isfinite(bar.close) or bar.close <= 0:
            problems.append(f"{symbol}: non-positive price {bar.close} on {bar.day}")
        if bar.day.weekday() >= 5:
            problems.append(f"{symbol}: weekend date {bar.day}")

    for previous, current in pairwise(bars):
        gap = (current.day - previous.day).days
        if gap > MAX_GAP_CALENDAR_DAYS:
            problems.append(f"{symbol}: {gap}-day gap between {previous.day} and {current.day}")
        if previous.close > 0 and current.close > 0:
            move = math.log(current.close / previous.close)
            if abs(move) > MAX_ABS_LOG_RETURN:
                problems.append(
                    f"{symbol}: log return {move:+.2%} on {current.day} "
                    f"({previous.close} -> {current.close})"
                )

    return problems


def format_price(value: float) -> str:
    """Round to two decimals and drop trailing zeros: 56100.0 -> '56100'."""
    text = f"{round(value, PRICE_DECIMALS):.{PRICE_DECIMALS}f}"
    return text.rstrip("0").rstrip(".")


def write_market_csv(path: Path, series: dict[str, list[Bar]]) -> int:
    sectors = {h.ticker: h.sector for h in PORTFOLIO} | {BENCHMARK_TICKER: BENCHMARK_SECTOR}
    rows = sorted(
        (bar.day.isoformat(), ticker, format_price(bar.close), bar.volume, sectors[ticker])
        for ticker, bars in series.items()
        for bar in bars
    )
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["date", "ticker", "close", "volume", "sector"])
    writer.writerows(rows)
    path.write_bytes(buffer.getvalue().encode("utf-8"))
    return len(rows)


def write_portfolio_csv(path: Path) -> None:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["ticker", "weight", "sector"])
    writer.writerows((h.ticker, h.weight, h.sector) for h in PORTFOLIO)
    path.write_bytes(buffer.getvalue().encode("utf-8"))


def main() -> None:
    default_output = Path(__file__).resolve().parents[2] / "frontend" / "public" / "demo"

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=default_output)
    args = parser.parse_args()

    symbols = [h.ticker for h in PORTFOLIO] + [BENCHMARK_TICKER]
    series: dict[str, list[Bar]] = {}
    problems: list[str] = []

    for index, symbol in enumerate(symbols):
        if index:
            time.sleep(REQUEST_PAUSE_SECONDS)
        bars = in_period(fetch_symbol(symbol))
        series[symbol] = bars
        found = check_series(symbol, bars)
        problems.extend(found)
        first, last = (bars[0].day, bars[-1].day) if bars else (None, None)
        status = "ok" if not found else f"{len(found)} problem(s)"
        print(f"{symbol:<8} {len(bars):>5} days  {first} .. {last}  {status}")

    if problems:
        print("\nSanity checks failed; nothing was written:", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        raise SystemExit(1)

    common_days = set.intersection(*(set(b.day for b in bars) for bars in series.values()))
    all_days = set().union(*(set(b.day for b in bars) for bars in series.values()))

    output_dir: Path = args.output
    output_dir.mkdir(parents=True, exist_ok=True)
    market_path = output_dir / "market_data.csv"
    portfolio_path = output_dir / "portfolio.csv"

    row_count = write_market_csv(market_path, series)
    write_portfolio_csv(portfolio_path)

    manifest = {
        "generator": "backend/scripts/fetch_market_data.py",
        "isSimulated": False,
        "description": (
            "Real historical daily closes for five HOSE-listed stocks and the "
            "VN-Index, frozen at retrieval and checksummed."
        ),
        "source": {
            "provider": "Vietcap",
            "url": ENDPOINT,
            "method": "POST",
            "request": {"timeFrame": "ONE_DAY", "to": TO_TIMESTAMP, "countBack": COUNT_BACK},
            "terms": (
                "Undocumented public endpoint; used for non-commercial educational "
                "research; terms not formally published."
            ),
        },
        "retrievalDate": datetime.now(tz=UTC).date().isoformat(),
        "adjustment": ADJUSTMENT_NOTE,
        "startDate": START_DATE.isoformat(),
        "endDate": END_DATE.isoformat(),
        "firstObservation": min(common_days).isoformat(),
        "lastObservation": max(common_days).isoformat(),
        "tradingDays": len(common_days),
        "datesDroppedByAlignment": len(all_days) - len(common_days),
        "tickers": symbols,
        "benchmark": BENCHMARK_TICKER,
        "files": {
            "market_data.csv": sha256_of(market_path),
            "portfolio.csv": sha256_of(portfolio_path),
        },
    }
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n"
    )

    print(f"\nWrote {row_count:,} price rows to {market_path}")
    print(
        f"Common trading days: {len(common_days):,}  "
        f"(dropped by alignment: {manifest['datesDroppedByAlignment']})"
    )


if __name__ == "__main__":
    main()
