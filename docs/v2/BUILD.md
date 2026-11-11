# DigiLight 2 — build brief

A ground-up rebuild of DigiLight (v1: `yitzhach/digi-light-test`). Written 11-11 after a full
audit of v1 and a model test on the user's real photos (docs/v2/bakeoff.md). The owner is Isaac
Anderson (Isaac Anderson Art); "Isaac" below means him.

**How to use this brief.** Do one phase per session, in order (§10). For a phase, read §1 to §4,
the parts of §5 to §9 the phase names, and the phase itself. Nothing else unless a step says so.
Each phase ends at a gate; a phase is done only when its gate passes. If something here is
unclear or turns out wrong, take the simplest option that keeps the promises in §1, record it in
`DECISIONS.md`, and keep going.

---

## 1. What we are building

A web app that relights a photo of an artwork. The artist opens a photo taken in flat light,
picks a look or moves lamps, and saves a picture that looks lit that way.

**Promises** (every design choice serves these; a change that breaks one is wrong):

1. **The art is never repainted.** Every output pixel is the photo's own pixel multiplied by
   computed light. The lighting never generates, blurs or sharpens anything. With no light
   changed, the output is the photo, bit for bit.
2. **It works on any photo.** The Light layer needs no knowledge of the surface, so it cannot
   produce artifacts. Relief is a second, optional layer.
3. **It is fast on a 2014 Retina 5K iMac** (macOS Big Sur 11.7.10, Radeon R9 M290X 2 GB,
   Safari 16.6 or Chrome 138, WebGL2, no WebGPU). Budgets in §9.
4. **It is simple.** About 15 controls. Everything else is behind one "Expert controls" switch
   and is mainly there for AI agents.
5. **One picture everywhere.** The same document gives the same pixels in the app, from the
   command line and from an AI agent.

**For whom:** artists photographing their own work (first paying customer). Scope is artwork
only: flat or low-relief pieces photographed straight on. No portraits, rooms or general photos.

**What people pay for:** it works every time, it never repaints the art, one lighting applied
across a whole body of work, real relief from one extra phone photo (True Relief), print-size
export.

## 2. Why a rebuild (evidence, short)

| v1 problem | cause | 2.0 answer |
|---|---|---|
| Embossed, unnatural texture | relief guessed from brightness; correlation with real light about 0 on every test piece; three trained models also score about 0 (bakeoff.md) | relief is optional; the real thing comes from one side-lit photo (0.8 to 0.9) |
| Blurry at times | works at 1,400 px and sharpens later; a step that removes the photo's light removes detail; raking light smoothed to hide grain | the photo is used at full resolution and only multiplied |
| Slow | every slider tick re-runs every light, each marching up to 96 shadow steps per pixel | shadows are a lookup in a table built once per photo |
| Bulky | 15,200 lines, about 210 settings, 9 tools | about 40 settings, 4 sections |

## 3. Rules

- **Scope is this brief.** Do not add a feature, setting, dependency or file it does not ask for.
  A new dependency needs a line in `DECISIONS.md` saying why.
- **One lighting model.** §5 is the specification. The reference renderer (`core`) implements it
  exactly; the WebGL preview (`gl`) imitates it within the tolerance in §5.11. A change to the
  model changes §5, the reference, the preview and the goldens in the same commit.
- **One way in.** Interface, command line, MCP server and assistant all change the document
  through `commands` (§7). No other code mutates it.
- **Every setting is in the schema** (§6) with a tier (`simple` or `expert`), range, default and
  label. Expert controls are generated from the schema, never hand-built.
- **`core` is pure.** No DOM, no Node APIs, no `Math.sin/cos/tan/atan/atan2/pow/exp/log*` (use
  `dmath.ts`, §5.10). A test greps for them.
- Files stay under 300 lines; one job per file.
- TypeScript strict. `pnpm typecheck && pnpm test` must pass before any commit; check exit codes.
- Never test against client data. Fixtures are Isaac's own photos (`fixtures/`).
- Keep `STATUS.md` current: phase, what is done, what waits on Isaac, what is next (under 40
  lines). Add a line to `CHANGELOG.md` per phase.
- Replies to Isaac are brief and in plain language.

## 4. Stack and layout

pnpm workspace, TypeScript 5 (strict), Vite, Vitest, Preact + `@preact/signals`, Zod, Playwright
(already installed in cloud sessions; never run `playwright install`). Node 20+. Build target
`['safari16', 'chrome109', 'firefox115']`. Deployed as static assets on Cloudflare Workers.

```
digilight/
  CLAUDE.md  BUILD.md  STATUS.md  DECISIONS.md  CHANGELOG.md
  package.json  pnpm-workspace.yaml  tsconfig.base.json  wrangler.jsonc
  packages/
    core/   pure TypeScript: the document, the maths, the reference renderer
      src/  schema.ts  dmath.ts  srgb.ts  kelvin.ts  geometry.ts  light.ts  tone.ts  guard.ts
            render.ts  finish.ts  looks.ts  metrics.ts  commands.ts  resample.ts
            relief/  estimate.ts  horizon.ts  measure.ts  lineup.ts  axis.ts
      test/
    gl/     WebGL2 preview:  context.ts  preview.ts  horizon-gpu.ts  shaders/*.glsl.ts
    web/    the app:  main.tsx  state.ts  canvas/*  panel/*  io/*  workers/*
    mcp/    Node:  server.ts  cli.ts  image-io.ts        (Phase 7)
  fixtures/ photos copied from v1 (testdata/photos, samples) + README
  bench/    relief-score.ts (v1 tools/realref/score.py in TypeScript), bakeoff/ (python, Phase 10)
  e2e/      Playwright: smoke, parity (preview against reference), bench page
```

