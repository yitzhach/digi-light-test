// repeat-look.cjs — the same look, applied the same way in fresh pages, must export the same
// pixels. KNOWN TO FAIL (10-21), kept as the reproduction until fixed: on the red-panel sample,
// Analyze (cached) + applyLook('Favourite, side lamp left') + guard, exported 900 px wide, came out
// as 16bbac5634c7… in some pages and 5115842ea099… in others (speckled apart over most pixels,
// up to 99 levels), though every JSON-able field of __bench.state was the same. Setting the
// recorded settings directly (setSettings) gave 16bbac5634c7… every time, so the look path leaves
// something outside the state (GPU-side: G-buffer caches, smoothing textures?) that the export
// then uses. Takes a few minutes in software GL (each run a fresh page).
//   DIGILIGHT_BROWSER=/opt/pw-browsers/chromium node tests/repeat-look.cjs [runs]
const path = require('path');
const { launch, analyzeCached } = require(path.join(__dirname, '..', 'tools', 'digilight-headless.cjs'));
const RUNS = +process.argv[2] || 4;

(async () => {
  const seen = [];
  for (let i = 0; i < RUNS; i++) {
    const s = await launch();
    try {
      await s.call('load', { sample: 'painting' });
      await s.call('setGuard', false);
      await analyzeCached(s.call, 'sample:painting', { input: 'sample:painting', fresh: false });
      await s.call('applyLook', 'Favourite, side lamp left', { strength: 1 });
      await s.call('guard', {});
      const h = (await s.call('export', { format: 'png', hash: true, width: 900 })).pixels.sha256;
      seen.push(h);
      console.log(`run ${i + 1}: ${h.slice(0, 16)}`);
    } finally { await s.close(); }
  }
  const kinds = [...new Set(seen)];
  if (kinds.length > 1) { console.error(`FAIL: ${kinds.length} different pictures from the same look in ${RUNS} runs`); process.exit(1); }
  console.log(`PASS: the same picture in all ${RUNS} runs`);
})().catch((e) => { console.error(e); process.exit(1); });
