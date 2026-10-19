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
- **Speed quick wins.**
  - Rebuild the relief only when the surface changes: gate `api.refresh` (`src/app.js` 1317) and stop the end of every export (1499) forcing a rebuild. Move `SURFACE` into `presets.js` and add a test per key. About 15 lines, about 15–25% per job. Undo and Strength become instant.
  - Default the tile cap to 4096 when headless (`state.maxTile`, `export.js` 73). About 5 lines, about −24% time.
  - Full-resolution crops: `export({rect})` plus a CLI `--crop`, reusing `renderTiles`. About 25 lines, about 5× cheaper than a full render, and gives true 100% loupes for judging crispness.
- **MCP `export_image` in the background** (`tools/digilight-mcp.cjs` 224), the same way Analyze already runs. Exports of about 70 s now beat the 60 s tool timeout. About 20 lines.

## 3. NEXT (1–3 sessions)
- **Shared metrics (about 1 day).**
  - Extend `src/measure.js`: it is DOM-free and Node can test it, but keep it descriptive, not predictive.
  - Return a `metrics` block from `digilight.render` and `export`, the CLI `batch`, and MCP `render_preview` / `export_image`. The review page shows it beside each image.
- **One guard after every change**, not only inside Analyze. Move it out of `keepWhites`.
  - Whites: ease `highlightRolloff` first, then exposure.
  - Darks: raise `graze.lift`, then `ambient`.
  - Measure at full resolution, not the 240 px thumbnail, and report what it did ("wanted +0.30, capped at +0.12").
  - Today `exposureAdd` and `set` skip the guard.
- **A record with every export.** A JSON sidecar holding the settings, look id and version, code hash, GPU or SwiftShader, what the guard did, and the metrics. Cheap; makes any image reproducible.
- **Stable look ids.**
  - Key `LOOK_BIAS` by id plus version, not display name: today it falls back to `?? 0`, so a renamed look silently loses its exposure. Jobs should name looks by id, not index.
  - Done 10-19: mirror the graze angle with `keySide`: `crispGraze(s,170|175)` is fixed, so a photo lit from the right gets the wrong graze side.
- **Many variants per relief build.** `exportMany`, grouped by surface key, in chunks of about 10 because of memory. Round 2 was 45 jobs but only 7 distinct reliefs. About 100 lines. With the NOW wins, a 45-variant round goes from about 26 min to about 6–7 min.
- **In the app, for uploaders** (`src/batch.js`, `src/auto.js`):
  - An Auto source in `looks()` so looks open in the full-screen viewer (about 30 lines).
  - "Pin as A" so Hold flips to another look, not only the photo (about 20 lines).
  - Press and hold an Auto thumbnail to preview it.
  - Bigger thumbnails than today's 84 px cells.
  - Let the sharp layer render at fit-to-screen (`sharpPlan` refuses at zoom ≤1, app.js 1127).
  - A `?round=` link so a round renders on your own GPU at about 1–2 s per look.
- **Agent tools.**
  - `open_image` accepts data URLs (MCP line 100).
  - `render_preview` takes `region` and returns `stats`.
  - A `compare` tool returns an A|B crop pair plus the difference.
  - `batch_render`.
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
1. Can you shoot 2–3 low-lamp photos plus one even photo of each piece? Measured relief is the biggest quality lever.
2. Please re-attach the door photos. May we keep them privately as the fixed test set?
3. Is the strong left-to-right falloff wanted, or should evenness be a slider?
4. Should we test a finer graze, which risks some grit, to fight the smear?
5. Are you happy to vote blind?
6. Will you review on a phone, the 2014 iMac, or both?
7. What should uploaders get by default: your favourite look, or a neutral one? Do they need 16-bit or TIFF output?