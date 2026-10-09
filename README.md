# DigiLight
A static, local-in-browser painting relighter. No API keys, uploads to a server,
package installation or build step are required. Requires WebGL2 and floating-point
render targets; graphics acceleration must be enabled.

## Use
Creative Studio starts each uploaded photograph with a restrained look: brushy oil
about 1 mm deep, photographed in even light. **Quick setup** is the everyday path:

- **Paint texture** — glazes, canvas weave, brushy oil, thick brushwork, palette-knife
  or sculptural impasto, texture paste, plaster. Each sets a typical depth and scale.
- **Texture depth** (mm) and **Painting width** (cm) — your estimate of how far paint
  ridges stand above the hollows beside them, and the painting's real size. One
  height field sized from these two numbers drives both the shading and the cast
  shadows, so a 3 mm ridge under a 15° light casts a shadow about 11 mm long.
- **Photo was lit** — *Even* (most photos: flat, scanned, two lamps, daylight) or the
  side the light came from. Even reads relief from recesses photographing darker
  and holds up from any new light direction; a side reads it from shading along
  that direction and is stronger when the photo was raking-lit.
- **Lighting** scenes (gallery track, museum spotlight, two-spot, window, softbox,
  overcast, raking, candlelight, chiaroscuro…) and a **Finish**.

Every individual slider is still available under **Fine-tune (advanced)**. Presets
are artistic approximations, not automatic material identification.

Each light has type buttons (**Spot, Track, Flood, Softbox, Window**) and one
**Diffusion** dial between them. Diffusion sets beam width, beam edge and the
light's physical size: a small source casts crisp shadows and a tight highlight; a
large one casts wide soft penumbrae, wraps light round the relief and flattens it.
**Angle to wall** swings the light about its aim point (low = raking, long shadows);
**Distance** reads in cm from the painting's width. **Mirror** adds a matched light
on the other side. Up to eight lights.

**Sweep light** (toolbar) orbits a low raking light round the painting to inspect
its texture, then gives your lights back (Esc or click again). The **Shadows** view
shows where the lights' cast and attached shadows land.

Projects and presets saved before calibrated relief open with their hand-set
Depth and Texture strength; touching texture depth, size or Photo was lit switches
them to calibrated relief.

Click **Before / After** (or B) for the original photograph. **Split view** adds a
movable comparison boundary. Comparisons and light guides never appear in exports.
Undo/redo restores settings, light edits and brush strokes; Cmd/Ctrl-Z and
Cmd/Ctrl-Shift-Z work outside text fields. History holds 40 edits and resets when
a different source or project opens. Source changes and capture calibration are
not part of creative undo history.

Surface controls separate fine, medium and broad relief. Protect color edges
reduces false texture at chromatic boundaries. Neutralize light cautiously reduces
brightness variation; it can also flatten painted tonal detail, so starts at zero.
Add/Remove Relief brushes amplify or suppress existing estimated texture locally;
they do not invent geometry or paint over the photograph.

Lights include beam edge, source size, adjustable falloff, beam aim, duplication
and presets (More light controls). Shift-drag changes distance; Alt/Option-drag
changes cone width. Dashed beam guides are approximate. Falloff 2 uses
inverse-square distance; softer settings are creative controls. Shadows use a
horizon march with an angular penumbra set by the source's size and distance; it
is an approximation of an area light, not a physical integration. Metallic is a
whole-surface artistic material.

Save project and Save variation include the original photo, light/material settings
and brush corrections in IndexedDB. Saves are local to this browser and origin;
download a project JSON for backup or transfer. Project import validates settings.
Project saving currently supports the single-photo workflow. Multi-photo capture
remains available in the expandable Demo & multi-photo capture section.

**My reusable presets** save the current lights, surface recovery, material,
shadows and exposure without saving the photograph or its local brush corrections.
Name and save a preset, then choose it and click Apply on another painting. Mark a
preset as automatic to apply it after Auto setup whenever a new painting is opened.
Presets persist in this browser and website origin. **Download current** creates a
portable `.digilight-preset.json` file; Import preset validates, saves and applies
one of these files. Imported presets receive a new local identity, so they do not
overwrite a same-named preset. A downloaded file is the durable backup if browser
site data is cleared.

