// digilight-headless.cjs — DigiLight in a headless browser, shared by the command line
// (digilight-cli.cjs) and the MCP server (digilight-mcp.cjs).
//
// Serves the repository on 127.0.0.1 (or uses DIGILIGHT_URL, e.g. the live site), opens
// the app in Chromium through Playwright and calls window.digilight (src/automation.js).
// Environment: DIGILIGHT_BROWSER  a Chromium executable (cloud sessions: /opt/pw-browsers/chromium)
//              DIGILIGHT_GPU=1    use the computer's GPU instead of software GL (faster where it works)
//              DIGILIGHT_URL      the app's address instead of serving this repository
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const PHOTO = /\.(jpe?g|png|webp)$/i;

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
  return new Promise((resolve, reject) => { server.on('error', reject); server.listen(port || 0, '127.0.0.1', () => resolve(server)); });
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
const fromDataURL = (url) => Buffer.from(String(url).split(',')[1], 'base64');
// "page.evaluate: Error: No look …\n    at …" → "No look …"
const cleanError = (e) => (e && e.message ? e.message.replace(/^page\.evaluate: (Error: )?/, '').split('\n    at ')[0] : String(e));

/** Opens the app headless. Returns {page, call(method, ...args), errors, close()}. */
async function launch(opts = {}) {
  const { chromium } = require('playwright');
  const base = process.env.DIGILIGHT_URL;
  const server = base ? null : await serve(opts.port);
  const gpu = process.env.DIGILIGHT_GPU === '1';
  const browser = await chromium.launch({ headless: true, executablePath: process.env.DIGILIGHT_BROWSER || undefined,
    args: gpu ? ['--no-sandbox', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const close = async () => { await browser.close().catch(() => {}); if (server) server.close(); };
  try {
    const page = await browser.newPage({ viewport: { width: 1350, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const url = base ? new URL('?synth', base.replace(/\/?$/, '/')).href : `http://127.0.0.1:${server.address().port}/?synth`;
    await page.goto(url);
    await page.waitForFunction(() => window.digilight, null, { timeout: 60000 });
    const call = async (method, ...args) => {
      try { return await page.evaluate(([m, a]) => window.digilight[m](...a), [method, args]); } catch (e) { throw new Error(cleanError(e)); }
    };
    return { page, call, errors, close };
  } catch (e) { await close(); throw e; }
}

/** Opens a photo path, http(s) URL, .digilight.json project or sample:name. Returns info(). */
async function openInput(call, input) {
  input = String(input || '').trim();
  if (!input) throw new Error('Give an input: a photo, a .digilight.json project, or sample:painting.');
  if (/^sample:/.test(input)) return call('load', { sample: input.slice(7) });
  if (/^https?:/.test(input)) return /\.json(\?|$)/i.test(input) ? call('setProject', await (await fetch(input)).text()) : call('load', input);
  if (!fs.existsSync(input)) throw new Error(`No such file: ${input}`);
  if (/\.json$/i.test(input)) return call('setProject', fs.readFileSync(input, 'utf8'));
  if (!PHOTO.test(input)) throw new Error(`${path.basename(input)}: open a .jpg, .png or .webp photo, or a .digilight.json project.`);
  return call('load', dataURL(input));
}

/** The preview, shrunk to fit `maxSize` px on its long side, as a JPEG data URL; with
 *  `metrics` it returns {url, metrics} (measured at the preview's own size). */
async function preview(page, call, maxSize = 800, quality = 0.85, metrics = false) {
  const r = await call('render', { format: 'png', metrics });
  const url = await page.evaluate(async ([u, m, q]) => {
    const im = new Image(); im.src = u; await im.decode();
    const k = Math.min(1, m / Math.max(im.width, im.height));
    const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  }, [metrics ? r.image : r, maxSize, quality]);
  return metrics ? { url, metrics: r.metrics } : url;
}

// Analyze, cached on disk: DIGILIGHT_CACHE (default ~/.cache/digilight/analysis; "0" = off).
// The file name hashes the app's code (src/), the input (a file's bytes, else its name) and
// the page's own key (the settings and preview size the analysis starts from), so a change
// to any of them misses. A hit loads in a second or two instead of 1–3 minutes.
const crypto = require('crypto');
const os = require('os');
const sha = (...parts) => { const h = crypto.createHash('sha256'); for (const p of parts) h.update(p); return h.digest('hex'); };
let codeHash = null;
function code() {
  if (!codeHash) {
    const dir = path.join(ROOT, 'src');
    codeHash = sha(...fs.readdirSync(dir).sort().map((f) => f + fs.readFileSync(path.join(dir, f), 'utf8')));
  }
  return codeHash;
}
function cacheDir() {
  const v = process.env.DIGILIGHT_CACHE;
  return v === '0' ? null : v || path.join(os.homedir(), '.cache', 'digilight', 'analysis');
}
const inputId = (input) => { input = String(input || ''); return !/^(sample:|https?:)/.test(input) && fs.existsSync(input) ? sha(fs.readFileSync(input)) : input; };

/** Analyze the open photo (opened from `input`), from the cache when it can. Returns the summary with cached: true|false. */
async function analyzeCached(call, input, opts = {}) {
  const dir = cacheDir();
  if (!dir || input == null) return { ...(await call('analyze')), cached: false };
  const info = await call('info');
  const file = path.join(dir, sha(code(), inputId(input), JSON.stringify([await call('settings'), info.preview, info.measuredRelief])) + '.json');
  if (!opts.fresh && fs.existsSync(file)) {
    try { return { ...(await call('setAnalysis', fs.readFileSync(file, 'utf8'))), cached: true }; } catch { /* stale or broken: analyze again */ }
  }
  const out = await call('analyze');
  try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(await call('getAnalysis'))); } catch { /* read-only disk: no cache */ }
  return { ...out, cached: false };
}

/** The record to keep beside an exported picture (digilight.record() plus what only the caller
 *  knows): the app's code hash, the input (name and, for a file, its sha256), the recipe that made
 *  it (`job`), the output, the guard's note and the metrics. Written as FILE.json beside FILE.jpg. */
async function writeRecord(call, file, { input, job, output, guard, metrics } = {}) {
  const id = inputId(input);
  const rec = await call('record', { code: code(), input: input == null ? null : { name: String(input), ...(id !== String(input) ? { sha256: id } : {}) },
    job: job || null, output: { file: path.basename(file), ...(output || {}) }, guard: guard || null, metrics: metrics || null });
  const out = file.replace(/\.[^./\\]+$/, '') + '.json';
  fs.writeFileSync(out, JSON.stringify(rec, null, 1));
  return out;
}

module.exports = { ROOT, TYPES, serve, parseSets, dataURL, fromDataURL, cleanError, launch, openInput, preview, analyzeCached, writeRecord, codeHash: () => code(), inputId };
