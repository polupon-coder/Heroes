"""Títulos caligráficos (hojas 29 y 47) en marfil liso: sin la textura plateada que se veía a manchas."""
import sys
import numpy as np
from PIL import Image

SRC = sys.argv[1:3]  # español, inglés
for src, out in zip(SRC, ['titulo', 'titulo-en']):
    a = np.asarray(Image.open(src).convert('RGBA')).astype(float)
    al = np.clip((a[..., 3] / 255 - 0.12) / 0.5, 0, 1)  # trazo lleno, sin zonas medio transparentes
    h, w = al.shape
    grad = np.linspace(1, 0.9, h)[:, None] * np.ones((1, w))  # leve degradado de arriba abajo
    rgb = np.stack([253 * grad, 247 * grad, 232 * grad], -1)
    img = Image.fromarray(np.dstack([rgb, al * 255]).clip(0, 255).astype('uint8'), 'RGBA')
    bb = img.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox()
    img = img.crop((bb[0] - 4, bb[1] - 4, bb[2] + 4, bb[3] + 4))
    img.thumbnail((1400, 1400))
    img.save(f'public/img/ui/{out}.webp', quality=92)
    print(out, img.size)
