# Improvements from "Panel Painting Surface Investigation by Conoscopic Holography"

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
