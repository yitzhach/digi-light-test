"""Does any axis convention rescue a model? Best mid/broad shade corr over the four x/y sign choices."""
import sys, glob
sys.path.insert(0, __file__.rsplit('/', 1)[0])
import numpy as np
from common import *
pieces = {n: Piece(n) for n in ('door', 'lintel', 'dsc')}
for f in sorted(glob.glob(OUT + '/*.npy')):
    model, name, mode = f.split('/')[-1][:-4].split('-')
    p = pieces[name]
    n = level(np.load(f).astype(np.float64))
    best = None
    for sx in (1, -1):
        for sy in (1, -1):
            r = p.score(n * np.array([sx, sy, 1.0]), 2.0)
            mid = np.mean([c[1] for c, _ in r]); broad = np.mean([c[2] for c, _ in r]); forms = np.mean([c[3] for c, _ in r])
            if best is None or mid + broad > best[0]: best = (mid + broad, sx, sy, mid, broad, forms)
    print(f'{model:10s} {name:6s} {mode:5s} best signs ({best[1]:+d},{best[2]:+d}): mid {best[3]:5.2f} broad {best[4]:5.2f} forms {best[5]:5.2f}')
