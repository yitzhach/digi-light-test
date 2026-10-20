# DigiLight — Handoff

Start a new chat with: "Read HANDOFF.md and continue." Keep this file short: the current state,
what waits on the user, what is next. Everything older (every session's status, the test rounds,
the upgrade phases, done lists) is kept verbatim in **docs/history.md**; search it when a question
needs the background. The plan is **docs/roadmap.md**.

## Now
- **10-20 (overnight, user asleep, asked for continuous refinement; all on `main`):**
  - Round 3 picks folded into both favourite looks (raking 6°, finer detail; LOOK_VERSION 3).
  - **The guard** (src/guard.js) after every one-tap / API / CLI / MCP change; chip + Fix for
    hand-moved sliders; never changes a hand-moved slider. Fixed overnight: it applied nothing when
    a setting's furthest value was not enough; it measured the screen (Split / Original views)
    instead of the relit picture; the chip's check blocked phone taps (it now reads the frame on
    screen when idle); and its baseline photo was resampled differently from the preview's, which
    counted ~0.5% phantom "newly blown" on a bright painting (now exactly 0 for an unchanged picture).
  - **Metrics** (measure.js imageMetrics) on render / export / exportMany / CLI / MCP; the same
    baseline fix for exports (photo cut as the tiles cut it): unchanged = exactly 0 at any size.
  - **Records** (`FILE.json` beside every CLI picture and MCP export), **look ids + versions**,
    **goldens** (tests/goldens/looks.json), **exportMany** (variants that share a relief rendered
    in one tiled pass; CLI batch uses it, `--no-many` to compare: 6 jobs 313 s → 204 s).
  - **tools/looks/make_round.py** builds a round end to end (see Lighting rounds below).
  - Metrics 7× faster (running-sum box filters, quickselect percentiles; exact, tests/measure.mjs);
    `open_image` / CLI inputs take `data:image/...;base64` URLs (records keep only their sha256).

## Waiting on the user
1. **Guard options** — https://claude.ai/artifact/KReiYc3BimztEmr1HzPgQg (picks in ArtifactData
   "picks"): which way should the guard fix a too-bright picture (W1 soften highlights then
   exposure / W2 exposure only) and a too-dark one (D1 raking shadow lift then room light ≤ 0.6 /
   D2–D4 room light only ≤ 0.6 / 0.3 / 1.0)? By eye D1 turns the red panel bright orange and loses
   the raking drama. Then set guard.js WHITES / DARKS / AMBIENT_MAX to match (re-rendered with the
   exact baseline: tools/looks/guard-options.cjs).
2. **Round 4** — https://claude.ai/artifact/Ckij9SS2EXVa475GXkByai (picks in "picks"): the round 3
   keepers together (L01, F01) vs each alone, and lower (5°) / finer (0.008, 0.65) still. Rendered
   without the guard, like round 3. Measured: the finer raking light raises fine texture a lot
   (red panel 2.05× the photo's vs 1.49× with the old smoothing; DSC_8382 4.5× vs 2.0×), so watch
   for grit; all versions sit ~1 stop under the photo with 0.4–0.5% pure black, as the approved
   favourite looks always have.
3. Is the guard chip welcome (screenshots sent 10-20)?
4. Re-attach the two plaster door photos (not in the repo); may they be kept as a private test set?
5. docs/roadmap.md §6: lamp photos per piece (measured relief), evenness slider, blind voting,
   phone or iMac, default look for uploaders, 16-bit / TIFF output.
6. Older, still open (details in docs/history.md): confirm the Shadow light picks (Shade vs
   Negative light; more shade shapes?); overlay defaults (grain 35%, vignette 50%); Broad form
   100% strength; the AI-match texture/depth work.

## Next up
1. Fold the guard-options and round 4 picks in (guard.js order / cap; auto.js crispGraze, bump
   LOOK_VERSION, `UPDATE_GOLDENS=1`).
2. Roadmap NEXT, in order (docs/roadmap.md): in-app A/B for uploaders (Auto looks in the
   full-screen viewer, Pin as A, press-and-hold a thumbnail, bigger thumbnails); agent tools
   (`open_image` data URLs, `render_preview` region + stats, a `compare` tool); narrower Analyze
   cache (photo measurements apart from look fitting); faster metrics (box filters dominate,
   ~0.7 s/MP).
3. Check whether the guard's darks fix costs texture (raking shadow lift 60% vs 100%, fine and mid
   detail at the same export size; an earlier 1.66 → 0.67 reading compared different sizes, so it
   proves nothing). If it does, weigh detail in the guard once the user has chosen the order.

## What it is
Static, no-build, in-browser painting relighter (WebGL2, ES modules). Upload a photo of a
painting → estimate its surface relief → relight with movable virtual lamps, a raking light and
one-tap looks → export. Scripts and AI agents drive the same app through `window.digilight`
(docs/automation.md), the CLI (tools/digilight-cli.cjs) and the MCP server (tools/digilight-mcp.cjs).
The user's taste so far: lamp low on the left near the edge, a crisp low raking light, deeper
and crisper texture, brighter with lifted darks; never blur/smear, blown whites or crushed blacks.

