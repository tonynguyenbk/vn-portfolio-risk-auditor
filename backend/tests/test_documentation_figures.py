"""Documentation figures must match the artefacts they describe.

Written after a real failure. The README, the methodology and the research
outline all quote headline numbers, and several of them were still the values
produced by the Phase 1 TypeScript mock — a module deleted three phases earlier.
They looked entirely plausible, nothing referenced them, and no test touched
them, so they survived every check the project had.

That failure mode matters more here than in most projects: these documents feed
a research paper, and a wrong number in a paper is worse than a wrong number in
code, because nobody runs a paper.

So the numbers are asserted against the JSON the dashboard actually imports.
Regenerate the analysis and these fail, pointing at the prose that needs
updating. That is the intended behaviour, not an inconvenience.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
DEMO = REPO_ROOT / "frontend" / "public" / "demo"


def _load(name: str) -> dict:
    return json.loads((DEMO / name).read_text(encoding="utf-8"))


def _read(relative: str) -> str:
    return (REPO_ROOT / relative).read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def analysis() -> dict:
    return _load("analysis.json")


@pytest.fixture(scope="module")
def backtest() -> dict:
    return _load("backtest.json")


@pytest.fixture(scope="module")
def stress() -> dict:
    return _load("stress.json")


def _pct(value: float, digits: int = 2) -> str:
    """Format the way the documents do: 0.2463 -> '24.63%'."""
    return f"{value * 100:.{digits}f}%"


def _var(analysis: dict, model: str, confidence: float) -> float:
    return next(
        e["value"]
        for e in analysis["metrics"]["var"]
        if e["model"] == model and e["confidence"] == confidence
    )


def _es(analysis: dict, confidence: float) -> float:
    return next(
        e["value"]
        for e in analysis["metrics"]["expectedShortfall"]
        if e["confidence"] == confidence
    )


class TestHeadlineMetrics:
    """Figures quoted in prose, checked against the payload."""

    @pytest.mark.parametrize(
        "document",
        ["docs/research-report-outline.md"],
    )
    def test_volatility_and_drawdown_are_current(
        self, analysis: dict, document: str
    ) -> None:
        text = _read(document)
        volatility = _pct(analysis["metrics"]["annualisedVolatility"])
        drawdown = _pct(abs(analysis["metrics"]["maximumDrawdown"]["value"]))

        assert volatility in text, (
            f"{document} does not quote the current volatility {volatility}"
        )
        assert drawdown in text, (
            f"{document} does not quote the current drawdown {drawdown}"
        )

    @pytest.mark.parametrize(
        "document",
        ["README.md", "docs/demo-script.md", "docs/research-report-outline.md"],
    )
    def test_var_and_expected_shortfall_are_current(
        self, analysis: dict, document: str
    ) -> None:
        text = _read(document)
        var95 = _pct(_var(analysis, "historical", 0.95))
        es95 = _pct(_es(analysis, 0.95))

        assert var95 in text, f"{document} quotes a stale VaR 95%; current value is {var95}"
        assert es95 in text, f"{document} quotes a stale ES 95%; current value is {es95}"

    def test_no_document_still_quotes_the_deleted_mock_figures(self) -> None:
        # The specific values the Phase 1 TypeScript mock produced. They no
        # longer correspond to anything and must not reappear.
        retired = ["23.72%", "43.73%", "2.16%", "3.53%"]
        for document in (
            "README.md",
            "docs/methodology.md",
            "docs/limitations.md",
            "docs/architecture.md",
            "docs/demo-script.md",
            "docs/research-report-outline.md",
        ):
            text = _read(document)
            for value in retired:
                assert value not in text, (
                    f"{document} still quotes {value}, a figure from the deleted "
                    "Phase 1 mock rather than from the engine"
                )


class TestBacktestTable:
    def test_the_readme_table_matches_every_summary_row(
        self, analysis: dict, backtest: dict
    ) -> None:
        text = _read("README.md")

        for row in backtest["summary"]:
            assert str(row["actualExceptions"]) in text, (
                f"README omits the exception count {row['actualExceptions']} for "
                f"{row['model']} at {row['confidence']:.0%}"
            )
            assert _pct(row["exceptionRate"]) in text, (
                f"README quotes a stale exception rate for {row['model']} at "
                f"{row['confidence']:.0%}; current value is {_pct(row['exceptionRate'])}"
            )

    def test_the_test_day_count_is_current(self, backtest: dict) -> None:
        observations = backtest["summary"][0]["observations"]
        formatted = f"{observations:,}"
        for document in ("README.md", "docs/methodology.md", "docs/demo-script.md"):
            assert formatted in _read(document), (
                f"{document} does not quote the current backtest length {formatted}"
            )

    def test_every_summary_row_is_scored_over_the_same_period(
        self, backtest: dict
    ) -> None:
        assert len({row["observations"] for row in backtest["summary"]}) == 1


class TestStressScenarios:
    def test_the_readme_table_matches_the_precomputed_scenarios(
        self, stress: dict
    ) -> None:
        text = _read("README.md")

        for scenario in stress["scenarios"]:
            impact = _pct(abs(scenario["portfolioImpact"]))
            assert impact in text, (
                f"README quotes a stale impact for '{scenario['label']}'; "
                f"current value is {impact}"
            )
            assert scenario["periodStart"] in text
            assert scenario["periodEnd"] in text
