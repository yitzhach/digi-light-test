// sceneui.js — the Scene tool: what the picture shows (its image type, with what the photo
// itself suggests), one-tap light scenes made for it, what to relight, the shape of its space,
// how much of the photo's own light to take out, and the effects (fx.js).
//
// Artwork is the painting relighter as it always was. Photo, Portrait, Room · booth and Object
// read the photo's space (scene.js) and light it as a space: a light near the subject is nearer
// the face than the wall, the subject throws its shadow across what is behind it, the far parts
// can sit in haze. Choosing a type opens on its usual light scene; any other is one tap away.
import { SCENE_TYPES, SCENE_FIELDS, SCENE_APPLY, sceneDefaults, sceneActive } from './scene.js';
import { scenesFor, lightScene, DEFAULT_SCENE } from './scenelights.js';
import { buildFxUI, FX } from './fx.js';
import { lightPool } from './auto.js';

export const TYPE_NAMES = { artwork: 'Artwork', photo: 'Photo', portrait: 'Portrait', room: 'Room · booth', object: 'Object' };
const TYPE_NOTES = {
  artwork: 'A painting or a flat piece photographed square on: lit as a surface with paint relief (Quick setup, Light, Graze).',
  photo: 'A photograph of a place: ground coming toward you, sky far away and kept as it shone.',
  portrait: 'People: the figure rounded and standing in front of its backdrop, which takes its shadow.',
  room: 'A room or an art fair booth seen from its open side: back wall, side walls, floor; what stands on the floor comes forward, paintings stay on the walls.',
  object: 'A piece, a sculpture or a product standing on a floor in front of a wall.',
};
const SHOWN = { depth: 'all', roundness: 'all', form: 'all', gap: 'all', delight: 'all', detail: 'all', keepSky: 'photo' };
const APPLY_NAMES = { all: 'Everything', subject: 'Subject only', background: 'Background only' };
const THUMB_W = 160;
const pct = (v) => `${Math.round(v * 100)}%`;
const FORMAT = { depth: (v) => `${v.toFixed(2)} w`, roundness: pct, form: pct, gap: pct, delight: pct, detail: pct, keepSky: pct };
const TITLES = {
  depth: 'How deep the space is, front to back, in picture widths: how far shadows are thrown and how fast light falls off into the background.',
  roundness: 'How rounded the subject is: 0 a cut-out, 100% a body (a disc becomes a hemisphere).',
  form: 'Shape read from the photo\'s shading: lighter parts of the subject forward, darker back.',
  gap: 'How far the subject stands in front of what is behind it (a share of Depth), where it does not stand on a visible floor.',
  delight: 'How much of the light the photo was taken in is taken out before the new lights fall: 0 keeps it, 100% evens it out.',
  detail: 'Relief of the surfaces themselves (skin, cloth, plaster, paint) that the lights shade.',
  keepSky: 'The sky as photographed: it shines by itself, so the new lights do not change it.',
};

