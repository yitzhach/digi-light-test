# Improvement ideas from two surface-metrology papers

- **Part A**: "Panel Painting Surface Investigation by Conoscopic Holography"
  (Fontana et al., INOA/ENEA), items 1–11.
- **Part B**: "Surface roughness from raking light images" (DiSciacca, Crockett,
  Lackey, Messier, *Surf. Topogr.: Metrol. Prop.* 14 (2026) 025001), items 12–19.

These are ideas only. No code has been changed for any of them.

# Part A: Conoscopic holography (Fontana et al.)

Source: R. Fontana, M.C. Gambino, E. Pampaloni, L. Pezzati (INOA, Florence),
C. Seccaroni (ENEA). The paper uses a conoscopic laser micro-profilometer to survey
Leonardo's *Madonna dei Fusi* and two Perugino panels. It then looks at the 3D data
in three ways: grey-level height images, false-colour topographic maps with line
profiles, and "simulated raking light" made by an embossing filter.

DigiLight cannot use the hardware. What it can use:
1. the ways the paper looks at and measures the data,
2. its real-world sizes for surface features, as test cases and slider ranges,
3. one point that agrees with what we found: relief has to be measured separately
   from colour.

## What the paper tells us (data worth keeping)

| Feature (paper) | Size | Where |
|---|---|---|
| Sampling step, whole painting (50×38 cm, 4 tiles, >3 M points) | 250 µm | Madonna dei Fusi |
| Sampling step, detail areas | 50 µm (faces), 125 µm (gesso grooves) | both |
| Probe: depth resolution / accuracy / lateral resolution | <1 µm / <6 µm / ~20 µm | instrument |
| Canvas imprint from a past transfer, yarn spacing | 85 µm (weft) × 105 µm (warp) | Madonna, Fig. 5–6 |
| Canvas seen in X-ray (different canvas), yarn spacing | ~130 µm | Madonna, Fig. 5b |
| Canvas imprint amplitude | ~20 µm (P-V 0.05 mm, RMS 13.5 µm on the patch) | Fig. 6 |
| Raised retouch on the Child's cheek (invisible in colour) | 60–90 µm thick (P-V 0.134 mm) | Fig. 7 |
| Toothed-tool grooves in gesso: spacing | 0.6–1.5 mm | Perugino, Fig. 9–13 |
| Toothed-tool grooves: depth / length | ≤30 µm / up to ~10 cm, parallel, never crossing | Fig. 11 |
| *Gesso sottile* layer thickness (from a lacuna) | ~100 µm | Fig. 11 |
| Region P-V / RMS on a groove patch | 0.47 mm / 0.10 mm | Fig. 11 |

Compared with our test paintings: the user's red panel has a 2–98 % stroke-relief
spread of 1.5 mm and thickest paint around 4.8 mm, so it is 10–100× deeper than
anything in the paper. The paper's features are a separate range: smooth panels,
craquelure, retouches and tool marks, all between 20 and 100 µm.

Resolution check: DSC_8382 is cropped to 1378 px across a 19 in (48.3 cm) panel,
which is about **0.35 mm/px**. That is close to the paper's 250 µm whole-painting
step, which was still fine enough to show transfer wrinkles, thick retouches and
support waviness. Tool marks (0.6–1.5 mm period) are at the limit: a period has to
be at least 2 px, so about 0.7 mm. Canvas weave (85–130 µm) needs about 40 µm/px,
which means close-up shots, never a whole-painting photo.

## Proposed improvements (most useful first)

### 1. Profile probe: line profiles with P-V and RMS (new tool)
The paper's main measurement tool (Figs. 6, 7, 11, 14) is a cursor on the height
map. It shows the X and Y height profiles through that point in µm, plus the
region's **P-V** (peak-to-valley) and **RMS**.
- The user drags a line on the painting (or clicks to get two orthogonal lines).
  A small plot shows height in mm/µm along the line, with P-V and RMS for the line
  and for the visible region.
- Data source: the measured relief's Float32 heights (`measured` in app.js) when
  they exist. Otherwise use the G-buffer height scaled by `textureDepthMm`, labelled
  "estimated".
- Why it matters for us: it lets the user check Texture depth against a ridge they
  can measure with a ruler or calliper. That is Next up #0: renders show about 60 %
  of the photo's contrast, and the app needs well over the real depth to look right.

