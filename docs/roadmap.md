# DigiLight roadmap: pro-level looks, judging them fast, agent-ready

Written 10-19 by a panel of five reviews of the code (look quality, review flow, AI agents, the
look system, speed), checked by an adversarial critic and merged into one plan. Each item names
where in the code it lives. **Done 10-19** marks what the same session already built.

## 1. Biggest ideas
1. **Measure every render.** One shared set of numbers (clipping, darks, detail, smear) comes back with every render, so you, an AI agent and the review page all judge the same thing.
2. **Make the look you tap the look you get.** Then add guards so no look blows whites or crushes darks, whoever applied it.
3. **Compare full screen, blind, at 100%.** Use A/B flips and loupes, not sheets of thumbnails.
4. **Rebuild the relief only when the surface changes.** Rounds then take minutes and in-app tweaks feel instant.
5. **Measured relief beats guessed relief.** A few lamp shots per piece improve every look, and need no new code.

## 2. NOW (cheap and certain)
- **Done 10-19: fix the "tapped ≠ applied" bug** (auto.js: built-in looks made with no layers; the three favourite biases moved down 0.22–0.27 so they still land where approved).
  - What: the built-in favourite looks are fitted (thumbnail, exposure, whites guard) with an 88% Pin light layer that `pick()` then drops.
  - Fix: strip `layers` and `originalTop` from built-in items before `fitExposure` and `keepWhites`. That is `src/auto.js` ~289, which builds the items, and ~355, which applies them.
  - Cost: about 3 lines.
  - Catch: this changes the exposure fits and the code hash, so Analyze re-runs. Review round 3 as rendered, then refit the winner.
- **Round 3 hygiene.**
  - Done 10-19: L12 replaced (it would have gone past the 10 mm limit).
  - Re-run on the two door photos once you re-attach them.
- **Done 10-19 as round 3's L12 / F07: finer graze** (recipe only, about 35–70 s per render, possibly more with deeper relief).
  - One "finer graze" variant: graze `detail` about 0.01, `fine` 0.5, `clean` 0.5. Today it is 0.02 / 0.15, which is a 16 px blur at full size, the likely source of the smear.
  - Treat it as a test, not a fix. You found 0.01–0.012 gritty on the steel piece.
- **Partly done 10-19 (A/B viewer, preload, new-clip overlay): review page polish** (`tools/looks/review-ab.html`, about 100 lines, no renders).
  - Preload B with `img.decode()` so the first Hold doesn't flash.
  - Blind mode: random left/right, names hidden until you vote.
  - **New-clip overlay**: magenta where the render clips and the photo doesn't.
  - |A−B| heatmap: only compare renders from the same cached Analyze, because a fresh Analyze vs a cached one differs by up to 49 levels.
- **Done 10-19 (tools/looks/stats.py): one definition of "clipped".**
  - Commit the scratch `r3stats.py` (numpy and PIL are installed) as `tools/looks/stats.py`.
  - Settle on one rule at full size: white = any channel ≥250, black = all channels ≤5. Today there are three different rules (`photocheck.clipping`, `keepWhites`, `r3stats`).
  - Cost: about an hour.
