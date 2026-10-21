#!/usr/bin/env python3
"""Line a second photo of a painting (another light, handheld, another spot) up onto the first.

    python3 tools/realref/register.py FLAT.jpg OTHER.jpg OUT.jpg [--check CHECK.jpg]

SIFT features on contrast-equalised copies (lighting changes brightness, not the paint's
marks), ratio test, then a RANSAC homography: the painting is flat, so one homography lines
up the whole of it. OUT is OTHER warped into FLAT's frame (black where it did not cover);
--check writes a checkerboard of the two to look at. Prints the matches, the inliers and
their reprojection error in FLAT's pixels. On the user's plaster door (10-21): 134 of 138
matches inliers, median error 0.6 px, 98.9% of the frame covered.
Needs numpy and opencv-python-headless (pip install opencv-python-headless).
"""
import argparse
import sys

import numpy as np
import cv2


def gray(im, w=1000):
    k = w / im.shape[1]
    g = cv2.cvtColor(cv2.resize(im, None, fx=k, fy=k, interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
    return cv2.createCLAHE(2.0, (8, 8)).apply(g), k


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('flat'); ap.add_argument('other'); ap.add_argument('out')
    ap.add_argument('--check')
    a = ap.parse_args()
    flat, other = cv2.imread(a.flat), cv2.imread(a.other)
    if flat is None or other is None:
        sys.exit('Could not read the photos.')
    gf, kf = gray(flat)
    go, ko = gray(other)
    sift = cv2.SIFT_create(8000)
    kp1, d1 = sift.detectAndCompute(gf, None)
    kp2, d2 = sift.detectAndCompute(go, None)
    good = [m for m, n in cv2.BFMatcher().knnMatch(d2, d1, k=2) if m.distance < 0.75 * n.distance]
    if len(good) < 12:
        sys.exit(f'Only {len(good)} matches: not enough to line the photos up.')
    src = np.float32([kp2[m.queryIdx].pt for m in good]) / ko
    dst = np.float32([kp1[m.trainIdx].pt for m in good]) / kf
    H, mask = cv2.findHomography(src, dst, cv2.RANSAC, 6.0)
    keep = mask.ravel() == 1
    err = np.linalg.norm(cv2.perspectiveTransform(src[keep][None], H)[0] - dst[keep], axis=1)
    size = (flat.shape[1], flat.shape[0])
    warped = cv2.warpPerspective(other, H, size, flags=cv2.INTER_LANCZOS4)
    covered = cv2.warpPerspective(np.full(other.shape[:2], 255, np.uint8), H, size) > 0
    cv2.imwrite(a.out, warped, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print(f'matches {len(good)}, inliers {int(keep.sum())}, error median {np.median(err):.2f} px, '
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
