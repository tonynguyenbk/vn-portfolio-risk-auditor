# Deployment

> **Status: verified.** Deployed 2026-08-08 to
> **https://vnportfolioriskauditor.vercel.app**. The plan this document
> originally described — a single Python function under `api/` — did not
> survive first contact: it failed with exactly the "Next.js not detected"
> error anticipated below. What shipped instead uses Vercel's Services
> feature, which was not part of the original plan. The steps below describe
> what actually worked; the discarded approach is kept as a documented failure
> mode rather than deleted, since it is now confirmed rather than anticipated.

Everything used here is free. Total running cost: nothing.

---

## What is being deployed

Two things that fail independently, by design:

| | Depends on | Consequence if it breaks |
|---|---|---|
| **The site** | Nothing at runtime | Total failure — this is the deliverable |
| **The upload API** | Python function waking | The demonstration is unaffected |

The demonstration is precomputed into static JSON and imported at build time, so
the site is genuinely static. That is what makes the risk asymmetric and the
deployment tractable: the part that must not fail has almost no way to fail.

---

## Order of work

Deploy the site first and confirm it works before touching the Python function.
The site is the deliverable; the API is a feature.

### 1. Push to GitHub

The repository must be **public** — public repositories get unlimited GitHub
Actions minutes, and the repository is itself a deliverable.

```bash
git remote add origin https://github.com/<user>/vn-portfolio-risk-auditor.git
git push -u origin main
```

Confirm the CI workflow runs and passes before continuing.

### 2. Deploy with Vercel Services

`vercel.json` at the repository root already declares two independent
services — no manual Root Directory setting is needed:

```json
{
  "services": {
    "frontend": { "root": "frontend", "framework": "nextjs" },
    "backend": { "root": "backend", "framework": "fastapi", "entrypoint": "app.main:app" }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": { "service": "backend" } },
    { "source": "/(.*)", "destination": { "service": "frontend" } }
  ]
}
```

Import the repository at [vercel.com/new](https://vercel.com/new), or deploy
from the CLI with `vercel --prod`. The Hobby plan is free and requires
non-commercial use, which an educational portfolio project satisfies. Vercel
builds each service independently and routes `/api/*` to the backend,
everything else to the frontend, on one domain — so there is no CORS in
production and no separate host to manage.

Verify: all four routes load, the metric cards show numbers, the Model Audit
table is populated, the stress scenarios appear, and:

```bash
curl https://<your-deployment>/api/v1/health
# {"status":"ok","version":"0.1.0"}
```

### What the original plan got wrong

The plan this document originally described — a single Python function at
`api/index.py`, driven by `vercel.json`'s top-level `functions` key and a
manual Root Directory override — was written before deploying, and it failed
on first contact: Vercel's Next.js detection runs against the repository
root regardless of a custom `buildCommand`, and with no `package.json` there,
it reports "No Next.js version detected" rather than building anything.

Services fixes this by giving each half of the app its own root, built
independently, instead of forcing one Root Directory setting to cover a
Next.js app in `frontend/` and a Python function elsewhere. `api/index.py` —
the `sys.path` adapter that let the old approach import `backend/app` from
under `api/` — is no longer needed and has been deleted; the backend service
imports `app.main:app` directly, rooted at `backend/`.

**Things that plausibly still go wrong**

| Symptom | Likely cause |
|---|---|
| Next.js not detected | Reverted to the old `functions`-based `vercel.json` without a per-service root |
| `ModuleNotFoundError: app` | The backend service's `root` isn't `backend/`, or `entrypoint` isn't `app.main:app` |
| Function exceeds size limit | Unlikely — measured at 79 MB against 250 MB — but see the open issue below |
| 404 on `/api/v1/health` | The rewrite not matching; check `rewrites` in `vercel.json` |
| Timeout on first request | Cold start |

**Open issue, not yet resolved.** The deployed backend service installs from
`backend/pyproject.toml` / `uv.lock` — the full development dependency set,
including SciPy — rather than the trimmed `backend/requirements.txt`
described in the README's size rationale (79 MB vs. SciPy's 96 MB). The
deploy works and stays well under the 250 MB limit either way, so this has
not blocked anything, but the deliberate "no SciPy at runtime" design is not
actually in effect on Vercel yet. Worth revisiting: either get the Services
Python builder to prefer `requirements.txt`, or update the README's
dependency claim to match what is actually deployed.

### 3. Fallback: split the deployment

Not needed today, but worth keeping in reserve for if the serverless bundle
ever stops fitting — a future dependency bump that pulls in something heavy,
for instance.

- **Site** on Vercel, unchanged.
- **API** on [Hugging Face Spaces](https://huggingface.co/spaces) (free, Docker,
  no bundle limit) or any host that runs a Python process.
- Set `NEXT_PUBLIC_API_URL` in the Vercel project to the API's origin.
- Add that origin to `ALLOWED_ORIGINS` on the backend, since CORS now applies.

The site keeps working throughout the migration, because the demonstration never
depended on the API.

---

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Vercel project | API origin. Leave unset for same-origin. |
| `ALLOWED_ORIGINS` | Backend host | Comma-separated CORS allowlist. Only needed when split. |
| `MAX_UPLOAD_BYTES` | Backend host | Upload cap. Defaults to 8 MB. |

Currently unset on the Vercel project — confirmed with `vercel env ls`, which
returns none. The deployment is same-origin.

No secrets. The application has no database, no authentication and no
third-party credentials, so there is nothing to leak.

---

## After deploying

- [x] All four routes load, with numbers (verified by screenshot, not yet in an incognito window)
- [ ] Mobile layout works on a real phone, not just a resized browser
- [ ] The Report page prints without clipped content
- [x] `/api/v1/health` responds
- [ ] Upload the bundled CSVs from `frontend/public/demo/` end to end
- [ ] CI badge green on the README — currently failing on an unrelated, pre-existing
      issue (the committed precomputed analysis is stale against the frozen dataset)
- [x] Screenshots captured for the README; the poster still needs them

---

## Free-tier caveat

Free-tier terms change, and they change without much notice. Verify current
limits before relying on any of them.

The architecture is deliberately arranged so that switching hosts is cheap: the
demonstration is static, the backend is plain FastAPI with no host-specific
APIs, and the API origin is a single environment variable. Moving the backend
should be an afternoon, not a rewrite.
