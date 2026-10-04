"""Genera las piezas de color y forma (img/formas/{forma}-{color}.webp):
figura rellena del color, con textura de pigmento, bisel suave y contorno de tinta.
'tinta' es la figura en tinta oscura, sin color, para lo que piden los monstruos."""
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

S = 128
K = 4  # supermuestreo
COLORS = {
    'rojo': (176, 42, 36), 'azul': (46, 98, 168), 'verde': (72, 116, 56), 'amarillo': (214, 164, 48),
    'blanco': (226, 221, 206), 'negro': (52, 50, 48),
}
SHAPES = ['circulo', 'cuadrado', 'rombo', 'triangulo', 'estrella', 'cruz']


def shape_mask(shape):
    n = S * K
    im = Image.new('L', (n, n), 0)
    d = ImageDraw.Draw(im)
    c, m = n / 2, 12 * K
    if shape == 'circulo':
        d.ellipse([m, m, n - m, n - m], fill=255)
    elif shape == 'cuadrado':
        d.rounded_rectangle([m + 6 * K, m + 6 * K, n - m - 6 * K, n - m - 6 * K], radius=8 * K, fill=255)
    elif shape == 'rombo':
        d.polygon([(c, m - 2 * K), (n - m + 2 * K, c), (c, n - m + 2 * K), (m - 2 * K, c)], fill=255)
    elif shape == 'triangulo':
        d.polygon([(c, m), (n - m + 2 * K, n - m - 4 * K), (m - 2 * K, n - m - 4 * K)], fill=255)
    elif shape == 'estrella':
        R, r = (n / 2 - m + 6 * K), (n / 2 - m + 6 * K) * 0.44
        pts = []
        for i in range(10):
            a = -math.pi / 2 + i * math.pi / 5
            rr = R if i % 2 == 0 else r
            pts.append((c + rr * math.cos(a), c + 6 * K + rr * math.sin(a)))
        d.polygon(pts, fill=255)
    elif shape == 'cruz':
        w = 15 * K
        L = n / 2 - m + 2 * K
        for ang in (45, -45):
            bar = Image.new('L', (n, n), 0)
            ImageDraw.Draw(bar).rounded_rectangle([c - L, c - w, c + L, c + w], radius=3 * K, fill=255)
            im = Image.fromarray(np.maximum(np.asarray(im), np.asarray(bar.rotate(ang, resample=Image.BICUBIC))))
    return np.asarray(im) > 127


def piece(shape, color, rng):
    mk = shape_mask(shape)
    n = S * K
    dist = ndimage.distance_transform_edt(mk)
    edge = mk & (dist <= 3.2 * K)
    out = np.zeros((n, n, 4), float)
    if color == 'tinta':
        out[..., :3] = (74, 58, 40)
        out[..., 3] = np.where(mk, 235, 0)
    else:
        base = np.array(COLORS[color], float)
        # textura de pigmento: manchas de distintos tamaños
        t = sum(ndimage.gaussian_filter(rng.standard_normal((n, n)), s) * w for s, w in ((3 * K, 1.0), (1.2 * K, .5)))
        t = t / (np.abs(t).max() + 1e-6)
        # bisel: luz arriba a la izquierda cerca del borde
        gy, gx = np.gradient(ndimage.gaussian_filter(np.minimum(dist, 9 * K), 2 * K))
        light = np.clip((-gx - gy) * 0.9, -1, 1) * np.clip(1 - dist / (10 * K), 0, 1)
        shade = 1 + 0.10 * t + 0.28 * light
        yy = np.linspace(-1, 1, n)[:, None]
        shade = shade * (1.06 - 0.10 * yy)
        out[..., :3] = np.clip(base[None, None, :] * shade[..., None] + 18 * light[..., None], 0, 255)
        out[..., 3] = np.where(mk, 255, 0)
    out[edge, :3] = (30, 24, 19)
    out[edge, 3] = 255
    img = Image.fromarray(out.astype('uint8'), 'RGBA').resize((S, S), Image.LANCZOS)
    return img


if __name__ == '__main__':
    rng = np.random.default_rng(7)
    for sh in SHAPES:
        for col in list(COLORS) + ['tinta']:
            piece(sh, col, rng).save(f'public/img/formas/{sh}-{col}.webp', quality=92)
    print('ok')
