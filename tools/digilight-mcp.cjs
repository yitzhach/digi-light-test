#!/usr/bin/env node
// digilight-mcp.cjs — DigiLight as an MCP server, so an AI assistant (the Claude desktop
// app, Claude Code) can relight a painting by chatting: open a photo, Analyze, try looks
// and settings, look at the result, export it.
//
// Speaks MCP over stdio. Keeps ONE headless DigiLight page open (digilight-headless.cjs)
// for the whole conversation, so each tool works on the current photo and settings, like
// a person at the panel; every change is one undo step. Setup: docs/automation.md.
//
//   node tools/digilight-mcp.cjs        (started by the assistant, not by hand)
//
// Logs go to stderr; stdout is the MCP channel.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { parseSets, dataURL, fromDataURL, cleanError, launch, openInput, preview, shrunk, analyzeCached, writeRecord } = require('./digilight-headless.cjs');

const log = (...a) => process.stderr.write('[digilight] ' + a.join(' ') + '\n');
const FORMATS = { '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.webp': 'webp' };
// "~/Pictures/x.jpg" → absolute; relative paths are from the server's folder (the assistant's choice), so prefer absolute.
const filePath = (p) => path.resolve(String(p).replace(/^~(?=$|[\\/])/, os.homedir()));

// One page for the session, opened on first use, reopened if the browser goes away.
let session = null;
function page() {
  if (!session) {
    log('starting headless DigiLight…');
    session = launch().then((s) => {
      s.page.on('close', () => { session = null; opened = null; });
      s.page.context().browser().on('disconnected', () => { session = null; opened = null; });
      log('ready');
      return s;
    }, (e) => { session = null; throw e; });
  }
  return session;
}

const text = (v) => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] });
// Wraps a tool: opens the page, sends progress while slow work runs (so the assistant
// does not give up on a 2-minute Analyze), turns errors into tool errors, adds page errors.
function tool(fn) {
  return async (args, extra) => {
    const token = extra?._meta?.progressToken;
    let n = 0;
    const beat = token != null ? setInterval(() => {
      extra.sendNotification({ method: 'notifications/progress', params: { progressToken: token, progress: ++n, message: `working… ${n * 5}s` } }).catch(() => {});
    }, 5000) : null;
    try {
      const s = await page();
      const before = s.errors.length;
      const out = await fn(s, args || {});
      const res = out && out.content ? out : text(out);
      if (s.errors.length > before) res.content.push({ type: 'text', text: 'Page errors:\n' + s.errors.slice(before).join('\n') });
      return res;
    } catch (e) {
      return { isError: true, content: [{ type: 'text', text: cleanError(e) }] };
    } finally { if (beat) clearInterval(beat); }
  };
}
// Analyze takes 1–3 minutes without a GPU, longer than many assistants wait for one tool
// call (often 60 s). So it runs in the background: analyze / apply_look wait up to WAIT_MS,
// then say it is still running; calling again picks up the same run.
const WAIT_MS = +process.env.DIGILIGHT_WAIT_MS || 45000;   // the env value is for tests
// A finished Analyze is kept on disk per photo (digilight-headless.cjs), so analyzing a
// photo again, in this chat or a later one, comes back at once.
let analyzing = null, opened = null;
function startAnalyze(call) {
  if (!analyzing) {
    const t0 = Date.now();
    const a = analyzing = { t0, p: analyzeCached(call, opened) };
    a.p.catch(() => {}).finally(() => { if (analyzing === a) analyzing = null; });
  }
  return analyzing;
}
async function waitAnalyze(call) {
  const a = startAnalyze(call);
  const r = await Promise.race([a.p, new Promise((res) => setTimeout(() => res(null), WAIT_MS))]);
  return r || { stillAnalyzing: true, seconds: Math.round((Date.now() - a.t0) / 1000),
    next: 'Analyze is still running in the background (1–3 minutes without a GPU). Call analyze (or apply_look) again to keep waiting.' };
}
// Exports likewise (a full-size one is often over a minute without a GPU): export_image
// waits up to WAIT_MS, then says it is still running; calling it again with the same path
// keeps waiting, and returns the result once even if it finished in between.
let exporting = null, exported = null;
async function waitExport(run, f) {
  if (exporting && exporting.f !== f) throw new Error(`An export to ${exporting.f} is still running (${Math.round((Date.now() - exporting.t0) / 1000)} s so far); call export_image with that path to wait for it.`);
  if (!exporting && exported && exported.f === f) { const e = exported; exported = null; return e.r; }
  if (!exporting) {
    const e = exporting = { f, t0: Date.now(), p: run() };
    e.p.then((r) => { exported = { f, r }; }, () => {}).finally(() => { if (exporting === e) exporting = null; });
  }
  const e = exporting;
  let waiting = true;   // a caller that gave up leaves the result for the next call
  const r = await Promise.race([e.p.then((v) => { if (waiting && exported?.f === f) exported = null; return v; }), new Promise((res) => setTimeout(() => res(null), WAIT_MS))]);
  waiting = false;
  return r || { stillExporting: true, path: f, seconds: Math.round((Date.now() - e.t0) / 1000),
    next: 'The export is still running in the background. Call export_image again with the same path to keep waiting.' };
}
// A tool that changes the picture: an export that finished unseen no longer matches it. The
// page guards each change (src/guard.js: blown whites, crushed darks); what it did is added.
const changing = (fn) => tool(async (s, args) => {
  exported = null;
  const seq = (await s.call('lastGuard'))?.seq;
  const out = await fn(s, args);
  const g = await s.call('lastGuard');
  if (!g || g.seq === seq || (!g.fixed && g.ok)) return out;
  const res = out && out.content ? out : text(out);
  res.content.push({ type: 'text', text: g.note || `Still over the limits: ${JSON.stringify(g.after)}` });
  return res;
});
const needOpen = async (call) => { if (!(await call('info')).photo) throw new Error('No photo open yet. Use open_image first.'); };

