// repeat-look.cjs — the same look, applied the same way in fresh pages, must export the same
// pixels. Found by verify (10-21), fixed 10-22: on the red-panel sample, Analyze + applyLook
// ('Favourite, side lamp left') + guard, exported 900 px wide, came out as one of two pictures
// (speckled apart over most pixels, up to 99 levels) with every setting the same. The photo
// reached the relief a level apart: the browser's high-quality downscale for resized exports is
// not stable under load (two pages at once, or a fresh Analyze, gave the other picture), and a
// JPEG drawn into GPU- and CPU-backed canvases differs. Now the photo is decoded once (app.js
// pinPixels) and resized by src/resample.js. So the pages here run two at a time, the first
// with a fresh Analyze, the rest from the cache: the conditions that broke it.
//   DIGILIGHT_BROWSER=/opt/pw-browsers/chromium node tests/repeat-look.cjs [runs]
const path = require('path');
const { launch, analyzeCached } = require(path.join(__dirname, '..', 'tools', 'digilight-headless.cjs'));
const RUNS = +process.argv[2] || 4, AT_ONCE = 2;

async function one(i) {
  const s = await launch();
  try {
    await s.call('load', { sample: 'painting' });
    await s.call('setGuard', false);
    const a = await analyzeCached(s.call, 'sample:painting', { input: 'sample:painting', fresh: i === 0 });
    await s.call('applyLook', 'Favourite, side lamp left', { strength: 1 });
    await s.call('guard', {});
    const h = (await s.call('export', { format: 'png', hash: true, width: 900 })).pixels.sha256;
    console.log(`run ${i + 1} (${a.cached ? 'cached' : 'fresh'} Analyze): ${h.slice(0, 16)}`);
    return h;
  } finally { await s.close(); }
}

(async () => {
  const seen = [];
  for (let i = 0; i < RUNS; i += AT_ONCE) {
    const batch = [];
    for (let j = i; j < Math.min(RUNS, i + AT_ONCE); j++) batch.push(one(j));
    seen.push(...(await Promise.all(batch)));
  }
  const kinds = [...new Set(seen)];
  if (kinds.length > 1) { console.error(`FAIL: ${kinds.length} different pictures from the same look in ${RUNS} runs`); process.exit(1); }
  console.log(`PASS: the same picture in all ${RUNS} runs`);
})().catch((e) => { console.error(e); process.exit(1); });
