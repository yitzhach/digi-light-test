// fx.js — atmosphere and lens effects (the Scene tool's Effects): haze, light rays, glow and
// background blur. Each has its own eye; all are off by default, and saves made before them open
// with them off, so a picture is exactly what it was until one is turned on. `state.fx`.
//
//   Haze             air between the camera and the far parts of a scene: they fade toward its
//                    colour, and toward the key light it glows (light scattered forward).
//                    A photo's scene only: it needs to know what is far.
//   Light rays       shafts of light through the air along the key light's direction.
//   Glow             bright light blooming into its surroundings, as in a lens (postfx.js).
//   Background blur  a wide-open lens: in focus where the subject stands, softer the further
//                    behind it (postfx.js). A photo's scene only.
// Haze and rays are worked out per pixel in the shading pass from the picture's own coordinates,
// so preview, sharp zoom and every export tile draw the same; glow and blur look at neighbours
// and run after it (postfx.js), each export tile with a margin wide enough for them.
import { eyeButton } from './adjust.js';
import { sunDirection } from './presets.js';

const pct = (v) => `${Math.round(v * 100)}%`;
const widths = (v) => `${(v * 100).toFixed(1)}%`;
// [field, label, min, max, step, format]
export const FX = [
  { key: 'haze', name: 'Haze', scene: true, note: 'Air between you and the far parts of the scene: they fade toward its colour, glowing toward the light. Needs a photo\'s scene (it knows what is far).',
    def: { on: 0, amount: 0.25, glow: 0.5, hex: '#d4dce8' },
    fields: [['amount', 'Amount', 0, 1, 0.01, pct], ['glow', 'Glow toward the light', 0, 1, 0.01, pct]] },
  { key: 'rays', name: 'Light rays', note: 'Shafts of light through the air along the key light, brightest where it comes in.',
    def: { on: 0, amount: 0.25, spacing: 0.4, length: 0.6, hex: '#fff0d4' },
    fields: [['amount', 'Amount', 0, 1, 0.01, pct], ['spacing', 'Spacing', 0.1, 1, 0.01, pct], ['length', 'Length', 0.1, 1, 0.01, pct]] },
  { key: 'glow', name: 'Glow', post: true, note: 'Bright light blooms softly into what is round it, as in a lens. From: how bright a part must be to glow.',
    def: { on: 0, amount: 0.3, size: 0.02, from: 0.72 },
    fields: [['amount', 'Amount', 0, 1, 0.01, pct], ['size', 'Size', 0.004, 0.06, 0.001, widths], ['from', 'From', 0.3, 0.98, 0.01, pct]] },
  { key: 'blur', name: 'Background blur', post: true, scene: true, note: 'A wide-open lens: sharp where the subject stands, softer the further behind it. Needs a photo\'s scene.',
    def: { on: 0, amount: 0.4, size: 0.012 },
    fields: [['amount', 'Amount', 0, 1, 0.01, pct], ['size', 'Most blur', 0.002, 0.03, 0.001, widths]] },
];
export const POST_FX = FX.filter((f) => f.post).map((f) => f.key);

export function fxDefaults() {
  const o = { on: 1 };
  for (const F of FX) o[F.key] = { ...F.def };
  return o;
}

