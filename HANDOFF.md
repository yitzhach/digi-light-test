# DigiLight — Handoff

Start a new chat with: "Read HANDOFF.md and continue." Keep this file short: the current state,
what waits on the user, what is next. Everything older (every session's status, the test rounds,
the upgrade phases, done lists) is kept verbatim in **docs/history.md**; search it when a question
needs the background. The plan is **docs/roadmap.md**.

## Now
- **10-21 (merged to `main`):**
  - **Round 4 picks** in: L02 kept (raking 6° with the old smoothing; the user found "a bit much
    high-frequency sharpness in most"), so crispGraze is detail 0.02, fine 0.15, elevation 6;
    LOOK_VERSION 4; goldens updated.
  - **Guard picks** in (guard options 2, W3 maybe, D4 / D7 kept): whites → exposure only, down until
    nothing new blows (AIM newBlown 0); darks → room light only, up to 1. The aim applies only to the
    side over the limit. The old paths stay as options, plus `adjust.levels.outBlack` and
    `adjust.lift.amount`, and a run's own `limits`; CLI jobs take the guard's options
    (`"guard": {...}`), so guard alternatives are now a plain round spec (tools/looks/guard2.json).
  - **Round 5 picks** in (https://claude.ai/artifact/KWg8gaJavKE9TponXE8PVB): softer per look.
    Side lamp: graze detail 0.03 (L04); from the left: fine relief without round 2's ×1.4 (F03);
    LOOK_VERSION 5, goldens updated (on the samples the looks fit the same exposure as the
    reviewed L04 / F03, within 0.03). Raking fine 0.05 read as "Blurry" (F02), so left out. The unchanged looks (01)
    were kept too: the user is near the target, so further rounds should be small steps.
  - Everything older: **docs/history.md** (the 10-20 overnight work: guard, metrics, records,
    goldens, exportMany, make_round.py).

## Waiting on the user
1. Guard: the user noted D4 / D7 "bit dark" and W3 "a bit too bright". Mostly the test cases' own
   exposure (−0.8 / +2.5): the guard fixes clipping, not overall brightness. On the red panel room
   light 1.0 is still just over the darks limit; ask whether a second darks step is wanted.
2. Is the guard chip welcome (screenshots sent 10-20)?
3. Re-attach the two plaster door photos (not in the repo); may they be kept as a private test set?
4. docs/roadmap.md §6: lamp photos per piece (measured relief), evenness slider, blind voting,
   phone or iMac, default look for uploaders, 16-bit / TIFF output.
5. Older, still open (details in docs/history.md): confirm the Shadow light picks (Shade vs
   Negative light; more shade shapes?); overlay defaults (grain 35%, vignette 50%); Broad form
   100% strength; the AI-match texture/depth work.

## Next up
1. Roadmap NEXT, in order (docs/roadmap.md): in-app A/B for uploaders (Auto looks in the
   full-screen viewer, Pin as A, press-and-hold a thumbnail, bigger thumbnails); agent tools
   (`render_preview` region + stats, a `compare` tool); narrower Analyze cache (photo
   measurements apart from look fitting); faster metrics.

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
3. Publish DIR/page with the Artifact tool (capabilities {"db": {}}, root DIR/page, files from
   the script's last line); the user marks Keep / Maybe / Drop + notes; read them with ArtifactData list,
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
