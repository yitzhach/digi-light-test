# DigiLight — Handoff

Start a new chat with: "Read HANDOFF.md and continue." Keep this file short.

## NEXT SESSION STARTS HERE: automated test rounds (user's plan, 10-14)
The user wants Claude to run the tests, not them. Each round:
1. Write `tools/batches/round-NN.json` with **10 variants** (spec format at the top
   of `tools/render-batch.cjs`: base sample or project, lampPhotos/measure, common
   patch, variants with state/graze/lights patches, relief measured|onephoto,
   lightLike N). Vary one or two things per round so the picks teach something.
2. Serve (`python3 -m http.server 8766`) and run
   `DIGILIGHT_BROWSER=/opt/pw-browsers/chromium node tools/render-batch.cjs --spec tools/batches/round-NN.json --out <scratchpad>/round-NN`
   (~2 min for 10 on dsc8382 with Measure relief).
3. Look at `sheet.png` yourself first (Read it); sanity-check `results.json`
   (vsLampPhoto: depth vs photoDepth, local vs photoLocal, lower logRMS is closer
   to the real photo). Send the user `sheet.png` (SendUserFile, render) plus the 2–3
   best single images, with a one-line description per number.
4. The user answers with the numbers that look best (and why). Log the round in
   **Test rounds** below (spec, picks, what it taught), refine, next round. When a
   pick settles a default, change the code (presets/defaults), run tests/browser.cjs,
   push to `main`, update this file.
Bases available: `{"sample":"dsc8382"}` (+ lampPhotos/measure for real lamp photos
to score against), `{"sample":"painting"}` (red panel phone photo, no lamp shots), or
`{"project":"<path>"}` for a user's bundle (unzip `*-test-*.zip`, use
project.digilight.json). Ideas for round 1: room light (graze `fill`) 0.15–0.35 ×
Shadow lift −0.3..+0.5 on lamps 1–3; then the same on the user's own bundle scene
(the 13:31 bundle: one light from 135° + graze 119.5°, opacity 0.75).

## Test rounds
- Round 0 (10-14, `tools/batches/dsc8382-shadows.json`, lamp 1, not yet shown to the
  user as a round): vsLampPhoto (photo depth 0.502, local 0.626):
  01 measured, room 0.06: 0.390 / 0.669 / logRMS 0.311 · 03 measured, room 0.25:
  0.484 / 0.731 / 0.264 (best logRMS) · 05 measured, lift +50%: 0.407 / 0.736 / 0.300 ·
  07 one-photo (Classic raking graze), lift off: 0.269 / 0.384 / 0.676 · 08 one-photo
  lift +100%: 0.319 / 0.511 / 0.570 · 09 one-photo, room 0.25: 0.467 / 0.621 / 0.410
  (local matches the photo) · 10 one-photo, room 0.25 + lift +50%: 0.505 / 0.701 / 0.370.
  Room light is the main lever for both reliefs; lift is a secondary taste control.
- Round 1 (10-14, `tools/batches/round-01.json`, measured relief, graze opacity 1,
  shown to the user on a swipe page with star ratings): room 0.15/0.25/0.35 × lift −30/0/+50% on lamps
  1–3. vsLampPhoto depth / local / logRMS (photo depth 0.502/0.547/0.458, local
  0.626/0.619/0.538 for lamps 1/2/3): 01 L1 0.15 off 0.446/0.708/0.270 · 02 L1 0.25
  off 0.484/0.731/0.264 · 03 L1 0.35 off 0.512/0.746/0.271 · 04 L1 0.25 +50
  0.513/0.792/0.265 · 05 L2 0.15 +50 0.524/0.730/0.262 · 06 L2 0.25 off
  0.530/0.708/0.273 · 07 L2 0.35 −30 0.553/0.724/0.285 · 08 L3 0.15 +50
  0.448/0.697/0.313 · 09 L3 0.25 off 0.463/0.674/0.300 · 10 L3 0.35 −30
  0.491/0.692/0.304. Claude's picks: 02, 05, 09. Taught: room ~0.25 matches depth on
  all lamps; local shadows are too shallow in every variant (+lift makes it worse,
  −lift barely helps) → round 2 idea: fix room 0.25, vary texture depth / stroke
  contrast instead. Renders are redder/more saturated than the photos and lack the
  beam pool (known, Next up 0b).
  User's stars (no notes; said Claude's read was accurate, and the later lamp 3 renders
  had "nice shadow shifting, very realistic"): 09 ★4; 02, 05, 07, 08, 10 ★3; 01, 03,
  04, 06 unrated. → Lamp 3 at room 0.25 is the favourite.