export function validateFx(v) {
  const out = fxDefaults();
  if (v == null) return out;
  const bad = () => { throw new Error('Invalid effects.'); };
  if (typeof v !== 'object') bad();
  out.on = v.on == null ? 1 : v.on ? 1 : 0;
  for (const F of FX) {
    const s = v[F.key];
    if (s == null) continue;
    if (typeof s !== 'object') bad();
    const o = out[F.key];
    o.on = s.on ? 1 : 0;
    for (const [k, , min, max] of F.fields) if (s[k] != null) { if (!Number.isFinite(s[k]) || s[k] < min || s[k] > max) bad(); o[k] = s[k]; }
    if ('hex' in o && s.hex != null) { if (!/^#[0-9a-f]{6}$/i.test(s.hex)) bad(); o.hex = s.hex.toLowerCase(); }
  }
  return out;
}

/** An effect is shown: the eye of all effects and its own, with an amount, and a scene if it needs one. */
export function fxShown(state, key, sceneOn = !!state.sceneMap) {
  const f = state.fx, F = FX.find((x) => x.key === key);
  return !!(f && f.on && f[key]?.on && f[key].amount > 0 && (!F.scene || sceneOn));
}

// Shading-pass effects. Needs OVERLAY_GLSL's ovNoise and the shading pass's uAspect.
export const FX_GLSL = `
uniform vec4  uHaze;      // amount, glow toward the light, 1 / the scene's top (image widths), -
uniform vec3  uHazeCol;   // display colour
uniform vec4  uRays;      // amount, spacing (image widths), length (image widths), -
uniform vec3  uRaysCol;
uniform vec2  uFxDir;     // the key light's travel across the picture (unit), for both
uniform vec2  uFxFrom;    // where it comes in: the picture's point nearest the light (image widths)

// Haze: the far parts of a scene (low heights) veiled toward the haze colour, more where the key
// light shines from (forward scattering). h: this point's scene height; sky: its sky matte.
vec3 haze(vec3 col, vec2 P, float h, float sky) {
  float far = clamp(1.0 - h * uHaze.z, 0.0, 1.0);
  float fog = uHaze.x * far * far * (1.0 - 0.4 * sky);
  vec2 C = vec2(0.5, 0.5 * uAspect);
  float toward = dot(normalize(P - C + 1e-5), -uFxDir) * 0.5 + 0.5;
  vec3 c = clamp(uHazeCol * (1.0 + uHaze.y * (toward - 0.5) * 1.2), 0.0, 1.0);
  return mix(col, c, fog);
}
// Light rays: a few broad, soft shafts along the key light's travel, from smooth noise across it
// (Spacing: how far apart), varying slowly along it, brightest where the light comes in and
// fading over Length. Laid on like a screen, a little less over the subject.
vec3 rays(vec3 col, vec2 P, float subject) {
  vec2 d = uFxDir, n = vec2(-d.y, d.x);
  float across = dot(P, n) / uRays.y, along = max(dot(P - uFxFrom, d), 0.0);
  float s = 0.7 * ovNoise(vec2(across, along * 0.35), 11.0) + 0.3 * ovNoise(vec2(across * 2.3, along * 0.6), 23.0);
  float shaft = smoothstep(0.42, 0.72, s) * exp(-along / max(uRays.z, 1e-3));
  vec3 add = uRaysCol * uRays.x * shaft * (1.0 - 0.5 * subject);
  return 1.0 - (1.0 - col) * (1.0 - clamp(add, 0.0, 1.0));
}`;

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

/** The key light's travel across the picture (unit, toward where its light goes) and where it
 *  comes in, from the strongest lamp; a sun's is its direction. */
export function keyTravel(lights, aspect) {
  let best = null, bw = 0;
  for (const l of lights || []) {
    if (!l.enabled || (l.kind && l.kind !== 'light')) continue;
    const w = l.power * (0.2126 * l.rgb[0] + 0.7152 * l.rgb[1] + 0.0722 * l.rgb[2]);
    if (w > bw) { bw = w; best = l; }
  }
  let dx = 0.6, dy = -0.8;   // none: from the upper left, as most of the presets
  if (best) {
    const v = best.sun ? sunDirection(best, aspect) : [best.x - 0.5, (best.y - 0.5) * aspect];
    const n = Math.hypot(v[0], v[1]);
    if (n > 1e-4) { dx = -v[0] / n; dy = -v[1] / n; }
  }
  // Where it comes in: the picture's corner or edge on the light's side.
  const C = [0.5, 0.5 * aspect], ext = Math.abs(dx) * 0.5 + Math.abs(dy) * 0.5 * aspect;
  return { dir: [dx, dy], from: [C[0] - dx * ext, C[1] - dy * ext] };
}

export function setFxUniforms(gl, u, state, aspect, off) {
  const f = state.fx || fxDefaults(), sceneOn = !!state.sceneMap && !off;
  const hz = f.haze, ry = f.rays, t = keyTravel(state.lights, aspect);
  gl.uniform4f(u.uHaze, !off && fxShown(state, 'haze', sceneOn) ? hz.amount : 0, hz.glow, 1 / Math.max(1e-3, state.sceneMap?.top || 1), 0);
  gl.uniform3fv(u.uHazeCol, rgb(hz.hex));
  gl.uniform4f(u.uRays, !off && fxShown(state, 'rays', sceneOn) ? ry.amount : 0, ry.spacing * 0.3, ry.length, 0);
  gl.uniform3fv(u.uRaysCol, rgb(ry.hex));
  gl.uniform2f(u.uFxDir, t.dir[0], t.dir[1]);
  gl.uniform2f(u.uFxFrom, t.from[0], t.from[1]);
}

/** The Effects controls, into `box`. Returns sync(). */
export function buildFxUI(box, { state, render }) {
  const syncs = [], fx = () => state.fx;
  const head = document.createElement('div'); head.className = 'layerHead ovHead';
  const title = document.createElement('strong'); title.textContent = 'Effects';
  const master = eyeButton('all effects', () => fx().on, (on) => { fx().on = on ? 1 : 0; box.classList.toggle('off', !on); render(); });
  master.id = 'fxEye';
  head.append(title, master); box.append(head);
  syncs.push(() => { master.sync(); box.classList.toggle('off', !fx().on); });
  for (const F of FX) {
    const d = document.createElement('details'); d.className = 'adj ovItem'; d.id = 'fx-' + F.key;
    const sum = document.createElement('summary'); sum.textContent = F.name;
    const eye = eyeButton(F.name, () => fx()[F.key].on, (on) => { fx()[F.key].on = on ? 1 : 0; if (on) { fx().on = 1; master.sync(); box.classList.remove('off'); } d.classList.toggle('off', !on); render(); });
    sum.append(eye); d.append(sum);
    syncs.push(() => { eye.sync(); d.classList.toggle('off', !fx()[F.key].on); });
    const body = document.createElement('div'); body.className = 'adjBody'; d.append(body);
    const touch = () => { const s = fx()[F.key]; if (!s.on || !fx().on) { s.on = 1; fx().on = 1; eye.sync(); master.sync(); d.classList.remove('off'); box.classList.remove('off'); } };
    if ('hex' in F.def) {
      const line = document.createElement('div'); line.className = 'ovLine';
      const c = document.createElement('input'); c.type = 'color'; c.id = `fx-${F.key}-colour`; c.title = 'Colour'; c.setAttribute('aria-label', F.name + ' colour');
      c.oninput = () => { touch(); fx()[F.key].hex = c.value; render(); };
      line.append(c); body.append(line); syncs.push(() => { c.value = fx()[F.key].hex; });
    }
    for (const [k, name, min, max, step, fmt] of F.fields) {
      const row = document.createElement('div'); row.className = 'row';
      const id = `fx-${F.key}-${k}`;
      row.innerHTML = `<label for="${id}">${name}</label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}"><output data-own></output>`;
      const i = row.querySelector('input'), out = row.querySelector('output');
      i.oninput = () => { touch(); fx()[F.key][k] = +i.value; out.textContent = fmt(+i.value); render(); };
      body.append(row);
      syncs.push(() => { i.value = fx()[F.key][k]; out.textContent = fmt(fx()[F.key][k]); });
    }
    const n = document.createElement('p'); n.className = 'note'; n.textContent = F.note; body.append(n);
    box.append(d);
  }
  const sync = () => { for (const s of syncs) s(); };
  sync();
  return sync;
}

