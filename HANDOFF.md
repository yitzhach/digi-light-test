# DigiLight — Handoff

Start a new chat with: "Read HANDOFF.md and continue." Keep this file short.
**Rule:** update this file in the same commit (or right after) every push to `main`.

## Status
- Last updated: 2026-10-14
- Last code change on `main`: (2026-10-14) **phone pinch zoom + Full screen view**
- Before that: merge of `claude/compassionate-bardeen-wsnho5` (2026-10-14) —
  measured relief saved in projects and test bundles (`src/reliefsave.js`)
- Earlier: merge of `claude/laughing-johnson-a03sam` (2026-10-14) —
  **Measure relief · lamp photos** (relief measured from 2–3 lamp shots + the even
  shot) and the **DSC_8382** sample with its lamp shots
- Earlier: second merge of `claude/image-lighting-review-h7922k` (2026-10-13) —
  Export for testing zip, shadow smoothing, sample painting on open
- Earlier: merge of `claude/laughing-mendel-u7jr3c` (2026-10-12) — Calibrate section
- Deploy: automatic via Cloudflare Workers Builds on push to `main` (`wrangler.jsonc`); manual Pages upload no longer needed
- Live: digi-light-test.bobdylan2000.workers.dev (Workers static assets)

## What it is
Static, no-build, in-browser painting relighter (WebGL2, ES modules). Upload a photo
of a painting → estimate surface relief → relight with movable virtual lights → export.

## Map (src/)
- `app.js` — main bench: load image, build G-buffer, re-shade on interaction (largest file)
- `studio.js` + `presets.js` — Creative Studio UI, surface/material/lighting presets, undo History
- `gbuffer.js` — single-photo surface estimation (directional + even-light estimates,
  normalised, blended); `shade.js` — per-frame shading pass (area-light penumbra)
- `export.js` — full-res tiled export; `gl.js` — WebGL2 scaffolding; `kelvin.js` — colour temp
- `lampphotos.js` (maths) + `lampui.js` (section) — relief measured from lamp photos
- `photometric.js`, `register.js`, `sphere.js` — multi-photo capture path (demo section)
- `synth.js` — synthetic painting with known relief (tests); `measure.js` — image stats
- `tests/browser.cjs` — Playwright regression (see README "Validation")

## Run / test
- `python3 -m http.server 8766` then open http://localhost:8766
- `node tests/browser.cjs` (needs Playwright; Chromium at /opt/pw-browsers in cloud sessions)

## Test bundles from the user (next session starts here)
The user sends a `*-test-YYYYMMDDHHMM.zip` from **Export for testing** (Projects).
Unpack it in its own scratch dir. Contents: `notes.txt` (what to look at — start
here), `info.json` (UA, GPU, errors, light summary), `project.digilight.json`
(import via Import project, or `#projectFile` in Playwright to reproduce exactly),
`original.jpg`, `relit-full.png`, preview captures `view-relit/original/split/
shadows/height.png`, `view-zoom.png` if zoomed. Look at the views, reproduce on the
project, fix or suggest settings, measure before/after.

## Real-painting test
Graze tuning so far is measured only on synthetic paintings (`tools/graze-lab.cjs`).
To judge it on a real painting, by eye:
1. Photo: a painted surface with visible impasto, sharp, straight-on, ~2000 px+ wide.
   Ideally two shots: the normal photo, and one with a torch/lamp raking from the left
   (the direction the graze defaults to). Note the painting's width (cm) and a guess
   at impasto depth (mm).
2. Load the normal photo. Set Painting width, Texture depth and Photo was lit (Even
   for a normal photo) under Quick setup; leave Fine-tune alone.
3. Open **Graze light · raking texture**, click Visible, and step through the presets
   (Gentle raking, Classic raking, Long shadows, Soft strip light, Every detail (raw)).
   Keep Opacity at each preset's value. Use B / Split to compare against the original.
