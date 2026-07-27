# Deployment

> **Status: written, not yet verified.** Nothing has been deployed. The
> configuration in `vercel.json`, `api/index.py` and `requirements.txt` is a
> considered starting point, not a proven one — a monorepo with a Python
> function alongside a Next.js app in a subdirectory is exactly the arrangement
> that tends to need one or two adjustments on first contact. This document
> records what to expect and what to do if it does not work first time.

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

### 2. Deploy the site

Import the repository at [vercel.com/new](https://vercel.com/new).

The Hobby plan is free and requires non-commercial use, which an educational
portfolio project satisfies.

If Vercel does not pick up the configuration automatically, set:

| Setting | Value |
|---|---|
| Framework preset | Next.js |
| Root directory | `frontend` |
| Build command | *(default)* |

Setting the root directory to `frontend` is the simplest arrangement and is
worth trying first. **It disables the Python function**, because `api/` then
falls outside the build context — which is fine, and is exactly the split
described in step 4.

Verify: all four routes load, the metric cards show numbers, the Model Audit
table is populated, and the stress scenarios appear. None of that requires the
API.

### 3. Try the Python function

Only if you want uploads on the same origin.

Set the root directory back to the repository root so `vercel.json` governs the
build. Expect to iterate here.

**Things that plausibly go wrong**

| Symptom | Likely cause |
|---|---|
| Next.js not detected | Root directory or `outputDirectory` wrong for the monorepo layout |
| `ModuleNotFoundError: app` | `sys.path` insertion in `api/index.py` not resolving on the runtime's filesystem |
| Function exceeds size limit | Unlikely — measured at 79 MB against 250 MB — but Linux wheels differ from the Windows measurement |
| 404 on `/api/v1/health` | The rewrite not matching; check `rewrites` in `vercel.json` |
| Timeout on first request | Cold start. `maxDuration` is set to 60s |

Verify with:

```bash
curl https://<your-deployment>/api/v1/health
# {"status":"ok","version":"0.1.0"}
```

### 4. Fallback: split the deployment

If the single-origin arrangement resists, take the split. It is not a defeat —
it is arguably the more robust arrangement, and it is what the fallback plan
assumed from the start.

- **Site** on Vercel with root directory `frontend`.
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

No secrets. The application has no database, no authentication and no
third-party credentials, so there is nothing to leak.

---

## After deploying

- [ ] All four routes load, with numbers, in an incognito window
- [ ] Mobile layout works on a real phone, not just a resized browser
- [ ] The Report page prints without clipped content
- [ ] `/api/v1/health` responds, or the split fallback is in place and uploads work
- [ ] Upload the bundled CSVs from `frontend/public/demo/` end to end
- [ ] CI badge green on the README
- [ ] Screenshots captured for the README and the poster

---

## Free-tier caveat

Free-tier terms change, and they change without much notice. Verify current
limits before relying on any of them.

The architecture is deliberately arranged so that switching hosts is cheap: the
demonstration is static, the backend is plain FastAPI with no host-specific
APIs, and the API origin is a single environment variable. Moving the backend
should be an afternoon, not a rewrite.
