# DigiLight — Handoff

Start a new chat with: "Read HANDOFF.md and continue." Keep this file short: the current state,
what waits on the user, what is next. Everything older (every session's status, the test rounds,
the upgrade phases, done lists) is kept verbatim in **docs/history.md**; search it when a question
needs the background. The plan is **docs/roadmap.md**.

## Now
All work so far is on `main` (10-24; branch `claude/quirky-allen-tna7jh`).
- **10-24: the sun slope flattening, found and mostly fixed** (Next up 1 of 10-23). A stand-in
  where the truth is known (tests/sunflat.cjs: the lintel's paint, a known relief as measured
  relief, the app's own sun render of it, slow unevenness) showed it: one sun photo left every
  shadowed pixel out (slope 0 = flat ground; 10% of the lintel at 10.3°) and capped bright facets
  at the lamps' 3, so the strokes came out shallow, and the drift cut 0.12 kept the resulting
  error as broad relief, which set the range the artist's depth scales by. Now (lampphotos.js, sun
  only; lamps unchanged) a shadow is read as falling away at the sun's angle (a cast shadow comes
  out as its step), facets up to 1.2/sin(elevation) are read, SUN_DRIFT_SIGMA = the lamps' 0.06.
  Stand-in: depth from the artist's range 0.32 → 1.06 of the truth's stroke slopes, Fit depth
  0.72; tests/sun.cjs's 1 mm photo fits 0.96 mm (was 2.5). **Lintel at the artist's 1/8": light
  and shade with the real sun 0.68 / 0.80 / 0.82** (mid / broad / forms; was 0.57 / 0.64 / 0.62),
  its size 0.36 / 0.41 / 0.35 of the sun's (was 0.30 / 0.29 / 0.23). Not reached: Fit depth and the
  artist's still differ **1.8×** on the lintel (1.58 vs 2.85 mm; was 1.76 vs 4.0), while on the
  stand-in they agree the other way (0.68), so the rest is in the real photos (phone processing,
  sub-pixel roughness, or a deepest relief over 1/8"): docs/real-light-test.md "10-24".
- **10-24: a handheld photo lined up in the app** (Next up 2 of 10-23; src/lineup.js). A photo
  shaped unlike the painting photo (or marked Handheld in its row; `lineUp`, CLI `--line-up`, MCP
  `line_up`) is lined up on it: SIFT-like features on brightness and colour ratio, RANSAC
  homography, refined with patches over the painting, then the usual `align`. The raw door-sun.jpg
  / lintel-sun.jpg land within a median 0.36 / 0.79 preview px of register.py's (max 0.79 / 1.60),
  relief r 0.945 / 0.986 against the -lined photos', depth within 4% (tests/lineup.cjs). The row
  and the report say how it went; Compare shows it lined up. register.py stays as the reference
  (manifest.json `sunToFlat`).
- **10-23: the sun in the renderer** (`graze.sun`; Light like this and Fit depth with sun photos;
  Analyze's looks unsmoothed on measured relief). Details: docs/real-light-test.md "10-23",
  docs/history.md "HANDOFF, 10-23".
- Older (10-22 change map, renderers agree, sun photos for measured relief, the repeatability fix;
  10-21 and before): docs/history.md.

## Waiting on the user
1. Lintel panel (10-24): after the fix its relief from the sunlit photo, scaled to "about 1/8""
   lowest to highest, gives the best light and shade yet but only about 0.4 of the real sun's
   contrast; matching the contrast needs about 2.85 mm Texture depth, i.e. about 5.7 mm (≈ 7/32")
   lowest to highest. Is 1/8" the deepest point to the highest across the whole panel, plaster
   only (the wooden lintel aside)? A ruler across a deep groove would settle it. Also still
   welcome: a second sun photo of the lintel or the door with the board turned about 90°, same
   sun (both slopes), and the door's sun elevation and width if known. The app keeps the artist's
   depth when given (best placement), else fits it (reads deep on sun photos).
2. Guard, when room light at 1.0 is not enough (the close-up's near-black band: 2–6% stays newly
   crushed on every look; the red panel just over): raise the black point a touch, or keep the
   black black? (The user found D4 / D7 "bit dark", W3 "a bit too bright".)
3. White plaster: should the favourites keep whites white (neutral greys: plaster b* 16 → ~12;
   the sunlit photo is 3.9)?
4. (Answered 10-22: the test photos are in the repo, testdata/photos/, public is fine.)
5. Is the guard chip welcome (screenshots sent 10-20)?
6. docs/roadmap.md §6: lamp photos per piece (measured relief), evenness slider, blind voting,
   phone or iMac, default look for uploaders, 16-bit / TIFF output.
7. Older, still open (details in docs/history.md): confirm the Shadow light picks (Shade vs
   Negative light; more shade shapes?); overlay defaults (grain 35%, vignette 50%); Broad form
   100% strength; the AI-match texture/depth work.
8. On the user's computer with a GPU: `RENDERER_B=gpu node tests/renderers.cjs` (does a real GPU
   agree with software GL within the stated tolerance?).

## Next up
1. The lintel's remaining 1.8× (Waiting 1): if the 1/8" stands, try a rough-surface term for the
   graze light at low angles (grain below a pixel shadows itself at a 10° sun, which a Lambert
   render of a pixel-scale height cannot), checked against the lintel and door sun photos
   (tools/realref/sun_score.cjs renders artist / fit / orig in the app, then tools/realref/score.py).
2. The sun's direction read from the cast shadows (so the user needn't give it); then roadmap
   NEXT in order: the sharp layer at fit-to-screen, a `?round=` link (a round on the user's own
   GPU), agent tools (`render_preview` region + stats, `compare`), narrower Analyze cache.

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
- `changemap.js` — the change map (light / colour per pixel against the photo), DOM-free
- `resample.js` — the photo at another size (export tiles, sharp zoom, metrics): area average,
  the same pixels every session
- `gbuffer.js` — single-photo surface estimation; `shade.js` — shading pass (area lights,
  graze, overlays, adjustments); `export.js` — tiled export (several variants per relief build)
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
- `node tests/changemap.mjs`, `node tests/sunrelief.mjs` (Node, no browser, seconds)
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
- tests/browser.cjs's zoom block ("zoom to 1000%") failed once on 10-21 on its last check, the undo
  history one step longer (22 vs 21) after the brush undo, and passed on the re-run of the same
  code: a timing race to look into if it comes back.
- tests/browser.cjs's phone slider block ("tap jumps", a 50 ms wait) failed once on 10-22 while three
  other headless pages ran beside it, and passed run alone: run browser.cjs on its own.
- Whenever you push to `main`, update this file (CLAUDE.md).