4. Zoom to 200–400% on a stretch with clear ridges. Check for: blocky or "chunky"
   relief, glitter/shimmer, shadows where the paint is flat, and missing shadows at
   ridges you can see.
5. Compare with the raking photo: set the graze direction to match the lamp (0° right,
   90° top, 180° left) and Angle to wall 1–3°. Shadow positions should match where the
   lamp's shadows fall.
6. Record: preset, Angle to wall, Opacity, direction, Texture depth, and a zoomed
   Split screenshot of one region. Note what looks wrong and where.

## Done recently
- 10-14 (pushed to `main`): user asked for iPhone pinch zoom and a full-screen toggle.
  Touch (`wireTouchGestures`, app.js): two fingers pinch-zoom about their midpoint and
  pan; one finger pans when zoomed unless a dot/brush/sphere placer claimed it.
  `#wrap` is now `touch-action:none` everywhere (native pan grabbed the pinch on iOS).
  A second finger sends the first's handler a `pointercancel` flagged `digilightPinch`:
  light drags snap back, brush strokes are dropped. **⛶ Full screen** toolbar button
  (F key; Esc / ✕ Exit / browser leaving fullscreen exits): `body.fullView` CSS layout
  (iPhone Safari has no element fullscreen) + requestFullscreen where allowed; floating
  `#fullBar` with fit (zoom %) and Exit. Phone test in browser.cjs (CDP touch). Not yet
  tried on a real iPhone — ask the user how it feels.
- 10-14 (merged to `main`): user test
  bundle `Untitled_painting-test-2026-10-140440` (DSC_8382, one light from 126° high
  up + graze 3° from 61.5°, note "incorrect shadow direction to light source"; later:
  same with the standard light alone). Reproduced to 0.44/255. Findings: (1) light and
  shadow geometry is right (synthetic bumps via `afterHeight`: main and graze shade
  and cast away from the lamp); (2) the bundle used the ONE-PHOTO estimate (measured
  relief is not saved, so it was never in play). Scored against the aligned lamp
  photos (graze = each lamp, stroke band of log(render/even) vs log(photo/even)):
  one-photo r = +0.01 (EVEN_SHARE 0.6) / +0.00 (share 1), fine contrast 1.5–1.7× the
  real photos'; measured r = 0.80, contrast 0.64–0.88. The "motion blur" is that
  grain embossed by a low light. Dropping the directional share for even photos did
  not help, so presets are unchanged. Fix shipped: projects save measured relief
  (`src/reliefsave.js`: 16-bit PNG in `project.relief` {format 'height16png', w, h,
  lo, hi, on, depthMm, check, image}; resampled on open if the preview size differs;
  dropped if the shape differs), so test bundles carry it too; bundle `info.json`
  has `relief` (which relief the views used). `__bench.measured()` test hook. Note:
  graze Detail smoothing (e.g. 0.01) also blurs measured relief; with measured
  relief use raw graze settings (Light like this does).
