// Overlays (Layers tool): film grain and four lighting overlays, each with its own eye,
// opacity and blend mode, laid over the result after the blend layers and before Original
// on top (so the Opacity of the whole effect fades them too). Shapes are placed in the
// painting's own coordinates, never the screen's, so the preview, the sharp zoom and a
// tiled full-size export draw the same thing; the grain is made in the shader on a grid
// tied to the painting's width, so it is the same size on the painting at any resolution.
// `state.overlays`; all off by default, and saves made before them open with them off.
import { blendModes } from './presets.js';
import { eyeButton } from './adjust.js';

const pct = (v) => `${Math.round(v * 100)}%`;
const deg = (v) => `${Math.round(v)}°`;
const num = (d) => (v) => (+v).toFixed(d);
// [field, label, min, max, step, format]; `hex` and `mode` are added to every overlay but grain's colour.
export const OVERLAYS = [
  { key: 'grain', name: 'Film grain', note: 'Grain made for the painting, not the screen: the same size on the painting in the preview and in a full-size export. Seed picks another pattern.',
    def: { on: 0, opacity: 0.35, size: 1, colour: 0, seed: 1, mode: 'overlay' },
    fields: [['opacity', 'Amount', 0, 1, 0.01, pct], ['size', 'Size', 0.5, 6, 0.1, num(1)], ['seed', 'Seed', 1, 99, 1, num(0)]] },
  { key: 'vignette', name: 'Vignette', note: 'Darkens (or tints) toward the edges. Start: where it begins from the centre (0) to the corners (1).',
    def: { on: 0, opacity: 0.5, size: 0.45, feather: 0.55, hex: '#000000', mode: 'multiply' },
    fields: [['opacity', 'Opacity', 0, 1, 0.01, pct], ['size', 'Start', 0, 1, 0.01, pct], ['feather', 'Feather', 0.02, 1, 0.01, pct]] },
  { key: 'leak', name: 'Light leak · warm glow', note: 'A soft glow coming in from one edge or corner. Direction: where it comes from (0° right, 90° top).',
    def: { on: 0, opacity: 0.5, angle: 45, size: 0.55, hex: '#ff8a3d', mode: 'screen' },
    fields: [['opacity', 'Opacity', 0, 1, 0.01, pct], ['angle', 'Direction', 0, 359, 1, deg], ['size', 'Size', 0.1, 1.5, 0.01, pct]] },
  { key: 'window', name: 'Window light', note: 'A soft gradient of daylight across the painting from one side, as from a window. Reach: how far in it comes.',
    def: { on: 0, opacity: 0.55, angle: 135, soft: 0.8, reach: 0.2, hex: '#fff3e0', mode: 'softLight' },
    fields: [['opacity', 'Opacity', 0, 1, 0.01, pct], ['angle', 'Direction', 0, 359, 1, deg], ['reach', 'Reach', -1, 1, 0.01, pct], ['soft', 'Softness', 0.05, 2, 0.01, pct]] },
  { key: 'pool', name: 'Spotlight pool', note: 'A pool of light on the painting, the room around it darker. Across / Up place its centre (0–100% of the painting).',
    def: { on: 0, opacity: 0.6, x: 0.5, y: 0.55, size: 0.38, soft: 0.6, surround: 0.5, hex: '#ffe2b3', mode: 'softLight' },
    fields: [['opacity', 'Opacity', 0, 1, 0.01, pct], ['x', 'Across', 0, 1, 0.01, pct], ['y', 'Up', 0, 1, 0.01, pct], ['size', 'Size', 0.05, 1, 0.01, pct], ['soft', 'Softness', 0, 1, 0.01, pct], ['surround', 'Darker around', 0, 1, 0.01, pct]] },
];
const MODE = Object.fromEntries(blendModes.map(([k], i) => [k, i]));

export function overlayDefaults() {
  const o = { on: 1 };
  for (const O of OVERLAYS) o[O.key] = { ...O.def };
  return o;
}

