# Real light against the relit picture (10-21)

The user sent two photos of the same plaster piece (the "door"): one indoors in flat light,
one outdoors in raking sunlight, handheld from another spot. With the sunlit one lined up on
the flat one, it is a reference for what raking light really does to this piece, and every
relit picture can be measured against it. The photos are the user's and are not in the repo
(kept as a private test set only if the user agrees).

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

## What follows (docs/roadmap.md, NEXT: measured relief from sunlight)

Sunlight is a free, even, distant lamp, and phones are always at hand, so 2–3 sunlit shots with
the board turned between them could replace the tripod-and-lamp session. The app would need:
lining up handheld shots (features and a homography, as register.py does), a sun lamp
(a direction, no distance falloff, Fit depth with it), broad forms kept for sun shots, the depth
from a known thickness, and looks that drop the graze smoothing when the relief is measured.
