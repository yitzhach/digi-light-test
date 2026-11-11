"""Run one surface model on every test piece (whole image and in tiles), save normals, score them.

    python3 run.py MODEL [--tile N] [--pieces door,lintel,dsc] [--only whole|tiled]

Normals saved to out/MODEL-PIECE-{whole,tiled}.npy as float16, x right, y up, z out.
"""
import sys, time, argparse
sys.path.insert(0, __file__.rsplit('/', 1)[0])
import numpy as np
from PIL import Image
from common import *

M = MODELS
# Checkouts of the models' own code (only the three marked 'repo code' below need them).
CODE = os.environ.get('BAKEOFF_CODE', '/home/user')


def resize(a, long_side, mult=1):
    h, w = a.shape[:2]
    s = long_side / max(h, w)
    nh, nw = max(mult, int(round(h * s / mult)) * mult), max(mult, int(round(w * s / mult)) * mult)
    return np.asarray(Image.fromarray(a.astype(np.uint8)).resize((nw, nh), Image.LANCZOS))


def up(n, shape):
    """Normal map (h, w, 3) resized to shape (bicubic per channel), renormalised."""
    h, w = shape
    out = np.stack([np.asarray(Image.fromarray(n[..., c].astype(np.float32), 'F').resize((w, h), Image.BICUBIC)) for c in range(3)], -1)
    return out / np.maximum(np.linalg.norm(out, axis=-1, keepdims=True), 1e-6)


# ---------------------------------------------------------------- models: fn(rgb uint8 HxWx3) -> raw normals HxWx3

def make_metric3d():
    import onnxruntime as ort
    s = ort.InferenceSession(f'{M}/metric3d-vit-small/onnx/model.onnx', providers=['CPUExecutionProvider'])
    def f(a, res=1064):
        im = resize(a, res, 14).astype(np.float32)
        x = ((im - np.array([123.675, 116.28, 103.53], np.float32)) / np.array([58.395, 57.12, 57.375], np.float32)).transpose(2, 0, 1)[None]
        d, n, c = s.run(None, {'pixel_values': x})
        return up(n[0].transpose(1, 2, 0), a.shape[:2])
    return f


