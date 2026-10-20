// guard.js — keeps a change from blowing whites or crushing darks.
//
// The user never wants blown whites or crushed blacks (HANDOFF). Analyze already kept
// its own looks under the photo's whites (auto.js keepWhites), but nothing checked a
// look once tapped, a preset, a value an AI agent set, or a slider. The guard does,
// against the photo at the preview's size, with measure.js's rule and LIMITS:
//   whites newly blown over the limit → ease Highlight rolloff (up to 1), then exposure;
//   darks newly crushed over the limit → raise the graze's Shadow lift (when it shows),
//   then the room light (Ambient, at most AMBIENT_MAX so it does not turn milky).
// Each setting moves only as far as it must (bisection), and the guard says what it did:
// "exposure +0.80 → +0.55". One-tap changes (looks, presets, the automation API) are
// fixed at once, folded into the same undo step; a hand-moved slider is never changed
// behind the user's back: a chip on the picture says what is clipping and offers Fix.

import { CLIP_HI, CLIP_LO, LIMITS } from './measure.js';

const AMBIENT_MAX = 0.6;
const WHITES = ['highlightRolloff', 'exposure'], DARKS = ['graze.lift', 'ambient'];
// How far each may go, and its step: [to, grid].
const MOVES = {
  highlightRolloff: () => [1, 0.02], exposure: () => [-3, 0.05],
  'graze.lift': () => [1, 0.02], ambient: (s, max) => [Math.max(s.ambient, max), 0.02],
};
const STEPS = 7;   // bisection steps per setting: 1/128 of its span

