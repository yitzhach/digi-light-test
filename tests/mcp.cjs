// mcp.cjs — the MCP server (tools/digilight-mcp.cjs) end to end, as an assistant would use it:
// spawn it over stdio, list the tools, open the sample, change settings, see the preview,
// export, save and reopen a project. `--full` also runs analyze + apply_look (minutes in software GL).
//   cd tools && npm install && cd .. && node tests/mcp.cjs [--full]
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const tools = path.resolve(__dirname, '../tools');
const req = require('module').createRequire(path.join(tools, 'package.json'));
const { Client } = req('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = req('@modelcontextprotocol/sdk/client/stdio.js');

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'digilight-mcp-'));
const full = process.argv.includes('--full');
(async () => {
  const client = new Client({ name: 'digilight-test', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(tools, 'digilight-mcp.cjs')], env: process.env, stderr: 'inherit' }));
  let progress = 0;
  const call = async (name, args = {}) => {
    const r = await client.callTool({ name, arguments: args }, undefined, { timeout: 900000, resetTimeoutOnProgress: true, onprogress: () => progress++ });
    const t = r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    return { r, t, json: () => JSON.parse(r.content[0].text) };
  };
  const ok = async (name, args) => { const x = await call(name, args); assert.ok(!x.r.isError, `${name}: ${x.t}`); return x; };
  try {
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    for (const n of ['open_image', 'open_project', 'info', 'analyze', 'list_looks', 'apply_look', 'list_presets', 'apply_preset', 'add_light', 'remove_light', 'describe_settings', 'get_settings', 'set_settings', 'undo', 'redo', 'render_preview', 'export_image', 'save_project'])
      assert.ok(names.includes(n), 'missing tool ' + n);
    assert.ok((await client.getInstructions?.() || '').includes('open_image'), 'server instructions');
    console.log('PASS mcp lists its tools');

    const start = (await ok('info')).json();
    assert.ok(start.photo && start.sample === null, 'starts on the synthetic test painting ' + JSON.stringify(start));
    let x = await call('open_image', { source: '/nope/missing.jpg' });
    assert.ok(x.r.isError && /No such file/.test(x.t));
    const info = (await ok('open_image', { source: 'sample:painting' })).json();
    assert.ok(info.photo.width > 1000 && info.preview.width > 0 && info.sample === 'painting', JSON.stringify(info));
    console.log('PASS open_image sample, errors as tool errors');

    const d = (await ok('describe_settings', { filter: 'graze' })).json();
    assert.ok(d.length >= 10 && d.every((r) => /graze/i.test(r.path + r.label)) && d.some((r) => r.path === 'graze.opacity' && r.max === 1), JSON.stringify(d.slice(0, 3)));
    const presets = (await ok('list_presets')).json();
    assert.ok(presets.lighting.length && presets.graze.includes('Classic raking'), JSON.stringify(presets));
    const p0 = (await ok('render_preview', { max_size: 400 })).r.content[0];
    assert.equal(p0.type, 'image'); assert.equal(p0.mimeType, 'image/jpeg');
    const jpg = Buffer.from(p0.data, 'base64');
    assert.ok(jpg[0] === 0xff && jpg[1] === 0xd8 && jpg.length > 5000, 'a JPEG');
    const w = jpg.readUInt16BE(jpg.indexOf(Buffer.from([0xff, 0xc0])) + 7), h = jpg.readUInt16BE(jpg.indexOf(Buffer.from([0xff, 0xc0])) + 5);
    assert.ok(Math.max(w, h) === 400, `preview ${w}x${h}`);
    const pm = JSON.parse((await ok('render_preview', { max_size: 400 })).r.content[1].text).metrics;
    assert.ok(pm.render.p50 > 0 && pm.photo && pm.vsPhoto.detail.fine > 0 && Array.isArray(pm.warnings), 'render_preview metrics ' + JSON.stringify(pm));
    console.log('PASS describe_settings filter, list_presets, render_preview image and metrics');

    const set = (await ok('set_settings', { changes: { exposure: 0.4, 'graze.enabled': true, 'graze.opacity': 0.6 } })).json();
    assert.deepEqual(set, { exposure: 0.4, 'graze.enabled': true, 'graze.opacity': 0.6 });
    assert.equal((await ok('get_settings', { path: 'graze.opacity' })).json(), 0.6);
    x = await call('set_settings', { changes: { 'graze.opacity': 7 } });
    assert.ok(x.r.isError && /nothing changed/.test(x.t), x.t);
    x = await call('set_settings', { changes: 'no.such=1' });
    assert.ok(x.r.isError && /Unknown setting/.test(x.t), x.t);
    assert.equal((await ok('get_settings', { path: 'graze.opacity' })).json(), 0.6, 'a failed set changes nothing');
    await ok('set_settings', { changes: 'exposure=0.1' });
    const p1 = (await ok('render_preview', { max_size: 400 })).r.content[0].data;
    assert.notEqual(p1, p0.data, 'the preview follows the settings');
    assert.deepEqual((await ok('undo')).json(), { undone: true });
    assert.equal((await ok('get_settings', { path: 'exposure' })).json(), 0.4);
    assert.deepEqual((await ok('redo')).json(), { redone: true });
    assert.equal((await ok('get_settings', { path: 'exposure' })).json(), 0.1);
    await ok('apply_preset', { kind: 'graze', name: 'Classic raking' });
    x = await call('apply_preset', { kind: 'graze', name: 'Nope' });
    assert.ok(x.r.isError && /Classic raking/.test(x.t), x.t);
    const sh = (await ok('add_light', { kind: 'shade', fields: { x: 0.3, y: 0.7, aimX: 0.3, aimY: 0.7, dark: 0.5 } })).json();
    assert.ok(sh.index === 1 && sh.light.kind === 'shade' && sh.light.dark === 0.5, JSON.stringify(sh));
    x = await call('add_light', { kind: 'shade', fields: { dark: 3 } });
    assert.ok(x.r.isError && /darkness/.test(x.t), x.t);
    assert.deepEqual((await ok('remove_light', { index: 1 })).json(), { lights: 1 });
    console.log('PASS set_settings (checked, one undo step), undo/redo, apply_preset, add_light / remove_light');

    const png = path.join(out, 'relit.png');
    const e = (await ok('export_image', { path: png, width: 320 })).json();
    const b = fs.readFileSync(png);
    assert.ok(e.path === png && b.readUInt32BE(16) === 320 && b.slice(1, 4).toString() === 'PNG', JSON.stringify(e));
    const crop = path.join(out, 'crop.png');
    const c = (await ok('export_image', { path: crop, width: 320, crop: { x: 0.5, y: 0, w: 0.5, h: 0.25 } })).json();
    assert.ok(c.path === crop && fs.readFileSync(crop).readUInt32BE(16) === 160, 'crop: half of 320 px ' + JSON.stringify(c));
    assert.ok(c.metrics.size[0] === 160 && c.metrics.crop && e.metrics.vsPhoto, 'export metrics ' + JSON.stringify(c.metrics));
    x = await call('export_image', { path: path.join(out, 'relit.gif') });
    assert.ok(x.r.isError && /\.png/.test(x.t));
    const proj = path.join(out, 'mine.digilight.json');
    await ok('save_project', { path: proj, name: 'MCP test' });
    const saved = JSON.parse(fs.readFileSync(proj, 'utf8'));
    assert.ok(saved.format === 'digilight' && saved.settings.exposure === 0.1, 'project saved');
    await ok('set_settings', { changes: { exposure: -1 } });
    await ok('open_project', { path: proj });
    assert.equal((await ok('get_settings', { path: 'exposure' })).json(), 0.1, 'project reopened');
    console.log('PASS export_image (file, width, crop), save_project, open_project');

    if (full) {
      // Analyze answers within 45 s; while it runs in the background it says so, and calling again keeps waiting.
      let a = (await ok('analyze')).json(), rounds = 1;
      while (a.stillAnalyzing) { assert.ok(/still running/.test((await ok("list_looks")).t), 'list_looks while analyzing'); a = (await ok('analyze')).json(); rounds++; }
      assert.ok(a.looks.length >= 8 && a.depthMm > 0, JSON.stringify(a).slice(0, 300));
      const looks = (await ok('list_looks')).json();
      const r = (await ok('apply_look', { look: looks[1].name, strength: 0.5 })).json();
      assert.deepEqual(r, { look: looks[1].name, strength: 0.5 });
      assert.ok(progress > 0, 'progress notifications during analyze');
      console.log(`PASS analyze (${a.looks.length} looks, ${rounds} calls, ${progress} progress beats), apply_look`);
    }
  } finally {
    await client.close();
    fs.rmSync(out, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