const server = new McpServer({ name: 'digilight', version: '1.0.0' }, {
  instructions: [
    'DigiLight relights a photo of a painting with virtual lamps over its estimated paint relief (impasto), and photos of people, rooms, art fair booths and objects as spaces.',
    'Typical flow: open_image → analyze (slow: 1–3 min) → apply_look → render_preview to see it → set_settings to adjust → render_preview again → export_image.',
    'To choose between options, batch_render shows several versions on one contact sheet with their metrics, and compare shows two side by side with their difference (B: the photo, changed settings or a look); render_preview region looks closer at full detail. None of them changes anything.',
    'For a photo (not a painting): open_image → suggest_image_type → set_image_type (portrait, room, object, photo) → list_light_scenes → apply_light_scene (golden hour, window light, gallery spots, Rembrandt, neon...) → render_preview; effects (haze, light rays, glow, background blur) are set_settings fx.*.',
    'Fixed presets (apply_preset) need no analyze. describe_settings lists every setting with its range; set_settings checks values and changes nothing on an error.',
    'Until open_image, a synthetic test painting is open. Each change is one undo step (undo / redo). Use absolute file paths. Always look (render_preview) before telling the user how a change looks, and check the metrics it returns (warnings name blown whites, crushed darks or lost texture). Each change is guarded: if it would blow whites or crush darks, exposure (whites) or room light (darks) is moved to stop it, in the same undo step, and the answer says so ("Guard: exposure +0.80 → +0.55"). guard checks and fixes on request; set_guard turns it off when the user really wants the clipping.',
  ].join(' '),
});

server.registerTool('open_image', {
  title: 'Open a photo',
  description: 'Opens a photo of a painting (replacing the current one) and runs auto setup. source: an absolute path to a .jpg/.png/.webp on this computer, an http(s) image URL, a data:image/jpeg|png|webp;base64 URL (a photo you were given inline), a .digilight.json project, or sample:painting / sample:dsc8382 (built-in samples). Returns the photo and preview sizes.',
  inputSchema: { source: z.string().describe('Photo path, URL, data: image URL, .digilight.json project, or sample:painting / sample:dsc8382') },
}, changing(async ({ call }, { source }) => {
  const input = /^(sample:|https?:|data:)/.test(source) ? source : filePath(source);
  opened = null;
  const out = await openInput(call, input);
  opened = input;
  return out;
}));

server.registerTool('open_project', {
  title: 'Open a project',
  description: 'Opens a saved DigiLight project (.digilight.json: the photo, every setting and any measured relief), from save_project or the app\'s Save project.',
  inputSchema: { path: z.string().describe('Absolute path to a .digilight.json file') },
}, changing(async ({ call }, { path: p }) => {
  const f = filePath(p);
  if (!fs.existsSync(f)) throw new Error(`No such file: ${f}`);
  opened = null;
  const out = await call('setProject', fs.readFileSync(f, 'utf8'));
  opened = f;
  return out;
}));

server.registerTool('info', {
  title: 'Current state',
  description: 'The open photo (size), preview size, sample name, whether relief was measured, and whether undo/redo are possible.',
  inputSchema: {},
}, tool(async ({ call }) => call('info')));

server.registerTool('analyze', {
  title: 'Analyze the photo',
  description: 'Analyze (the app\'s Auto section): tone, how the photo was lit, stroke direction, suggested texture depth and raking direction, and the one-tap looks made for this photo. Slow without a GPU (1–3 minutes) the first time; a photo analyzed before (same settings) comes back from the cache in seconds (cached: true). Needed before apply_look.',
  inputSchema: {},
}, tool(async ({ call }) => { await needOpen(call); return waitAnalyze(call); }));

