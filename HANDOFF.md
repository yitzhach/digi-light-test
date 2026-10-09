# DigiLight — Handoff

Start a new chat with: "Read HANDOFF.md and continue." Keep this file short.
**Rule:** update this file in the same commit (or right after) every push to `main`.

## Status
- Last updated: 2026-10-09
- Last code change on `main`: `e1c2e26` (2026-09-18) — "Add reusable named presets across paintings"
- Live: static site, deployed manually to Cloudflare Pages (see README "Manual hosting")

## What it is
Static, no-build, in-browser painting relighter (WebGL2, ES modules). Upload a photo
of a painting → estimate surface relief → relight with movable virtual lights → export.

## Map (src/)
- `app.js` — main bench: load image, build G-buffer, re-shade on interaction (largest file)
- `studio.js` + `presets.js` — Creative Studio UI, surface/material/lighting presets, undo History
- `gbuffer.js` — single-photo surface estimation; `shade.js` — per-frame shading pass
- `export.js` — full-res tiled export; `gl.js` — WebGL2 scaffolding; `kelvin.js` — colour temp
- `photometric.js`, `register.js`, `sphere.js` — multi-photo capture path (demo section)
- `synth.js` — synthetic painting with known relief (tests); `measure.js` — image stats
- `tests/browser.cjs` — Playwright regression (see README "Validation")

## Run / test
- `python3 -m http.server 8766` then open http://localhost:8766
- `node tests/browser.cjs` (needs Playwright; Chromium at /opt/pw-browsers in cloud sessions)

## Done recently
- 09-18: reusable named presets (save/apply/auto/download/import)
- 09-17: Creative Studio — presets, before/after + split, undo/redo, brushes, saved projects (IndexedDB)

## Next up (candidates — confirm with user)
1. Project save for the multi-photo capture workflow (currently single-photo only)
2. Large-export memory limits / preview vs export differences at very high res

## Gotchas
- Must serve over HTTP (ES modules); don't open index.html directly.
- Deploy index.html, studio.css, src/, _headers together.
