# DigiLight — Handoff

Start a new chat with: "Read HANDOFF.md and continue." Keep this file short: the current state,
what waits on the user, what is next. Everything older (every session's status, the test rounds,
the upgrade phases, done lists) is kept verbatim in **docs/history.md**; search it when a question
needs the background. The plan is **docs/roadmap.md**.

## Now
- **10-22 (same branch), exactness 3 and 4 done, the sun option started** (roadmap NEXT):
  - **Change map** (src/changemap.js): `change: true | {map: 'light' | 'colour', range}` on
    `render` / `export` / `exportMany` → `change: {image, stats}`; the light each pixel was
    multiplied by (stops; grey = unchanged, orange brighter, blue darker) or how far it is off the
    photo's own colour at its new brightness (levels), from the photo and the picture alone. CLI
    `--change-map FILE.png` (`--change-kind colour`), batch `"changeMap"`, MCP `render_preview` /
    `export_image` `change_map`; numbers in the record. Identity export: `same` 1, plain grey.
    tests/changemap.mjs (Node), tests/exact.cjs.
  - **Renderers agree** (tests/renderers.cjs, docs/automation.md "Renderers agree"): the cloud has
    no GPU but has Mesa llvmpipe through Xvfb (`DIGILIGHT_GL=llvmpipe`; swiftshader | gpu |
    llvmpipe). Same settings, SwiftShader vs llvmpipe, 3 photos x 5 cases at 900 px: nothing
    changed bit for bit; else p99 1 level (worst: door under Classic raking, 1.03% of pixels over
    2 levels, p99 3, max 25, at shadow edges). Stated tolerance: ≤ 2% over 2 levels, p99 ≤ 3,
    mean ≤ 0.75. `verify` says `withinRendererTolerance` for a picture made on another renderer.
    Against a real GPU: `RENDERER_B=gpu node tests/renderers.cjs` on the user's computer.
  - **Sun option, first part**: lamp photos can be sun photos (`{sun: {azimuthDeg, elevationDeg}}`,
    a row's Light: Sun), depth from the artist's deepest relief (Deepest relief; `deepestMm`),
    `digilight.measureRelief`, CLI `measure --sun FILE:FROM:ANGLE --width-cm --deepest`, MCP
    `measure_relief`. Sun drift cut 0.12 (set so the lintel's full range at its known 10.3° is the
    artist's 1/8"); a broad beam window helped on a synthetic painting (tests/sunrelief.mjs) but
    hurt on the real lintel, so sun shots keep the lamps' (docs/real-light-test.md "10-22").
    Lamp photos are now resampled by resample.js (were the browser's drawImage).
- **10-22 (branch `claude/quirky-allen-tna7jh`): the look-path repeatability bug is fixed.** Two
  causes, both the photo reaching the relief a level apart (the relief turns a level into speckle
  up to 99 deep): (1) resized exports, the sharp zoom and the metrics shrank the photo with the
  browser's `drawImage` at 'high' quality, which is not stable under load (two pages at once, or a
  fresh Analyze, gave the other picture; every uniform the same, the export's own photo texture
  not); now src/resample.js does it (area average in sRGB from an exact 1:1 copy; a tile's pixels
  are the whole picture's there). (2) A JPEG drawn into a GPU-backed canvas differs from a
  CPU-backed one by a level on a quarter of its values, and Chromium can switch a canvas between
  them; now the photo is decoded once into a plain canvas (app.js `pinPixels`). The red panel's
  photo at 900 px moved by mean 3.5 levels (the new filter is a touch sharper: mean gradient 53.9
  vs 51.9). tests/repeat-look.cjs passes (pages two at a time, one with a fresh Analyze) and is a
  routine test now; tests/exact.cjs adds block means, a resized identity export and a JPEG
  identity export (that one fails without pinPixels). Records of resized pictures or JPEG photos
  made before 10-22 will not verify (decoded / resized the old way). Still the browser's: the
  preview's copy of the photo (one bilinear drawImage at load; stable in every test so far).
- **10-21 (merged to `main`):** round 4 and 5 picks (LOOK_VERSION 5), the guard picks, Auto looks
  side by side, the real light test (docs/real-light-test.md), exact identity and fingerprints;
  in full in **docs/history.md** ("HANDOFF, 10-21").
  - Everything older: **docs/history.md** (the 10-20 overnight work: guard, metrics, records,
    goldens, exportMany, make_round.py).

## Waiting on the user
1. (Answered 10-21: build the sun option — "I'm fine with building this out" — after the exactness
   work.) Lintel panel: lintel 3/4" out, panel 20.5" wide, sun 10.3° up; the user says its relief goes
   up to about 1/8" (the photos gave 2.3–3.05 mm). Depth in the app: ask the artist's deepest relief
   (done 10-22: Deepest relief / `deepestMm`). New: a second sun photo of the lintel or the door
   with the board turned about 90°, same sun (both slopes; lets a broad beam window be tested on
   real photos), and the door's sun elevation and width if known.
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
1. The rest of the sun option (roadmap NEXT, exactness 5): a sun lamp in the renderer (a
   direction, no falloff; the graze light is a lamp a width away, so measured renders are about a
   third of the real sun's light and shade, and Fit depth can't use sun rows); handheld lining up
   in the app (register.py's features + homography, in JS); looks without graze smoothing on
   measured relief; the sun's direction from the shadows. Ask the user for a second sun shot of
   the lintel or door with the board turned ~90° (both slopes, and the measurement can then
   test a broad beam window on real photos).
2. Roadmap NEXT, in order (docs/roadmap.md): the rest of the in-app part (the sharp layer at
   fit-to-screen; a `?round=` link that renders a round on the user's own GPU); agent tools
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
