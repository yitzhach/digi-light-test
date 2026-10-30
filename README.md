# DigiLight
A static, local-in-browser relighter for paintings and photographs. No API keys, uploads to a server,
package installation or build step are required. Requires WebGL2 and floating-point
render targets; graphics acceleration must be enabled.

## Use
**Tools.** An icon strip picks what the panel shows: Setup (open a photo, Quick setup),
Auto, Scene, Light, Graze, Layers, Colour, Detail (calibrate, lamp-photo relief, profile, brush
corrections, fine-tune, views) and Save. On a phone it sits at the bottom of the screen
and shows one tool at a time, like Lightroom mobile; on a desktop it is a rail beside
the panel, where **All** shows every section at once. The app opens on **Setup**, which
also shows Auto's **Analyze**. Tool search (`/`) jumps to any control and switches to
its tool; it opens from the search icon beside the logo. Pressing the open tool's button
again minimizes the panel. Double-tap (or double-click) the painting for full screen. An **eye** button hides a tool's effect without losing its settings: the
Colour tool and each adjustment, Layers, each overlay, the Graze light and Fine-tune
(its sliders go back to their starting values while hidden).

**Scene · photos, people, rooms.** Besides paintings, DigiLight relights photographs as
spaces. Say what the picture shows (the chips at the top of Setup, or the Scene tool):
**Artwork** (a painting or flat piece: the relief relighter below, unchanged), **Photo**
(a place: ground and sky), **Portrait** (people), **Room · booth** (a room or an art fair
booth seen from its open side) or **Object** (a piece or product standing in front of a
wall). The app suggests one from the photo itself (a subject, skin tones, sky, room lines).
A photo type reads the photo's space, with no AI model or upload (src/scenedepth.js, about
0.1 s): how far each part is, the subject and its outline, the sky, the back wall or the
horizon. Then it lights it as a space: a lamp by the subject is nearer the face than the
wall, light falls off into the background, the subject throws its shadow across what
stands behind it, and the photo's own light is taken out first (Remove photo light).
**Light scenes** relight in one tap, every light still movable: golden hour, midday sun,
sunset, window light (plain, framed, through blinds or dappled leaves), overcast, gallery
spots, the studio's Rembrandt, soft key, butterfly, split and rim light, neon,
candlelight, moonlight and a stage spot; **Light from the right** mirrors them (press and
hold a scene to preview it). **Relight** everything, the subject only or the background
only; each light can also be for the subject or the background alone, and any light can
be the **Sun** (one direction everywhere, long shadows). **Shape of the scene** (Depth,
Roundness, Form from shading, Subject forward, Surface detail, Keep the sky, the back
wall, the horizon) corrects the reading. **Effects**: Haze (air between you and the far
parts, glowing toward the light), Light rays, Glow (bright light blooming, as in a lens)
and Background blur (a wide-open lens, sharp where the subject stands); exports match the
preview, tile for tile.