- Round 2 (10-14, `tools/batches/round-02.json`, measured relief, room 0.25, opacity 1,
  lift off unless noted; sent, picks PENDING): texture depth (measured 1.51 mm).
  depth / local / logRMS: 01 L3 1.5 mm 0.463/0.674/0.300 · 02 L3 2.0 0.431/0.605/0.297
  · 03 L3 2.5 0.398/0.530/0.313 (local = photo 0.538) · 04 L3 3.0 0.374/0.473/0.342 ·
  05 L3 4.0 0.360/0.418/0.404 (crusty by eye) · 06 L3 2.5 lift −30 0.393/0.522/0.316 ·
  07 L1 2.5 0.454/0.649/0.262 (best logRMS of both rounds) · 08 L1 3.0
  0.431/0.599/0.280 · 09 L2 2.5 0.459/0.574/0.292 · 10 L2 3.0 0.429/0.513/0.329.
  Taught: ~1.5× the measured depth (2–2.5 mm) closes the fine-shadow gap (matches the
  "renders show ~60% of the photo's contrast" note); it overshoots overall darkness, so
  room light may need to go up with it. Claude's picks: 03, 07, 02. Candidate default:
  Measure relief sets Texture depth ≈ 1.5× the 2–98% spread. Review pages: swipe viewer
  artifacts (round 1 KosdnNmiC9zoeM23RFZXrf, round 2 VDxrYW7MHAhdHfpsis5pEq) keep stars
  in their db collection `ratings` (docs rNN-MM {round, render, stars, why}); read with
  ArtifactData list.
- In-app batch by the user (10-14, phone, Batch preview · Texture depth sweep, 6 looks,
  default range 0.6×–2× of 4 mm = 2.4/3.5/4.6/5.8/6.9/8.0 mm; red panel with the figure;
  relief type and lights not known): **06 = 8 mm was best (★3)**, the deepest look in the
  sweep, so the best value may be above 8 mm. Same direction as round 2: the app needs
  well over the real paint depth (thickest ~4.8 mm) to look right. Next: sweep 7–10 mm
  and ask what keeps it at 3★. User's 2nd sweep 6→10 mm (9 looks, old screen-size
  build): "almost indistinguishable". Measured on the painting sample (default single
  light, one-photo relief, 1050 px), mean |Δ| vs 10 mm in 0–255 luma: 2 mm 14.5, 4 mm 9.3,
  6 mm 5.8, 8 mm 3.5 (mostly overall darkening 74.6→61.4; high-pass/mean only +5% from 2
  to 10 mm). With the Classic raking graze on: 27.2 / 15.4 / 8.9 / 4.9. No code clamp
  (only aoScale saturates at 2 mm): steep slopes saturate the shading, so depth matters
  little past ~6 mm. 0.5 mm steps there change ~1–2 levels. Idea: show each look's
  difference from the previous one in the viewer. 3rd sweep (2→10 mm, 7 looks + current,
  old build, screenshot only): 03 = 3.33 mm best (★3), "very very minor changes" up to
  10 mm. So depth is not what holds the painting at 3★; past ~3 mm leave it (3–4 mm) and
  vary lighting / graze / room light / relief source next.

**Rule:** update this file in the same commit (or right after) every push to `main`.

