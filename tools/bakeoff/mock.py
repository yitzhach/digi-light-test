"""Mock-up of the 2.0 lighting maths (docs/v2/BUILD.md section 5) on real photos, in numpy; not the app.
Writes sheets of every look, and light with relief taken from the one side-lit photo, to OUT."""
import sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
import numpy as np
from PIL import Image
from common import *

def kelvin(K):
    t = K / 100.0
    r = 255 if t <= 66 else 329.698727446 * (t - 60) ** -0.1332047592
    g = 99.4708025861 * np.log(t) - 161.1195681661 if t <= 66 else 288.1221695283 * (t - 60) ** -0.0755148492
    b = 255 if t >= 66 else (0 if t <= 19 else 138.5177312231 * np.log(t - 10) - 305.0447927307)
    c = lin(np.clip(np.array([r, g, b]), 0, 255))
    w = lin(np.array([255.0, 249.0, 253.0]))           # ~6500 K
    c = c / w
    return c / (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2])

def smooth(a, b, x):
    t = np.clip((x - a) / (b - a + 1e-12), 0, 1)
    return t * t * (3 - 2 * t)

def gain(shape, doc, slopes=None):
    """E of BUILD.md 5.3-5.4 (without kappa) for a picture of this shape; slopes = (dh/dx, dh/dy) * depth."""
    h, w = shape
    a = h / w
    X, Y = np.meshgrid((np.arange(w) + 0.5) / w, (np.arange(h) + 0.5) / w)
    amb = doc['ambient'] * kelvin(doc.get('ambientK', 6500))
    E = np.ones((h, w, 3)) * amb
    Wc = amb.copy()
    for L in doc['lights']:
        lx, ly, lz = L['pos'][0], L['pos'][1] * a, L['pos'][2]
        ax, ay = L['aim'][0], L['aim'][1] * a
        dx, dy, dz = lx - X, ly - Y, lz
        r = np.sqrt(dx * dx + dy * dy + dz * dz)
        r0 = np.sqrt((lx - ax) ** 2 + (ly - ay) ** 2 + lz * lz)
        fall = 1 + ((r0 / r) ** 2 - 1) * L.get('falloff', 1)
        lam = np.minimum((dz / r) / (lz / r0), 8)
        cg = (-dx * (ax - lx) - dy * (ay - ly) + dz * lz) / (r * r0)
        cone = L.get('cone', 90)
        spot = smooth(np.cos(np.radians(cone)), np.cos(np.radians(cone * (1 - L.get('edge', 0.6)))), cg) if cone < 89.5 else 1.0
        e = L['intensity'] * fall * lam * spot
        if slopes is not None:
            p, q = slopes
            ndl = (-p * dx - q * dy + dz) / r / np.sqrt(1 + p * p + q * q)
            wr = np.minimum(L.get('size', 0.05) / r, 0.5)
            e = e * np.clip(np.clip(ndl + wr, 0, None) / (dz / r + wr), 0, 4)
        c = kelvin(L.get('kelvin', 4000))
        E += e[..., None] * c
        Wc = Wc + L['intensity'] * c
    Wn = Wc / (0.2126 * Wc[0] + 0.7152 * Wc[1] + 0.0722 * Wc[2])
    return E / (1 + doc.get('whiteAdapt', 0.3) * (Wn - 1))

def tone(photo, E):
    """BUILD.md 5.5: photo x light, whites protected."""
    np.seterr(all='ignore')
    P = lin(photo)
    Y = luma(P)
    lit = P * E
    g = luma(lit) / np.maximum(Y, 1e-9)
    Yp = np.where(g <= 1, Y * g, np.where(Y >= 1, 1.0, Y + Y * (1 - Y) * (g - 1) / (1 - 2 * Y + Y * g)))
    out = lit * (Yp / np.maximum(Y * g, 1e-9))[..., None]
    m = out.max(-1)
    t = np.where(m > 1, (1 - Yp) / np.maximum(m - Yp, 1e-9), 1.0)
    out = Yp[..., None] + (out - Yp[..., None]) * np.clip(t, 0, 1)[..., None]
    out = np.where((Y < 1e-6)[..., None], np.clip(lit, 0, 1), out)
    return srgb(out).round().astype(np.uint8)

def kappa(photo, doc):
    """BUILD.md 5.7: the largest scale of the light that blows no more than 0.5% new pixels."""
    h, w = photo.shape[:2]
    s = 256 / max(h, w)
    th = np.asarray(Image.fromarray(photo.astype(np.uint8)).resize((max(1, round(w * s)), max(1, round(h * s))), Image.BOX), dtype=np.float64)
    E = gain(th.shape[:2], doc)
    blown = lambda im: (luma(im.astype(np.float64)) >= 250).mean()         # display luma, not any channel
    base = blown(th)
    new = lambda k: blown(tone(th, k * E)) - base
    if new(1.0) <= 0.005:
        return 1.0
    lo, hi = 0.25, 1.0
    for _ in range(12):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if new(mid) <= 0.005 else (lo, mid)
    return lo

def render(photo, doc, slopes=None, depth=1.0):
    if doc['ambient'] == 1 and not doc['lights']:
        return photo.astype(np.uint8)                                  # identity: the photo itself
    k = kappa(photo, doc)
    sl = None if slopes is None else (slopes[0] * depth, slopes[1] * depth)
    return tone(photo, k * gain(photo.shape[:2], doc, sl))

def L(pos, aim, intensity, kelvin, cone=90, edge=0.6, falloff=1.0, size=0.05):
    return dict(pos=pos, aim=aim, intensity=intensity, kelvin=kelvin, cone=cone, edge=edge, falloff=falloff, size=size)