`core` is the product. `gl` makes it interactive. `web` is a thin shell over `commands`.

---

## 5. The picture maths (normative)

All colour maths is in linear light, in the photo's own colour space (sRGB or Display P3; they
share one transfer curve). `luma(c) = 0.2126 r + 0.7152 g + 0.0722 b`.
`smoothstep(a, b, x) = t*t*(3 - 2*t)`, `t = clamp((x - a)/(b - a), 0, 1)`. `mix(a, b, t) = a + (b - a)*t`.
Angles in the document are degrees; `dcos` and friends below take them converted to radians.

### 5.1 Space

- The picture is a rectangle of width 1 and height `a = H / W`. A point is `(x, y, z)`: `x` right,
  `y` **down**, `z` toward the viewer. The picture lies in `z = 0`.
- Pixel `(i, j)` of a `W x H` image is at `x = (i + 0.5)/W`, `y = (j + 0.5)/W`.
- The document stores places in box units `(u, v)`: `u = x`, `v = y / a`, so `(0.5, 0.5)` is the
  centre of any picture. Heights `z` are in picture widths.
- Directions as angles: azimuth 0° = from the right, 90° = from the top, 180° = left, 270° =
  bottom. As a vector toward the light: `(cos az * cos el, -sin az * cos el, sin el)` (y is down).

### 5.2 Relief maps (only when `relief.mode != 'off'`)

Made once per photo at relief size (long side `min(photo long side, 2048)`), then only sampled.

- `hHat`: unit height, its 2% to 98% spread is 1, median 0.
- `pHat = d hHat / dx`, `qHat = d hHat / dy` (per picture width, central differences).
- `horizon`: §5.6. `ao`: §5.6.
- The real height is `relief.depth * hHat` (`depth` in picture widths). The normal is
  `n = normalize(-depth*pHat, -depth*qHat, 1)`.
- Sampling at any output size is bilinear on the stored values (for `horizon` and `ao`,
  interpolate the stored bytes, then decode).

### 5.3 One light at point P

```
lamp:   L  = (pos.u, pos.v * a, pos.z)          A = (aim.u, aim.v * a, 0)
        D  = L - P;  r = |D|;  l = D / r
        r0 = |L - A|;  l0z = L.z / r0
        fall = mix(1, (r0/r)^2, falloff)                         // 1 at the aim point
        lam  = min(l.z / l0z, 8)                                 // 1 at the aim point
        s    = (A - L) / r0;  cg = -dot(l, s)
        spot = cone >= 89.5 ? 1 : smoothstep(dcos(cone), dcos(cone * (1 - edge)), cg)
        omega = size / r                                         // source's angular radius
sun:    l = direction (5.1);  fall = lam = spot = 1;  omega = size      // size in radians here

relief off:   rel = 1;  sh = 1
relief on:    w    = min(omega, 0.5)                             // a big source wraps round
              rel  = clamp(max(dot(n, l) + w, 0) / (l.z + w), 0, 4)       // 1 on a flat surface
              tanE = l.z / max(hypot(l.x, l.y), 1e-6)
              T    = relief.depth * horizonAt(P, l.x, l.y)       // 5.6
              pw   = max(omega, 0.004) * (1 + tanE*tanE)
              vis  = smoothstep(-pw, pw, tanE - T)
              sh   = 1 - relief.shadows * (1 - vis)

e = intensity * fall * lam * spot * rel * sh                     // a scalar
contribution = e * colour(kelvin)                                // 5.8
```

`intensity` is therefore the light added at the aim point, as a multiple of the photo's own
light. Sheen (expert, default 0): `spec = sheen * intensity * fall * spot * sh *
max(dot(n, normalize(l + (0,0,1))), 0)^(2^sheenSharpness)` (use `dpow`); it is **added** to the
lit colour as `spec * colour(kelvin)`, not multiplied by the photo.

### 5.4 All the light at P

```
E   = ambient.level * colour(ambient.kelvin) * (1 - relief.ao * occl(P))     // occl: 5.6, 0 when relief off
E  += sum of contributions of the lights that are on
Wc  = ambient.level * colour(ambient.kelvin) + sum(intensity_i * colour_i)   // per document, not per pixel
E   = E / mix((1,1,1), Wc / luma(Wc), tone.whiteAdapt)                       // camera white balance
E   = kappa * E                                                              // 5.7
```

### 5.5 Tone: photo times light, whites protected

```
c   = photo pixel, linear;  Y = luma(c)
lit = c * E + sheen terms
g   = luma(lit) / Y                       // if Y < 1e-6: out = clamp(lit, 0, 1), skip the rest
Yl  = min(Y * g, 1)                       // plain multiplication
Yp  = g <= 1 ? Y * g
    : Y >= 1 ? 1
    : Y + Y*(1 - Y)*(g - 1) / (1 - 2*Y + Y*g)       // never reaches 1: whites keep their detail
Yo  = mix(Yl, Yp, tone.highlightProtect)
out = lit * (Yo / (Y * g))
m   = max(out.r, out.g, out.b)
if m > 1:  out = Yo + (out - Yo) * ((1 - Yo) / (m - Yo))    // pull a too-bright colour toward its grey
```

