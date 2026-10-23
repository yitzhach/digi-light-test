#!/usr/bin/env python3
"""Line a second photo of a painting (another light, handheld, another spot) up onto the first.

    python3 tools/realref/register.py FLAT.jpg OTHER.jpg OUT.jpg [--check CHECK.jpg]

SIFT features on contrast-equalised copies of brightness and of the colour ratio r/(r+g+b)
(lighting changes brightness much more than the paint's colour), matches from both pooled
after a ratio test, then a RANSAC homography: the painting is flat, so one homography lines
up the whole of it (anything standing off it, like a fixed piece of wood, is off by its
parallax). OUT is OTHER warped into FLAT's frame (black where it did not cover); --check
writes a checkerboard of the two to look at. Prints the matches, the inliers and their
reprojection error in FLAT's pixels. On the user's plaster door (10-21): 134 of 138 matches
inliers, median error 0.6 px, 98.9% of the frame covered. On their panel with a wooden lintel
in hard sun, brightness alone with fewer features kept 6 of 18 matches (too few to trust).
Needs numpy and opencv-python-headless (pip install opencv-python-headless).
Since 10-24 the app lines a handheld photo up itself (src/lineup.js, `lineUp`); this stays as the
reference it is checked against (testdata/photos/manifest.json sunToFlat, tests/lineup.cjs).
"""
import argparse
import sys

import numpy as np
import cv2


def channels(im, w=1000):
    """Brightness and colour ratio, contrast-equalised, at `w` px wide; and the scale."""
    k = w / im.shape[1]
    im = cv2.resize(im, None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
    f = im.astype(np.float32) + 1
    ratio = np.uint8(np.clip((f[..., 2] / f.sum(axis=2) - 0.2) * 900, 0, 255))
    clahe = cv2.createCLAHE(3.0, (8, 8))
    return [clahe.apply(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)), clahe.apply(ratio)], k


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('flat'); ap.add_argument('other'); ap.add_argument('out')
    ap.add_argument('--check')
    a = ap.parse_args()
    flat, other = cv2.imread(a.flat), cv2.imread(a.other)
    if flat is None or other is None:
        sys.exit('Could not read the photos.')
    cf, kf = channels(flat)
    co, ko = channels(other)
    sift, src, dst = cv2.SIFT_create(20000), [], []
    for gf, go in zip(cf, co):
        kp1, d1 = sift.detectAndCompute(gf, None)
        kp2, d2 = sift.detectAndCompute(go, None)
        for m, n in cv2.BFMatcher().knnMatch(d2, d1, k=2):
            if m.distance < 0.8 * n.distance:
                src.append(kp2[m.queryIdx].pt)
                dst.append(kp1[m.trainIdx].pt)
    if len(src) < 12:
        sys.exit(f'Only {len(src)} matches: not enough to line the photos up.')
    src, dst = np.float32(src) / ko, np.float32(dst) / kf
    H, mask = cv2.findHomography(src, dst, cv2.RANSAC, 6.0)
    keep = mask.ravel() == 1
    err = np.linalg.norm(cv2.perspectiveTransform(src[keep][None], H)[0] - dst[keep], axis=1)
    size = (flat.shape[1], flat.shape[0])
    warped = cv2.warpPerspective(other, H, size, flags=cv2.INTER_LANCZOS4)
    covered = cv2.warpPerspective(np.full(other.shape[:2], 255, np.uint8), H, size) > 0
    cv2.imwrite(a.out, warped, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print(f'matches {len(src)}, inliers {int(keep.sum())}, error median {np.median(err):.2f} px, '
          f'p90 {np.percentile(err, 90):.2f} px, covered {covered.mean():.1%}')
    if a.check:
        cb, t = flat.copy(), max(64, flat.shape[1] // 8)
        for y in range(0, flat.shape[0], t):
            for x in range(0, flat.shape[1], t):
                if (x // t + y // t) % 2:
                    cb[y:y + t, x:x + t] = warped[y:y + t, x:x + t]
        cv2.imwrite(a.check, cv2.resize(cb, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA))


if __name__ == '__main__':
    main()