server.registerTool('list_looks', {
  title: 'List looks',
  description: 'The looks from the last analyze: index, id and recipe version (built-in looks), name, kind and a note on each.',
  inputSchema: {},
}, tool(async ({ call }) => {
  const looks = await call('looks');
  return looks.length ? looks : analyzing ? `Analyze is still running (${Math.round((Date.now() - analyzing.t0) / 1000)} s so far); call analyze to wait for it.` : 'No looks yet: run analyze first.';
}));

server.registerTool('apply_look', {
  title: 'Apply a look',
  description: 'Applies one of the looks made by analyze (runs analyze first if needed), by id (built-in looks: e.g. favourite-side-lamp, favourite-left, gallery; list_looks shows them), name or index. strength 0–1 mixes from the settings before the look (1 = the full look).',
  inputSchema: {
    look: z.union([z.string(), z.number().int()]).describe('Look id or name (from list_looks), or index'),
    strength: z.number().min(0).max(1).optional().describe('0–1, default 1'),
  },
}, changing(async ({ call }, { look, strength }) => {
  await needOpen(call);
  if (!(await call('looks')).length || analyzing) { const r = await waitAnalyze(call); if (r.stillAnalyzing) return r; }
  return call('applyLook', look, { strength: strength ?? 1 });
}));

server.registerTool('set_image_type', {
  title: 'Say what the picture shows',
  description: 'What the picture shows: "artwork" (a painting or flat piece, lit as a surface with paint relief: the default), or a photo whose space is read and relit as a space: "photo" (a place: ground, sky), "portrait" (people), "room" (a room or an art fair booth seen from its open side), "object" (a piece or product standing in front of a wall). A photo type opens on its usual light scene, exposure fitted. suggest_image_type says what the photo looks like. Returns the scene settings (set_settings changes them: scene.depth, scene.roundness, scene.delight, scene.apply, ...).',
  inputSchema: { type: z.enum(['artwork', 'photo', 'portrait', 'room', 'object']) },
}, changing(async ({ call }, { type }) => { await needOpen(call); return call('imageType', type); }));

server.registerTool('suggest_image_type', {
  title: 'What does the photo show?',
  description: 'Reads the open photo for a subject, skin tones, sky and room lines and says what it most likely shows ({type, sure 0–1, why}). A guess: confirm with the user before set_image_type when it matters.',
  inputSchema: {},
}, tool(async ({ call }) => { await needOpen(call); return call('suggestType'); }));

server.registerTool('list_light_scenes', {
  title: 'List light scenes',
  description: 'Light scenes for photos (after set_image_type): golden hour, midday sun, sunset, window light (plain, framed, through blinds or leaves), overcast, gallery spots, Rembrandt, soft key, butterfly, split, rim light, neon, candlelight, moonlight, stage spot. Each places real lights round the subject the scene reading found. Returns {id, name, note, types} for the picture\'s type.',
  inputSchema: {},
}, tool(async ({ call }) => call('lightScenes')));

server.registerTool('apply_light_scene', {
  title: 'Apply a light scene',
  description: 'Relights a photo with a light scene by id (list_light_scenes), exposure fitted to the photo and guarded, in one undo step. flip puts the key light on the right. The picture must show a photo type (set_image_type). Every light stays adjustable with set_settings ("lights.N.field").',
  inputSchema: { id: z.string(), flip: z.boolean().optional() },
}, changing(async ({ call }, { id, flip }) => { await needOpen(call); return call('applyLightScene', id, { flip: !!flip }); }));

server.registerTool('list_presets', {
  title: 'List presets',
  description: 'Fixed presets by kind: lighting (lamp scenes), graze (raking light presets), looks (matched looks). Applied with apply_preset; no analyze needed.',
  inputSchema: {},
}, tool(async ({ call }) => call('presets')));

server.registerTool('apply_preset', {
  title: 'Apply a preset',
  description: 'Applies a fixed preset: kind "lighting" (a lamp scene), "graze" (a raking light preset), "looks" (a matched look) or "scene" (a light scene for a photo, as apply_light_scene). Names from list_presets.',
  inputSchema: { kind: z.enum(['lighting', 'graze', 'looks', 'scene']), name: z.string() },
}, changing(async ({ call }, { kind, name }) => { await needOpen(call); return call('applyPreset', kind, name); }));

server.registerTool('describe_settings', {
  title: 'Describe settings',
  description: 'Every setting that set_settings can change: path, label, range and current value. filter keeps the ones whose path or label contains it (e.g. "graze", "lights.0", "relief", "exposure"); the full list is long.',
  inputSchema: { filter: z.string().optional().describe('Text to match in the path or label') },
}, tool(async ({ call }, { filter }) => {
  const all = await call('describe');
  const f = (filter || '').toLowerCase();
  const rows = f ? all.filter((d) => d.path.toLowerCase().includes(f) || (d.label || '').toLowerCase().includes(f)) : all;
  return rows.length ? rows : `Nothing matches "${filter}". Try "graze", "lights", "adjust", "overlays", "exposure".`;
}));

