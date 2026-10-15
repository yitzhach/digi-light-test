// Colour adjustments (Colour tool), the image editor's adjustment list: Brightness/Contrast,
// Levels, Curves, Exposure, Vibrance, Hue/Saturation, Color Balance, Black & White and
// Channel Mixer, applied in that order to the relit image in display (sRGB) values, before
// the blend layers. Each has its own eye (visible / hidden); the whole Colour tool has one
// too, and an Opacity that mixes the adjusted image with the unadjusted one (and scales the
// Colour & strokes lighting controls by the same amount). At their default values every
// adjustment is an exact no-op, so saves made before they existed open unchanged.
// `state.adjust` holds them; Vibrance's own amount stays `state.vibrance`.

const pct = (v) => `${Math.round(v * 100)}%`;
const signed = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`;
const num = (d) => (v) => (+v).toFixed(d);
const deg = (v) => `${Math.round(v)}°`;
const whole = (v) => `${Math.round(v)}%`;
const ident = () => [[0, 0], [1, 1]];

// [field, label, min, max, step, default, format, group]. A group shows one set of fields
// at a time (Color Balance's tone, Channel Mixer's output channel), as the editor does.
export const ADJUSTMENTS = [
  // Relief: more or less 3D. Not a colour step: it scales the depth the lights shade and
  // shadow (app.js reliefBoost), so it rebuilds the relief. 100% is the depth as set.
  // Fine and Mid detail scale the one-photo relief's bands (gbuffer.js), each on its own:
  // the relief is still measured at 100%, so taking the grain away does not deepen the
  // strokes. Broad form adds a larger-scale relief the estimate leaves out (0% = none).
  { key: 'relief', name: 'Relief (3D)', note: 'More or less 3D: 0% is flat, 100% the depth as set (Quick setup), 300% three times deeper. Shading and shadows follow. Fine detail is the paint grain (the sandy bumps), Mid detail the brush strokes, Broad form the larger shapes as gentle swells (light areas forward, dark back). The three bands shape the one-photo relief, not measured relief.', fields: [
    ['amount', 'Relief', 0, 3, 0.05, 1, pct], ['fine', 'Fine detail', 0, 3, 0.05, 1, pct], ['mid', 'Mid detail', 0, 3, 0.05, 1, pct],
    ['form', 'Broad form', 0, 3, 0.05, 0, pct], ['formSize', 'Broad size', 0.25, 4, 0.05, 1, pct]] },
  { key: 'brightness', name: 'Brightness/Contrast', fields: [
    ['brightness', 'Brightness', -1, 1, 0.01, 0, signed], ['contrast', 'Contrast', -1, 1, 0.01, 0, signed]] },
  { key: 'levels', name: 'Levels', fields: [
    ['inBlack', 'Input black', 0, 0.95, 0.005, 0, num(3)], ['gamma', 'Midtones (gamma)', 0.1, 9.99, 0.01, 1, num(2)], ['inWhite', 'Input white', 0.05, 1, 0.005, 1, num(3)],
    ['outBlack', 'Output black', 0, 1, 0.005, 0, num(3)], ['outWhite', 'Output white', 0, 1, 0.005, 1, num(3)]] },
  { key: 'curves', name: 'Curves', fields: [] },
  { key: 'exposure', name: 'Exposure', fields: [
    ['exposure', 'Exposure', -5, 5, 0.01, 0, (v) => `${v > 0 ? '+' : ''}${(+v).toFixed(2)}`], ['offset', 'Offset', -0.5, 0.5, 0.001, 0, num(3)], ['gamma', 'Gamma correction', 0.1, 9.99, 0.01, 1, num(2)]] },
  { key: 'vibrance', name: 'Vibrance', fields: [
    ['vibrance', 'Vibrance', -1, 1, 0.05, 0, signed], ['saturation', 'Saturation', -1, 1, 0.01, 0, signed]] },
  { key: 'hueSat', name: 'Hue/Saturation', fields: [
    ['hue', 'Hue', -180, 180, 1, 0, deg], ['saturation', 'Saturation', -1, 1, 0.01, 0, signed], ['lightness', 'Lightness', -1, 1, 0.01, 0, signed]] },
  { key: 'balance', name: 'Color Balance', groups: [['s', 'Shadows'], ['m', 'Midtones'], ['h', 'Highlights']], fields: [
    ...['s', 'm', 'h'].flatMap((t) => [[t + 'CR', 'Cyan – Red', -1, 1, 0.01, 0, signed, t], [t + 'MG', 'Magenta – Green', -1, 1, 0.01, 0, signed, t], [t + 'YB', 'Yellow – Blue', -1, 1, 0.01, 0, signed, t]]),
    ['preserve', 'Preserve luminosity', 0, 1, 1, 1, null]] },
  { key: 'bw', name: 'Black & White', off: true, fields: [
    ['reds', 'Reds', -200, 300, 1, 40, whole], ['yellows', 'Yellows', -200, 300, 1, 60, whole], ['greens', 'Greens', -200, 300, 1, 40, whole],
    ['cyans', 'Cyans', -200, 300, 1, 60, whole], ['blues', 'Blues', -200, 300, 1, 20, whole], ['magentas', 'Magentas', -200, 300, 1, 80, whole],
    ['tint', 'Tint', 0, 1, 1, 0, null], ['tintHue', 'Tint hue', 0, 360, 1, 35, deg], ['tintSat', 'Tint saturation', 0, 1, 0.01, 0.25, pct]] },
  { key: 'mixer', name: 'Channel Mixer', groups: [['r', 'Red'], ['g', 'Green'], ['b', 'Blue']], fields: [
    ...['r', 'g', 'b'].flatMap((o) => [[o + 'R', 'Red', -200, 200, 1, o === 'r' ? 100 : 0, whole, o], [o + 'G', 'Green', -200, 200, 1, o === 'g' ? 100 : 0, whole, o],
      [o + 'B', 'Blue', -200, 200, 1, o === 'b' ? 100 : 0, whole, o], [o + 'C', 'Constant', -200, 200, 1, 0, whole, o]]),
    ['mono', 'Monochrome (Red output)', 0, 1, 1, 0, null]] },
];
const CURVE_CH = ['rgb', 'r', 'g', 'b'];
const isCheck = (f) => f[6] === null;

export function adjustDefaults() {
  const a = { on: 1, opacity: 1 };
  for (const A of ADJUSTMENTS) {
    const o = { on: A.off ? 0 : 1 };
    for (const f of A.fields) if (f[0] !== 'vibrance' || A.key !== 'vibrance') o[f[0]] = f[5];
    if (A.key === 'curves') for (const c of CURVE_CH) o[c] = ident();
    a[A.key] = o;
  }
  return a;
}

/** A saved `adjust` checked and filled in; missing (older saves) gives the defaults. */
export function validateAdjust(v) {
  const out = adjustDefaults();
  if (v == null) return out;
  const bad = () => { throw new Error('Invalid colour adjustments.'); };
  if (typeof v !== 'object') bad();
  const flag = (x, d) => (x == null ? d : x ? 1 : 0);
  out.on = flag(v.on, 1);
  if (v.opacity != null) { if (!Number.isFinite(v.opacity) || v.opacity < 0 || v.opacity > 1) bad(); out.opacity = v.opacity; }
  for (const A of ADJUSTMENTS) {
    const s = v[A.key];
    if (s == null) continue;
    if (typeof s !== 'object') bad();
    out[A.key].on = flag(s.on, out[A.key].on);
    for (const f of A.fields) {
      if (!(f[0] in out[A.key]) || s[f[0]] == null) continue;
      const x = s[f[0]];
      if (isCheck(f)) { out[A.key][f[0]] = x ? 1 : 0; continue; }
      if (!Number.isFinite(x) || x < f[2] || x > f[3]) bad();
      out[A.key][f[0]] = x;
    }
    if (A.key === 'curves') for (const c of CURVE_CH) if (s[c] != null) out.curves[c] = validCurve(s[c]) || bad();
  }
  return out;
}
function validCurve(p) {
  if (!Array.isArray(p) || p.length < 2 || p.length > 16) return null;
  if (!p.every((q) => Array.isArray(q) && q.length === 2 && q.every((x) => Number.isFinite(x) && x >= 0 && x <= 1))) return null;
  const s = p.map((q) => [q[0], q[1]]).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < s.length; i++) if (s[i][0] - s[i - 1][0] < 1e-3) return null;
  return s;
}
const isIdent = (p) => p.length === 2 && p[0][0] === 0 && p[0][1] === 0 && p[1][0] === 1 && p[1][1] === 1;

/** A curve through `p` (x ascending, 0..1) at 256 steps: monotone cubic (Fritsch–Carlson),
 *  so it never overshoots between points; flat beyond the end points. */
export function curveTable(p, n = 256) {
  const out = new Float32Array(n), k = p.length;
  const d = [], m = new Array(k).fill(0);
  for (let i = 0; i < k - 1; i++) d.push((p[i + 1][1] - p[i][1]) / (p[i + 1][0] - p[i][0]));
  m[0] = d[0]; m[k - 1] = d[k - 2];
  for (let i = 1; i < k - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < k - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  for (let j = 0; j < n; j++) {
    const x = j / (n - 1);
    let y;
    if (x <= p[0][0]) y = p[0][1];
    else if (x >= p[k - 1][0]) y = p[k - 1][1];
    else {
      let i = 0; while (x > p[i + 1][0]) i++;
      const h = p[i + 1][0] - p[i][0], t = (x - p[i][0]) / h, t2 = t * t, t3 = t2 * t;
      y = (2 * t3 - 3 * t2 + 1) * p[i][1] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * p[i + 1][1] + (t3 - t2) * h * m[i + 1];
    }
    out[j] = Math.min(1, Math.max(0, y));
  }
  return out;
}
/** RGBA bytes, 256 x 1: red, green and blue channel curves, master curve in alpha. */
export function curveLUT(curves) {
  const t = [curves.r, curves.g, curves.b, curves.rgb].map((p) => curveTable(p || ident()));
  const d = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) for (let c = 0; c < 4; c++) d[i * 4 + c] = Math.round(t[c][i] * 255);
  return d;
}

export const ADJUST_GLSL = `
uniform float uAdjMix;        // the Colour tool's Opacity; 0 while it is hidden
uniform vec3  uAdjBC;         // brightness, contrast, on
uniform vec4  uAdjLevels;     // input black, input white, 1 / gamma, on
uniform vec2  uAdjLevelsOut;  // output black, output white
uniform float uAdjCurvesOn;
uniform sampler2D uAdjCurve;  // 256 x 1: red, green, blue curves, master in alpha
uniform vec4  uAdjExpo;       // stops, offset, 1 / gamma, on
uniform vec2  uAdjVib;        // vibrance, saturation
uniform vec4  uAdjHSL;        // hue (turns), saturation, lightness, on
uniform vec3  uAdjCBs;        // Color Balance: shadows, midtones, highlights (red, green, blue shifts)
uniform vec3  uAdjCBm;
uniform vec3  uAdjCBh;
uniform vec2  uAdjCB;         // on, preserve luminosity
uniform vec4  uAdjBW1;        // Black & White: reds, yellows, greens, on
uniform vec3  uAdjBW2;        // cyans, blues, magentas
uniform vec4  uAdjBWTint;     // tint colour's offset from grey, strength
uniform mat3  uAdjMixer;      // Channel Mixer, columns = input channels
uniform vec4  uAdjMixerC;     // constants, on

