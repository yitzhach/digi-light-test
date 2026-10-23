# Real light against the relit picture (10-21)

The user sent two photos of the same plaster piece (the "door"): one indoors in flat light,
one outdoors in raking sunlight, handheld from another spot. With the sunlit one lined up on
the flat one, it is a reference for what raking light really does to this piece, and every
relit picture can be measured against it. The photos (and the user's other test photos) are in
**testdata/photos/** (README.md, manifest.json), committed with the user's OK (10-22).

## How to rerun

1. Line the sunlit photo up onto the flat one (OpenCV: `pip install opencv-python-headless`):
   `python3 tools/realref/register.py FLAT.jpg SUN.jpg SUN-lined.jpg --check check.jpg`
   (door: 134 of 138 matches kept, median error 0.6 px, 98.9% of the frame covered).
2. Render looks from the flat photo with the CLI (`batch`, the app's own export of the photo
   as `ORIG.jpg` with `{"set": {"originalTop": 1}}`).
3. Score them: `python3 tools/realref/score.py ORIG.jpg SUN-lined.jpg RENDER.jpg ...`
   (tone, warmth, texture size per band against the flat photo, and correlation with the real
   light, plain and as light and shade only: log(picture / flat photo) cancels the paint).
4. Measured relief from the sunlit photo, through the app's lamp-photo measurement:
   `node tools/realref/measure_sun.cjs FLAT.jpg SUN-lined.jpg door.digilight.json 30 135 60`
   (sun 30° to the face, from the upper left, on a 60 cm board), then render the project.

Bands: box blurs of radius 1, 6, 24, 80 px at 1000–1280 px wide: fine, mid (stroke scale),
broad, forms.

## What the real light does

Against the flat photo, the sunlit one keeps the middle tone (p50 164 → 164), widens both ends
(p05 58 → 45, p95 225 → 239), raises texture about evenly at every scale (×1.66 fine, ×1.83 mid,
×1.84 broad, ×1.65 forms) and is neutral (plaster b* 3.9, the flat photo 10.2).

## Today's looks (relief estimated from the flat photo)

| look | p50 | b* | texture × flat (fine/mid/broad/forms) | light-and-shade corr with the sun |
|---|---|---|---|---|
| Favourite, side lamp left | 113 | 16.0 | 1.74 / 1.34 / 0.99 / 0.99 | −0.00 / −0.07 / 0.04 / 0.08 |
| Favourite, from the left | 115 | 16.1 | 1.38 / 1.20 / 1.04 / 0.98 | |
| Gallery | 138 | 14.1 | 1.38 / 1.84 / 1.25 / 1.21 | |

- About a stop darker than the sunlit photo, warm on white plaster (the favourite's 4000 K lamp,
  no neutral greys), fine texture only: the big forms get no modelling.
- Their light and shade is unrelated to the real light (correlation about 0 on every band).
  Divided by the flat photo, the relit pictures show the outlines of the dark paint embossed
  (bright rims round the cement patches); the sunlit photo shows grooves, overhang shadows and
  lit plateau edges that do not follow the paint. lampphotos.js found the same on the red-ground
  painting against tripod lamp shots.
- No setting fixes it. One at a time on the side-lamp favourite: Broad relief 0.55 → 2 moved
  broad texture 1–3%; medium relief, texture depth ×1.5, graze opacity, a lower lamp, Stroke
  definition, relief scale, shadow strength: light-and-shade correlation stayed within −0.08 and
  0.12 on every band. The raking light alone, from eight directions every 45°: no direction
  beat the flat photo's own similarity to the sunlit one, on any band.
- The sun came from the upper left: just inside the recessed dark block, the left and top edges
  are in shadow in the sunlit photo (log ratio −0.47, −0.46) and the right edge is not (−0.03).

## Relief measured from the one sunlit photo

`measure_sun.cjs`: the app lined the photo up within 0.4 px, read 11% sky light, left 3.7% out
as glints (white plaster near the near-white test), measured 2.39 mm of relief (30° assumed).

| same render, relief | light-and-shade corr (fine/mid/broad/forms) | plain corr with the sun (mid/broad) | light-and-shade size / the sun's |
|---|---|---|---|
| sun-like light (graze 135°, 20°, no smoothing), estimated | −0.04 / 0.13 / 0.33 / 0.10 | 0.52 / 0.72 | 1.25 / 1.18 / 0.66 / 0.27 |
| sun-like light, **measured** | 0.23 / **0.55** / **0.60** / 0.18 | **0.82** / **0.88** | 0.38 / 0.66 / 0.72 / 0.26 |
| side-lamp favourite, estimated | −0.01 / −0.07 / 0.02 / 0.09 | 0.48 / 0.79 | |
| side-lamp favourite, **measured** | 0.17 / 0.17 / 0.40 / 0.21 | 0.78 / 0.87 | |

(The flat photo itself: plain correlation 0.70 mid, 0.82 broad.) The sun-like row is partly
circular, since the relief came from that photo; it shows that line up → measure → relight
works end to end. By eye (review page published 10-21) the measured relief looks like sculpted
plaster, the estimate like embossed paint.

Limits seen:
- One photo gives the slopes along the sun's direction only; ridges running toward the sun
  are invisible to it. A second shot with the board turned about 90° gives the other slope.
- Depth scales with tan(sun elevation), which no number of shots from one unknown elevation can
  tell (bas-relief ambiguity). A known thickness (the plaster's step at the block's edge) or
  the sun's elevation sets it.
- The finest grain is lost (texture size 0.38 of the sun's): the handheld shot sees raised
  detail from another angle (parallax), so fine detail does not line up exactly.
- Broad forms are dropped on purpose (DRIFT_SIGMA, 6% of the width, for a lamp's uneven beam);
  sunlight is even, so a sun shot could keep them (forms 0.26 of the sun's).
- The looks' raking light was tuned to hide the estimate's grain (detail smoothing 0.02–0.03,
  fine 0.15, shadow lift 0.6); on measured relief it smooths real detail: the side-lamp
  favourite kept 68% of the photo's fine texture.
- Fit depth fails for a far lamp: its trial renders fade the graze lamp with distance, so the
  depth barely changes the picture (contrast ratio 0.64–0.67 from 0.25 to 10 mm).

## Second piece: the panel with a wooden lintel (10-21)

Flat photo against a grey wall, sunlit photo outdoors (the user's message had the two the other
way round; the one with trees, sky and hard shadows is the sunlit one). Lined up with the pooled
matching (174 inliers, median 0.9 px; brightness alone had kept 6 of 18, see register.py).

- The sun came from the upper right: inside the recessed dark block the left wall is lit and the
  right edge in shadow, and the lintel's shadow falls down and to the left. Under the middle of
  the lintel the shadow runs 167 px down (rows 652 → 818 of 1670); its slanted right edge takes
  the lintel's bottom-right corner (942, 651) to about (738, 818): 264 px, 0.205 of the panel's
  width, about 40° below the horizontal. So the sun's elevation is
  atan(lintel protrusion / (0.205 × panel width)). The user's lengths: the lintel sticks out 3/4"
  and the panel is 20.5" wide (1308 px in the flat photo), so the shadow shifts 10.5 cm and the sun
  stood **10.3°** above the face (11.9° / 13.6° if the block under the lintel sits 1/8" / 1/4"
  lower than the plaster it is fixed to). The measurement below assumed 20° and a 50 cm width, so
  its depth is about twice too deep: 2.43 mm → **1.26 mm** (× tan 10.3° / tan 20° × 52.07 / 50).
- Check against the artist: the user says the panel's relief goes up to about 1/8" (3.2 mm). The
  measured height map's full range (lowest to highest, 2% margin left out) is 2.29 mm with the sun
  at 10.3°, 2.66 mm at 11.9°, 3.05 mm at 13.6° (the 2–98% spread: 1.26 / 1.46 / 1.67 mm). So the
  depth from one sunlit photo plus one shadow and the panel's width lands at 72–96% of the
  artist's figure, independently of the photos; a little short, as expected: the measurement drops
  forms broader than 6% of the width and reads nothing where the sun cast shadows.
- Today's relief, the same as on the door: light-and-shade correlation with the sun 0.04 / 0.10 /
  0.12 / 0.14 under a sun-like light (graze 47°, 20°, unsmoothed), about 0 for the looks.
- Measured relief (`measure_sun.cjs … 20 47 50`: lined up 0.5 px, 2.43 mm, 2.5% glints):
  0.21 / 0.54 / 0.51 / 0.37 under the sun-like light. The favourites, lit from the left, score
  −0.40 / −0.47 (broad / forms) against a sun from the right: the other side of a real relief
  gives the opposite light and shade, as it should; today's relief stays near 0 whatever the side.
- Not reproduced: the lintel's cast shadow. The lintel stands a few cm off the plaster, a step the
  shading method cannot measure (its shadow has no shading to read, and drift removal drops broad
  heights); a real cast shadow would need the lintel modelled as an object.

## The favourites on measured relief, without their graze smoothing

The side-lamp favourite with `graze.detail 0, graze.fine 1` on the door's measured relief (the
sun was on the lamp's side there):

| side-lamp favourite on the door | light-and-shade corr (fine/mid/broad) | texture × flat (fine/mid/broad) |
|---|---|---|
| today (estimated relief) | −0.01 / −0.07 / 0.02 | 1.65 / 1.31 / 1.00 |
| measured relief, as the look is | 0.17 / 0.17 / 0.40 | 0.68 / 0.76 / 1.09 |
| measured relief, not smoothed | **0.23 / 0.48 / 0.56** | **1.01 / 1.74 / 1.99** |
| the real sun | 1 | 2.00 / 1.91 / 1.78 |

Texture as strong as the real raking light at stroke and broad scale, in the right places, and
the photo's fine texture kept. By eye the closest to the real photo of all the relit versions,
apart from colour (tan where the sunlit plaster is white) and brightness (about a stop darker).

## Review page

https://claude.ai/artifact/AvR9yt12cnmo3qtaL46yvG (both pieces; built with tools/realref/page.py).

## What follows (docs/roadmap.md, NEXT: measured relief from sunlight)

Sunlight is a free, even, distant lamp, and phones are always at hand, so 2–3 sunlit shots with
the board turned between them could replace the tripod-and-lamp session. The app would need:
lining up handheld shots (features and a homography, as register.py does), a sun lamp
(a direction, no distance falloff, Fit depth with it), broad forms kept for sun shots, the depth
from a known thickness, and looks that drop the graze smoothing when the relief is measured.

## 10-22: the sun in the app

Done: a sun shot is a lamp photo with a direction instead of a place (lampphotos.js `sunPixels`:
`{sun: {azimuthDeg, elevationDeg}}`; in the app, a row's Light: Sun), the depth from the artist's
deepest relief (Deepest relief; `deepestMm`: Texture depth = the deepest × the measured 2–98%
spread over the measured full range), and all of it drivable: `digilight.measureRelief`, the
CLI's `measure` (`--sun FILE:FROM:ANGLE --width-cm --deepest`), the MCP `measure_relief`
(docs/automation.md, "Measured relief from sunlight"). Fit depth stays lamp-only (it renders the
graze light, a lamp a painting's width away). Lining up a handheld shot is still register.py.

Settings tried on the lintel (sun 47° from the right, 20°, 50 cm, as before; light and shade
against the real sun, tools/realref/score.py, mid / broad / forms):

| beam window / drift cut (painting widths) | light-and-shade corr | full range at 10.3° |
|---|---|---|
| 0.022 / 0.06 (the lamps') | 0.53 / 0.56 / 0.54 | 2.2 mm |
| 0.022 / 0.10–0.12 | 0.52 / 0.56 / 0.55 | 3.2 mm (0.12) |
| 0.25 / 0.06 | 0.44 / 0.41 / 0.30 | |
| 0.25 / 0.10 | 0.44 / 0.41 / 0.32 | 3.6 mm (0.12), 4.9 (0.18), 6.9 (0.25) |

- The drift cut moves only the depth. At 0.12 the full range at the sun's known 10.3° is 3.2 mm,
  the artist's "about 1/8"" (the lintel's shadow gave 2.3–3.05 mm): `SUN_DRIFT_SIGMA` 0.12.
- A broad beam window (a sun has no beam to take out) won on a synthetic painting in sun (two
  shots turned 90°: height r 0.93 against 0.20; tests/sunrelief.mjs) and lost on the real one,
  where a flat photo taken indoors and a sunlit one differ by slow unevenness of their own that a
  broad window reads as slopes. So sun shots keep the lamps' window (`SUN_BEAM_SIGMA`); a second
  sun shot (the board turned 90°) is what could tell the two apart. Both are options
  (`driftSigma`, `beamSigma`; the CLI's `--drift`, `--beam`) for trying.
- The first guess at the sky light reads high on a sunlit photo with no deep shadow (synthetic,
  sun at 25°: 0.72 against 0.11, relief ×1.6); the user's low-sun photos have deep shadows and
  read 7–11%. Take sun photos with the sun low enough to cast shadows.
- The measured renders above (graze 47°, 20°, unsmoothed) are about a third of the real sun's
  light-and-shade size: the graze light is a lamp a painting's width away, not a sun; a sun lamp
  in the renderer is still to do.

### 10-23: a sun in the renderer

`graze.sun` (the Graze light's Sun button): the graze light as a direction, no falloff, so the
whole painting gets the same light at the same angle; Light like this on a sun row uses it, so
Fit depth works with sun photos. Lintel, measured with the true geometry (40°, 10.3°, 52.07 cm,
deepest 1/8"), rendered at that sun (unsmoothed graze, room light from the sky share 6.7%):

| render | light-and-shade corr (fine/mid/broad/forms) | shade size / the sun's | texture × flat (fine/mid/broad/forms) |
|---|---|---|---|
| one-photo estimate, sun | 0.02 / 0.12 / 0.15 / 0.22 | 2.05 / 1.64 / 0.86 / 0.81 | 5.73 / 3.47 / 1.57 / 1.44 |
| measured, the lamp at the same angle | 0.14 / 0.51 / 0.53 / 0.48 | 0.22 / 0.39 / 0.38 / 0.36 | 0.81 / 1.01 / 1.00 / 0.94 |
| measured, sun, depth from the artist (1.76 mm) | **0.17 / 0.57 / 0.63 / 0.60** | 0.18 / 0.33 / 0.32 / 0.28 | 0.99 / 1.25 / 1.21 / 1.14 |
| measured, sun, Fit depth (4.0 mm) | 0.12 / 0.47 / 0.53 / 0.51 | 0.52 / 1.13 / 1.20 / 0.98 | 1.54 / 2.57 / 2.11 / 1.46 |
| the real sun | 1 | 1 | 3.51 / 2.66 / 1.96 / 1.46 |

- The sun beats the lamp at the same angle on every band: the lamp's pool falls off across the
  panel (on the sample painting, 2.5 stops left to right against 0.15 for the sun).
- Depth from the artist: the best light and shade so far, at a third of its size. Fit depth: the
  real sun's texture size at stroke and broad scale, a little less well placed. The two depths
  differ 2.3×; tests/sun.cjs finds the same on a photo the app made itself (made at 1 mm, fits
  2.5 mm). One sun photo flattens the stroke-scale slopes; the lamps' narrow beam window
  (SUN_BEAM_SIGMA) is the likely cause, and a second sun shot turned 90° the likely cure.

### 10-24: the slope flattening, found

Where the truth is known first (tests/sunflat.cjs): the lintel's flat photo as the paint, a known
relief of small steep features over a few mm (drips, strokes, a little broad form) put in as
measured relief at 1.5 mm, the app's own render of it under the lintel's sun (graze.sun, 40°,
10.3°, sky 7%) as the sun photo, times ±25% slow unevenness (a tilt and broad blotches). One sun
photo measures no broad forms, so the yardstick is the depth at which the measured relief's
stroke-scale slopes along the sun are as steep as the truth's. A Node stand-in (Lambert, cast
shadows, the indoor light's own soft shading, phone-like local contrast as an option) was used to
try things quickly; the scripts are not kept.

What flattened the strokes:
- **Shadows read as flat ground.** At a low sun many pixels get no sun (the lintel at 10.3°:
  10.3%, plus 2.5% over the lamps' brightness cap of 3, where a matte facet can reach 1/sin 10.3° =
  5.6). They were left out, and left out a pixel's slope is 0, which the integration takes as
  flat: the slopes read back reproduced only 0.44-0.52 of the photo's shading before integrating
  (0.99 with them read). Their darkness also pulled the beam (the local mean) down beside them,
  so lit pixels looked turned to the sun: spurious broad relief, 2-5 times the truth's broad band
  at correlation about 0.
- **The drift cut kept that error** (SUN_DRIFT_SIGMA 0.12, 10-22): it set the full range, and the
  artist's depth (Texture depth = the deepest × spread / range) then squashed the strokes. 0.12
  had been chosen so the lintel's range met 1/8", with the flattening in it.
- Not it: the slow unevenness (the stand-in flattened as much without it), De-light
  (albedoSuppress 0 against 0.7: Fit depth 3.93 against 4.0 mm on the lintel), the renderer (a
  plain Lambert render of the lintel's measured relief gave the same third of the sun's contrast).

The fix (lampphotos.js, sun shots only; lamps as before): a pixel the sun did not reach is read as
shading 0 (the surface falls away at least as steeply as the sun's rays: a turned-away facet, or a
cast shadow whose length times tan(elevation) is the step casting it, which comes out as that
step), bright facets up to 1.2 × 1/sin(elevation) are read, and the drift cut is the lamps' 0.06.

| stand-in (in the app) | measured follows truth (stroke r) | depth from the artist's range / truth | Fit depth / truth | Fit / artist |
|---|---|---|---|---|
| before | 0.78 | 0.32 | 0.86 | 2.69 |
| shadows read, drift 0.12 | 0.84 | 0.97 | 0.73 | 0.75 |
| shadows read, drift 0.06 (now) | 0.84 | 1.06 | 0.72 | 0.68 |

Fit depth fits the photo's contrast, which the measurement's own noise adds to, so it comes out a
little shallow. tests/sun.cjs's photo made at 1 mm now fits 0.96 mm (before 2.5).

The lintel (true geometry: 40°, 10.3°, 52.07 cm; rendered under that sun with Light like this by
tools/realref/sun_score.cjs, scored by tools/realref/score.py, light and shade mid / broad / forms;
before = this code before 10-24, rerun):

| lintel | Texture depth | light-and-shade r | its size / the real sun's |
|---|---|---|---|
| before, deepest 1/8" | 1.76 mm | 0.57 / 0.64 / 0.62 | 0.30 / 0.29 / 0.23 |
| before, Fit depth | 4.00 mm | 0.47 / 0.53 / 0.50 | 1.01 / 1.06 / 0.87 |
| shadows read, drift 0.12, deepest 1/8" | 1.77 mm | 0.67 / 0.80 / 0.83 | 0.26 / 0.29 / 0.24 |
| shadows read, drift 0.12, Fit depth | 4.43 mm | 0.58 / 0.69 / 0.72 | 0.86 / 1.11 / 0.96 |
| **now, deepest 1/8"** | **1.58 mm** | **0.68 / 0.80 / 0.82** | 0.36 / 0.41 / 0.35 |
| now, Fit depth | 2.85 mm | 0.58 / 0.70 / 0.72 | 0.87 / 1.12 / 0.93 |

The best light and shade so far, at the artist's depth. But Fit depth and the artist's still differ
1.8× (before 2.3×), not the ~25% hoped for, while on the stand-in they agree the other way (0.68).
So the rest is in the real photos, not the measurement: the real sun photo has more contrast than
the renderer gives any relief whose lowest to highest is 1/8". Likely, in some mix:
- the phone's own processing of a bright outdoor scene (local contrast, sharpening): on the Node
  stand-in an unsharp mask of 0.6-1 moved Fit / artist from 0.92 to 1.37-1.44 and left the
  artist's depth where it was;
- plaster rougher than the pixels: at a 10° sun, grain below a pixel shadows itself, which a
  Lambert render of a pixel-scale height cannot;
- a deepest relief over 1/8" (Fit depth's 2.85 mm spread means about 5.7 mm lowest to highest), or
  a sun lower than the 10.3° read from the lintel's shadow (11.9-13.6°, if the block sits lower,
  would widen the gap).
Its depth from the artist is the one to use; Fit depth on a sun photo reads deep.

### 10-24: lining up in the app

The app now lines a handheld sunlit photo up itself (src/lineup.js; `lineUp`, automatic for a
photo shaped unlike the painting photo): SIFT-like features (difference-of-Gaussian blobs, 4 x 4
x 8 gradient histograms) on brightness and on the colour ratio r / (r + g + b), each evened out
locally, matched with the ratio test and pooled (as register.py), a RANSAC homography, then
refined with 9 x 9 patches over the painting matched on colour (features crowd on texture and on
the wooden lintel, whose parallax pulled the first fit up to 4-7 px off at the far corners), and
the lamp photos' own alignment after that. Against register.py's homography (manifest.json
`sunToFlat`), raw sun photo in, preview pixels (tests/lineup.cjs, in the app):

| piece | feature matches agreeing | patches kept | off register.py (median / max) | relief r against the -lined photo's | depth |
|---|---|---|---|---|---|
| door | 252 of 305 | 49 | 0.36 / 0.79 px | 0.945 | 3.53 against 3.41 mm |
| lintel | 122 of 214 | 53 | 0.79 / 1.60 px | 0.986 | 1.85 against 1.84 mm |

Lining up and measuring together took 15-22 s in the headless app (lining up alone: 7-8 s in Node).
