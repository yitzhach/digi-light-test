#!/usr/bin/env python3
"""Numbers for a round of looks, each render against the photo it was made from.

    python3 tools/looks/stats.py DIR ID1,ID2,...   ->  JSON {photo: {...}, ID1: {...}, ...}

DIR holds ORIG.jpg (the photo) and ID.jpg per render (resized to the photo if they differ).
Per picture:
  hi, lo   share blown / crushed, counted as the app counts them (src/photocheck.js
           clipping: any channel >= 250 is blown, all channels <= 5 crushed)
  p05 p50 p95  luma percentiles, 0-255
  fine     mean |Y - box3(Y)| over the mean luma: fine texture per unit brightness
           (the round reviews show it as a share of the photo's: "detail 96%")
  mid      the same between box3 and box13 (stroke-scale texture)
Needs numpy and Pillow.
"""
import json
import sys

import numpy as np
from PIL import Image, ImageOps

CLIP_HI, CLIP_LO = 250, 5


def load(path, size=None):
    im = ImageOps.exif_transpose(Image.open(path)).convert('RGB')
    if size and im.size != size:
        im = im.resize(size, Image.LANCZOS)
    return im


def box(y, r):
    """Mean over a (2r+1)-square window, edges clamped (as Pillow's BoxBlur)."""
    for axis in (0, 1):
        p = np.pad(y, [(r + 1, r) if a == axis else (0, 0) for a in (0, 1)], mode='edge')
        c = np.cumsum(p, axis=axis, dtype=np.float64)
        n = y.shape[axis]
        y = (np.take(c, range(2 * r + 1, 2 * r + 1 + n), axis=axis) - np.take(c, range(0, n), axis=axis)) / (2 * r + 1)
    return y


def metrics(im):
    a = np.asarray(im)
    hi = np.any(a >= CLIP_HI, axis=2)
    lo = np.all(a <= CLIP_LO, axis=2) & ~hi
    y = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    b1, b6 = box(y, 1), box(y, 6)
    m = max(1.0, float(y.mean()))
    return {'hi': float(hi.mean()), 'lo': float(lo.mean()),
            'p05': float(np.percentile(y, 5)), 'p50': float(np.percentile(y, 50)), 'p95': float(np.percentile(y, 95)),
            'fine': float(np.abs(y - b1).mean()) / m, 'mid': float(np.abs(b1 - b6).mean()) / m}


def main():
    folder, ids = sys.argv[1], [i for i in sys.argv[2].split(',') if i]
    orig = load(f'{folder}/ORIG.jpg')
    out = {'photo': metrics(orig)}
    for i in ids:
        try:
            out[i] = metrics(load(f'{folder}/{i}.jpg', orig.size))
        except FileNotFoundError:
            pass
    print(json.dumps(out))


if __name__ == '__main__':
    main()
