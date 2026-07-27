"""Vercel Python serverless entry point.

Vercel exposes any ASGI or WSGI application assigned to `app` in a module under
`api/`. This re-exports the FastAPI application so the engine is served from the
same origin as the site, which removes CORS from production entirely.

The `backend` directory is added to the import path because the application code
deliberately lives outside `api/` — it is a library that the API, the precompute
script and the test suite all drive, and burying it in a deployment adapter
would tie it to one host.

Only the *upload* path reaches this function. The demonstration the site loads
by default is precomputed and served as static JSON, so a cold start here never
delays a first-time visitor.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.main import app  # noqa: E402  (path must be set before this import)

__all__ = ["app"]