def make_dav2():
    import onnxruntime as ort
    s = ort.InferenceSession(f'{M}/depth-anything-v2-small/onnx/model.onnx', providers=['CPUExecutionProvider'])
    def f(a, res=1036):
        im = resize(a, res, 14).astype(np.float32) / 255
        x = ((im - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([0.229, 0.224, 0.225], np.float32)).transpose(2, 0, 1)[None]
        d = s.run(None, {'pixel_values': x})[0][0]     # relative inverse depth: larger = nearer
        d = np.asarray(Image.fromarray(d.astype(np.float32), 'F').resize((a.shape[1], a.shape[0]), Image.BICUBIC), dtype=np.float64)
        d = (d - d.mean()) / (d.std() + 1e-9)
        return height_normals(d * 2.0)                    # already in our convention
    f.native = True
    return f


def make_moge(name='moge-2-vitl-normal'):
    import torch
    sys.path.insert(0, CODE + '/microsoft/moge')
    from moge.model.v2 import MoGeModel
    model = MoGeModel.from_pretrained(f'{M}/{name}/model.pt').eval()
    def f(a, res=None):
        x = torch.tensor(a.astype(np.float32) / 255).permute(2, 0, 1)
        with torch.no_grad():
            o = model.infer(x, use_fp16=False, apply_mask=False, resolution_level=9)
        return o['normal'].cpu().numpy().astype(np.float64)
    return f


def make_marigold(steps=4):
    import torch, diffusers
    pipe = diffusers.MarigoldNormalsPipeline.from_pretrained(f'{M}/marigold-normals-v1-1', variant='fp16', torch_dtype=torch.float32)
    def f(a, res=768):
        g = torch.Generator().manual_seed(0)
        o = pipe(Image.fromarray(a), num_inference_steps=steps, ensemble_size=1, processing_resolution=res, match_input_resolution=True, generator=g, output_type='np')
        return np.asarray(o.prediction[0], dtype=np.float64)
    return f


def make_lotus():
    import torch
    sys.path.insert(0, CODE + '/envision-research/lotus')
    from pipeline import LotusDPipeline
    pipe = LotusDPipeline.from_pretrained(f'{M}/lotus-normal-d-v1-1', torch_dtype=torch.float32)
    pipe.set_progress_bar_config(disable=True)
    def f(a, res=768):
        im = resize(a, res, 8) if max(a.shape[:2]) != res or a.shape[0] % 8 or a.shape[1] % 8 else a
        x = (torch.tensor(im.astype(np.float32) / 127.5 - 1).permute(2, 0, 1)[None])
        task = torch.tensor([1, 0]).float().unsqueeze(0)
        task = torch.cat([torch.sin(task), torch.cos(task)], dim=-1)
        with torch.no_grad():
            o = pipe(rgb_in=x, prompt='', num_inference_steps=1, timesteps=[999], task_emb=task, output_type='np', processing_res=0).images[0]
        return up(np.asarray(o, dtype=np.float64) * 2 - 1, a.shape[:2])
    return f


def make_stablenormal():
    import torch
    sys.path.insert(0, CODE + '/stable-x/stablenormal')
    from nirne.pipeline_yoso_normal import YOSONormalsPipeline
    pipe = YOSONormalsPipeline.from_pretrained(f'{M}/yoso-normal-v1-8-1', variant='fp16', torch_dtype=torch.float32, trust_remote_code=True, t_start=0)
    pipe.set_progress_bar_config(disable=True)
    def f(a, res=768):
        im = Image.fromarray(resize(a, res, 64))
        o = pipe(im, match_input_resolution=True)
        return up(np.asarray(o.prediction[0], dtype=np.float64), a.shape[:2])
    return f


MODELS = dict(metric3d=make_metric3d, dav2=make_dav2, moge=make_moge, moges=lambda: make_moge('moge-2-vits-normal'),
              marigold=make_marigold, lotus=make_lotus, stablenormal=make_stablenormal)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('model')
    ap.add_argument('--tile', type=int, default=640)
    ap.add_argument('--pieces', default='door,lintel,dsc')
    ap.add_argument('--only', default='')
    args = ap.parse_args()
    f = MODELS[args.model]()
    native = getattr(f, 'native', False)
    signs = np.ones(3)
    if not native:
        img, inside, dx, dy = sphere_image()
        sx, sy, sz, cx, cy = convention(f(img), inside, dx, dy)
        signs = np.array([sx, sy, sz])
        print(f'{args.model}: convention signs {signs} (ball corr x {cx:.2f}, y {cy:.2f})', flush=True)
    for name in args.pieces.split(','):
        p = Piece(name)
        a = p.flat_a.astype(np.uint8)
        if args.only != 'tiled':
            t = time.time()
            n = f(a) * signs
            dt = time.time() - t
            np.save(f'{OUT}/{args.model}-{name}-whole.npy', n.astype(np.float16))
            report(f'{args.model} whole ({dt:.0f}s)', p, n)
        if args.only != 'whole':
            t = time.time()
            parts = [(win, f(np.ascontiguousarray(a[win[0]:win[1], win[2]:win[3]])) * signs) for win in tiles(a.shape[0], a.shape[1], args.tile, args.tile // 4)]
            n = blend_tiles(a.shape[:2], parts)
            dt = time.time() - t
            np.save(f'{OUT}/{args.model}-{name}-tiled.npy', n.astype(np.float16))
            report(f'{args.model} tiled{args.tile} ({dt:.0f}s)', p, n)
        sys.stdout.flush()


if __name__ == '__main__':
    main()
