# Demo script — 2 to 3 minutes

For the demonstration video required by PRD 24.

The instinct is to show every feature. Resist it. A three-minute video that
makes **one** point clearly beats one that lists twelve features, and the point
worth making is the one that distinguishes this project from a dashboard: *the
model was tested, not just calculated.*

Total: ~2:45. Timings are guides, not targets.

---

## 0:00 – 0:20 — The problem

> "Any risk tool can calculate a Value at Risk figure. This one asks a harder
> question: was that figure ever right?"

**On screen:** Overview page, already loaded.

Point at the VaR 95% card — 2.16%.

> "This says the portfolio should lose more than 2.16% on about one day in
> twenty. That's a testable claim, and almost nothing checks it."

Say early and once that the data is simulated. Do not belabour it; the badge is
on screen throughout.

---

## 0:20 – 0:50 — What the dashboard shows

**On screen:** Overview.

Move quickly. This section exists to establish competence, not to explain
everything.

- Four metric cards — volatility, VaR, Expected Shortfall, maximum drawdown.
- One sentence on why ES is there: *"VaR marks the edge of the tail. Expected
  Shortfall tells you what's inside it — 3.53% against a 2.16% threshold."*
- Risk contribution panel: *"Where the risk comes from is a different question
  from where the money is."*

Do not narrate the correlation matrix or the allocation table. They are visible;
that is enough.

---

## 0:50 – 1:40 — The core: model validation

**On screen:** Model Audit.

This is the heart of the video. Slow down.

> "Three models. Each one estimated using only data from before the day it was
> forecasting — never its own outcome. Then run forward across 1,837 trading
> days and counted."

Point at the table.

> "A 95% model should be breached about 92 times. Historical Simulation was
> breached 116 times — the Kupiec test rejects it. EWMA was breached 105 times,
> and is not rejected."

Then the finding worth the whole video:

> "Look at Parametric Normal. It passes at 95%. At 99% it fails with a p-value
> below 0.0001 — 39 breaches where 18 were expected. That's what a thin-tailed
> assumption looks like: fine through the middle of the distribution, badly
> wrong in the tail. The same model, validated at one confidence level and
> unusable at another."

Then the sentence that shows you understand the statistics:

> "A pass here doesn't prove the model is right. It means the exception count
> isn't statistically inconsistent with what the model promised. That distinction
> matters."

Switch the chart to **Loss** view. Let the coral exception markers land.

> "Each dot is a day the loss exceeded the threshold forecast for it."

---

## 1:40 – 2:10 — Stress testing

**On screen:** Stress Test.

> "Stress testing asks a conditional question — if this happened, what then. It
> attaches no probability to the scenario."

Click through the historical episodes.

> "These aren't invented shock vectors. The engine searched the dataset for the
> worst stretches and replayed them against the current weights, so they carry
> whatever co-movement the assets actually had."

Point at the worst week: −22.99%.

> "The worst week costs almost 23%. The one-day 95% VaR was 2.16%. That gap is
> the argument for stress testing existing at all."

Optionally drag one custom slider to show it responds live. Two seconds, no more.

---

## 2:10 – 2:35 — Reproducibility

**On screen:** Report page, then a quick cut to the terminal.

> "Everything is reproducible. The dataset is generated from seed 42 and
> checksummed — regenerate it and the SHA-256 is identical. The analysis is
> computed by the same Python engine the API runs."

Terminal, one command, let it finish:

```bash
uv run --directory backend pytest -q
```

> "329 tests. The ones that matter most check that no forecast ever saw its own
> outcome — a future observation is replaced with a minus-fifty-percent day, and
> every forecast has to come back bit-for-bit identical."

Back to the Report page. Click a CSV export so a file lands.

---

## 2:35 – 2:45 — Close

> "It doesn't predict prices and it doesn't recommend trades. It measures
> downside risk, explains where it comes from, and tests whether the model
> producing those numbers can be trusted on the data it was tested against.
>
> The data here is simulated, so it demonstrates the method, not the market."

End on the Overview page.

---

## Production notes

**Record at 1920×1080**, browser at ~1440px wide so the desktop layout with the
docked rail is what appears. Zoom the browser to 110% — screen text that reads
fine live is small in a compressed video.

**Have both servers warm** before recording. A loading spinner in a demo video is
avoidable and looks like a fault.

**Do not record the upload flow** unless the video runs long. It needs the
backend awake and adds a failure mode for thirty seconds of screen time. Mention
it in one clause instead: *"you can upload your own CSVs"*.

**One take per section**, cut between. Trying to do 2:45 unbroken produces a
worse result than four clean segments.

**Turn off notifications.** Close other tabs.

### Things not to say

- "Best model" — say *"the only model not rejected at either confidence level"*.
- "Proves" — say *"is consistent with"* or *"is not rejected"*.
- "Safe", "low risk", "guaranteed" — none of these are claims the tool makes.
- Anything implying the results describe real Vietnamese equities.

### If it runs long

Cut the reproducibility section to a single sentence over a still of the passing
test count. Cut the Overview walkthrough to the four cards. Never cut the model
audit — without it this is a dashboard, and dashboards are not interesting.