- 10-14 (merged to `main`): user sent a tripod set of the 19 in red panel (2.5 in
  deep): DSC_8382 even room light, DSC_8379/80/81 one spot lamp ~9 in above the top,
  6.5/5.75/6 in from the paint, centre / ~2.8 in left of the left edge / ~3.4 in
  right of the right edge (left-right read off the panel's wall shadows; the user
  gave only height and distance off the wall). Findings: (1) one-photo relief from
  the even shot correlates ~0 with the lamp shots (stroke band) — the impasto does
  not show in even light; (2) shots drift up to 2 px and 0.3% zoom; (3) the spot has
  a narrow aimed beam, nothing like the bare-bulb lamp model. New **Measure relief ·
  lamp photos** (`src/lampphotos.js`, `src/lampui.js`, under Calibrate): align each
  shot to the even one on colour (r/sum, b/sum; patch NCC + affine fit), ratio to
  the even shot, room light (local regression intercept), beam = local mean over
  the predicted shading (2 refine rounds), per-pixel LS for slopes from near-lamp
  geometry, multigrid W-cycle Poisson, drift removal (0.06 W), depth = 2–98% spread
  in mm → Texture depth. Injected via GBuffer `opts.measured` {tex, rect} (export
  tiles resample their window; renderState carries `measuredTex`). Light like this
  (graze = that lamp, raw graze settings), Compare (lamp photo in Before/Split via
  sRGB texture swapped for `lin`). Results on the set: self-check r = 0.87/0.86/0.80,
  depth 1.51 mm; in-app leave-one-out render vs real photo r = 0.75–0.83 (old
  estimate ~0); renders show ~60% of the photo's contrast. Synthetic: depth 10–20%
  shallow with all lamps above, right with lamps on four sides. Calibrate's lamp
  distance is now labelled "out from painting" (face, not wall). Samples picker
  (`#samplePick`): Red panel / DSC_8382 (cropped to the panel 314–1692 × 4–1331 of
  the 2000 px uploads; lamp shots cropped alike in `samples/dsc8382/`).
- 10-13 (merged to `main`): **Export for testing** button (studio.js Projects →
  `src/testbundle.js`): prompt for a note, then a stored (uncompressed) zip written by
  hand (`makeZip`, crc32) with the files above. Views are grabbed from the preview
  canvas right after `renderNow` in the same task; full-res via app.js `exportFull`
  in the studio api. Window errors are collected from module load. Test in browser.cjs
  unzips and checks names and the note.
- 10-13 (merged to `main`): user's multi-light render showed a "motion blur" look:
  each low light's shadow march drags one-photo height grain into a hairline streak
  along that light, and lights from several sides cross them. Fixes: (1) per-light
  shadow reach `lightReach` (shade.js) = strength / strongest light, min 0.15
  (`uLightReach`); (2) main-light shadows march a smoothed relief
  (`GBuffer.buildShadow`, generalised from buildGraze as `smoothed(key, sigma)`;
  `uShadowRelief`), Fine-tune **Shadow smoothing** `state.shadowDetail` in painting
  widths, default `SHADOW_DETAIL` 0.004 (presets.js); old saves validate to 0
  (LEGACY). Export margin covers its blur. Checked by eye on the user's painting in
  the Shadows view: crossing streaks clearly reduced. New test in browser.cjs.
- 10-13 (merged to `main`): app opens on the user's painting `samples/painting.jpg`
  (1932×2576, red ground + grey/black figure, heavy impasto) as an upload; `?synth`
  keeps the old synthetic start. tests/browser.cjs and tools/graze-lab.cjs use ?synth.
- 10-12 (merged to `main`): **Calibrate · match your raking photo**
  (`src/calibrate.js`, section under Graze light). Lamp measured from the painting's
  edges (in/cm): `state.graze.lamp {left, above, out}` in cm makes the graze light a
  POINT at that place (`lampPosition`/`lampAngles` in presets.js; shade.js), so its
  angle and falloff vary across the painting; `graze.fill` = room light in the graze
  render (default GRAZE_AMBIENT). "Light it like the photo" also sets Photo was lit to
  the lamp's direction. Dial / Angle to wall drop the lamp. Match score: graze render vs
  photo, both divided by a relief-off render (so a flat render scores 0 — without this
  Auto-fit "won" by switching relief off), broad band only (fine band correlation ≈ 0
  on real photo: the albedo keeps the fine shading). Auto-fit = hill climb over the
  ticked settings (lamp position, distance from wall [off by default: trades with
  depth], depth, room light), bounded near the measurements. On painting B the score
  peaked at the measured lamp (32" above, 4" out) and fit depth 4.0 mm, room light
  0.32 (31% → 39%). Freeing the lamp position reaches 51% but drifts (10" across, 23"
  above, depth 6.4 mm) — one photo can't pin both down.