### 2. Height view as a calibrated topographic map
The Height view (`uViewMode == 2`, shade.js) is plain grey with an arbitrary gain
(`uHeightView` 1 or 8) and no scale.
- Add a colour option to the Height view and a colour bar labelled in mm/µm (the
  paper uses a rainbow ramp, Figs. 6/7/11). Use a perceptual ramp (viridis/turbo)
  rather than plain rainbow. Calibrate it when `state.physical` or measured relief
  is on.
- Keep the grey version: the paper's Fig. 5a shows grey is best for periodic
  texture such as weave.

### 3. "Relief only" raking view (albedo flattened)
The paper's most-used image (Figs. 3b, 4c, 9, 10, 13b, 14b) is the height field lit
by a raking light with **no colour**. It shows what the colour hides, for example
the cheek retouch, which "is not visible in the colour image".
- New view mode: shade with a uniform grey albedo using the graze light (or the
  current lights). This is cheap: one more `uViewMode` branch in shade.js.
- Uses: a clean check of measured relief quality, a direct view of the one-photo
  grain that causes the "motion blur" streaks (HANDOFF 10-13/10-14), and an export
  in the style conservators already use.
- Also add a **colour-over-relief** blend, as in Fig. 4b (colour image on the raking
  relief). The Layers system can do this with an Original layer in Multiply/Overlay
  over a relief-only render. A preset would make it one click.

### 4. Spacing / period readout on a profile
The paper tells tools and canvases apart only by their period (0.75 / 0.95 / 1.2 /
1.5 mm grooves; 85 vs 105 vs 130 µm yarns).
- On a profile from item 1, report the main period from an autocorrelation or FFT
  peak, in mm (using `paintingWidthCm` / photo width).
- Show the smallest period this photo can resolve (2 × mm/px) and grey out the
  readout below it.

### 5. Show mm per pixel in Quick setup
Next to Painting width, show "0.35 mm/px". Add a hint about what that resolution
can show, using the paper's scale: about 0.25 mm finds wrinkles, retouches and
support waviness; 0.05–0.125 mm finds tool marks and canvas weave. It costs almost
nothing and tells users when to take close-ups.

### 6. Texture depth range for smooth panels
The Texture depth slider runs 0–10 mm in 0.05 mm steps (index.html), so 20–30 µm
grooves and a 100 µm gesso layer cannot be entered.
- Make the slider logarithmic (for example 0.01–10 mm) or add a µm step below
  0.1 mm, and show µm below 1 mm.
- Possible presets: "Panel / gesso (0.03 mm)", "Retouched panel (0.1 mm)" next to
  the impasto values.
- We have not checked whether the "needs ~1.5–2× the measured depth" finding from
  the test rounds holds at these depths.

### 7. Synthetic test cases built from the paper's numbers
`synth.js` / `tools/graze-lab.cjs` only score impasto-like relief now. Add cases
with known answers:
- **canvas imprint**: orthogonal sinusoids, 85 × 105 µm period, 20 µm amplitude;
- **toothed-tool grooves**: parallel bands, 0.75–1.5 mm spacing, 30 µm deep, 5–10 cm
  long, discontinuous, never crossing;
- **raised retouch**: a smooth 60–90 µm plateau with no colour change (the albedo
  stays the same over it);
- **painted craquelure**: dark crack lines in the albedo with **no** height change.

These test whether the graze Detail smoothing (sigma in painting widths) erases
low-amplitude periodic texture. They also show how badly the one-photo estimate
mistakes colour for relief: painted craquelure should come out flat and does not.

### 8. Colour-vs-relief mismatch view (needs measured relief)
The paper's conservation finding (painted craquelure where the 3D model has no
furrow, and retouches visible only in 3D) comes from comparing colour with
independently measured relief.
- With **measured** relief only (lamp photos), map (a) strong dark line features in
  the albedo that have no matching relief edge, and (b) relief features that have no
  colour edge.
- Do not offer it for the one-photo estimate. That relief is derived from the colour
  itself, so the comparison is circular. The paper makes the same point: the probe
  "is not sensitive to contrast variations", which is why it works on "variegated
  chromaticity". This matches our result that one-photo relief correlates about 0
  with the lamp shots. It is also one more reason to make Measure relief the
  default route.

### 9. Keep the support shape instead of throwing it away
Measure relief removes broad drift (0.06 W, lampphotos.js) to isolate strokes. The
paper treats support waviness and transfer wrinkles as findings in their own right.
- Save the removed low-frequency surface and offer it as a "Support shape" view
  (topographic map from item 2). Optionally let a little of it back into the relit
  render.

