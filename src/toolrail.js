// Tool rail: the panel one section at a time, like Lightroom mobile's tool strip. A bottom
// icon strip on phones, a vertical rail beside the panel on desktop, where All (the default
// there) still shows the whole panel. Each block of the panel is tagged with its tool; a
// block nobody listed (a section added later) lands under Detail, so nothing is lost.
const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
export const TOOLS = [
  ['setup', 'Setup', svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l5-5 4 4 3-3 4 4"/>')],
  ['auto', 'Auto', svg('<path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z"/><path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>')],
  ['scene', 'Scene', svg('<circle cx="16.5" cy="7" r="2.5"/><path d="M2.5 19.5l6-8 4 5 2.5-3 6.5 6z"/>')],
  ['light', 'Light', svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>')],
  ['graze', 'Graze', svg('<path d="M2.5 19.5h19"/><path d="M6 19.5c.8-3.5 2.7-3.5 3.5 0M12 19.5c.8-4.5 3-4.5 3.8 0M18 19.5c.5-2.5 1.8-2.5 2.3 0"/><path d="M2.5 6.5l9 7M2.5 10.5l5 3.9"/>')],
  ['layers', 'Layers', svg('<path d="M12 3.5l9 4.8-9 4.8-9-4.8z"/><path d="M3 12.5l9 4.8 9-4.8"/><path d="M3 16.5l9 4.8 9-4.8"/>')],
  ['colour', 'Colour', svg('<path d="M12 3a9 9 0 1 0 0 18c1.3 0 2-.9 2-1.9s-.9-1.5-.9-2.5.8-1.6 1.9-1.6h2a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11.5" r="1.2"/><circle cx="9.5" cy="7.2" r="1.2"/><circle cx="14.5" cy="7" r="1.2"/>')],
  ['detail', 'Detail', svg('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>')],
  ['save', 'Save', svg('<path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5"/><path d="M4 16.5v3.5h16v-3.5"/>')],
  ['all', 'All', svg('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="5" cy="6" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="18" r="1"/>')],
];
// An element inside each block; the block is its ancestor that sits directly in the panel
// (or in #creative), plus the h2 heading in front of it when it has one.
const ANCHORS = {
  setup: ['openPhoto', 'src', 'quickSetup'],
  auto: ['autoSection'],
  scene: ['sceneSection'],
  light: ['lightPanel'],
  graze: ['grazeSection'],
  layers: ['layersSection'],
  colour: ['lookControls'],
  detail: ['brushOff', 'calibrateSection', 'lampSection', 'probeSection', 'fineTune', 'views'],
  save: ['saveSection'],
};
// Blocks a second tool shows too: Setup shows Auto's Analyze under the photo, so the app
// opens on both (the user, 10-15).
const ALSO = { auto: ['setup'] };
const START = 'setup';
const STORE = 'digilight.tool';

export function initToolRail({ panel }) {
  const creative = document.getElementById('creative');
  const phone = matchMedia('(max-width: 860px)');
  const blocks = [];
  const blockOf = (el) => { while (el && el.parentElement !== panel && el.parentElement !== creative) el = el.parentElement; return el; };
  const tag = (el, tool) => {
    if (!el || el.dataset.tool) return;
    el.dataset.tool = tool; blocks.push(el);
    const h = el.previousElementSibling;
    if (el.classList.contains('grp') && h?.tagName === 'H2' && !h.dataset.tool) { h.dataset.tool = tool; blocks.push(h); }
  };
  for (const [tool, ids] of Object.entries(ANCHORS)) for (const id of ids) tag(blockOf(document.getElementById(id)), tool);
  // Always shown: the title, tool search (added later) and #creative, whose children are tagged.
  const keep = (el) => el === panel.firstElementChild || el === creative || el.id === 'toolSearch';
  const rest = [...panel.children, ...(creative ? creative.children : [])].filter((el) => !el.dataset.tool && !keep(el));
  for (const el of rest) if (el.tagName !== 'H2') tag(el, 'detail');
  for (const el of rest) if (!el.dataset.tool) tag(el, 'detail');

  const rail = document.createElement('nav');
  rail.id = 'toolRail'; rail.setAttribute('role', 'tablist'); rail.setAttribute('aria-label', 'Tools');
  for (const [key, label, icon] of TOOLS) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.tool = key; b.setAttribute('role', 'tab'); b.setAttribute('aria-controls', 'panel'); b.title = key === 'all' ? 'Show every section' : label;
    if (key === 'all') b.className = 'railAll';
    b.innerHTML = `${icon}<span>${label}</span>`;
    // The open tool's button again minimizes the panel (the painting gets the room); again opens it.
    b.onclick = () => { if (key === current && !minimized) setMin(true); else show(key); };
    rail.append(b);
  }
  panel.after(rail);

  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE)) || {}; } catch { saved = {}; }
  const layout = () => (phone.matches ? 'phone' : 'desk');
  const valid = (t) => TOOLS.some(([k]) => k === t) && !(t === 'all' && phone.matches);
  let current = '', minimized = false;
  function setMin(on) {
    minimized = on; document.body.classList.toggle('panelMin', on);
    for (const b of rail.children) b.setAttribute('aria-expanded', !on);
  }
  function show(tool, remember = true) {
    setMin(false);
    if (!valid(tool)) tool = phone.matches ? 'auto' : 'all';
    const changed = tool !== current;
    current = tool; panel.dataset.tool = tool;
    for (const el of blocks) el.classList.toggle('toolHidden', tool !== 'all' && el.dataset.tool !== tool && !ALSO[el.dataset.tool]?.includes(tool));
    for (const b of rail.children) { const on = b.dataset.tool === tool; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); }
    if (tool !== 'all' && changed) {
      // A tool that is one folding section opens it; the panel starts at its top.
      const mine = blocks.filter((el) => el.dataset.tool === tool);
      if (mine.length === 1 && mine[0].matches('details')) mine[0].open = true;
      void panel.offsetHeight; panel.scrollTop = 0;   // after the new layout, or scroll anchoring moves it
    }
    if (remember) { saved[layout()] = tool; try { localStorage.setItem(STORE, JSON.stringify(saved)); } catch { /* private mode */ } }
    document.dispatchEvent(new CustomEvent('digilight:tool', { detail: { tool } }));
  }
  // Show the tool holding an element (tool search, links between sections).
  function reveal(el) {
    setMin(false);
    const t = blockOf(el)?.dataset.tool;
    if (t && current !== 'all' && t !== current) show(t);
  }
  phone.addEventListener('change', () => show(saved[layout()], false));
  // Every visit opens on Setup (open the photo, Analyze); switching layout goes back to
  // the tool last used in that layout.
  show(START, false);
  return { show, reveal, setMin, get minimized() { return minimized; }, get current() { return current; }, toolOf: (el) => blockOf(el)?.dataset.tool || '' };
}
