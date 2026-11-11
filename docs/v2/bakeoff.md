# Can a trained model read paint relief from one flat photo? (11-11)

Short answer: **not the ones tested.** Three general surface models score about zero at
brush-stroke scale on the user's real pieces, the same as v1's brightness rule. Relief taken
from one extra side-lit photo scores 0.8 to 0.9 with the same scoring. This decides the Relief
design of DigiLight 2 (docs/v2/BUILD.md).

## The test

Ground truth is the user's own photo pairs: the same piece in flat light and in real raking
light, lined up (testdata/photos, samples/dsc8382).

- A candidate predicts the surface (normals) from the **flat photo only**.
- The flat photo is relit with those normals under the real light's direction (plain Lambert,
  no cast shadows).
- Score = correlation between the relit picture's light and shade and the real photo's, where
  light and shade is log(picture / flat photo), so the paint's colour cancels. Four bands: fine,
  mid (stroke scale), broad, forms (box blurs of radius 1, 6, 24, 80 px). This is "shade corr"
  from tools/realref/score.py. +1 = the same light and shade in the same places, 0 = unrelated.
- The slope gain is searched (0.5 to 8) and the best kept, so a model is not marked down for scale.
- Each model was run on the whole image; Metric3D and Depth Anything also in 640 px tiles (fine
  relief seen larger), which changed nothing.

Pieces: door (sun from about 135°, 30° up), lintel (47°, 10.3°), DSC_8382 (three tripod lamp shots).

## Results (shade corr, mid / broad; best of whole and tiled, best axis convention)

| surface from the flat photo | door | lintel | DSC_8382 (mean of 3 lamps) | licence |
|---|---|---|---|---|
| v1's idea: brightness is height | −0.06 / 0.23 | 0.09 / 0.11 | −0.10 / 0.09 | ours |
| Depth Anything V2 small | 0.02 / 0.18 | 0.01 / 0.03 | 0.02 / 0.17 | Apache-2.0 |
| Metric3D v2 small (normals) | 0.00 / 0.10 | 0.01 / 0.03 | 0.00 / 0.02 | CC0 (ONNX export) |
| Marigold normals v1-1 (whole image) | −0.01 / 0.13 | 0.01 / 0.02 | 0.01 / 0.00 | OpenRAIL++ |
| **slope from one side-lit photo** (upper bound of the method) | **0.82 / 0.90** | **0.84 / 0.90** | 0.91 / 0.95 (the lamp used) | ours |

The only signal any model found was the door's largest form (the recessed block): Marigold 0.67
on the forms band, nothing on the lintel or DSC_8382.

For reference, v1's full measured-relief pipeline scored 0.55 / 0.60 (door) and 0.54 / 0.51
(lintel) with its drift removal and beam handling on (docs/real-light-test.md).

## The 2.0 lighting maths, mocked on the same photos (tools/bakeoff/mock.py)

`photo × computed light`, whites protected, in numpy, with exactly the formulas of BUILD.md §5 and
its look table (ten looks rendered on the door and the lintel):

- Light only (a lamp from the upper left, no relief): crisp, no blur, no embossing; shade corr
  with the real sun about 0, as expected (it adds no relief).
- Light plus relief from the one sunlit photo: shade corr **0.78 / 0.89 / 0.92 / 0.73** (door,
  fine / mid / broad / forms) and 0.87 / 0.94 / 0.96 / 0.92 (lintel). Partly circular: the relief
  came from that photo and the lamp stands on the sun's side. It shows the chain flat photo,
  side-lit photo, relief, relight works with the photo's full sharpness.

## The light's direction, read from the pair (tools/bakeoff/azimuth.py)

The shading log(side-lit / flat) is a derivative of the relief along the light, so its gradient
energy peaks along that axis.

| photo | true direction | axis found (mid band) |
|---|---|---|
| door sun | about 135° | 153.5° |
| lintel sun | 47° | 29.7° |
| DSC_8379 lamp | 90° | 98.4° |
| DSC_8380 lamp | 123° | 127.9° |
| DSC_8381 lamp | 55° | 54.2° |

The axis is found within 1° to 18°. Which end of the axis the light stood at is **not** found
reliably (a bump lit from the left looks like a hollow lit from the right; the shadow test tried
was a coin flip). So the app proposes the axis and the user picks the side with one tap.

## Not run, and why

- **Lotus normals, StableNormal (YOSO), MoGe-2 normals**: weights downloaded, but they run from
  their own GitHub code (and StableNormal with `trust_remote_code`); running third-party code
  was not allowed in the session that did this test. `tools/bakeoff/run.py` has their runners.
- **Ubisoft CHORD** (a material model: one texture photo to normal and height): gated, and its
  licence is research-only, so it could only ever be a reference.
- **fal PATINA** (hosted, commercial, material maps from one photo): needs a paid API key.

A material model trained on texture photos (the last two) is the most promising kind; general
scene models have never seen millimetre relief on a flat board. BUILD.md keeps a slot for it
(Phase 10) behind the same gate: beat 0.30 mid on all three pieces, then a look by eye.

## Rerun

```
pip install numpy pillow onnxruntime huggingface_hub torch diffusers transformers
python3 tools/bakeoff/baseline.py                 # v1's idea, and the harness's own sanity check
BAKEOFF_MODELS=/path/to/models python3 tools/bakeoff/run.py metric3d|dav2|marigold|moge|lotus|stablenormal
python3 tools/bakeoff/signs.py                    # best axis convention per saved result
python3 tools/bakeoff/azimuth.py                  # light direction from the pairs
python3 tools/bakeoff/mock.py                     # the 2.0 maths on the door and the lintel
```

Models: `onnx-community/metric3d-vit-small`, `onnx-community/depth-anything-v2-small`,
`prs-eth/marigold-normals-v1-1`, `Ruicheng/moge-2-vitl-normal`, `jingheya/lotus-normal-d-v1-1`,
`Stable-X/yoso-normal-v1-8-1` (Hugging Face; large files come from `us.aws.cdn.hf.co`).