### 10. Detail tiles at higher resolution (larger project)
The paper measured the whole painting at 250 µm, then re-measured two areas at
50 µm.
- Allow a close-up lamp-photo set of one region. Register it into the full photo
  (register.js already does affine/NCC alignment) and merge its finer measured
  relief into that window of the relief map.
- This is the only way the app could get down to tool marks and weave.

### 11. Change over time (low priority)
The paper suggests repeating surveys to track deformation from humidity,
temperature or treatment. Projects already save measured relief (`reliefsave.js`),
so a later step could be "compare with another project": a height difference map,
registered, in µm. This is niche and only worth doing if the user wants a
conservation use.

## Not applicable
- The conoscopic probe, scanning stages and acquisition rates are hardware with no
  software equivalent.
- The paper's figures are screenshots with no raw data, so they cannot be used as
  ground truth. Only the sizes in the table above can be reused.

# Part B: Surface roughness from raking light images (DiSciacca et al. 2026)

The Lens Media Lab (Yale) photographs 1 cm of photographic paper under a fixed
low-angle LED (the "Texturescope": 2048 × 2448 px, 16-bit, 204.8 px/mm, about
5 µm/px). They show that one number taken from the raking photo, **RL-Sq**,
follows the true areal roughness **Sq** (ISO 25178, the RMS of surface heights)
measured with a ZYGO optical profilometer. Across 213 samples the correlation is
Pearson **0.87**. A VGG16 CNN reached 0.93, but they chose RL-Sq anyway: it has
3 fixed, interpretable parameters instead of 138 M learned ones, and it is far
more repeatable.

The RL-Sq recipe:
1. Convert to greyscale with Rec. 709 weights (0.2125 R + 0.7154 G + 0.0721 B,
   the same weights `studio.js` uses).
2. Crop the evenly lit centre.
3. Normalise by the image mean (× gain 250 / sum × N).
4. **Divide by a Gaussian blur of itself** (501 px kernel, about 2.4 mm). This
   removes vignetting, the light's fall-off and lens artefacts while keeping local
   contrast.
5. Smooth with a 21 px Gaussian (about 0.1 mm) to drop pixel noise.
6. Crop the central 768 × 768 px (about 3.75 mm) and take the population standard
   deviation.

What else the paper reports:
- **Repeatability:** coefficient of variation 0.000–0.006 for the same shot
  repeated, and 0.04–0.14 with the sample moved between shots. The CNN was much
  worse on the second (up to 0.66).
- **Anisotropy:** directional textures change RL-Sq by about 0.5 units between
  light at 0° and at 90°. Their fix is to average two shots taken 90° apart.
- **Confounds:** any change in lightness reads as texture. That includes the
  printed image itself, so they measure on blank or evenly toned areas. Metallic
  flecks and specular glints make smooth papers read as rough.
- **Exposure:** the histogram should span near-white to near-black without
  touching either end.
- **One number is not a match.** Very different surfaces can share the same Sq.
  They combine it with colour, gloss and thickness on a radar chart, and leave
  final matching to people.

## What carries over to DigiLight

The scale is different (about 5 µm/px on paper against our 0.25–0.35 mm/px on
whole paintings), but the main result carries over. **The band-passed brightness
contrast of a raking photo is a reliable, simple proxy for relief amplitude when
the lighting geometry is fixed.** That is exactly the quantity we keep getting
wrong: renders show about 60 % of the lamp photos' stroke contrast, and users pick
depths well above the real paint.

### 12. Texture contrast score (RL-Sq style) for render vs photo
Add a single band-pass contrast number, computed the same way on the real
raking/lamp photo and on our render under the same light:
- greyscale (luma) ÷ Gaussian blur (about 2–3 mm in painting units, so it scales
  with `paintingWidthCm`), then a light blur at about 1–2 px, then the standard
  deviation over the painting (borders cut).
- The ratio **render score / photo score** is a "texture contrast match". 100 %
  means the render has as much stroke contrast as the real photo.
- Where it goes: `tools/render-batch.cjs` `vsLampPhoto` (next to depth / local /
  logRMS), Measure relief's Compare, and Calibrate's match panel.
- The divide-by-blur step also cancels the spot lamp's beam pool, a known gap
  (Next up 0b), so the score is fair even though we don't model the beam yet. It
  is the same idea as render-batch's `local` (p10 over a 51 px box mean), but it
  uses every pixel rather than the darkest 10 %.

