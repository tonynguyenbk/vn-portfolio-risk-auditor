"""Runtime configuration.

Kept to environment variables only. PRD 17 rules out a database, and the app
holds no secrets, so there is nothing here that needs a settings store.
"""

from __future__ import annotations

import os
from functools import lru_cache

DEFAULT_DEV_ORIGINS = ("http://localhost:3000", "http://127.0.0.1:3000")


@lru_cache
def allowed_origins() -> tuple[str, ...]:
    """Origins permitted to call the API.

    PRD 16.4 requires CORS to be scoped to the origins actually needed rather
    than opened to everything. In production the frontend is served from the
    same origin as the API, so this list only matters for local development and
    for any preview deployment listed in ``ALLOWED_ORIGINS``.
    """
    configured = os.getenv("ALLOWED_ORIGINS", "").strip()
    if not configured:
        return DEFAULT_DEV_ORIGINS
    return tuple(origin.strip() for origin in configured.split(",") if origin.strip())


#: Uploaded files are processed in memory and never persisted (PRD 17).
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(8 * 1024 * 1024)))
