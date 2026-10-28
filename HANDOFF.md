# DigiLight — Handoff

Start a new chat with: "Read HANDOFF.md and continue." This file is only the current state, what
waits on the user and what is next. Where things are, how to run and test, gotchas:
**docs/working.md** (read the parts you need). The past: **docs/history.md** (search it). The plan:
**docs/roadmap.md**. Real-photo evidence for measured relief: **docs/real-light-test.md**.

## Now
Everything is on `main` (10-28; work branch `claude/quirky-allen-tna7jh`).
- **10-28, Camera white**: Light like this with a sun photo balances the render's camera to that
  sun and sky (`graze.wb` 1; graze panel button **Camera white**, on by default for a sun, off
  for a lamp), as the phone did. Lintel whites b* 12.4 → 2.7 (real photo 0.3, flat 3.9); light and
  shade unchanged. Done as HANDOFF suggested (match the photo's white), since item 1 below had no
  answer; one click turns it off. Details: docs/real-light-test.md "10-28".
- Earlier (lintel's 1/4", sun slope fix, handheld line-up): docs/history.md "HANDOFF, 10-28".

## Waiting on the user
1. Camera white on by default for Light like this with a sun photo (whites neutral as the phone
   balanced them): keep it, or keep the sun's warmth (turn it off)? (Separate from item 4.)
2. Welcome, not needed: a second lintel sun photo with the board turned ~90°, same sun; the door's
   sun elevation, width and relief lowest to highest (is it also ~1/4"?).
3. Guard when room light 1.0 is not enough (near-black bands stay crushed): lift the black point
   a touch, or keep black black?
4. White plaster: should the favourites keep whites neutral (plaster b* 16 → ~12)?
5. Is the guard chip welcome? Roadmap §6 choices (lamp photos per piece, evenness slider, blind
   voting, phone or iMac, default look, 16-bit / TIFF). Older open picks: docs/history.md.
6. On a computer with a GPU: `RENDERER_B=gpu node tests/renderers.cjs`.

## Next up
1. Light like this on a sun photo, the gaps left (docs/real-light-test.md "10-28"): sunlit faces
   reach 190 (p95 182) where the photo's blow out (242); fine texture softer (fine-band 1.09
   against 3.51 of the flat's). Check: `node tools/realref/sun_score.cjs
   testdata/photos/lintel-flat-crop.jpg testdata/photos/lintel-sun-lined.jpg OUT 40 10.3 52.07 6.35`,
   then `python3 tools/realref/score.py OUT/orig.png testdata/photos/lintel-sun-lined.jpg OUT/artist.png`.
2. tests/browser.cjs "tap jumps" failed 3 of 4 full runs on 10-28, old code too (docs/working.md
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
