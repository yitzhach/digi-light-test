# DigiLight — Handoff

Start a new chat with: "Read CLAUDE.md and HANDOFF.md in yitzhach/digi-light-test (branch main) and
continue from Next up. Answers to Waiting on the user: (yours, or none yet)." This file is only the
current state, what waits on the user and what is next. Where things are, how to run and test, gotchas:
**docs/working.md** (read the parts you need). The past: **docs/history.md** (search it). The plan:
**docs/roadmap.md**. Real-photo evidence for measured relief: **docs/real-light-test.md**.

## Now
Everything is on `main` (10-30, faster sharp zoom and re-shading).
- **Sharp zoom keeps what it rendered** (app.js "sharp zoom"). Rendered parts stay as patches on
  a 64 px grid: scrolling back is sharp at once (4.1 s → ~10 ms), only newly exposed strips render,
  a 256 px band renders ahead after a 0.3 s pause, a new zoom shows the old detail stretched until
  the new is ready (user: "zoomed scrolling fixed").
- **Light, colour and tone changes only re-shade.** Each patch keeps its relief (its own GBuffers,
  build-only targets freed, padded 32 px beyond the lights' reach so a moved light rarely
  rebuilds; ~256 MB budget, the view's always kept). Large photo at 300% in software GL: light or
  exposure change 5.8 s → 3.0 s back to sharp (relief build skipped; on a GPU the share saved is
  larger). The sharp layer no longer borrows the preview's relief, so the first edit after it no
  longer rebuilds the preview's. A surface change (relief sliders, new photo) still rebuilds.
- **Live re-shade during drags.** The app times its own re-shades of the view (ms per pixel); if
  the view's would take ≤80 ms (`SHARP_LIVE_MS`), a light, colour or tone change keeps the sharp
  view shown and re-shades it as you drag, one shade at a time (a newer change starts the next,
  never cancels one in flight). Slower machines keep the old way (soft while dragging, sharp
  100 ms after), so the drag stays smooth. A relief change still hides it at once.
  `__bench.sharpLive(ms)` reads the timing and sets the limit (browser.cjs forces it on).
- **Before/After and toggles back are instant** (user: grain and Before/After took 5+ s). Grain
  is only a few uniforms; the wait was the sharp view shading again on every change (grain cells
  are ~1 photo pixel, so it shows properly only there). Each patch now keeps its last 3 shades by
  a signature of the settings (`shadeSig`: state minus view keys and big buffers), so going back
  to a setting seen before (Before/After, undo, an effect off and on) shows at once. The first
  time grain goes on still costs one shade.
- **Sharp at fit-to-screen** on dense (Retina) screens when the photo has more pixels than the
  1400 px preview (roadmap item). All checks: browser.cjs 65, mcp.cjs, exact.cjs pass;
  `__bench.sharpStats()` counts relief builds vs shades.
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
7. On the iMac, zoomed in: does a light drag stay sharp (live), and is the drag still smooth? In
   the console, `__bench.sharpLive()` shows the timing. Is it a Retina (5K) iMac?

## Next up
1. Scene: a real depth model (Depth Anything V2 small, ~25 MB ONNX, in the browser by WebGPU or
   WASM) where the network allows it, today's reading as the fallback; a subject box and brush to
   correct the reading by hand.
2. The sun's direction read from cast shadows (so the user needn't give it); with it, the sun's
   elevation (the lintel's 10.3° is uncertain: 11.9-13.6° if its block sits lower).
3. The sunlit gap's rest (docs/real-light-test.md "10-28, rough surface", Still open), if wanted:
   the finest band's slopes, more sheen than the slider's top for the door.
4. Sharp zoom, if still slow on the iMac: async readback (no stall while it renders); a quick
   half-size pass for fresh areas; a lower live limit or a live pass at half size if 80 ms drags.
5. Roadmap NEXT in order: `?round=` link, agent tools
   (`render_preview` region + stats, `compare`), narrower Analyze cache.

## Quick test set (details: docs/working.md)
Cloud: `export DIGILIGHT_BROWSER=/opt/pw-browsers/chromium`; `cd tools && npm install` once.
Fast: `node tests/measure.mjs`, `node tests/changemap.mjs`, `node tests/sunrelief.mjs`,
`node tests/scenedepth.mjs`.
Sun / measured relief: `node tests/sun.cjs`, `node tests/sunflat.cjs`, `node tests/lineup.cjs`.
Before pushing UI or shader changes: `node tests/browser.cjs` (~20 min, server on 8766, run alone)
and `node tests/mcp.cjs`. Test photos of the user's work: testdata/photos/ (README, manifest.json).