Then §5.9 (finish), then encode (§5.10). **Identity:** where `E` is exactly `(1,1,1)`, sheen is 0
and finish is neutral, the output bytes are the input bytes (copy them; do not round-trip). A
document for which that holds everywhere (`isNeutral(doc)`) returns the photo itself.

### 5.6 Horizon table (shadows as a lookup)

For `K = 32` directions `d_k = (cos(2*pi*k/K), -sin(2*pi*k/K))` (azimuth as in 5.1), per relief
pixel:

```
That_k(P) = max(0, max over j of (hs(P + t_j * d_k) - hs(P)) / t_j)
t_j = texel * 1.35^j,  j = 0, 1, ... while t_j <= 0.2            // reach: 0.2 picture widths
```

- `hs` is `hHat`, blurred first by a Gaussian of sigma 0.002 widths when `relief.mode ==
  'estimated'` (guessed grain must not throw shadows), unblurred when `'measured'`.
- Each tap reads a **max pyramid** of `hs` at level `floor(log2(max(1, 0.35 * t_j / texel)))` (a
  small table of integers, one per `j`), so a thin ridge between two far taps is not stepped
  over. Taps outside the picture are skipped.
- Stored as one byte per direction: `byte = round(255 * sqrt(That_k / Tmax))`, `Tmax` the largest
  value in the table (kept beside it). Decode: `That = (byte/255)^2 * Tmax`.
- `horizonAt(P, lx, ly)`: `f = K * datan2(-ly, lx) / (2*pi)` wrapped to `[0, K)`;
  `k0 = floor(f)`; result `mix(That_k0(P), That_(k0+1 mod K)(P), f - k0)`.
- `ao` byte: `round(255 * x/(1+x))`, `x = mean over k of That_k`. At render:
  `occl(P) = xd/(1+xd)`, `xd = 2 * relief.depth * x`, `x` decoded from the byte.

Changing `relief.depth` or `relief.shadows` never rebuilds the table.

### 5.7 Protect whites (`kappa`)

`tone.protectWhites` off: `kappa = 1`. On: `kappa` is the largest value in `[0.25, 1]` for which
the share of **blown** pixels in the rendered picture, minus that share in the photo, is at most
0.5%. Blown = display luma (luma of the encoded values) >= 250. Measured on a thumbnail (long
side 512, area-averaged, relief off) by 12 steps of bisection; `kappa = 1` if 1 already passes.
`core/guard.ts` computes it; the preview gets it as a uniform. It is part of the render, so it
is the same everywhere. The looks in §6 are balanced so that it rarely acts; it is a safety net
for hand-set lights. (v1 counted a pixel blown when any one channel reached 250. A warm lamp on
white plaster rightly saturates red while the plaster keeps its detail, so 2.0 judges by luma.)

### 5.8 Light colour

`colour(K)`: linear RGB of a black body at `K` kelvin in the working space, divided by the same
for 6500 K, scaled to luma 1. So 6500 K is exactly `(1,1,1)`. Use a table every 100 K from 1500
to 12000 (constants in `kelvin.ts`, one per working space, generated once from v1's
`src/kelvin.js` and committed), linear interpolation between entries.

### 5.9 Finish (Phase 6; neutral values change nothing)

Applied to `out` in this order: exposure (`out *= dexp2(finish.exposure)`), warmth (multiply by
`colour(6500 - 2500*warmth)` for warmth > 0, `colour(6500 - 4500*warmth)` for < 0, renormalised to
luma 1), then on display-encoded values `v`: contrast (`v = 0.5 + (v - 0.5) * (1 + contrast)` for
contrast <= 0; for > 0 the S-curve `v = mix(v, smoothstep(0, 1, v), contrast)`), saturation (`v =
grey + (v - grey) * (1 + saturation)`, grey = luma of the encoded values), curve (a 256-entry
table, expert), vignette (`v *= 1 - vignette * smoothstep(0.55, 1.15, dist)`, `dist` = distance
from the centre in units of half the diagonal), grain (expert; `v += grain * 0.08 * (h - 0.5)`,
`h` in `[0, 1)` from an integer hash (PCG) of the pixel's cell on a grid 2048 cells wide, so
every size has the same grain and the shader and the reference agree). Clamp to `[0, 1]`.
The display-encoded value here is the continuous sRGB curve (`dpow`); when finish is neutral
this whole step is skipped.

### 5.10 Exact numbers

- Decode: a 256-entry table of linear values (committed constants). Encode to 8 bits: binary
  search in a 255-entry table of the linear thresholds between neighbouring codes (committed).
  `encode(decode(code)) == code` for all 256 codes; no `pow` at run time.
- `dmath.ts`: `dcos, dsin, datan2, dexp, dexp2, dln, dpow` built from `+ - * /` and `Math.sqrt`
  only (range reduction and polynomials; error under 1e-9 relative, tested against `Math.*`).
  These give the same bits on every machine and browser, which is what makes a picture
  reproducible and the goldens stable.