## Status
- Last updated: 2026-10-14
- **Branch `feature/metrology` merged into `main` (2026-10-14, user asked).** It was:
  building `docs/conoscopic-paper-improvements.md` items in the user's order:
  (1) items 12+13 texture contrast score + Fit depth — DONE on the branch;
  (2) item 3 relief-only raking view + colour-over-relief preset — DONE on the branch; (3) items 1+2+19
  profile probe + calibrated colour height map + ISO stats — DONE on the branch; (4) items 14–16 stroke
  direction / Best raking direction, overexposure warning, glint mask — DONE on the branch.
  All four steps merged into `main`. Ask before
  items 8–11. Each step: before/after images + numbers to the user, test in
  tests/browser.cjs, push the branch, update this file.
- Last code change on `main`: (2026-10-14) **Colour & strokes** section: Keep greys neutral, Vibrance,
  Room light colour, Stroke definition + Stroke size; lighting preset "Gallery spot, upper right"
- Before that: (2026-10-14) Measure relief fits Texture depth to the lamp photos
- Before that: (2026-10-14) Light like this sets room light 0.25
- Before that: (2026-10-14) merge of `feature/metrology`: texture contrast score + Fit depth to photos,
  Relief view / Relief only / Colour over relief, Profile · height map (ISO roughness, colour map),
  clipping warnings, glint masking, Best raking direction
- Before that: (2026-10-14) batch viewer: per-look notes, **Save ratings (.json)**, sharp previews
- Before that: (2026-10-14) batch looks saved as projects; + Light copies the selected light
- Before that: **Batch preview · compare looks** (`src/batch.js`)
- Before that: (2026-10-14) `tools/render-batch.cjs` (batch renders + contact
  sheet + scores vs lamp photos) for the automated test rounds below
- Before that: Shadow lift is two-way: −100..+100%, centre = off
  (left deepens darks: y − 0.8|s| y (1−y)^4)
- Before that: **Shadow lift** slider (each light + Graze light)
- Before that: zoom up to 1000%; phone pinch zoom + Full screen view
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
  (+ `roomLightRGB`: room light tint relative to 6500 K = white)
