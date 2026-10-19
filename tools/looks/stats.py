#!/usr/bin/env python3
"""Numbers for a round of looks, each render against the photo it was made from.

    python3 tools/looks/stats.py DIR ID1,ID2,...   ->  JSON {ORIG: {...}, ID1: {...}, ...}

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
from PIL import Image, ImageFilter

CLIP_HI, CLIP_LO = 250, 5


def load(path, size=None):
    im = Image.open(path).convert('RGB')
    if size and im.size != size:
        im = im.resize(size, Image.LANCZOS)
    return im


def metrics(im):
    a = np.asarray(im)
    hi = np.any(a >= CLIP_HI, axis=2)
    lo = np.all(a <= CLIP_LO, axis=2) & ~hi
    y = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]).astype(np.float32)
    yi = Image.fromarray(y, 'F')
    b1 = np.asarray(yi.filter(ImageFilter.BoxBlur(1)))
    b6 = np.asarray(yi.filter(ImageFilter.BoxBlur(6)))
    m = max(1.0, float(y.mean()))
    return {'hi': float(hi.mean()), 'lo': float(lo.mean()),
            'p05': float(np.percentile(y, 5)), 'p50': float(np.percentile(y, 50)), 'p95': float(np.percentile(y, 95)),
            'fine': float(np.abs(y - b1).mean()) / m, 'mid': float(np.abs(b1 - b6).mean()) / m}


def main():
    folder, ids = sys.argv[1], [i for i in sys.argv[2].split(',') if i]
    orig = load(f'{folder}/ORIG.jpg')
    out = {'ORIG': metrics(orig)}
    for i in ids:
        try:
            out[i] = metrics(load(f'{folder}/{i}.jpg', orig.size))
        except FileNotFoundError:
            pass
    print(json.dumps(out))


if __name__ == '__main__':
    main()