**Colour** has the image editor's adjustments (Brightness/Contrast, Levels, Curves,
Exposure, Vibrance, Hue/Saturation, Color Balance, Black & White, Channel Mixer),
plus **Relief (3D)** (0–300% of the set depth),
applied in that order to the relit image before the blend layers, each with its own
eye, plus one **Opacity** for the whole tool (it also scales Keep greys neutral, Room
light colour and Stroke definition). **Layers** ends with **Overlays**: Film grain
(amount, size, colour or mono, seed; made in the shader on a grid tied to the
painting's width, so a full-size export has the same grain as the preview), Vignette,
Light leak · warm glow, Window light and Spotlight pool, each with opacity, blend mode
and colour. Auto's **Opacity** fades the whole effect into the original photo.

Creative Studio starts each uploaded photograph with a restrained look: brushy oil
about 1 mm deep, photographed in even light. **Auto** (top of the panel) is the
fastest path: **Analyze** reads the photo (tone, clipping, colour, stroke contrast and
direction), fits a texture depth (where the relief adds about 21% stroke contrast under
a gallery light), finds the raking direction that shows the strokes most, and makes a
grid of one-tap looks for this photo: gallery, spot, the matched looks, raking and long
shadows, window, museum spot, plus your saved presets and projects adapted to it (the
fitted depth, the graze across the strokes, the key light on the side Photo was lit
names, exposure moved by this photo's brightness). **Strength** mixes the picked look with
the settings it replaced; **Opacity** fades the result into the photo; Undo steps back. **Quick setup** is the hands-on path:

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

The app opens on a sample painting (`samples/painting.jpg`); add `?synth` to the URL
to open on the synthetic one instead (the tests do). **Or open a sample** also offers
`DSC_8382`, a tripod shot of the same 19 in panel in even room light, cropped to the
panel's edges, with its three lamp shots (`samples/dsc8382/`) one click away in
Measure relief.

### Measure relief · lamp photos
An evenly lit photo hides most relief, and single-photo relief from it can be
plausible but wrong: on the DSC_8382 panel it correlated about 0 with what a lamp
really showed. This section (under Calibrate) measures the relief instead. Open
the evenly lit photo as your painting, then add two or three photos from the same
tripod, room light unchanged, each with one lamp close to the wall, moved between
shots so it lights the painting from different sides. Crop them all exactly alike,
to the painting's edges. For each, enter where the lamp was: above the top edge,
from the left edge, and out from the painting's face (not the wall: subtract a
panel's depth). Painting width and units are Calibrate's.

**Measure relief** lines each shot up to the painting photo (tripods creep: up to
2 px and a 0.3% zoom on the sample), divides it by the painting photo so the paint
colour cancels, takes out the room light and the lamp's own pool of light, and
reads the slopes that the remaining shading implies for a lamp at that place.
Two lamps from different sides give both slopes; a third lets the measurement
check itself (each shot predicted from the others). The slopes are integrated into
a height, and since they are in real units, **Texture depth is measured** and set
for you (the 2–98% spread of stroke-scale relief; broader paint masses are not
included). That relief then replaces the estimate everywhere, export included.
**Light like this** turns the graze light into that lamp; **Compare** shows the
lamp photo in Before / Split beside the render. Saved and downloaded projects (and
Export for testing bundles) keep the measured relief, switched on or off as it was;
the lamp photos themselves last for the session only.

Measure relief whenever you can. On the DSC_8382 panel, relief guessed from the evenly
lit photo alone matches the real lamp photos at r ≈ 0.0 (its shading lands in the
wrong places with any light, main or graze), the measured relief at r ≈ 0.8.

With every lamp above the painting, faces turned down are dark in all shots and the
relief reads about 20% shallow (synthetic tests); a lamp from below or level with
the middle fixes that. On the DSC_8382 set: relief from two lamp shots predicts the
third at r = 0.75–0.83 (stroke-scale detail), against about 0 for the single-photo
estimate; renders at the measured depth show roughly 60% of the photos' contrast.

**Export for testing** (Projects) downloads one .zip for bug reports: the project,
the photo, the full-resolution result, preview captures of the relit, original,
split, shadows and height views (and the sharp zoom, if shown), your note, and
`info.json` (browser, GPU, errors, a summary of the lights).

**Batch preview · compare looks** renders 2–10 looks of the painting as small
previews (WebP at the preview's size, up to 1400 px; JPEG where the browser cannot
encode WebP) and opens them in a full-screen viewer: swipe or Prev / Next, pinch,
double-tap or wheel to zoom (the zoom and spot stay put across looks), hold for the
original photo, 1–5 stars (4 and up are ticked for export). Looks come from steps of
one setting (texture depth, graze room light, shadow lift, graze angle or opacity,
exposure, the Colour & strokes settings), the lighting or graze presets, or your saved presets, each applied on top
of the current settings; the current look can be #1. **Export picked** renders the
ticked looks at full resolution in the Export format (one file, or a .zip for
several); **Download previews** saves the previews with `ratings.json`; **Use this
look** applies one (undoable). Exported looks are also saved as project variations
(Projects & variations → Saved) so they can be reopened and built on. Your settings and undo history are untouched by the
batch itself.

With several lights, only the strongest one casts full-length shadows; each other
light's shadows reach in proportion to its brightness (at least 15%), so fill lights
do not lay their own long streaks across the key light's. **Shadow smoothing**
(Fine-tune, in painting widths, default 0.004) keeps paint grain out of the main
lights' shadows, which otherwise smears into streaks along each light; the shading
keeps the full texture. Projects saved before it existed open with it at 0.

Each light has type buttons (**Spot, Track, Flood, Softbox, Window**) and one
**Diffusion** dial between them. Diffusion sets beam width, beam edge and the
light's physical size: a small source casts crisp shadows and a tight highlight; a
large one casts wide soft penumbrae, wraps light round the relief and flattens it.
**Angle to wall** swings the light about its aim point (low = raking, long shadows);
**Distance** reads in cm from the painting's width. **Mirror** adds a matched light
on the other side. Up to eight lights.

**Graze light · raking texture** adds a hard light almost flat to the painting (3°
by default, one painting width out, brightness compensated) for long, crisp cast
shadows. Drag the knob round the **circle** to light from any direction (Shift snaps
to 15°, arrow keys nudge), set **Opacity** to fade it over your own lighting (100% =
graze light alone) and **Angle to wall** (1–20°). **Visible/Hidden** turns it off
without losing its settings. It is saved with undo, projects, presets and exports.
A light a degree or two off the wall exaggerates every slope 30–60×, and the finest
scale of relief estimated from one photo is mostly grain and photo noise, so the
graze has its own controls for that: **Detail** (only relief at least this wide
casts graze shadows; the graze sees a smoothed copy of the relief), **Fine texture**
(finer relief comes back in the shading only, at the contrast a 10° light gives it),
**Shadow length** (lets graze shadows run as far as height and angle allow),
**Clean shadows** (a bump must stand this tall to cast), and **Softness** (lamp size,
bulb to strip light). **Graze preset** offers Gentle raking, Classic raking (the
default), Long shadows, Long shadows clean surface, Soft strip light, and Every
detail (raw, the old look). `tools/graze-lab.cjs` measures these against synthetic
paintings with known relief.
`tools/render-batch.cjs --spec tools/batches/<name>.json` renders a numbered batch of
look variants (patches on one base scene) to PNGs plus a labelled contact sheet, and
scores any variant lit like a lamp photo against that photo.
The **Grazing side light** preset makes one of your own lights a grazing light;
Angle to wall goes down to 1°, and Brightness is logarithmic so these powers fit.

**Colour & strokes** (under Quick setup) holds four controls that are off by default
and leave the render exactly as before. **Keep greys neutral** white-balances the
camera toward the lights' mix (0 = a daylight camera, where a warm lamp turns white
paint beige; 100% = grey paint stays grey, while a warm key over a cool room light
still keeps warm faces and cool shadows). **Vibrance** adds or takes colour from coloured
paint and leaves greys, whites and darks alone. **Room light colour** sets the Kelvin of
the soft room light (6500 K = the plain white it always was). **Stroke definition**
darkens the creases between brush strokes and lifts their crests, from the relief's
curvature at **Stroke size** (a band from a quarter of that size up to it, so the
finest grain is left alone); it changes only light, never colour, and adds no detail.
The **Gallery spot, upper right** lighting preset uses all of them: one warm spot off
the upper right, greys 70%, vibrance 35%, strokes 50%. It came from an AI-relit image of
the red panel: the AI redrew the paint's fine texture, which DigiLight will not do, but
its grey-stays-grey colour and defined strokes are reproduced here from the photo and
its relief alone (photo detail kept: 91% at 3–9 px, 99% at 9–27 px on a 1000 px image).

**Shadow lift** (on each light, and in Graze light) starts in the middle (off).
Right of centre brightens the dark tones the light falls on, left of centre deepens
them. Lifting helps with black paint and recesses that read dark in the photo, which a relight
alone keeps dark because it multiplies the photo's own colour. It is a tone curve on
the displayed colour (strongest around 15% grey, white untouched, hue kept), scaled by
how much of the light's pool reaches each point: full on the part of the painting
nearest the light, fading with its distance falloff and beam edge. The plain graze
light lifts evenly (it stands for a distant light); a calibrated lamp's lift fades.
Off (the default) leaves the render exactly as before. Against the DSC_8382 lamp
photos the shadows under a calibrated lamp come out too deep mostly for lack of room
light: Calibrate's room light at about 0.25 (Light like this leaves 0.06) matched the
photos' shadow depth best, with measured and one-photo relief alike; lift adds less.

**View zoom.** The toolbar **− / 100% / +** zooms the view from 20% to 1000% (steps … 4, 6, 8, 10×)
(keys - = 0); 100% fits the painting to the stage and the percentage button returns there.
Ctrl/Cmd + mouse wheel, or a trackpad pinch, zooms smoothly about the pointer; on a phone, pinch with two fingers. **⛶ Full screen** shows only the painting.
Zoomed out, lights standing well beyond the painting come into view (**Show all
lights** picks the zoom that shows every dot). Zoomed in, the stage scrolls
(scrollbars, wheel, two-finger swipe, a finger on a touch screen) and you can pan
like an image editor's hand tool: hold Space and drag, or drag with the middle
button. A dot outside the visible
part of the stage, beyond the painting or scrolled out of view, is pinned to its
edge with a dashed ring. Zoom is a view setting: it is not undone or saved.
The preview works on a copy of at most 1400 px, so zoomed in on a larger photo the
view sharpens a moment after you stop: the visible part is rendered again from the
full-resolution photo, through the same tiles as Export, at about one pixel per
screen pixel. What you inspect at 400% is what the export contains. What has been
rendered stays: scrolling back over it is sharp at once, a band around the view is
rendered ahead while you look, and a new zoom shows the old detail stretched until
the new is ready. A change to the picture shows the working copy until the view is
still again (single photographs only).
**Light dots: on/off** shows or hides the dots; grabbing one leaves Before/After,
Split and brush mode.

**Layers · blend effects** stacks up to four copies of the Original photo (or the
Relit image) over the result with a blend mode (Normal, Multiply, Screen, Overlay,
Soft/Hard/Linear/Vivid/Pin light, Color dodge/burn, Darken, Lighten) and opacity.
Layers apply in display space, appear in exports, and are saved with undo,
projects and presets. Pin light or Soft light of the original adds natural highlights.
Each layer has a **mask**: *Paint hide* / *Paint show* brush where the layer applies
(a red tint marks hidden areas while you paint), *Hide all* starts from nothing so
you can paint the effect in, *Reset* removes the mask. Masks are saved with undo
(one step per stroke), projects and exports; presets carry layers without masks,
and opening a new photo clears them.

**Sweep light** (toolbar) orbits a low raking light round the painting to inspect
its texture, then gives your lights back (Esc or click again). The **Shadows** view
shows where the lights' cast and attached shadows land.

Projects and presets saved before calibrated relief open with their hand-set
Depth and Texture strength; touching texture depth, size or Photo was lit switches
them to calibrated relief.

Click **Before / After** (or B) for the original photograph. **Split view** adds a
movable comparison boundary. Comparisons and light guides never appear in exports.
Undo/redo restores settings, light edits and brush strokes; Cmd/Ctrl-Z and
Cmd/Ctrl-Shift-Z work outside text fields. History holds 40 edits and resets when a
project opens; opening a new photo is itself undoable (Undo restores the previous settings). Source changes and capture calibration are
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

## Automation
Scripts and AI agents can drive the app: `window.digilight` in the page (load a photo,
Analyze, apply a look, say what a photo shows and relight it with a light scene, set any
setting by name, render or export, project get/set),
URL parameters (`?image=`, `?set=`, `?look=`), a `postMessage` bridge (`?bridge`) and
a headless command line, `tools/digilight-cli.cjs`, and an MCP server,
`tools/digilight-mcp.cjs`, so an AI assistant can relight a painting or a photo while you chat.
See `docs/automation.md`.

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

**Measured relief** (lamp photos) is checked against synthetic paintings with known
relief, rendered under point lamps with room light: with three lamps above and
relief like the sample's, height correlates 0.91 with the truth and depth comes
out 10–20% shallow; with lamps on four sides, depth is right. Alignment recovers a
2 px shift to within 0.3 px, and a tiled export matches the preview.

**Shadows** are checked against the same known relief: deeper texture and lower
lights cast more shadow, a larger source softens it, and shadows land on slopes
facing away from the light, flipping sides when the light crosses.

Creative Studio was tested in headless Chromium with actual WebGL shaders:
upload and auto setup; preset changes; Before/After and split image pixels; slider
and light undo/redo; light dragging and duplication; brush pixels and stroke undo;
local project save/reopen and variations; portable project import/export; PNG and
scaled JPEG exports; reusable preset save/apply/default/download/import; preview
restoration; quick setup, photo lighting and depth undo; light types, angle and
mirror; light dots over compare/brush; reopening a photo keeps edits; grazing
preset and view zoom; zoom to 400% (steps, keys, Ctrl+wheel about the pointer,
scrolling, Space and middle-button panning, pinned dots, light drags and brush strokes
while zoomed in); sharp zoom detail; graze light effect; blend layers and layer masks; sweep light; legacy project import; shadow physics; colour & strokes (no-op when neutral, greys neutral, vibrance spares greys, room light colour, stroke definition exports as previewed, saved and validated); mobile layout;
photometric rendering and synthetic truth restoration. No browser or WebGL errors were reported.
At the 240x300 test resolution, PNG export matched preview pixels exactly.
Forced multi-tile export including a correction mask averaged 0.0021 byte levels
of difference across channels. On an 1800 px photo at 400%, the sharp zoom detail
matched the same region of a full-resolution export to 0.005 byte levels, where the
magnified 1400 px preview was 4 levels off. This does not establish physical reconstruction
accuracy or guarantee identical results at every export resolution/device.

To rerun the main browser regression: install Playwright in your test environment,
serve this folder with `python3 -m http.server 8766`, then run
`node tests/browser.cjs`. Install its Chromium with `npx playwright install chromium`
or set DIGILIGHT_BROWSER to an existing Chromium executable. The test keeps images
and its project backup in a temporary directory.

Very large exports remain subject to browser canvas/memory limits; lower Export
Scale if encoding fails. Large blur/integration spans use adaptive sampling, so
very high-resolution exports can still differ subtly from preview.
