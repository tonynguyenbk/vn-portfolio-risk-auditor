"""Input validation and the data-quality report (PRD 8.5).

The guiding rule is that the analysis should refuse to run on data it cannot
support, and should say plainly what it discarded when it does run. Silent
repair is worse than a visible failure here: a forward-filled price or a
quietly dropped asset changes every risk number downstream without leaving a
trace in the output.

Structural problems — a missing column, an unparseable file — raise
:class:`DataValidationError`, because there is no meaningful report to return.
Everything else is reported through :class:`ValidationReport`, which the API
surfaces as the data-quality block of PRD 11.1.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import pandas as pd

from app.schemas.analysis import DataQualityIssue, DataStatus, Severity

REQUIRED_MARKET_COLUMNS = ("date", "ticker", "close")
REQUIRED_PORTFOLIO_COLUMNS = ("ticker", "weight")

WEIGHT_SUM_TOLERANCE = 1e-6
MIN_ASSETS = 2
MAX_ASSETS = 10
#: Above this share of discarded candidate observations the user gets a warning.
MAX_ACCEPTABLE_LOSS_FRACTION = 0.02
#: Below ``rolling_window + this`` the demonstration is thin but still permitted.
COMFORTABLE_EXTRA_OBSERVATIONS = 100


class DataValidationError(Exception):
    """Raised when the input cannot be interpreted at all."""


@dataclass
class ValidationReport:
    """Outcome of validating one market/portfolio pair."""

    status: DataStatus = DataStatus.PASS
    issues: list[DataQualityIssue] = field(default_factory=list)
    rows_removed: int = 0
    duplicate_records: int = 0
    aligned_observations: int = 0
    weight_total: float = 0.0

    @property
    def can_run(self) -> bool:
        """Whether the analysis may proceed (PRD 10.2 disables it otherwise)."""
        return self.status is not DataStatus.FAIL

    def add(self, code: str, message: str, severity: Severity) -> None:
        self.issues.append(DataQualityIssue(code=code, message=message, severity=severity))
        if severity is Severity.BREACH:
            self.status = DataStatus.FAIL
        elif self.status is DataStatus.PASS:
            self.status = DataStatus.WARNING


def require_columns(frame: pd.DataFrame, columns: tuple[str, ...], label: str) -> None:
    missing = [c for c in columns if c not in frame.columns]
    if missing:
        raise DataValidationError(
            f"{label} is missing required column(s): {', '.join(sorted(missing))}"
        )


def clean_market_frame(frame: pd.DataFrame) -> tuple[pd.DataFrame, int, int]:
    """Coerce and clean raw market rows.

    Returns the cleaned frame, the number of rows removed, and the number of
    duplicate ``(date, ticker)`` pairs found. Rows are dropped when the date is
    unparseable, the ticker is empty, or the price is non-numeric or
    non-positive — a zero or negative price cannot yield a log return.
    """
    require_columns(frame, REQUIRED_MARKET_COLUMNS, "Market data")
    original_rows = len(frame)

    cleaned = frame.copy()
    cleaned["date"] = pd.to_datetime(cleaned["date"], errors="coerce", format="mixed")
    cleaned["ticker"] = cleaned["ticker"].astype("string").str.strip().str.upper()
    cleaned["close"] = pd.to_numeric(cleaned["close"], errors="coerce")

    cleaned = cleaned[
        cleaned["date"].notna()
        & cleaned["ticker"].notna()
        & (cleaned["ticker"] != "")
        & cleaned["close"].notna()
        & (cleaned["close"] > 0)
    ]

    duplicate_mask = cleaned.duplicated(subset=["date", "ticker"], keep="first")
    duplicate_records = int(duplicate_mask.sum())
    cleaned = cleaned[~duplicate_mask]

    cleaned = cleaned.sort_values(["date", "ticker"]).reset_index(drop=True)
    rows_removed = original_rows - len(cleaned)

    return cleaned, rows_removed, duplicate_records


def validate_portfolio(
    portfolio: pd.DataFrame,
    available_tickers: set[str],
    report: ValidationReport,
) -> None:
    """Apply the portfolio rules of PRD 8.2 to ``report``."""
    require_columns(portfolio, REQUIRED_PORTFOLIO_COLUMNS, "Portfolio")

    tickers = portfolio["ticker"].astype("string").str.strip().str.upper()
    weights = pd.to_numeric(portfolio["weight"], errors="coerce")

    if weights.isna().any():
        report.add(
            "WEIGHT_NOT_NUMERIC",
            "One or more portfolio weights are not numeric.",
            Severity.BREACH,
        )
        return

    weight_total = float(weights.sum())
    report.weight_total = weight_total

    if len(portfolio) < MIN_ASSETS:
        report.add(
            "TOO_FEW_ASSETS",
            f"A portfolio needs at least {MIN_ASSETS} assets; {len(portfolio)} supplied.",
            Severity.BREACH,
        )

    if len(portfolio) > MAX_ASSETS:
        report.add(
            "TOO_MANY_ASSETS",
            f"This version supports at most {MAX_ASSETS} assets; {len(portfolio)} supplied.",
            Severity.BREACH,
        )

    if bool((weights < 0).any()):
        report.add(
            "NEGATIVE_WEIGHT",
            "Negative weights are not supported; this version is long-only.",
            Severity.BREACH,
        )

    if not math.isclose(weight_total, 1.0, abs_tol=WEIGHT_SUM_TOLERANCE):
        report.add(
            "WEIGHT_SUM",
            f"Portfolio weights total {weight_total * 100:.2f}%. "
            "Adjust them to 100% before analysis.",
            Severity.BREACH,
        )

    unknown = sorted(set(tickers) - available_tickers)
    if unknown:
        report.add(
            "TICKER_NOT_IN_MARKET_DATA",
            f"Portfolio ticker(s) absent from the market dataset: {', '.join(unknown)}.",
            Severity.BREACH,
        )


def validate_history(
    aligned_observations: int,
    candidate_observations: int,
    rolling_window: int,
    report: ValidationReport,
) -> None:
    """Check that enough aligned history survived (PRD 8.5)."""
    report.aligned_observations = aligned_observations

    if aligned_observations < rolling_window + 1:
        report.add(
            "INSUFFICIENT_HISTORY",
            f"Only {aligned_observations} aligned observations are available. "
            f"At least {rolling_window + 1} are required for a "
            f"{rolling_window}-day rolling analysis.",
            Severity.BREACH,
        )
    elif aligned_observations < rolling_window + COMFORTABLE_EXTRA_OBSERVATIONS:
        report.add(
            "THIN_HISTORY",
            f"{aligned_observations} aligned observations leaves a short backtest "
            f"sample for a {rolling_window}-day window. Results are indicative only.",
            Severity.WARNING,
        )

    if candidate_observations > 0:
        lost = candidate_observations - aligned_observations
        lost_fraction = lost / candidate_observations
        if lost_fraction > MAX_ACCEPTABLE_LOSS_FRACTION:
            report.add(
                "EXCESSIVE_ALIGNMENT_LOSS",
                f"{lost} of {candidate_observations} candidate dates "
                f"({lost_fraction * 100:.1f}%) were dropped because not every asset "
                "traded on them. Assets are aligned on their common trading dates and "
                "returns are never forward-filled.",
                Severity.WARNING,
            )