Open your painting (JPEG, PNG or WebP). Drag a light, or use Horizontal/Vertical.
Power changes intensity; Distance controls height above the painting; Cone varies
from flood to spot. Add up to eight lights, choose Kelvin or custom colours.
Tune Source azimuth to the original photo's lighting direction, then adjust surface
strength and relief. Use Original to compare. Export renders the relit result even
when a diagnostic view is selected. PNG is lossless; JPEG uses quality 95.

Single-photo geometry is estimated, not a measured reconstruction. Pigment edges
can resemble relief, and flat copy lighting suppresses texture information.
Photometric mode supports matching photos with varied, known light directions;
use more than four shots with varied elevation when fitting ambient.

## Automatic deploys
`wrangler.jsonc` tells Cloudflare Workers Builds to publish this folder as a static
site on every push (no build step); `.assetsignore` keeps tests and notes out of it.

## Manual hosting
This folder is the complete static site. index.html must be at the deployment
root beside src/ and _headers. Upload the ZIP as a Cloudflare Pages direct upload,
or extract it and upload the folder using your existing static-assets workflow.
No npm build is needed. Deploy index.html, studio.css, src/ and _headers together.
For a local preview: python3 -m http.server 8000, then visit http://localhost:8000.
Do not double-click index.html; ES modules require an HTTP server.

## Repair notes — September 18, 2026
- Stable pointer capture while dragging; pointer cancellation cleanup.
- Horizontal/vertical light controls and a prominent photo-open button.
- Coalesced interactive rendering; recoverable image decode messages and URL cleanup.
- Capture texture preview capped to match preview resolution and GPU limits.
- Truth preview no longer overwrites recovered normals; Original shows the first photo.
- Fit verdict thresholds corrected from fractions to percentages.
- Export locks editing and suspends preview draws during shared-GPU tile rendering.
- Export uses relit view, output-resolution shadow/depth parameters and corrected
  normal-strength scaling; restores controls and preview after completion/failure.

## Validation
**Relief recovery** was scored against the synthetic painting's known relief
(correlation of recovered with true normals, along / across the original light
direction; 1 is perfect). Even soft light (light tent): 0.25 / 0.05 with the
directional estimate alone, 0.52 / 0.48 with Photo was lit = Even. Side-lit and
raking: 0.86 / 0.80 and 0.85 / 0.61, unchanged (sides use the directional estimate
only). A two-lamp copy stand recovers ≈0 either way, and fine achromatic grain
(cement, plaster) defeats both. These are synthetic numbers; real photographs add
pigment, varnish glare and lens effects the bench does not model.

**Shadows** are checked against the same known relief: deeper texture and lower
lights cast more shadow, a larger source softens it, and shadows land on slopes
facing away from the light, flipping sides when the light crosses.

Creative Studio was tested in headless Chromium with actual WebGL shaders:
upload and auto setup; preset changes; Before/After and split image pixels; slider
and light undo/redo; light dragging and duplication; brush pixels and stroke undo;
local project save/reopen and variations; portable project import/export; PNG and
scaled JPEG exports; reusable preset save/apply/default/download/import; preview
restoration; quick setup, photo lighting and depth undo; light types, angle and
mirror; sweep light; legacy project import; shadow physics; mobile layout;
photometric rendering and synthetic truth restoration. No browser or WebGL errors were reported.
At the 240x300 test resolution, PNG export matched preview pixels exactly.
Forced multi-tile export including a correction mask averaged 0.0021 byte levels
of difference across channels. This does not establish physical reconstruction
accuracy or guarantee identical results at every export resolution/device.

To rerun the main browser regression: install Playwright in your test environment,
serve this folder with `python3 -m http.server 8766`, then run
`node tests/browser.cjs`. Install its Chromium with `npx playwright install chromium`
or set DIGILIGHT_BROWSER to an existing Chromium executable. The test keeps images
and its project backup in a temporary directory.

Very large exports remain subject to browser canvas/memory limits; lower Export
Scale if encoding fails. Large blur/integration spans use adaptive sampling, so
very high-resolution exports can still differ subtly from preview.
