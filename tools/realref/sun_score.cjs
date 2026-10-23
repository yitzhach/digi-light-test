// sun_score.cjs — relief measured from a sunlit photo in the app, rendered under that sun, for
// tools/realref/score.py (the numbers in docs/real-light-test.md, 10-24).
//
//   DIGILIGHT_BROWSER=... node tools/realref/sun_score.cjs FLAT.jpg SUN.jpg OUTDIR FROM ANGLE WIDTH_CM [DEEPEST_MM]
//   python3 tools/realref/score.py OUTDIR/orig.png SUN-lined.jpg OUTDIR/artist.png OUTDIR/fit.png
//
// SUN may be lined up on FLAT already (-lined) or be the photo as taken (the app lines it up).
// FROM: where the sun came from (0 right, 90 above, 180 left); ANGLE: its angle to the painting's
// face; WIDTH_CM: the painting's width. Writes orig.png (the app's export of the photo, Original on
// top: what score.py compares against), fit.png (Texture depth fitted to the photo's contrast) and,
// with DEEPEST_MM, artist.png (Texture depth from the artist's deepest relief), each under the
// sun with Light like this (the sky's share as room light, graze unsmoothed). The lintel:
//   node tools/realref/sun_score.cjs testdata/photos/lintel-flat-crop.jpg testdata/photos/lintel-sun-lined.jpg out 40 10.3 52.07 6.35
const fs = require('fs');
const path = require('path');
const { launch, dataURL, fromDataURL } = require(path.join(__dirname, '..', 'digilight-headless.cjs'));
const [flat, sun, out, from, angle, width, deepest] = process.argv.slice(2);
if (!width) { process.stderr.write(fs.readFileSync(__filename, 'utf8').split('\n').filter((l) => l.startsWith('//')).join('\n') + '\n'); process.exit(1); }
(async () => {
  const s = await launch(); const { call, page } = s;
  try {
    fs.mkdirSync(out, { recursive: true });
    await call('load', dataURL(flat));
    await call('setGuard', false);
    await call('set', { paintingWidthCm: +width });
    const save = async (name) => { const r = await call('export', { format: 'png' }); fs.writeFileSync(path.join(out, name), fromDataURL(r)); };
    await call('set', { originalTop: 1 }); await save('orig.png'); await call('set', { originalTop: 0 });
    const photo = { src: dataURL(sun), sun: { azimuthDeg: +from, elevationDeg: +angle } };
    for (const [name, extra] of [...(deepest ? [['artist', { deepestMm: +deepest }]] : []), ['fit', {}]]) {
      const r = await call('measureRelief', { photos: [photo], ...extra });
      await page.evaluate(() => __studio.lamp.lightLike(0));
      await save(name + '.png');
      const st = await call('get', 'textureDepthMm');
      console.log(JSON.stringify({ picture: path.join(out, name + '.png'), textureDepthMm: st, measured: { spreadMm: +r.depthMm.toFixed(3), rangeMm: +r.rangeMm.toFixed(3) }, fit: r.fit, sky: +r.shots[0].room.toFixed(3), lineUp: r.shots[0].lineUp ? { inliers: r.shots[0].lineUp.inliers, errorPx: r.shots[0].lineUp.errorPx } : null }));
    }
    if (s.errors.length) process.stderr.write('page errors:\n' + s.errors.join('\n') + '\n');
  } finally { await s.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
