// Auto: one Analyze button reads the photo (tone, clipping, colour, brightness across it, stroke
// contrast and direction), fits a texture depth, finds the best raking direction, and
// offers a grid of one-tap looks made for this image: the built-in lighting, graze and
// matched looks, and the user's own saved presets and projects, each adapted to it
// (key light on the side the photo was lit from, graze across the strokes, the fitted
// depth, exposure set so the render sits at the photo's brightness). One Strength
// slider mixes the picked look with the settings it replaced.
import { textureScore, fitDepth } from './texscore.js';
import { clipping, clippingOf, nearerSide } from './photocheck.js';

// Depth: the depth at which the relief adds RELIEF_GAIN to the render's stroke contrast,
// over the same render with almost no relief (DEPTH_FLAT mm), under a plain gallery light.
// Measured 10-15 at the depths the user settled on: the painting sample at 3.3 mm gains
// 1.21x, DSC_8382 at its lamp-fitted 2.1 mm 1.24x (render/photo contrast alone was 0.90
// and 1.53 there, so it cannot be the target: tone and exposure move it too much).
export const RELIEF_GAIN = 1.21, DEPTH_FLAT = 0.25, DEPTH_MIN = 0.3, DEPTH_MAX = 6;
// Brightness across the photo, as a plane, is only reported: on both samples it follows
// the painting (the red panel's light lower right, DSC_8382's right side), not the lamp,
// so the key light's side comes from the user's Photo was lit setting alone.
// Exposure: each look puts the render's mean brightness at the photo's times 2^bias.
// The biases are measured on the painting sample (10-15) so that there each look lands
// at the exposure it was made or approved at (Gallery 0, Matched 07 +0.6, Matched 05
// +0.35, Your favourite +0.04, the rest 0); on another photo the same offset from its own brightness holds.
// The three favourite looks' biases moved 10-19, when their fit stopped seeing the favourite's Pin
// light layer (a built-in look never applies it): the plain fit came out about 0.2 stops brighter on
// the painting sample, so each bias went down to where the looks still land at the exposures
// the user approved (-0.33, -0.14, -0.28 there).
// albedoSuppress (De-light) 0, not the default 0.7: measured on the red panel (10-15) the
// default keeps 0.43 of the photo's fine detail per unit brightness (photo 0.74), 0.4 keeps 0.63,
// 0 keeps 0.92. The user found 0.7 "a bit blurry"; of 0.7 / 0.4 / 0 they picked 0 (10-16).
export const CRISP = { neutralWB: 0.6, vibrance: 0.4, strokeDef: 0.5, albedoSuppress: 0 };
// Keyed by the look's id (BUILT_IN), which stays when a name changes; every built-in look must
// have one (a missing bias is an error, not 0).
export const LOOK_BIAS = { 'gallery': -1.03, 'gallery-spot': -1.48, 'matched': -1.18, 'matched-raking': -1.28, 'favourite': -0.76, 'favourite-left': -0.75, 'favourite-side-lamp': -0.78, 'raking-texture': -0.8, 'long-shadows': -0.56, 'soft-window': -0.83, 'museum-spot': -1.75 };
// Each built-in look's recipe version, raised whenever its recipe changes, so a record or a pick
// says which recipe made a picture. favourite-left / -side-lamp: 1 round F1 (10-19), 2 round 2
// keepers (deeper, lamp low near the edge), 3 round 3 keepers (raking 6°, finer detail, 10-20),
// 4 round 4 (raking 6° with the old smoothing, 10-21), 5 round 5 (softer: side lamp graze detail
// 0.03, from the left fine relief without the ×1.4, 10-21).
export const LOOK_VERSION = { 'favourite-left': 5, 'favourite-side-lamp': 5 };
const THUMB_W = 240;
// Settings the G-buffer is built from; a look that changes any of them rebuilds it.
const SURFACE = ['reliefScale', 'azimuthDeg', 'integrateTaps', 'reliefStrength', 'chromaReject', 'albedoSuppress', 'fineRelief', 'mediumRelief', 'broadRelief',
  'neutralize', 'photoDiffuse', 'textureDepthMm', 'paintingWidthCm', 'physical', 'heightScale', 'reliefAmount', 'shadowDetail', 'strokeDef', 'strokeSize', 'strokeDir'];
