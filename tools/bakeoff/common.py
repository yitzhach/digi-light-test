"""Bake-off harness: score a surface (normal map) predicted from a flat photo against a real
raking-light photo of the same piece. Same bands and "shade corr" as tools/realref/score.py.

Normal convention everywhere here: x right, y UP (toward row 0), z toward the camera.
"""
import os
import numpy as np
from PIL import Image, ImageOps

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Where normals and sheets are written, and where the model weights were downloaded to.
OUT = os.environ.get('BAKEOFF_OUT', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out'))
MODELS = os.environ.get('BAKEOFF_MODELS', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models'))
os.makedirs(OUT, exist_ok=True)
P = REPO + '/testdata/photos/'
D = REPO + '/samples/dsc8382/'
IN = 2.54
PIECES = {
    'door': dict(flat=P + 'door-flat-crop.jpg', lights=[dict(real=P + 'door-sun-lined.jpg', sun=(135, 30))]),
    'lintel': dict(flat=P + 'lintel-flat-crop.jpg', lights=[dict(real=P + 'lintel-sun-lined.jpg', sun=(47, 10.3))]),
    # tripod lamp shots: lamp (left of left edge, above top edge, out from face), cm; panel 48.26 cm wide
    'dsc': dict(flat=D + 'DSC_8382.jpg', width_cm=48.26, lights=[
        dict(real=D + 'DSC_8379.jpg', lamp=(9.39 * IN, 9 * IN, 6.5 * IN)),
        dict(real=D + 'DSC_8380.jpg', lamp=(-2.8 * IN, 9.75 * IN, 5.75 * IN)),
        dict(real=D + 'DSC_8381.jpg', lamp=(22.41 * IN, 9.5 * IN, 6 * IN))]),
}
R = [1, 6, 24, 80]
NAMES = ['fine', 'mid', 'broad', 'forms']


def load(path, size=None):
    im = ImageOps.exif_transpose(Image.open(path)).convert('RGB')
    if size and im.size != size:
        im = im.resize(size, Image.LANCZOS)
    return np.asarray(im, dtype=np.float64)


def luma(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


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


def lin(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def srgb(l):
    l = np.clip(l, 0, 1)
    return 255 * np.where(l <= 0.0031308, l * 12.92, 1.055 * l ** (1 / 2.4) - 0.055)


def level(n):
    """Rotate the normals so their mean faces the camera (the piece is a plane seen straight on)."""
    m = n.reshape(-1, 3).mean(0)
    m /= np.linalg.norm(m)
    z = np.array([0, 0, 1.0])
    v = np.cross(m, z)
    s, c = np.linalg.norm(v), m @ z
    if s < 1e-8:
        return n
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    Rm = np.eye(3) + vx + vx @ vx * ((1 - c) / s ** 2)
    return n @ Rm.T


def light_dirs(light, shape, width_cm=None):
    """Unit vector(s) toward the light, per pixel for a lamp, one for the sun."""
    h, w = shape
    if 'sun' in light:
        az, el = np.radians(light['sun'])
        return np.array([np.cos(el) * np.cos(az), np.cos(el) * np.sin(az), np.sin(el)])
    left, above, out = light['lamp']
    cm = width_cm / w
    x = (np.arange(w) + 0.5) * cm
    y = -(np.arange(h) + 0.5) * cm
    X, Y = np.meshgrid(x, y)
    L = np.stack([left - X, above - Y, np.full_like(X, out)], -1)
    return L / np.linalg.norm(L, axis=-1, keepdims=True)


def shading(n, L, k=1.0):
    """Light on the relief relative to light on the flat plane (Lambert, no cast shadows)."""
    nn = n * np.array([k, k, 1.0])
    nn = nn / np.linalg.norm(nn, axis=-1, keepdims=True)
    return np.clip((nn * L).sum(-1), 0, None) / np.maximum(L[..., 2], 1e-3)


class Piece:
    def __init__(self, name):
        self.name, spec = name, PIECES[name]
        self.spec = spec
        self.flat_a = load(spec['flat'])
        self.size = (self.flat_a.shape[1], self.flat_a.shape[0])
        self.flat = luma(self.flat_a)
        self.lights = []
        h, w = self.flat.shape
        m = int(0.03 * w)
        for lt in spec['lights']:
            real = luma(load(lt['real'], self.size))
            ok = real > 2
            ok[:m] = ok[-m:] = False
            ok[:, :m] = ok[:, -m:] = False
            ok &= (self.flat > 12) & (self.flat < 250)
            self.lights.append(dict(lt, ok=ok, rs=self.shade(real)))

    def shade(self, y):
        return bands(np.log((y + 4) / (self.flat + 4)))

    def render_luma(self, s):
        return luma(srgb(lin(self.flat_a) * s[..., None]))

    def score(self, n, k=1.0, light_override=None):
        """Per light: shade corr and shade amp ratio on the four bands."""
        res = []
        for i, lt in enumerate(self.lights):
            src = light_override[i] if light_override else lt
            L = light_dirs(src, self.flat.shape, self.spec.get('width_cm'))
            s = self.shade(self.render_luma(shading(n, L, k)))
            ok = lt['ok']
            corr = [float(np.corrcoef(s[j][ok], lt['rs'][j][ok])[0, 1]) for j in range(4)]
            amp = [float(np.std(s[j][ok]) / np.std(lt['rs'][j][ok])) for j in range(4)]
            res.append((corr, amp))
        return res


def brightness_normals(flat_a, strength=1.0):
    """v1's idea in its simplest form: stroke-scale brightness is height (dark = low)."""
    y = np.log(luma(lin(flat_a)) + 1e-3)
    h = (y - box(y, 24)) * strength
    gy, gx = np.gradient(h)
    n = np.stack([-gx, gy, np.ones_like(h)], -1)   # rows grow downward: +gy means height rises downward
    return n / np.linalg.norm(n, axis=-1, keepdims=True)


def height_normals(h):
    """Normals of a height map (larger = nearer the camera), rows top first."""
    gy, gx = np.gradient(h)
    n = np.stack([-gx, gy, np.ones_like(h)], -1)
    return n / np.linalg.norm(n, axis=-1, keepdims=True)


def fmt(v):
    return ' '.join(f'{x:5.2f}' for x in v)


def report(label, piece, n, ks=(0.5, 1, 2, 4, 8)):
    """Best slope gain by mean of mid+broad corr over the piece's lights; prints one line per light."""
    n = level(n)
    best = None
    for k in ks:
        r = piece.score(n, k)
        q = np.mean([c[1] + c[2] for c, _ in r])
        if best is None or q > best[0]:
            best = (q, k, r)
    _, k, r = best
    for i, (c, a) in enumerate(r):
        print(f'{label[:28]:28s} {piece.name:6s} L{i} k={k:<4} corr {fmt(c)} | amp {fmt(a)}')
    return k, r


def sphere_image(size=512):
    """A lit ball on a grey ground, to read a model's normal convention off its output."""
    y, x = np.mgrid[0:size, 0:size]
    cx = cy = size / 2
    r = size * 0.38
    dx, dy = (x - cx) / r, (cy - y) / r
    inside = dx * dx + dy * dy < 1
    nz = np.sqrt(np.clip(1 - dx * dx - dy * dy, 0, 1))
    Ld = np.array([-0.3, 0.4, 0.86])
    Ld /= np.linalg.norm(Ld)
    sh = np.clip(dx * Ld[0] + dy * Ld[1] + nz * Ld[2], 0.05, 1)
    img = np.full((size, size, 3), 110.0)
    for c, base in enumerate((200, 120, 90)):
        img[..., c] = np.where(inside, base * sh + 20, img[..., c])
    return img.astype(np.uint8), inside, dx, dy


def convention(n, inside, dx, dy):
    """Signs (sx, sy, sz) that bring a model's raw normals of the ball to x right, y up, z out."""
    sx = np.sign(np.corrcoef(n[..., 0][inside], dx[inside])[0, 1])
    sy = np.sign(np.corrcoef(n[..., 1][inside], dy[inside])[0, 1])
    sz = np.sign(n[..., 2][inside].mean())
    return sx, sy, sz, float(np.corrcoef(n[..., 0][inside], dx[inside])[0, 1]), float(np.corrcoef(n[..., 1][inside], dy[inside])[0, 1])


def tiles(h, w, tile, overlap):
    """(y0, y1, x0, x1) windows covering h x w with at least `overlap` shared between neighbours."""
    def cuts(n):
        if n <= tile:
            return [0]
        k = int(np.ceil((n - overlap) / (tile - overlap)))
        return [int(round(i * (n - tile) / (k - 1))) for i in range(k)]
    return [(y, min(y + tile, h), x, min(x + tile, w)) for y in cuts(h) for x in cuts(w)]


def blend_tiles(shape, parts):
    """Feathered average of per-tile normals [(window, normals)], each levelled on its own."""
    h, w = shape
    acc = np.zeros((h, w, 3))
    wsum = np.zeros((h, w, 1))
    for (y0, y1, x0, x1), n in parts:
        th, tw = y1 - y0, x1 - x0
        wy = np.minimum(np.arange(th) + 1, th - np.arange(th)) / (th / 2)
        wx = np.minimum(np.arange(tw) + 1, tw - np.arange(tw)) / (tw / 2)
        wt = np.clip(np.outer(wy, wx), 1e-3, 1)[..., None]
        acc[y0:y1, x0:x1] += level(n) * wt
        wsum[y0:y1, x0:x1] += wt
    n = acc / wsum
    return n / np.linalg.norm(n, axis=-1, keepdims=True)
