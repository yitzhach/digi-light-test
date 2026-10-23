# DigiLight — Handoff

Start a new chat with: "Read HANDOFF.md and continue." This file is only the current state, what
waits on the user and what is next. Where things are, how to run and test, gotchas:
**docs/working.md** (read the parts you need). The past: **docs/history.md** (search it). The plan:
**docs/roadmap.md**. Real-photo evidence for measured relief: **docs/real-light-test.md**.

## Now
Everything is on `main` (10-24, commit 07c6a9a; work branch `claude/quirky-allen-tna7jh`).
- **10-24, sun slope flattening mostly fixed** (src/lampphotos.js, sun shots only): shadows are
  read as falling away at the sun's angle, bright facets up to 1.2/sin(elevation) are read, sun
  drift cut 0.06. Known-truth test tests/sunflat.cjs: depth from the artist's range 0.32 → 1.06 of
  the truth. Lintel at the artist's 1/8": light and shade with the real sun 0.68 / 0.80 / 0.82
  (mid / broad / forms; was 0.57 / 0.64 / 0.62). **Open:** Fit depth and the artist's depth still
  differ 1.8× on the lintel (1.58 vs 2.85 mm); evidence says the real photo has more contrast than
  the renderer gives (phone processing, sub-pixel roughness, or relief deeper than 1/8").
  Details: docs/real-light-test.md "10-24".
- **10-24, handheld photos lined up in the app** (src/lineup.js): automatic for a photo shaped
  unlike the painting photo, or `lineUp` / CLI `--line-up` / MCP `line_up` / the row's Handheld box.
  Raw door / lintel sun photos within 0.36 / 0.79 px (median) of tools/realref/register.py
  (tests/lineup.cjs).
- Earlier (sun in the renderer `graze.sun`, change map, renderers agree, repeatability fix, looks,
  guard): docs/history.md.

## Waiting on the user
1. Lintel: is "about 1/8"" the plaster's lowest-to-highest across the whole panel (lintel aside)?
   Matching the sun's contrast implies ~5.7 mm (≈7/32"). Also welcome: a second sun photo with the
   board turned ~90°, same sun; the door's sun elevation and width.
2. Guard when room light 1.0 is not enough (near-black bands stay crushed): lift the black point
   a touch, or keep black black?
3. White plaster: should the favourites keep whites neutral (plaster b* 16 → ~12)?
4. Is the guard chip welcome? Roadmap §6 choices (lamp photos per piece, evenness slider, blind
   voting, phone or iMac, default look, 16-bit / TIFF). Older open picks: docs/history.md.
5. On a computer with a GPU: `RENDERER_B=gpu node tests/renderers.cjs`.

## Next up
1. The lintel's remaining 1.8× (if the 1/8" stands): a rough-surface term for the graze light at
   low angles; check with `node tools/realref/sun_score.cjs testdata/photos/lintel-flat-crop.jpg
   testdata/photos/lintel-sun-lined.jpg OUT 40 10.3 52.07 3.175`, then
   `python3 tools/realref/score.py OUT/orig.png testdata/photos/lintel-sun-lined.jpg OUT/artist.png OUT/fit.png`.
2. The sun's direction read from cast shadows (so the user needn't give it).
3. Roadmap NEXT in order: sharp layer at fit-to-screen, `?round=` link, agent tools
   (`render_preview` region + stats, `compare`), narrower Analyze cache.

## Quick test set (details: docs/working.md)
Cloud: `export DIGILIGHT_BROWSER=/opt/pw-browsers/chromium`; `cd tools && npm install` once.
Fast: `node tests/measure.mjs`, `node tests/changemap.mjs`, `node tests/sunrelief.mjs`.
Sun / measured relief: `node tests/sun.cjs`, `node tests/sunflat.cjs`, `node tests/lineup.cjs`.
Before pushing UI or shader changes: `node tests/browser.cjs` (~20 min, server on 8766, run alone)
and `node tests/mcp.cjs`. Test photos of the user's work: testdata/photos/ (README, manifest.json).
