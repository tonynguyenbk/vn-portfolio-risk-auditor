"""Fetch the daily closes used by the exit-rule experiment.

Run from the repository root::

    uv run --project backend python research/exit_rules/fetch_data.py

Standard library only. Writes, next to this file:

* ``data.csv``      - long form: ``date,ticker,close,volume``, sorted by ticker
  then date, LF line endings
* ``manifest.json`` - source, the exact request parameters, row counts and the
  SHA-256 of ``data.csv``

The result is committed, so ``run.py`` never needs the network. Re-running this
script is *not* expected to reproduce the committed file byte for byte, even
with the frozen ``to`` timestamp: the vendor re-adjusts historical closes for
every new corporate action, so past prices drift whenever a constituent pays a
stock dividend or issues rights. The manifest's checksum is what pins the data
the published results were computed from.

Source: Vietcap's public chart endpoint. It is undocumented, unauthenticated and
may change or disappear without notice. Used here for personal, non-commercial
research only; the data is not redistributed for any other purpose.
"""

from __future__ import annotations

import hashlib
import json
import time
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

URL = "https://trading.vietcap.com.vn/api/chart/OHLCChart/gap-chart"

#: Frozen upper bound of every request: 2026-10-30 00:00 UTC. Bars carry a
#: midnight-UTC timestamp equal to their trading date, so the last bar is the
#: session of 2026-10-29.
TO = datetime(2026, 10, 30, tzinfo=UTC)

#: The endpoint's maximum look-back. It truncates the three longest histories
#: (STB, VNM, VNINDEX) to start in 2006; the experiment starts in 2012 at the
#: earliest, so nothing it uses is lost.
COUNT_BACK = 5000

#: The two indices plus the 30 VN30 constituents as of the fetch date. Using
#: *today's* members over the whole history is a survivorship bias; see
#: docs/experiments/exit-rules.md.
SYMBOLS = (
    "VN30", "VNINDEX",
    "ACB", "BCM", "BID", "BVH", "CTG", "FPT", "GAS", "GVR", "HDB", "HPG",
    "LPB", "MBB", "MSN", "MWG", "PLX", "SAB", "SHB", "SSB", "SSI", "STB",
    "TCB", "TPB", "VCB", "VHM", "VIB", "VIC", "VJC", "VNM", "VPB", "VRE",
)  # fmt: skip

HERE = Path(__file__).resolve().parent
DATA_PATH = HERE / "data.csv"
MANIFEST_PATH = HERE / "manifest.json"


def fetch(symbol: str) -> list[tuple[str, str, float, int]]:
    """Return ``(date, ticker, close, volume)`` rows for one symbol."""
    body = json.dumps(
        {
            "timeFrame": "ONE_DAY",
            "symbols": [symbol],
            "to": int(TO.timestamp()),
            "countBack": COUNT_BACK,
        }
    ).encode()
    request = urllib.request.Request(
        URL,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read())
    if not payload:
        raise RuntimeError(f"{symbol}: empty response")
    bars = payload[0]
    rows = []
    for stamp, close, volume in zip(bars["t"], bars["c"], bars["v"], strict=True):
        day = datetime.fromtimestamp(int(stamp), tz=UTC).date().isoformat()
        rows.append((day, symbol, float(close), int(volume)))
    return rows


def main() -> None:
    rows: list[tuple[str, str, float, int]] = []
    counts: dict[str, int] = {}
    for i, symbol in enumerate(SYMBOLS):
        if i:
            time.sleep(1.0)  # be polite to an endpoint we do not own
        got = fetch(symbol)
        counts[symbol] = len(got)
        print(f"{symbol:8s} {len(got):5d} rows  {got[0][0]} .. {got[-1][0]}")
        rows.extend(got)

    rows.sort(key=lambda r: (r[1], r[0]))
    lines = ["date,ticker,close,volume"]
    lines += [f"{d},{t},{c!r},{v}" for d, t, c, v in rows]
    DATA_PATH.write_bytes(("\n".join(lines) + "\n").encode("utf-8"))

    manifest = {
        "source": "Vietcap chart endpoint (undocumented, public)",
        "url": URL,
        "request": {
            "timeFrame": "ONE_DAY",
            "to": int(TO.timestamp()),
            "toIso": TO.isoformat(),
            "countBack": COUNT_BACK,
        },
        "priceBasis": "vendor-adjusted close; indices are price indices",
        "retrievedOn": datetime.now(UTC).date().isoformat(),
        "use": "personal non-commercial research",
        "rows": len(rows),
        "rowsPerSymbol": counts,
        "files": {"data.csv": hashlib.sha256(DATA_PATH.read_bytes()).hexdigest()},
    }
    # Bytes, not text mode, so Windows does not write CRLF.
    MANIFEST_PATH.write_bytes((json.dumps(manifest, indent=2) + "\n").encode("utf-8"))
    print(f"Wrote {len(rows):,} rows to {DATA_PATH}")


if __name__ == "__main__":
    main()
