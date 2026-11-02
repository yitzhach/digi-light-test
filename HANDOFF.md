# DigiLight — Handoff

Start a new chat with the prompt in docs/working.md "New chat prompt". This file is only the
current state, what waits on the user and what is next. Where things are, how to run and test, gotchas:
**docs/working.md** (read the parts you need). The past: **docs/history.md** (search it). The plan:
**docs/roadmap.md**. Real-photo evidence for measured relief: **docs/real-light-test.md**.

## Now
Everything is on `main` (11-02: speed on the user's Retina 5K iMac, agent tools, iPhone colour).
- **iPhone colour** (colour.js): a photo whose profile is wider than sRGB (iPhone Display P3,
  Adobe RGB) is worked in Display P3 end to end (canvases, textures, drawing buffer, worker,
  exports with a P3 profile; light and effect colours in its primaries). HEIC opens (Safari
  natively, elsewhere vendor/libheif, ~1.5 MB, loaded only then). sRGB photos unchanged.
  exact.cjs "colour": P3 JPEG / HEIC exported bit for bit in P3, out-of-sRGB reds kept.
- **Sharp view**: kept patches (scroll sharp at once), kept reliefs (light / tone changes only
  re-shade), last 3 shades kept (Before/After instant), live re-shade during drags when this
  machine shades the view in ≤80 ms, async readback + worker resampling (no page freeze: 6.2 s →
  ~0.1 s), tiles shown as they land, sharp at fit on Retina. Details: docs/history.md "11-02".
- **Agent tools**: MCP `render_preview` `region`, `compare`, `batch_render`; `?round=round5`
  renders a round on the user's computer into the batch viewer (rounds/ deployed); narrower
  Analyze cache (a look tweak 191 s → 28 s; bump auto.js `MEASURE_VERSION` when measuring changes).
- Earlier: docs/history.md "HANDOFF, 11-02" and "HANDOFF, 10-30".

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
7. On the iMac (Retina 5K): does the page stay responsive while it sharpens? Zoomed in, does a
   light drag stay sharp (live)? In the console, `__bench.sharpLive()` shows the timing.
8. An iPhone photo of a piece (HEIC or JPEG, straight off the phone): do its colours look right in
   the app and in the export, against the photo in Photos? `digilight.info().colourSpace` says
   which space it is worked in.

## Next up
1. Scene: a real depth model (Depth Anything V2 small, ~25 MB ONNX, in the browser by WebGPU or
   WASM) where the network allows it, today's reading as the fallback; a subject box and brush to
   correct the reading by hand.
2. The sun's direction read from cast shadows (so the user needn't give it); with it, the sun's
   elevation (the lintel's 10.3° is uncertain: 11.9-13.6° if its block sits lower).
3. The sunlit gap's rest (docs/real-light-test.md "10-28, rough surface", Still open), if wanted:
   the finest band's slopes, more sheen than the slider's top for the door.
4. Sharp zoom, if still slow on the iMac: a quick half-size pass for fresh areas; a lower live
   limit or a live pass at half size if 80 ms drags.
5. Roadmap left: a flat-print control (no relief rims on a flat print); LATER: 16-bit PNG / TIFF
   export and dither, the shader items behind a flag (docs/roadmap.md).

## Quick test set (details: docs/working.md)
Cloud: `export DIGILIGHT_BROWSER=/opt/pw-browsers/chromium`; `cd tools && npm install` once.
Fast: `node tests/measure.mjs`, `node tests/changemap.mjs`, `node tests/sunrelief.mjs`,
`node tests/scenedepth.mjs`.
Sun / measured relief: `node tests/sun.cjs`, `node tests/sunflat.cjs`, `node tests/lineup.cjs`.
Before pushing UI or shader changes: `node tests/browser.cjs` (~20 min, server on 8766, run alone)
and `node tests/mcp.cjs`. Test photos of the user's work: testdata/photos/ (README, manifest.json).
