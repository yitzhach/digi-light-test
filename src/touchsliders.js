// Sliders for fingers. A phone's own slider only moves when the finger lands on its small
// knob (iPhone), and a sideways drag that starts a little off it scrolls the panel instead.
// Here a finger can take a slider anywhere along it: a sideways drag moves the value by
// how far the finger moves (Lightroom mobile style, so taking hold never jumps it), a tap
// on the track jumps it there, and an up-or-down drag scrolls the panel as before and
// leaves the value alone. Touch only; a mouse or pen keeps the browser's own slider.
// CSS (studio.css, pointer:coarse) gives the sliders touch-action pan-y and a fixed THUMB.
export const THUMB = 26;      // px, the knob's width in studio.css
const DECIDE = 6;             // px of movement before it is a drag one way or the other
const TAP_MS = 350;

export function initTouchSliders(doc = document) {
  let d = null;
  const isSlider = (el) => el instanceof HTMLInputElement && el.type === 'range' && !el.disabled;
  const touchOf = (e) => [...e.changedTouches].find((t) => t.identifier === d.id);
  const range = (el) => { const min = +el.min || 0, max = el.max === '' ? 100 : +el.max; return { min, max }; };
  const span = (el) => Math.max(1, el.getBoundingClientRect().width - THUMB);
  function put(el, v) {
    const { min, max } = range(el), before = el.value;
    el.value = String(Math.min(max, Math.max(min, v)));   // the browser snaps it to the step
    if (el.value !== before) el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  doc.addEventListener('touchstart', (e) => {
    d = null;
    const el = e.target;
    if (!isSlider(el) || e.touches.length !== 1) return;
    const t = e.touches[0];
    d = { el, id: t.identifier, x0: t.clientX, y0: t.clientY, v0: +el.value, start: el.value, t0: e.timeStamp, mode: null };
  }, { capture: true, passive: true });
  doc.addEventListener('touchmove', (e) => {
    if (!d) return;
    const t = touchOf(e);
    if (!t) return;
    const dx = t.clientX - d.x0, dy = t.clientY - d.y0;
    if (!d.mode) {
      if (Math.hypot(dx, dy) < DECIDE) return;
      d.mode = Math.abs(dx) > Math.abs(dy) ? 'drag' : 'scroll';
      // A scroll that began on a slider must not leave it changed (some browsers move it on touch).
      if (d.mode === 'scroll') { if (d.el.value !== d.start) { d.el.value = d.start; d.el.dispatchEvent(new Event('input', { bubbles: true })); } d = null; return; }
    }
    if (e.cancelable) e.preventDefault();   // the page stays put and the browser's own knob drag stands down
    const { min, max } = range(d.el);
    put(d.el, d.v0 + dx / span(d.el) * (max - min));
  }, { capture: true, passive: false });
  const end = (e) => {
    if (!d) return;
    const t = touchOf(e);
    if (!t) return;
    const { el, mode } = d;
    if (!mode && e.type === 'touchend' && e.timeStamp - d.t0 < TAP_MS) {
      // A tap: jump to the spot, unless it was on the knob itself.
      const r = el.getBoundingClientRect(), { min, max } = range(el);
      const at = (t.clientX - r.left - THUMB / 2) / span(el);
      const knob = r.left + THUMB / 2 + (d.v0 - min) / ((max - min) || 1) * span(el);
      if (Math.abs(t.clientX - knob) > THUMB / 2 + 4) put(el, min + at * (max - min));
    }
    if (el.value !== d.start) el.dispatchEvent(new Event('change', { bubbles: true }));
    d = null;
  };
  doc.addEventListener('touchend', end, { capture: true, passive: true });
  doc.addEventListener('touchcancel', end, { capture: true, passive: true });
}
