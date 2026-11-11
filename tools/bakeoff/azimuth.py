"""Can the light's direction be read from a flat + side-lit pair alone?
Axis: the shading log(lit / flat) is a derivative of the relief along the light, so its gradient
energy peaks along that axis (structure tensor). Side: cast shadows are darker and longer than
lit faces are bright, and each shadow lies on the far side of a lit edge."""
import sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
import numpy as np
from common import *

def axis_and_side(flat, real, ok):
    s = np.log((real + 4) / (flat + 4))
    out = {}
    for name, (r0, r1) in dict(mid=(2, 12), broad=(6, 40)).items():
        b = box(s, r0) - box(s, r1)
        gy, gx = np.gradient(b)
        gy = -gy                                   # y up
        jxx, jyy, jxy = (gx * gx)[ok].mean(), (gy * gy)[ok].mean(), (gx * gy)[ok].mean()
        axis = 0.5 * np.degrees(np.arctan2(2 * jxy, jxx - jyy)) % 180
        coh = np.hypot(jxx - jyy, 2 * jxy) / (jxx + jyy)
        # side: shadow (dark, below -1 sigma) should sit just beyond a lit face (above +1 sigma),
        # going away from the light. Shift the lit mask along the axis both ways and see which
        # shift lands on more shadow.
        sd = b[ok].std()
        lit, dark = (b > sd) & ok, (b < -sd) & ok
        d = np.array([np.cos(np.radians(axis)), np.sin(np.radians(axis))])
        score = []
        for sign in (1, -1):
            tot = 0
            for t in (r1 // 2, r1, 2 * r1):
                dx, dy = int(round(sign * d[0] * t)), int(round(-sign * d[1] * t))
                tot += (np.roll(np.roll(lit, dy, 0), dx, 1) & dark).sum()
            score.append(tot)
        # shadow lies at +shift from lit  =>  light comes from the opposite side
        frm = (axis + 180) % 360 if score[0] > score[1] else axis
        out[name] = (axis, coh, frm, score[0] / max(1, score[1]))
    return out

for name, truth in (('door', 135), ('lintel', 47)):
    p = Piece(name)
    lt = p.lights[0]
    real = luma(load(lt['real'], p.size))
    r = axis_and_side(p.flat, real, lt['ok'])
    for band, (axis, coh, frm, ratio) in r.items():
        print(f'{name:7s} truth {truth:3d}  {band:5s} axis {axis:5.1f} (coherence {coh:.2f})  light from {frm:5.1f}  (side evidence x{max(ratio, 1/ratio):.2f})')
p = Piece('dsc')
for i, lt in enumerate(p.lights):
    real = luma(load(lt['real'], p.size))
    L = light_dirs(lt, p.flat.shape, p.spec['width_cm']).reshape(-1, 3).mean(0)
    truth = np.degrees(np.arctan2(L[1], L[0])) % 360
    r = axis_and_side(p.flat, real, lt['ok'])
    for band, (axis, coh, frm, ratio) in r.items():
        print(f'dsc L{i}  truth {truth:3.0f}  {band:5s} axis {axis:5.1f} (coherence {coh:.2f})  light from {frm:5.1f}  (side evidence x{max(ratio, 1/ratio):.2f})')