- 10-12 (merged to `main`): first real-painting
  tests (user photos, not in repo). Painting B: 19" wide, ~1/8" (3.2 mm) impasto, lamp
  ~32" above the top at the right edge, ~4" off the wall (graze 78°, ~5°), plus room
  light. With Photo was lit = Even, graze at the lamp's angle reproduces the photo's
  stroke ridges well. Choosing the real direction (top/top-right) made it WORSE:
  share 0 integrates every cast shadow into a streak along the light. Fix: side
  directions now use `SIDE_SHARE` 0.35 even-light share (presets.js), not 0.
  Synthetic cost (graze-lab, new `oil-raking` case; rigs have no cast shadows):
  vsFull at 1.5° 0.66→0.53 raking, 0.57→0.46 one-light; same-settings corr −0.03;
  broad ~unchanged. Painting A (1031 px, side-lit, set to Even) showed diagonal
  streaks and a dark window read as raised. "Every detail (raw)" is too dark and
  glittery on both; graze renders darker than the photos (room fill light).
- 10-11: merged `claude/epic-wright-h77sdu` into `main` (zoom to 400%, graze fixes below
  now live). The earlier 10-11 push only carried layer masks and graze light.
- 10-11 (merged from `claude/epic-wright-h77sdu`):
  - View zoom 20–400%: stage scrolls past 100%; Ctrl/Cmd+wheel/pinch zooms about the
    pointer; Space/middle-drag pans. Sharp zoom re-renders the visible region from the
    full-res photo after 250 ms idle via `renderTiles` (export.js, shared with Export);
    `renderState(outW)` gives a rescaled state COPY (never mutate live state).
  - Graze artifacts fixed (user: "chunky", "artificial texture" at 1–3°): graze uses
    its own smoothed relief (`GBuffer.buildGraze`, Detail in painting widths), fine
    relief only in shading (Fine texture × tan(e)/tan 10°), own shadow reach
    (`grazeReach`), Clean shadows (blocker bias), Softness (source size). Presets in
    `grazePresets` (presets.js); default = Classic raking. Old saves validate to
    neutral values (look unchanged).
  - `tools/graze-lab.cjs` + `GBuffer.afterHeight` seam: scores the graze vs true
    relief on synthetic paintings. Tried and dropped (negative): azimuth-spread strip
    light, coherence-adaptive smoothing. Tests take `DIGILIGHT_PORT`.
- 10-10 (merged `c074e30`): Graze light section replaces the per-light
  "Graze from L/R/T/B" buttons. `state.graze` `{enabled, angle, elevation, opacity}`
  (angle = where light comes from, 0° right, 90° top) drives one extra hard light in
  `shade.js`, rendered separately and cross-faded over the relit result
  (`uGrazeOpacity`), before layers. Dial in studio.js `renderGraze`; hidden in
  diagnostic views and during Sweep. In history, projects, presets (validated).
- 10-10 (merged `c074e30`): layer masks. Each layer
  has Paint hide / Paint show / Hide all / Reset; strokes live in `layer.mask`
  `{base, strokes}` (like relief `strokes`), rasterised in studio.js into
  `state.layerMaskData` (768², one RGBA channel per layer slot) and sampled in
  `shade.js` (`uLayerMask`, `uLayerSel`); red overlay (`maskOverlay`) only while
  painting, never in exports. Presets drop masks; new photo clears them. Fixed: a
  deferred checkpoint landing mid-stroke split one stroke into two undo steps.
- 10-09 (merged `2e83379`): "Light dots: on/off" toggle (was
  "Light guides") is the only thing hiding dots besides Sweep; grabbing a dot leaves
  Before/Split and brush mode; off-painting lights pin to the edge. Open your painting
  no longer resets edits; a new photo is undoable (history kept).