- The reference renders in float64. Output is RGBA8 in the photo's colour space.

### 5.11 Preview against reference

The WebGL preview implements §5.3 to §5.9 in GLSL with float32 and the same tables. On the six
parity documents (Phase 2) at 1024 px: 99% of channel values within 2 levels, none beyond 6.
Exports, the command line and the MCP server always use the reference.

---

## 6. The document

`core/schema.ts`, Zod. One immutable JSON object; the photo's pixels and the relief maps live
beside it, not in it. Tier S = simple, E = expert.

```
Doc {
  version: 2
  photo:   { width, height, space: 'srgb' | 'display-p3', sha256, widthMm?: number }
  ambient: { level: 0..2 = 1 (S "Room light"),  kelvin: 1500..12000 = 6500 (E) }
  lights:  Light[]                         // 0..8; the simple interface offers up to 4
  relief:  { mode: 'off' | 'estimated' | 'measured' = 'off' (S),
             depth: 0..0.03 = 0.004 (S "Depth"),   shadows: 0..1 = 0.6 (S "Shadows"),
             ao: 0..1 = 0.3 (E),  sheen: 0..1 = 0 (E),  sheenSharpness: 2..8 = 5 (E) }
  tone:    { protectWhites: boolean = true (E),  highlightProtect: 0..1 = 1 (E),
             whiteAdapt: 0..1 = 0.3 (E) }
  finish:  { exposure: -2..2 = 0 (S "Brightness"),  contrast: -1..1 = 0 (S),
             warmth: -1..1 = 0 (S),  saturation: -1..1 = 0 (S),  vignette: 0..1 = 0 (S),
             grain: 0..1 = 0 (E),  curve?: number[256] (E) }
}
Light {
  id: string,  on: boolean = true,  kind: 'lamp' | 'sun' = 'lamp'
  pos: [u, v, z]         lamp; u, v in -2..3, z in 0.03..3            (S: the handle; z is "Angle")
  aim: [u, v] = [0.5, 0.5]                                            (S: the target handle)
  azimuth: 0..360, elevation: 1..90                                   sun only (E)
  intensity: 0..4 = 1 (S "Brightness"),   kelvin: 1500..12000 = 4000 (S "Warmth")
  cone: 5..90 = 90 (S "Spread"),  edge: 0..1 = 0.6 (E),  falloff: 0..1 = 1 (E),
  size: 0..1 = 0.05 (E "Softness"; picture widths for a lamp, radians for a sun)
}
```

A new document is neutral: `ambient.level 1`, no lights, relief off, finish neutral.
Simple sliders map as: light Brightness 0 to 200% = intensity 0 to 2; Warmth = kelvin 9000 down to
2000; Spread = cone 12 to 90; Angle (raking to front) = `pos.z` 0.05 to 1.5 on a log scale; Depth
0 to 100 = `depth = 0.02 * (t/100)^2`.

### Looks (`core/looks.ts`): the one-tap starting points

A look sets `ambient` and `lights` only. `flip` mirrors every `u` about 0.5. Strength `s` (0 to 1)
mixes toward neutral: `ambient.level = mix(1, look, s)`, `ambient.kelvin = mix(6500, look, s)`,
each `intensity *= s`; at `s = 0` the document is neutral.
These numbers were rendered on Isaac's door and lintel photos with this section's exact formulas
(`tools/bakeoff/mock.py`): `kappa` is 1 for every look on the door and for all but "dramatic"
(0.73) on the lintel, and every look but the three dark ones (spotlight, dramatic, candlelight)
keeps the photo's median brightness within 6%. They are a starting point; Phase 3's gate tunes
them with him.

| id | ambient (level, kelvin) | light: pos (u, v, z), aim, intensity, kelvin, cone, edge, falloff, size |
|---|---|---|
| original | 1, 6500 | none |
| gallery | 0.45, 4500 | (0.5, −0.35, 0.9), (0.5, 0.45), 0.8, 3200, 38, 0.8, 0.5, 0.05 |
| spotlight | 0.2, 4000 | (0.5, −0.25, 1.1), (0.5, 0.5), 1.1, 3000, 22, 0.8, 1, 0.05 |
| soft-window | 0.4, 6500 | (−1.2, 0.35, 0.9), (0.5, 0.5), 0.8, 6000, 90, 0.6, 0.75, 0.4 |
| warm-evening | 0.35, 4500 | (−1.5, 0.2, 0.6), (0.5, 0.5), 0.8, 2700, 90, 0.6, 0.5, 0.15 |
| cool-daylight | 0.6, 7500 | (0.5, −0.6, 1.2), (0.5, 0.5), 0.5, 7000, 90, 0.6, 0.5, 0.3 |
| raking-left | 0.35, 6500 | (−2.0, 0.5, 0.35), (0.5, 0.5), 0.8, 4500, 90, 0.6, 0.5, 0.02 |
| raking-top | 0.35, 6500 | (0.5, −2.0, 0.35), (0.5, 0.5), 0.8, 4500, 90, 0.6, 0.5, 0.02 |
| dramatic | 0.12, 4000 | (−0.3, −0.2, 0.5), (0.45, 0.45), 1.1, 3200, 30, 0.8, 1, 0.05 |
| candlelight | 0.22, 4500 | (0.5, 1.2, 0.5), (0.5, 0.65), 0.9, 2300, 90, 0.6, 0.8, 0.03 |