server.registerTool('get_settings', {
  title: 'Get settings',
  description: 'The current settings (the object a project saves), or one of them by dotted path, e.g. "graze.opacity", "lights.0.power", "adjust.relief.amount".',
  inputSchema: { path: z.string().optional() },
}, tool(async ({ call }, { path: p }) => call('get', p || null)));

server.registerTool('set_settings', {
  title: 'Change settings',
  description: 'Changes settings by dotted path in one undo step, e.g. {"exposure": 0.3, "graze.enabled": true, "graze.opacity": 0.6, "lights.0.kelvin": 3200, "adjust.relief.form": 1.5}. Values are checked like an imported project: on an unknown path or a value out of range nothing changes and the error says why. Returns the new values. describe_settings lists paths and ranges.',
  inputSchema: { changes: z.union([z.record(z.string(), z.any()), z.string()]).describe('{path: value, ...} or "a=1;b.c=0.5"') },
}, changing(async ({ call }, { changes }) => {
  await needOpen(call);
  const c = typeof changes === 'string' ? parseSets(changes) : changes;
  if (!Object.keys(c).length) throw new Error('No changes given.');
  return call('set', c);
}));

server.registerTool('add_light', {
  title: 'Add a light or a shadow',
  description: 'Adds a lamp (kind "light") or a Shadow light that takes light away where it falls: "shade" (a soft shadow, as if a flag or a cloud off the frame blocked the lamps; dark 0–1 sets how much) or "negative" (a lamp in reverse, shading the relief; power sets how much). A shade can take a shape, as if cast through something: shape "window" (window bars), "blinds", "leaves" (dappled) or "pool" (default); patternSize 0.25–4, patternRot 0–360, size blurs it. It sits where x, y say (painting widths, 0,0 bottom left) and aims at aimX, aimY; kelvin tints it (6500 neutral, higher cooler). Up to 8 in all. Returns its index for set_settings ("lights.N.field").',
  inputSchema: {
    kind: z.enum(['light', 'shade', 'negative']).optional().describe('Default light'),
    fields: z.record(z.string(), z.any()).optional().describe('Any light fields, e.g. {"x": 0.3, "y": 0.7, "aimX": 0.3, "aimY": 0.7, "dark": 0.5, "kelvin": 9000}'),
  },
}, changing(async ({ call }, { kind, fields }) => { await needOpen(call); return call('addLight', kind || 'light', fields || {}); }));

server.registerTool('remove_light', {
  title: 'Remove a light',
  description: 'Removes light number index (from 0), lamp or shadow. The last one cannot be removed (turn it off instead: lights.0.enabled false).',
  inputSchema: { index: z.number().int().min(0) },
}, changing(async ({ call }, { index }) => call('removeLight', index)));

server.registerTool('guard', {
  title: 'Check whites and darks',
  description: 'Checks the picture as it stands against the photo: share of pixels newly blown to white / crushed to black, limits 0.3% / 0.15%. With fix (default true) it brings them back under the limits (exposure down until nothing new blows; room light up to 1), as one undo step, and says what it moved.',
  inputSchema: { fix: z.boolean().optional() },
}, tool(async ({ call }, { fix }) => { await needOpen(call); exported = null; return call('guard', { fix: fix !== false }); }));

server.registerTool('set_guard', {
  title: 'Guard on or off',
  description: 'on false stops changes being guarded (for when the user wants the clipping); true turns it back on (the default).',
  inputSchema: { on: z.boolean() },
}, tool(async ({ call }, { on }) => ({ guard: await call('setGuard', on) })));

server.registerTool('undo', { title: 'Undo', description: 'Undoes the last change. Returns false when there is nothing to undo.', inputSchema: {} },
  changing(async ({ call }) => ({ undone: await call('undo') })));
server.registerTool('redo', { title: 'Redo', description: 'Redoes the last undone change. Returns false when there is nothing to redo.', inputSchema: {} },
  changing(async ({ call }) => ({ redone: await call('redo') })));

// A part of the picture, as fractions of its width and height.
const REGION = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().gt(0).max(1), h: z.number().gt(0).max(1) })
  .describe('{x, y, w, h} as fractions (0–1) of the picture\'s width and height, from its top left');
