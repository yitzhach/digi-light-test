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
const { parseSets, fromDataURL, cleanError, launch, openInput, preview, analyzeCached, writeRecord } = require('./digilight-headless.cjs');

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
    'DigiLight relights a photo of a painting with virtual lamps over its estimated paint relief (impasto).',
    'Typical flow: open_image → analyze (slow: 1–3 min) → apply_look → render_preview to see it → set_settings to adjust → render_preview again → export_image.',
    'Fixed presets (apply_preset) need no analyze. describe_settings lists every setting with its range; set_settings checks values and changes nothing on an error.',
    'Until open_image, a synthetic test painting is open. Each change is one undo step (undo / redo). Use absolute file paths. Always look (render_preview) before telling the user how a change looks, and check the metrics it returns (warnings name blown whites, crushed darks or lost texture). Each change is guarded: if it would blow whites or crush darks, highlight rolloff / exposure / shadow lift / room light are moved just enough to stop it, in the same undo step, and the answer says so ("Guard: exposure +0.80 → +0.55"). guard checks and fixes on request; set_guard turns it off when the user really wants the clipping.',
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

server.registerTool('list_presets', {
  title: 'List presets',
  description: 'Fixed presets by kind: lighting (lamp scenes), graze (raking light presets), looks (matched looks). Applied with apply_preset; no analyze needed.',
  inputSchema: {},
}, tool(async ({ call }) => call('presets')));

server.registerTool('apply_preset', {
  title: 'Apply a preset',
  description: 'Applies a fixed preset: kind "lighting" (a lamp scene), "graze" (a raking light preset) or "looks" (a matched look). Names from list_presets.',
  inputSchema: { kind: z.enum(['lighting', 'graze', 'looks']), name: z.string() },
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
  description: 'Checks the picture as it stands against the photo: share of pixels newly blown to white / crushed to black, limits 0.3% / 0.15%. With fix (default true) it brings them back under the limits (highlight rolloff, then exposure; shadow lift, then room light), as one undo step, and says what it moved.',
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

server.registerTool('render_preview', {
  title: 'See the result',
  description: 'Renders the relit painting at preview size and returns it as an image (JPEG, max_size px on its long side, default 800) so you can see it, plus its metrics against the photo (measured at preview size): newly blown / crushed share, darks lift, tone shift in stops, detail kept per scale (1 = the photo\'s), left/centre/right brightness, and warnings in words. Use it after changes, before describing the result; read the warnings too, the user never wants blown whites, crushed darks or blur.',
  inputSchema: { max_size: z.number().int().min(128).max(2000).optional() },
}, tool(async ({ page: pg, call }, { max_size }) => {
  await needOpen(call);
  const { url, metrics } = await preview(pg, call, max_size || 800, 0.85, true);
  return { content: [{ type: 'image', data: url.split(',')[1], mimeType: 'image/jpeg' }, { type: 'text', text: JSON.stringify({ metrics }, null, 1) }] };
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
  },
}, tool(async ({ call }, { path: p, width, crop, quality, record }) => {
  await needOpen(call);
  const f = filePath(p), format = FORMATS[path.extname(f).toLowerCase()];
  if (!format) throw new Error('path must end .png, .jpg or .webp.');
  if (!fs.existsSync(path.dirname(f))) throw new Error(`No such folder: ${path.dirname(f)}`);
  return waitExport(async () => {
    const t0 = Date.now(), r = await call('export', { format, quality: quality ?? 0.92, width, crop, metrics: true }), buf = fromDataURL(r.image);
    fs.writeFileSync(f, buf);
    const rec = record === false ? null : await writeRecord(call, f, { input: opened, job: { width, crop }, output: { format, ...(width ? { width } : {}), ...(crop ? { crop } : {}) }, metrics: r.metrics });
    return { path: f, bytes: buf.length, seconds: Math.round((Date.now() - t0) / 1000), ...(rec ? { record: rec } : {}), ...(await call('info')), metrics: r.metrics };
  }, f);
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