- `lampphotos.js` (maths) + `lampui.js` (section) — relief measured from lamp photos
- `photocheck.js` — clipping check, stroke direction (structure tensor)
- `probe.js` — Profile · height map section: line profile, ISO roughness, colour height map scale bar
- `texscore.js` — RL-Sq style texture contrast score + depth fit (Fit depth to photos)
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
- 10-14 (pushed to `main`; user: "incorporate this as you see fit"): the user showed an AI-relit
  image of the red panel (`samples/painting.jpg`) they found very realistic. Measured vs the
  photo (aligned, 1000 px): same frame, but the AI REDREW all texture under ~2–3% of the width
  (photo detail kept 0.08 / 0.50 / 0.69 at <3 / 3–9 / 9–27 px; a DigiLight render keeps
  0.58 / 0.92 / 0.99) and graded colour per material: greys barely warmed (red÷blue cast 1.19
  vs photo) while reds saturated (r/g/b shares 0.57/0.26/0.16 → 0.71/0.20/0.09); stroke-scale
  contrast 1.33× the photo's; one light pool from ~25° (right, a little up). The AI's own
  "how I did it" text (Lambert, normals, shadow march, AO) describes what shade.js already does.
  Built the faithful parts, new **Colour & strokes** section (studio.js `lookControls`, under
  Quick setup), all neutral by default (`LOOK_NEUTRAL` in presets.js; also in LEGACY, so older
  saves open unchanged; test checks neutral = keys absent, pixel-identical):
  **Keep greys neutral** `neutralWB` 0–1: divides each path's light by the camera white balance
  `mix(1, sceneWhite(...), n)` (shade.js `sceneWhite`: lights' colour × power, falloff, beam,
  cosine over a 3×3 grid + room light; graze path has its own); **Vibrance** `vibrance` −1..1 on
  sRGB, weight smoothstep(0.04, 0.16, max−min) so greys/darks keep their tint, clip-safe;
  **Room light colour** `roomKelvin` (6500 = the old plain white; `roomLightRGB`), also tints graze
  fill; **Stroke definition** `strokeDef` 0–1 + **Stroke size** `strokeSize` (painting widths,
  default 0.01): band-pass of the relief, smoothed at STROKE_FINE (¼) of the size minus smoothed
  at the size (GBuffer `buildStroke` → T.strokeFine / T.stroke, built only while on), in units
  of its own 2–98% spread (`measureBand`, measured on the preview into `state.strokeSpread`;
  export tiles reuse it; exportImage brings the preview up to date first), creases −3 stops at
  the band edge at 100% (`STROKE_STOPS`), crests +half; multiplies all light (main + graze), so
  colour is untouched. Export margin covers its blur. First version (height minus smoothed, no
  fine edge) darkened grain = "gritty"; the band-pass fixed it. Batch sweeps for all five. New
  lighting preset **Gallery spot, upper right** (light 1.22/0.75/0.45, 4300 K, power 4, room
  0.12, greys 70%, vibrance 35%, strokes 50%); `useLighting` now also applies LOOK keys a scene
  names. Scores vs the AI image (`tools/batches/colour-strokes.json`, painting sample):
  preset grey cast 1.10 (AI 1.19), reds 0.69/0.21/0.10 (AI 0.71/0.20/0.09), stroke contrast
  1.11 (AI 1.33), photo detail kept 0.91 / 0.99. Strokes 100% → 1.27 (kept 0.85); 100% at 2% size
  → 1.33 (kept 0.81 / 0.90) but looks lumpy; 50% looked best. On DSC_8382 measured relief vs lamp
  3 photo (graze opacity 1, room 0.25): strokes 0 / 50 / 100% → texture match 0.82 / **0.99** /
  1.27, local 0.672 / 0.620 / 0.529 (photo 0.538), logRMS 0.299 / 0.344 / 0.436 — 50% closes the
  old "60% contrast" gap in texture terms, but pixel match drops (it darkens creases from all
  sides; real lamp shadows fall one way). Checked item E of the prompt: Fine/Medium/Broad relief
  sliders do work but move the render 1–2/255 — calibrated heights are rescaled to their own
  2–98% spread, so the bands change only the relief's shape. Not changed.
- 10-14 (pushed to `main`; user: "do what creates the best final image"): **Measure relief now
  fits Texture depth** to the lamp photos' stroke contrast right after measuring
  (`lamp.measure({fit})`, default on; runs `fitDepth({fill: LAMP_ROOM, auto: true})`, which
  keeps the spread if no depth matches; result in `res.fit`, two undo steps). DSC_8382 with
  defaults only (`tools/batches/auto-fit.json`, render-batch `autoFit: true`): depth 2.11 mm
  (spread 1.50), Light like this room 0.25 → logRMS vs the lamp photos 0.257/0.274/0.299,
  texture match 96/104/100%; old defaults (1.51 mm, room 0.06) were 0.311/0.331/0.380.
  render-batch keeps the spread for the base unless `autoFit`. Test fix: the fit undo
  test renders before its checkpoint (any pointerup checkpoints, so a pre-render
  snapshot differed after undo and wiped redo).
- 10-14 (pushed to `main`; user said "your call"): **Light like this sets graze room light
  0.25** (lampui.js `LAMP_ROOM`; Fit depth calls `lightLike(i, true)` and keeps the room
  light as set). Spec `tools/batches/room-light.json` (measured relief, fitted 2.11 mm):
  logRMS per lamp with fill = measured room share (0.12/0.21/0.15) 0.290/0.281/0.342
  (mean 0.304), fixed 0.25 0.257/0.274/0.299 (0.277), 2× share 0.257/0.281/0.294
  (0.277). One painting can't separate 0.25 from 2× share (shares only span 12–21%);
  the fixed value is simpler. Revisit with a second lamp set in a brighter/darker room.
