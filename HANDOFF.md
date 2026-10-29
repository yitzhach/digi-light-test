# DigiLight — Handoff

Start a new chat with: "Read CLAUDE.md and HANDOFF.md in yitzhach/digi-light-test (branch main) and
continue from Next up. Answers to Waiting on the user: (yours, or none yet)." This file is only the
current state, what waits on the user and what is next. Where things are, how to run and test, gotchas:
**docs/working.md** (read the parts you need). The past: **docs/history.md** (search it). The plan:
**docs/roadmap.md**. Real-photo evidence for measured relief: **docs/real-light-test.md**.

## Now
Everything is on `main` (10-29, photos relit as spaces).
- **Photos, people, rooms and booths relit as spaces** (new Scene tool; README "Scene"). Say what
  the picture shows: Artwork (the painting relighter, bit for bit unchanged), Photo, Portrait,
  Room · booth or Object; the app suggests one. A photo type reads its space from the photo alone
  (src/scenedepth.js, ~0.1 s; no AI model: the CDN and Hugging Face are blocked here): depth, the
  subject's outline, sky, a room's walls, the photo's own light. Light then falls off into the
  background, the subject throws its shadow on what is behind it, a light can be the sun or light
  the subject or the background alone. 18 one-tap light scenes (sun at three hours; window plain,
  framed, blinds, leaves; overcast; gallery spots; five studio setups; neon, candle, moon, stage)
  and four effects (haze, light rays, glow, background blur); exports match the preview tile for
  tile. API `imageType` / `suggestType` / `lightScenes` / `applyLightScene`, CLI `--type --scene
  --flip`, four MCP tools (docs/automation.md). Look goldens only gained the `scene` / `fx` keys.
- **browser.cjs flakes: both causes found, fixed in the test, checks kept** (docs/working.md
  Gotchas). "Tap jumps": the test's vertical drag flings the panel, and on a slow machine it is
  still coasting when the tap lands (on the painting). TAP_MS was not it. Reproduced with CPU
  throttling (the old block failed 4 of 5 runs at 3-6×; fixed, 10 of 10 pass at 1-12×). Tool search:
  re-opened by hand without focus, so the first pick's deferred blur close shut it (reproduced by
  timing); now opened with the icon. The full suite, run alone, passes (65 checks, ~20 min), as do
  mcp.cjs, exact.cjs (artwork bit for bit) and scenedepth.mjs.
- The type suggestion read the lintel crop's white plaster as an overcast sky (Photo): a grey sky
  must now be smoother than a blue one. All 11 test photos read as Artwork (browser.cjs checks 3;
  tests/scenes.mjs has a plaster panel matched to the lintel's texture, and a grey sky).
- Undo steps now hold the derived values of their own settings (studio.js `snapshot` derives
  first): a new photo's step held stale ones, and undoing to it lost Redo. So Fit depth's check
  now sets `heightScale` / `reliefStrength` aside with the depth (they follow it when calibrated).
- Earlier: docs/history.md "HANDOFF, 10-29".

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

## Next up
1. Scene: a real depth model (Depth Anything V2 small, ~25 MB ONNX, in the browser by WebGPU or
   WASM) where the network allows it, today's reading as the fallback; a subject box and brush to
   correct the reading by hand.
2. The sun's direction read from cast shadows (so the user needn't give it); with it, the sun's
   elevation (the lintel's 10.3° is uncertain: 11.9-13.6° if its block sits lower).
3. The sunlit gap's rest (docs/real-light-test.md "10-28, rough surface", Still open), if wanted:
   the finest band's slopes, more sheen than the slider's top for the door.
4. Roadmap NEXT in order: sharp layer at fit-to-screen, `?round=` link, agent tools
   (`render_preview` region + stats, `compare`), narrower Analyze cache.

## Quick test set (details: docs/working.md)
Cloud: `export DIGILIGHT_BROWSER=/opt/pw-browsers/chromium`; `cd tools && npm install` once.
Fast: `node tests/measure.mjs`, `node tests/changemap.mjs`, `node tests/sunrelief.mjs`,
`node tests/scenedepth.mjs`.
Sun / measured relief: `node tests/sun.cjs`, `node tests/sunflat.cjs`, `node tests/lineup.cjs`.
Before pushing UI or shader changes: `node tests/browser.cjs` (~20 min, server on 8766, run alone)
and `node tests/mcp.cjs`. Test photos of the user's work: testdata/photos/ (README, manifest.json).
