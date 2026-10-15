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
| `render({format, quality, as})` | the preview as a data URL (`as: 'blob'` for a Blob). `format` png (default), jpeg or webp |
| `export({width, format, quality, as})` | the full-size export (tiled, the photo's own resolution), or `width` px wide |
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
- Graze (raking) light: `graze.enabled|angle|elevation|opacity|detail|fine|reach|clean|soft|lift|fill`
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
`DIGILIGHT_GPU=1` the computer's graphics card instead of software rendering).

```
node tools/digilight-cli.cjs <command> <input> [options]
```

- **input**: a photo path or http(s) URL, a `.digilight.json` project, or `sample:painting` / `sample:dsc8382`
- **commands**: `info`, `analyze` (JSON readout and looks), `describe` (settable paths),
  `get` (settings after the options; `--path a.b` for one), `render` (writes `--out`)
- **options**, applied in this order: `--preset kind:name` (repeatable), `--set "a=1;b.c=2"` or
  JSON (repeatable), `--look NAME|N --strength 0..1`; output: `--out FILE.png|.jpg|.webp`,
  `--width N` (else full size), `--preview` (the preview size), `--quality`, `--save-project FILE`

```
node tools/digilight-cli.cjs analyze photo.jpg
node tools/digilight-cli.cjs render photo.jpg --look "Matched + raking" --strength 0.8 --set "adjust.relief.form=1.5" --out relit.png
node tools/digilight-cli.cjs render project.digilight.json --preset "graze:Classic raking" --width 2000 --out raking.jpg
```

Prints JSON on stdout; on an error prints it on stderr and exits 1. Full-size exports and
Analyze are slow in software GL (no GPU): about a minute to start and render, 2–3 minutes
for Analyze on a 2000 px photo.

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
| `analyze` | Analyze: tone, light, strokes, depth, raking direction and the looks for this photo (1–3 min without a GPU) |
| `list_looks` / `apply_look` | the looks from Analyze; apply one by name or number, `strength` 0–1 |
| `add_light` / `remove_light` | a lamp, or a Shadow light (`shade`: a soft shadow; `negative`: a lamp in reverse) |
| `list_presets` / `apply_preset` | fixed lighting scenes, graze (raking) presets, matched looks |
| `describe_settings` | every setting with its range; `filter` narrows it (`graze`, `lights.0`, `relief`) |
| `get_settings` / `set_settings` | read, or change by path (`{"exposure": 0.3, "graze.opacity": 0.6}`), checked as the panel would |
| `undo` / `redo` | one step per change |
| `render_preview` | the result as a picture the assistant can see (JPEG, `max_size` px, default 800) |
| `export_image` | writes the result to a `.png` / `.jpg` / `.webp` file, full size or `width` px |
| `save_project` | writes a `.digilight.json` project that the website (Projects › Import) opens too |

The server keeps one DigiLight page open for the whole chat, so each tool works on the
current photo and settings. Errors come back as tool errors with the reason (a value out of
range changes nothing). While Analyze or an export runs it sends progress, so the assistant
waits. Test: `node tests/mcp.cjs` (`--full` adds Analyze).