// The settings object with dotted paths ("graze.opacity", "lights.0.power") set: a copy.
function withPaths(obj, changes) {
  const out = JSON.parse(JSON.stringify(obj));
  for (const [p, v] of Object.entries(changes)) {
    const keys = p.split('.'); let o = out;
    for (const k of keys.slice(0, -1)) { if (o[k] == null || typeof o[k] !== 'object') throw new Error(`No setting ${p}.`); o = o[k]; }
    if (!(keys.at(-1) in o)) throw new Error(`No setting ${p}.`);
    o[keys.at(-1)] = v;
  }
  return out;
}
// The change map (src/changemap.js): what changed, pixel by pixel, against the photo.
const CHANGE_MAP = z.enum(['light', 'colour']).describe('Also return the change map: "light" (how much light each pixel gained or lost against the photo: grey unchanged, orange brighter, blue darker, full colour at 2 stops) or "colour" (how far each pixel is off the photo\'s own colour at its new brightness: black none, white 32 levels or more). Its numbers come as "change": same (share of pixels identical to the photo), light (stops: percentiles, shares brighter / darker), colour (levels: percentiles, share off)');
server.registerTool('render_preview', {
  title: 'See the result',
  description: 'Renders the relit painting at preview size and returns it as an image (JPEG, max_size px on its long side, default 800) so you can see it, plus its metrics against the photo (measured at preview size): newly blown / crushed share, darks lift, tone shift in stops, detail kept per scale (1 = the photo\'s), left/centre/right brightness, and warnings in words. Use it after changes, before describing the result; read the warnings too, the user never wants blown whites, crushed darks or blur.',
  inputSchema: {
    max_size: z.number().int().min(128).max(2000).optional(),
    change_map: CHANGE_MAP.optional(),
    region: REGION.optional().describe('Look closer: only this part, rendered at full detail from the full-resolution photo (a loupe), shrunk to max_size; metrics are measured on it at full detail'),
  },
}, tool(async ({ page: pg, call }, { max_size, change_map, region }) => {
  await needOpen(call);
  const change = change_map ? { map: change_map } : undefined;
  const { url, metrics, change: changed } = region
    ? await shrunk(pg, await call('export', { format: 'png', crop: region, metrics: true, change }), max_size || 800)
    : await preview(pg, call, max_size || 800, 0.85, true, change);
  return { content: [{ type: 'image', data: url.split(',')[1], mimeType: 'image/jpeg' },
    ...(changed ? [{ type: 'image', data: changed.url.split(',')[1], mimeType: 'image/jpeg' }] : []),
    { type: 'text', text: JSON.stringify({ ...(region ? { region } : {}), metrics, ...(changed ? { change: changed.stats } : {}) }, null, 1) }] };
}));

