# DigiLight — Handoff

Start a new chat with: "Read HANDOFF.md and continue." This file is only the current state, what
waits on the user and what is next. Where things are, how to run and test, gotchas:
**docs/working.md** (read the parts you need). The past: **docs/history.md** (search it). The plan:
**docs/roadmap.md**. Real-photo evidence for measured relief: **docs/real-light-test.md**.

## Now
Everything is on `main` (10-24, later; work branch `claude/quirky-allen-tna7jh`).
- **The lintel's 1/4" stands** (the user: ~1/8" down into recesses, ~1/8" up elsewhere).
  At 1/4" the artist's depth and Fit depth agree (3.17 / 2.85 mm, was 1.8× apart) and the light
  and shade is the real sun's size. Its r is lower than at 1/8" (mid 0.57 vs 0.68), but the
  known-truth stand-in (tools/realref/sunflat_depth.cjs) does the same with the depth right by
  construction: at a 10° sun, r peaks below the true depth. No fix needed; judge depth by size.
  The field is now "Relief, lowest to highest". Details: docs/real-light-test.md "10-24, later".
- 10-24: sun slope flattening mostly fixed (src/lampphotos.js), handheld photos lined up in the
  app (src/lineup.js). Those and earlier work: docs/history.md.

## Waiting on the user
1. Light like this with a sun photo: match the photo's neutral whites (as the phone balanced
   them), or keep the sun's warmth? (Separate from item 4's favourites.)
2. Welcome, not needed: a second lintel sun photo with the board turned ~90°, same sun; the door's
   sun elevation, width and relief lowest to highest (is it also ~1/4"?).
3. Guard when room light 1.0 is not enough (near-black bands stay crushed): lift the black point
   a touch, or keep black black?
4. White plaster: should the favourites keep whites neutral (plaster b* 16 → ~12)?
5. Is the guard chip welcome? Roadmap §6 choices (lamp photos per piece, evenness slider, blind
   voting, phone or iMac, default look, 16-bit / TIFF). Older open picks: docs/history.md.
6. On a computer with a GPU: `RENDERER_B=gpu node tests/renderers.cjs`.

## Next up
1. Light like this on a sun photo, the visible gaps left (docs/real-light-test.md "10-24, later"):
   whites warm (5000 K) where the phone's are neutral (b* 12 vs 0); sunlit faces reach 190 where
   the photo's blow out; fine texture softer. Colour first (waiting on the user, 1): match the
   photo's white. Check: `node tools/realref/sun_score.cjs testdata/photos/lintel-flat-crop.jpg
   testdata/photos/lintel-sun-lined.jpg OUT 40 10.3 52.07 6.35`, then
   `python3 tools/realref/score.py OUT/orig.png testdata/photos/lintel-sun-lined.jpg OUT/artist.png`.
2. The sun's direction read from cast shadows (so the user needn't give it).
3. Roadmap NEXT in order: sharp layer at fit-to-screen, `?round=` link, agent tools
   (`render_preview` region + stats, `compare`), narrower Analyze cache.

## Quick test set (details: docs/working.md)
Cloud: `export DIGILIGHT_BROWSER=/opt/pw-browsers/chromium`; `cd tools && npm install` once.
Fast: `node tests/measure.mjs`, `node tests/changemap.mjs`, `node tests/sunrelief.mjs`.
Sun / measured relief: `node tests/sun.cjs`, `node tests/sunflat.cjs`, `node tests/lineup.cjs`.
Before pushing UI or shader changes: `node tests/browser.cjs` (~20 min, server on 8766, run alone)
and `node tests/mcp.cjs`. Test photos of the user's work: testdata/photos/ (README, manifest.json).