# BUILD.md section 6, the look table.
LOOKS = {
 'gallery':       dict(ambient=0.45, ambientK=4500, lights=[L((0.5, -0.35, 0.9), (0.5, 0.45), 0.8, 3200, 38, 0.8, 0.5)]),
 'spotlight':     dict(ambient=0.2, ambientK=4000, lights=[L((0.5, -0.25, 1.1), (0.5, 0.5), 1.1, 3000, 22, 0.8, 1)]),
 'soft-window':   dict(ambient=0.4, lights=[L((-1.2, 0.35, 0.9), (0.5, 0.5), 0.8, 6000, 90, 0.6, 0.75, 0.4)]),
 'warm-evening':  dict(ambient=0.35, ambientK=4500, lights=[L((-1.5, 0.2, 0.6), (0.5, 0.5), 0.8, 2700, 90, 0.6, 0.5, 0.15)]),
 'cool-daylight': dict(ambient=0.6, ambientK=7500, lights=[L((0.5, -0.6, 1.2), (0.5, 0.5), 0.5, 7000, 90, 0.6, 0.5, 0.3)]),
 'raking-left':   dict(ambient=0.35, lights=[L((-2.0, 0.5, 0.35), (0.5, 0.5), 0.8, 4500, 90, 0.6, 0.5, 0.02)]),
 'raking-top':    dict(ambient=0.35, lights=[L((0.5, -2.0, 0.35), (0.5, 0.5), 0.8, 4500, 90, 0.6, 0.5, 0.02)]),
 'dramatic':      dict(ambient=0.12, ambientK=4000, lights=[L((-0.3, -0.2, 0.5), (0.45, 0.45), 1.1, 3200, 30, 0.8, 1)]),
 'candlelight':   dict(ambient=0.22, ambientK=4500, lights=[L((0.5, 1.2, 0.5), (0.5, 0.65), 0.9, 2300, 90, 0.6, 0.8, 0.03)]),
}

def true_slopes(p):
    """Slope along the sun's direction from the one side-lit photo (the minimal True Relief)."""
    lt = p.lights[0]
    real = luma(lin(load(lt['real'], p.size)))
    flat = luma(lin(p.flat_a))
    rho = (real + 0.003) / (flat + 0.003)
    s = rho / np.maximum(box(rho, int(0.06 * p.size[0])), 1e-3)
    az, el = np.radians(lt['sun'])
    g = np.clip(1 - s, -1.5, 1.5) * np.tan(el)             # slope toward the light... (sign: lit faces rise toward it)
    ux, uy = np.cos(az), -np.sin(az)                         # y down
    return g * ux, g * uy

def sheet(ims, out, hgt=760):
    ims = [Image.fromarray(i) for i in ims]
    ims = [i.resize((int(i.width * hgt / i.height), hgt), Image.LANCZOS) for i in ims]
    W = sum(i.width for i in ims) + 8 * (len(ims) - 1)
    c = Image.new('RGB', (W, hgt), 'white'); x = 0
    for i in ims: c.paste(i, (x, 0)); x += i.width + 8
    c.save(out, quality=90)

for name in ('door', 'lintel'):
    p = Piece(name)
    ph = p.flat_a
    assert (render(ph, dict(ambient=1, lights=[])) == ph.astype(np.uint8)).all()
    row = [ph.astype(np.uint8)]
    for k, doc in LOOKS.items():
        im = render(ph, doc)
        row.append(im)
        y = luma(im.astype(np.float64))
        print(f'{name:6s} {k:13s} kappa {kappa(ph, doc):.2f}  p05 {np.percentile(y, 5):4.0f} p50 {np.percentile(y, 50):4.0f} p95 {np.percentile(y, 95):4.0f}  blown luma {(y >= 250).mean() * 100:5.2f}% any-channel {(im.max(-1) >= 250).mean() * 100:5.2f}% (photo {(luma(ph) >= 250).mean() * 100:.2f}% / {(ph.max(-1) >= 250).mean() * 100:.2f}%)  crushed {(im.max(-1) <= 5).mean() * 100:.2f}%')
    sheet(row[:5], f'{OUT}/mock-{name}-looks-a.jpg')
    sheet([row[0]] + row[5:], f'{OUT}/mock-{name}-looks-b.jpg')
    sl = true_slopes(p)
    doc = dict(ambient=0.3, lights=[L((-0.35, -0.3, 0.3) if name == 'door' else (1.35, -0.3, 0.3), (0.5, 0.5), 1.0, 5000, 90, 0.6, 0.25, 0.02)])
    plain, relief = render(ph, doc), render(ph, doc, sl, 1.0)
    real = load(p.lights[0]['real'], p.size).astype(np.uint8)
    sheet([ph.astype(np.uint8), plain, relief, real], f'{OUT}/mock-{name}-relief.jpg')
    h, w = ph.shape[:2]
    box_ = (int(w * 0.22), int(h * 0.36), int(w * 0.62), int(h * 0.60))
    crop = lambda im: np.asarray(Image.fromarray(im).crop(box_))
    sheet([crop(ph.astype(np.uint8)), crop(plain), crop(relief), crop(real)], f'{OUT}/mock-{name}-relief-crop.jpg', 420)
    for lab, im in (('light only', plain), ('light + true relief', relief)):
        s_ = p.shade(luma(im.astype(np.float64)))
        ok = p.lights[0]['ok']
        print(f'  {lab:20s} shade corr with the real sun: ' + fmt([float(np.corrcoef(s_[j][ok], p.lights[0]["rs"][j][ok])[0, 1]) for j in range(4)]))