export function initGuard({ state, api, snapshot, restore, history, historyUI, $ }) {
  let photo = null;   // {src, w, h, clip}: the photo's clipping at the preview's size
  let timer = 0, quiet = false;   // the chip's delayed check; quiet while the guard itself renders
  let seq = 0;                    // counts runs, so a caller can tell a new result from the last

  function photoClip(w, h) {
    const s = api.source();
    if (photo && photo.src === s && photo.w === w && photo.h === h) return photo.clip;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingQuality = 'high'; g.drawImage(s, 0, 0, w, h);
    photo = { src: s, w, h, clip: clipMask(g.getImageData(0, 0, w, h).data) };
    return photo.clip;
  }
  // The relit picture is what is judged, whatever the screen shows (Split, Original, a diagnostic
  // view): run() switches to it for its checks and back after.
  const relitShown = () => state.viewMode === 0 && !(state.compareSplit >= 0);
  function relit(fn) {
    if (relitShown()) return fn();
    const view = { viewMode: state.viewMode, compareSplit: state.compareSplit };
    Object.assign(state, { viewMode: 0, compareSplit: -1 });
    try { return fn(); } finally { Object.assign(state, view); api.renderNow(); }
  }
  // Share of pixels blown / crushed in the preview and not in the photo, as it stands. `render`
  // false reads the frame already on screen (the chip: no extra render while someone works).
  function check({ render = true } = {}) {
    if (!api.source() || state.mode !== 'single' || !relitShown()) return null;
    if (render) api.renderNow();
    const cv = api.canvas, w = cv.width, h = cv.height;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(cv, 0, 0);
    const P = photoClip(w, h), R = clipMask(g.getImageData(0, 0, w, h).data);
    let blown = 0, crushed = 0;
    for (let i = 0; i < R.length; i++) {
      if (R[i] === 1 && P[i] !== 1) blown++;
      else if (R[i] === 2 && P[i] !== 2) crushed++;
    }
    const n = w * h, r4 = (v) => Math.round(v * 1e4) / 1e4;
    return { newBlown: r4(blown / n), newCrushed: r4(crushed / n) };
  }
  const whitesOK = (m) => m.newBlown <= LIMITS.newBlown, darksOK = (m) => m.newCrushed <= LIMITS.newCrushed;

  // Paths the guard moves, read and written on a settings snapshot.
  const get = (s, p) => p.split('.').reduce((o, k) => o?.[k], s);
  const put = (s, p, v) => { const k = p.split('.'), last = k.pop(); k.reduce((o, x) => o[x], s)[last] = v; };
  function tryValue(base, path, v) { const s = structuredClone(base); put(s, path, v); restore(s); return check(); }

  // The value nearest `from`, toward `to`, at which ok(check()) holds; `to` itself when
  // even that falls short (the guard did what it could). Assumes the effect is monotone.
  function nearest(base, path, from, to, ok, grid) {
    const snap = (v) => Math.round(v / grid) * grid;
    let m = tryValue(base, path, to);
    if (!ok(m)) { put(base, path, to); return { value: to, m }; }   // all it may: the next setting starts from here
    let good = to, bad = from, goodM = m;
    for (let i = 0; i < STEPS && Math.abs(snap(good) - snap(bad)) > grid / 2; i++) {
      const mid = snap((good + bad) / 2);
      if (mid === snap(good) || mid === snap(bad)) break;
      m = tryValue(base, path, mid);
      if (ok(m)) { good = mid; goodM = m; } else bad = mid;
    }
    put(base, path, good); restore(structuredClone(base));
    return { value: good, m: goodM };
  }

  const fmt = { exposure: (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`, highlightRolloff: (v) => v.toFixed(2), 'graze.lift': (v) => `${Math.round(v * 100)}%`, ambient: (v) => v.toFixed(2) };
  const label = { exposure: 'exposure', highlightRolloff: 'highlight rolloff', 'graze.lift': 'shadow lift', ambient: 'room light' };
  const pc = (v) => `${(v * 100).toFixed(2)}%`;

  /**
   * Check the picture as it stands and, unless `fix` is false, bring whites and darks
   * back under the limits. `amend` folds the fix into the last undo step (a one-tap
   * change); otherwise the fix is its own step. Returns {ok, fixed, before, after,
   * changes {path: [from, to]}, note} — `ok` false when even the limits of the
   * settings it may move were not enough (the note says so).
   */
  function run(opts) {
    quiet = true;
    try { const r = relit(() => guard(opts)); api_.last = r && { ...r, seq: ++seq }; return r; } finally { quiet = false; clearTimeout(timer); }
  }
  // whites / darks: which settings it moves, in order (WHITES / DARKS by default); ambientMax caps
  // the room light. Kept as options so alternatives can be rendered side by side for the user.
  function guard({ fix = true, amend = true, whites = WHITES, darks = DARKS, ambientMax = AMBIENT_MAX } = {}) {
    if (!api.source() || state.mode !== 'single' || state.exporting) return null;
    const before = check();
    if (!before) return null;
    if (whitesOK(before) && darksOK(before)) return { ok: true, fixed: false, before, after: before, changes: {}, note: '' };
    if (!fix) return { ok: false, fixed: false, before, after: before, changes: {}, note: describe(before) };
    const base = snapshot(), changes = {};
    const move = (path, to, grid, ok) => {
      const from = get(base, path);
      if (from == null || (to - from) * Math.sign(to - from) <= 0) return null;
      const r = nearest(base, path, from, to, ok, grid);
      if (Math.abs(r.value - from) > 1e-9) changes[path] = [from, r.value];
      return r.m;
    };
    let m = before;
    if (!whitesOK(m)) {
      for (const p of whites) if (!whitesOK(m)) m = move(p, ...MOVES[p](base, ambientMax), whitesOK) || m;
    }
    if (!darksOK(m)) {
      for (const p of darks) if (!darksOK(m) && (p !== 'graze.lift' || (base.graze?.enabled && base.graze.opacity > 0))) m = move(p, ...MOVES[p](base, ambientMax), darksOK) || m;
    }
    restore(base);
    const after = check();
    if (Object.keys(changes).length) {
      if (amend && history.index >= 0) history.entries[history.index] = JSON.stringify(snapshot());
      else history.push(snapshot());
      historyUI?.();
    }
    const ok = whitesOK(after) && darksOK(after);
    const did = Object.entries(changes).map(([p, [a, b]]) => `${label[p]} ${fmt[p](a)} → ${fmt[p](b)}`);
    const note = (did.length ? `Guard: ${did.join(', ')}` : 'Guard: nothing it may change helps')
      + ` (newly blown ${pc(before.newBlown)} → ${pc(after.newBlown)}, crushed ${pc(before.newCrushed)} → ${pc(after.newCrushed)})`
      + (ok ? '.' : `; still over the limit: ${describe(after)}.`);
    show(after);
    return { ok, fixed: did.length > 0, before, after, changes, note };
  }
  function describe(m) {
    const out = [];
    if (!whitesOK(m)) out.push(`${pc(m.newBlown)} of the picture newly blown to white`);
    if (!darksOK(m)) out.push(`${pc(m.newCrushed)} newly crushed to black`);
    return out.join(', ');
  }

  // ---- the chip: what is clipping now, with Fix (one undo step of its own).
  const chip = document.createElement('div');
  chip.id = 'guardChip'; chip.hidden = true; chip.setAttribute('role', 'status');
  chip.innerHTML = '<span></span><button type="button">Fix</button>';
  $('stage')?.append(chip);
  let holdUntil = 0;   // the "Fixed" message stays a few seconds
  chip.querySelector('button').onclick = () => {
    const r = run({ amend: false });
    if (!r?.note) return;
    chip.hidden = false; chip.classList.add('done'); chip.querySelector('button').hidden = true;
    chip.firstChild.textContent = r.ok ? 'Fixed: ' + r.note.replace(/^Guard: /, '') : r.note;
    holdUntil = performance.now() + 4000;
    setTimeout(() => { if (chip.classList.contains('done')) chip.hidden = true; }, 4000);
  };
  function show(m) {
    if (performance.now() < holdUntil) return;
    const bad = m && !(whitesOK(m) && darksOK(m));
    chip.classList.remove('done'); chip.querySelector('button').hidden = false;
    chip.hidden = !bad;
    if (bad) chip.firstChild.textContent = '⚠ ' + describe(m);
  }
  // Checked once the picture has been still for a moment and the page is idle, on the frame
  // already drawn (no render of its own), so dragging and tapping stay smooth; not checked
  // while another view than the relit picture is on screen.
  document.addEventListener('digilight:render', () => {
    if (quiet) return;
    clearTimeout(timer);
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 0));
    timer = setTimeout(() => idle(() => { if (state.exporting || quiet) return; show(check({ render: false })); }, { timeout: 2000 }), 700);
  });

  // enabled: one-tap changes are guarded (digilight.setGuard turns it off); last: what the
  // guard last did (null before it ran).
  const api_ = {
    check, run, LIMITS, enabled: true, last: null,
    // One-tap changes call this after their checkpoint: fixed at once, same undo step.
    afterOneTap: () => (api_.enabled ? run({ amend: true }) : null),
  };
  return api_;
}

// 1 where any channel is blown, 2 where all are crushed (photocheck.js's rule), else 0.
function clipMask(rgba) {
  const m = new Uint8Array(rgba.length / 4);
  for (let i = 0, p = 0; i < m.length; i++, p += 4) {
    const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
    if (r >= CLIP_HI || g >= CLIP_HI || b >= CLIP_HI) m[i] = 1;
    else if (r <= CLIP_LO && g <= CLIP_LO && b <= CLIP_LO) m[i] = 2;
  }
  return m;
}