// Belong to the photo, not to a look: a saved preset or project never changes them here.
const IMAGE_KEYS = ['paintingWidthCm', 'photoDiffuse', 'azimuthDeg', 'physical', 'strokes'];
const SWITCH = ['layers', 'layersOn', 'adjust', 'overlays', 'fineHidden'];
const LIGHT_NUM = ['x', 'y', 'z', 'power', 'kelvin', 'cone', 'softness', 'size', 'aimX', 'aimY', 'lift', 'falloff', 'dark', 'patternSize', 'patternRot'];
const GRAZE_NUM = ['elevation', 'opacity', 'detail', 'fine', 'reach', 'clean', 'soft', 'lift', 'fill', 'grey'];
const COMPASS = ['right', 'upper right', 'top', 'upper left', 'left', 'lower left', 'bottom', 'lower right'];
const compass = (deg) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
const clone = (x) => structuredClone(x);
const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/** Mix two settings snapshots: s = 0 is `a`, 1 is `b`. Numbers move in a straight line,
 *  lights pair up by place (a light only one side has fades in or out by its power), the
 *  graze light the same way, layers switch at half, brush corrections stay `a`'s. */
export function mixSettings(a, b, s, applyColor = () => {}) {
  if (s >= 1) return clone(b);
  if (s <= 0) return clone(a);
  const out = clone(b);
  for (const k of Object.keys(b)) {
    const x = a[k], y = b[k];
    if (typeof x === 'number' && typeof y === 'number') out[k] = x + (y - x) * s;
  }
  if (typeof out.integrateTaps === 'number') out.integrateTaps = Math.round(out.integrateTaps);
  if (typeof out.roomKelvin === 'number') out.roomKelvin = Math.round(out.roomKelvin / 50) * 50;
  const A = a.lights || [], B = b.lights || [];
  out.lights = [];
  for (let i = 0; i < Math.max(A.length, B.length) && out.lights.length < 8; i++) {
    const p = A[i], q = B[i];
    let l;
    if (p && q) { l = clone(q); for (const k of LIGHT_NUM) { const x = p[k] ?? q[k], y = q[k] ?? p[k]; if (typeof x === 'number' && typeof y === 'number') l[k] = x + (y - x) * s; } }
    else if (q) l = { ...clone(q), power: q.power * s, ...(q.dark != null ? { dark: q.dark * s } : {}) };
    else l = { ...clone(p), power: p.power * (1 - s), ...(p.dark != null ? { dark: p.dark * (1 - s) } : {}) };
    applyColor(l); out.lights.push(l);
  }
  out.selected = 0;
  const ga = a.graze, gb = b.graze;
  if (ga && gb) {
    if (ga.enabled && gb.enabled) {
      const g = clone(gb);
      for (const k of GRAZE_NUM) if (typeof ga[k] === 'number' && typeof gb[k] === 'number') g[k] = ga[k] + (gb[k] - ga[k]) * s;
      const d = ((gb.angle - ga.angle) % 360 + 540) % 360 - 180;
      g.angle = ((Math.round((ga.angle + d * s) * 2) / 2) % 360 + 360) % 360;
      delete g.lamp;   // a calibrated lamp is one place, not a blend
      out.graze = g;
    } else if (gb.enabled) out.graze = { ...clone(gb), opacity: gb.opacity * s };
    else if (ga.enabled) out.graze = { ...clone(ga), opacity: ga.opacity * (1 - s) };
  }
  // Whole tools switch at half: layers, the Colour tool, overlays, Fine-tune's eye.
  for (const k of SWITCH) if (k in a || k in b) out[k] = clone(s < 0.5 ? a[k] : b[k]);
  out.strokes = clone(a.strokes || []);
  return out;
}

/** Brightness plane across RGBA bytes (w × h): mean linear luma and how much it changes
 *  from side to side, as a share of the mean, with the direction it rises towards (0° right,
 *  90° up). The centre 90% only, so a frame or wall at the edges counts less. */
export function lightPool(rgba, w, h) {
  let n = 0, su = 0, sv = 0, sl = 0, suu = 0, svv = 0, suv = 0, sul = 0, svl = 0;
  const x0 = Math.floor(w * 0.05), x1 = Math.ceil(w * 0.95), y0 = Math.floor(h * 0.05), y1 = Math.ceil(h * 0.95);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * w + x) * 4, L = 0.2126 * lin(rgba[i] / 255) + 0.7152 * lin(rgba[i + 1] / 255) + 0.0722 * lin(rgba[i + 2] / 255);
    const u = (x + 0.5) / w - 0.5, v = 0.5 - (y + 0.5) / h;
    n++; su += u; sv += v; sl += L; suu += u * u; svv += v * v; suv += u * v; sul += u * L; svl += v * L;
  }
  if (!n) return { mean: 0, strength: 0, deg: 0 };
  const mu = su / n, mv = sv / n, ml = sl / n;
  const cuu = suu / n - mu * mu, cvv = svv / n - mv * mv, cuv = suv / n - mu * mv, cul = sul / n - mu * ml, cvl = svl / n - mv * ml;
  const det = cuu * cvv - cuv * cuv || 1e-12, b = (cul * cvv - cvl * cuv) / det, c = (cvl * cuu - cul * cuv) / det;
  return { mean: ml, strength: ml > 1e-6 ? Math.hypot(b, c) / ml : 0, deg: (Math.atan2(c, b) * 180 / Math.PI + 360) % 360 };
}