server.registerTool('compare', {
  title: 'Compare two versions',
  description: 'Shows the picture as it is (A) beside another version (B) and how they differ: one image A | B | difference (black = the same; brighter = more different, ×4), plus numbers (mean and 99th-percentile difference in levels, share of pixels changed by more than 2 levels, shares B made brighter / darker) and each one\'s metrics. B is the photo itself (photo: true), the current settings with some changed (settings, dotted paths as set_settings takes them), or a look (look: id or name; applied, read and undone). Nothing is changed. region compares only that part at full detail (a loupe); otherwise the whole picture max_size px on its long side.',
  inputSchema: {
    photo: z.boolean().optional().describe('B is the untouched photo'),
    settings: z.record(z.string(), z.any()).optional().describe('B is the current settings with these changed, e.g. {"exposure": 0.3, "graze.enabled": true}'),
    look: z.union([z.string(), z.number().int()]).optional().describe('B is this look (from list_looks)'),
    region: REGION.optional(),
    max_size: z.number().int().min(128).max(2000).optional().describe('Long side of each panel, default 600'),
  },
}, tool(async ({ page: pg, call }, { photo, settings, look, region, max_size }) => {
  await needOpen(call);
  if ([photo, settings, look].filter((v) => v != null && v !== false).length !== 1) throw new Error('Give B as one of: photo: true, settings, or look.');
  const size = max_size || 600, a = await call('settings');
  let b;
  if (photo) b = { ...a, originalTop: 1 };
  else if (settings) b = withPaths(a, settings);
  else {
    if (!(await call('looks')).length) throw new Error('No looks yet: run analyze first.');
    await call('applyLook', look, { strength: 1 });
    b = await call('settings');
    await call('undo');
  }
  const info = await call('info'), { width: pw, height: ph } = info.photo;
  // The whole picture a little over the panel size (so the difference is measured on real pixels), or the region at full detail.
  const item = (s) => ({ settings: s, format: 'png', ...(region ? { crop: region } : { width: Math.min(pw, Math.round(size * 1.5 * Math.min(1, pw / ph))) }) });
  const [A, B] = await call('exportMany', [item(a), item(b)], { metrics: true });
  const r = await pg.evaluate(async ([ua, ub, m]) => {
    const load = async (u) => { const im = new Image(); im.src = u; await im.decode(); return im; };
    const [ia, ib] = [await load(ua), await load(ub)], w = ia.width, h = ia.height;
    const px = (im) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, w, h); };
    const da = px(ia).data, db = px(ib).data, diff = new ImageData(w, h), dd = diff.data, levels = new Uint32Array(256);
    let sum = 0, changed = 0, brighter = 0, darker = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs(db[i] - da[i]), Math.abs(db[i + 1] - da[i + 1]), Math.abs(db[i + 2] - da[i + 2]));
      levels[d]++; sum += d;
      if (d > 2) { changed++; const l = (db[i] - da[i]) * 0.2126 + (db[i + 1] - da[i + 1]) * 0.7152 + (db[i + 2] - da[i + 2]) * 0.0722; if (l > 2) brighter++; else if (l < -2) darker++; }
      for (let k = 0; k < 3; k++) dd[i + k] = Math.min(255, Math.abs(db[i + k] - da[i + k]) * 4);
      dd[i + 3] = 255;
    }
    const n = w * h; let acc = 0, p99 = 0;
    for (let v = 0; v < 256; v++) { acc += levels[v]; if (acc >= 0.99 * n) { p99 = v; break; } }
    const k = Math.min(1, m / Math.max(w, h)), pw = Math.round(w * k), ph = Math.round(h * k), gap = 8;
    const c = document.createElement('canvas'); c.width = pw * 3 + gap * 2; c.height = ph;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingQuality = 'high';
    const dc = document.createElement('canvas'); dc.width = w; dc.height = h; dc.getContext('2d').putImageData(diff, 0, 0);
    [ia, ib, dc].forEach((im, j) => g.drawImage(im, j * (pw + gap), 0, pw, ph));
    return { url: c.toDataURL('image/jpeg', 0.85), stats: { size: [w, h], meanLevels: +(sum / n).toFixed(2), p99Levels: p99,
      changed: +(changed / n).toFixed(4), brighter: +(brighter / n).toFixed(4), darker: +(darker / n).toFixed(4) } };
  }, [A.image, B.image, size]);
  return { content: [{ type: 'image', data: r.url.split(',')[1], mimeType: 'image/jpeg' },
    { type: 'text', text: JSON.stringify({ b: photo ? 'photo' : settings ? { settings } : { look }, ...(region ? { region } : {}), difference: r.stats, metricsA: A.metrics, metricsB: B.metrics }, null, 1) }] };
}));

