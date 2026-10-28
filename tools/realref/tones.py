#!/usr/bin/env python3
"""Where a render's tones differ from a real sunlit photo: by paint brightness, in linear light.

    python3 tools/realref/tones.py FLAT.png REAL.jpg RENDER.png [RENDER.png ...]

Same inputs as score.py (FLAT best the app's own export with Original on top, REAL lined up onto
it). The flat photo's brightness splits the painting into white (luma over 200), mid and dark
paint. Per picture and class:
  luma          p05 p25 p50 p75 p95, and the share blown (250 and up)
  over flat     linear luminance over FLAT's, p10 p50 p90 p95 p99: shadows low, sunlit facets high
Then light and shade on linear ratios (picture / FLAT) in score.py's bands: r with REAL's and
size over REAL's. score.py takes them on the log, which shadows dominate; here the sunlit
facets count as much as they show (docs/real-light-test.md "10-28, later").
Needs numpy and Pillow.
"""
import sys

import numpy as np
from PIL import Image, ImageOps

from score import NAMES, bands


def main():
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    flat_im = ImageOps.exif_transpose(Image.open(sys.argv[1])).convert('RGB')
    size = flat_im.size
    load = lambda p: np.asarray(ImageOps.exif_transpose(Image.open(p)).convert('RGB').resize(size, Image.LANCZOS), dtype=np.float64)
    luma = lambda a: 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    lin = lambda a: np.where(a <= 10.31475, a / 3294.6, ((a / 255 + 0.055) / 1.055) ** 2.4)
    flat_a = np.asarray(flat_im, dtype=np.float64)
    flat8, flat = luma(flat_a), luma(lin(flat_a))
    rows = [('REAL', load(sys.argv[2]))] + [('/'.join(p.split('/')[-2:]), load(p)) for p in sys.argv[3:]]
    ok = luma(rows[0][1]) > 2
    m = int(0.03 * size[0])
    ok[:m] = ok[-m:] = False
    ok[:, :m] = ok[:, -m:] = False
    classes = {'white': ok & (flat8 > 200), 'mid': ok & (flat8 > 100) & (flat8 <= 200), 'dark': ok & (flat8 <= 100)}
    print('share of the painting: ' + ', '.join(f'{k} {c.sum() / ok.sum():.0%}' for k, c in classes.items()))
    print(f"{'picture':24s} {'class':5s} | {'luma p05 p25 p50 p75 p95':^26s} {'blown':>6s} | {'over flat p10 p50 p90 p95 p99':^31s}")
    ratio = {}
    for name, a in rows:
        y8, r = luma(a), luma(lin(a)) / np.maximum(flat, 1e-3)
        ratio[name] = r
        for k, c in classes.items():
            q = np.percentile(y8[c], [5, 25, 50, 75, 95])
            v = np.percentile(r[c], [10, 50, 90, 95, 99])
            print(f'{name[:24]:24s} {k:5s} | ' + ' '.join(f'{x:4.0f}' for x in q) + f'  {(y8[c] >= 250).mean():6.1%} | ' + ' '.join(f'{x:5.2f}' for x in v))
    use = ok & (flat8 > 12) & (flat8 < 250)
    real = bands(ratio['REAL'])
    print(f"\nlight and shade on linear ratios {'':6s} | {'r with real':^23s} | {'size / real':^23s}")
    print(f"{'':39s} | " + ' | '.join(' '.join(f'{n:>5s}' for n in NAMES) for _ in range(2)))
    for name, _ in rows[1:]:
        b = bands(ratio[name])
        print(f'{name[:39]:39s} | ' + ' '.join(f'{np.corrcoef(x[use], z[use])[0, 1]:5.2f}' for x, z in zip(b, real))
              + ' | ' + ' '.join(f'{x[use].std() / z[use].std():5.2f}' for x, z in zip(b, real)))


if __name__ == '__main__':
    main()
