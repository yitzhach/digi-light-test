// "Export for testing": one .zip holding the project, the photo, the result and the
// diagnostic views, plus the user's note and environment info, so a problem can be
// reproduced exactly from a single attachment. Zip is written by hand (stored, no
// compression: the images are already compressed), so no library is needed.

const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message || e)));
window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason?.message || e.reason)));

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
});
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

/** files: [{ name, data: Uint8Array }] -> Blob (zip, stored). */
export function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), n = f.data.length;
    const h = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [8, 0, 2], [14, crc, 4], [18, n, 4], [22, n, 4], [26, name.length, 2]]
      .forEach(([o, v, s]) => s === 4 ? h.setUint32(o, v, true) : h.setUint16(o, v, true));
    parts.push(new Uint8Array(h.buffer), name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [16, crc, 4], [20, n, 4], [24, n, 4], [28, name.length, 2], [42, offset, 4]]
      .forEach(([o, v, s]) => s === 4 ? c.setUint32(o, v, true) : c.setUint16(o, v, true));
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + n;
  }
  const size = central.reduce((s, p) => s + p.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [8, files.length, 2], [10, files.length, 2], [12, size, 4], [16, offset, 4]]
    .forEach(([o, v, s]) => s === 4 ? e.setUint32(o, v, true) : e.setUint16(o, v, true));
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
}

const bytes = async (blob) => new Uint8Array(await blob.arrayBuffer());
const png = (canvas) => new Promise((r) => canvas.toBlob(r, 'image/png')).then(bytes);
const text = (s) => new TextEncoder().encode(s);

// The preview canvas as it shows `view` (state.viewMode; split = before/after split).
function grab(api, { viewMode = 0, split = -1 }) {
  const s = api.state, keep = { viewMode: s.viewMode, compareSplit: s.compareSplit };
  s.viewMode = viewMode; s.compareSplit = split;
  try {
    api.renderNow();
    const c = document.createElement('canvas'); c.width = api.canvas.width; c.height = api.canvas.height;
    c.getContext('2d').drawImage(api.canvas, 0, 0);   // same task as the draw: buffer still valid
    return c;
  } finally { Object.assign(s, keep); api.renderNow(); }
}

function lightSummary(s) {
  const on = (s.lights || []).filter((l) => l.enabled);
  const lines = on.map((l, i) => {
    const deg = Math.round(Math.atan2(l.z, Math.hypot(l.x - 0.5, l.y - 0.5)) * 180 / Math.PI);
    const from = Math.round((Math.atan2(l.y - 0.5, l.x - 0.5) * 180 / Math.PI + 360) % 360);
    return `light ${i + 1}: power ${(+l.power).toFixed(2)}, ${deg}° off the wall, from ${from}° (0 right, 90 top), size ${(l.size ?? 0.03).toFixed(3)}`;
  });
  const g = s.graze;
  if (g?.enabled) lines.push(`graze: ${g.lamp ? `lamp ${JSON.stringify(g.lamp)} cm` : `${g.elevation}° from ${g.angle}°`}, opacity ${g.opacity}`);
  return `${on.length} light(s) on\n${lines.join('\n')}`;
}

/** Builds and downloads the bundle. project: the portable project record. */
export async function exportTestBundle(api, project, notes, onStatus = () => {}) {
  const s = api.state, files = [];
  const add = (name, data) => files.push({ name, data });
  add('project.digilight.json', text(JSON.stringify(project)));
  add('notes.txt', text(notes || ''));
  // The sharp zoom overlay first: any re-render below hides it.
  const sharp = api.sharp?.();
  if (sharp?.canvas) add('view-zoom.png', await png(sharp.canvas));
  onStatus('capturing views…');
  add('view-relit.png', await png(grab(api, { viewMode: 0 })));
  add('view-original.png', await png(grab(api, { viewMode: 4 })));
  add('view-split.png', await png(grab(api, { viewMode: 0, split: 0.5 })));
  add('view-shadows.png', await png(grab(api, { viewMode: 6 })));
  add('view-height.png', await png(grab(api, { viewMode: 2 })));
  const src = api.source();
  if (src) {
    const c = document.createElement('canvas'); c.width = src.width || src.naturalWidth; c.height = src.height || src.naturalHeight;
    c.getContext('2d').drawImage(src, 0, 0);
    add('original.jpg', await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92)).then(bytes));
  }
  onStatus('rendering full resolution…');
  try { add('relit-full.png', await png(await api.exportFull())); } catch (e) { errors.push('full export: ' + e.message); }
  let gpu = '';
  try { const gl = document.createElement('canvas').getContext('webgl2'), x = gl?.getExtension('WEBGL_debug_renderer_info'); gpu = x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : ''; } catch {}
  add('info.json', text(JSON.stringify({
    exported: new Date().toISOString(), url: location.href, userAgent: navigator.userAgent, gpu,
    screen: [screen.width, screen.height, devicePixelRatio], preview: [api.canvas.width, api.canvas.height],
    viewZoom: s.viewZoom, errors: errors.slice(-50), lights: lightSummary(s),
  }, null, 2)));
  const name = `${(project.name || 'painting').replace(/[^a-z0-9_-]/gi, '_')}-test-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.zip`;
  const url = URL.createObjectURL(makeZip(files)), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  return { name, files: files.map((f) => f.name) };
}