vec3 srgbToLinear3(vec3 c) {
  return mix(c / 12.92, pow((max(c, 0.0) + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
float adjLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float curveAt(float v, int ch) {
  vec4 t = texture(uAdjCurve, vec2(clamp(v, 0.0, 1.0) * (255.0 / 256.0) + 0.5 / 256.0, 0.5));
  return ch == 0 ? t.r : ch == 1 ? t.g : ch == 2 ? t.b : t.a;
}
// Black & White (the editor's formula): grey = min + (mid - min) x the weight of the
// secondary colour the two strongest channels make + (max - mid) x the strongest's own.
float bwGrey(vec3 c) {
  float r = c.r, g = c.g, b = c.b, mx, md, mn, wp, ws;
  if (r >= g && r >= b) { mx = r; wp = uAdjBW1.x; if (g >= b) { md = g; mn = b; ws = uAdjBW1.y; } else { md = b; mn = g; ws = uAdjBW2.z; } }
  else if (g >= b) { mx = g; wp = uAdjBW1.z; if (r >= b) { md = r; mn = b; ws = uAdjBW1.y; } else { md = b; mn = r; ws = uAdjBW2.x; } }
  else { mx = b; wp = uAdjBW2.y; if (g >= r) { md = g; mn = r; ws = uAdjBW2.x; } else { md = r; mn = g; ws = uAdjBW2.z; } }
  return clamp(mn + (md - mn) * ws + (mx - md) * wp, 0.0, 1.0);
}
vec3 adjustColour(vec3 c) {
  if (uAdjBC.z > 0.0) {
    if (uAdjBC.x != 0.0) c = pow(c, vec3(exp2(-uAdjBC.x)));
    if (uAdjBC.y > 0.0) c = mix(c, c * c * (3.0 - 2.0 * c), uAdjBC.y);
    else if (uAdjBC.y < 0.0) c = mix(c, vec3(0.5), -0.75 * uAdjBC.y);
  }
  if (uAdjLevels.w > 0.0) {
    c = clamp((c - uAdjLevels.x) / max(uAdjLevels.y - uAdjLevels.x, 1e-3), 0.0, 1.0);
    c = pow(c, vec3(uAdjLevels.z));
    c = mix(vec3(uAdjLevelsOut.x), vec3(uAdjLevelsOut.y), c);
  }
  if (uAdjCurvesOn > 0.0) {
    c = vec3(curveAt(c.r, 3), curveAt(c.g, 3), curveAt(c.b, 3));
    c = vec3(curveAt(c.r, 0), curveAt(c.g, 1), curveAt(c.b, 2));
  }
  if (uAdjExpo.w > 0.0) {
    vec3 l = max(srgbToLinear3(c) * exp2(uAdjExpo.x) + uAdjExpo.y, 0.0);
    c = clamp(linearToSrgb(pow(l, vec3(uAdjExpo.z))), 0.0, 1.0);
  }
  c = vibrance(c, uAdjVib.x);
  if (uAdjVib.y != 0.0) { float y = adjLuma(c); c = clamp(vec3(y) + (c - vec3(y)) * (1.0 + uAdjVib.y), 0.0, 1.0); }
  if (uAdjHSL.w > 0.0) {
    vec3 h = rgb2hsv(c);
    h.x = fract(h.x + uAdjHSL.x);
    h.y = clamp(uAdjHSL.y > 0.0 ? h.y + (1.0 - h.y) * h.y * uAdjHSL.y * 1.5 : h.y * (1.0 + uAdjHSL.y), 0.0, 1.0);
    c = hsv2rgb(h);
    c = uAdjHSL.z > 0.0 ? mix(c, vec3(1.0), uAdjHSL.z) : c * (1.0 + uAdjHSL.z);
  }
  if (uAdjCB.x > 0.0) {
    // Tone weights as GIMP's Color Balance makes them, by lightness.
    float l = 0.5 * (max(c.r, max(c.g, c.b)) + min(c.r, min(c.g, c.b))), y0 = adjLuma(c);
    float ws = clamp((l - 0.333) / -0.25 + 0.5, 0.0, 1.0) * 0.7;
    float wm = clamp((l - 0.333) / 0.25 + 0.5, 0.0, 1.0) * clamp((l + 0.333 - 1.0) / -0.25 + 0.5, 0.0, 1.0) * 0.7;
    float wh = clamp((l + 0.333 - 1.0) / 0.25 + 0.5, 0.0, 1.0) * 0.7;
    c = clamp(c + uAdjCBs * ws + uAdjCBm * wm + uAdjCBh * wh, 0.0, 1.0);
    if (uAdjCB.y > 0.0) c = clamp(c + (y0 - adjLuma(c)), 0.0, 1.0);
  }
  if (uAdjBW1.w > 0.0) {
    float g = bwGrey(c);
    c = clamp(vec3(g) + uAdjBWTint.rgb * uAdjBWTint.a * 4.0 * g * (1.0 - g), 0.0, 1.0);
  }
  if (uAdjMixerC.w > 0.0) c = clamp(uAdjMixer * c + uAdjMixerC.rgb, 0.0, 1.0);
  return c;
}`;

// Upload the adjustments' uniforms; `lut(curves)` keeps the curve texture current.
let fallback = null;
export function setAdjustUniforms(gl, u, state, lut, off) {
  const a = state.adjust || (fallback ||= adjustDefaults()), on = (k) => !!a[k]?.on;
  gl.uniform1f(u.uAdjMix, a.on && !off ? Math.min(1, Math.max(0, a.opacity ?? 1)) : 0);
  const bc = a.brightness, lv = a.levels, ex = a.exposure, hs = a.hueSat, cb = a.balance, bw = a.bw, mx = a.mixer;
  gl.uniform3f(u.uAdjBC, bc.brightness, bc.contrast, on('brightness') && (bc.brightness || bc.contrast) ? 1 : 0);
  const lvOn = on('levels') && (lv.inBlack !== 0 || lv.inWhite !== 1 || lv.gamma !== 1 || lv.outBlack !== 0 || lv.outWhite !== 1);
  gl.uniform4f(u.uAdjLevels, lv.inBlack, lv.inWhite, 1 / lv.gamma, lvOn ? 1 : 0);
  gl.uniform2f(u.uAdjLevelsOut, lv.outBlack, lv.outWhite);
  const cvOn = on('curves') && !CURVE_CH.every((c) => isIdent(a.curves[c]));
  gl.uniform1f(u.uAdjCurvesOn, cvOn ? 1 : 0);
  if (cvOn) lut(a.curves);
  gl.uniform4f(u.uAdjExpo, ex.exposure, ex.offset, 1 / ex.gamma, on('exposure') && (ex.exposure || ex.offset || ex.gamma !== 1) ? 1 : 0);
  const vOn = on('vibrance');
  gl.uniform2f(u.uAdjVib, vOn ? Math.min(1, Math.max(-1, state.vibrance ?? 0)) : 0, vOn ? a.vibrance.saturation : 0);
  gl.uniform4f(u.uAdjHSL, hs.hue / 360, hs.saturation, hs.lightness, on('hueSat') && (hs.hue || hs.saturation || hs.lightness) ? 1 : 0);
  gl.uniform3f(u.uAdjCBs, cb.sCR, cb.sMG, cb.sYB); gl.uniform3f(u.uAdjCBm, cb.mCR, cb.mMG, cb.mYB); gl.uniform3f(u.uAdjCBh, cb.hCR, cb.hMG, cb.hYB);
  const cbOn = on('balance') && ['s', 'm', 'h'].some((t) => cb[t + 'CR'] || cb[t + 'MG'] || cb[t + 'YB']);
  gl.uniform2f(u.uAdjCB, cbOn ? 1 : 0, cb.preserve ? 1 : 0);
  gl.uniform4f(u.uAdjBW1, bw.reds / 100, bw.yellows / 100, bw.greens / 100, on('bw') ? 1 : 0);
  gl.uniform3f(u.uAdjBW2, bw.cyans / 100, bw.blues / 100, bw.magentas / 100);
  const t = hueRGB(bw.tintHue), ty = 0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2];
  gl.uniform4f(u.uAdjBWTint, t[0] - ty, t[1] - ty, t[2] - ty, bw.tint ? bw.tintSat : 0);
  // Monochrome: every output is the red row, as the editor's Monochrome is.
  const row = (o) => (mx.mono ? 'r' : o);
  const m = [], c = [];
  for (const i of ['r', 'g', 'b']) for (const o of ['r', 'g', 'b']) m.push(mx[row(o) + i.toUpperCase()] / 100);
  for (const o of ['r', 'g', 'b']) c.push(mx[row(o) + 'C'] / 100);
  const ident3 = !mx.mono && m.every((v, k) => v === (k % 4 === 0 ? 1 : 0)) && c.every((v) => v === 0);
  gl.uniformMatrix3fv(u.uAdjMixer, false, new Float32Array(m));
  gl.uniform4f(u.uAdjMixerC, c[0], c[1], c[2], on('mixer') && !ident3 ? 1 : 0);
}
function hueRGB(h) {
  const k = (n) => { const x = (n + h / 60) % 6; return 1 - Math.max(0, Math.min(1, Math.min(x, 4 - x))); };
  return [k(5), k(3), k(1)];
}

// The eye button used on every hideable tool: an open eye while it shows.
const EYE_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><path d="M4 20L20 4"/></svg>';
/** An eye button; `get()` says whether the thing shows, `set(on)` changes it. In a summary
 *  a click on it never opens or closes the section. */
export function eyeButton(what, get, set) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'eye';
  const draw = () => { const on = !!get(); b.innerHTML = on ? EYE_ON : EYE_OFF; b.classList.toggle('off', !on); b.setAttribute('aria-pressed', on); b.title = `${on ? 'Hide' : 'Show'} ${what}`; b.setAttribute('aria-label', b.title); };
  b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); set(!get()); draw(); b.dispatchEvent(new Event('change', { bubbles: true })); };
  b.sync = draw; draw();
  return b;
}

/** The adjustments' controls, into `box`. Returns sync() for undo / open. */
export function buildAdjustUI(box, { state, render }) {
  const syncs = [];
  const adj = () => state.adjust;
  for (const A of ADJUSTMENTS) {
    const d = document.createElement('details'); d.className = 'adj'; d.id = 'adj-' + A.key;
    const sum = document.createElement('summary'); sum.textContent = A.name;
    const eye = eyeButton(A.name, () => adj()[A.key].on, (on) => { adj()[A.key].on = on ? 1 : 0; d.classList.toggle('off', !on); render(); });
    sum.append(eye); d.append(sum);
    syncs.push(() => { eye.sync(); d.classList.toggle('off', !adj()[A.key].on); });
    const body = document.createElement('div'); body.className = 'adjBody'; d.append(body);
    // Moving a control of a hidden adjustment shows it.
    const touch = () => { if (!adj()[A.key].on) { adj()[A.key].on = 1; eye.sync(); d.classList.remove('off'); } if (!adj().on) { adj().on = 1; box.dispatchEvent(new Event('adjustshown')); } };
    let pick = null;
    if (A.groups) {
      const l = document.createElement('label'); l.className = 'selectRow'; l.textContent = A.key === 'balance' ? 'Tone' : 'Output channel';
      pick = document.createElement('select'); pick.id = `adj-${A.key}-group`;
      for (const [k, name] of A.groups) pick.add(new Option(name, k));
      l.append(pick); body.append(l);
    }
    const rows = [];
    for (const f of A.fields) {
      const [k, label, min, max, step, , fmt, group] = f;
      const id = A.key === 'vibrance' && k === 'vibrance' ? 'vibrance' : `adj-${A.key}-${k}`;
      const get = () => (id === 'vibrance' ? state.vibrance ?? 0 : adj()[A.key][k]);
      const set = (v) => { if (id === 'vibrance') state.vibrance = v; else adj()[A.key][k] = v; };
      if (isCheck(f)) {
        const l = document.createElement('label'); l.className = 'checkRow';
        const i = document.createElement('input'); i.type = 'checkbox'; i.id = id;
        i.onchange = () => { touch(); set(i.checked ? 1 : 0); render(); };
        l.append(i, ' ' + label); body.append(l);
        syncs.push(() => { i.checked = !!get(); });
        continue;
      }
      const row = document.createElement('div'); row.className = 'row'; if (group) row.dataset.group = group;
      row.innerHTML = `<label for="${id}">${label}</label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}"><output data-own></output>`;
      const i = row.querySelector('input'), out = row.querySelector('output');
      i.oninput = () => { touch(); set(+i.value); out.textContent = fmt(+i.value); render(); };
      row.ondblclick = (e) => { if (e.target === i) return; touch(); set(f[5]); i.value = f[5]; out.textContent = fmt(f[5]); render(); row.dispatchEvent(new Event('change', { bubbles: true })); };
      row.title = 'Double-click the name to reset';
      body.append(row); rows.push(row);
      syncs.push(() => { i.value = get(); out.textContent = fmt(get()); });
    }
    if (A.note) { const n = document.createElement('p'); n.className = 'note'; n.textContent = A.note; body.append(n); }
    if (pick) { const show = () => { for (const r of rows) r.hidden = r.dataset.group != null && r.dataset.group !== pick.value; }; pick.onchange = (e) => { e.stopPropagation(); show(); }; show(); }
    if (A.key === 'curves') curvesEditor(body, { state, render, touch, syncs });
    const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'adjReset'; reset.textContent = 'Reset';
    reset.onclick = () => {
      const def = adjustDefaults()[A.key]; def.on = adj()[A.key].on;
      adj()[A.key] = def; if (A.key === 'vibrance') state.vibrance = 0;
      for (const s of syncs) s(); render();
    };
    body.append(reset);
    box.append(d);
  }
  const sync = () => { for (const s of syncs) s(); };
  sync();
  return sync;
}

