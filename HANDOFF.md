# DigiLight — Handoff

Start a new chat with: "Read HANDOFF.md and continue." This file is only the current state, what
waits on the user and what is next. Where things are, how to run and test, gotchas:
**docs/working.md** (read the parts you need). The past: **docs/history.md** (search it). The plan:
**docs/roadmap.md**. Real-photo evidence for measured relief: **docs/real-light-test.md**.

## Now
Everything is on `main` (10-28, later; work branch `claude/quirky-allen-tna7jh`).
- **10-28, later, the highlights gap diagnosed** (docs/real-light-test.md "10-28, later"): in the
  lintel's sun photo the sunlit facets are 2-5x brighter (linear, over the flat photo) than in the
  render, in every paint class; shadows match. Not exposure, rolloff, shadow lift or specular.
  Most likely sub-pixel roughness at a low sun (grain facets far steeper than a pixel's slope).
- **Three fine-relief losses fixed**: sun shots skip `align` (it moved lined-up sun photos ~1 px),
  `sharpen` after integration (lampphotos.js; central differences had halved the grain), exports
  sample measured relief Catmull-Rom (gbuffer.js). Lintel full size, light and shade fine r 0.17 →
  0.34, size 0.36 → 0.85; mid r 0.57 → 0.63.
- 10-28: Camera white (Light like this with a sun balances the camera to it; the user: keep it).
  Earlier: docs/history.md "HANDOFF, 10-28".

## Waiting on the user
1. Welcome, not needed: a second lintel sun photo with the board turned ~90°, same sun; the door's
   sun elevation, width and relief lowest to highest (is it also ~1/4"?).
2. Guard when room light 1.0 is not enough (near-black bands stay crushed): lift the black point
   a touch, or keep black black?
3. White plaster: should the favourites keep whites neutral (plaster b* 16 → ~12)?
4. Is the guard chip welcome? Roadmap §6 choices (lamp photos per piece, evenness slider, blind
   voting, phone or iMac, default look, 16-bit / TIFF). Older open picks: docs/history.md.
5. On a computer with a GPU: `RENDERER_B=gpu node tests/renderers.cjs`.

## Next up
1. A rough-surface term for the graze light (each pixel shaded as a spread of facet slopes around
   its normal, the spread fitted to the sun photo), then Highlight strength refitted with it.
   Check (docs/real-light-test.md "10-28, later"): `node tools/realref/sun_score.cjs
   testdata/photos/lintel-flat-crop.jpg testdata/photos/lintel-sun-lined.jpg OUT 40 10.3 52.07 6.35`,
   then `python3 tools/realref/tones.py OUT/orig.png testdata/photos/lintel-sun-lined.jpg
   OUT/artist.png` (sunlit facets over flat, by paint class) and score.py the same way.
2. tests/browser.cjs "tap jumps" failed 3 of 5 full runs on 10-28, old code too (docs/working.md
   Gotchas): find the cause (TAP_MS timing?) and make it robust without weakening the check.
3. The sun's direction read from cast shadows (so the user needn't give it).
4. Roadmap NEXT in order: sharp layer at fit-to-screen, `?round=` link, agent tools
   (`render_preview` region + stats, `compare`), narrower Analyze cache.

## Quick test set (details: docs/working.md)
Cloud: `export DIGILIGHT_BROWSER=/opt/pw-browsers/chromium`; `cd tools && npm install` once.
Fast: `node tests/measure.mjs`, `node tests/changemap.mjs`, `node tests/sunrelief.mjs`.
Sun / measured relief: `node tests/sun.cjs`, `node tests/sunflat.cjs`, `node tests/lineup.cjs`.
Before pushing UI or shader changes: `node tests/browser.cjs` (~20 min, server on 8766, run alone)
and `node tests/mcp.cjs`. Test photos of the user's work: testdata/photos/ (README, manifest.json).
