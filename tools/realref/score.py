#!/usr/bin/env python3
"""Renders of a flat photo, scored against a real raking-light photo of the same painting.

    python3 tools/realref/score.py FLAT.jpg REAL.jpg RENDER.jpg [RENDER.jpg ...]

REAL must be lined up onto FLAT (tools/realref/register.py); FLAT is best the app's own
export of the photo (Original on top), so renders and photo went through the same pipeline.
Everything is resized to FLAT. Luma is split into four bands by box blurs of radius
1, 6, 24 and 80 px: fine, mid (stroke scale), broad, forms. Per picture:
  p05 p50 p95   luma percentiles; b*  warmth of the brightest 40% (CIELAB b*, + = yellow)
  amp           each band's mean size per unit brightness, over FLAT's
  corr          each band's correlation with REAL's
  shade corr    the same on log(picture / FLAT): the paint cancels and only light and shade
                are left, so +1 = the same light and shade in the same places, 0 = unrelated
  shade amp     the size of that light and shade, over REAL's
On the user's plaster door (10-21) today's looks scored shade corr about 0 on every band
from every raking direction; relief measured from the sunlit photo, 0.55 mid and 0.60 broad
under a sun-like light (partly circular: the relief came from that photo).
Needs numpy and Pillow.
"""
import sys

import numpy as np
from PIL import Image, ImageOps

R = [1, 6, 24, 80]
NAMES = ['fine', 'mid', 'broad', 'forms']


def box(y, r):
    for axis in (0, 1):
        p = np.pad(y, [(r + 1, r) if a == axis else (0, 0) for a in (0, 1)], mode='edge')
        c = np.cumsum(p, axis=axis)
        n = y.shape[axis]
        y = (np.take(c, range(2 * r + 1, 2 * r + 1 + n), axis=axis) - np.take(c, range(0, n), axis=axis)) / (2 * r + 1)
    return y


def bands(y):
    bl = [y] + [box(y, r) for r in R]
    return [bl[i] - bl[i + 1] for i in range(4)]


def lab_b(a):
    c = a / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T / np.array([0.9505, 1.0, 1.089])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return 200 * (f[..., 1] - f[..., 2])


def main():
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    flat_im = ImageOps.exif_transpose(Image.open(sys.argv[1])).convert('RGB')
    size = flat_im.size
    load = lambda p: np.asarray(ImageOps.exif_transpose(Image.open(p)).convert('RGB').resize(size, Image.LANCZOS), dtype=np.float64)
    luma = lambda a: 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    flat_a, real_a = np.asarray(flat_im, dtype=np.float64), load(sys.argv[2])
    flat, real = luma(flat_a), luma(real_a)
    # Where REAL covers the frame, off the edges, and the photo is neither black nor blown.
    ok = real > 2
    m = int(0.03 * size[0])
    ok[:m] = ok[-m:] = False
    ok[:, :m] = ok[:, -m:] = False
    ok_ratio = ok & (flat > 12) & (flat < 250)
    shade = lambda y: bands(np.log((y + 4) / (flat + 4)))
    corr = lambda x, z, v: float(np.corrcoef(x[v], z[v])[0, 1])
    fb, rb, rs = bands(flat), bands(real), shade(real)
    head = (f"{'picture':24s} {'p05':>4s} {'p50':>4s} {'p95':>4s} {'b*':>5s} | {'amp x flat':^23s} | {'corr with real':^23s} | "
            f"{'shade corr with real':^23s} | {'shade amp / real':^23s}")
    print(head)
    print(f"{'':39s} | " + ' | '.join(' '.join(f'{n:>5s}' for n in NAMES) for _ in range(4)))
    rows = [('REAL', real_a), ('FLAT', flat_a)] + [('/'.join(p.split('/')[-2:]), load(p)) for p in sys.argv[3:]]
    for name, a in rows:
        y = luma(a)
        b, s = bands(y), shade(y)
        mean = max(1.0, y[ok].mean())
        bright = ok & (y > np.percentile(y[ok], 60))
        amp = [np.abs(b[j][ok]).mean() / mean / (np.abs(fb[j][ok]).mean() / max(1.0, flat[ok].mean())) for j in range(4)]
        cr = [corr(b[j], rb[j], ok) for j in range(4)]
        sc = [corr(s[j], rs[j], ok_ratio) if name != 'FLAT' else float('nan') for j in range(4)]
        sa = [np.std(s[j][ok_ratio]) / np.std(rs[j][ok_ratio]) if name != 'FLAT' else float('nan') for j in range(4)]
        q = np.percentile(y[ok], [5, 50, 95])
        print(f"{name[:24]:24s} {q[0]:4.0f} {q[1]:4.0f} {q[2]:4.0f} {np.median(lab_b(a)[bright]):5.1f} | "
              + ' | '.join(' '.join(f'{v:5.2f}' for v in vals) for vals in (amp, cr, sc, sa)))


if __name__ == '__main__':
    main()
