# DigiLight — Handoff

Start a new chat with: "Read HANDOFF.md and continue." Keep this file short: the current state,
what waits on the user, what is next. Everything older (every session's status, the test rounds,
the upgrade phases, done lists) is kept verbatim in **docs/history.md**; search it when a question
needs the background. The plan is **docs/roadmap.md**.

## Now
All work so far is on `main` (10-23; branch `claude/quirky-allen-tna7jh` merged).
- **10-23: the sun in the renderer.** `graze.sun` (Graze light › Sun): the graze light as a
  direction, no falloff, even over the painting, Angle to wall up to 60° (20° without). A sun
  photo's Light like this uses it (room light = the sky share read in that photo), so Fit depth
  works with sun photos. Analyze's looks on measured relief drop their graze smoothing (Detail 0,
  Fine 1). On the lintel (true geometry: 40°, 10.3°, 52.07 cm), measured relief under the sun:
  light-and-shade r 0.57 / 0.63 / 0.60 (mid / broad / forms), the best yet (lamp at the same
  angle 0.51 / 0.53 / 0.48; one-photo estimate ~0.15) but at a third of the real sun's size.
  **Open problem:** one sun photo flattens stroke-scale slopes ~2.4×: depth from the artist's
  1/8" gives 1.76 mm (true geometry, weak contrast), Fit depth 4.0 mm (true contrast, broad forms
  exaggerated); tests/sun.cjs sees the same on a photo the app made at 1 mm (fits 2.5 mm).
  Details: docs/real-light-test.md "10-23". tests/sun.cjs.
- **10-22: exactness 3 and 4, the sun option's first part, the repeatability fix.**
  - Change map (src/changemap.js; `change` on render / export / exportMany, CLI `--change-map`,
    MCP `change_map`): the light each pixel was multiplied by (stops) or how far it is off the
    photo's own colour, from the photo and the picture alone; identity export = no change.
  - Renderers agree (tests/renderers.cjs): SwiftShader vs Mesa llvmpipe (`DIGILIGHT_GL=llvmpipe`,
    through Xvfb; the cloud has no GPU): nothing changed bit for bit; else within ≤ 2% of pixels
    over 2 levels, p99 ≤ 3, mean ≤ 0.75 (worst: door under Classic raking, 1.03%, p99 3).
  - Sun photos for measured relief: `{sun: {azimuthDeg, elevationDeg}}` (a row's Light: Sun),
    depth from the artist's deepest relief (`deepestMm`), `digilight.measureRelief`, CLI
    `measure --sun FILE:FROM:ANGLE --width-cm --deepest`, MCP `measure_relief`. Sun drift cut 0.12
    (the lintel's known depth); beam window kept at the lamps' 0.022 (a broad one won on a
    synthetic painting, lost on the real lintel). Lamp photos resampled by resample.js.
  - Repeatability fix: the photo is decoded once (app.js `pinPixels`) and resized by our own area
    average (src/resample.js); tests/repeat-look.cjs. Records of resized pictures or JPEG photos
    made before 10-22 will not verify.
  - In full: docs/history.md ("HANDOFF, 10-22").
- **10-21:** round 4 and 5 picks (LOOK_VERSION 5), guard picks, Auto looks side by side, the real
  light test, exact identity and fingerprints: docs/history.md ("HANDOFF, 10-21"). Older: docs/history.md.

## Waiting on the user
1. (Answered 10-21: build the sun option — "I'm fine with building this out" — after the exactness
   work.) Lintel panel: lintel 3/4" out, panel 20.5" wide, sun 10.3° up; the user says its relief goes
   up to about 1/8" (the photos gave 2.3–3.05 mm). Depth in the app: ask the artist's deepest relief
   (done 10-22: Deepest relief / `deepestMm`). New: a second sun photo of the lintel or the door
   with the board turned about 90°, same sun (both slopes; lets a broad beam window be tested on
   real photos), and the door's sun elevation and width if known.
   Until the slope flattening is fixed (Next up 1): for measured relief from one sun photo,
   should the app keep the artist's depth (true geometry, about a third of the sun's contrast)
   or fit the depth to the photo (the sun's contrast, broad forms exaggerated)? Today: the
   artist's when given, else fitted.
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
1. **Sun slope flattening** (the open problem above). One sun photo reads stroke-scale slopes
   ~2.4× too shallow. Reproduce it where the truth is known: tests/sun.cjs makes a sun photo
   with the app at a known depth and measures it back (made at 1 mm, Fit depth 2.5 mm); add
   slow unevenness to that stand-in (as a real indoor flat photo has) and find a beam window /
   refine scheme (lampphotos.js SUN_BEAM_SIGMA, REFINE, `beamSigma`) that recovers the depth
   on it AND keeps or beats the lintel's light-and-shade r (0.57 / 0.63 / 0.60 at the artist's
   depth; tools/realref/score.py; recipe in docs/real-light-test.md "10-23"). Success: Fit depth
   and the artist's 1/8" agree within ~25% on the lintel.
2. **Line up a handheld photo in the app** (roadmap NEXT, measured relief from sunlight): today
   tools/realref/register.py (OpenCV SIFT + homography, 0.6–0.9 px) does it outside the app.
   In JS: features robust to the light change (register.py pools brightness and colour-ratio
   matches), RANSAC homography, then the existing `align` for the last pixel; exposed in the
   lamp panel, `measureRelief` (`lineUp: true`), the CLI `measure` and the MCP `measure_relief`.
   Test: door-sun.jpg / lintel-sun.jpg (raw) against their -lined versions (testdata/photos).
3. The sun's direction read from the cast shadows (so the user needn't give it); then roadmap
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
  `texscore.js`, `lampphotos.js` + `lampui.js` (measured relief), `photometric.js`,
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
  depth; ~3 min)
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
