"""API surface tests."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import __version__
from app.main import app


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


class TestHealth:
    def test_returns_ok_and_the_application_version(self, client: TestClient) -> None:
        response = client.get("/api/v1/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok", "version": __version__}


class TestSurfaceArea:
    def test_no_analytical_endpoints_are_published_yet(self, client: TestClient) -> None:
        # Publishing /analyse before the calculations exist would mean serving
        # placeholder numbers, which PRD 0.7 forbids. These arrive with Phase 3.
        paths = set(app.openapi()["paths"])
        assert paths == {"/api/v1/health"}

    def test_unknown_route_returns_404(self, client: TestClient) -> None:
        assert client.get("/api/v1/analyse").status_code == 404