// One version of a batch: the CLI's batch job options, without its file.
const VERSION = z.object({
  name: z.string().optional(),
  look: z.union([z.string(), z.number().int()]).optional().describe('A look (list_looks), applied first after any preset'),
  strength: z.number().min(0).max(1).optional(),
  preset: z.union([z.string(), z.array(z.string())]).optional().describe('kind:name, e.g. "graze:Classic raking" (list_presets)'),
  addLights: z.array(z.object({ kind: z.enum(['light', 'shade', 'negative']).optional(), fields: z.record(z.string(), z.any()).optional() })).optional(),
  exposureAdd: z.number().optional().describe('Stops on top of the exposure the look set'),
  scale: z.record(z.string(), z.number()).optional().describe('Each setting times a factor, e.g. {"textureDepthMm": 1.2}'),
  set: z.record(z.string(), z.any()).optional().describe('Dotted paths, as set_settings'),
  guard: z.boolean().optional().describe('false: render it as set, unguarded'),
});
server.registerTool('batch_render', {
  title: 'Render several versions',
  description: 'Renders 2–12 versions of the picture in one pass (the relief is built once for versions that share it) and returns a contact sheet (each version labelled, the photo first) plus each version\'s metrics, guard note and settings changes. Each version starts from the current settings and is dressed in this order: preset, look, added lights, exposureAdd, scale, set, then the guard. Nothing is changed: apply the one you pick with set_settings (its changes are listed) or apply_look. out_dir also writes each version as a file there (NN-name.jpg, or .png with format png).',
  inputSchema: {
    versions: z.array(VERSION).min(2).max(12),
    width: z.number().int().min(128).max(4000).optional().describe('Render width, default 1000 (the photo\'s own at most)'),
    out_dir: z.string().optional().describe('Folder (absolute) to write each version into'),
    format: z.enum(['jpg', 'png']).optional(),
    thumb: z.number().int().min(120).max(600).optional().describe('Contact sheet tile size, default 300'),
  },
}, tool(async ({ page: pg, call }, { versions, width, out_dir, format, thumb }) => {
  await needOpen(call);
  const base = await call('settings'), dressed = await call('versions', versions), fmt = format || 'jpg';
  const W = Math.min((await call('info')).photo.width, width || 1000);
  const items = [{ settings: { ...base, originalTop: 1 }, width: W, format: fmt === 'jpg' ? 'jpeg' : 'png' }, ...dressed.map((d) => ({ settings: d.settings, width: W, format: fmt === 'jpg' ? 'jpeg' : 'png', quality: 0.92 }))];
  const out = await call('exportMany', items, { metrics: true });
  const names = ['Photo', ...dressed.map((d) => d.name)];
  const files = [];
  if (out_dir) {
    fs.mkdirSync(out_dir, { recursive: true });
    out.slice(1).forEach((r, i) => {
      const f = path.join(out_dir, `${String(i + 1).padStart(2, '0')}-${names[i + 1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'version'}.${fmt}`);
      fs.writeFileSync(f, fromDataURL(r.image)); files.push(f);
    });
  }
  const sheet = await pg.evaluate(async ([urls, names, T]) => {
    const ims = await Promise.all(urls.map(async (u) => { const im = new Image(); im.src = u; await im.decode(); return im; }));
    const cols = Math.min(4, ims.length), rows = Math.ceil(ims.length / cols), label = 22, gap = 6;
    const c = document.createElement('canvas'); c.width = cols * (T + gap) + gap; c.height = rows * (T + label + gap) + gap;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingQuality = 'high';
    ims.forEach((im, i) => {
      const x = gap + (i % cols) * (T + gap), y = gap + Math.floor(i / cols) * (T + label + gap), k = Math.min(T / im.width, T / im.height);
      g.drawImage(im, x + (T - im.width * k) / 2, y + label + (T - im.height * k) / 2, im.width * k, im.height * k);
      g.fillStyle = '#111'; g.font = '13px sans-serif'; g.fillText(`${i ? String(i).padStart(2, '0') : '—'} ${names[i]}`.slice(0, 44), x, y + 15);
    });
    return c.toDataURL('image/jpeg', 0.85);
  }, [out.map((r) => r.image), names, thumb || 300]);
  // What each version changed from the settings it started from (top level, objects one level down).
  const changed = (s) => {
    const o = {}, same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    for (const k of Object.keys(s)) {
      if (same(base[k], s[k])) continue;
      if (base[k] && s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) { o[k] = {}; for (const j of Object.keys(s[k])) if (!same(base[k][j], s[k][j])) o[k][j] = s[k][j]; } else o[k] = s[k];
    }
    return o;
  };
  const list = dressed.map((d, i) => ({ n: i + 1, name: d.name, ...(files[i] ? { file: files[i] } : {}), ...(d.guard ? { guard: d.guard } : {}),
    warnings: out[i + 1].metrics?.warnings || [], metrics: out[i + 1].metrics, changed: changed(d.settings) }));
  return { content: [{ type: 'image', data: sheet.split(',')[1], mimeType: 'image/jpeg' }, { type: 'text', text: JSON.stringify({ width: W, versions: list }, null, 1) }] };
}));

server.registerTool('export_image', {
  title: 'Export the image',
  description: 'Writes the relit painting to a file: full size (the photo\'s own resolution, tiled) or width px wide. The format comes from the extension (.png, .jpg, .webp). crop renders only part of it at full detail (a 100% loupe, much faster than the whole). Returns the file\'s metrics against the photo at the same size (as render_preview\'s, at full detail), and writes a record beside it (same name, .json: the settings, look, guard and metrics that made it, so it can be made again; record false skips it). Slow without a GPU for big photos: past about 45 s it keeps running in the background and says so; call export_image again with the same path to wait for it (other tools wait for it too).',
  inputSchema: {
    path: z.string().describe('Absolute path ending .png, .jpg or .webp'),
    width: z.number().int().min(64).max(20000).optional().describe('Width in px; default the photo\'s full size'),
    crop: z.object({ x: z.number().min(0), y: z.number().min(0), w: z.number().positive(), h: z.number().positive() }).optional()
      .describe('Part of the image (at that width) to write: pixels, or all four 0–1 as fractions, e.g. {"x":0.4,"y":0.4,"w":0.2,"h":0.2}'),
    quality: z.number().min(0).max(1).optional().describe('JPEG/WebP quality 0–1, default 0.92'),
    record: z.boolean().optional().describe('Write FILE.json beside it (default true)'),
    change_map: CHANGE_MAP.optional().describe('Also write the change map as FILE-change.png beside it, at the same size (see render_preview); its numbers go in the answer and the record'),
  },
}, tool(async ({ call }, { path: p, width, crop, quality, record, change_map }) => {
  await needOpen(call);
  const f = filePath(p), format = FORMATS[path.extname(f).toLowerCase()];
  if (!format) throw new Error('path must end .png, .jpg or .webp.');
  if (!fs.existsSync(path.dirname(f))) throw new Error(`No such folder: ${path.dirname(f)}`);
  return waitExport(async () => {
    const t0 = Date.now(), r = await call('export', { format, quality: quality ?? 0.92, width, crop, metrics: true, change: change_map ? { map: change_map } : undefined }), buf = fromDataURL(r.image);
    fs.writeFileSync(f, buf);
    let change = null;
    if (r.change) {
      const cf = f.replace(/\.[^./\\]+$/, '') + '-change.png';
      fs.writeFileSync(cf, fromDataURL(r.change.image));
      change = { file: cf, ...r.change.stats };
    }
    const rec = record === false ? null : await writeRecord(call, f, { input: opened, job: { width, crop }, output: { format, ...(width ? { width } : {}), ...(crop ? { crop } : {}), pixels: r.pixels }, metrics: r.metrics, change });
    return { path: f, bytes: buf.length, seconds: Math.round((Date.now() - t0) / 1000), ...(rec ? { record: rec } : {}), ...(await call('info')), pixelsSha256: r.pixels?.sha256 ?? null, metrics: r.metrics, ...(change ? { change } : {}) };
  }, f);
}));

