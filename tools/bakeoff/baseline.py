"""Baselines in this harness: v1's brightness-as-height, and a sanity check of the harness itself."""
import numpy as np, sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from common import *

for name in PIECES:
    p = Piece(name)
    report('brightness=height (v1 idea)', p, brightness_normals(p.flat_a, 3.0))
    report('inverted brightness', p, brightness_normals(p.flat_a, -3.0))
    # sanity: a surface built from the real light itself must score high (harness and signs right)
    lt = p.lights[0]
    real = luma(load(lt['real'], p.size))
    ratio = np.log((real + 4) / (p.flat + 4))
    ratio = ratio - box(ratio, 80)
    L = light_dirs(lt, p.flat.shape, p.spec.get('width_cm'))
    Lm = L if L.ndim == 1 else L.reshape(-1, 3).mean(0)
    d = Lm[:2] / np.linalg.norm(Lm[:2])
    n = np.stack([ratio * d[0], ratio * d[1], np.ones_like(ratio)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    report('oracle (from the real light)', p, n, ks=(0.25, 0.5, 1))