export function validateOverlays(v) {
  const out = overlayDefaults();
  if (v == null) return out;
  const bad = () => { throw new Error('Invalid overlays.'); };
  if (typeof v !== 'object') bad();
  out.on = v.on == null ? 1 : v.on ? 1 : 0;
  for (const O of OVERLAYS) {
    const s = v[O.key];
    if (s == null) continue;
    if (typeof s !== 'object') bad();
    const o = out[O.key];
    o.on = s.on ? 1 : 0;
    for (const [k, , min, max] of O.fields) if (s[k] != null) { if (!Number.isFinite(s[k]) || s[k] < min || s[k] > max) bad(); o[k] = s[k]; }
    if (s.mode != null) { if (!(s.mode in MODE)) bad(); o.mode = s.mode; }
    if ('hex' in o && s.hex != null) { if (!/^#[0-9a-f]{6}$/i.test(s.hex)) bad(); o.hex = s.hex.toLowerCase(); }
    if ('colour' in o && s.colour != null) o.colour = s.colour ? 1 : 0;
  }
  return out;
}

export const OVERLAY_GLSL = `
uniform vec4  uGrain;      // amount, cell size (painting widths), colour 0/1, seed
uniform int   uGrainMode;
uniform vec4  uVig;        // opacity, start, feather, -
uniform vec3  uVigCol;
uniform int   uVigMode;
uniform vec4  uLeak;       // opacity, direction (rad), size, -
uniform vec3  uLeakCol;
uniform int   uLeakMode;
uniform vec4  uWin;        // opacity, direction (rad), softness, reach
uniform vec3  uWinCol;
uniform int   uWinMode;
uniform vec4  uPool;       // opacity, x, y, size
uniform vec2  uPool2;      // softness, darker around
uniform vec3  uPoolCol;
uniform int   uPoolMode;

float ovHash(vec2 p, float s) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031 + s * 0.1373);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float ovNoise(vec2 x, float s) {
  vec2 i = floor(x), f = fract(x), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(ovHash(i, s), ovHash(i + vec2(1.0, 0.0), s), u.x), mix(ovHash(i + vec2(0.0, 1.0), s), ovHash(i + vec2(1.0, 1.0), s), u.x), u.y);
}
// Zero-mean grain, roughly unit spread: two octaves of smooth value noise.
float ovGrain(vec2 x, float s) {
  return (ovNoise(x, s) + 0.5 * ovNoise(x * 2.03 + 17.17, s + 5.0) - 0.75) * 3.2;
}
vec3 overlays(vec3 col, vec2 g) {
  vec2 P = vec2(g.x, g.y * uAspect), C = vec2(0.5, 0.5 * uAspect), H = vec2(0.5, 0.5 * uAspect);
  if (uWin.x > 0.0) {
    vec2 d = vec2(cos(uWin.y), sin(uWin.y));
    float e = abs(d.x) * H.x + abs(d.y) * H.y;
    float t = dot(P - C, d) / e + uWin.w;   // -1 at the far edge, 1 at the window's
    float m = smoothstep(-uWin.z, uWin.z, t);
    col = mix(col, blendLayer(uWinMode, col, uWinCol), uWin.x * m);
  }
  if (uPool.x > 0.0) {
    float r = length(P - vec2(uPool.y, uPool.z * uAspect));
    float m = 1.0 - smoothstep(uPool.w * (1.0 - uPool2.x), uPool.w * (1.0 + 0.5 * uPool2.x) + 1e-3, r);
    col = mix(col, blendLayer(uPoolMode, col, uPoolCol * m), uPool.x * mix(uPool2.y, 1.0, m));
  }
  if (uLeak.x > 0.0) {
    vec2 d = vec2(cos(uLeak.y), sin(uLeak.y));
    vec2 S = C + d * H * 1.25;
    float r = length(P - S) / max(1.0, uAspect);
    float m = exp(-2.0 * (r / uLeak.z) * (r / uLeak.z));
    col = mix(col, blendLayer(uLeakMode, col, uLeakCol), uLeak.x * m);
  }
  if (uVig.x > 0.0) {
    float d = length((P - C) / H) * 0.70710678;   // 0 centre, 1 corners
    float m = smoothstep(uVig.y, uVig.y + uVig.z, d);
    col = mix(col, blendLayer(uVigMode, col, uVigCol), uVig.x * m);
  }
  if (uGrain.x > 0.0) {
    vec2 x = P / uGrain.y;
    float n = ovGrain(x, uGrain.w);
    vec3 nn = uGrain.z > 0.0 ? vec3(n, ovGrain(x, uGrain.w + 31.7), ovGrain(x, uGrain.w + 63.1)) : vec3(n);
    col = mix(col, blendLayer(uGrainMode, col, clamp(0.5 + 0.22 * nn, 0.0, 1.0)), uGrain.x);
  }
  return col;
}`;

// Grain cell: Size 1 is 1/1500 of the painting's width (a pixel of a 1500 px wide photo).
export const GRAIN_CELL = 1 / 1500;
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

export function setOverlayUniforms(gl, u, state, off) {
  const o = state.overlays || overlayDefaults(), show = (k) => !off && o.on && o[k]?.on;
  const op = (k) => (show(k) ? o[k].opacity : 0), rad = (d) => d * Math.PI / 180;
  const g = o.grain, v = o.vignette, l = o.leak, w = o.window, p = o.pool;
  gl.uniform4f(u.uGrain, op('grain'), g.size * GRAIN_CELL, g.colour ? 1 : 0, g.seed);
  gl.uniform1i(u.uGrainMode, MODE[g.mode] ?? MODE.overlay);
  gl.uniform4f(u.uVig, op('vignette'), v.size, v.feather, 0); gl.uniform3fv(u.uVigCol, rgb(v.hex)); gl.uniform1i(u.uVigMode, MODE[v.mode] ?? 0);
  gl.uniform4f(u.uLeak, op('leak'), rad(l.angle), l.size, 0); gl.uniform3fv(u.uLeakCol, rgb(l.hex)); gl.uniform1i(u.uLeakMode, MODE[l.mode] ?? 0);
  gl.uniform4f(u.uWin, op('window'), rad(w.angle), w.soft, w.reach); gl.uniform3fv(u.uWinCol, rgb(w.hex)); gl.uniform1i(u.uWinMode, MODE[w.mode] ?? 0);
  gl.uniform4f(u.uPool, op('pool'), p.x, p.y, p.size); gl.uniform2f(u.uPool2, p.soft, p.surround); gl.uniform3fv(u.uPoolCol, rgb(p.hex)); gl.uniform1i(u.uPoolMode, MODE[p.mode] ?? 0);
}

/** The Overlays controls, into `box`. `modeMenu(obj, button, redraw)` is the layers'
 *  blend-mode list with hover preview. Returns sync(). */
export function buildOverlayUI(box, { state, render, modeMenu }) {
  const syncs = [];
  const ov = () => state.overlays;
  const head = document.createElement('div'); head.className = 'layerHead ovHead';
  const title = document.createElement('strong'); title.textContent = 'Overlays';
  const master = eyeButton('all overlays', () => ov().on, (on) => { ov().on = on ? 1 : 0; box.classList.toggle('off', !on); render(); });
  master.id = 'overlaysEye';
  head.append(title, master); box.append(head);
  syncs.push(() => { master.sync(); box.classList.toggle('off', !ov().on); });
  for (const O of OVERLAYS) {
    const d = document.createElement('details'); d.className = 'adj ovItem'; d.id = 'ov-' + O.key;
    const sum = document.createElement('summary'); sum.textContent = O.name;
    const eye = eyeButton(O.name, () => ov()[O.key].on, (on) => { ov()[O.key].on = on ? 1 : 0; if (on) { ov().on = 1; master.sync(); box.classList.remove('off'); } d.classList.toggle('off', !on); render(); });
    sum.append(eye); d.append(sum);
    syncs.push(() => { eye.sync(); d.classList.toggle('off', !ov()[O.key].on); });
    const body = document.createElement('div'); body.className = 'adjBody'; d.append(body);
    const touch = () => { const s = ov()[O.key]; if (!s.on || !ov().on) { s.on = 1; ov().on = 1; eye.sync(); master.sync(); d.classList.remove('off'); box.classList.remove('off'); } };
    // Blend mode and colour on one line.
    const line = document.createElement('div'); line.className = 'ovLine';
    const mb = document.createElement('button'); mb.type = 'button'; mb.className = 'ovModeBtn'; mb.id = `ov-${O.key}-mode`; mb.setAttribute('aria-haspopup', 'listbox'); mb.title = 'Blend mode: hover a mode to preview it, click to apply';
    const label = () => { mb.textContent = (blendModes.find(([k]) => k === ov()[O.key].mode)?.[1] || ov()[O.key].mode) + ' ▾'; };
    mb.onclick = (e) => { e.stopPropagation(); touch(); modeMenu(ov()[O.key], mb, label); };
    line.append(mb); syncs.push(label);
    if ('hex' in O.def) {
      const c = document.createElement('input'); c.type = 'color'; c.id = `ov-${O.key}-colour`; c.title = 'Colour'; c.setAttribute('aria-label', O.name + ' colour');
      c.oninput = () => { touch(); ov()[O.key].hex = c.value; render(); };
      line.append(c); syncs.push(() => { c.value = ov()[O.key].hex; });
    } else {
      const l = document.createElement('label'); l.className = 'checkRow';
      const c = document.createElement('input'); c.type = 'checkbox'; c.id = 'ov-grain-colour';
      c.onchange = () => { touch(); ov().grain.colour = c.checked ? 1 : 0; render(); };
      l.append(c, ' Colour grain'); line.append(l); syncs.push(() => { c.checked = !!ov().grain.colour; });
    }
    body.append(line);
    for (const [k, name, min, max, step, fmt] of O.fields) {
      const row = document.createElement('div'); row.className = 'row';
      const id = `ov-${O.key}-${k}`;
      row.innerHTML = `<label for="${id}">${name}</label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}"><output data-own></output>`;
      const i = row.querySelector('input'), out = row.querySelector('output');
      i.oninput = () => { touch(); ov()[O.key][k] = +i.value; out.textContent = fmt(+i.value); render(); };
      body.append(row);
      syncs.push(() => { i.value = ov()[O.key][k]; out.textContent = fmt(ov()[O.key][k]); });
    }
    const n = document.createElement('p'); n.className = 'note'; n.textContent = O.note; body.append(n);
    box.append(d);
  }
  const sync = () => { for (const s of syncs) s(); };
  sync();
  return sync;
}
