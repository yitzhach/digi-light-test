# Automating DigiLight

DigiLight can be driven by a script or an AI agent in four ways, all on the same API:

1. **`window.digilight`** in the page (browser console, Playwright, an extension).
2. **Bridges**: URL parameters on open, and `postMessage` from a page that frames or opens DigiLight.
3. **`tools/digilight-cli.cjs`**: a command-line tool that runs the app headless.
4. **`tools/digilight-mcp.cjs`**: an MCP server, so an AI assistant (the Claude desktop app,
   Claude Code) can relight a painting while you chat with it. See [MCP server](#mcp-server).

Every change goes through the same checks as importing a project, so a script cannot
put the app in a state the panel could not reach. Each call that changes settings is
one undo step. Calls run one at a time, in order; each returns a Promise.

## `window.digilight`

| Call | Returns |
| --- | --- |
| `ready()` | `info()` once the app has settled |
| `info()` | `{version, photo {width, height}, preview {width, height}, sample, mode, measuredRelief, undo, redo}` |
| `load(src)` | opens a photo. `src` is a URL (CORS-enabled), a data URL, a `Blob`/`File`, or `{sample: 'painting' \| 'dsc8382'}`. Auto setup runs, as for an upload. Returns `info()` |
| `settings()` | every setting, the same object a project saves |
| `get(path)` | one setting by path, e.g. `get('graze.opacity')`; no path = `settings()` |
| `set(path, value)` / `set({path: value, ...})` | changes settings in one undo step; returns the new values. Throws, changing nothing, on an unknown name or a value out of range |
| `setSettings(obj)` | replaces top-level settings (missing ones keep their values) |
| `describe()` | `[{path, label, min, max, step, value}]` for every setting that can be set |
| `addLight(kind, fields)` | adds a lamp (`'light'`) or a Shadow light (`'shade'`, `'negative'`), as + Light / + Shadow do, with any fields changed; returns `{index, light}` |
| `removeLight(index)` | removes one (not the last) |
| `presets()` | `{lighting: [...], graze: [...], looks: [...]}` names |
| `applyPreset(kind, name)` | a lighting scene, a graze (raking) preset or a matched look. No Analyze needed |
| `analyze()` | Analyze (Auto section): `{tone, light, strokes, rakeDeg, depthMm, depthWhy, looks}`. Slow in software GL (1–3 min); milliseconds per render on a real GPU |
| `looks()` | the looks from the last Analyze: `[{index, name, kind, note, exposure}]` |
| `applyLook(nameOrIndex, {strength})` | applies a look made for this photo (runs Analyze first if needed). `strength` 0–1 mixes from the settings before the look |
| `undo()` / `redo()` | `true` if there was a step |
| `render({format, quality, as, metrics})` | the preview as a data URL (`as: 'blob'` for a Blob). `format` png (default), jpeg or webp. `metrics: true` returns `{image, metrics}` (see Metrics below); `change: true` (or `{map, range}`) adds `change: {image, stats}`, the change map (below) |
| `exportMany(items, {metrics, format, quality})` | several pictures at once: `items` `[{settings, width?, crop?, format?, quality?}]` (settings from `settings()` or a record, taken as they are). Items that need the same relief (same surface settings, size and crop) share one tiled pass, so the relief is built once for all of them, not once per picture; returns what `export` returns for each, in order, and puts the settings back. The CLI `batch` uses it |
| `export({width, crop, format, quality, as})` | the full-size export (tiled, the photo's own resolution), or `width` px wide; `crop` `{x, y, w, h}` (or `"x,y,w,h"`) in that image's pixels, or all four 0–1 as fractions, renders only that part, with the same pixels a whole export has there; `metrics: true` and `change` as `render` |
| `measureRelief({photos, widthCm, deepestMm, lineUp})` | relief measured from lamp or sun photos instead of estimated from the one photo (the app's Measure relief · lamp photos): `photos` `[{src, lamp: {left, above, out}}]` (cm from the painting's left and top edges, out from its face; one tripod) or `[{src, sun: {azimuthDeg, elevationDeg}}]` (where the sun came from: 0 right, 90 above, 180 left; its angle to the face), each cropped like the painting photo or handheld: a photo shaped unlike the painting photo is lined up on it first (src/lineup.js), as is one with `lineUp: true` (its own, or for all; `false` never). `deepestMm`, the artist's deepest relief (lowest to highest), sets the depth (one sun angle cannot: see [Measured relief from sunlight](#measured-relief-from-sunlight)). Returns `{depthMm, rangeMm, textureDepthMm, check, shots, ...info()}` (`shots[i].lineUp`: `{H, matches, inliers, patches, errorPx, covered}` when lined up); one undo step |
| `getProject({name})` | the project (`.digilight.json` object: photo as data URL, settings, measured relief) |
| `setProject(objOrJSON)` | opens a project |

### Setting paths

Paths are dotted names into `settings()`. The common ones:

- Light and tone: `exposure`, `ambient`, `shadow`, `shadowSoftness`, `highlightRolloff`
- Surface: `textureDepthMm`, `paintingWidthCm`, `photoDiffuse` (0 lit from a side, 1 even), `azimuthDeg`, `albedoSuppress` (De-light)
- Colour & strokes: `neutralWB` (Keep greys neutral), `vibrance`, `roomKelvin`, `strokeDef`, `strokeSize`, `strokeDir` (Stroke direction)
- Lights: `lights.N.x|y|z|power|kelvin|cone|softness|falloff|aimX|aimY|size|lift|enabled|useKelvin|hex` (N from 0; `x`, `y` in painting widths, 0,0 bottom left)
- Shadow lights (lights with `kind` `shade` or `negative`): `lights.N.kind`, `lights.N.dark` (a shade's Darkness, 0–1), `lights.N.shape` (`pool`, `window`, `blinds`, `leaves`),
  `lights.N.patternSize` (0.25–4), `lights.N.patternRot` (0–360°), `lights.N.size` (shape blur); `kelvin` is the tint of the light left in the shadow
- Graze (raking) light: `graze.enabled|angle|elevation|opacity|detail|fine|reach|clean|soft|lift|fill|sun`;
  `graze.sun: true` makes it the sun: one direction everywhere, no falloff, even over the painting,
  `elevation` up to 60° (20° without; turn the sun off at 20° or less)
- Colour tool: `adjust.on`, `adjust.opacity`, `adjust.<name>.<field>`, e.g. `adjust.relief.amount`, `adjust.relief.form` (Broad form), `adjust.relief.formSize` (Broad size, 0–400%), `adjust.exposure.exposure`, `adjust.hueSat.saturation`; `adjust.curves.rgb` is a list of `[x, y]` points (0–1)
- Overlays: `overlays.<grain|vignette|leak|window|pool>.on|opacity|...`
- Layers: `layers` (a list of `{mode, source, opacity, enabled}`), `layersOn`, `originalTop`

`describe()` lists all of them with the panel's labels and ranges.

### Example

```js
await digilight.load('https://example.org/painting.jpg');
const a = await digilight.analyze();          // a.looks: the looks made for this photo
await digilight.applyLook('Matched + raking', { strength: 0.8 });
await digilight.set({ 'adjust.relief.form': 1.5, 'adjust.relief.formSize': 0.6 });
const png = await digilight.export({ format: 'png' });   // data URL, full size
```


### Metrics

One set of numbers for every picture, the same ones `tools/looks/stats.py` gives the review
page (`src/measure.js` `imageMetrics`), measured on the render and on the photo drawn at the
same size and crop. `render({metrics: true})`, `export({metrics: true})`, the CLI's `render` and
`batch`, and the MCP `render_preview` and `export_image` all return it:

- `render`, `photo`: `hi` / `lo` the share blown (any channel ≥ 250) / crushed (all ≤ 5);
  `p05` `p50` `p95` luma percentiles (0–255); `fine`, `mid`, `broad` texture per unit
  brightness at ~3, ~13 and ~27 px (box filters); `thirds` the median luma of the left,
  centre and right thirds.
- `vsPhoto`: `newBlown` / `newCrushed` the share of pixels clipped in the render and not in
  the photo; `darksLift` p05 levels over the photo; `stops` tone shift (p05, p50, p95);
  `detail` each texture scale as a share of the photo's (1 = the same); `thirds` each third
  in stops.
- `warnings`, in words, when a limit is passed (`LIMITS` in measure.js, docs/roadmap.md §5):
  newly blown over 0.3%, newly crushed over 0.15%, darks below the photo or lifted over 8
  levels, fine or mid texture under 85% of the photo's.
- `size`, `crop`, `ms` (time to measure: about 0.6 s per megapixel, the photo's side is kept
  between calls at the same size and crop).

Measured on the preview it describes the preview; for detail at full resolution, use an
export (a `crop` is quick).

The photo side is drawn exactly the way the picture's own pixels started (the preview's copy of
the photo for a preview; cut from the full photo as the export cuts its tiles, for an export), so
an unchanged picture measures as zero change. Resampled any other way the photo is a level or
two off, and on a bright painting that alone counted half a percent as newly blown.


### Guard

Every change through `window.digilight` (`set`, `setSettings`, `applyLook`, `applyPreset`,
`addLight`, `removeLight`) is checked against the photo at the preview's size (`src/guard.js`).
If it newly blows more than 0.3% of the picture to white or crushes more than 0.15% to black,
the guard moves settings in the same undo step (the user's picks, 10-21): exposure, down until
nothing new blows, for whites; room light (Ambient, up to 1) until half the darks limit (it
judges at the preview's size; full size shows a few more dark specks), for darks; and when
that room light blows whites, exposure back down to the whites limit. `set` returns the values after it, `lastGuard()` what it
did (`{ok, fixed, before, after, changes: {path: [from, to]}, note}`, e.g. "Guard: exposure +2.50
→ +1.95"), and `applyLook` / `applyPreset` add `guard: note`. `guard({fix})` checks the picture as
it stands (`fix: false` only reports; `whites` / `darks` name the settings to move, in order, and
`ambientMax` caps the room light, `limits` ({newBlown, newCrushed}) sets what it aims under,
for trying other ways; besides those it moves `highlightRolloff`, `graze.lift`,
`adjust.levels.outBlack` and `adjust.lift.amount`); `setGuard(false)` turns it off. When even
the furthest a setting may go is not enough, the guard still applies it and says it fell short. In the app, tapped looks
and presets are guarded the same way; a hand-moved slider never is: a chip on the picture says
what clips, with Fix. The CLI guards each job once after all its options (`"guard"` in the
output line; `--no-guard`, or `"guard": false` in a job, to skip); the MCP server has `guard` and
`set_guard` and adds the note to a change's answer.


### Record

`record(extra)` says what the picture was made from: `{format: 'digilight-record', version, at,
renderer {name, software}, photo {width, height, sample}, look {name, kind, strength,
changedSince} | null, settings, ...extra}`. `setSettings(record.settings)` on the same photo makes
the same picture again. The CLI writes one beside every picture it renders (`FILE.json` next to
`FILE.jpg`), adding the app's code hash (sha256 of `src/`), the input (name, and a file's sha256),
the recipe (`job`: look, preset, set, exposureAdd, scale, addLights, width, crop), the output,
what the guard did and the metrics; `--no-record` (or a job's `"record": false`) skips it. The MCP
`export_image` writes one too (`record: false` skips it).

### Exact pictures and fingerprints

DigiLight calculates, it never regenerates: every output pixel is the photo's own pixel at that
place times light computed from the relief. With nothing changed (Original on top 100%) a
full-size export is the photo bit for bit (tests/exact.cjs, on random noise; give it a PNG: a
JPEG decodes a level or two differently in different software). `record()` is async and holds
`photo.pixelsSha256`, the SHA-256 of the photo's RGBA pixels as decoded. `export`, `render` and
`exportMany` with `hash: true` (or `metrics: true`) also return `pixels: {width, height, sha256}`,
the fingerprint of the picture's RGBA pixels before PNG / JPEG encoding, and the CLI and MCP
records keep it as `output.pixels`. `node tools/digilight-cli.cjs verify FILE.json [--photo PATH]
[--out FILE]` re-renders a recorded picture from its photo and settings and says whether it is
the same picture, pixel for pixel (exit code 1 if not; with a PNG beside the record, how many
pixels differ and by how much).

Fixed 10-22 (was a known gap): a picture made by applying a look could export differently in
different page sessions (two fingerprints for the red-panel favourite at 900 px, speckled apart
up to 99 levels), because the photo itself reached the relief a level apart: a resized export,
the sharp zoom and the metrics shrank it with the browser's high-quality drawImage, which is not
stable under load (two pages at once, or a fresh Analyze, gave the other picture), and a JPEG
decoded through a GPU-backed canvas differs from a CPU-backed one by a level on a quarter of its
values. The photo is now decoded once into a plain canvas (app.js `pinPixels`) and resized by
src/resample.js (an area average in sRGB; a tile's pixels are the whole picture's there).
tests/repeat-look.cjs (fresh pages two at a time, one with a fresh Analyze) and tests/exact.cjs (block means, resized and
JPEG identity) check it. Records made before 10-22 of resized pictures, or from JPEG photos,
will not verify: their photo was decoded or resized the old way.

### Change map

What a picture changed, pixel by pixel, against the photo it was made from (`src/changemap.js`):
proof, from the two pictures alone, that each pixel is the photo's own pixel under some light
and nothing else was touched. `render`, `export` and `exportMany` (per item or for all) take
`change: true` or `{map: 'light' | 'colour', range}`, and return `change: {image, stats}`
(the map as a PNG at the picture's size; the photo is the same pixels the metrics use):

- **light** (default): the light each pixel was multiplied by, in stops (log2 of the render's
  linear luma over the photo's). Grey = unchanged, orange = brighter, blue = darker, full colour
  at `range` stops (default 2).
- **colour**: how far each pixel is off the photo's own colour at its new brightness (the photo's
  linear RGB times that light), in levels, the largest channel. Black = the photo's colour,
  white = 32 levels or more. A coloured lamp, warmth (Kelvin), the Colour tool and clipping
  show here; light alone, however strong, does not.
- `stats`: `same` (share of pixels identical to the photo), `light` (stops: `min`, `p01`,
  `p05`, `p50`, `p95`, `p99`, `max`; `brighter` / `darker` the shares moved over 0.05 stop),
  `colour` (levels: `p50`, `p95`, `p99`, `max`; `off` the share over 4 levels: under that is
  8-bit rounding), `crop`.

With nothing changed (Original on top 100%) `same` is 1 and the map is plain grey
(tests/exact.cjs). The CLI writes it with `--change-map FILE.png` (`--change-kind colour`,
`--change-range N`; a batch job's `"changeMap": "FILE.png"` or `{file, map, range}`), the MCP
`render_preview` returns it as a second image (`change_map: "light" | "colour"`) and
`export_image` writes `FILE-change.png` beside the picture; the numbers go in the output and
the record (`change`). `node tests/changemap.mjs` checks the maths on pictures whose change is
known.

### Renderers agree

The same settings must give the same picture whatever draws it: an agent may render headless in
software GL while a person looks on a GPU. `node tests/renderers.cjs` renders the same pictures
(random noise, the sample painting, the user's plaster door; nothing changed, three presets and
an Analyze look; 900 px) in two GL implementations and compares them pixel for pixel. In the
cloud there is no GPU, so it sets Chromium's SwiftShader against Mesa's llvmpipe (another shader
compiler and rasteriser, drawn through Xvfb: `DIGILIGHT_GL=llvmpipe` for the CLI too); on a
computer with a graphics card, `RENDERER_B=gpu node tests/renderers.cjs` sets SwiftShader
against it. The stated tolerance:

- **Nothing changed** (Original on top 100%): bit for bit, on every renderer (the photo's own
  texel; no GL arithmetic touches it).
- **Anything else**: at most 2% of pixels more than 2 levels apart (0–255, the largest channel),
  the 99th percentile within 3 levels, the mean within 0.75 level; the change map's median light
  within 0.02 stop.

Measured 10-22 (SwiftShader / llvmpipe): about half the pixels differ by one level (rounding in
linear light); presets and looks p99 1 level, mean 0.11–0.50, max 2–9; the worst, the door under
Classic raking, 1.03% over 2 levels, p99 3, mean 0.59, max 25 (pixels on a cast shadow's edge,
where the two step the shadow march differently). Metrics and the change map agree to their
rounding (detail per scale within 0.02). A fingerprint (`pixels.sha256`) belongs to one renderer:
`verify` on another renderer reports a different fingerprint and which renderer each was made on;
with a PNG beside the record it also says whether the two are within this tolerance
(`vsFile.withinRendererTolerance`, exit code 0 if so).

### Measured relief from sunlight

Sunlight is an even, distant lamp: one photo of the painting in low sun, besides the evenly lit
one, measures the relief instead of guessing it from one photo (docs/real-light-test.md: on the
user's plaster door, light and shade correlation with the real sun about 0 for the one-photo
estimate, 0.55 / 0.60 mid / broad measured). `measureRelief` with `sun`, the CLI's `measure`
and the MCP `measure_relief` do it:

```
node tools/digilight-cli.cjs measure flat.jpg --sun sun.jpg:40:10.3 --width-cm 52 --deepest 3.2 --out relit.jpg
```

- The sunlit photo can be given as taken (handheld, from another spot, background and all): a
  photo shaped unlike the flat one is lined up on it (src/lineup.js, 10-24: SIFT-like features on
  brightness and on the colour ratio, a RANSAC homography, then refined with patches over the
  whole painting; then the lamp photos' own alignment). `--line-up` (`lineUp: true`, MCP
  `line_up`) lines up one shaped like it too. On the user's door and lintel it lands within a
  median 0.4 / 0.8 preview px of tools/realref/register.py (OpenCV), and the relief measured from
  it correlates 0.95 / 0.99 with the one from register.py's (tests/lineup.cjs; 15-20 s each
  with the measurement). The painting must fill a good part of the photo (at least 12 matching
  points must agree; 120-250 did here).
- The sun has a direction, no position: `FROM` where it came from in the picture (0° right,
  90° above, 180° left), `ANGLE` its angle to the painting's face.
- Depth: one sun angle cannot tell a shallow relief under a high sun from a deep one under a low
  sun. Give `--deepest` (mm, lowest point to highest) and Texture depth is scaled to it;
  without it the depth is what the angle given implies.
- One sun photo gives the slopes along the sun's light only; a second with the painting turned
  about 90° gives both (and a third lets the measurement check itself).
- Light like this (a sun row; `digilight` after `measureRelief`: the panel's button) makes the
  graze light that sun (`graze.sun`), its room light the sky's share read in the photo; without a
  deepest relief, Fit depth then fits Texture depth to the photo's stroke contrast under it.
  Since 10-24 a sun photo's shadows are read (the surface falls away at least as steeply as the
  sun's rays) and its broad forms dropped like a lamp's: on a stand-in of known relief made by the
  app (tests/sunflat.cjs) the artist's depth now gives the true stroke slopes (1.06; before 0.32)
  and Fit depth comes near (0.72). On the real lintel the two still differ 1.8× (deepest 1/8"
  gives 1.58 mm, Fit depth 2.85 mm; before 1.76 / 4.0): the photo has more contrast than the
  renderer gives that relief (docs/real-light-test.md, "10-24"). Prefer the artist's depth.
- Looks made by Analyze on measured relief drop their graze smoothing (Detail 0, Fine 100%).
- Take it with the sun low enough to cast shadows (10–30° to the face): the sky light's share is
  read from the deepest shadows, and without any it reads high and the relief deep.
- Measured relief drops forms broader than 6% of the width and reads relief up to
  about stroke scale in detail (docs/real-light-test.md, 10-22 and 10-24, for what was tried);
  `--drift` / `--beam` (`driftSigma`, `beamSigma`, in painting widths) try other values.
- Tests: `node tests/sunrelief.mjs` (a synthetic painting in sun, known relief), `node tests/sunflat.cjs`
  (the app's own sun render of a known relief on the lintel's paint, with slow unevenness; ~4 min).

## Bridges

### URL parameters (run once on open)

- `?image=URL` opens a photo, `?project=URL` a `.digilight.json`, `?sample=dsc8382` a sample
- `?set=exposure=0.3;graze.opacity=0.5` (or URL-encoded JSON `{"exposure":0.3}`)
- `?analyze` runs Analyze; `?look=Name&strength=0.8` runs Analyze and applies that look

Example: `https://digi-light-test.bobdylan2000.workers.dev/?sample=painting&look=Gallery`

An error is shown in the hint box at the top of the painting.

### postMessage

Open DigiLight with `?bridge` in an iframe or with `window.open`. Only the framing or
opening page can call it, and the page shows a notice while the bridge is on.

```js
const f = document.querySelector('iframe');           // src: .../?bridge
let n = 0;
const call = (method, ...args) => new Promise((resolve, reject) => {
  const id = ++n;
  addEventListener('message', function on(e) {
    if (e.source !== f.contentWindow || e.data?.digilight !== id) return;
    removeEventListener('message', on);
    'error' in e.data ? reject(new Error(e.data.error)) : resolve(e.data.result);
  });
  f.contentWindow.postMessage({ digilight: id, method, args }, '*');
});
// DigiLight posts {digilight: 'ready', version} to the parent/opener once it can take calls.
await call('load', { sample: 'painting' });
await call('set', 'exposure', 0.25);
const jpeg = await call('render', { format: 'jpeg' });
```

## Command line: `tools/digilight-cli.cjs`

Needs Node and the tools' packages (`cd tools && npm install`, then
`npx playwright install chromium` once); in cloud sessions set
`DIGILIGHT_BROWSER=/opt/pw-browsers/chromium`. It serves the repository itself
(`DIGILIGHT_URL=https://digi-light-test.bobdylan2000.workers.dev/` uses the live site instead,
`DIGILIGHT_GPU=1` the computer's graphics card instead of software rendering;
`DIGILIGHT_GL=swiftshader|gpu|llvmpipe` picks the GL by name: llvmpipe is Mesa's software GL,
another implementation than Chromium's SwiftShader, drawn through Xvfb on Linux; see
[Renderers](#renderers-agree)).

```
node tools/digilight-cli.cjs <command> <input> [options]
```

- **input**: a photo path or http(s) URL, a `.digilight.json` project, or `sample:painting` / `sample:dsc8382`
- **commands**: `info`, `analyze` (JSON readout and looks), `describe` (settable paths),
  `get` (settings after the options; `--path a.b` for one), `render` (writes `--out`),
  `measure` (relief from `--sun FILE:FROM:ANGLE` / `--lamp FILE:LEFT:ABOVE:OUT` photos,
  `--width-cm`, `--deepest MM`, `--line-up`; see [Measured relief from sunlight](#measured-relief-from-sunlight)),
  `verify` (re-renders a record and checks it),
  `batch` (many renders from one Analyze, see below)
- **options**, applied in this order: `--preset kind:name` (repeatable), `--look NAME|N
  --strength 0..1`, then `--set "a=1;b.c=2"` or JSON (repeatable; after the look, so it wins); output: `--out FILE.png|.jpg|.webp`,
  `--width N` (else full size), `--crop x,y,w,h` (only that part, at full detail: pixels, or
  fractions of 1; a true 100% loupe for a fraction of a full export's time), `--preview` (the
  preview size), `--quality`, `--save-project FILE`, `--change-map FILE.png` (the change map,
  above; `--change-kind colour`, `--change-range N`)

`render` and `batch` print each picture's metrics (below); `--no-metrics` skips them.

```
node tools/digilight-cli.cjs analyze photo.jpg
node tools/digilight-cli.cjs render photo.jpg --look "Matched + raking" --strength 0.8 --set "adjust.relief.form=1.5" --out relit.png
node tools/digilight-cli.cjs render project.digilight.json --preset "graze:Classic raking" --width 2000 --out raking.jpg
```

Prints JSON on stdout; on an error prints it on stderr and exits 1. Analyze is slow in
software GL (no GPU): 2–3 minutes. A full-size export of a 1000×1500 photo takes ~10 s, or
~60 s with Broad form on (its blur widens every tile's margin). In software GL the export
uses 4096 px tiles (2048 on a GPU), and the relief is rebuilt only when a setting it is made
from changes, so jobs that differ only in lights, tone or the graze skip that step.

**Several looks or variants of one photo: use `batch`.** Jobs that share a relief (most rounds:
looks and lamps change, the surface does not) are rendered together, the relief built once for
all of them (`--no-many` renders each on its own). Each `render --look` runs its own
Analyze; `batch` runs it once and then renders every job from the settings the photo
opened with (~10 s each instead of ~3 min each). Run one CLI at a time: parallel runs share
the CPUs and are slower in total.

```
node tools/digilight-cli.cjs batch photo.jpg --jobs jobs.json
```
`jobs.json`: `[{"out": "01.jpg", "look": 0}, {"out": "05b.jpg", "look": 4, "set": "adjust.relief.smooth=0.4", "quality": 0.9}]`
(each job: `out`, and any of `look`, `strength`, `preset` (`kind:name` or a list), `set`
(string, object or a list), `exposureAdd` (stops added to the exposure the look fitted, so
"+0.3" means the same on every photo), `scale` (`{"textureDepthMm": 1.2}`: each setting times a
factor, on the value the look set, so "20% deeper" means the same on every photo, kept inside the setting's range), `addLights` (a list of `{kind, fields}` as `addLight`),
`width`, `crop`, `preview`, `quality`, `changeMap`). Prints one JSON line per file.

**Analyze is cached on disk.** The CLI and the MCP server keep each finished Analyze in
`~/.cache/digilight/analysis` (one ~0.5 MB file per photo), so analyzing the same photo
again, from the same starting settings and the same app code, loads in a second or two
instead of 2–3 minutes (the JSON says `"cached": true`). Any change to the photo, the
settings it starts from or the app's `src/` misses and analyzes again. `--fresh` forces a
new Analyze; `DIGILIGHT_CACHE=/some/folder` moves the cache, `DIGILIGHT_CACHE=0` turns it
off. In the page: `digilight.getAnalysis()` / `digilight.setAnalysis(saved)` (refused when
the saved one was made from other settings).

## MCP server

**What it is, in plain words.** MCP (Model Context Protocol) is the way an AI assistant
like Claude gets new abilities on your computer. With this server added, you can say to
Claude, for example: *"Open ~/Pictures/red-panel.jpg in DigiLight, try a raking light
from the left, show me, then make it a bit warmer and export it to my Desktop."* Claude
then runs DigiLight invisibly in the background (no window opens), changes the settings,
**looks at the result itself** (it gets a small picture after each step), and saves the
image. It is the same app and the same settings as the website; Claude just presses the
buttons for you.

It runs on a computer (Mac, Windows or Linux), not on a phone.

### Set it up (once)

1. Install **Node.js** (the LTS version) from https://nodejs.org.
2. Get this repository onto the computer (GitHub › Code › Download ZIP, unzip it; or `git clone`).
3. In a terminal, in the repository folder:
   ```
   cd tools
   npm install
   npx playwright install chromium
   ```
4. Add the server to your assistant. Use the full path of `tools/digilight-mcp.cjs` on your computer.

   **Claude desktop app**: Settings › Developer › Edit Config opens `claude_desktop_config.json`.
   Add (Mac example; on Windows write the path with double backslashes, `C:\\Users\\you\\digi-light-test\\tools\\digilight-mcp.cjs`):
   ```json
   {
     "mcpServers": {
       "digilight": {
         "command": "node",
         "args": ["/Users/you/digi-light-test/tools/digilight-mcp.cjs"]
       }
     }
   }
   ```
   Quit and reopen the app. DigiLight's tools show under the tools (hammer / plug) icon.

   **Claude Code**: in a terminal,
   ```
   claude mcp add digilight -- node /Users/you/digi-light-test/tools/digilight-mcp.cjs
   ```

### Older Macs (macOS 11 Big Sur, 12 Monterey)

Checked 2026-10 (for example a 2014 iMac, which stops at Big Sur):

- **The Claude desktop app and Claude Code need macOS 13 (Ventura) or later**, so on Big Sur
  or Monterey there is no Claude on that computer to add the MCP server to. Use DigiLight's
  website as usual, or let Claude run DigiLight for you in the cloud (next section).
- The command line tool (`digilight-cli.cjs`) still works there:
  - **Node.js 22** (LTS until April 2027). Node 24 and later need macOS 13.5, so pick the
    **v22** macOS installer on https://nodejs.org/en/download, not the newest one.
  - `tools/package.json` pins **Playwright 1.53.2**, whose Chromium (138) is the last that
    runs on macOS 11 (Chrome 139 dropped Big Sur). Keep that pin; `npm install` and
    `npx playwright install chromium` then fetch the right one.

### In the cloud (claude.ai/code)

Any computer or phone works: start a Claude Code session on this repository at
claude.ai/code (or the Code tab of the Claude app) and attach your photos to a message, for
example *"Relight this with a soft raking light from the left and send me the full-size
image."* The repository sets this up by itself:

- `.mcp.json` adds the DigiLight MCP server (`tools/mcp-start.sh`), so Claude has the tools
  in the table below in every session on this repository.
- `.claude/settings.json` runs `.claude/hooks/session-start.sh` when a cloud session starts:
  it installs the tools' packages (`tools/install-deps.sh`) and sets `DIGILIGHT_BROWSER` to the
  session's Chromium, so the CLI and `tools/render-batch.cjs` work too.

Claude sends the results back as files in the chat, or as a review page to compare looks.

Optional settings go in an `"env"` block in the config (or `-e NAME=value` with `claude mcp add`):
`DIGILIGHT_GPU=1` uses the graphics card (much faster if it works on your computer; leave it
out if previews come back blank), `DIGILIGHT_URL` runs the live site instead of the files
in the repository, `DIGILIGHT_BROWSER` a different Chromium.

### Tools

| Tool | What it does |
| --- | --- |
| `open_image` | opens a photo (path, URL, `.digilight.json`, or `sample:painting` / `sample:dsc8382`) |
| `open_project` | opens a saved `.digilight.json` project |
| `info` | photo and preview size, undo/redo available |
| `analyze` | Analyze: tone, light, strokes, depth, raking direction and the looks for this photo (1–3 min without a GPU). Runs in the background: if it is not done within 45 s it answers `stillAnalyzing`, and calling `analyze` (or `apply_look`) again keeps waiting on the same run, so assistants that give up on a tool after 60 s still get there |
| `list_looks` / `apply_look` | the looks from Analyze; apply one by name or number, `strength` 0–1 |
| `add_light` / `remove_light` | a lamp, or a Shadow light (`shade`: a soft shadow; `negative`: a lamp in reverse) |
| `list_presets` / `apply_preset` | fixed lighting scenes, graze (raking) presets, matched looks |
| `describe_settings` | every setting with its range; `filter` narrows it (`graze`, `lights.0`, `relief`) |
| `get_settings` / `set_settings` | read, or change by path (`{"exposure": 0.3, "graze.opacity": 0.6}`), checked as the panel would |
| `undo` / `redo` | one step per change |
| `guard` / `set_guard` | check (and fix) blown whites and crushed darks now; turn guarding off or on |
| `render_preview` | the result as a picture the assistant can see (JPEG, `max_size` px, default 800), plus its metrics and warnings; `change_map` `light` / `colour` adds the change map as a second picture, with its numbers |
| `export_image` | writes the result to a `.png` / `.jpg` / `.webp` file, full size or `width` px; `crop` `{x, y, w, h}` (pixels, or fractions) writes only that part, at full detail; returns the file's metrics and writes its record beside it (`FILE.json`); `change_map` also writes `FILE-change.png` |
| `measure_relief` | relief measured from lamp or sun photos (`photos` `[{path, sun: {from_deg, angle_deg}} or {path, lamp: {left_cm, above_cm, out_cm}}]`, each optionally `line_up` (a handheld photo; one shaped unlike the open photo is lined up anyway), `painting_width_cm`, `deepest_mm`) |
| `save_project` | writes a `.digilight.json` project that the website (Projects › Import) opens too |

The server keeps one DigiLight page open for the whole chat, so each tool works on the
current photo and settings. Errors come back as tool errors with the reason (a value out of
range changes nothing). While Analyze or an export runs it sends progress, so the assistant
waits. Both run in the background past about 45 s (many assistants give up on a tool call
after 60 s): the answer then says it is still running, and calling `analyze` (or
`export_image` with the same path) again keeps waiting. Test: `node tests/mcp.cjs` (`--full` adds Analyze).
