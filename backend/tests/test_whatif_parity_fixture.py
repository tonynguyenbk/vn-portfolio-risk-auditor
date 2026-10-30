"""The committed What-if parity fixture must match what the engine produces now.

The frontend parity test compares ``lib/what-if.ts`` against
``frontend/tests/fixtures/whatif-parity.json``. If the engine changed and the
fixture were not regenerated, that test would keep passing against stale
numbers; this one fails instead.
"""

from __future__ import annotations

import json

import numpy as np

from scripts.whatif_parity_fixture import build_payload, default_output


def _assert_close(expected: object, actual: object, path: str = "") -> None:
    if isinstance(expected, dict):
        assert isinstance(actual, dict), path
        assert expected.keys() == actual.keys(), path
        for key in expected:
            _assert_close(expected[key], actual[key], f"{path}.{key}")
    elif isinstance(expected, list):
        assert isinstance(actual, list) and len(expected) == len(actual), path
        for index, (e, a) in enumerate(zip(expected, actual, strict=True)):
            _assert_close(e, a, f"{path}[{index}]")
    elif isinstance(expected, float):
        assert np.isclose(expected, actual, rtol=1e-12, atol=1e-15), path
    else:
        assert expected == actual, path


def test_committed_fixture_is_current() -> None:
    committed = json.loads(default_output().read_text(encoding="utf-8"))
    _assert_close(build_payload(), committed)


def test_fixture_exercises_the_cases_it_claims() -> None:
    payload = build_payload()
    # Three CCC gaps are dropped for every asset; the duplicate and the zero
    # price are removed before alignment.
    assert payload["alignedObservations"] == 257
    assert payload["returnObservations"] == 256

    for case in payload["cases"]:
        expected = case["expected"]
        assert expected["expectedShortfall"] >= expected["var"]
        if case["equityFraction"] == 0:
            assert expected["riskContribution"] is None
        else:
            total = sum(row["contribution"] for row in expected["riskContribution"])
            assert np.isclose(total, expected["portfolioVolatilityDaily"])
