"""Variantes de color de los héroes: tiñe la ropa con el color del jugador.

Las ilustraciones están en sepia y la ropa no siempre tiene un color propio,
así que para cada héroe se indica qué zonas de color (grupos k-means sobre la
imagen suavizada, ordenados de rojo a verde-amarillo) son su ropa. Los héroes
que no aparecen en ROPA ya tienen ropa de color frío y usan recolor.recolor.
La cara nunca se tiñe (la parte superior de la figura queda fuera)."""
import os
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
from scipy.cluster.vq import kmeans2

sys.path.insert(0, os.path.dirname(__file__))
from recolor import TARGET, recolor  # noqa: E402

K = 5
ROPA = {
    'durgan-barbaro': [4], 'durgan-clerigo': [2, 3, 4], 'durgan-druida': [3, 4], 'durgan-explorador': [3, 4],
    'durgan-guerrero': [2, 3], 'durgan-ladron': [3, 4],
    'elfo-barbaro': [3, 4], 'elfo-clerigo': [3, 4], 'elfo-druida': [3, 4], 'elfo-explorador': [1, 4], 'elfo-ladron': [3, 4],
    'enano-barbaro': [4], 'enano-clerigo': [2, 3, 4], 'enano-druida': [3, 4], 'enano-explorador': [1, 2], 'enano-ladron': [3, 4],
    'faunar-barbaro': [4], 'faunar-clerigo': [1, 3], 'faunar-druida': [2, 3], 'faunar-explorador': [4], 'faunar-guerrero': [4],
    'gnomo-barbaro': [3], 'gnomo-clerigo': [3, 4], 'gnomo-druida': [4], 'gnomo-explorador': [1, 4], 'gnomo-guerrero': [3, 4],
    'gnomo-ladron': [3, 4],
    'humano-barbaro': [3, 4], 'humano-clerigo': [3, 4], 'humano-druida': [3, 4], 'humano-explorador': [3, 4],
    'humano-guerrero': [4], 'humano-ladron': [3, 4],
    'silvano-barbaro': [3], 'silvano-clerigo': [3], 'silvano-druida': [3], 'silvano-explorador': [2, 3],
    'silvano-guerrero': [3], 'silvano-ladron': [3],
}


def clusters(rgb_img, opaque):
    lab = np.asarray(rgb_img.filter(ImageFilter.GaussianBlur(5)).convert('LAB')).astype(float)
    L = lab[..., 0]
    m = opaque & (L > 30)
    a, b = lab[..., 1] - 128, lab[..., 2] - 128
    X = np.stack([a[m], b[m], (L[m] - 128) * 0.15], 1)
    C, lbl = kmeans2(X, K, minit='++', seed=3)
    order = np.argsort(np.degrees(np.arctan2(C[:, 1], C[:, 0])))
    remap = np.zeros(K, int)
    remap[order] = np.arange(K)
    full = np.full(opaque.shape, -1)
    full[m] = remap[lbl]
    return full


def cloth_mask(rgb_img, opaque, picks):
    cl = clusters(rgb_img, opaque)
    sel = np.isin(cl, picks)
    sel = ndimage.binary_opening(sel, iterations=2)
    sel = ndimage.binary_closing(sel, iterations=3)
    # fuera la cabeza: franja superior de la figura
    ys = np.where(opaque.any(1))[0]
    top, bot = ys.min(), ys.max()
    yy = np.arange(opaque.shape[0])[:, None]
    head = np.clip((yy - (top + 0.15 * (bot - top))) / (0.05 * (bot - top)), 0, 1)
    a = np.asarray(rgb_img).astype(float)
    lum = a @ [0.3, 0.59, 0.11]
    w = sel * head * np.clip((lum - 25) / 30, 0, 1) * np.clip((240 - lum) / 25, 0, 1) * opaque
    return np.asarray(Image.fromarray((w * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(2))) / 255.0


def tint(a, color):
    """Color del jugador con la misma luminosidad que el original (sin neón)."""
    th, ts = TARGET[color]
    h6 = (th / 60.0) % 6
    x = 1 - abs(h6 % 2 - 1)
    pure = np.array([(1, x, 0), (x, 1, 0), (0, 1, x), (0, x, 1), (x, 0, 1), (1, 0, x)][int(h6)], float)
    hue_rgb = (1 - ts) + ts * pure  # a V=1
    lum = a @ [0.3, 0.59, 0.11]
    if color == 'amarillo':
        lum = lum * 1.12 + 12  # que no tire a oliva en las sombras
    out = hue_rgb[None, None, :] * (lum / (hue_rgb @ [0.3, 0.59, 0.11]))[..., None]
    return out.clip(0, 255)


def variant(key, orig_path, base_path, color):
    base = Image.open(base_path).convert('RGBA')
    al = np.asarray(base)[..., 3]
    orig = Image.open(orig_path).convert('RGB')
    if key in ROPA:
        a = np.asarray(orig).astype(float)
        w = cloth_mask(orig, al > 128, ROPA[key])
        w = w * 0.92
        out = a * (1 - w[..., None]) + tint(a, color) * w[..., None]
    else:
        out = np.asarray(recolor(orig_path, color)).astype(float)
    return Image.fromarray(np.dstack([out.clip(0, 255), al]).astype('uint8'), 'RGBA')


if __name__ == '__main__':
    # uso: recolor_ropa.py <dir originales> <dir heroes publicados> [claves...]
    src, pub = sys.argv[1], sys.argv[2]
    keys = sys.argv[3:] or sorted(f[:-5] for f in os.listdir(pub) if f.endswith('.webp'))
    for k in keys:
        for col in TARGET:
            variant(k, f'{src}/{k}.webp', f'{pub}/{k}.webp', col).save(f'{pub}/color/{k}-{col}.webp', quality=88)
        print(k)
