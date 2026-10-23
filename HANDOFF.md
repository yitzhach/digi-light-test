# DigiLight — Handoff

Start a new chat with: "Read HANDOFF.md and continue." This file is only the current state, what
waits on the user and what is next. Where things are, how to run and test, gotchas:
**docs/working.md** (read the parts you need). The past: **docs/history.md** (search it). The plan:
**docs/roadmap.md**. Real-photo evidence for measured relief: **docs/real-light-test.md**.

## Now
Everything is on `main` (10-24, later; work branch `claude/quirky-allen-tna7jh`).
- **The lintel's 1.8× gap is closed by the user's answer**: the plaster goes ~1/8" below the
  average into recesses and ~1/8" above it elsewhere, so **lowest to highest is ~1/4"** (6.35 mm).
  Rescored at 1/4": Texture depth 3.17 mm vs Fit depth 2.85 (0.90, was 1.8×); light and shade the
  real sun's size at mid scale (1.02 / 1.35 / 1.14 mid / broad / forms), r 0.57 / 0.69 / 0.71.
  The field is now "Relief, lowest to highest" with that example (CLI / MCP wording too);
  manifest `deepest_relief_in` 0.25. Details: docs/real-light-test.md "10-24, later".
- 10-24: sun slope flattening mostly fixed (src/lampphotos.js), handheld photos lined up in the
  app (src/lineup.js). Those and earlier work: docs/history.md.

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
1. Light-and-shade r falls as the depth grows (lintel mid 0.68 at 1.58 mm, 0.57 at the true
   3.17 mm) and the broad band is 1.35× too big. On the stand-in (tests/sunflat.cjs, truth known),
   find whether that is the renderer at a 10° sun (cast shadows, clipped facets) or one sun
   photo's broad relief; then fix it. Lintel check: `node tools/realref/sun_score.cjs
   testdata/photos/lintel-flat-crop.jpg testdata/photos/lintel-sun-lined.jpg OUT 40 10.3 52.07
   6.35`, then `python3 tools/realref/score.py OUT/orig.png testdata/photos/lintel-sun-lined.jpg
   OUT/artist.png OUT/fit.png`.
2. The sun's direction read from cast shadows (so the user needn't give it).
3. Roadmap NEXT in order: sharp layer at fit-to-screen, `?round=` link, agent tools
   (`render_preview` region + stats, `compare`), narrower Analyze cache.

## Quick test set (details: docs/working.md)
Cloud: `export DIGILIGHT_BROWSER=/opt/pw-browsers/chromium`; `cd tools && npm install` once.
Fast: `node tests/measure.mjs`, `node tests/changemap.mjs`, `node tests/sunrelief.mjs`.
Sun / measured relief: `node tests/sun.cjs`, `node tests/sunflat.cjs`, `node tests/lineup.cjs`.
Before pushing UI or shader changes: `node tests/browser.cjs` (~20 min, server on 8766, run alone)
and `node tests/mcp.cjs`. Test photos of the user's work: testdata/photos/ (README, manifest.json).
