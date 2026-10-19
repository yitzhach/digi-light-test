# DigiLight — Handoff

Start a new chat with: "Read HANDOFF.md and continue." Keep this file short.

## NEXT SESSION STARTS HERE: upgrade phases (user's plan, 10-15)
One phase per chat. Each phase: build, run tests/browser.cjs (add tests), push to `main`,
update this file (mark the phase DONE, note what the next chat needs).
- Phase 0 — DONE (10-15, on `main`): Original-on-top layer, tool search, Save & export tab, Before export =
  original, blend-mode list with hover preview (Photoshop style).
- Phase 1 — DONE (10-15, on `main`; see Done recently). Open
  questions for the user: are the 8 built-in looks the right set, and is "Strength 0 = the
  settings before the look" the mix they meant (vs mixing toward the plain photo)?
- Phase 2 — DONE (10-15, on `main`; see Done recently). User answered (10-15): open on
  Setup with Analyze showing (done in Phase 3).
- Phase 3 — DONE (10-15, on `main`; see Done recently): overlays + the user's notes (Colour tool
  adjustments with eyes and Opacity, eyes on Fine-tune / Layers / Graze, Auto Opacity, crisper
  built-in looks, opens on Setup + Analyze). Open questions for
  the user: do the fixed looks (Gallery, Raking texture, Long shadows, Soft window, Museum spot)
  still read blurry on their phone; are the overlay defaults (grain 35%, vignette 50%) sensible.
- Phase 3b — user's notes after Phase 3 (10-15), done in this order:
  (a) DONE: tool button pressed again minimizes the panel (`body.panelMin`, `tools.setMin`);
  search icon `#searchBtn` beside the logo drops the search bar open (hidden until then, `/` too,
  closes on pick / Esc / empty blur); double-tap or double-click the painting toggles full
  screen (quick taps only, not on dots or while brushing). (b) DONE: **Relief (3D)** first in
  Colour › Adjustments (`adjust.relief.amount` 0–300%, app.js `reliefBoost` multiplies
  physicalDepth, rebuilds the relief; faded by the Colour eye/Opacity). (c) DONE: "still a bit
  blurry": cause measured = De-light albedo (`albedoSuppress`) 0.7 keeps 0.43 detail/brightness
  vs the photo's 0.74 (0.4 → 0.63, 0 → 0.92); the five crisp Auto looks now use 0.4. Matched
  looks unchanged (0.7). If still soft: offer 0.2–0.3, or a visible "Photo detail" slider.
  (d) IN PROGRESS: **raking round** — 8 graze variants on the red panel (round R1, see Test
  rounds), the user picks the best → set the default graze (GRAZE_DEFAULT / Classic raking).
  User (10-16): can't judge from sheets, needs full-screen A/B (see Status).
  (e) DONE (10-15): **Relief (3D) bands** — user: "too much granular tiny detail … like tons of
  little sand bumps versus true 3-D dimensionality". Added Fine detail / Mid detail (0–300%,
  default 100%), Broad form (0–300%, default 0 = none) and Broad size (25–400%). See Done recently.
  User (10-15): "Broad form is helping"; asked for Broad size to go down to 0% (was 25%) → DONE:
  range 0–400%, 0% = none (its swells are as tall as they are wide, so they fade out smoothly;
  gbuffer.js skips the form blurs at 0). Still ask: is Broad form 100% the right strength?
- (was) Phase 1 — **Automated tab** ("Auto"): one button **Analyze** (reuse photocheck stroke direction,
  measure.js stats, texscore, clipping, photo-lit direction from autoSetup) → a short readout plus a
  grid of 6–8 one-tap looks (built from `looks`/`lighting`/graze presets, each adapted to the
  analysis: depth from texture score, graze across stroke direction, exposure from mean luma).
  Also lists the user's own saved presets/projects as looks, **adapted** to this image (keep the
  look's tone/colour/lighting relations, re-derive image-specific values: azimuth, depth fit,
  exposure target). One Strength slider (mix toward neutral) + Undo. Goal: no 40 sliders.
- (was) Phase 2 — **Mobile tool bar** like Lightroom mobile: a bottom icon strip (Auto, Light, Graze,
  Layers, Colour, Detail, Save) that shows one section at a time on phones (and as a
  vertical rail on desktop); inline SVG icons; panel max-height tuning; bigger touch targets.
- (was) Phase 3 — **Overlays** in Layers: Film grain (amount, size, colour/mono, seed; generated in the
  shader so it is resolution-correct in tiled export), then lighting overlays (vignette, light leak /
  warm glow, soft window light gradient, spotlight pool) each with opacity + blend mode,
  stored in `state.overlays`, saved in projects/presets.
- Phase 4 — DONE (10-15, on `main`; see Done recently): `window.digilight` (src/automation.js),
  URL params + `?bridge` postMessage, `docs/automation.md`, `tools/digilight-cli.cjs`. The MCP server
  came after, in Phase 4b.