- 10-14 (merged to `main` from `feature/metrology`): **photo checks** (doc items 14–16).
  `src/photocheck.js`: `clipping(rgba)` (share with any channel ≥250 / all ≤5, warn over
  0.5%) and `clippingOf(img)` (nearest-sampled at ≤1500 px); warning on each lamp photo
  row (`.lampClip`) and in Calibrate for the painting photo (`#calClip`,
  `cal.checkPhoto`); Fit depth leaves clipped/outside pixels out of both scores
  (texscore `mask`). DSC_8382: lamp 1 0.68% blown (warned), lamps 2/3 0.26% / 0.06%,
  painting photo 0. **Glints** (lampphotos.js `GLINT` {over 1.6, near 1.2, white 235,
  colour 0.15}, `findGlints`, run in the first refine round once the beam is known
  without the relief; `measureRelief({glints})`, `lamp.measure({glints})`): s over
  1.6× the Lambertian maximum |L|/Lz, or over 1.2× while near-white and washed out on
  coloured paint; dilated 1 px; left out (valid/ok = 0), integration fills. Report line
  "Glints left out: …"; `shots[k].glint`, `.glintMask`. DSC_8382: 0.30/0.29/0.07%,
  check 0.868/0.861/0.798 → 0.869/0.864/0.799, depth 1.513 → 1.500 mm (mostly the
  panel's bottom/side edges, where the beam takes in the wall, plus specks on the grey
  impasto). Tried first: test on the first beam (a plain local mean) at 1.0× flagged 8%
  and lowered the check. Synthetic set with 2×2 near-white specks added to lamp 2: found
  0/2.83/0.36%, corr with truth 0.857 → 0.890, lamp 2 check 0.19 → 0.45. Help text has
  the polariser tip. **Best raking direction** (Graze section, `#grazeBest`,
  `__studio.bestRaking()`): `strokeDirection(H)` = structure tensor of the probe's
  heights (strokeDeg, acrossDeg, coherence); scores the graze light alone (texture
  contrast) from across / along / both diagonals (side nearer the current angle) and
  keeps the best; one undo step. DSC_8382: coherence 0.08 (strokes run every way);
  across 12.4%, along (from 82°, the top) 15.6% → picks 82°. Likely helped by every lamp
  shot being lit from above (vertical slopes measured best). Not done from item 14: the
  Measure relief warning when all lamps are on one side.
- 10-14 (merged to `main` from `feature/metrology`): **Profile · height map** section (`src/probe.js`, after
  Measure relief; doc items 1, 2, 19). **Draw a profile**: a drag on the painting (capture
  listeners on `#paper`, so lights/brushes don't see it) draws a line (SVG `#probeOverlay`
  in `#paper`, canvas-pixel viewBox, scales with zoom). Plot (`#probePlot`) of height in
  µm/mm along it; line numbers (ISO 4287, best straight line removed): P-V Rz, RMS Rq, Ra,
  Rsk, Rku; region in view (zoom picks it, 2% border cut; ISO 25178, best plane removed):
  Sq, Sa, Sz (Sp, Sv), Ssk, Sku. Heights: measured relief × mm/px (true) when on;
  otherwise app.js `readHeights()` (api `heights`, `__bench.heights`) = normal target's
  alpha read back as floats (flipped to top-first; corr 1.0000 with the measured map)
  × Texture depth × Relief amount, labelled "estimated". **Height map / Colour height map**
  buttons: Height view with `state.heightColour` (shade.js `turbo()`), scale bar
  `#heightBar` (bottom right of `#wrap`) labelled ±half the render's sampled 2–98% spread
  (`state.heightStats.dir` × mm/px for measured: `info.depthMm` alone was 9% off,
  heightStats samples 128² over the whole image). New event `digilight:views` makes
  app.js redraw the view buttons. DSC_8382, measured relief, line across the figure at
  62% height (20.3 cm): P-V 2.02 mm, RMS 303 µm, Ra 215 µm, Rsk −0.21, Rku 4.98; whole
  painting: Sq 352 µm, Sa 275 µm, Sz 3.39 mm, Ssk +0.09, Sku 3.43; colour bar ±831 µm.
  One-photo at 2.16 mm: same line P-V 2.64 mm, RMS 371 µm; painting Sq 294 µm, Sku 8.23
  (spiky: grain on colour edges). Test in browser.cjs (sine/square-wave ISO values,
  read-back orientation, dragged line = measured heights, scale bar).