- **Done 10-19 (second session): speed quick wins.** The relief rebuilds when a setting it is made from changes (`app.js` `surfaceKey`, one test per setting), and an export no longer needs a preview rebuild first (it reuses the preview's measurements). Software GL takes 4096 px tiles (`caps.software`; a GPU keeps 2048, since 4096 tiles need about 2 GB). `export({crop})`, CLI `--crop`, MCP `export_image` `crop`.
  - Was: rebuild the relief only when the surface changes: gate `api.refresh` (`src/app.js` 1317) and stop the end of every export (1499) forcing a rebuild. Move `SURFACE` into `presets.js` and add a test per key. About 15 lines, about 15–25% per job. Undo and Strength become instant.
  - Default the tile cap to 4096 when headless (`state.maxTile`, `export.js` 73). About 5 lines, about −24% time.
  - Full-resolution crops: `export({rect})` plus a CLI `--crop`, reusing `renderTiles`. About 25 lines, about 5× cheaper than a full render, and gives true 100% loupes for judging crispness.
- **Done 10-19 (second session): MCP `export_image` in the background** (`tools/digilight-mcp.cjs` 224), the same way Analyze already runs. Exports of about 70 s now beat the 60 s tool timeout. About 20 lines.

## 3. NEXT (1–3 sessions)
- **Done 10-19 (third session): shared metrics** (`measure.js` `imageMetrics`; clipping, darks, tone, detail at three scales, thirds, warnings; edge width, smear and hue shift not yet).
  - Was: **Shared metrics (about 1 day).**
  - Extend `src/measure.js`: it is DOM-free and Node can test it, but keep it descriptive, not predictive.
  - Return a `metrics` block from `digilight.render` and `export`, the CLI `batch`, and MCP `render_preview` / `export_image`. The review page shows it beside each image.
- **Done 10-20: one guard after every change** (`src/guard.js`; preview size, not full resolution: a full-size check costs an export).
  - Was: **One guard after every change**, not only inside Analyze. Move it out of `keepWhites`.
  - Whites: ease `highlightRolloff` first, then exposure. (10-21, the user's pick: exposure only, until nothing new blows.)
  - Darks: raise `graze.lift`, then `ambient`. (10-21, the user's pick: room light only, up to 1.)
  - Measure at full resolution, not the 240 px thumbnail, and report what it did ("wanted +0.30, capped at +0.12").
  - Today `exposureAdd` and `set` skip the guard.
- **Done 10-20: a record with every export** (`digilight.record()`, `FILE.json` beside every CLI picture and MCP export).
  - Was: **A record with every export.** A JSON sidecar holding the settings, look id and version, code hash, GPU or SwiftShader, what the guard did, and the metrics. Cheap; makes any image reproducible.
- **Stable look ids.**
  - Key `LOOK_BIAS` by id plus version, not display name: today it falls back to `?? 0`, so a renamed look silently loses its exposure. Jobs should name looks by id, not index.
  - Done 10-19: mirror the graze angle with `keySide`: `crispGraze(s,170|175)` is fixed, so a photo lit from the right gets the wrong graze side.
- **Done 10-20: many variants per relief build** (`exportMany`, export.js renderTiles with a list of states; the CLI batch renders jobs that share a relief together). Measured: 6 full-size variants of the red panel 313 s → 204 s (−35%); the rest is dressing, the guard and metrics per job, so longer rounds gain more.
  - Was: **Many variants per relief build.** `exportMany`, grouped by surface key, in chunks of about 10 because of memory. Round 2 was 45 jobs but only 7 distinct reliefs. About 100 lines. With the NOW wins, a 45-variant round goes from about 26 min to about 6–7 min.
- **In the app, for uploaders** (`src/batch.js`, `src/auto.js`):
  - Done 10-21: an Auto source in the batch (Auto's "Compare full screen" opens its looks in the
    full-screen viewer, each guarded as a tap gives it); "Pin as A" (Hold flips to the pinned look;
    P, hold Space); press and hold an Auto thumbnail to see it on the picture (no undo step);
    thumbnails 100 px minimum (three across on a phone).
  - Let the sharp layer render at fit-to-screen (`sharpPlan` refuses at zoom ≤1, app.js 1127).
  - A `?round=` link so a round renders on your own GPU at about 1–2 s per look.
- **Agent tools.**
  - `open_image` accepts data URLs (MCP line 100).
  - `render_preview` takes `region` and returns `stats`.
  - A `compare` tool returns an A|B crop pair plus the difference.
  - `batch_render`.
- **Exact, traceable pictures, run end to end by an AI** (the user, 10-21: "mathematically pixel
  for pixel accurate images", never a regenerated look-alike). The app is already a calculation,
  not a generator: every output pixel is the photo's own pixel at that place times light computed
  from the relief, and the same settings give the same pixels (checked 10-21: one look rendered
  twice, 0 of 5.0 M pixels differ). To make it a guarantee:
  1. Exact identity: with nothing changed, the export is the photo bit for bit. Today the
     photo-only export (Original on top 100%) is off by up to 2 levels on 45% of pixels (rounding
     through linear light and the GPU) — fix and test.
  2. Provenance in every record: photo hash, settings, code hash, renderer, and a hash of the
     output pixels, so anyone can re-render and compare.
  3. A pixel map per picture on request: how much each pixel's light changed (the shading the
     photo was multiplied by), so an AI or a person can see that nothing else was touched.
  4. Software-GL and GPU renders agree within a stated tolerance (tested), since an agent may
     run headless.
  5. The sun option below, fully drivable through the CLI / MCP (add photos, line up, measure,
     set depth), with the same checks.
- **Measured relief from sunlight** (evidence: docs/real-light-test.md, 10-21). On the user's
  plaster door the relief estimated from one flat photo gave light and shade unrelated to real
  raking sunlight (correlation about 0, every band, every direction, no setting helps); the relief
  measured from one handheld sunlit photo through the lamp-photo code reached 0.55 / 0.60 (mid /
  broad) under a sun-like light. Sunlight is a free, even, distant lamp: 2–3 phone shots in sun,
  the board turned about 90° between them, could replace the tripod-and-lamp session. Needs:
  - Line up handheld shots in the app (features + homography; tools/realref/register.py does it
    with OpenCV SIFT: 0.6 px median on the door). lampphotos.js `align` only searches ±1% shifts.
  - A sun lamp in lamp photos: a direction (from the shadows, or the user's answer), no
    distance falloff; Fit depth with it (it fails with a far point lamp today).
  - Keep broad forms for sun shots (DRIFT_SIGMA drops anything over 6% of the width, for a lamp's
    uneven beam; sunlight is even).
  - Depth: one unknown sun elevation leaves the depth scale open (bas-relief ambiguity). Simplest:
    ask the artist how deep the relief goes at most and scale the measured full range to it (on
    the lintel panel the user said about 1/8"; one shadow plus the panel's width gave 2.3–3.05 mm
    from the photos alone). Or the sun's elevation from a shadow of a known height.
  - Looks on measured relief without the graze smoothing tuned for the estimate's grain (detail
    0.02–0.03, fine 0.15): on the door it smoothed real detail (68% of the photo's fine texture);
    without it the side-lamp favourite matched the real sun's texture strength (×1.0 / 1.7 / 2.0
    fine / mid / broad against ×2.0 / 1.9 / 1.8) at correlation 0.48 / 0.56 (mid / broad).
  - Second piece (panel with a lintel) replicated it (0.54 / 0.51 measured, about 0 today). A
    protruding object (the lintel, a few cm) needs modelling apart: its step is not measurable from
    shading, so its cast shadow is missing.
- **Narrower Analyze cache.** Cache the photo measurements separately from look fitting, so a look tweak doesn't re-run the 172 s Analyze.
- **Fixed test set plus goldens.**
  - The door photos, steel+plaster, DSC_8382 and the painting sample.
  - `tests/browser.cjs` saves each built-in look's settings so changes are caught.
  - A flat-print control: every look on a flat print should show no relief rims.

## 4. LATER
- **Shader work, behind a flag, only once metrics exist.** These change every exposure fit and past picks.
  - The graze becomes a second light added before the tone curve, with one white balance and its colour taken from the key. Today it is a fixed 5000 K cross-fade against a 4000 K key.
  - A tone curve on luminance that keeps hue, with a straight toe and an adjustable shoulder. The per-channel ACES curve pulls dark level 25 to about 17 and turns reds salmon.
- Fill set as a stop ratio to the key, not a flat amount. Sheen taken from the stroke-smoothed normals, plus a gloss mask.
- "Even out the light" as an optional setting, not a default: your low-left keepers want the drama.
- **Colour pipeline:** ICC and Display P3 handling (iPhone photos are P3), HEIC upload, 16-bit PNG/TIFF, dither.
- Faster blurs: must match today's output within 0.5 levels, because of your no-blur line. Split `shade.js` into a lighting pass and a grading pass.
- A hosted MCP endpoint for agents on the website.
- Look families and a separate look layer, only if hand-made looks get unwieldy.

**Dropped by the critique:** Pin light as the cause of the A11/A15 settings; evenness as a fix; Bradley-Terry vote fitting and taste learning (too few picks); "renders are deterministic".

## 5. Measure on every render (full size, against the photo)
- **New whites clipped** (any channel ≥250): no more than the photo + 0.3%.
- **New blacks clipped** (all channels ≤5): no more than the photo + 0.15%.
- **Darks:** p05 between the photo and the photo + 8 levels (lifted, not milky). Also report p50 and p95 in stops.
- **Detail:** band contrast against the photo at <3, 3–9 and 9–27 px. Flag a drop of more than 15% against the base look ("blur" as a number).
- **Edge width:** 10–90% rise on the photo's strongest 2% of edges, ratio 1.1 or less.
- **Smear index:** how much more the render's 3–9 px detail lines up along the graze than the photo's (structure tensor). No more than +0.05.
- **Colour:** hue shift in the top 5% 3° or less, and drift on neutral surfaces.
- **Left / centre / right p50** in stops: reported, not judged.
- **Mean |Δ| from the neighbouring variant:** under about 2 levels means "no visible difference", so skip it.
- **Provenance:** code hash, GPU or SwiftShader, render time.

## 6. Questions for you
1. Can you shoot 2–3 low-lamp photos plus one even photo of each piece? Measured relief is the biggest quality lever. (10-21: or 2–3 phone shots in direct sun, the board turned about 90° between them; see docs/real-light-test.md.)
2. Please re-attach the door photos. May we keep them privately as the fixed test set? (10-21: the user sent the door flat and in sun, a banded panel outdoors and a close-up; kept outside the repo until they say.)
3. Is the strong left-to-right falloff wanted, or should evenness be a slider?
4. Should we test a finer graze, which risks some grit, to fight the smear?
5. Are you happy to vote blind?
6. Will you review on a phone, the 2014 iMac, or both?
7. What should uploaders get by default: your favourite look, or a neutral one? Do they need 16-bit or TIFF output?