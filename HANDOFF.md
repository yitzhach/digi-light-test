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
  - **Looks side by side in the app** (roadmap NEXT, first part): Auto thumbnails bigger (three
    across on a phone); press and hold one to see it on the picture (guarded, no undo step, not
    picked); **Compare full screen** renders Auto's looks into the batch viewer (`batch.openAuto`,
    source "Auto looks"); the viewer's **Pin as A** makes Hold flip to that look (P, hold Space).
    `guard.preview()` fixes a shown look without touching the undo history.
  - **The user's test photos** (plaster door flat and in raking sun, a banded panel outdoors, a
    close-up; scratch only, not in the repo): review of today's looks with the guard on,
    https://claude.ai/artifact/TPRk1CiypEiBBJLewfb5fs. The guard fixes they led to: when the darks
    fix (room light) blows whites, exposure comes back down to the whites limit; darks aim at half
    the limit (the guard judges at preview size, and the door's exports showed 0.25% where the
    preview showed 0.15%).
  - **Real light test** (**docs/real-light-test.md**, tools in **tools/realref/**): the sunlit door
    photo lined up on the flat one (0.6 px) is a reference for real raking light. Today's relief,
    estimated from one flat photo, gives light and shade unrelated to it (correlation about 0, every
    band, every direction; no setting fixes it; it embosses the paint's outlines). Relief measured
    from that one sunlit photo through the lamp-photo code: 0.55 / 0.60 (mid / broad) under a
    sun-like light; review page https://claude.ai/artifact/AvR9yt12cnmo3qtaL46yvG (Hold flips
    measured / estimated). Roadmap NEXT has the plan: measured relief from 2–3 phone shots in sun.
  - Everything older: **docs/history.md** (the 10-20 overnight work: guard, metrics, records,
    goldens, exportMany, make_round.py).

## Waiting on the user
1. Measured relief from sunlight: 2–3 more sunlit shots of the door with the board turned about
   90° between them (and the plaster's thickness at the dark block's edge, for the depth)? Or
   carry on with the one shot (sun from the upper left, depth unknown).
2. Guard, when room light at 1.0 is not enough (the close-up's near-black band: 2–6% stays newly
   crushed on every look; the red panel just over): raise the black point a touch, or keep the
   black black? (The user found D4 / D7 "bit dark", W3 "a bit too bright".)
3. White plaster: should the favourites keep whites white (neutral greys: plaster b* 16 → ~12;
   the sunlit photo is 3.9)?
4. May the test photos be kept as a private test set (now only in a session's scratch space)?
5. Is the guard chip welcome (screenshots sent 10-20)?
6. docs/roadmap.md §6: lamp photos per piece (measured relief), evenness slider, blind voting,
   phone or iMac, default look for uploaders, 16-bit / TIFF output.
7. Older, still open (details in docs/history.md): confirm the Shadow light picks (Shade vs
   Negative light; more shade shapes?); overlay defaults (grain 35%, vignette 50%); Broad form
   100% strength; the AI-match texture/depth work.

## Next up
1. With the user's answer on sunlight: a sun lamp and handheld lining up in the lamp-photo tool
   (roadmap NEXT, "Measured relief from sunlight"); looks without graze smoothing on measured relief.
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
- tests/browser.cjs's zoom block ("zoom to 1000%") failed once on 10-21 on its last check, the undo
  history one step longer (22 vs 21) after the brush undo, and passed on the re-run of the same
  code: a timing race to look into if it comes back.
- Whenever you push to `main`, update this file (CLAUDE.md).
