// guard-options.cjs — renders the guard's alternatives side by side (10-20, for the user's pick):
// a too-bright and a too-dark case on the two samples, each fixed the way the guard does now and the
// other ways it could (exposure only; room light only, capped 0.3 / 0.6 / 1.0). Writes OUT/p and OUT/d
// (ORIG.jpg + one JPEG per version, 1600 px) and OUT/notes.json (what the guard did); the review page is
// tools/looks/review-ab.html filled from them (published 10-20: https://claude.ai/artifact/KReiYc3BimztEmr1HzPgQg).
//   DIGILIGHT_BROWSER=/opt/pw-browsers/chromium node tools/looks/guard-options.cjs OUT
const fs = require('fs'), path = require('path');
const { launch, openInput, fromDataURL } = require('../digilight-headless.cjs');
const OUT = process.argv[2];
const V = [
  ['W0', 'Too bright, as set (no guard)', 'bright', null],
  ['W1', 'Guard now: soften highlights first, then lower exposure', 'bright', {}],
  ['W2', 'Option: lower exposure only', 'bright', { whites: ['exposure'] }],
  ['D0', 'Too dark, as set (no guard)', 'dark', null],
  ['D1', 'Guard now: lift the raking shadows first, then room light (up to 0.6)', 'dark', {}],
  ['D2', 'Option: room light only, up to 0.6', 'dark', { darks: ['ambient'] }],
  ['D3', 'Option: room light only, up to 0.3 (gentler)', 'dark', { darks: ['ambient'], ambientMax: 0.3 }],
  ['D4', 'Option: room light only, up to 1.0 (stronger)', 'dark', { darks: ['ambient'], ambientMax: 1 }],
];
const PHOTOS = [['p', 'Red panel (painting)', 'sample:painting', 2.2], ['d', 'DSC_8382', 'sample:dsc8382', 3]];
(async () => {
  const s = await launch(); const { call } = s, notes = {};
  for (const [n, , input, bright] of PHOTOS) {
    await openInput(call, input); await call('setGuard', false);
    const base = await call('settings');
    const dir = path.join(OUT, n); fs.mkdirSync(dir, { recursive: true });
    const save = async (file) => fs.writeFileSync(path.join(dir, file), fromDataURL(await call('export', { width: 1600, format: 'jpeg', quality: 0.9 })));
    await call('setSettings', base); await call('set', { originalTop: 1 }); await save('ORIG.jpg');
    const cases = {
      bright: async () => { await call('applyPreset', 'lighting', 'Gallery track'); await call('set', { exposure: bright }); },
      dark: async () => { await call('applyPreset', 'lighting', 'Gallery track'); await call('applyPreset', 'graze', 'Classic raking'); await call('set', { exposure: -0.8, ambient: 0 }); },
    };
    for (const [id, name, c, opts] of V) {
      await call('setSettings', base); await cases[c]();
      let note = 'as set';
      if (opts) { const g = await call('guard', opts); note = g.note || 'nothing to fix'; }
      await save(id + '.jpg');
      notes[n + '-' + id] = note; console.log(n, id, note);
    }
  }
  fs.writeFileSync(path.join(OUT, 'notes.json'), JSON.stringify(notes, null, 1));
  await s.close();
})();