Why these shapes: a lamp close to the picture's edge is many times brighter on that edge than
at the centre, so raking and side lights stand far off (`u` or `v` of −2 to −1.2). The two raking
looks do little without Texture and are meant to be used with it. "+ Add light" starts a lamp at
`pos (0.5, −0.2, 0.8)`, aim centre, intensity 0.8, kelvin 4000, cone 90.

---

## 7. Commands (`core/commands.ts`)

The only way the document changes. Each validates with the schema, returns the new document and
is one undo step. The app exposes them as `window.digilight`; the MCP server and the command
line map to them one to one.

| command | does |
|---|---|
| `open(photo)` | starts a neutral document for a photo; returns `info` |
| `getDoc()`, `setDoc(doc)` | the whole document |
| `get(path)`, `set(path, value)`, `set({path: value, ...})` | one or more settings by path, e.g. `lights.0.kelvin` |
| `describe()` | `[{path, label, tier, min, max, step, default, value}]` for every setting: the expert panel and an AI's menu |
| `looks()`, `applyLook(id, {strength, flip})` | the looks |
| `addLight(partial)`, `updateLight(id, partial)`, `removeLight(id)` | lights |
| `setRelief({mode, depth, shadows})` | builds the maps on first use of a mode |
| `measureRelief({photos: [{src, from?, elevation?}]})` | True Relief (Phase 5) |
| `render({width, region})` | a picture from the reference renderer, with `metrics` |
| `export({width, format, quality})` | the full-size picture and its record (document, photo and picture SHA-256) |
| `undo()`, `redo()`, `reset()` | history |

`metrics` (port of v1 `measure.js` `imageMetrics`, trimmed): share of blown (display luma >= 250)
and crushed (<= 5) pixels against the photo's, share with any channel at 255, luma percentiles
5/50/95, `kappa`, and a `warnings` list. An AI agent judges its own result from these.

---

## 8. The interface

One screen. The picture fills the window; a 320 px panel sits on the right (on a phone: a sheet
at the bottom with one tab per section). Top bar: Open, Undo, Redo, **Before** (press and hold
shows the photo), Export.

**On the picture.** Each light is a round handle that can be dragged anywhere, including off the
picture's edge (the canvas shows a margin of half the picture's width around it). The selected
light also shows a small cross at its aim; drag it to aim. Scroll or pinch on a handle changes
its brightness. Double-click toggles it. Delete removes it. Wheel zooms the picture to 800%;
drag on empty space pans. `B` = Before, `Z` / `Shift+Z` = undo / redo.

**Panel, simple mode** (the whole of it):

1. **Looks**: a grid of live thumbnails of this photo under each look (§6). Tap applies. One
   Strength slider. A "Flip" toggle.
2. **Lights**: a chip per light and "+ Add light" (up to 4). For the selected light: Brightness,
   Warmth, Spread, Angle. Below: Room light.
3. **Texture**: a switch, Depth, Shadows. One line of status: "Estimated from this photo
   (approximate)" or "Measured from your side-lit photo". A button: **Use a side-lit photo for
   real texture** (Phase 5).
4. **Finish**: Brightness, Contrast, Warmth, Saturation, Vignette.
5. **Export**: size (Full, 3000, 2000 px), JPEG or PNG, Download.

**Expert controls** is one switch at the bottom of the panel. When on, each section also lists
every expert setting of its part of the schema, generated from `describe()` (a slider, a switch or
a select, by type). Nothing expert has hand-written interface.

Words on screen are plain: no "azimuth", "kelvin", "specular". Every control has a one-line
tooltip. Errors say what to do next.

---

## 9. Speed budgets (on the 2014 iMac, a 24-megapixel photo)

| moment | budget |
|---|---|
| photo dropped to first sharp picture | 1.5 s |
| look thumbnails filled | 1 s more |
| dragging a light, texture off | 30 frames a second or better |
| dragging a light, texture on | 20 frames a second or better |
| pointer released to a full-resolution frame | 150 ms |
| texture switched on to maps ready (interface stays responsive: no frame over 100 ms) | 3 s |
| export at full size, lights only / with texture | 8 s / 20 s |
| JavaScript shipped (gzip, without the HEIC decoder) | 250 KB |

How: the photo is one full-resolution texture with mipmaps (down-scaled first only if larger
than `min(MAX_TEXTURE_SIZE, 8192)`). One shader pass draws the screen. While the pointer is down
the pass renders at a reduced scale `q` in {1, 0.75, 0.5, 0.35}, lowered when the average frame
takes over 24 ms and raised under 12 ms; 120 ms after release one frame is drawn at `q = 1`. The
relief maps are textures made once (slopes RG16F, horizon an R8 2D-array of 32 layers, ao R8).
Nothing is ever rebuilt per frame.

Cloud test machines have no GPU, so the budgets are checked on Isaac's iMac with the built-in
bench page (`?bench`, Phase 3), which prints these numbers.

---

## 10. Phases

Each phase lists the model to use (§13 explains). "v1" paths are in `yitzhach/digi-light-test`;
read only the v1 files a phase names.

