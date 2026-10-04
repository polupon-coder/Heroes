"""Recorta los retratos desde las láminas originales separando cada figura de sus vecinas."""
import sys
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage

IMG = sys.argv[1]  # carpeta con las láminas originales (1.webp, 2.webp...)
OUT = sys.argv[2]
SHEETS = {'1': 'durgan', '2': 'faunar', '3': 'silvano', '4': 'gnomo', '5': 'elfo', '7': 'enano'}
TOP = ['guerrero', 'mago', 'ladron', 'druida']
BOT = ['explorador', 'clerigo', 'barbaro']


HUMANS = {'8': 'explorador', '9': 'clerigo', '10': 'druida', '11': 'mago', '12': 'barbaro', '14': 'ladron', '15': 'guerrero'}


def rows_for(raza, W, H=None):
    if raza.startswith('humano-'):
        return [([raza.split('-')[1]], int(H * 0.04), int(H * 0.97), [0, W])]
    if raza == 'faunar':
        return [(TOP, 8, 500, [0, W/4, W/2, 3*W/4, W]), (BOT, 538, 958, [0, W*0.35, W*0.68, W])]
    if raza == 'enano':
        return [(TOP, 8, 468, [0, W/4, W/2, 3*W/4, W]), (BOT, 505, 935, [0, W*0.37, W*0.66, W])]
    return [(TOP, 15, 510, [0, W/4, W/2, 3*W/4, W]), (BOT, 548, 1008, [0, W*0.35, W*0.68, W])]


def figure(im, a, lab, y0, y1, xa, xb):
    H, W = lab.shape
    lum = a.mean(axis=2)
    ink = lab > 0
    # centro de masa de la tinta de la columna
    sub = ink[y0:y1, int(xa):int(xb)]
    ys, xs = np.nonzero(sub)
    cx = int(xs.mean() + xa)
    # componentes que tocan una franja central de la figura
    band = lab[y0 + (y1 - y0) // 5: y1 - (y1 - y0) // 10, max(0, cx - 25): cx + 25]
    ids = set(np.unique(band)) - {0}
    keep = np.isin(lab, list(ids))
    keep[:y0 - 5 if y0 > 5 else 0] = False
    keep[y1 + 5:] = False
    # Si se ha fundido con una figura vecina, cortar por el valle de menos tinta
    # entre esta figura y la de al lado.
    xs = np.nonzero(keep.any(axis=0))[0]
    col = xb - xa
    if len(xs) and xs.max() - xs.min() > col * 1.25:
        dens = ink[y0:y1].sum(axis=0).astype(float)
        dens = np.convolve(dens, np.ones(15) / 15, mode='same')
        left = dens[int(max(0, cx - col * 0.95)):int(cx - col * 0.08)]
        right = dens[int(cx + col * 0.08):int(min(W, cx + col * 0.95))]
        if len(left):
            lo = int(max(0, cx - col * 0.95)) + int(np.argmin(left))
            keep[:, :lo] = False
        if len(right):
            hi = int(cx + col * 0.08) + int(np.argmin(right))
            keep[:, hi:] = False
    # Quitar fragmentos sueltos pequeños (puntas de armas vecinas)
    kl, kn = ndimage.label(keep)
    if kn > 1:
        sizes = ndimage.sum(np.ones_like(kl), kl, range(1, kn + 1))
        big = [i + 1 for i, sz in enumerate(sizes) if sz >= sizes.max() * 0.04]
        keep = np.isin(kl, big)
    return keep, cx


def run():
    jobs = list(SHEETS.items()) + [(k, 'humano-' + c) for k, c in HUMANS.items()]
    for k, raza in jobs:
        im = Image.open(f'{IMG}/{k}.webp').convert('RGB')
        a = np.asarray(im).astype(float)
        H, W, _ = a.shape
        lum = a.mean(axis=2)
        paper = np.median(a[lum > np.percentile(lum, 70)], axis=0)
        ink = np.abs(a - paper).sum(axis=2) > 80
        ink = ndimage.binary_opening(ink, iterations=1)
        grown = ndimage.binary_dilation(ink, iterations=3)
        lab, _ = ndimage.label(grown)
        for names, y0, y1, b in rows_for(raza, W, H):
            for j, name in enumerate(names):
                keep, cx = figure(im, a, lab, y0, y1, b[j], b[j + 1])
                ys, xs = np.nonzero(keep)
                fy0, fy1 = ys.min(), ys.max()
                fx0, fx1 = xs.min(), xs.max()
                h = (fy1 - fy0) * 1.06
                w = max((fx1 - fx0) * 1.08, h * 0.75)
                h = w / 0.75
                cy = (fy0 + fy1) / 2
                ccx = (fx0 + fx1) / 2
                box = [int(ccx - w / 2), int(cy - h / 2), int(ccx + w / 2), int(cy + h / 2)]
                m = Image.fromarray((ndimage.binary_dilation(keep, iterations=4) * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(3))
                mm = np.asarray(m).astype(float)[..., None] / 255
                rng = np.random.default_rng(1)
                fill = np.clip(paper + rng.normal(0, 3, a.shape), 0, 255)
                clean = Image.fromarray((a * mm + fill * (1 - mm)).astype('uint8'))
                canvas = Image.new('RGB', (box[2] - box[0], box[3] - box[1]), tuple(int(v) for v in paper))
                canvas.paste(clean.crop((max(0, box[0]), max(0, box[1]), min(W, box[2]), min(H, box[3]))), (max(0, -box[0]), max(0, -box[1])))
                canvas.resize((360, 480), Image.LANCZOS).save(f'{OUT}/{raza.split("-")[0]}-{name}.webp', 'WEBP', quality=84)


run()