- Phase 4b — DONE (10-15, on `main`; see Done recently): MCP server `tools/digilight-mcp.cjs`.
  (10-16: user's Mac is Big Sur, too old for Claude desktop; see Status 4.) Was: ask the user what computer they have (Mac / Windows) and walk them through docs/automation.md
  › MCP server › Set it up (Node, download the repo, `cd tools && npm install && npx playwright
  install chromium`, the Claude desktop config entry). Not tried on a real Mac/Windows yet; whether
  `DIGILIGHT_GPU=1` works there is untested.
- Phase 5 — DONE as an experiment (10-15, on `main`; see Done recently): **Shadow light** (`+ Shadow`
  in Lights). Both ideas built as two styles of one light: **Shade** (idea b, default: multiplies
  all light where its beam falls, tinted, no relief of its own) and **Negative light** (idea a: a
  lamp in reverse, shaded over the relief, subtracted from the lamps, floor = room light). Idea (c)
  (gobo / window-bar shape) not built. Comparison sent to the user (6 frames, sample painting,
  Gallery track). User (10-15): "Number one and four look the best" — on that sheet #1 was No
  shadow and #4 Shade 50% low angle, so most likely the two Shade frames (Shade 60% cool / Shade
  low angle); **confirm**, then decide whether to drop Negative light. User also liked shaped
  shadows ("through a window pane and a few other things") → DONE 10-15: Shade shapes Window,
  Blinds, Leaves (see Done recently); sheet sent. Ask what other shapes they want (ideas: a
  tree branch, lattice / trellis, curtain edge, a person's silhouette, a picture-frame edge).

## Earlier plan: automated test rounds (user's plan, 10-14)
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

- Raking round R1 (10-15, scratch script `rake.cjs`, full-res exports of the red panel
  sample): base = default photo settings + Gallery track light + greys 60% / vibrance 40% /
  strokes 50% / De-light 0.4, graze opacity 0.5 from `findRaking(135)`. Variants (graze patch
  over Classic raking {el 3, detail .01, fine .8, reach 1, clean .3, soft .2}): 01 Classic ·
  02 Gentle (6°, detail .006, fine 1, clean .15) · 03 2° · 04 5° · 05 soft .5 · 06 detail
  .006 fine 1 · 07 detail .015 clean .6 fine .6 · 08 Long shadows clean (1°, detail .012,
  fine .5, soft .15). Picks: PENDING; re-rendered 10-15 into the Round S review page (Raking set).

- AI-match round S (10-15, sent; picks PENDING). Scratch scripts (Playwright + `digilight`
  API: `applyPreset('looks', …)`, `set`, `export` at full size 1932×2576, ~45–60 s each in
  SwiftShader). **Set strokeDir and adjust.relief.fine explicitly on every render**: a matched
  look only sets the keys it names, so both carry over from the previous render (by design,
  looks keep the user's Colour tool settings). Sheet A: looks 05 / 06 / 07 × Stroke direction
  0 / 70 / 100% (robe + red crops); mean |Δ| luma vs 0: 70% ≈ 4.8, 100% ≈ 6.9, mean unchanged.
  Sheet B (whole + robe crop): 1 = 07 as now · 2 = 07 + dir 70% + Fine detail 50% · 3 = 05 +
  dir 70% + Fine 50% · 4 = 09 as now · 5 = 09 + 05's graze (angle 25, el 3, opacity 0.3) ·
  6 = 5 + dir 70% + Fine 50%. Band contrast, std of the band / the photo's (<3 / 3–9 / 9–27 px
  DoG at full size; not the same measure as the AI's "detail kept" above, so not comparable): 1 0.70/0.62/0.68 · 2 0.57/0.54/0.67 · 3 0.64/0.56/0.64 · 4 0.70/0.57/0.60
  · 5 0.86/0.62/0.60 · 6 0.65/0.55/0.61. **The "shading-only glitter cut" already exists as
  Relief (3D) › Fine detail** (shading only, albedo untouched): on 07, Fine 100 / 50 / 0% →
  <3 px 0.70 / 0.57 / 0.50, mean luma 85 → 88; 50% calms the sand and keeps grooves sharp, 0%
  reads soft and blotchy. So no new control was built; candidates are dir ~70% + Fine ~50%.
  **Review page** (10-15): artifact N9ceUJPQ3Ui5HeQoWHbeh5 ("DigiLight Round S", phone swipe viewer,
  full size 1932×2576 JPEGs, Hold flips to the "as now" render): set AI match = S 01–06 above + S 07
  (07 + dir 100%); set Raking = R1 01–08 re-rendered (graze from findRaking(135) = 130°, settings
  as in Raking round R1). Stars in its db collection `ratings`, docs `s-NN` / `r1-NN` {round 'S' |
  'R1', render, stars, why}; read with ArtifactData list. Claude's picks marked: S 02, S 06.
  Round 2's page (VDxrYW7MHAhdHfpsis5pEq) has no saved ratings (checked 10-15).

**Rule:** update this file in the same commit (or right after) every push to `main`.

## Status
- **User, 10-19 (late), NEXT CHAT START HERE: round 3 picks.** The user said "go ahead, use
  look-level settings", and asked for high-level thinking on making this a pro-level relighting
  tool, for people uploading photos and for AI agents driving it. Done this session:
  - **Round 2 keepers folded into the two looks** with look-level settings (auto.js `deeper()`:
    texture depth ×1.65 over the fitted depth, max 10 mm, + fineRelief ×1.4 = A11/A15 within
    2.0/255 RMS of the Colour-tool version; side lamp x −0.05, y 0.4 = B02+B04). Lift darks (A08)
    is made with room light 0.4 + graze.lift 0.9 (same shadow/mid ratio 0.48 vs 0.50); not folded
    in yet, it is a round 3 variant (A12, brighter + lift, was not picked in round 2).
  - **Bug fixed: "tapped ≠ applied".** The favourite looks were fitted (thumbnail, exposure,
    whites guard) with the favourite's Pin light layer at 88%, which pick() never applies. Now
    built-in looks are made with no layers; their LOOK_BIAS moved −0.56 → −0.76/−0.75/−0.78 so on
    the painting they land where approved (−0.33/−0.13/−0.27, was −0.33/−0.14/−0.28). What the user
    saw was ~0.2 stops darker than the looks' fit assumed: likely why "brighter +0.3" was kept.
  - A fixed-angle graze (the favourites' 170°/175°) now mirrors to the photo's lit side with the lamps.
  - **Round 3** (tools/looks/round3.json, 19 versions × the two samples, the door photos are
    still not in the repo): L01/F01 = new looks, L02/F02 = round 2's (controls), then brighter,
    lift darks, raking from lower left / lower, cool fill, 5000 K, and L12/F07 finer raking
    detail (graze.detail 0.02 → 0.01, fine 0.15 → 0.5: 0.02 is ~16 px of smoothing at full size, a
    likely source of the "motion blur"). Rendered on the code before the Pin light fix (same
    images: the applied looks never had the layer). Review page https://claude.ai/artifact/LeAKsrXizCyEQUUgDY4MgW → ArtifactData list
    collection "picks" (docs {verdict, note, name, at}; notes are new).
  - **New review page** tools/looks/review-ab.html: full-screen, hold to flip to the photo / the
    base look / a pinned version, zoom and pan kept across versions, double-tap = 100%, swipe =
    next, Keep/Maybe/Drop + a note per version, Clipping overlay (magenta newly blown, cyan newly
    crushed). Build: tools/looks/stats.py (clip counted as the app counts it: any channel ≥250 /
    all ≤5) + replace `/*DATA*/` with TITLE, ABOUT, PHOTOS [[n,label,w,h]], V [[id,name]], BASE
    {id: compare id}, STATS {n: {id: stats}}; files img/n-id.jpg and t/n-id.jpg (160 px).
  - CLI batch `scale` ({"textureDepthMm": 1.2}: relative edits, docs/automation.md).
  - **docs/roadmap.md**: the plan from a five-lens review (look quality, review flow, AI agents,
    look system, speed) + a critic. Next steps from it, in order: shared metrics on every render
    (src/measure.js, returned by render/export/CLI/MCP); one whites/darks guard after every change
    (today only inside Analyze); a JSON record beside each export; look ids instead of names;
    relief rebuilt only when the surface changes + many variants per build (rounds ~4× faster);
    in-app A/B for uploaders; agent tools (region previews with stats, compare).
  - Ask the user: re-attach the door photos; round 3 picks and notes; the roadmap's questions
    (lamp photos per piece for measured relief, evenness slider, finer graze, blind voting,
    phone or iMac, default look for uploaders, 16-bit/TIFF).
- **User, 10-19, NEXT CHAT START HERE — lighting rounds.** The user will add thoughts on the round 2
  images first; read them, then build round 3. All picks are saved in **tools/looks/picks.json**.
  - **Built-in Auto looks (in auto.js BUILT_IN):** *Favourite, side lamp left* and *Favourite, from the
    left* (the round F1 keepers): the favourite look plus a crisp graze from the left (reach 0.4, soft
    0.1, elevation 8, lift 0.6). Every built-in look's exposure is guarded so it blows out no more
    white than the photo + 0.3% (keepWhites).
  - **Round 2 keepers (10):** A03 brighter +0.3 · A07 crisper fine texture · A08 lift darks · A11
    deeper relief + crisper texture · A15 the same on *from the left* · B02 side lamp lower on the wall
    (y 0.4) · B04 side lamp nearer the edge (x −0.05) · B10 raking light from lower left (190°) · B25
    *from the left* with the raking light lower (6°) · B27 *from the left* + a cool fill light from the
    right. **Maybes:** A10, A14 (5000 K + wide soft pool), A13 (5000 K + deeper relief + lift darks).
    Recipes: tools/looks/round2.json. The user never wants: blur/smear, blown whites, crushed darks.
  - **Pattern:** brighter, lifted darks, crisper and deeper texture, a lamp low on the left, near the
    edge. Next: fold the clear winners into the two looks (exposure +0.3 via LOOK_BIAS, relief fine
    1.4 + amount 1.5 where a look can carry it, lamp y 0.4 / x −0.05) and render round 3 combining
    them (e.g. B02+B04+A11, B10 graze, B27 fill), with clip stats on the page. Note: Colour-tool
    settings (adjust.*: lift darks, relief amount/fine) are NOT carried by built-in looks (pick()
    keeps the user's own adjust); to make them defaults use look-level settings (fineRelief,
    reliefStrength, ambient, graze.lift) or change that rule deliberately.
  - **Photos:** the two plaster door pieces (red lintel, wooden lintel) are not in the repo; ask
    the user to re-attach them. Workflow: tools/digilight-cli.cjs batch photo.jpg --jobs jobs.json
    (one Analyze, cached in ~/.cache/digilight; ~35 s per full-size image on 4 CPUs; run one batch
    at a time). Review page template: tools/looks/review-template.html (replace `const V=/*DATA*/[];` with `const V=[[id,name],...];const STATS={id:html};`, publish with img/ and t/ folders; grid of both
    photos per version, Keep/Maybe/Drop in the page's db collection "picks", clip stats).
- **User, 10-19 (earlier):** round F1 picks: keep 04 + 11 (both lit from the left),
  maybes 00 06 17 20 22 26 28 29, drop 13 30, 19 unmarked = dropped. DONE: two new built-in Auto
  looks, **Favourite, from the left** and **Favourite, side lamp left** (auto.js BUILT_IN,
  crispGraze: reach 0.4, soft 0.1, elevation 8, **graze.lift 0.6** because the user saw crushed
  darks: red lintel black clip 1.04% → 0.29%, photo 0.17%). **Whites guard**: every built-in look's
  exposure steps down until it clips no more than the photo + 0.3% (auto.js keepWhites). **Round 2**
  (tools/looks/round2.json: A = keepers × maybes, B = 30 more variations; B11–13, B17 dropped:
  graze reach/clean/shadow do nothing without physical depth). Rendered BEFORE the lift 0.6 fix.
  Picker with clip stats: https://claude.ai/artifact/6shVeNG5wpP4dWGqPLMhT3 → ArtifactData list
  "picks". CLI batch: `exposureAdd`, `addLights`, a failing job is reported and skipped. Speed
  notes (4 CPUs, software GL): two renders at once = no gain; preview-size renders are ~17%
  softer, so review rounds stay full size; per job ~35 s, most of it the relief rebuild.
- **User, 10-18 (session 017w…), NEXT CHAT START HERE:** **Look catalog round F1.** The user
  asked for ~30 versions of Your favourite (light position, intensity, colour; "no
  blurriness") to build a catalog of default looks and drop the ones that don't work. 31
  versions × both plaster-door photos (re-rendered on main's lifted-blacks favourite), recipes
  in tools/looks/favourite-variants.json (01–30 use a crisp graze: reach 0.4, soft 0.1,
  elevation 8, against the long soft graze that reads as motion blur). Picker page, Keep / Maybe
  / Drop saved in its db: https://claude.ai/artifact/XZyjaDxxn4zZCQMo9wroeB → ArtifactData list
  collection "picks", then add the keepers as built-in looks (auto.js BUILT_IN + LOOK_BIAS) and
  drop the losers. Note: two sessions worked in parallel on 10-18 (both built the analysis
  cache; main kept session 016B…'s). Fetch before starting.
- **User, 10-18, NEXT CHAT START HERE:** plaster doors: **Your favourite (05) is the best on
  both**, but "the blacks were crushed maybe a little too much and need to be lifted slightly".
  DONE (10-18): the look's blacks lifted (presets.js FAVOURITE ambient 0.22→0.3, shadow
  0.85→0.75, graze.lift 0.13→0.3; auto.js LOOK_BIAS 'Your favourite' −0.64→−0.56 so Auto's
  exposure fit keeps the highlights: sample painting darkest 5% 27→34 levels, p50 86→92, p95
  178→179). Tried and not chosen: Colour › Lift darks 25% (lifts mids too: p50 86→100). Ask the
  user to re-attach the door photos to check, and whether it is enough (more: ambient 0.35). **Speed, DONE (10-18): Analyze is cached on disk** (CLI + MCP,
  see Done recently): same photo again = ~13 s for the whole CLI run instead of ~137 s.
- **User, 10-17, NEXT CHAT START HERE:** liked looks 01 Gallery, 04 Matched + raking, 05 Your
  favourite; the others "have a motion blur look". Two new plaster-door photos (red lintel, wooden
  lintel; not in the repo, ask to re-attach) rendered with 01/04/05 plus "b" = heightScale 0.001,
  relief.smooth 0.4, relief.fine 0.5, relief.form 1, lift.amount 0.4. Review page:
  https://claude.ai/artifact/SyQNL84Roazo5e7Qpuh18n . Ask for picks.
  **Speed, DONE (10-17):** `digilight-cli.cjs batch photo --jobs jobs.json` runs Analyze once, then
  each job from the opened settings (6 renders of a 1000×1500 photo: 6 min, was ~20 min). MCP
  `analyze` / `apply_look` run Analyze in the background and answer `stillAnalyzing` within 45 s
  (call again to keep waiting), so the 60 s tool timeout no longer kills it. CLI `--set` now
  applies after `--look`. Timings (software GL, 4 CPUs): Analyze ~140 s, look + full export
  ~15 s, ~60 s with Broad form on (wide tile margin). Never run CLIs in parallel (4 CPUs: slower).
  Ideas if more is needed: cache the analysis per photo on disk; Broad form's margin in export.
- **User, 10-16 (later chat), NEXT CHAT START HERE:**
  1. **User's favourite = built-in look, DONE (10-16):** `Your favourite (10-16)` in Colour ›
     Matched looks and `Your favourite` in Auto (graze turned across the strokes, LOOK_BIAS −0.64
     so it lands at exp +0.04 on the painting sample). Its raking light is now the **default graze**
     (`Broad soft raking`, GRAZE_DEFAULT), which settles raking round R1 (no stars were given;
     the user's own graze points the same way as R1 #4/#5/#7). Ask how it looks on other photos.
  2. **De-light:** `CRISP.albedoSuppress` is now 0 (done, see Done recently). Still ask: new photos
     (app.js 0.7, studio.js FINE_DEFAULTS 0.7) and Matched looks (presets.js 0.7) to 0 too? Note
     the user's own favourite uses 0.2.
  3. **Review pages:** always give the user the **direct link** (e.g.
     https://claude.ai/artifact/N9ceUJPQ3Ui5HeQoWHbeh5); they compare full-res images there.
     R1 is settled by their own graze (above); round S (AI match) still unrated.
  4. **MCP: the user chose the cloud (10-16).** Their 2014 iMac is on Big Sur, too old for
     Claude desktop / Claude Code (macOS 13+). So Claude runs DigiLight for them in cloud sessions:
     `.mcp.json` (digilight server via tools/mcp-start.sh) + SessionStart hook
     (.claude/hooks/session-start.sh: tools/install-deps.sh, DIGILIGHT_BROWSER). **Next chat:
     check the `digilight` MCP tools are listed (open_image, render_preview, …); if not, use
     tools/digilight-cli.cjs.** The user attaches photos in chat; send results with
     SendUserFile or a review page. Local CLI later, when they get a newer Mac (Node 22 +
     Playwright 1.53.2 pin also covers Big Sur, docs/automation.md › Older Macs).
  5. The user pushes to `main` (no session branches). Push to `main` only, never to the session's
     `claude/...` branch (the user asked, 10-16, to get rid of it; the session's git proxy refuses
     branch deletes, so the user deletes them on GitHub › Branches). Branches identical to / merged
     into main (safe to delete): affectionate-cori, batch-preview, compassionate-bardeen,
     great-brown, handoff-continuation, laughing-gates, quirky-rubin, relaxed-euler,
     feature/metrology, dreamy-euler.
  6. **New piece (10-16): steel + plaster**, 17 in (43.2 cm) wide, texture 1–3 mm (user). Plaster
     top, two dark steel plates with a weld seam below. Analyze: even light, depth fit 4.3 mm (too
     deep vs the user's 1–3 mm, so every look was re-rendered at 2 mm), rake 131°. Sent a sheet
     of the 9 looks + full size 06 Raking texture, 07 Long shadows, 08 Soft window; full-res review page of all 9 + the photo:
     https://claude.ai/artifact/FAARtq3vLRypeB9ENxW1om . Claude's read:
     06/07 show the plaster best; every look renders darker/greyer than the photo and the steel
     loses its sheen. **User picks (10-16): 01, 05, 06, 07; "make the steel brighter"; 06/07 "a
     little too noisy / gritty".** Round 2 (same review page, top section): steel lift = Colour ›
     Levels gamma 1.6 + output black 0.05 (steel mean 22 → 57–62, photo 60; plaster 160 → ~200,
     photo 199); de-grit (b "smooth") = graze.fine 0.25, graze.clean 0.65, graze.soft 0.35, Relief
     Fine detail 0.45, Stroke definition 0.25; (c "extra smooth") 0.1 / 0.8 / 0.5 / 0.25 / 0.1.
     Sent 01b, 05b, 06b/c, 07b/c. **User's favourites (10-16): 05b, 06b, 07b** (Your favourite +
     steel lift; Raking texture / Long shadows + steel lift + "smooth" de-grit). Sent them as full-res
     JPGs + .digilight.json projects. User said yes to both ideas → DONE (10-16): Colour ›
     **Relief (3D) › Smooth** and **Lift darks** (see Done recently). Ask how they feel on the site.
     The photo isn't in the repo; ask the user to re-attach it if the session is new.
- Last updated: 2026-10-16 (Smooth + Lift darks controls; steel + plaster piece rendered in the cloud; DigiLight MCP in cloud sessions; Big Sur Playwright pin). Before: 2026-10-16 (De-light 0, search fix). Before: 2026-10-15. Last code change: **iPhone zoom + touch sliders** (see Done recently);
  ask the user whether the iPhone still zooms by itself and whether sliders feel better (not
  tried on a real iPhone, only Chromium phone emulation). Before that (handoff only): **AI-match
  round S** sent to the user, plus a review page for it and R1 (see Test rounds). **Next chat: read
  the review page's ratings first; the user's picks from round S (Stroke direction sheet and the
  6-look combo sheet), then put the winning Stroke direction / Fine detail into the matched looks
  (or a new matched look); still pending from the user: shadow style pick (Phase 5), MCP setup on
  their computer (Phase 4b), R1 raking picks.**
- Last code change on `main` (2026-10-15): **Phase 4b, MCP server** (`tools/digilight-mcp.cjs`,
  shared `tools/digilight-headless.cjs`, `tools/package.json`, tests/mcp.cjs) and **Phase 5,
  Shadow light** (Shade / Negative light), then **Stroke direction** (first step of the AI-match
  work) and **Shade shapes**.
- Before that (2026-10-15): **Phase 4, automation** (`window.digilight`, bridges,
  CLI, docs/automation.md) and **Broad size from 0%**.
- Before that (2026-10-15): **Relief (3D) bands** (Fine detail, Mid detail, Broad form, Broad size).
- Before that (2026-10-15): **Phase 3b** (user notes: tool re-tap minimizes,
  search icon, double-tap full screen, Relief (3D), De-light 0.4 in crisp looks).
- Before that (2026-10-15): **Phase 3** — Colour tool adjustments (`src/adjust.js`),
  overlays (`src/overlays.js`), eyes, Auto Opacity, crisper looks. See Done recently.
- Before that (2026-10-15): **Phase 2, tool rail** (`src/toolrail.js`): bottom
  icon strip on phones (one tool at a time), vertical rail beside the panel on desktop (All by
  default). See Done recently.
- Before that (2026-10-15): **Phase 1, Auto section** (`src/auto.js`, top of the
  panel): Analyze → readout + one-tap looks for this photo + Strength + Undo.
- **Branch `feature/metrology` merged into `main` (2026-10-14, user asked).** It was:
  building `docs/conoscopic-paper-improvements.md` items in the user's order:
  (1) items 12+13 texture contrast score + Fit depth — DONE on the branch;
  (2) item 3 relief-only raking view + colour-over-relief preset — DONE on the branch; (3) items 1+2+19
  profile probe + calibrated colour height map + ISO stats — DONE on the branch; (4) items 14–16 stroke
  direction / Best raking direction, overexposure warning, glint mask — DONE on the branch.
  All four steps merged into `main`. Ask before
  items 8–11. Each step: before/after images + numbers to the user, test in
  tests/browser.cjs, push the branch, update this file.
- Last code change on `main` (2026-10-15): **Original on top**
  layer (Layers section, `state.originalTop`, shader `uOriginalTop`, mixes the untouched photo over everything);
  **tool search** box at the top of the panel (`/` key, autocomplete over sections, labels and buttons; Enter
  opens the section/sub-tab and scrolls to it); **Save & export** section with sub-tabs Save image / Projects /
  Presets / Batch / Testing (built last in studio.js `buildSaveExport`, moves the existing groups);
  Export while Before is showing downloads the original photo (`original-WxH`) with no effects;
  layer Blend button opens a list (`modeMenu`): hover previews a mode, click applies, outside/Esc restores
  (the hidden `.lyMode` select stays for keyboard and tests).
- Before that, on `main`: (2026-10-15) **Matched looks** picker (Colour & strokes): 4 whole looks
  (05 Raking graze, 06 Softer lamp, 07 Brighter, 09 Lower lamp); round 2 looks removed
- Before that: (2026-10-14) **Colour & strokes** section: Keep greys neutral, Vibrance,
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
- `toolrail.js` — tool rail / phone tool strip: tags each panel block with a tool, shows one at a time
- `touchsliders.js` — phone sliders: drag from anywhere along the slider, tap to jump, vertical drags scroll
- `automation.js` — `window.digilight` API, URL params, `?bridge` postMessage (docs/automation.md;
  CLI tools/digilight-cli.cjs, MCP server tools/digilight-mcp.cjs, both on tools/digilight-headless.cjs)
- `auto.js` — Auto section: Analyze (readout, depth fit, raking direction), one-tap looks, Strength mix
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
- `cd tools && npm install` once, then `node tests/mcp.cjs` (the MCP server end to end)

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
- 10-19 (late, on `main`): round 2 keepers in the favourite looks (look-level), the Pin light
  fit bug, graze side mirroring, CLI `scale`, round 3 + the A/B review page, tools/looks/stats.py,
  docs/roadmap.md. See Status.
- 10-18 (pushed to `main`): **Analyze cache.** `tools/digilight-headless.cjs analyzeCached`:
  CLI (`analyze`, `render --look`, `batch`) and MCP (`analyze`, `apply_look`) keep each finished
  Analyze in `~/.cache/digilight/analysis/<sha256(src/ code, input bytes, settings + preview
  size)>.json` (~0.5 MB; the stroke heightmap `strokes.hm`, 37 MB, is left out). `--fresh`
  re-runs; `DIGILIGHT_CACHE=dir|0`. Page side: auto.js `save()` / `load()` (thumbs as JPEG),
  automation.js `getAnalysis()` / `setAnalysis()` (key = settings Analyze started from
  (`A.base`) + preview size + measured relief; refuses a mismatch). Sample painting: 137 s → 13 s
  (browser start-up is most of the 13 s). Look settings from the cache are identical to a fresh
  Analyze; the render differs by mean 0.6/255 (speckle in fine texture, max 49): a fresh
  Analyze leaves some GPU state behind; cached = the same as opening the settings as a project.
  tests/browser.cjs (Auto) covers the round trip. docs/automation.md documents it.
- 10-16 (pushed to `main`): **Smooth** (Relief (3D) › Smooth, `adjust.relief.smooth` 0–100%) and
  **Lift darks** (new Colour adjustment `adjust.lift.amount` 0–200%). Smooth scales, without moving
  their sliders: one-photo fine band ×(1−0.55s) (app.js reliefBands), graze Fine ×(1−0.7s), Stroke
  definition ×(1−0.5s), Clean / Softness move 50% / 19% of the way to 100% (adjust.js SMOOTH,
  smoothGraze; shade.js). Lift darks a: c' = 0.05a + (1−0.05a)·c^(1/(1+0.6a)) at the start of the
  Colour chain (100% = Levels gamma 1.6 + out black 0.05). Both faded by the Colour eye/Opacity.
  Smooth 100% + Lift 100% on the steel piece's 06/07 match the user's 06b/07b (mean |diff| 0.7 /
  1.7 levels, same steel brightness). tests/browser.cjs covers both.
- 10-16 (pushed to `main`): **DigiLight in cloud sessions** — `.mcp.json` (digilight MCP server,
  `tools/mcp-start.sh`), `.claude/settings.json` SessionStart hook (`tools/install-deps.sh`, locked
  so hook and launcher never install at once; exports DIGILIGHT_BROWSER), docs/automation.md › In
  the cloud. `.claude` and `.mcp.json` added to .assetsignore. tests/mcp.cjs passes.
- 10-16 (pushed to `main`): **Big Sur** — tools/package.json pins Playwright 1.53.2 (was ^1.56.1;
  Chromium 138 is the last for macOS 11), docs/automation.md › Older Macs. tests/mcp.cjs passes.
- 10-16 (pushed to `main`): **Your favourite** built-in look (presets.js FAVOURITE; LOOK_KEYS now
  also carries surface, shadow and layer keys, copied with structuredClone) and **Broad soft
  raking** as the default graze (every graze preset now names its Shadow lift, 0 except this one).
- 10-16 (pushed to `main`): **De-light 0 in the crisp looks** (`CRISP.albedoSuppress` 0.4 → 0,
  user's pick of 0.7 / 0.4 / 0). Also fixed **tool search**: picking a hit now closes the search
  bar (it stayed open), and the bar's delayed blur no longer wipes the list after it is
  re-focused; this was what failed tests/browser.cjs line 33. All tests pass.
- 10-15 (pushed to `main`): **iPhone page zoom + finicky sliders** (user: the screen often zooms
  in a bit when selecting tools or after a double tap, then needs a pinch out; sliders "not as
  responsive as they could be"). Zoom: `html { touch-action: manipulation }` (no double-tap zoom;
  pinch still works; #wrap stays none) and, on `pointer:coarse`, every text field / select at
  16px (iOS zooms into a focused field under 16px: tool search, sample and preset menus, number
  boxes). No `maximum-scale` in the viewport (it would stop pinch zoom on Android). Sliders
  (`src/touchsliders.js`, `initTouchSliders` from studio.js after the tool rail): touch only,
  document capture listeners; a sideways drag anywhere on a slider moves the value by the
  finger's travel (no jump on taking hold), an up-or-down drag scrolls and puts back any value
  the browser changed on touch, a tap off the knob jumps there; `change` fires at the end (one
  undo step). CSS on coarse pointers: `touch-action: pan-y`, 36 px tall, 4 px track, 26 px
  knob (THUMB). Rendering was already one frame per rAF; relief sliders still rebuild the
  G-buffer per step, which can lag on a phone. Test: "phone: 16px fields …" in browser.cjs
  (fails without the handler: Chromium jumps the value to the finger).
- 10-15 (pushed to `main`): **Shade shapes** (Phase 5 follow-up). Shade light fields `shape`
  ('pool' default | 'window' | 'blinds' | 'leaves', presets.js SHADE_SHAPES), `patternSize`
  0.25–4, `patternRot` 0–360°; `size` blurs the shape ("Pattern blur"). Shader `shadeShape`:
  the point as the shadow light sees it (basis ⟂ to its aim, divided by depth and tan of the
  cone's half-angle, so −1..1 at the beam edge), rotated and scaled, so the shape is projected
  like a gobo: stretches at a low Angle to wall, grows with Distance. Window = bars every
  ~0.67 beam-widths (width 0.06); blinds = slats, 6 per beam-width; leaves = 3-octave value noise
  at 0.47. Multiplies the pool `b`. UI: Soft pool / Window / Blinds / Leaves buttons
  (`.shadeShapes`), then Pattern size / turn / blur. Validated ("Invalid shadow shape."),
  saved only when not the default. Test in the Shadow light block.
- 10-15 (pushed to `main`): **Stroke direction** (Colour › Light colour & strokes, `strokeDir` 0–1,
  default 0 = as before; LOOK_NEUTRAL, auto.js SURFACE). Stroke definition's band (strokeFine −
  stroke heights) is also sampled a Stroke size (strokeSigmaPx texels) either side toward the
  strongest lamp (shade.js `strokeLamp`: direction from the painting centre, `share` = 0 overhead
  … 1 in the wall plane); `c = mix(c, 0.75·(lo − hi)·k, strokeDir·share)`: paint rising toward the
  lamp darkens, the facing side lifts, so creases are dark on one side only. Off when Stroke
  definition is 0. On the sample with matched look 07: mean unchanged, fine (<2 px) contrast
  −8%, stroke band (2–8 px) −6% at 100%. **Not yet shown to the user**, and no look uses it yet:
  ask whether it reads more like the AI image; if yes, put ~0.7 in the matched looks / CRISP.
  Test "Stroke direction" in browser.cjs.
- 10-15 (pushed to `main`): **Phase 5 — Shadow light.** A light with `kind` 'shade' or 'negative'
  (presets.js `LIGHT_KINDS`, `isLamp`; absent = 'light'), `dark` 0–1 (Shade's Darkness). Shader
  (shade.js): `uLightKind`, `uLightDark`; Shade: `shade *= mix(1, (1-dark)·mix(1, tint, min(1,
  2·dark)), spot·poolShare)` applied to lamps + room light and to the graze pass (Darkness 0 = no
  change); Negative: same BRDF + cast shadow as a lamp, summed into `taken`, `acc = max(acc − taken,
  0)` before the room light; tint = colour/luminance for Shade, `1.5 − 0.5·t` for Negative (the full
  opposite turned pale paint cyan). Shadow lights skip Shadow lift, the Shadows view, white balance
  (`sceneWhite`) and are never the key in `lightReach` / `keySide`. UI (app.js `newShadow`,
  `shadowPanel`): `#addShadow` "+ Shadow" beside "+ Light" (dot at 0.3, 0.7 straight on, cone
  0.8, edge 0.85, 9000 K, Darkness 60%), tab "Shadow N", dark ringed dot (`.handle.shadow`),
  panel: Shade / Negative light, Darkness (or Strength = power), Size (cone 0.985…0.4), Edge,
  Angle to wall, Distance, Tint (K); More: Falloff, Aim, Source size. Validate checks kind/dark;
  mixSettings fades `dark` too. API: `digilight.addLight(kind, fields)`, `removeLight(i)`;
  MCP `add_light` / `remove_light`. Measured on the sample (Gallery track): Shade 60% → ×0.56 at
  the pool centre, ×1.00 far; test "Shadow light" in browser.cjs.
- 10-15 (pushed to `main`): **Phase 4b — MCP server.** `tools/digilight-mcp.cjs` (stdio,
  `@modelcontextprotocol/sdk` 1.32 + zod 3, deps in `tools/package.json`, `cd tools && npm
  install`). One headless page per session, opened on first tool call (`digilight-headless.cjs`
  `launch`: own static server or `DIGILIGHT_URL`, SwiftShader unless `DIGILIGHT_GPU=1`), reopened
  if the browser dies. Tools: open_image (path / URL / project / sample:), open_project, info,
  analyze, list_looks, apply_look, list_presets, apply_preset, describe_settings (filter),
  get_settings, set_settings (object or "a=1;b=2"), add_light, remove_light, undo, redo,
  render_preview (JPEG image content, max_size default 800), export_image (path, width, quality;
  format from extension), save_project. Errors → `isError` results; page errors appended;
  progress notifications every 5 s when the client sends a progressToken (Analyze ≈ 8 min in
  SwiftShader here, 94 beats). Starts on the synthetic painting (?synth) until open_image. CLI
  refactored onto the shared module. `node tests/mcp.cjs` (≈ 1.5 min; `--full` adds analyze).
  Setup for the Claude desktop app / Claude Code in docs/automation.md (plain words).
- 10-15 (pushed to `main`): **Phase 4 — automation.** `src/automation.js` (`initAutomation` from
  studio.js, after Auto; `window.digilight`, API_VERSION 1). Calls (all queued one at a time, each
  a Promise): ready, info, load(URL | data URL | Blob | {sample}), settings, get(path),
  set(path, value | {path: value}) — dotted paths into the snapshot (`lights.0.power`,
  `adjust.relief.form`); the whole changed snapshot goes through studio `validate` (as an
  imported project), then restore + one checkpoint; a bad value throws "<validate message>:
  nothing changed (asked …)" and changes nothing; unknown names throw — setSettings, describe
  ([{path, label, min, max, step, value}] from the panel's sliders, graze, lights, ADJUSTMENTS,
  OVERLAYS), presets / applyPreset(kind lighting|graze|looks, name) (studio `presetTables`),
  analyze (auto.analyze → JSON summary + looks), looks, applyLook(name|index, {strength}),
  undo, redo, render (preview) / export ({width} → api.renderAt, else exportFull) as data URL
  or `as: 'blob'`, getProject / setProject (studio `project()` / `open()` under its storage
  queue with `loading` set). **Bridges**: URL params once on open (`?image= | ?project= |
  ?sample=`, then `?set=a=1;b.c=2` or JSON, then `?look=Name&strength=` or `?analyze`; errors
  go to `#hint`); `?bridge` = postMessage `{digilight: id, method, args}` → `{digilight: id,
  result | error}`, only from window.parent / window.opener, notice `#bridgeNote`, posts
  `{digilight: 'ready'}` on start. **CLI** `tools/digilight-cli.cjs` (own static server, ?synth
  start, Playwright): info / analyze / describe / get / render; --preset kind:name, --set,
  --look --strength, --out, --width, --preview, --save-project. Start + preview render ≈ 45 s in
  SwiftShader. Test "automation API" in browser.cjs (own context: set/validate/undo, project
  round trip pixel-identical, presets, export width, Blob, ?set=, iframe bridge).
  **Broad size** (user, 10-15): range now 0–400% (was 25–400%); 0% = none (formOn needs
  formSize > 0; formScale ∝ size so it fades out smoothly); test checks 10% differs, 0% = base.
- 10-15 (pushed to `main`): **Relief (3D) bands.** `adjust.relief` gains `fine`, `mid` (multipliers
  on the one-photo relief's fine band and on its medium + broad bands; slope shader `uBands`),
  `form` (0 = none) and `formSize`. app.js `reliefBands(st, W)` fades them by the Colour
  eye/Opacity like `reliefBoost` and is stored as `st.reliefBands` in updateDerived (export tiles
  get it via renderState); a change rebuilds the relief (`builtRelief` key). **Fine/Mid scale
  their band alone**: when either is not 100% gbuffer.build estimates once at 100% to measure
  `heightStats`, then again with the multipliers, so Fine 0 does not deepen the strokes.
  **Broad form**: luminance band log(blur σ FORM_INNER·size / blur σ FORM_OUTER·size) (4 and 24 ×
  Texture size × Broad size) as a height, light forward / dark back, in both estimates (slope.a →
  height.b, `uForm` in the normal pass); no chroma reject (it would print the grain back in).
  Its 2–98% spread (`heightStats.form`) is scaled to FORM_GAIN 0.1 × its own width (outer σ) at
  100%, so the swells keep their shape whatever Texture depth, size or resolution; Relief still
  scales them. Calibrated relief only (legacy projects: 0); measured relief ignores the bands.
  The wide blurs start from the broad blur (a strided wide kernel on the raw image aliased into a
  dot grid). Shadow reach × `reliefSpan` (max(fine, mid) + formScale); export margin covers 3σ of
  the form blur. Measured on the red panel (preview, default light), mean |Δ| luma vs as set:
  Fine 0 2.9, Mid 0 1.3, both 0 3.6 (the rest of the "sand" is baked into the photo; De-light
  controls that), Fine 300% 5.0. In the Relief view (graze 3°) Broad form 100% already throws
  long shadows; under the normal light 100% is a gentle swell, 200–300% strong. Test: "Relief
  (3D) bands" in tests/browser.cjs (no-op at defaults, stats unchanged, tiled export, eye, validate).
- 10-15 (pushed to `main`): **Phase 3 + user notes.** User's notes (with a Photoshop Image ›
  Adjustments menu screenshot): eyes (visible/hidden) on Fine-tune and other tools; Colour tab
  with Brightness/Contrast, Levels, Curves, Exposure, Vibrance, Hue/Saturation, Color Balance,
  Black & White, Channel Mixer (not Color Lookup, Photo Filter), each with an eye, plus a master
  eye and opacity for the tab; looks Raking texture … Museum spot and Gallery "blurry" (the
  first three sharp); Strength "works fine but is more like a light direction tool", add an
  Opacity vs the original; open with Setup and Analyze both showing; test on the red panel.
  Built:
  **Colour tool** (`src/adjust.js`, `state.adjust` {on, opacity, brightness, levels, curves
  {rgb,r,g,b point lists}, exposure, vibrance {saturation; amount stays `state.vibrance`},
  hueSat, balance, bw (off by default, Photoshop weights 40/60/40/60/20/80 + tint), mixer}):
  shader `adjustColour()` on sRGB in the menu's order where vibrance used to be (before the
  layers, so a Relit layer sees it); master `uAdjMix` = mix(unadjusted, adjusted). The Colour
  eye/Opacity also scale Keep greys neutral, Room light colour, Stroke definition (`colourShare`
  in shade.js). Every adjustment's defaults are an exact no-op (uniform `on` flags only set when
  a value differs). Curves: monotone cubic (Fritsch–Carlson) → 256×1 RGBA LUT (`curveLUT`,
  texture `uAdjCurve`, master in alpha, applied master then channels); editor canvas: click adds,
  drag moves, drag out / double-click removes. Moving a hidden adjustment's control shows it;
  double-click a slider name resets it. Section `#colourSection` (was the h2 Colour & strokes):
  Opacity, Matched looks, Light colour & strokes, Adjustments.
  **Overlays** (`src/overlays.js`, `state.overlays` {on, grain, vignette, leak, window, pool},
  all off by default) at the end of Layers: after the blend layers, before Original on top (so
  Opacity fades them). Shapes in painting coordinates (`gUV`); grain = 2-octave value noise on a
  grid of `GRAIN_CELL` 1/1500 painting width × Size, so preview and export match (red panel,
  size 6: preview vs full-size export grain correlation 0.996, rms 25.9 vs 25.0). Each: eye,
  opacity, blend mode (the layers' hover-preview list, `modeMenu(obj, btn, redraw)`), colour.
  **Eyes** (`eyeButton` in adjust.js, in section summaries): Colour, each adjustment, Overlays +
  each, Layers (`state.layersOn`), Graze (mirrors Visible), Fine-tune (`state.fineHidden` stash:
  hiding sets FINE_KEYS to FINE_DEFAULTS and keeps your values; exposure, ambient, the photo's
  own keys and derived ones untouched; moving a Fine-tune slider while hidden shows it first).
  **Auto**: Opacity = 1 − originalTop (same control as Original on top). The five hazy built-in
  looks get `CRISP` {greys 60%, vibrance 40%, strokes 50%} (the round 1 matched values). Measured
  on the red panel: the hazy/sharp split was exactly LOOK_NEUTRAL (strokes 0, no white balance)
  vs the matched looks; with CRISP, by eye clearly crisper and less orange (Laplacian barely
  moves: it is mid-scale stroke contrast and haze, not pixel sharpness). Analyze measures with the
  Colour tool and overlays off (grain would read as texture), thumbnails show them; built-in looks
  keep the user's layers, colour, overlays, Fine-tune eye; Strength switches those at 50%.
  **Tool rail** opens on Setup every visit; Setup also shows the Auto block (`ALSO`); layout
  changes still go back to the last tool of that layout. Tool search indexes adjustment and
  overlay names. Tests: new Phase 3 block in browser.cjs; desktop/phone rail tests now expect
  Setup. Search bar: it exists since Phase 0 (top of the panel, `/`); told the user.
- 10-15 (pushed to `main`): **Phase 2 — tool rail** (`src/toolrail.js`, `initToolRail` from studio.js
  before buildSearch; `__studio.tools` {show, reveal, current, toolOf}). Tools: Setup (open photo,
  Demo & capture, Quick setup), Auto, Light, Graze, Layers, Colour (Colour & strokes), Detail
  (Calibrate, Measure relief, Profile, Local texture correction, Fine-tune, View), Save, and All
  (desktop only). Each top-level block of `#panel` / `#creative` gets `data-tool` from an anchor id
  (`ANCHORS`; the h2 in front of a .grp goes with it); anything unlisted falls under Detail;
  `.toolHidden` hides the rest. A tool that is one folding section opens it. Tool search
  `go()` calls `tools.reveal(el)` first. Last tool per layout (phone/desk) in localStorage
  `digilight.tool`. Layout (studio.css end): desktop grid `1fr 62px 320px` (rail order 1, panel
  order 2); phone ≤860px rows `auto minmax(160px,1fr) auto auto`: toolbar is one sideways-
  scrolling row, panel max 42dvh and only as tall as the tool, strip at the bottom with
  safe-area padding (painting ~370 px tall on a 390×844 phone, was ~300). `pointer:coarse`:
  buttons/selects ≥ 40 px, sliders 32 px, light dots 34 px, bigger summaries. Search box is
  sticky. Full screen hides the rail. Tests: desktop rail + phone strip in browser.cjs; the
  older phone test taps Detail before Local texture correction; the main page goes back to
  1350×900 after the mobile layout check (the tests after it are desktop tests). Also fixed (app.js `setZoom`,
  `zoomCentre`): zoom buttons drifted off the middle (6.5 px at 1000% once the stage was 62 px
  narrower) because each step re-read the centre from whole-pixel scroll; now a middle zoom
  reuses the exact point when the measured one is within 1.5 px of it. Test race fixed: the
  "My gallery look" preset test now clears `#presetStatus` before saving (a stale "Saved…"
  from the Auto test's preset let it apply while the save still held `loading`).
- 10-15 (pushed to `main`): **Phase 1 — Auto** (`src/auto.js`, `initAuto` from studio.js, section
  `#autoSection` above Quick setup, open by default; `__studio.auto` {analyze, pick, analysis,
  active, setStrength}). **Analyze** (one history-free pass, settings restored after; batching on):
  readout lines Tone (p5/p50/p95 luma, clipping via photocheck `clippingOf`, saturation), Light
  (Photo was lit if set; else "taken as evenly lit" + the brightness plane, `lightPool`, shown
  only: on both samples it followed the paint, red panel 85% brighter lower right, DSC_8382 57%
  right, so it does NOT pick the key side), Strokes (texscore of the photo; studio `findRaking`
  = the old bestRaking search without applying, from the key side), Depth, Looks. **Depth fit**
  (not with measured relief, which keeps its own): under plain Gallery track the depth where the
  render's stroke contrast is `RELIEF_GAIN` 1.21× the same render at 0.25 mm (texscore
  `fitDepth`, clamped 0.3–6 mm). Calibrated on the depths the user settled on: painting 3.3 mm
  → 1.21×, DSC_8382 2.1 mm (lamp fit) → 1.24×; render/photo contrast alone was 0.90 vs 1.53
  there, useless as a target. Result: painting 3.70 mm, DSC_8382 1.75 mm. **Looks** (8 built-in:
  Gallery, Gallery spot, Matched (07), Matched + raking (05, graze at the raking angle), Raking
  texture (Classic 50%), Long shadows (clean, 60%), Soft window, Museum spot), lights mirrored
  left↔right (`keySide`) only when Photo was lit names a side; graze at the found angle.
  **Exposure**: each built-in look fits the render's mean linear luma to photo mean × 2^bias,
  `LOOK_BIAS` measured on the painting so each lands at its approved exposure there (Gallery 0,
  07 +0.6, 05 +0.35, rest 0; fits within ~0.1 stop); DSC_8382 lands at about the same exposures
  since the render's brightness already follows the photo's. **User presets (up to 8) and saved
  projects (6 newest, not the open one)** become looks too: their settings, with the photo's own
  keys kept (width, Photo was lit, azimuth, brush corrections), fitted depth, graze at the found
  angle, masks dropped, exposure = their own + the Gallery look's fitted shift here. Tiles: 240 px
  thumbnails (the exposure fit's last render). **Pick** = one undo step; **Strength** 0–100%
  (`mixSettings`: numbers linear, lights paired by place, unmatched ones fade by power, graze
  angle on the short arc, layers switch at 50%, brush corrections kept; 0 = exactly the previous
  settings); built-in looks keep the user's layers and Original on top. A pick after a hand
  edit mixes with the edited settings. New photo clears the looks. Cost: ~110–150 s per Analyze
  in headless SwiftShader at 1050–1380 px (a G-buffer build ≈ 6 s, a render read back ≈ 3 s
  there); a real GPU is milliseconds per render. Looks are made in an order that shares G-buffer
  builds. Test in browser.cjs (240×300 fixture). Test lesson: a test that saves a preset must delete it
  again: the later preset test waits on the status text starting "Saved", and a stale one let it race
  a running save (`loading` blocks the next checkpoint, so its undo step went missing).
- 10-15 (pushed to `main`): AI-match batches on the painting sample (scratch export script, full
  res via __bench.exportFullRes; gallery artifact YDRAaxqTrahptwwoy3pQw8). Round 1 (01–10, base:
  lamp 1.22/0.75/0.45 4300 K, room 0.06, rolloff 1, exp +0.35, greys 60, vib 40, strokes 50):
  tone p10/50/90 0.06/0.24/0.60 vs AI 0.05/0.22/0.61. **User picked 05 (graze 25°), 07 (brighter),
  09 (lower lamp)**; still prefers the AI for "more natural texture (less fine texture) and a bit
  more depth". Round 2 (11–18, picks combined: z 0.3, exp +0.55, graze 30%, Texture size 8, Fine
  texture 0.2, strokes 60–80%): De-light albedo 0.8–0.9 brings fine-grain contrast to 0.69–0.77
  of the photo's (AI 0.71); costs some stroke contrast and leaves a few smudged patches where
  baked grain is removed. Texture size 8 + Fine 0.2 alone: grain 0.94, strokes 1.27. User asked for
  these as presets → `looks` in presets.js, **Matched looks** select at the top of Colour &
  strokes (studio.js `useLook`): sets lights, LOOK_KEYS (room, rolloff, exposure, Texture size,
  Fine texture, De-light, colour & strokes) and the graze light (off when the look has none),
  undoable; test in browser.cjs. **User's verdict: round 1 05, 06, 07 are best; round 2 (11–18)
  "not at all usable, kind of blurry and very unnatural texture"** → round 2 looks removed; looks
  kept: 05, 06, 07, 09. Lesson: do NOT soften grain via De-light albedo / Texture size 8 /
  Fine 0.2; the AI's "less fine texture" was re-synthesised detail we can't fake by blurring.
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
-5. (10-19) Round 3 picks → fold into the looks; then docs/roadmap.md NOW/NEXT in order.
-4. NEXT CHAT STARTS HERE (10-15): the AI-match work. The user's favourite remains the AI image
   (`samples/painting.jpg` relit by a generative model; the user can re-upload it): "more
   natural texture (a little less fine texture) and a bit more depth". Best DigiLight looks:
   Matched looks 05 / 06 / 07 (round 1 base: lamp 1.22/0.75/0.45 4300 K, room 0.06, rolloff 1,
   exp +0.35, greys 60, vibrance 40, strokes 50%). Tone and colour already match the AI; what's
   left is texture and depth. Ideas that do not blur: make Stroke definition directional (lit
   crest edges facing the key, darker far side, like the AI's rims); a little more depth via
   graze + lower lamp combined (05 + 09); reduce glitter from the one-photo fine band in the
   SHADING only (not in the albedo, which is what made round 2 smudgy). Gallery of both rounds:
   artifact YDRAaxqTrahptwwoy3pQw8. Scoring scripts were scratch-only (aligned AI vs photo,
   band contrast, colour shares); rebuild if needed. (10-15: directional Stroke definition DONE as
   the Stroke direction slider, see Done recently. 10-15: glitter cut = existing Fine detail
   slider, 05 + 09 rendered; round S sent, see Test rounds; next: the user's picks.)
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
- `window.digilight.setSettings` takes top-level keys only (dotted paths are ignored silently);
  use `set({'adjust.levels.gamma': 1.6})` for paths (the CLI's --set and the MCP set_settings do).
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