## Map (src/)
- `app.js` — main bench: load image, build the G-buffer (relief rebuilt only when `surfaceKey()`
  changes), re-shade on interaction, sharp zoom, exports (`exportFull`, `renderAt`, `exportStates`)
- `studio.js` + `presets.js` — Creative Studio UI, surface/material/lighting presets, undo History
- `auto.js` — Auto: Analyze (readout, depth fit, raking direction) and the one-tap looks
  (`BUILT_IN` with fixed ids, `LOOK_BIAS` / `LOOK_VERSION` by id), Strength mix
- `guard.js` — the guard: after one-tap / API / CLI / MCP changes it brings newly blown whites
  (rolloff, then exposure) and crushed blacks (shadow lift, then room light) back under the
  limits; the chip with Fix for hand changes
- `measure.js` — metrics (`imageMetrics`: clipping vs the photo, darks, tones, detail at three
  scales, thirds, warnings; `LIMITS`), same numbers as tools/looks/stats.py; chroma signal
- `automation.js` — `window.digilight` (set, looks, render/export/exportMany with metrics,
  record, guard), URL params, `?bridge` postMessage
- `toolrail.js`, `touchsliders.js` — one tool at a time (phone strip / desktop rail); phone sliders
- `gbuffer.js` — single-photo surface estimation; `shade.js` — shading pass (area lights,
  graze, overlays, adjustments); `export.js` — tiled export (several variants per relief build)
- `gl.js` (WebGL2, `caps.software` for SwiftShader), `kelvin.js`, `photocheck.js`, `probe.js`,
  `texscore.js`, `lampphotos.js` + `lampui.js` (measured relief), `photometric.js`,
  `register.js`, `sphere.js` (multi-photo path), `synth.js` (test painting)

## Run / test
- `python3 -m http.server 8766`, open http://localhost:8766 (must be HTTP: ES modules)
- `node tests/browser.cjs` (Playwright; cloud: `DIGILIGHT_BROWSER=/opt/pw-browsers/chromium`,
  ~20 min in software GL). Built-in looks are pinned in tests/goldens/looks.json: an intended
  look change → `UPDATE_GOLDENS=1 node tests/browser.cjs`, commit the file with the change.
- `cd tools && npm install` once, then `node tests/mcp.cjs` (`--full` adds Analyze)
- `node tests/measure.mjs` (measure.js against slow reference maths; no browser, <1 s)
- Do not edit `src/` while a test or a render runs: later test blocks and each CLI run load it
  fresh. Render from a snapshot (`git archive HEAD | tar -x -C DIR`, copy tools/node_modules).

## Lighting rounds (how the user reviews looks)
1. Write `tools/looks/roundN.json` ({title, pageTitle, about, fill?, variants [{id, name, look,
   set, scale, exposureAdd, addLights, fill, base}]}); look by id or name.
2. `DIGILIGHT_BROWSER=/opt/pw-browsers/chromium python3 tools/looks/make_round.py
   tools/looks/roundN.json --photo "p:Red panel:sample:painting" --photo "d:DSC_8382:sample:dsc8382"
   --out DIR` (`--skip-existing` resumes; background it with a long timeout).
3. Publish DIR/page with the Artifact tool (capabilities {"db": {}}, files from the script's
   last line); the user marks Keep / Maybe / Drop + notes; read them with ArtifactData list,
   collection "picks"; log them in tools/looks/picks.json; fold keepers into auto.js (bump
   LOOK_VERSION, update goldens).

## Test bundles from the user
`*-test-YYYYMMDDHHMM.zip` from **Export for testing** (Projects): unpack in its own scratch dir;
`notes.txt` first, then `info.json`, `project.digilight.json` (import to reproduce),
`original.jpg`, `relit-full.png`, view captures. Reproduce, fix or suggest, measure before/after.

## Gotchas
- `window.digilight.setSettings` takes top-level keys only (dotted paths are ignored silently);
  use `set({'adjust.levels.gamma': 1.6})` for paths (the CLI's --set and the MCP set_settings do).
- Calibrated mode (`state.physical`, single photo only) derives heightScale, reliefStrength and
  shadow reach in `app.js` updateDerived; export tiles reuse the preview's measured
  `heightStats` / `strokeSpread`, never re-measure.
- No backticks inside GLSL comments: the shaders are JS template strings.
- Deploy index.html, studio.css, src/, samples/, _headers together.
- Tests must open `/?synth`: the default start is the sample photo. The main page's panel tests
  run with the guard off (`__studio.guard.enabled = false`); the API pages have it on.
- Measured relief lives in app.js `measured` (preview-sized RGBA16F texture + Float32 heights),
  not in state/history; projects save it as `relief` (reliefsave.js); a new photo drops it.
  Lamp photos must be cropped exactly like the painting photo; lamp "out" is from the painted face.
- The CLI turns the page's own guarding off and guards each job once after all its options.
- Whenever you push to `main`, update this file (CLAUDE.md).
