#!/usr/bin/env python3
"""Render a lighting round and build its A/B review page, in one go.

    python3 tools/looks/make_round.py SPEC.json --photo ID:LABEL:INPUT [--photo ...] --out DIR [--width 1600] [--skip-existing]

SPEC is a round file like tools/looks/round4.json: {title, about, fill?, guard?, variants: [{id, name,
look?, set?, fill?, exposureAdd?, scale?, addLights?, guard?, base?}]} ("fill": true adds the
spec's fill light; "base" is the version Hold compares against, default the photo). INPUT is
what the CLI opens: sample:painting, a photo path or a .digilight.json project.

For each photo it runs one `tools/digilight-cli.cjs batch` (one Analyze, every version, each
guarded and measured), plus the photo itself through the same export (Original on top, 100%),
then tools/looks/stats.py, and writes DIR/page: index.html (tools/looks/review-ab.html filled in),
img/ID-V.jpg and t/ID-V.jpg (160 px). DIR/results.json keeps each version's guard note and
metrics. --skip-existing reuses a version whose picture and record (.json beside it) are already
in DIR, so an interrupted round picks up where it stopped. Publish DIR/page with the Artifact tool (capabilities {"db": {}}, files img/* and t/*);
picks then come back through ArtifactData, collection "picks".
Needs Node (tools/ installed), numpy and Pillow; DIGILIGHT_BROWSER in cloud sessions.
"""
import argparse
import json
import os
import subprocess
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))


def jobs_for(spec, folder, width):
    jobs = [{'out': os.path.join(folder, 'ORIG.jpg'), 'set': {'originalTop': 1}, 'guard': False, 'width': width, 'quality': 0.92}]
    for v in spec['variants']:
        j = {'out': os.path.join(folder, v['id'] + '.jpg'), 'width': width, 'quality': 0.92}
        if 'guard' in spec:   # round-wide: "guard": false renders the versions as set
            j['guard'] = spec['guard']
        for k in ('look', 'strength', 'preset', 'set', 'exposureAdd', 'scale', 'guard'):
            if k in v:
                j[k] = v[k]
        lights = list(v.get('addLights', []))
        if v.get('fill'):
            lights.append(spec['fill'])
        if lights:
            j['addLights'] = lights
        jobs.append(j)
    return jobs


def done(job):
    """A finished version: its picture and its record (the CLI writes FILE.json beside FILE.jpg)."""
    rec = os.path.splitext(job['out'])[0] + '.json'
    if not (os.path.exists(job['out']) and os.path.exists(rec)):
        return None
    r = json.load(open(rec))
    return {'out': job['out'], 'guard': r.get('guard'), 'metrics': r.get('metrics'), 'reused': True}


def run_batch(inp, jobs, jobs_file):
    if not jobs:
        return {}
    with open(jobs_file, 'w') as f:
        json.dump(jobs, f, indent=1)
    cmd = ['node', os.path.join(ROOT, 'tools', 'digilight-cli.cjs'), 'batch', inp, '--jobs', jobs_file]
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    sys.stderr.write(p.stderr)
    lines = [json.loads(l) for l in p.stdout.splitlines() if l.strip().startswith('{')]
    failed = [l for l in lines if 'error' in l]
    if p.returncode or failed:
        raise SystemExit(f'batch failed for {inp}: {failed or p.returncode}')
    return {os.path.splitext(os.path.basename(l['out']))[0]: l for l in lines}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('spec')
    ap.add_argument('--photo', action='append', required=True, help='ID:LABEL:INPUT')
    ap.add_argument('--out', required=True)
    ap.add_argument('--width', type=int, default=1600)
    ap.add_argument('--skip-existing', action='store_true')
    a = ap.parse_args()
    spec = json.load(open(a.spec))
    out = os.path.abspath(a.out)
    page = os.path.join(out, 'page')
    for d in ('img', 't'):
        os.makedirs(os.path.join(page, d), exist_ok=True)
    ids = [v['id'] for v in spec['variants']]
    photos, stats, results = [], {}, {}
    for entry in a.photo:
        n, label, inp = entry.split(':', 2)
        folder = os.path.join(out, n)
        os.makedirs(folder, exist_ok=True)
        jobs, reused = jobs_for(spec, folder, a.width), {}
        if a.skip_existing:
            for j in list(jobs):
                r = done(j)
                if r:
                    reused[os.path.splitext(os.path.basename(j['out']))[0]] = r
                    jobs.remove(j)
            sys.stderr.write(f'{n}: {len(reused)} reused, {len(jobs)} to render\n')
        results[n] = {**reused, **run_batch(inp, jobs, os.path.join(out, f'jobs-{n}.json'))}
        r = subprocess.run([sys.executable, os.path.join(HERE, 'stats.py'), folder, ','.join(ids)], capture_output=True, text=True, check=True)
        stats[n] = json.loads(r.stdout)
        for vid, src in [('photo', 'ORIG')] + [(i, i) for i in ids]:
            im = Image.open(os.path.join(folder, src + '.jpg'))
            im.save(os.path.join(page, 'img', f'{n}-{vid}.jpg'), quality=90)
            t = im.copy()
            t.thumbnail((160, 160))
            t.save(os.path.join(page, 't', f'{n}-{vid}.jpg'), quality=82)
        photos.append([n, label, im.width, im.height])
    # What the guard moved, per photo (the CLI says so only when it moved something).
    moved = []
    for n, label, _, _ in photos:
        notes = [f"{i}: {results[n][i]['guard']['note'].replace('Guard: ', '')}" for i in ids if results[n].get(i, {}).get('guard')]
        if notes:
            moved.append(f'{label}, the guard moved: ' + ' '.join(notes))
    about = spec['about'] + (' ' + ' '.join(moved) if moved else '' if spec.get('guard') is False else ' The guard moved nothing in any version.')
    base = {v['id']: v['base'] for v in spec['variants'] if v.get('base')}
    data = (f"const TITLE={json.dumps(spec['title'])};\nconst ABOUT={json.dumps(about)};\nconst PHOTOS={json.dumps(photos)};\n"
            f"const V={json.dumps([[v['id'], v['name']] for v in spec['variants']])};\nconst BASE={json.dumps(base)};\nconst STATS={json.dumps(stats)};")
    html = open(os.path.join(HERE, 'review-ab.html')).read()
    first = html.split('\n', 1)[0]
    assert first.startswith('<title>') and html.count('/*DATA*/') == 1
    html = f"<title>{spec.get('pageTitle', spec['title'])}</title>" + html[len(first):]
    with open(os.path.join(page, 'index.html'), 'w') as f:
        f.write(html.replace('/*DATA*/', data))
    with open(os.path.join(out, 'results.json'), 'w') as f:
        json.dump({n: {i: {k: r[k] for k in ('guard', 'metrics', 's', 'reused') if k in r} for i, r in res.items()} for n, res in results.items()}, f, indent=1)
    files = sorted(f'{d}/{f}' for d in ('img', 't') for f in os.listdir(os.path.join(page, d)))
    print(json.dumps({'page': os.path.join(page, 'index.html'), 'root': page, 'files': [{'path': f} for f in files]}))


if __name__ == '__main__':
    main()