### 13. Auto texture depth from the contrast match
Because the score tracks relief amplitude (r = 0.87 in the paper), we can solve for
it. Render at two or three depths under "Light like this" (or Calibrate's lamp),
fit score against depth, and set **Texture depth** where render score = photo
score.
- This replaces the hand-tuned "≈1.5× the measured spread" candidate rule (test
  round 2) and the 8 mm guess from the in-app batch with a measured value per
  painting.
- It also works with one raking photo and no Measure relief. Calibrate's Auto-fit
  could add this score as a target for depth: it is a broad-band fit now, and the
  fine band was dropped because albedo dominates it. The divide-by-blur ratio
  removes most of that.
- Caveat: the score depends on light elevation, room fill and exposure, so it is
  only valid render vs photo under the same geometry. Room fill (graze `fill`)
  should be set first (Next up 0c), or fitted together with depth.

### 14. Anisotropy: stroke direction and the best raking angle
Strokes are strongly directional, much more than paper, and a light parallel to a
stroke hardly shows it.
- Compute a structure tensor of the relief gradient (or of the lamp/even ratio).
  Report the dominant stroke direction and a coherence value (0 = isotropic,
  1 = all one way).
- Add a "Best raking direction" button on Graze light that sets the angle
  perpendicular to the dominant stroke.
- In Measure relief, warn when all lamp photos come from one side. We already know
  depth is 10–20 % shallow with all lamps above and right with lamps on four sides.
  The paper's advice is to add a shot about 90° round.
- Report the texture score (item 12) for the light at θ and at θ + 90° so
  users can see how much the direction matters on their painting.

### 15. Exposure / clipping check on uploaded lamp and raking photos
The method breaks if highlights clip or shadows crush, and the same is true of our
lamp/even ratio and of Calibrate's match.
- On upload (lampui.js, calibrate.js), show the share of pixels at ≥ 250 or ≤ 5 per
  channel, and warn above about 0.5 %.
- Mask clipped pixels out of the relief solve and the scores rather than trusting
  them.

### 16. Specular glints: detect and mask in Measure relief
Varnish and wet-looking impasto make glints under a spot lamp, just as metallic
flecks do on paper. We would read them as steep slopes.
- Flag pixels where the lamp/even ratio is far above anything a Lambertian surface
  can give under that lamp's geometry. Glints are also near-white and low in
  saturation compared with the albedo.
- Exclude those pixels from the per-pixel least squares (lampphotos.js) and let the
  Poisson solve fill them.
- Capture tip for the Measure relief help text: a polariser on the lamp and a
  crossed one on the lens removes most glare.

### 17. Region picker: score only where the colour is even
The paper measures on blank margins because image content reads as texture.
- When the user picks a region for scores or the profile probe (item 1), show how
  much colour varies there (std of the albedo or of the even photo). Steer them to
  even-toned paint for depth fitting.
- This matters most for one-photo relief, where every colour edge becomes false
  relief.

### 18. Repeatability as a regression metric
Copy their protocol for Measure relief:
- **Repeatability:** run the same lamp set twice and get the coefficient of
  variation of depth and texture score. It should be about 0.
- **Reproducibility:** shift or crop the photos by a few px and re-measure. Our
  shots already drift up to 2 px and 0.3 % zoom.
- The CV across the three DSC_8382 lamps (leave-one-out) is a ready-made number to
  log in HANDOFF and in a test in `tests/browser.cjs`. It would catch regressions in
  alignment or integration that a single r value can hide.

### 19. Roughness statistics in the readouts
The profile probe and topographic view (items 1–2) should report the standard ISO
25178 areal parameters for the region, not only P-V and RMS:
- **Sq** (RMS), **Sa** (mean absolute), **Sz** (max height), **Sp / Sv** (max peak
  and pit);
- **Ssk** (skewness: impasto ridges on a flat ground are positive, crevices and
  cracks negative);
- **Sku** (kurtosis: spiky against rounded).

All are cheap from the Float32 heights. Use the ISO names so the numbers mean the
same thing to conservators. A small "surface card" per project (depth, Sq, Ssk,
dominant direction, coherence, main period from item 4) would be our version of
their radar chart. Low priority.

### Not applicable from Part B
- The CNN (VGG16). The paper's own conclusion goes against it for this use: it
  overfits a small dataset, needs a big runtime and is not reproducible. It also
  does not fit our static, no-build app.
- Their absolute Sq values (paper: 0.036–46 µm, median 3.2 µm) and the fixed pixel
  kernels (501 / 21 px at 204.8 px/mm) do not carry over. Scale the kernels by mm
  per pixel instead.