- 10-14 (merged to `main` from `feature/metrology`): **Relief view + Relief only / Colour over relief**
  (doc item 3). `graze.grey` 0..1 (validated, in history/projects): shade.js uses an
  even grey albedo `GRAZE_GREY` 0.3 linear under the graze light (flat paint lands near
  mid-grey: DSC_8382 lamp 3 median 128/255) and turns the graze result to its luma (no
  5000 K / room tint). New view **Relief** (`viewMode` 7, app.js VIEWS): graze light on
  grey at 100%, no layers, even while the graze light is hidden (app.js
  `updateDerived` builds the graze relief and reach for view 7 too). Graze section
  buttons: **Grey surface** (toggle), **Relief only** (grey, opacity 1, removes the
  colour layer), **Colour over relief** (same + one Original layer in Overlay at 100%:
  Overlay on a mid-grey relief gives back the colour on flat paint, darker in shadows).
  These export (view 7 itself does not; exports are always view 0). On DSC_8382 the
  one-photo relief view shows its grain and the figure's outline as fake relief; the
  measured one shows the strokes. Test in browser.cjs.
- 10-14 (merged to `main` from `feature/metrology`): **texture contrast score + Fit depth to photos**
  (doc items 12–13). `src/texscore.js`: `textureScore(rgba, w, h, mmPerPx)` = RL-Sq
  style: Rec.709 luma of the encoded values ÷ Gaussian blur of `BIG_MM` 2.5 mm (in mm,
  scales with Painting width), light Gaussian `SMALL_PX` 1.5 px, population std with
  borders cut (2 × big sigma + 3%); `gaussBlur` is a true separable Gaussian (3-pass
  boxes rounded the radius, up to 10% off, which moved the score 20–30% between
  resolutions). `fitDepth(ratioAt)` = doubling grid 0.25→10 mm, then 4 bisections on
  log depth. Measure relief section: **Fit depth to photos** (`#lampFit`,
  `__studio.lamp.fitDepth({lamps})`): each lamp photo scored once (lined up as Compare
  shows it; aligned on the fly if not measured yet), then per trial depth graze = each
  lamp in turn (Light like this), render scored, geometric mean of render/photo driven
  to 1; snapshot restored afterwards except Texture depth, one undo step (batching flag
  blocks checkpoints meanwhile). Readout: depth, each lamp's own crossing (or
  under/over the tried range), photo scores; one-photo relief gets a warning.
  `tools/render-batch.cjs`: vsLampPhoto gains `texture`, `photoTexture`, `textureMatch`
  (render/photo); spec `fitDepth: {lamps, fill, relief}`, variant
  `"state": {"textureDepthMm": "fit"}`. Specs `tools/batches/fit-depth*.json`.
  **DSC_8382 results** (photo scores 0.156 / 0.166 / 0.190 for lamps 1–3):
  measured relief, room 0.25: **fit 2.16 mm** (lamps alone 2.31 / 2.04 / 2.15);
  measured 1.51 mm gives 81% of the photos' contrast, 8 mm gives 169–191% (crusty);
  fitted logRMS 0.257 / 0.274 / 0.300 = best of all rounds. Measured relief, room
  0.06 (Light like this default): fit 1.40 mm (1.49 / 1.36 / 1.38), i.e. the measured
  depth is right if the room light is that low, but logRMS is worse (0.31–0.37), so
  room ~0.25 + ~1.4× depth is the consistent pair (matches round 2's "≈1.5×").
  One-photo relief, room 0.25: fit 6.2 mm (4.77 / 2.48 / over 10 mm) and contrast
  saturates (6.2 → 8 mm: 104 → 107%); the contrast is grain, not strokes (by eye, and
  local shadows 0.42 vs photo 0.63), which is probably why the user's one-photo
  sweeps liked 6–8 mm. Tests: synthetic score checks (flat 0, light pool ~0, two
  resolutions within 12%) + fit on the synthetic lamp set (bracket, settings kept,
  undo). Also fixed a race in the Batch preview test (opening the section reset
  From/To after the test typed them; failed on `main` too).
- 10-14 (pushed to `main`): user asked for a way to hand their in-app ratings to Claude, and
  said a 4.1× zoomed preview was blurry. Batch viewer now has a **note** field per look and
  **Save ratings (.json)** → `digilight-ratings-<painting>-YYYYMMDD-HHMM.json`
  {format 'digilight-ratings', painting, sample, photo w/h, relief measured|one-photo,
  previews {w,h,detail}, looksFrom (sweep setting/range), looks [{num, name, stars, note,
  selected, changed (diff vs base)}], base, settings by look}; the previews zip's
  ratings.json is the same. **The user uploads that file in chat: read `looks` first.**
  New **Detail** select (default Sharp): each look rendered with `api.renderAt(outW)`
  (app.js; exportImage with job.width/height, export.js honours them) from the full photo,
  long side ≤ `SHARP_MAX` 3000. On the painting sample: 1932×2576, ~2 MB WebP a look,
  ~4× slower than Screen size in software GL; finer grain and ~6% darker than the
  1400 px preview (it matches Export full size; the old previews did not).
- 10-14 (pushed to `main`): read the user's PDF (Fontana et al., conoscopic holography on
  Leonardo/Perugino panels) → `docs/conoscopic-paper-improvements.md`: reference feature
  sizes (weave 85–130 µm, retouch 60–90 µm, tool grooves 0.6–1.5 mm apart / ≤30 µm deep)
  and 11 ranked ideas (profile probe with P-V/RMS, calibrated colour height map,
  relief-only raking view, period readout, mm/px hint, finer depth slider, synthetic
  cases, colour-vs-relief mismatch on measured relief only). Docs only, no code.
  Then Part B (items 12–19) from DiSciacca et al. 2026 "Surface roughness from raking
  light images" (RL-Sq: luma ÷ big Gaussian blur, small blur, std; r 0.87 vs
  profilometer Sq): texture-contrast score render vs lamp photo, auto texture depth
  from it, stroke anisotropy / best raking angle, clipping + glint masking for lamp
  photos, repeatability CV, ISO 25178 stats. The user will take these to another chat.