// Curves: drag points; click the line to add one; drag a point off the box (or double-click
// it) to remove it. One curve per channel, the master (RGB) first.
function curvesEditor(body, { state, render, touch, syncs }) {
  const l = document.createElement('label'); l.className = 'selectRow'; l.textContent = 'Channel';
  const ch = document.createElement('select'); ch.id = 'adj-curves-channel';
  for (const [k, name] of [['rgb', 'RGB'], ['r', 'Red'], ['g', 'Green'], ['b', 'Blue']]) ch.add(new Option(name, k));
  l.append(ch); body.append(l);
  const cv = document.createElement('canvas'); cv.className = 'curveBox'; cv.width = cv.height = 256; cv.id = 'adj-curves-box';
  cv.setAttribute('aria-label', 'Curve: drag points, click to add, drag out or double-click to remove');
  body.append(cv);
  const g = cv.getContext('2d');
  const pts = () => state.adjust.curves[ch.value];
  const COL = { rgb: '#ddd', r: '#ff6b6b', g: '#5fd47a', b: '#6ea8ff' };
  function draw() {
    const p = pts(), W = cv.width;
    g.clearRect(0, 0, W, W);
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(i * W / 4, 0); g.lineTo(i * W / 4, W); g.moveTo(0, i * W / 4); g.lineTo(W, i * W / 4); g.stroke(); }
    g.beginPath(); g.moveTo(0, W); g.lineTo(W, 0); g.stroke();
    const t = curveTable(p, W);
    g.strokeStyle = COL[ch.value]; g.lineWidth = 2; g.beginPath();
    for (let x = 0; x < W; x++) { const y = (1 - t[x]) * (W - 1); x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
    g.fillStyle = COL[ch.value];
    for (const [x, y] of p) { g.beginPath(); g.arc(x * (W - 1), (1 - y) * (W - 1), 5, 0, 7); g.fill(); }
  }
  const at = (e) => { const r = cv.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height))]; };
  const near = (q) => { const r = cv.getBoundingClientRect(); return pts().findIndex(([x, y]) => Math.hypot((x - q[0]) * r.width, (y - q[1]) * r.height) < 12); };
  let drag = -1, out = false;
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault(); touch();
    const q = at(e), p = pts();
    drag = near(q);
    if (drag < 0) { if (p.length >= 16) return; p.push(q); p.sort((a, b) => a[0] - b[0]); drag = p.indexOf(q); }
    cv.setPointerCapture(e.pointerId); out = false; draw(); render();
  });
  cv.addEventListener('pointermove', (e) => {
    if (drag < 0) return;
    const p = pts(), r = cv.getBoundingClientRect();
    const outside = e.clientX < r.left - 20 || e.clientX > r.right + 20 || e.clientY < r.top - 20 || e.clientY > r.bottom + 20;
    out = outside && p.length > 2;
    const q = at(e), lo = drag > 0 ? p[drag - 1][0] + 0.01 : 0, hi = drag < p.length - 1 ? p[drag + 1][0] - 0.01 : 1;
    p[drag] = [Math.min(hi, Math.max(lo, q[0])), q[1]];
    cv.classList.toggle('removing', out); draw(); render();
  });
  const up = () => { if (drag >= 0 && out) { pts().splice(drag, 1); draw(); render(); } drag = -1; out = false; cv.classList.remove('removing'); };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('dblclick', (e) => { const i = near(at(e)), p = pts(); if (i >= 0 && p.length > 2) { p.splice(i, 1); draw(); render(); cv.dispatchEvent(new Event('change', { bubbles: true })); } });
  ch.onchange = (e) => { e.stopPropagation(); draw(); };
  syncs.push(draw);
}
