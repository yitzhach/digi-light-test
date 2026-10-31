# DigiLight — working notes

Reference that rarely changes: what the app is, where things are, how to run and test it, how the
user reviews looks, gotchas. The current state is in HANDOFF.md; the past in docs/history.md.

## What it is
Static, no-build, in-browser painting relighter (WebGL2, ES modules). Upload a photo of a
painting → estimate its surface relief → relight with movable virtual lamps, a raking light and
one-tap looks → export. Scripts and AI agents drive the same app through `window.digilight`
(docs/automation.md), the CLI (tools/digilight-cli.cjs) and the MCP server (tools/digilight-mcp.cjs).
The user's taste so far: lamp low on the left near the edge, a crisp low raking light, deeper
and crisper texture, brighter with lifted darks; never blur/smear, blown whites or crushed blacks.

## Map (src/)
- `app.js` — main bench: load image, build the G-buffer (relief rebuilt only when `surfaceKey()`
  changes), re-shade on interaction, sharp zoom (patches kept per zoom size, `sharpView` for tests), exports (`exportFull`, `renderAt`, `exportStates`)
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
- `changemap.js` — the change map (light / colour per pixel against the photo), DOM-free
- `resample.js` — the photo at another size (export tiles, sharp zoom, metrics): area average,
  the same pixels every session
- `gbuffer.js` — single-photo surface estimation; `shade.js` — shading pass (area lights,
  graze, overlays, adjustments); `export.js` — tiled export (several variants per relief build)
- Photos as spaces (Scene tool; `state.scene`, `state.fx`; type `artwork` runs none of it):
  `scenedepth.js` reads a 256 px copy (DOM-free, Node-tested: subject, sky, room lines, layout per
  type, heights, the photo's own light, `suggestType`); `scene.js` carries its maps to the
  preview and every tile along the photo's edges (`SceneMaps`, settings, validation);
  `scenelights.js` the light scenes (pure data); `sceneui.js` the tool; `fx.js` haze and rays
  (in the shading pass) and the effects' settings; `postfx.js` glow and background blur (after
  it; export tiles get `fxMargin`, aligned to 8 px); `glsl.js` GLSL shared by both passes
- `gl.js` (WebGL2, `caps.software` for SwiftShader), `kelvin.js`, `photocheck.js`, `probe.js`,
  `texscore.js`, `lampphotos.js` + `lampui.js` (measured relief), `lineup.js` (a handheld photo
  lined up: features + homography), `photometric.js`,
  `register.js`, `sphere.js` (multi-photo path), `synth.js` (test painting)

## Run / test
- `python3 -m http.server 8766`, open http://localhost:8766 (must be HTTP: ES modules)
- `node tests/browser.cjs` (Playwright; cloud: `DIGILIGHT_BROWSER=/opt/pw-browsers/chromium`,
  ~20 min in software GL). Built-in looks are pinned in tests/goldens/looks.json: an intended
  look change → `UPDATE_GOLDENS=1 node tests/browser.cjs`, commit the file with the change.
- `cd tools && npm install` once, then `node tests/mcp.cjs` (`--full` adds Analyze)
- `node tests/measure.mjs` (measure.js against slow reference maths; no browser, <1 s)
- `node tests/exact.cjs` (identity export bit for bit on random noise, repeatable exports; change map; ~1 min)
- `node tests/changemap.mjs`, `node tests/sunrelief.mjs`, `node tests/scenedepth.mjs` (the scene
  reading on synthetic photos with known answers, tests/scenes.mjs) (Node, no browser, seconds)
- `node tests/sun.cjs` (graze.sun checks and evenness, a sun photo through Light like this and Fit
  depth; ~3 min); `node tests/sunflat.cjs` (one sun photo of a known relief: its depth comes back;
  ~4 min); `node tests/lineup.cjs` (the raw door / lintel sun photos lined up in the app against
  register.py; ~2 min)
- `node tests/renderers.cjs` (SwiftShader vs llvmpipe through Xvfb, or `RENDERER_B=gpu`: the same
  pictures within the stated tolerance; ~40 min in the cloud; `--report` only prints)
- `node tests/repeat-look.cjs [runs]` (the same look in fresh pages, two at a time, gives the same
  pixels; ~10 min)
- browser.cjs needs the server above running on 8766; the other tests serve the repo themselves.
- Do not edit `src/` while a test or a render runs: later test blocks and each CLI run load it
  fresh. Render from a snapshot (`git archive HEAD | tar -x -C DIR`, copy tools/node_modules).

## Lighting rounds (how the user reviews looks)
1. Write `rounds/roundN.json` ({title, pageTitle, about, fill?, variants [{id, name, look,
   set, scale, exposureAdd, addLights, fill, base}]}); look by id or name.
2. `DIGILIGHT_BROWSER=/opt/pw-browsers/chromium python3 tools/looks/make_round.py
   rounds/roundN.json --photo "p:Red panel:sample:painting" --photo "d:DSC_8382:sample:dsc8382"
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
- tests/browser.cjs's zoom block ("zoom to 1000%") failed once on 10-21 on its last check, the undo
  history one step longer (22 vs 21) after the brush undo, and passed on the re-run of the same
  code: a timing race to look into if it comes back.
- Touch tests: a CDP touch drag flings what it scrolls, and on a slow machine (late in the suite;
  `Emulation.setCPUThrottlingRate` 3-6 reproduces it) the moves arrive in a burst and the panel
  coasts on for hundreds of px. Wait for the scroller to be still before aiming a tap (browser.cjs
  `still`). That was the phone block's "tap jumps" failure (10-22, 10-28): the tap landed on the
  painting; TAP_MS was not it (event times are stamped on dispatch, so a busy page keeps them close).
- Open the tool search as a user does (`#searchBtn` or `/`, which focus it): opened by adding
  `searchOpen` without focus, the last pick's deferred blur close (150 ms) can shut it again. That
  was the tool search block's "#toolSearchInput not visible" (10-28).
- Scene work: type `artwork` must stay bit for bit what it was (`node tests/exact.cjs`); a preset
  carries a look, never `scene` (studio.js presetKeys); `smooth` is a GLSL keyword.
- Changing how Analyze measures the photo (tone, depth fit, raking direction) in auto.js or
  presets.js: bump auto.js `MEASURE_VERSION`, or the tools' cache keeps the old measurements
  (digilight-headless.cjs measureCode leaves those two files out so look tweaks reuse them).
- Whenever you push to `main`, update HANDOFF.md (CLAUDE.md).