### Phase 0 — Repository (Sonnet 5.5)

Needs Isaac first: an empty GitHub repository `yitzhach/digilight`.

1. Scaffold §4 (workspace, strict TypeScript, Vitest, an empty Preact page that says "DigiLight 2").
2. Copy this brief to `BUILD.md`, and `docs/v2/bakeoff.md`, `tools/bakeoff/` to `bench/bakeoff/`.
3. Copy v1 `testdata/photos/*` and `samples/*` to `fixtures/` with their README and manifest.
4. `CLAUDE.md`: "Read STATUS.md, then BUILD.md §1 to §4 and the current phase. Rules: BUILD.md §3."
5. `STATUS.md`, `DECISIONS.md`, `CHANGELOG.md`. CI: `pnpm typecheck && pnpm test` on every push.
6. `wrangler.jsonc`: name `studio-digilight`, assets `packages/web/dist`. Do not deploy.

**Gate:** CI green; `pnpm --filter web dev` shows the page.

### Phase 1 — The engine (Opus 5.5, high effort)

Read §5 (all but 5.6, 5.9), §6, §7. Build `core` for the Light layer, Node only, no relief.

1. `dmath.ts`, `srgb.ts` (tables generated by a script in `core/scripts/`, committed), `kelvin.ts`.
2. `schema.ts` with tiers, labels, ranges, defaults; `describe()`.
3. `light.ts` (§5.3 with `rel = sh = 1`), `tone.ts` (§5.5), `guard.ts` (§5.7), `looks.ts`.
4. `render.ts`: `render(photo: {data: Uint8ClampedArray, width, height}, doc, {width?, region?})`
   returning RGBA8. Resize by area average (port v1 `src/resample.js`'s arithmetic). Rows are
   independent so callers can split the work across workers.
5. `commands.ts` with undo history; `metrics.ts`.
6. Tests: every `dmath` function against `Math.*`; srgb round trip of all 256 codes; **identity**
   (neutral document returns the photo, byte for byte, on a real fixture); each look on a
   256 x 192 procedural photo against a committed SHA-256 (`goldens.json`); with the guard on, a
   four-times-too-bright lamp on `door-flat-crop.jpg` leaves at most 0.5% new blown pixels on the
   512 px thumbnail, and every look in §6 gives `kappa` >= 0.7 on the door and the lintel; schema rejects
   out-of-range values; a grep test for banned `Math.*` in `core/src`.
7. `core/scripts/sheet.ts`: writes a contact sheet of every look on a fixture (for the gate).

**Gate:** tests pass in under 30 s; a full-size render of `door-flat-crop.jpg` (2.3 MP) with the
gallery look takes under 1 s in Node; Isaac sees the sheet for the door and the lintel.

### Phase 2 — The preview (Opus 5.5, high effort)

Read §5 (all but 5.6, 5.9) and §9. Build `gl`: `createPreview(canvas)` with `setPhoto`, `setDoc`, `setView({zoom,
pan})`, `setScale(q)`, `draw()`, `readPixels()`.

1. One program: §5.3 to §5.5 for up to 8 lights (uniform arrays), the srgb tables as textures or
   exact piecewise formulas, `kappa` as a uniform.
2. Display P3: set `drawingBufferColorSpace` and `unpackColorSpace` when the photo is P3 (see v1
   `src/colour.js` `useSpace`).
3. Photo upload with mipmaps; down-scale first if over `min(MAX_TEXTURE_SIZE, 8192)`.
4. `e2e/parity.spec.ts`: six documents (neutral, gallery, spotlight, raking-left, dramatic, a
   four-light mix) on a fixture at 1024 px; preview pixels against the reference per §5.11.

**Gate:** parity passes in headless Chromium (software GL); neutral document is exact.

### Phase 3 — The app, Light layer only (Opus 5.5; Sonnet 5.5 is fine for the panel)

Read §7, §8, §9. Build `web`.

1. Open a photo: drop, file picker, paste; JPEG, PNG, WebP, HEIC (port v1 `src/colour.js`
   `spaceOf`, `iccWide`, `decodeHeif` and `vendor/libheif`, loaded only for a HEIC).
2. Canvas: fit, zoom, pan, light and aim handles, the adaptive scale of §9, Before.
3. Panel sections 1, 2 and 5 of §8 and the Expert switch generated from `describe()`.
4. Look thumbnails: the reference renderer at 160 px in a worker.
5. Export: reference renderer across a pool of workers (rows split), encoded by `canvas.toBlob`
   from a canvas in the photo's colour space so a P3 photo keeps its profile (v1 `src/colour.js`
   `canvas2d`, `imageData`), a `.json` record beside it.
6. `window.digilight` = commands. Autosave of the document and photo in IndexedDB; reopen on load.
7. `?bench` page: runs §9's measurements on the loaded photo and prints a table.
8. `e2e/smoke.spec.ts` (under 2 minutes): open a fixture, apply each look, drag a light, export,
   check the export equals the reference's SHA-256.

Needs Isaac before the gate: connect the repository to Cloudflare Workers Builds (build `pnpm i
&& pnpm build`, first deploy of `studio-digilight`).