server.registerTool('measure_relief', {
  title: 'Measure the relief from lamp or sun photos',
  description: 'Replaces the relief estimated from the open (evenly lit) photo with relief measured from more photos of the painting: each with one lamp close to the wall (lamp: where it was, in cm from the painting\'s left and top edges and out from its face; same tripod), or in sunlight (sun: where it came from, degrees anticlockwise from the right: 0 right, 90 above, 180 left, and its angle to the painting\'s face). Every photo must be cropped exactly like the open one, or be handheld: a photo shaped unlike the open one (or with line_up) is lined up on it first, by matching features (the painting must fill a good part of it). One sun angle cannot tell the depth, so give deepest_mm (the artist\'s relief from the lowest point to the highest: 1/8 in below the average surface plus 1/8 in above it is 1/4 in, 6.35 mm) when you have it. Slow without a GPU (a minute or more). Returns the depth measured, how well each photo lined up (with lineUp for one lined up from a handheld shot), and (with 3+ photos) how well each is predicted by the others.',
  inputSchema: {
    photos: z.array(z.object({
      path: z.string().describe('Absolute path to the photo (.jpg/.png/.webp)'),
      sun: z.object({ from_deg: z.number().describe('Where the sun came from, in the picture: 0 right, 90 above, 180 left'), angle_deg: z.number().min(1).max(89).describe('Its angle to the painting\'s face') }).optional(),
      lamp: z.object({ left_cm: z.number(), above_cm: z.number(), out_cm: z.number().positive() }).optional(),
      line_up: z.boolean().optional().describe('Line it up on the open photo first (a handheld photo from another spot); by default only a photo shaped unlike the open one is'),
    })).min(1),
    painting_width_cm: z.number().positive().optional().describe('The painting\'s width (else as set)'),
    deepest_mm: z.number().positive().optional().describe('The relief from the lowest point to the highest (not from the average surface), in mm (sets the depth)'),
  },
}, changing(async ({ call }, { photos, painting_width_cm, deepest_mm }) => {
  await needOpen(call);
  const list = photos.map((p) => {
    const f = filePath(p.path);
    if (!fs.existsSync(f)) throw new Error(`No such file: ${f}`);
    if (!p.sun === !p.lamp) throw new Error(`${path.basename(f)}: give either sun or lamp.`);
    return { src: dataURL(f), name: path.basename(f), ...(p.line_up != null ? { lineUp: p.line_up } : {}), ...(p.sun ? { sun: { azimuthDeg: p.sun.from_deg, elevationDeg: p.sun.angle_deg } } : { lamp: { left: p.lamp.left_cm, above: p.lamp.above_cm, out: p.lamp.out_cm } }) };
  });
  return call('measureRelief', { photos: list, widthCm: painting_width_cm, deepestMm: deepest_mm });
}));

server.registerTool('save_project', {
  title: 'Save the project',
  description: 'Saves the photo, every setting and any measured relief as a .digilight.json project, which the app (Projects › Import) or open_project can open again.',
  inputSchema: { path: z.string().describe('Absolute path ending .digilight.json'), name: z.string().optional() },
}, tool(async ({ call }, { path: p, name }) => {
  await needOpen(call);
  const f = filePath(/\.json$/i.test(p) ? p : p + '.digilight.json');
  if (!fs.existsSync(path.dirname(f))) throw new Error(`No such folder: ${path.dirname(f)}`);
  fs.writeFileSync(f, JSON.stringify(await call('getProject', name ? { name } : {})));
  return { path: f };
}));

async function main() {
  await server.connect(new StdioServerTransport());
  log('MCP server on stdio');
  const quit = async () => { if (session) await (await session.catch(() => null))?.close(); process.exit(0); };
  process.stdin.on('close', quit);
  process.on('SIGINT', quit); process.on('SIGTERM', quit);
}
main().catch((e) => { log(cleanError(e)); process.exit(1); });