- 10-09 (`2e83379`): view zoom (− / 100% / + / Show all lights, keys - = 0); dots beyond
  the view pin to its edge, dashed. Graze from left/right/top/bottom + "Grazing side
  light" preset: 3° off the wall, 1 painting width out, power compensated
  (`grazePower`), shadows full-strength and crisp. Lights may sit -1.5..2.5, z down
  to 0.01, angle to 1°, Brightness slider is logarithmic up to 1024. Shadow march
  takes up to 96 steps on long (grazing) shadows; reach cap 0.3 widths.
- 10-09 (`2e83379`): Layers · blend effects — up to 4 layers (Original or Relit
  source, 13 blend modes, opacity, visible, order, duplicate). Composited at the end
  of `shade.js` in sRGB, so exports include them; `state.layers` is in history,
  projects and presets (validated in studio.js `validate`).
- 10-09 (PR #1): texture depth (mm) + painting width drive one height field for shading
  and shadows; even-light relief estimate for evenly lit photos (`photoDiffuse`);
  per-light source size, angular penumbra, physical shadow reach; Quick setup,
  photo-lit compass, light types/Diffusion/Angle/Mirror, Sweep light, Shadows view;
  advanced sliders folded into Fine-tune. Legacy projects load with `physical: 0`.
- 10-09: storage ops queue instead of being dropped (fixed preset-import test failure)
- 09-18: reusable named presets (save/apply/auto/download/import)
- 09-17: Creative Studio — presets, before/after + split, undo/redo, brushes, saved projects (IndexedDB)

## Next up (candidates — confirm with user)
00. User to redo their DSC_8382 scene on the live site with Measure relief (Add the
   sample's lamp photos → Measure relief) and raw graze settings, and send a new
   test bundle (it now carries the measured relief). Then: a crop / "painting edges" tool, so
   raw tripod shots (with wall) can be used as they are.
0a. One-photo estimate on even-lit photos is ~uncorrelated with real relief on the
   user's panels; low lights emboss its grain. Ideas: warn in the UI when an even
   photo is lit low with no measured relief; lower default fine contrast there.
0. Contrast: renders at the measured depth show ~60% of the lamp photos' stroke
   contrast (losses in integration, normal pass, all-lamps-above). Calibrate a gain
   against the lamp photos, or fix the losses; the user says the thickest paint is
   ~4.8 mm (3/16 in), measured 2–98% spread of stroke relief is 1.5 mm.
0b. Model the spot's beam (aim + cone) for the calibrated lamp; the lamp photos
   already measure it (`beam` in lampphotos.js) — could drive the graze lamp so
   Compare matches the photo's pool of light.
1. Earlier review of the sample painting: waxy sheen with extra lights (specular),
   salmon/copper colour drift on the red, dark corners from lamp falloff after Auto-fit.
2. From the real-painting tests: retune/remove "Every detail (raw)"; red ground
   relit brighter/oranger than the photo.
3. Optional "match original brightness" exposure after a lighting preset
4. Large-export memory limits / preview vs export differences at very high res
5. Feedback on layers/masks (maybe a "current result" source, mask brush hardness,
   showing the mask alone)
6. Project save for the multi-photo capture workflow (currently single-photo only)
7. Graze presets on real photos: the 1–1.5° presets lose some ridge shadow and read
   bright (one-photo relief); recheck them on measured relief.

## Gotchas
- Calibrated mode (`state.physical`, single photo only) derives heightScale,
  reliefStrength and shadow reach in `app.js` updateDerived; export tiles reuse the
  preview's measured `heightStats`, never re-measure.
- No backticks inside GLSL comments: the shaders are JS template strings.
- Must serve over HTTP (ES modules); don't open index.html directly.
- Deploy index.html, studio.css, src/, samples/, _headers together.
- Tests must open `/?synth`: the default start is the sample photo.
- Measured relief lives in app.js `measured` (preview-sized RGBA16F texture + the
  Float32 heights), not in state/history; projects save it as `relief` (reliefsave.js);
  a new photo (setSource without keep) drops it. Lamp
  photos must be cropped exactly like the painting photo (same shape) and lamp
  "out" is from the painted face.
