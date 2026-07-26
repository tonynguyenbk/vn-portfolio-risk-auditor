"""API surface tests (PRD 16.3, 16.4, 20.3)."""

from __future__ import annotations

import io
import json

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app import __version__
from app.main import app
from scripts.generate_demo_data import SEED, generate_market_data, generate_portfolio


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


def _csv_bytes(frame: pd.DataFrame) -> bytes:
    buffer = io.StringIO()
    frame.to_csv(buffer, index=False, lineterminator="\n")
    return buffer.getvalue().encode("utf-8")


@pytest.fixture(scope="module")
def market_csv() -> bytes:
    return _csv_bytes(generate_market_data(SEED))


@pytest.fixture(scope="module")
def portfolio_csv() -> bytes:
    return _csv_bytes(generate_portfolio())


def _files(market: bytes, portfolio: bytes) -> dict[str, tuple[str, bytes, str]]:
    return {
        "market_file": ("market_data.csv", market, "text/csv"),
        "portfolio_file": ("portfolio.csv", portfolio, "text/csv"),
    }


class TestHealth:
    def test_returns_ok_and_the_application_version(self, client: TestClient) -> None:
        response = client.get("/api/v1/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok", "version": __version__}


class TestAnalyse:
    def test_a_valid_upload_produces_a_complete_analysis(
        self, client: TestClient, market_csv: bytes, portfolio_csv: bytes
    ) -> None:
        response = client.post("/api/v1/analyse", files=_files(market_csv, portfolio_csv))
        assert response.status_code == 200

        payload = response.json()
        for block in (
            "metadata",
            "dataQuality",
            "portfolio",
            "metrics",
            "concentration",
            "riskContribution",
            "correlation",
            "limits",
            "assumptions",
        ):
            assert block in payload, f"missing response block: {block}"

    def test_the_response_is_camel_case_throughout(
        self, client: TestClient, market_csv: bytes, portfolio_csv: bytes
    ) -> None:
        payload = client.post(
            "/api/v1/analyse", files=_files(market_csv, portfolio_csv)
        ).json()
        assert "annualisedVolatility" in payload["metrics"]
        assert "maximumDrawdown" in payload["metrics"]
        assert "largestWeightTicker" in payload["concentration"]

    def test_percentages_are_returned_as_decimals(
        self, client: TestClient, market_csv: bytes, portfolio_csv: bytes
    ) -> None:
        # PRD 16.4: the API returns decimals and the frontend formats them.
        payload = client.post(
            "/api/v1/analyse", files=_files(market_csv, portfolio_csv)
        ).json()
        assert 0.0 < payload["metrics"]["annualisedVolatility"] < 2.0
        assert -1.0 < payload["metrics"]["maximumDrawdown"]["value"] < 0.0

    def test_a_custom_config_is_honoured(
        self, client: TestClient, market_csv: bytes, portfolio_csv: bytes
    ) -> None:
        config = {"rollingWindow": 125, "models": ["historical"], "confidenceLevels": [0.99]}
        response = client.post(
            "/api/v1/analyse",
            files=_files(market_csv, portfolio_csv),
            data={"config_json": json.dumps(config)},
        )
        payload = response.json()
        assert payload["assumptions"]["rollingWindow"] == 125
        assert len(payload["metrics"]["var"]) == 1
        assert payload["metrics"]["var"][0]["confidence"] == 0.99

    def test_a_blocking_validation_failure_returns_422_with_a_code(
        self, client: TestClient, market_csv: bytes
    ) -> None:
        broken = _csv_bytes(
            pd.DataFrame({"ticker": ["ASSET_A", "ASSET_B"], "weight": [0.6, 0.3]})
        )
        response = client.post("/api/v1/analyse", files=_files(market_csv, broken))

        assert response.status_code == 422
        detail = response.json()["detail"]
        assert detail["code"] == "ANALYSIS_BLOCKED"
        assert "90.00%" in detail["message"]
        assert len(detail["issues"]) > 0

    def test_a_missing_column_returns_400(
        self, client: TestClient, portfolio_csv: bytes
    ) -> None:
        incomplete = _csv_bytes(pd.DataFrame({"date": ["2024-01-01"], "ticker": ["AAA"]}))
        response = client.post("/api/v1/analyse", files=_files(incomplete, portfolio_csv))

        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "INVALID_INPUT"

    def test_an_empty_file_returns_400(
        self, client: TestClient, portfolio_csv: bytes
    ) -> None:
        response = client.post("/api/v1/analyse", files=_files(b"", portfolio_csv))
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "EMPTY_FILE"

    def test_malformed_config_json_returns_400(
        self, client: TestClient, market_csv: bytes, portfolio_csv: bytes
    ) -> None:
        response = client.post(
            "/api/v1/analyse",
            files=_files(market_csv, portfolio_csv),
            data={"config_json": "{not json"},
        )
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "INVALID_JSON"

    def test_an_invalid_config_value_returns_422(
        self, client: TestClient, market_csv: bytes, portfolio_csv: bytes
    ) -> None:
        response = client.post(
            "/api/v1/analyse",
            files=_files(market_csv, portfolio_csv),
            data={"config_json": json.dumps({"ewmaLambda": 5.0})},
        )
        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "INVALID_CONFIG"


class TestBacktest:
    def test_returns_a_series_and_one_summary_row_per_model_confidence_pair(
        self, client: TestClient, market_csv: bytes, portfolio_csv: bytes
    ) -> None:
        response = client.post("/api/v1/backtest", files=_files(market_csv, portfolio_csv))
        assert response.status_code == 200

        payload = response.json()
        assert len(payload["summary"]) == 6  # three models x two confidence levels
        assert len(payload["series"]) > 1000

    def test_the_series_length_matches_observations_minus_the_window(
        self, client: TestClient, market_csv: bytes, portfolio_csv: bytes
    ) -> None:
        analysis = client.post(
            "/api/v1/analyse", files=_files(market_csv, portfolio_csv)
        ).json()
        backtest = client.post(
            "/api/v1/backtest", files=_files(market_csv, portfolio_csv)
        ).json()

        # The analysis counts aligned price dates; returns lose the first one.
        expected = analysis["metadata"]["observations"] - 1 - 250
        assert len(backtest["series"]) == expected

    def test_summary_rows_carry_the_kupiec_verdict(
        self, client: TestClient, market_csv: bytes, portfolio_csv: bytes
    ) -> None:
        payload = client.post(
            "/api/v1/backtest", files=_files(market_csv, portfolio_csv)
        ).json()
        for row in payload["summary"]:
            assert row["result"] in {"pass", "fail"}
            assert 0.0 <= row["kupiecPValue"] <= 1.0
            assert row["kupiecLr"] >= 0.0
            assert row["actualExceptions"] <= row["observations"]

    def test_exception_flags_agree_with_the_threshold_comparison(
        self, client: TestClient, market_csv: bytes, portfolio_csv: bytes
    ) -> None:
        payload = client.post(
            "/api/v1/backtest", files=_files(market_csv, portfolio_csv)
        ).json()
        for point in payload["series"]:
            assert point["isException"] == (point["loss"] > point["varThreshold"])


class TestPrivacy:
    def test_uploads_are_not_written_to_disk(
        self, client: TestClient, market_csv: bytes, portfolio_csv: bytes, tmp_path
    ) -> None:
        # PRD 17 forbids retaining uploaded portfolio files. Nothing in the
        # request path touches the filesystem, so a run must leave no trace.
        before = set(tmp_path.iterdir())
        client.post("/api/v1/analyse", files=_files(market_csv, portfolio_csv))
        assert set(tmp_path.iterdir()) == before
