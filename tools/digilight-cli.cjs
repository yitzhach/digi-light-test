#!/usr/bin/env node
// digilight-cli.cjs — DigiLight from the command line, for scripts and AI agents.
// Runs the app headless (Playwright + Chromium) and drives window.digilight
// (src/automation.js). Serves the repository itself; no server needed. See docs/automation.md.
//
//   node tools/digilight-cli.cjs <command> <input> [options]
//
// input: a photo (.jpg/.png/.webp path or http(s) URL), a project (.digilight.json),
//        or sample:painting / sample:dsc8382
// commands:
//   info       photo and preview size
//   analyze    Analyze: tone, light, strokes, depth, raking direction and the looks (JSON)
//   describe   every setting that can be set: path, label, range, value (JSON)
//   get        the settings (or --path one of them) after the options below (JSON)
//   render     write the relit painting to --out (full size unless --preview or --width)
//   batch      many renders from one Analyze: --jobs FILE.json, a list of
//              {"out": "a.jpg", "look": 4, "strength": 1, "preset": "kind:name", "set": "a=1;b=2",
//               "exposureAdd": 0.3, "scale": {"textureDepthMm": 1.2}, "addLights": [{"kind": "light", "fields": {"x": 1.1}}],
//               "width": 800, "crop": "x,y,w,h", "preview": false, "quality": 0.9}; each starts from the photo as opened
// options (applied in this order):
//   --preset kind:name   lighting:"Gallery track", graze:"Classic raking", looks:"07 Brighter"
//   --look NAME|N  [--strength 0..1]   Analyze, then apply that look
//   --set "a=1;graze.opacity=0.5"   or JSON '{"exposure":0.3}' (repeatable; after the look, so it wins)
//   --out FILE (.png/.jpg/.webp)  --width N  --preview  --quality 0..1
//   --crop x,y,w,h   only that part of the export, at full detail (pixels, or fractions of 1)
//   render and batch print each picture's metrics against the photo (clipping, darks, detail,
//   warnings; docs/automation.md); --no-metrics skips them
//   --jobs FILE.json   --save-project FILE.digilight.json   --path a.b   --port N
//   --fresh   Analyze again even if the cache has this photo (DIGILIGHT_CACHE: the cache
//             folder, default ~/.cache/digilight/analysis; 0 turns it off)
// Exit code 1 with the error on stderr when anything fails.
const fs = require('fs');
const path = require('path');
const { parseSets, fromDataURL, cleanError, launch, openInput, analyzeCached } = require('./digilight-headless.cjs');

function parseArgs(argv) {
  const o = { _: [], set: [], preset: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { o._.push(a); continue; }
    const k = a.slice(2), flag = ['preview', 'help', 'fresh', 'no-metrics'].includes(k);
    const v = flag ? true : argv[++i];
    if (!flag && v === undefined) throw new Error(`--${k} needs a value`);
    if (k === 'set' || k === 'preset') o[k].push(v); else o[k] = v;
  }
  return o;
}

// Preset(s), then the look, then (batch jobs) added lights, exposureAdd (stops on top of
// the exposure the look fitted) and scale (each path times a factor, on the value the look
// set, so "20% deeper" works on any photo), then the --set changes. Analyze (from the disk cache when it
// can, see digilight-headless.cjs) runs for `analyze`, or for a look when the page has none.
async function dress(call, j, analyze, src = {}) {
  const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
  for (const p of list(j.preset)) { const i = p.indexOf(':'); if (i < 1) throw new Error('--preset is kind:name'); await call('applyPreset', p.slice(0, i), p.slice(i + 1)); }
  let analysis = null;
  if (analyze || (j.look != null && !(await call('looks')).length)) analysis = await analyzeCached(call, src.input, src);
  if (j.look != null) await call('applyLook', /^\d+$/.test(String(j.look)) ? +j.look : j.look, { strength: j.strength != null ? +j.strength : 1 });
  for (const l of list(j.addLights)) await call('addLight', l.kind || 'light', l.fields || {});
  if (j.exposureAdd != null) await call('set', { exposure: Math.round(((await call('get', 'exposure')) + +j.exposureAdd) * 100) / 100 });
  if (j.scale) {
    // Kept inside each setting's range (digilight.describe()), so "20% deeper" stops at the top.
    const changes = {}, ranges = Object.fromEntries((await call('describe')).map((d) => [d.path, d]));
    for (const [p, k] of Object.entries(j.scale)) {
      const v = await call('get', p), r = ranges[p] || {};
      if (typeof v !== 'number') throw new Error(`scale: ${p} is not a number setting`);
      changes[p] = Math.min(r.max ?? Infinity, Math.max(r.min ?? -Infinity, Math.round(v * +k * 1e4) / 1e4));
    }
    await call('set', changes);
  }
  const sets = list(j.set);
  if (sets.length) {
    const changes = {};
    for (const s of sets) Object.assign(changes, typeof s === 'object' ? s : parseSets(s));
    await call('set', changes);
  }
  return analysis;
}