**Gate:** smoke passes; Isaac opens it on the iMac, pastes the bench table (within §9 for
"texture off" rows), and says the looks read as real light. Tune the look table with him, then
update §6 and the goldens.

### Phase 4 — Texture and shadows (Opus 5.5, high effort; Fable 5.2 if parity fights back)

Read §5.2, §5.6, the relief parts of §5.3 and §5.4.

1. `relief/estimate.ts` (approximate, clearly labelled): on the photo at relief size,
   `L = dln(luma + 0.002)`; `band = gauss(L, 0.0012) - gauss(L, 0.012)` (sigmas in widths);
   chroma reject `w = 1 - smoothstep(0.02, 0.25, |chroma - gauss(chroma, 0.012)|)`, chroma =
   rgb / luma; `hHat = band * w`, minus its median, over its 2% to 98% spread; slopes by central
   differences.
2. `relief/horizon.ts`: §5.6 on the CPU (the reference; also used in Node). Aim for under 6 s at
   2048 px on 4 cores; a worker pool over directions is enough.
3. `gl/horizon-gpu.ts`: the same table rendered on the GPU into an R8 2D-array, two directions a
   frame so the interface never stalls; the max pyramid is built on the CPU and uploaded.
4. Shader and reference: `rel`, `sh`, `occl`, sheen.
5. Panel section 3 (Texture). Defaults when first switched on: estimated, depth 0.003, shadows 0.4.
6. Tests: a synthetic height field (a ridge, a pit, a ramp) with known shadows: reference
   against an exact ray march within 0.03 in `vis` for elevations 3° to 60°; GPU table against CPU
   table within 2 bytes at 99% of entries; parity documents with relief on; a flat photo
   (constant colour) gives `hHat = 0` and no change.

**Gate:** tests pass; bench rows "texture on" within §9 on the iMac; Isaac judges the estimated
texture on three of his photos. If he finds it worse than no texture, it ships off by default
and labelled "experimental"; the Light layer and Phase 5 carry the product.

### Phase 5 — True Relief from a side-lit photo (Fable 5.2, high effort)

The feature people pay for. Evidence and expected numbers: bakeoff.md and v1
`docs/real-light-test.md`. **Port, do not redesign**: v1 `src/lampphotos.js` and `src/lineup.js`
are pure typed-array code that already works on these photos.

1. Port `lineup.js` to `relief/lineup.ts` (`lineUp`, `warpPhoto`, `applyH`, `invertH`) and
   `lampphotos.js` to `relief/measure.ts` (`measureRelief`, `align`, `integrate`, `sharpen`, the
   sun path). Replace `Math.*` with `dmath`; keep v1's seeded random generator in the line-up.
   First, run v1's code in Node on the door pair and save its height map; the port must
   correlate with it at 0.99 or better. Lamp places for DSC_8382 (19 in wide) and the sun
   directions are in `bench/bakeoff/common.py` (`PIECES`).
2. `relief/axis.ts`: the light's axis from the pair (structure tensor of the mid band of
   log(side-lit / flat); reference `bench/bakeoff/azimuth.py`; within 20° on the five fixtures).
