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
// options (applied in this order):
//   --preset kind:name   lighting:"Gallery track", graze:"Classic raking", looks:"07 Brighter"
//   --set "a=1;graze.opacity=0.5"   or JSON '{"exposure":0.3}' (repeatable)
//   --look NAME|N  [--strength 0..1]   Analyze, then apply that look
//   --out FILE (.png/.jpg/.webp)  --width N  --preview  --quality 0..1
//   --save-project FILE.digilight.json   --path a.b   --port N
// Exit code 1 with the error on stderr when anything fails.
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };

function parseArgs(argv) {
  const o = { _: [], set: [], preset: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { o._.push(a); continue; }
    const k = a.slice(2), flag = ['preview', 'help'].includes(k);
    const v = flag ? true : argv[++i];
    if (!flag && v === undefined) throw new Error(`--${k} needs a value`);
    if (k === 'set' || k === 'preset') o[k].push(v); else o[k] = v;
  }
  return o;
}

function serve(port) {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(ROOT, p === '/' ? 'index.html' : p);
    if (!file.startsWith(ROOT + path.sep) && file !== ROOT) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

// "a=1;b.c=0.5" or JSON (same as src/automation.js parseSets).
function parseSets(t) {
  t = String(t).trim();
  if (t.startsWith('{')) return JSON.parse(t);
  const out = {};
  for (const part of t.split(/[;&]/)) {
    const i = part.indexOf('='); if (i < 1) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    out[k] = v === 'true' ? true : v === 'false' ? false : v !== '' && Number.isFinite(+v) ? +v : v;
  }
  return out;
}
const dataURL = (file) => `data:${TYPES[path.extname(file).toLowerCase()] || 'image/jpeg'};base64,${fs.readFileSync(file).toString('base64')}`;

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const [cmd, input] = o._;
  if (o.help || !cmd) { process.stdout.write(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 22).map((l) => l.replace(/^\/\/ ?/, '')).join('\n') + '\n'); return; }
  if (!['info', 'analyze', 'describe', 'get', 'render'].includes(cmd)) throw new Error(`Unknown command "${cmd}" (info, analyze, describe, get, render).`);
  if (!input) throw new Error('Give an input: a photo, a .digilight.json project, or sample:painting.');
  if (cmd === 'render' && !o.out) throw new Error('render needs --out FILE.');

  const { chromium } = require('playwright');
  const server = await serve(+(o.port || 0));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.DIGILIGHT_BROWSER || undefined,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1350, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?synth`);
    await page.waitForFunction(() => window.digilight, null, { timeout: 60000 });
    const call = (method, ...args) => page.evaluate(([m, a]) => window.digilight[m](...a), [method, args]);

    // Open the input.
    if (/^sample:/.test(input)) await call('load', { sample: input.slice(7) });
    else if (/\.json$/i.test(input)) await call('setProject', fs.readFileSync(input, 'utf8'));
    else if (/^https?:/.test(input)) await call('load', input);
    else { if (!fs.existsSync(input)) throw new Error(`No such file: ${input}`); await call('load', dataURL(input)); }

    for (const p of o.preset) { const i = p.indexOf(':'); if (i < 1) throw new Error('--preset is kind:name'); await call('applyPreset', p.slice(0, i), p.slice(i + 1)); }
    if (o.set.length) {
      const changes = {};
      for (const s of o.set) Object.assign(changes, parseSets(s));
      await call('set', changes);
    }
    let analysis = null;
    if (cmd === 'analyze' || o.look != null) analysis = await call('analyze');
    if (o.look != null) await call('applyLook', /^\d+$/.test(o.look) ? +o.look : o.look, { strength: o.strength != null ? +o.strength : 1 });

    let out;
    if (cmd === 'info') out = await call('info');
    else if (cmd === 'analyze') out = analysis;
    else if (cmd === 'describe') out = await call('describe');
    else if (cmd === 'get') out = await call('get', o.path ?? null);
    else {
      const format = (path.extname(o.out).slice(1) || 'png').toLowerCase();
      const opts = { format, quality: o.quality != null ? +o.quality : 0.92 };
      const url = o.preview ? await call('render', opts) : await call('export', { ...opts, width: o.width ? +o.width : undefined });
      fs.writeFileSync(o.out, Buffer.from(url.split(',')[1], 'base64'));
      out = { out: path.resolve(o.out), ...(await call('info')), look: o.look ?? null };
    }
    if (o['save-project']) { fs.writeFileSync(o['save-project'], JSON.stringify(await call('getProject'))); out = { ...out, project: path.resolve(o['save-project']) }; }
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    if (errors.length) process.stderr.write('page errors:\n' + errors.join('\n') + '\n');
  } finally {
    await browser.close();
    server.close();
  }
}
main().catch((e) => { process.stderr.write((e && e.message ? e.message.replace(/^page\.evaluate: (Error: )?/, '').split('\n    at ')[0] : String(e)) + '\n'); process.exit(1); });
