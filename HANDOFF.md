# DigiLight — Handoff

Start a new chat with: "Read HANDOFF.md and continue." Keep this file short.
**Rule:** update this file in the same commit (or right after) every push to `main`.

## Status
- Last updated: 2026-10-09
- Last code change on `main`: `a38309f` (2026-10-09) — merged PR #1: calibrated relief, spot↔diffused lights, Quick setup
- Deploy: automatic via Cloudflare Workers Builds on push to `main` (`wrangler.jsonc`); manual Pages upload no longer needed
- Live: digi-light-test.bobdylan2000.workers.dev (Workers static assets)

## What it is
Static, no-build, in-browser painting relighter (WebGL2, ES modules). Upload a photo
of a painting → estimate surface relief → relight with movable virtual lights → export.

## Map (src/)
- `app.js` — main bench: load image, build G-buffer, re-shade on interaction (largest file)
- `studio.js` + `presets.js` — Creative Studio UI, surface/material/lighting presets, undo History
- `gbuffer.js` — single-photo surface estimation (directional + even-light estimates,
  normalised, blended); `shade.js` — per-frame shading pass (area-light penumbra)
- `export.js` — full-res tiled export; `gl.js` — WebGL2 scaffolding; `kelvin.js` — colour temp
- `photometric.js`, `register.js`, `sphere.js` — multi-photo capture path (demo section)
- `synth.js` — synthetic painting with known relief (tests); `measure.js` — image stats
- `tests/browser.cjs` — Playwright regression (see README "Validation")

## Run / test
- `python3 -m http.server 8766` then open http://localhost:8766
- `node tests/browser.cjs` (needs Playwright; Chromium at /opt/pw-browsers in cloud sessions)

## Done recently
- 10-09 (branch `claude/charming-goodall-k3m6fo`, not merged): "Light dots: on/off" toggle (was
  "Light guides") is the only thing hiding dots besides Sweep; grabbing a dot leaves
  Before/Split and brush mode; off-painting lights pin to the edge. Open your painting
  no longer resets edits; a new photo is undoable (history kept).
- 10-09 (PR #1): texture depth (mm) + painting width drive one height field for shading
  and shadows; even-light relief estimate for evenly lit photos (`photoDiffuse`);
  per-light source size, angular penumbra, physical shadow reach; Quick setup,
  photo-lit compass, light types/Diffusion/Angle/Mirror, Sweep light, Shadows view;
  advanced sliders folded into Fine-tune. Legacy projects load with `physical: 0`.
- 10-09: storage ops queue instead of being dropped (fixed preset-import test failure)
- 09-18: reusable named presets (save/apply/auto/download/import)
- 09-17: Creative Studio — presets, before/after + split, undo/redo, brushes, saved projects (IndexedDB)

## Next up (candidates — confirm with user)
1. Check calibrated relief on real photos of impasto (synthetic-only so far; the
   cloud environment's network policy blocked Wikimedia)
2. Optional "match original brightness" exposure after a lighting preset
3. Project save for the multi-photo capture workflow (currently single-photo only)
4. Large-export memory limits / preview vs export differences at very high res

## Gotchas
- Calibrated mode (`state.physical`, single photo only) derives heightScale,
  reliefStrength and shadow reach in `app.js` updateDerived; export tiles reuse the
  preview's measured `heightStats`, never re-measure.
- No backticks inside GLSL comments: the shaders are JS template strings.
- Must serve over HTTP (ES modules); don't open index.html directly.
- Deploy index.html, studio.css, src/, _headers together.