3. The flow, with no numbers asked: "Add a side-lit photo" (one to three; handheld is fine), the
   app lines each up, proposes the axis, and shows two small previews, light from one end and
   from the other, asking "Which looks right?". A dial fine-tunes. Elevation defaults to 20°
   (expert: elevation, or a lamp's place in cm as v1). Depth starts from the measurement.
4. `bench/relief-score.ts`: v1 `tools/realref/score.py` in TypeScript (shade corr per band).
5. Project files carry the measured maps (height as 16 bits split over two channels of a PNG).

**Gate:** with the documented directions (door 135° / 30°, lintel 47° / 10.3°), a sun-like light
on the measured relief scores shade corr at least 0.45 mid and 0.50 broad on both pieces (v1:
0.55 / 0.60 and 0.54 / 0.51); with the app's own axis and the right end picked, at least 0.40 /
0.45; DSC_8382 with its three lamp shots predicts each shot from the other two at 0.7 or better.
Isaac runs the flow once on a new piece with his phone.

### Phase 6 — Prepare, Finish, Projects (Sonnet 5.5, or Opus 5.5 at medium effort)

Read §5.9, §8.

1. Finish (§5.9) in reference and shader; panel section 4; curve editor (expert).
2. Crop and straighten: four corner handles with a suggested quadrilateral; the rectified photo
   (bicubic) becomes the document's photo.
3. Versions: "Keep this version" snapshots in a strip; tap to switch, hold to compare (replaces
   v1's batch viewer).
4. Projects: save and open `.digilight` (JSON with the photo and maps), a list in IndexedDB.
5. Apply to more photos: drop several, the current lights and finish render onto each (not
   relief), download as a zip.

**Gate:** parity and goldens with finish on; a project saved and reopened exports the same
SHA-256; Isaac lights five pieces alike in under two minutes.

### Phase 7 — AI access, local (Opus 5.5, medium effort)

Read v1 `tools/digilight-mcp.cjs` for the tool design only. Build `mcp`: pure Node on the
reference renderer (no browser), `sharp` for decoding and encoding.

- MCP tools (stdio): `open_image`, `list_looks`, `apply_look`, `describe_settings`,
  `get_settings`, `set_settings`, `add_light`, `update_light`, `remove_light`, `set_relief`,
  `measure_relief`, `render_preview` (image plus metrics, optional region), `compare` (A, B,
  difference), `export_image`, `undo`, `reset`. Each returns the changed values and warnings.
- `digilight` command line: `render`, `looks`, `describe`, `verify` (re-render a record and
  compare SHA-256).
- Server instructions teach an agent the loop: open, look, render small, read metrics, adjust,
  export.

**Gate:** `e2e/mcp.spec.ts` drives the server through a full session; a 1,280 px preview returns
in under 1 s; an export equals the app's export of the same document, byte for byte.

### Phase 8 — AI access, hosted (Opus 5.5, medium effort)

Write this phase's plan in `docs/phase-8.md` first and get Isaac's OK: it creates a Worker, a
secret and possible cost. Outline: Worker `studio-digilight-api`; `POST /v1/render` (photo by
upload or URL, a document, width up to 2048: a Worker has 128 MB) and a remote MCP endpoint
wrapping the same commands; JPEG decoding by a WASM decoder; a bearer key until sign-in exists.

### Phase 9 — Sign-in, assistant, payment (Opus 5.5; the Studio Platform's own rules apply)

Off by a flag until Isaac turns it on; testing needs no sign-in. Outline: sign-in and project
storage through the Studio Platform SDK (`yitzhach/Art-Talk-Back`, `@studio/sdk`); a "Describe
the light you want" box that sends the sentence and `describe()` to the platform's assistant,
which answers with commands; plan limits (export size, True Relief, batch) read from the session.
Write `docs/phase-9.md` first.

### Phase 10 — A trained model for one-photo relief (Fable 5.2, high effort; optional)

Continue bakeoff.md: Lotus, StableNormal, MoGe-2, and a material model (CHORD as a reference
only, its licence is research-only; fal PATINA needs a paid key and Isaac's OK). A model replaces
`relief/estimate.ts` only if it scores shade corr 0.30 or better at mid scale on all three
fixture pieces **and** Isaac prefers it by eye. Per answer 2c it would run in the browser where
it can and on a server otherwise.

### Later (not in 2.0)

A wall behind the piece with the light's pool and the piece's own drop shadow; window, blinds
and leaf patterns on a light; 16-bit and TIFF export; Photoshop or Lightroom plugin.

---

## 11. From v1: keep and drop

| keep (port into) | v1 file |
|---|---|
| measured relief (`relief/measure.ts`) | `src/lampphotos.js` |
| handheld line-up (`relief/lineup.ts`) | `src/lineup.js` |
| colour space and HEIC (`web/io`) | `src/colour.js`, `vendor/libheif` |
| exact resize (`core/resample.ts`) | `src/resample.js` |
| black-body colour (table generator) | `src/kelvin.js` |
| metrics (`core/metrics.ts`) | `src/measure.js` `imageMetrics` |
| scoring against real light (`bench/relief-score.ts`) | `tools/realref/score.py` |
| test photos | `testdata/photos`, `samples` |

Dropped, on purpose: the brightness relief estimator and its bands, de-light albedo, graze light
and its smoothing, Analyze and fitted looks, the sharp-view patch cache, scene types (portrait,
room, photo, object) and scene depth, layers and blend modes, light leaks and overlays other than
vignette and grain, shadow and negative lights, the 20-minute browser test. v1 stays live at its
address until Isaac says 2.0 has replaced it.

## 12. Needs Isaac

| when | what |
|---|---|
| before Phase 0 | create the empty repository `yitzhach/digilight` |
| before Phase 3's gate | connect it to Cloudflare Workers Builds; first deploy of `studio-digilight` |
| Phase 3, 4, 5, 6 gates | try it on the iMac and say what reads wrong |
| Phase 8 | a new Worker, its secret, any cost |
| Phase 9 | turning on sign-in and payment |
| Phase 10 | any paid model key |

## 13. Which model for which phase

| phase | model and effort | why |
|---|---|---|
| 0 Repository | Sonnet 5.5 | mechanical |
| 1 Engine | Opus 5.5, high | everything rests on it; exact arithmetic |
| 2 Preview | Opus 5.5, high | shader must match the reference |
| 3 App | Opus 5.5, medium (Sonnet 5.5 for panel work) | mostly interface |
| 4 Texture and shadows | Opus 5.5, high; Fable 5.2 if GPU and CPU tables disagree | two implementations of one table |
| **5 True Relief** | **Fable 5.2, high (or ultracode)** | the hardest code and the main reason to pay |
| 6 Prepare, Finish, Projects | Sonnet 5.5 | well specified |
| 7 AI access, local | Opus 5.5, medium | small, but the tool wording matters |
| 8, 9 Hosted, sign-in, assistant | Opus 5.5, medium, after a written plan | touches the platform and money |
| **10 Trained model** | **Fable 5.2, high (or ultracode)** | research with an honest gate |

## 14. Session prompt

```
Read CLAUDE.md and STATUS.md in yitzhach/digilight, then BUILD.md sections 1 to 4, and do
Phase N (BUILD.md section 10, plus the sections it names). Port from yitzhach/digi-light-test
only the files the phase lists. Answers to "Waiting on Isaac": [...]
Keep replies brief. Stop at the phase's gate and tell me what to check.
```