export function initSceneUI({ state, api, after, checkpoint, oneTap, snapshot, restore, setBatching }) {
  const $ = (id) => document.getElementById(id);
  const box = document.createElement('details'); box.className = 'sectionDetails'; box.id = 'sceneSection'; box.open = true;
  box.innerHTML = `<summary>Scene · photos, people, rooms</summary><div class="grp">
    <div class="sceneTypes" id="sceneTypes" role="radiogroup" aria-label="What the picture shows"></div>
    <p class="note sceneSuggest" id="sceneSuggest" hidden></p>
    <p class="note" id="sceneNote"></p>
    <div id="sceneBody">
      <h3 class="subHead">Light scenes</h3>
      <div class="views"><button id="sceneFlip" type="button" aria-pressed="false" title="Mirror the light scenes: the key light from the right">Light from the right</button></div>
      <div id="sceneLooks" class="autoLooks" role="list"></div>
      <p class="note" id="sceneLookNote">Tap a scene to use it; press and hold to see it until you let go. Every light can still be moved (Light).</p>
      <h3 class="subHead">Relight</h3>
      <div class="views" id="sceneApply" role="radiogroup" aria-label="What the new light falls on"></div>
      <h3 class="subHead">Shape of the scene</h3>
      <div id="sceneSliders"></div>
      <div id="sceneRoom"><h3 class="subHead">Back wall</h3><div id="sceneWall"></div><div class="views"><button id="sceneWallAuto" type="button" title="The back wall as the photo's own lines show it">From the photo</button></div></div>
      <div id="sceneHorizonRow" class="row"><label for="sceneHorizon">Horizon</label><input id="sceneHorizon" type="range" min="0.05" max="0.95" step="0.005"><output data-own></output></div>
      <div id="sceneFx" class="overlays"></div>
    </div></div>`;
  after.after(box);

  // A smaller copy of the type chips at the top of Setup, so the choice is there on open.
  const quick = document.createElement('div'); quick.className = 'sceneQuick'; quick.id = 'sceneQuick';
  quick.innerHTML = '<span>The picture is</span><div class="sceneTypes" role="radiogroup" aria-label="What the picture shows"></div><p class="note sceneSuggest" hidden></p>';
  $('quickSetup').prepend(quick);

  const chipRows = [$('sceneTypes'), quick.querySelector('.sceneTypes')];
  for (const row of chipRows) for (const t of SCENE_TYPES) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.type = t; b.textContent = TYPE_NAMES[t];
    b.setAttribute('role', 'radio'); b.title = TYPE_NOTES[t];
    b.onclick = () => setType(t);
    row.append(b);
  }
  for (const a of SCENE_APPLY) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.apply = a; b.textContent = APPLY_NAMES[a]; b.setAttribute('role', 'radio');
    b.title = a === 'all' ? 'Relight the whole picture' : a === 'subject' ? 'Relight the subject; the rest stays as photographed' : 'Relight around the subject; the subject stays as photographed';
    b.onclick = () => { state.scene.apply = a; sync(); api.render(); checkpoint(); };
    $('sceneApply').append(b);
  }
  const rows = {};
  for (const [k, label, min, max, step] of SCENE_FIELDS) {
    const row = document.createElement('div'); row.className = 'row'; row.title = TITLES[k];
    row.innerHTML = `<label for="scene-${k}">${label}</label><input id="scene-${k}" type="range" min="${min}" max="${max}" step="${step}"><output data-own></output>`;
    const i = row.querySelector('input');
    i.oninput = () => { state.scene[k] = +i.value; row.querySelector('output').textContent = FORMAT[k](+i.value); api.render(); staleThumbs(); };
    rows[k] = row; $('sceneSliders').append(row);
  }
  const WALL = [['x0', 'Left side'], ['x1', 'Right side'], ['y0', 'Ceiling line'], ['y1', 'Floor line']];
  for (const [k, label] of WALL) {
    const row = document.createElement('div'); row.className = 'row';
    row.innerHTML = `<label for="scene-wall-${k}">${label}</label><input id="scene-wall-${k}" type="range" min="0" max="1" step="0.005"><output data-own></output>`;
    const i = row.querySelector('input');
    i.oninput = () => { const w = { ...wallNow() }; w[k] = +i.value; if (w.x1 - w.x0 < 0.06 || w.y1 - w.y0 < 0.06) { i.value = wallNow()[k]; return; } state.scene.wall = w; row.querySelector('output').textContent = pct(+i.value); showWall(); api.render(); staleThumbs(); };
    $('sceneWall').append(row);
  }
  $('sceneWallAuto').onclick = () => { state.scene.wall = null; sync(); showWall(); api.render(); staleThumbs(); checkpoint(); };
  $('sceneHorizon').oninput = (e) => { state.scene.horizon = +e.target.value; e.target.nextElementSibling.textContent = pct(1 - state.scene.horizon); api.render(); staleThumbs(); };
  let flip = false;
  $('sceneFlip').onclick = () => { flip = !flip; $('sceneFlip').classList.toggle('on', flip); $('sceneFlip').setAttribute('aria-pressed', flip); staleThumbs(); };
  const fxSync = buildFxUI($('sceneFx'), { state, render: api.render });

  // The back wall's outline on the picture while it is being set, perspective lines to the frame's corners.
  const wallSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  wallSvg.id = 'wallGuide'; wallSvg.setAttribute('viewBox', '0 0 100 100'); wallSvg.setAttribute('preserveAspectRatio', 'none');
  wallSvg.innerHTML = '<rect fill="none" stroke="#ffd27a" stroke-width=".4" stroke-dasharray="1.5 1"/><path fill="none" stroke="#ffd27a" stroke-opacity=".7" stroke-width=".3"/>';
  wallSvg.style.display = 'none'; $('paper').append(wallSvg);
  let wallTimer = 0;
  function showWall() {
    const w = wallNow(); if (!w) return;
    const r = wallSvg.querySelector('rect');
    for (const [k, v] of Object.entries({ x: w.x0 * 100, y: w.y0 * 100, width: (w.x1 - w.x0) * 100, height: (w.y1 - w.y0) * 100 })) r.setAttribute(k, v);
    wallSvg.querySelector('path').setAttribute('d', `M0 0L${w.x0 * 100} ${w.y0 * 100}M100 0L${w.x1 * 100} ${w.y0 * 100}M0 100L${w.x0 * 100} ${w.y1 * 100}M100 100L${w.x1 * 100} ${w.y1 * 100}`);
    wallSvg.style.display = ''; clearTimeout(wallTimer); wallTimer = setTimeout(() => { wallSvg.style.display = 'none'; }, 1800);
  }
  // The wall in use: the one set, or the one the photo's lines give.
  function wallNow() {
    if (state.scene.type !== 'room') return null;
    if (state.scene.wall) return state.scene.wall;
    try { return api.scene.describe(state.scene).wall; } catch { return null; }
  }

  // ------------------------------------------------------------- choosing the type
  function setType(type) {
    if (!SCENE_TYPES.includes(type) || state.mode !== 'single' || !api.source()) return;
    if (type === state.scene.type) return;
    const keep = { apply: state.scene.apply };
    state.scene = { ...sceneDefaults(type), ...(type === 'artwork' ? {} : keep) };
    if (type !== 'artwork') {
      // A photo is relit as a calibrated surface; its fine shading is detail, kept (no blur).
      state.physical = 1; state.albedoSuppress = 0;
      api.dirty();
      useScene(DEFAULT_SCENE[type], { quiet: true });
    }
    api.refresh(); sync(); checkpoint(); oneTap?.();
    staleThumbs();
  }

  // ------------------------------------------------------------- light scenes
  // The scene's settings put on the state as they are: its lights, room light, white balance and
  // effects (those it names on, the other atmosphere effects off; Background blur is a lens, left).
  function put(id, opts = {}) {
    const ctx = api.scene.describe(state.scene), sc = lightScene(id, ctx, { flip: opts.flip ?? flip });
    state.lights = sc.lights.map((l) => { const c = structuredClone(l); api.applyColor(c); return c; });
    state.selected = 0;
    for (const k of ['ambient', 'roomKelvin', 'neutralWB', 'shadowSoftness']) if (k in sc) state[k] = sc[k];
    state.shadow = 0.9;
    for (const F of FX) {
      if (F.key === 'blur') continue;
      const want = sc.fx?.[F.key];
      state.fx[F.key] = { ...state.fx[F.key], ...(want || {}), on: want ? 1 : 0 };
    }
    if (sc.fx) state.fx.on = 1;
    return sc;
  }
  // A light scene in one undoable step, exposure fitted to the photo and the result guarded.
  function useScene(id, { quiet = false, flip: f } = {}) {
    if (!sceneActive(state)) throw new Error('Light scenes are for photos: choose what the picture shows first (Photo, Portrait, Room, Object).');
    const sc = put(id, { flip: f });
    fitExposure(sc.bias);
    active = id;
    if (!quiet) { api.refresh(); sync(); checkpoint(); oneTap?.(); }
    drawThumbs();
    return sc;
  }

  // The render's mean brightness, read back small; and the photo's.
  function meanOf(viewMode = 0, w = 64) {
    const keep = { viewMode: state.viewMode, compareSplit: state.compareSplit };
    state.viewMode = viewMode; state.compareSplit = -1;
    try {
      api.renderNow();
      const c = document.createElement('canvas'); c.width = w; c.height = Math.max(1, Math.round(api.canvas.height * w / api.canvas.width));
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(api.canvas, 0, 0, c.width, c.height);
      return { mean: lightPool(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height).mean, canvas: c };
    } finally { Object.assign(state, keep); }
  }
  let photoMean = null;   // {src, mean}
  // Exposure that puts the render's mean at the photo's times 2^bias (as Auto's looks).
  function fitExposure(bias) {
    const src = api.source();
    if (photoMean?.src !== src) photoMean = { src, mean: meanOf(4).mean };
    const target = photoMean.mean * 2 ** bias;
    state.exposure = 0;
    for (let i = 0; i < 3; i++) {
      const m = meanOf().mean;
      if (!(m > 1e-5)) return;
      const e = Math.max(-3, Math.min(3, Math.round((state.exposure + Math.log2(target / m)) * 100) / 100));
      if (Math.abs(e - state.exposure) < 0.03) return;
      state.exposure = e;
    }
  }

  // Thumbnails, made a frame at a time so the page stays live; a newer photo, type, shape or
  // flip starts them again.
  let active = null, thumbs = new Map(), job = 0, making = false;
  function staleThumbs() { thumbs = new Map(); job++; drawThumbs(); queueThumbs(); }
  function drawThumbs() {
    const grid = $('sceneLooks'); grid.textContent = '';
    if (!sceneActive(state)) return;
    for (const s of scenesFor(state.scene.type)) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'autoLook' + (active === s.id ? ' on' : ''); b.dataset.scene = s.id;
      b.setAttribute('role', 'listitem'); b.title = s.note;
      const t = thumbs.get(s.id);
      if (t) b.append(t); else { const c = document.createElement('canvas'); c.width = 4; c.height = 5; b.append(c); }
      const span = document.createElement('span'); span.textContent = s.name; b.append(span);
      b.onclick = () => { if (held?.shown) { held = null; return; } useScene(s.id); };
      b.addEventListener('pointerdown', (e) => { if (e.button === 0) holdStart(s.id, b); });
      for (const k of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(k, holdEnd);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      grid.append(b);
    }
  }
  function queueThumbs() {
    if (making || !sceneActive(state) || !box.open || box.classList.contains('toolHidden')) return;
    making = true;
    const mine = job;
    const step = () => {
      if (mine !== job || !sceneActive(state) || state.exporting) { making = false; if (mine !== job) queueThumbs(); return; }
      const next = scenesFor(state.scene.type).find((s) => !thumbs.has(s.id));
      if (!next) { making = false; return; }
      const keep = snapshot();
      setBatching(true);
      try {
        put(next.id); fitExposure(next.bias);
        const c = meanOf(0, THUMB_W).canvas;
        thumbs.set(next.id, c);
      } catch (e) { thumbs.set(next.id, null); console.warn('Scene thumbnail', next.id, e); }
      finally { restore(keep); setBatching(false); api.renderNow(); }
      const tile = $('sceneLooks').querySelector(`[data-scene="${next.id}"] canvas`), t = thumbs.get(next.id);
      if (tile && t) tile.replaceWith(t);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  // Press and hold a scene: the picture shows it until let go (no undo step).
  let held = null;
  function holdStart(id, b) {
    holdEnd();
    held = { id, b, timer: setTimeout(() => {
      if (!held || state.exporting) return;
      held.keep = snapshot(); held.shown = true; b.classList.add('held');
      setBatching(true); put(id); fitExposure(LIGHT_BIAS(id)); setBatching(false); api.render();
    }, 350) };
  }
  function holdEnd() {
    if (!held) return;
    clearTimeout(held.timer);
    if (!held.shown) { held = null; return; }
    if (held.keep) { restore(held.keep); api.render(); held.keep = null; held.b.classList.remove('held'); }
    setTimeout(() => { held = null; }, 400);
  }
  const LIGHT_BIAS = (id) => scenesFor(state.scene.type).find((s) => s.id === id)?.bias ?? 0;

  // ------------------------------------------------------------- suggestion
  let suggestion = null;
  function suggest() {
    suggestion = null;
    if (state.mode !== 'single' || !api.source()) return showSuggestion();
    try { suggestion = api.scene.suggestion(); } catch (e) { console.warn('Scene suggestion', e); }
    showSuggestion();
  }
  function showSuggestion() {
    const s = suggestion, show = s && s.type !== state.scene.type && s.type !== 'artwork';
    for (const p of [$('sceneSuggest'), quick.querySelector('.sceneSuggest')]) {
      p.hidden = !show; p.textContent = '';
      if (!show) continue;
      p.append(`This looks like ${s.type === 'room' ? 'a room or booth' : s.type === 'object' ? 'an object' : `a ${TYPE_NAMES[s.type].toLowerCase()}`} (${s.why}). `);
      const b = document.createElement('button'); b.type = 'button'; b.textContent = `Relight as ${TYPE_NAMES[s.type]}`; b.onclick = () => setType(s.type);
      p.append(b);
    }
  }

  // ------------------------------------------------------------- sync
  function sync() {
    const sc = state.scene, on = sceneActive(state);
    for (const row of chipRows) for (const b of row.children) { const sel = b.dataset.type === sc.type; b.classList.toggle('on', sel); b.setAttribute('aria-checked', sel); }
    document.body.classList.toggle('sceneMode', on);
    $('sceneNote').textContent = TYPE_NOTES[sc.type];
    $('sceneBody').hidden = !on;
    for (const b of $('sceneApply').children) { const sel = b.dataset.apply === (sc.apply || 'all'); b.classList.toggle('on', sel); b.setAttribute('aria-checked', sel); }
    for (const [k, row] of Object.entries(rows)) {
      row.hidden = !(SHOWN[k] === 'all' || SHOWN[k] === sc.type);
      const i = row.querySelector('input'); i.value = sc[k]; row.querySelector('output').textContent = FORMAT[k](+sc[k]);
    }
    $('sceneRoom').hidden = sc.type !== 'room';
    if (sc.type === 'room' && on) { const w = wallNow(); if (w) for (const [k] of WALL) { const i = $(`scene-wall-${k}`); i.value = w[k]; i.nextElementSibling.textContent = pct(w[k]); } }
    $('sceneHorizonRow').hidden = sc.type !== 'photo';
    if (sc.type === 'photo' && on) {
      let hz = sc.horizon;
      if (hz == null) { try { hz = api.scene.describe(sc).horizon; } catch { hz = null; } }
      const i = $('sceneHorizon'); i.value = hz ?? 0.42; i.nextElementSibling.textContent = sc.horizon == null ? 'auto' : pct(1 - sc.horizon);
    }
    fxSync();
    showSuggestion();
  }

  document.addEventListener('digilight:source', (e) => {
    if (e.detail?.keep) return;
    photoMean = null; active = null; staleThumbs();
    // Read the new photo once the page has drawn it.
    setTimeout(() => { suggest(); sync(); }, 0);
  });
  box.addEventListener('toggle', () => { if (box.open) queueThumbs(); });
  document.addEventListener('digilight:tool', () => queueThumbs());
  sync();
  return { sync, setType, useScene, suggest, get suggestion() { return suggestion; }, get active() { return active; }, thumbs: () => thumbs, describe: () => api.scene.describe(state.scene) };
}
