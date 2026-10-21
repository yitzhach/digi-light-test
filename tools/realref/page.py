#!/usr/bin/env python3
"""A review page: relief measured from a sunlit photo against relief estimated from the flat one.

    python3 tools/realref/page.py OUT --piece ID:LABEL:REAL.jpg:EST_DIR:MEAS_DIR [--piece ...] [--about TEXT]

EST_DIR and MEAS_DIR hold the same renders (ORIG.jpg, SUN.jpg and any of L01 F01 R01 G01, as
.jpg) made from the flat photo and from the project with measured relief (measure_sun.cjs);
REAL is the sunlit photo lined up onto the flat one (register.py). Writes OUT/page (index.html
from tools/looks/review-ab.html, img/, t/) and prints the files to publish, as make_round.py
does. Each look comes in a MEASURED and an estimated version and Hold flips between the two
(the sun-like ones flip to the real photo). Needs Pillow.
"""
import argparse
import json
import os
import subprocess
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
LOOKS = os.path.join(os.path.dirname(HERE), 'looks')
NAMES = {'SUN': 'Sun-like light (from the sun’s side, no smoothing)', 'L01': 'Favourite, side lamp left',
         'F01': 'Favourite, from the left', 'R01': 'Raking texture', 'G01': 'Gallery'}
# Renders on measured relief only (KEY.jpg in MEAS_DIR), each with the version Hold flips to.
EXTRA = {'L01u': ('Favourite, side lamp left, raking light not smoothed: MEASURED relief', 'mL01')}
ABOUT = ("Relief measured from your sunlit photo, against today's relief estimated from the flat one. "
         "Each look comes in two versions, MEASURED and estimated (today): hold the picture to flip between them; "
         "the sun-like versions flip to your real photo. Pick the piece at the top. One sunlit photo gives the relief's "
         "slopes along the sun's direction only, and its depth depends on how high the sun was. "
         "The looks keep their usual settings, made for the estimated relief, so their raking light still smooths it.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--piece', action='append', required=True, help='ID:LABEL:REAL.jpg:EST_DIR:MEAS_DIR')
    ap.add_argument('--about', default=ABOUT)
    a = ap.parse_args()
    page = os.path.join(a.out, 'page')
    for d in ('img', 't'):
        os.makedirs(os.path.join(page, d), exist_ok=True)
    looks = [k for k in NAMES if k != 'SUN']
    V = [['REAL', 'Your photo in real sunlight (lined up onto the flat one)'],
         ['mSUN', f"{NAMES['SUN']}: MEASURED relief"], ['eSUN', f"{NAMES['SUN']}: estimated relief (today)"]]
    BASE = {'REAL': 'photo', 'mSUN': 'REAL', 'eSUN': 'REAL'}
    for k in looks:
        V += [[f'm{k}', f'{NAMES[k]}: MEASURED relief'], [f'e{k}', f'{NAMES[k]}: estimated relief (today)']]
        BASE.update({f'm{k}': f'e{k}', f'e{k}': f'm{k}'})
        for x, (name, base) in EXTRA.items():
            if x.startswith(k):
                V.append([f'm{x}', name])
                BASE[f'm{x}'] = base
    photos, stats, kept = [], {}, set()
    for spec in a.piece:
        pid, label, real, est, meas = spec.split(':', 4)
        src = os.path.join(a.out, pid)
        os.makedirs(src, exist_ok=True)
        orig = Image.open(os.path.join(meas, 'ORIG.jpg')).convert('RGB')
        orig.save(os.path.join(src, 'ORIG.jpg'), quality=92)
        Image.open(real).convert('RGB').resize(orig.size, Image.LANCZOS).save(os.path.join(src, 'REAL.jpg'), quality=92)
        ids = ['REAL']
        for k in ['SUN'] + looks:
            for pre, d in (('m', meas), ('e', est)):
                p = os.path.join(d, f'{k}.jpg')
                if os.path.exists(p):
                    Image.open(p).convert('RGB').save(os.path.join(src, f'{pre}{k}.jpg'), quality=92)
                    ids.append(f'{pre}{k}')
            for x, (_, base) in EXTRA.items():
                p = os.path.join(meas, f'{x}.jpg')
                if x.startswith(k) and base in ids and os.path.exists(p):
                    Image.open(p).convert('RGB').save(os.path.join(src, f'm{x}.jpg'), quality=92)
                    ids.append(f'm{x}')
        kept.update(ids)
        r = subprocess.run([sys.executable, os.path.join(LOOKS, 'stats.py'), src, ','.join(ids)], capture_output=True, text=True, check=True)
        stats[pid] = json.loads(r.stdout)
        for vid, name in [('photo', 'ORIG')] + [(i, i) for i in ids]:
            im = Image.open(os.path.join(src, name + '.jpg'))
            im.save(os.path.join(page, 'img', f'{pid}-{vid}.jpg'), quality=90)
            t = im.copy()
            t.thumbnail((160, 160))
            t.save(os.path.join(page, 't', f'{pid}-{vid}.jpg'), quality=82)
        photos.append([pid, label, orig.width, orig.height])
    V = [v for v in V if v[0] in kept]
    data = (f"const TITLE={json.dumps('Measured relief from sunlight')};\nconst ABOUT={json.dumps(a.about)};\n"
            f"const PHOTOS={json.dumps(photos)};\nconst V={json.dumps(V)};\nconst BASE={json.dumps(BASE)};\nconst STATS={json.dumps(stats)};")
    html = open(os.path.join(LOOKS, 'review-ab.html')).read()
    first = html.split('\n', 1)[0]
    assert first.startswith('<title>') and html.count('/*DATA*/') == 1
    html = '<title>Measured Relief Test</title>' + html[len(first):]
    # Hold flips to the other version by default here (the flat photo is one tap away).
    for old, new in (('cmp:"photo",', 'cmp:"base",'), ('[["photo","Photo"],["base","Base look"]', '[["photo","Flat photo"],["base","The other version"]')):
        assert html.count(old) == 1, old
        html = html.replace(old, new)
    with open(os.path.join(page, 'index.html'), 'w') as f:
        f.write(html.replace('/*DATA*/', data))
    files = sorted(f'{d}/{f}' for d in ('img', 't') for f in os.listdir(os.path.join(page, d)))
    print(json.dumps({'page': os.path.join(page, 'index.html'), 'root': page, 'files': [{'path': f} for f in files]}))


if __name__ == '__main__':
    main()