/** Lights mirrored left to right when the brightest one is on the other side from `side`
 *  ('left' / 'right'); `null` leaves them as they are. Returns whether it mirrored. */
export function keySide(lights, side) {
  if (!side || !lights.length) return false;
  const lamps = lights.filter((l) => !l.kind || l.kind === 'light');
  if (!lamps.length) return false;
  const key = lamps.reduce((a, b) => (b.power > a.power ? b : a));
  const off = key.x - 0.5;
  if (Math.abs(off) < 0.05 || (side === 'right') === (off > 0)) return false;
  for (const l of lights) { l.x = 1 - l.x; if (l.aimX != null) l.aimX = 1 - l.aimX; }
  return true;
}
const mirrorAngle = (deg) => ((180 - deg) % 360 + 360) % 360;

export function initAuto({ state, api, before, snapshot, restore, checkpoint, setBatching, makeLight, lighting, grazePresets, looks, LOOK_KEYS, LOOK_NEUTRAL,
  findRaking, userPresets, presetSettings, userProjects, projectSettings, currentProject, unmasked, guard, compare }) {
  const $ = (id) => document.getElementById(id);
  const box = document.createElement('details'); box.className = 'sectionDetails'; box.id = 'autoSection'; box.open = true;
  box.innerHTML = `<summary>Auto · analyze and pick a look</summary><div class="grp">
    <div class="views"><button id="autoAnalyze" class="primary">Analyze</button><button id="autoUndo" title="Undo the last change ( Ctrl/Cmd Z )">↶ Undo</button></div>
    <p class="note" id="autoReadout">Reads this photo (brightness, clipping, colour, light, stroke contrast and direction) and makes a set of one-tap looks for it.</p>
    <div id="autoLooks" class="autoLooks" role="list"></div>
    <div class="views" id="autoCompareRow" hidden><button id="autoCompare" type="button">Compare full screen</button></div>
    <div class="row" id="autoStrengthRow"><label for="autoStrength">Strength</label><input id="autoStrength" type="range" min="0" max="1" step="0.01" value="1" disabled><output data-own>100%</output></div>
    <div class="row" id="autoOpacityRow" title="How much of the whole effect shows over the original photo (the same as Original on top in Layers, turned round)"><label for="autoOpacity">Opacity</label><input id="autoOpacity" type="range" min="0" max="1" step="0.01" value="1"><output data-own>100%</output></div>
    <p class="note" id="autoNote">Tap a look to use it; press and hold one to see it on the picture until you let go. Strength mixes it with the settings you had before (light, graze, tone); Opacity fades the whole effect into the original photo. Every slider stays in the other tools.</p></div>`;
  before.before(box);

  let A = null, active = null, running = false;
  const status = (t) => { $('autoReadout').textContent = t; };
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

  // The preview canvas, read back in the same task as its draw, scaled to `w` px wide.
  function grab(w = api.canvas.width, viewMode = 0) {
    const keep = { viewMode: state.viewMode, compareSplit: state.compareSplit };
    state.viewMode = viewMode; state.compareSplit = -1;
    try {
      api.renderNow();
      const c = document.createElement('canvas'); c.width = w; c.height = Math.max(1, Math.round(api.canvas.height * w / api.canvas.width));
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(api.canvas, 0, 0, c.width, c.height);
      return { canvas: c, data: x.getImageData(0, 0, c.width, c.height).data };
    } finally { Object.assign(state, keep); }
  }
  const mmPerPx = () => state.paintingWidthCm * 10 / api.canvas.width;
  const contrast = () => textureScore(grab().data, api.canvas.width, api.canvas.height, mmPerPx()).score;
  // Mean linear luma of the render's centre 90% (the light plane's mean), and the small copy it was read from.
  const meanOf = (viewMode = 0) => { const g = grab(THUMB_W, viewMode); return { mean: lightPool(g.data, g.canvas.width, g.canvas.height).mean, canvas: g.canvas }; };
  let surfaceKey = '';
  function put(settings) {
    Object.assign(state, clone(settings));
    const k = JSON.stringify(SURFACE.map((s) => state[s]));
    if (k !== surfaceKey) { surfaceKey = k; api.dirty(); }
  }
  // Exposure that puts the render's mean at the photo's, times 2^bias (stops); returns
  // the thumbnail of the render at the exposure it settles on.
  function fitExposure(bias) {
    const target = A.mean * 2 ** bias;
    for (let i = 0; i < 3; i++) {
      const m = meanOf();
      if (!(m.mean > 1e-5)) return m.canvas;
      const e = Math.max(-3, Math.min(3, Math.round((state.exposure + Math.log2(target / m.mean)) * 100) / 100));
      if (Math.abs(e - state.exposure) < 0.02) return keepWhites(m.canvas);
      state.exposure = e;
    }
    return keepWhites();
  }
  // The user (10-19): "be careful not to let the light source blow out the whites". A look
  // may clip no more than the photo itself does (+0.3% of the picture): step the exposure
  // down until it does not.
  // `canvas`: the thumbnail already rendered at the current exposure, if there is one.
  function keepWhites(canvas) {
    const allowed = (A.clip?.hi || 0) + 0.003;
    const read = (c) => c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
    let c = canvas || grab(THUMB_W).canvas;
    for (let i = 0; i < 8 && clipping(read(c)).hi > allowed && state.exposure > -3; i++) {
      state.exposure = Math.max(-3, Math.round((state.exposure - 0.1) * 100) / 100);
      c = grab(THUMB_W).canvas;
    }
    return c;
  }

  // Built-in looks: [id, name, note, make(settings)]. Each starts from the
  // analysed base and its own lighting; the key light goes to the photo's lit side.
  const scene = (s, name) => { const sc = lighting[name]; s.lights = sc.lights.map(makeLight); s.ambient = sc.ambient; for (const k of ['shadow', 'shadowSoftness', ...Object.keys(LOOK_NEUTRAL)]) if (k in sc) s[k] = sc[k]; };
  const neutral = (s) => { Object.assign(s, LOOK_NEUTRAL); s.graze.enabled = false; };
  // The colour and stroke settings of the user's matched looks (round 1: greys 60%,
  // vibrance 40%, strokes 50%). Without them the gallery and graze looks read hazy and
  // soft beside the matched ones (the user, 10-15: "blurry"); measured on the red panel
  // they sharpen stroke edges and take off the lamps' colour cast.
  const crisp = (s) => Object.assign(s, CRISP);
  const graze = (s, preset, opacity) => { Object.assign(s.graze, grazePresets[preset], { enabled: true, angle: A.rake, grey: 0 }); if (opacity != null) s.graze.opacity = opacity; delete s.graze.lamp; };
  const look = (s, name, rake) => { const k = looks[name]; s.lights = k.lights.map(makeLight); for (const key of LOOK_KEYS) if (key in k) s[key] = clone(k[key]);
    if (k.graze) { Object.assign(s.graze, k.graze, { enabled: true }); if (rake) s.graze.angle = A.rake; delete s.graze.lamp; } else s.graze.enabled = false; };
  // Shadow lift 0.6, not the favourite's 0.3: the user (10-19) found the darks crushed; on the
  // red-lintel door it takes black clipping from 1.04% to 0.29% (photo 0.17%), whites unchanged.
  // Round 3 (10-20): the user kept "raking light lower (6°)" and "finer raking detail" on both
// looks (L08, L12, F03, F07): elevation 8 → 6, graze detail 0.02 → 0.01 (about 16 → 8 px of
// smoothing at full size, the likely source of the "motion blur"), fine 0.15 → 0.5.
// Round 4 (10-21): together the finer detail read as too much high-frequency sharpness; the user
// kept the lower light with the old smoothing (L02): detail 0.02, fine 0.15 again, elevation 6.
// Round 5 (10-21), softer per look: the side lamp kept its raking light smoothed a little more
// (L04: detail 0.03); from the left kept the relief's fine detail without round 2's ×1.4 (F03).
// Less raking fine texture (0.05) read as blurry (F02).
const crispGraze = (s, angle, detail = 0.02) => Object.assign(s.graze, { enabled: true, angle, reach: 0.4, soft: 0.1, elevation: 6, lift: 0.6, detail, fine: 0.15 });
  // Round 2 (10-19): the user kept "deeper relief + crisper texture" on both favourite looks
  // (A11, A15: Colour › Relief 150%, Fine detail 140%). Built-in looks do not carry the Colour
  // tool, so the same is made with the look's own settings: texture depth × 1.65 (over the depth
  // fitted to this photo) and fine relief × 1.4; on the painting sample that is within 2.0 of 255
  // RMS of the Colour-tool version (depth × 1.5 alone: 5.2).
  // (At most 10 mm, the Texture depth slider's top.)
  const deeper = (s, fine = 1.4) => { s.textureDepthMm = Math.min(10, Math.round(s.textureDepthMm * 1.65 * 100) / 100); s.fineRelief *= fine; };
  const BUILT_IN = [
    ['gallery', 'Gallery', 'Even gallery track light', (s) => { neutral(s); scene(s, 'Gallery track'); crisp(s); }],
    ['gallery-spot', 'Gallery spot', 'One warm spot, greys kept neutral, strokes defined', (s) => { neutral(s); scene(s, 'Gallery spot, upper right'); }],
    ['matched', 'Matched', 'Matched look 07 (the brightest pick)', (s) => { neutral(s); look(s, 'Brighter (07)'); }],
    ['matched-raking', 'Matched + raking', 'Matched look 05, its graze across the strokes', (s) => { neutral(s); look(s, 'Raking graze (05)', true); }],
    ['favourite', 'Your favourite', 'Your own look (10-16): gallery lamp, low raking graze', (s) => { neutral(s); look(s, 'Your favourite (10-16)', true); }],
    // The user's keepers from round F1 (10-19, tools/looks/favourite-variants.json 04 and 11):
    // Your favourite with a crisp graze (short, hard-edged shadows; the long soft one read as
    // motion blur), lit from the left.
    // Round 2 keepers folded in: deeper relief + crisper texture on both, and on the side lamp
    // the lamp lower on the wall (B02: y 0.4) and nearer the painting's edge (B04: x -0.05).
    ['favourite-left', 'Favourite, from the left', 'Your favourite with a crisp raking light from the left, deeper relief', (s) => { neutral(s); look(s, 'Your favourite (10-16)'); crispGraze(s, 170); deeper(s, 1); }],
    ['favourite-side-lamp', 'Favourite, side lamp left', 'Your favourite with the lamp low on the left, near the edge, a crisp raking light, deeper relief', (s) => { neutral(s); look(s, 'Your favourite (10-16)'); crispGraze(s, 175, 0.03); deeper(s); Object.assign(s.lights[0], { x: -0.05, y: 0.4, z: 0.6 }); }],
    ['raking-texture', 'Raking texture', 'Gallery light plus Classic raking across the strokes', (s) => { neutral(s); scene(s, 'Gallery track'); graze(s, 'Classic raking', 0.5); crisp(s); }],
    ['long-shadows', 'Long shadows', 'Clean long graze shadows over a gallery light', (s) => { neutral(s); scene(s, 'Gallery track'); graze(s, 'Long shadows, clean surface', 0.6); crisp(s); }],
    ['soft-window', 'Soft window', 'Big soft daylight from the side', (s) => { neutral(s); scene(s, 'Soft window'); crisp(s); }],
    ['museum-spot', 'Museum spot', 'A tight spot, darker room', (s) => { neutral(s); scene(s, 'Museum spotlight'); crisp(s); }],
  ];

  // A saved preset or project on this image: its tone, colour and lighting relations kept;
  // depth, graze direction, key side and exposure re-derived; the photo's own keys kept.
  function adapted(base, settings) {
    const s = { ...clone(base), ...clone(settings) };
    for (const k of IMAGE_KEYS) s[k] = clone(base[k]);
    if (Array.isArray(s.layers)) s.layers = unmasked(s.layers);
    if (!A.measured) s.textureDepthMm = A.depth;
    if (s.graze?.enabled) { s.graze.angle = A.rake; delete s.graze.lamp; }
    return s;
  }

  async function analyze() {
    if (running || state.exporting || !api.source() || state.mode !== 'single') { if (state.mode !== 'single') status('Auto works on a single photograph.'); return; }
    running = true; setBatching(true); $('autoAnalyze').disabled = true;
    const base = snapshot(), t0 = performance.now();
    surfaceKey = '';
    try {
      status('Reading the photo…'); await frame();
      // Photo: tone and brightness across it from the preview's original view, clipping from the full photo.
      put(base);
      const ph = grab(api.canvas.width, 4), pool = lightPool(ph.data, ph.canvas.width, ph.canvas.height);
      const d = ph.data, ys = [];
      let sat = 0;
      for (let i = 0; i < d.length; i += 16) { const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b); ys.push(0.2126 * r + 0.7152 * g + 0.0722 * b); sat += mx ? (mx - Math.min(r, g, b)) / mx : 0; }
      ys.sort((a, b) => a - b);
      const q = (p) => ys[Math.min(ys.length - 1, Math.floor(p * ys.length))] / 255;
      const clip = clippingOf(api.source());
      const photoScore = textureScore(ph.data, api.canvas.width, api.canvas.height, mmPerPx()).score;
      // The key light goes to the side the user says the photo was lit from, else each look keeps its own.
      const litDeg = base.photoDiffuse < 0.5 ? base.azimuthDeg : null, litFrom = litDeg == null ? 'even' : 'set';
      const cx = litDeg == null ? 0 : Math.cos(litDeg * Math.PI / 180);
      const side = Math.abs(cx) < 0.26 ? null : cx > 0 ? 'right' : 'left';
      A = { mean: meanOf(4).mean, p05: q(0.05), p50: q(0.5), p95: q(0.95), sat: sat / ys.length, clip, pool, photoScore, litDeg, litFrom, side };

      // Depth, under a plain gallery light on the base's texture settings.
      const ref = clone(base);
      neutral(ref); scene(ref, 'Gallery track'); Object.assign(ref, { exposure: 0, layers: [], originalTop: 0, physical: 1 });
      // Measuring (depth, raking, exposure) sees the lighting alone: the Colour tool and
      // overlays (grain would read as texture) off. Thumbnails show them.
      const plain = (x) => ({ ...x, adjust: x.adjust && { ...x.adjust, on: 0 }, overlays: x.overlays && { ...x.overlays, on: 0 } });
      const dressed = (x) => (x.adjust?.on && x.adjust.opacity > 0) || (x.overlays?.on && Object.values(x.overlays).some((o) => o?.on));
      const m = api.measured?.get?.();
      A.measured = !!(m?.on && m.w === api.canvas.width && m.h === api.canvas.height);
      if (A.measured) { A.depth = base.textureDepthMm; A.depthWhy = 'measured relief (lamp photos)'; }
      else {
        status('Fitting texture depth…'); await frame();
        const at = (depth) => { put(plain({ ...ref, textureDepthMm: depth })); return contrast(); };
        const flat = at(DEPTH_FLAT);
        const fit = await fitDepth(async (depth) => at(depth) / (flat * RELIEF_GAIN), { lo: DEPTH_FLAT, hi: 8, steps: 3 });
        A.depth = Math.round(Math.max(DEPTH_MIN, Math.min(DEPTH_MAX, fit.depth)) * 20) / 20;
        A.depthWhy = fit.reached === 'yes' ? `relief adds ${Math.round((RELIEF_GAIN - 1) * 100)}% stroke contrast` : fit.reached === 'high' ? 'relief barely shows even deep; kept moderate' : 'relief shows strongly even shallow';
        A.flatScore = flat;
      }
      ref.textureDepthMm = A.depth;
      // Raking direction: across, along or diagonal to the strokes, whichever shows them most,
      // on the key light's side.
      status('Finding the raking direction…'); await frame();
      put(plain(ref)); Object.assign(state.graze, grazePresets['Classic raking'], { grey: 0 }); delete state.graze.lamp;
      const sideDeg = side === 'right' ? 45 : side === 'left' ? 135 : (base.graze?.angle ?? 135);
      const rk = findRaking(sideDeg);
      A.rake = rk ? rk.best.from : sideDeg; A.strokes = rk;
      if (side && rk && (side === 'right') !== (Math.cos(A.rake * Math.PI / 180) > 0) && Math.abs(Math.cos(A.rake * Math.PI / 180)) > 0.26) A.rake = mirrorAngle(A.rake);

      // Looks: built-in, then the user's presets and projects.
      const items = [];
      // A built-in look keeps the user's own layers when picked (pick()), so it is made and fitted
      // with those: the favourite's Pin light layer used to light its thumbnail and exposure fit,
      // then was dropped from the picture (found 10-19).
      const ownLayers = { layers: clone(base.layers ?? []), layersOn: base.layersOn, originalTop: base.originalTop ?? 0 };
      for (const [id, name, note, make] of BUILT_IN) {
        if (!(id in LOOK_BIAS)) throw new Error(`Look ${id} has no exposure bias (LOOK_BIAS).`);
        const s = clone(ref); s.exposure = 0; make(s); Object.assign(s, clone(ownLayers));
        items.push({ id, version: LOOK_VERSION[id] || 1, name, note, bias: LOOK_BIAS[id], settings: s, kind: 'built-in' });
      }
      try { for (const p of (await userPresets()).slice(0, 8)) items.push({ name: p.name, note: 'Your preset, adapted to this photo', settings: adapted(ref, presetSettings(p)), kind: 'preset' }); } catch { /* storage off */ }
      try {
        const rows = (await userProjects()).filter((p) => p.id !== currentProject()).sort((a, b) => b.updated - a.updated).slice(0, 6);
        for (const p of rows) { try { items.push({ name: p.name, note: 'Your project’s look, adapted to this photo', settings: adapted(ref, projectSettings(p)), kind: 'project' }); } catch { /* not a valid project */ } }
      } catch { /* storage off */ }
      for (const it of items) if (it.settings.lights.length) { keySide(it.settings.lights, side); for (const l of it.settings.lights) api.applyColor(l); }
      // A graze set at a fixed angle (the favourites' crisp graze from the left) follows the key
      // light to the photo's lit side, as the lamps do.
      for (const { settings: { graze: g } } of items) {
        const c = g?.enabled ? Math.cos(g.angle * Math.PI / 180) : 0;
        if (side && Math.abs(c) > 0.26 && (side === 'right') !== (c > 0)) g.angle = mirrorAngle(g.angle);
      }
      // Made in an order that shares G-buffer builds; shown in the order above. Built-in
      // looks fit their exposure; a saved look keeps its own, moved by as much as the
      // Gallery look's fit moved from 0 on this photo (how much brighter or darker it needs).
      const order = items.map((it, i) => [JSON.stringify(SURFACE.map((k) => it.settings[k])), it.kind !== 'built-in', i]).sort((a, b) => (a[1] - b[1]) || a[0].localeCompare(b[0]) || a[2] - b[2]);
      let shift = 0;
      for (const [n, [, , i]] of order.entries()) {
        const it = items[i], s = it.settings;
        status(`Making looks: ${n + 1} of ${items.length} · ${it.name}`); await frame();
        put(plain(s));
        if (it.kind === 'built-in') { it.thumb = fitExposure(it.bias); if (it.id === 'gallery') shift = state.exposure; }
        else { state.exposure = Math.max(-3, Math.min(3, Math.round(((s.exposure ?? 0) + shift) * 100) / 100)); it.thumb = grab(THUMB_W).canvas; }
        s.exposure = state.exposure;
        if (dressed(s)) { put(s); it.thumb = grab(THUMB_W).canvas; }
      }
      A.items = items; A.base = base; A.ms = Math.round(performance.now() - t0);
      active = null; drawLooks(); readout();
    } catch (e) { A = null; active = null; drawLooks(); status('Analyze failed: ' + e.message); }
    finally {
      restore(clone(base)); api.dirty(); setBatching(false); api.render();
      running = false; $('autoAnalyze').disabled = false;
    }
  }

  function readout() {
    const pct = (v) => `${Math.round(v * 100)}%`, a = A, rk = a.strokes;
    const lit = a.litFrom === 'set' ? `lit from the ${compass(a.litDeg)} (your Photo was lit setting)`
      : `taken as evenly lit (set Photo was lit if not); ${a.pool.strength < 0.1 ? 'brightness even across it' : `${pct(a.pool.strength)} brighter toward the ${compass(a.pool.deg)}, from the light or the paint`}`;
    const how = !rk ? '' : rk.coherence < 0.1 ? 'every way' : rk.coherence < 0.3 ? `mostly at ${Math.round(rk.strokeDeg)}°` : `strongly at ${Math.round(rk.strokeDeg)}°`;
    const clip = a.clip.hi > 0.005 || a.clip.lo > 0.005 ? `, ${pct(a.clip.hi)} blown, ${pct(a.clip.lo)} crushed` : ', no clipping';
    const el = $('autoReadout'); el.textContent = '';
    for (const [k, v] of [['Tone', `shadows ${pct(a.p05)}, mid ${pct(a.p50)}, highlights ${pct(a.p95)}${clip}, colour ${pct(a.sat)} saturated`], ['Light', lit],
      ['Strokes', `contrast ${(a.photoScore * 100).toFixed(1)}%, running ${how || 'unknown'}; graze from ${Math.round(a.rake)}° (${compass(a.rake)})`],
      ['Depth', `${a.depth.toFixed(2)} mm (${a.depthWhy})`], ['Looks', `${a.items.length}, made in ${(a.ms / 1000).toFixed(1)} s`]]) {
      const line = document.createElement('span'); line.className = 'autoLine'; const b = document.createElement('b'); b.textContent = k + ' '; line.append(b, v); el.append(line);
    }
  }

  function drawLooks() {
    const grid = $('autoLooks'); grid.textContent = '';
    for (const [i, it] of (A?.items || []).entries()) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'autoLook' + (it.kind !== 'built-in' ? ' mine' : '') + (active?.index === i ? ' on' : '');
      b.setAttribute('role', 'listitem'); b.title = `${it.note}. Exposure ${it.settings.exposure > 0 ? '+' : ''}${it.settings.exposure.toFixed(2)}`;
      b.append(it.thumb); const span = document.createElement('span'); span.textContent = it.name; b.append(span);
      b.onclick = () => { if (held?.shown) { held = null; return; } pick(i); };
      b.addEventListener('pointerdown', (e) => { if (e.button === 0) holdStart(i, b); });
      for (const k of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(k, holdEnd);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      grid.append(b);
    }
    $('autoCompareRow').hidden = !A?.items?.length || !compare;
  }
  // Press and hold a look: the picture shows it until the press ends, then goes back as it was
  // (no undo step, nothing kept). A short tap still picks it.
  let held = null;
  const HOLD_MS = 350;
  function holdStart(i, b) {
    if (!A || running || state.exporting) return;
    holdEnd();
    held = { i, b, timer: setTimeout(() => {
      if (!held || running || state.exporting) return;
      held.keep = snapshot(); held.shown = true; b.classList.add('held');
      // Guarded as a tap would be, so it shows what a tap gives (nothing goes in the undo history).
      restore(targetFor(i, held.keep)); api.dirty(); guard?.()?.preview?.(); api.render();
      $('autoNote').textContent = `Showing ${A.items[i].name} while you hold. Let go to go back; tap to use it.`;
    }, HOLD_MS) };
  }
  function holdEnd() {
    if (!held) return;
    clearTimeout(held.timer);
    if (!held.shown) { held = null; return; }
    if (held.keep) { restore(held.keep); api.dirty(); api.render(); held.keep = null; held.b.classList.remove('held'); }
    // `held` stays (shown) until the click that ends the press arrives, so it does not pick.
    setTimeout(() => { held = null; }, 400);
  }
  $('autoCompare').onclick = async () => {
    const b = $('autoCompare'); if (b.disabled) return;
    b.disabled = true;
    try { await compare?.((m) => { $('autoNote').textContent = m; }); } finally { b.disabled = false; }
  };

  // Look i as made for this photo, put on `from`: the photo's own keys (width, Photo was lit, brush
  // corrections) as they are in `from`; built-in looks keep its layers, Colour tool and overlays,
  // a saved preset or project brings its own.
  function targetFor(i, from) {
    const it = A.items[i], target = clone(it.settings);
    for (const k of IMAGE_KEYS) if (k in from && k !== 'physical') target[k] = clone(from[k]);   // looks use calibrated depth
    if (it.kind === 'built-in') { for (const k of ['layers', 'layersOn', 'adjust', 'overlays', 'fineHidden']) if (k in from) target[k] = clone(from[k]); target.originalTop = from.originalTop ?? 0; }
    return target;
  }
  // Picking: the look is mixed with the settings it replaces. Tapping another look keeps
  // the same starting point, unless the settings were changed by hand since.
  function pick(i) {
    if (!A || running || state.exporting) return;
    const now = JSON.stringify(snapshot());
    const from = active && now === active.applied ? active.from : JSON.parse(now);
    const target = targetFor(i, from);
    active = { index: i, from, target, applied: '' };
    $('autoStrength').disabled = false; $('autoStrength').value = 1;
    apply(1); checkpoint();
    // A tapped look is guarded like any one-tap change (guard.js), in the same undo step.
    const g = guard?.()?.afterOneTap();
    active.applied = JSON.stringify(snapshot());
    if (g?.fixed) $('autoNote').textContent += ` ${g.note}`;
  }
  function apply(s) {
    restore(mixSettings(active.from, active.target, s, api.applyColor));
    active.applied = JSON.stringify(snapshot());
    $('autoStrength').nextElementSibling.textContent = `${Math.round(s * 100)}%`;
    drawLooks();
    $('autoNote').textContent = `${A.items[active.index].name}: ${A.items[active.index].note}.`;
  }
  $('autoStrength').oninput = (e) => { if (active) apply(+e.target.value); };
  // Opacity of the whole effect over the photo: Original on top (Layers), turned round.
  $('autoOpacity').oninput = (e) => {
    state.originalTop = Math.round((1 - +e.target.value) * 100) / 100;
    e.target.nextElementSibling.textContent = `${Math.round(e.target.value * 100)}%`;
    const ot = $('originalTop'); if (ot) { ot.value = state.originalTop; ot.nextElementSibling.textContent = `${Math.round(state.originalTop * 100)}%`; }
    api.render();
  };
  // The analysis as plain JSON (thumbnails as small JPEGs), and back: tools cache it on
  // disk per photo, so a second Analyze of the same photo and settings is instant.
  function save() {
    if (!A) return null;
    const strokes = A.strokes && (({ hm, ...rest }) => rest)(A.strokes);   // not the heightmap (tens of MB)
    return { ...clone({ ...A, strokes, items: [] }), items: A.items.map(({ thumb, ...it }) => ({ ...clone(it), thumb: thumb.toDataURL('image/jpeg', 0.8) })) };
  }
  async function load(saved) {
    if (running) throw new Error('Analyze is running.');
    const items = await Promise.all(saved.items.map(async ({ thumb, ...it }) => {
      const im = new Image(); im.src = thumb; await im.decode();
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0);
      return { ...clone(it), thumb: c };
    }));
    A = { ...clone({ ...saved, items: [] }), items }; active = null;
    $('autoStrength').disabled = true; drawLooks(); readout();
  }
  $('autoAnalyze').onclick = () => analyze();
  $('autoUndo').onclick = () => $('undo').click();
  // A new photo makes the looks stale.
  document.addEventListener('digilight:source', (e) => {
    if (e.detail?.keep) return;
    A = null; active = null; drawLooks(); $('autoStrength').disabled = true;
    status('New photo: Analyze to make looks for it.');
  });
  return { analyze, save, load, pick, targetFor, get analysis() { return A; }, get active() { return active; }, setStrength: (s) => { if (active) { $('autoStrength').value = s; apply(s); } } };
}