- 10-14 (pushed to `main`): **Batch preview · compare looks** (`src/batch.js`, section after
  Projects; user's idea after the test rounds). Looks = steps of one setting (SWEEPS:
  depth, graze fill, graze lift, all-lights lift, graze elevation, graze opacity,
  exposure; From/To/count 2–10), lighting presets, graze presets or saved presets,
  each applied on a clone of the base snapshot (+ optional current look as #1). Each
  rendered with renderNow, copied in the same task, encoded WebP 0.85 (JPEG fallback,
  e.g. Safari) at preview size. `batching` flag in studio.js blocks history checkpoints;
  base settings restored after. Viewer `#batchViewer` (fixed overlay, own pinch/pan
  shared across looks, hold = original, stars, 4★+ auto-ticks Export full size).
  Export picked = restore each look's settings → api.exportFull → Export format (one
  file or makeZip); Download previews = zip with ratings.json; Use this look =
  restore + checkpoint. Test in browser.cjs; `window.__batch` hook. Test bundle test
  timeout raised to 120 s (took >30 s in software GL on main too). Not yet tried on a
  real iPhone. Ideas: ratings saved with the project, a "my test rounds" preset list.
- 10-14 (pushed to `main`): Export picked also saves each look as a project variation
  ("<project> — <look>", studio.js `saveLook`; re-export reuses the id). **+ Light** now
  starts from the selected light's character (all its values; new spot from newLight,
  aimed at the centre), so added lights match the look; the user asked for this.
- 10-14 (pushed to `main`): test rounds 1 and 2 rendered and sent on swipe/star pages
  (see Test rounds); waiting on the user's round 2 stars.
