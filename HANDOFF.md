# DigiLight — Handoff

Start a new chat with: "Read HANDOFF.md and continue." This file is only the current state, what
waits on the user and what is next. Where things are, how to run and test, gotchas:
**docs/working.md** (read the parts you need). The past: **docs/history.md** (search it). The plan:
**docs/roadmap.md**. Real-photo evidence for measured relief: **docs/real-light-test.md**.

## Now
Everything is on `main` (10-28, rough surface; work branch `claude/quirky-allen-tna7jh`).
- **The sunlit-facets gap, found and mostly closed** (docs/real-light-test.md "10-28, rough
  surface"). There's no rough-surface term: a matte pixel seen face-on gets N·L of its mean normal
  whatever facets it holds, so no such term can brighten it. The gap was two other things:
  - **One sun shot lost the slope it measured**: integration took the unknown slope across the sun
    as 0 and kept 0.3-0.6 of the slope along it. lampphotos.js `sharpen` now adds 12 rounds along
    the measured direction where the shots lit a pixel from one side only. The lintel's sun photo
    now gives about the artist's 1/4" by itself (6.8-7.5 mm, was 3.65 stretched 1.74×). Lintel
    log r at the artist's depth 0.34 / 0.63 / 0.63 / 0.61 → 0.43 / 0.81 / 0.90 / 0.86, door
    also up, DSC_8382 lamps unchanged.
  - **A sheen the paint's colour doesn't tint** (dark paint's sunlit light 2.2× white's,
    relative to the flat photo): Light like this with a sun photo now sets **Highlight strength 4**
    (it matches the lintel; the door wants more). On linear ratios the lintel's light and shade
    size is 0.14-0.28 → 0.53-0.71 at Fit depth. Dark sunlit p99 2.9 → 10.7 (photo 14.8).
- Still open there: white plaster's sunlit level (the two photos' exposures), the finest band at
  0.68 of the measured slopes, the artist's 1/4" now 0.84 of the measured depth.
- Earlier: docs/history.md "HANDOFF, 10-28 later".

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
1. tests/browser.cjs: "tap jumps" failed 3 of 5 full runs on 10-28 (TAP_MS timing?), and the tool
   search block's second pick failed twice after a container restart; both fail on the old code
   too (docs/working.md Gotchas). Find the causes and make them robust without weakening the checks.
2. The sun's direction read from cast shadows (so the user needn't give it); with it, the sun's
   elevation (the lintel's 10.3° is uncertain: 11.9-13.6° if its block sits lower).
3. The sunlit gap's rest (docs/real-light-test.md "10-28, rough surface", Still open), if wanted:
   the finest band's slopes, more sheen than the slider's top for the door.
4. Roadmap NEXT in order: sharp layer at fit-to-screen, `?round=` link, agent tools
   (`render_preview` region + stats, `compare`), narrower Analyze cache.

## Quick test set (details: docs/working.md)
Cloud: `export DIGILIGHT_BROWSER=/opt/pw-browsers/chromium`; `cd tools && npm install` once.
Fast: `node tests/measure.mjs`, `node tests/changemap.mjs`, `node tests/sunrelief.mjs`.
Sun / measured relief: `node tests/sun.cjs`, `node tests/sunflat.cjs`, `node tests/lineup.cjs`.
Before pushing UI or shader changes: `node tests/browser.cjs` (~20 min, server on 8766, run alone)
and `node tests/mcp.cjs`. Test photos of the user's work: testdata/photos/ (README, manifest.json).
