# DigiLight — Handoff

Start a new chat with: "Read CLAUDE.md and HANDOFF.md in yitzhach/digi-light-test (branch main) and
continue from Next up. Answers to Waiting on the user: (yours, or none yet)." This file is only the
current state, what waits on the user and what is next. Where things are, how to run and test, gotchas:
**docs/working.md** (read the parts you need). The past: **docs/history.md** (search it). The plan:
**docs/roadmap.md**. Real-photo evidence for measured relief: **docs/real-light-test.md**.

## Now
Everything is on `main` (10-30, faster sharp zoom).
- **Sharp zoom keeps what it rendered** (app.js "sharp zoom"). Zoomed in, the full-resolution view
  was thrown away on every scroll and rendered again (~4 s here in software GL: relief build ~60%,
  shading ~30%, resampling ~5%). Now rendered parts stay as patches on a 64 px grid: scrolling
  back over them is sharp at once (measured 4.1 s → ~10 ms), only newly exposed strips render,
  a band of 256 px around the view renders ahead after a 0.3 s pause, and a new zoom keeps the old
  detail stretched until the new size is ready. Idle wait 250 → 100 ms; an export resumes the fill.
  ~128 MB cap, farthest patches dropped first. Stitched patches match the export (diff 0.02).
  `__bench.sharp()` / `api.sharp()` now compose the view from the patches.
- Photos as spaces (Scene tool), browser.cjs flakes fixed, plaster not a sky, undo steps derived:
  docs/history.md "HANDOFF, 10-30".

## Waiting on the user
1. Try the Scene tool on your own photos (a booth shot, a portrait, a piece on a wall or floor):
   which light scenes are keepers, and what reads wrong (the subject's outline, the walls)?
2. Welcome, not needed: a second lintel sun photo with the board turned ~90°, same sun; the door's
   sun elevation, width and relief lowest to highest (is it also ~1/4"?).
3. Guard when room light 1.0 is not enough (near-black bands stay crushed): lift the black point
   a touch, or keep black black?
4. White plaster: should the favourites keep whites neutral (plaster b* 16 → ~12)?
5. Is the guard chip welcome? Roadmap §6 choices (lamp photos per piece, evenness slider, blind
   voting, phone or iMac, default look, 16-bit / TIFF). Older open picks: docs/history.md.
6. On a computer with a GPU: `RENDERER_B=gpu node tests/renderers.cjs`.
7. On the iMac, zoomed in: is scrolling sharp soon enough now? If a fresh area or a light change
   is still slow, say which (Next up 4).

## Next up
1. Scene: a real depth model (Depth Anything V2 small, ~25 MB ONNX, in the browser by WebGPU or
   WASM) where the network allows it, today's reading as the fallback; a subject box and brush to
   correct the reading by hand.
2. The sun's direction read from cast shadows (so the user needn't give it); with it, the sun's
   elevation (the lintel's 10.3° is uncertain: 11.9-13.6° if its block sits lower).
3. The sunlit gap's rest (docs/real-light-test.md "10-28, rough surface", Still open), if wanted:
   the finest band's slopes, more sheen than the slider's top for the door.
4. Sharp zoom, if still slow on the iMac: keep each patch's relief so a light change re-shades
   without rebuilding it; async readback (no stall while scrolling); a quick half-size pass first.
5. Roadmap NEXT in order: sharp layer at fit-to-screen, `?round=` link, agent tools
   (`render_preview` region + stats, `compare`), narrower Analyze cache.

## Quick test set (details: docs/working.md)
Cloud: `export DIGILIGHT_BROWSER=/opt/pw-browsers/chromium`; `cd tools && npm install` once.
Fast: `node tests/measure.mjs`, `node tests/changemap.mjs`, `node tests/sunrelief.mjs`,
`node tests/scenedepth.mjs`.
Sun / measured relief: `node tests/sun.cjs`, `node tests/sunflat.cjs`, `node tests/lineup.cjs`.
Before pushing UI or shader changes: `node tests/browser.cjs` (~20 min, server on 8766, run alone)
and `node tests/mcp.cjs`. Test photos of the user's work: testdata/photos/ (README, manifest.json).