// Writes j.out; returns the picture's metrics (null with metrics off).
async function write(call, j, metrics = true) {
  const format = (path.extname(j.out).slice(1) || 'png').toLowerCase();
  const opts = { format, quality: j.quality != null ? +j.quality : 0.92, metrics };
  const r = j.preview ? await call('render', opts) : await call('export', { ...opts, width: j.width ? +j.width : undefined, crop: j.crop || undefined });
  fs.writeFileSync(j.out, fromDataURL(metrics ? r.image : r));
  return metrics ? r.metrics : null;
}

function readJobs(file) {
  if (!file) throw new Error('batch needs --jobs FILE.json (a list of {out, look, set, ...}).');
  const jobs = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(jobs) || !jobs.length || jobs.some((j) => !j || !j.out)) throw new Error('--jobs is a non-empty list, each with "out".');
  return jobs;
}

// Analyze once (the page keeps it), then each job from the settings the photo opened with.
// A job that fails (a bad setting, say) is reported and skipped; the exit code is 1 if any did.
// (Two pages rendering at once were tried, 10-19: on 4 CPUs no faster in total than one.)
async function runJobs(call, jobs, src, metrics) {
  const base = await call('settings');
  if (jobs.some((j) => j.look != null)) { const t = Date.now(), a = await analyzeCached(call, src.input, src); process.stderr.write(`analyzed in ${Math.round((Date.now() - t) / 1000)} s${a.cached ? ' (cached)' : ''}\n`); }
  let failed = 0;
  for (const j of jobs) {
    const t = Date.now();
    try {
      await call('setSettings', base);
      await dress(call, j, false);
      const m = await write(call, j, metrics);
      process.stdout.write(JSON.stringify({ out: path.resolve(j.out), look: j.look ?? null, s: Math.round((Date.now() - t) / 100) / 10, ...(m ? { metrics: m } : {}) }) + '\n');
    } catch (e) {
      failed++;
      process.stdout.write(JSON.stringify({ out: path.resolve(j.out), error: cleanError(e) }) + '\n');
    }
  }
  if (failed) process.exitCode = 1;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const [cmd, input] = o._;
  if (o.help || !cmd) { process.stdout.write(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 30).map((l) => l.replace(/^\/\/ ?/, '')).join('\n') + '\n'); return; }
  if (!['info', 'analyze', 'describe', 'get', 'render', 'batch'].includes(cmd)) throw new Error(`Unknown command "${cmd}" (info, analyze, describe, get, render, batch).`);
  if (!input) throw new Error('Give an input: a photo, a .digilight.json project, or sample:painting.');
  if (cmd === 'render' && !o.out) throw new Error('render needs --out FILE.');
  const jobs = cmd === 'batch' ? readJobs(o.jobs) : null;

  const { call, errors, close } = await launch({ port: +(o.port || 0) });
  try {
    await openInput(call, input);
    const src = { input, fresh: !!o.fresh };

    if (jobs) { await runJobs(call, jobs, src, !o['no-metrics']); if (errors.length) process.stderr.write('page errors:\n' + errors.join('\n') + '\n'); return; }
    const analysis = await dress(call, { preset: o.preset, look: o.look, strength: o.strength, set: o.set }, cmd === 'analyze', src);

    let out;
    if (cmd === 'info') out = await call('info');
    else if (cmd === 'analyze') out = analysis;
    else if (cmd === 'describe') out = await call('describe');
    else if (cmd === 'get') out = await call('get', o.path ?? null);
    else {
      const m = await write(call, o, !o['no-metrics']);
      out = { out: path.resolve(o.out), ...(await call('info')), look: o.look ?? null, ...(m ? { metrics: m } : {}) };
    }
    if (o['save-project']) { fs.writeFileSync(o['save-project'], JSON.stringify(await call('getProject'))); out = { ...out, project: path.resolve(o['save-project']) }; }
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    if (errors.length) process.stderr.write('page errors:\n' + errors.join('\n') + '\n');
  } finally {
    await close();
  }
}
main().catch((e) => { process.stderr.write(cleanError(e) + '\n'); process.exit(1); });