- 10-14 (pushed to `main`): Shadow lift vs the real DSC_8382 lamp photos. Method
  (scratch script, not in repo): sample + its lamp shots, Measure relief, for each lamp
  Light like this, graze opacity 1, render at lift −1..+1; compare with the aligned
  lamp photo on luma, borders cut: shadow depth = p10/p50 (gain-free), local = p10 of
  y / 51 px box mean (cancels the beam pool), logRMS after median gain match. Means over
  3 lamps (render − photo): measured relief, lift 0: depth −0.11, local +0.03, logRMS
  0.341; lift +0.5: −0.09 / +0.09 / 0.323; +1: −0.07 / +0.14 / 0.323. Graze room fill
  (Light like this leaves 0.06; measurement says room is 12–21% of each shot) at 0.25,
  lift 0: −0.01 / +0.11 / 0.279 — better than any lift. One-photo estimate: shadows far
  too deep (depth 0.13 vs photo 0.50, local 0.18 vs 0.62, logRMS 1.08); lift +1 → 0.17 /
  0.26 / 0.89, helps but nowhere near. CORRECTION: those one-photo runs inherited the
  raw graze settings (Detail 0 etc.) from the measured runs; with the default graze
  settings see Round 0 below: room light 0.25 is the main fix for one-photo too.
  Candidate: Light like this should set graze fill from the measured room share.
- 10-14 (pushed to `main`): user bundle `Untitled_painting-test-2026-10-141331` (iPhone,
  one light from 135° at 22°, graze 1° from 119.5° at opacity 0.75, one-photo relief,
  empty note; their message: upper-left light barely changes the dark recesses vs
  Before). Reproduced to 1.0/255. Darkest 10% of the photo got DARKER relit (44.5 →
  33.5 of 255): relighting multiplies the photo's albedo, so dark paint/baked shadows
  stay dark. Added **Shadow lift** (`l.lift`, `graze.lift`, 0..1, default 0 = no-op):
  shade.js `liftShadows` on sRGB, y + 5 s y (1-y)^6 via luma ratio, s = Σ lift ×
  spot × `poolShare` (1 at the painting point nearest the light, falls with the
  light's falloff); graze: even unless a calibrated lamp. On the bundle at 50%/100%:
  darkest 10% 33.5 → 54 / 75, brightest 10% 94 → 106 / 118. Test in browser.cjs.
  Ask the user how 50% looks on their painting (100% washes out and heats the reds).
- 10-14 (pushed to `main`): view zoom max 400% → 1000% (`ZOOM_MAX` 10, steps add 6/8/10).
  Sharp zoom still caps at the photo's own pixels, so past native size it just magnifies.
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
-3. Colour & strokes (10-14): ask the user how "Gallery spot, upper right" and the new section
   look on their own photos (phone too). Ideas: make Stroke definition directional (weight
   creases by the key light's direction, so it follows real lamp shadows and keeps logRMS);
   a "Match lamp photo" default of strokes ~50% with measured relief; vibrance in the swipe
   test rounds.
-2. User's in-app depth sweeps: 8 mm best (★3) at screen size; ask them to redo it with
   Sharp previews (looks differ) and Save ratings, and to sweep 7–10 mm.
-1. Read round 2 stars (ArtifactData), then round 3: depth 2–2.5 mm × room 0.25–0.35;
   if it holds, make Measure relief set depth ≈ 1.5× the spread.
0d. (In progress on `feature/metrology`, order set by the user, see Status.) Ideas from
   `docs/conoscopic-paper-improvements.md` (
   profile probe + relief-only view are the cheapest; items 12–13, texture-contrast
   score → auto texture depth, go straight at the 60% contrast / depth problem).
0c. (Light like this done 10-14: fixed 0.25.) Calibrate still: set the graze room fill from the lamp measurement's
   room share (0.06 now; ~0.25 matched the photos' shadow depth best, see 10-14).
   One-photo graze shadows are far too deep vs real photos (depth 0.13 vs 0.50).
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
