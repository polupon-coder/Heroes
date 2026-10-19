"""Prepara las ilustraciones originales para el juego (recortes, fondos transparentes, tamaños web).

Uso: python3 tools/preparar_arte.py <carpeta con los originales numerados>
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageChops

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'img')


def load(n):
    return Image.open(os.path.join(SRC, f'{n}.webp')).convert('RGB')


def save(im, folder, name, **kw):
    os.makedirs(os.path.join(OUT, folder), exist_ok=True)
    im.save(os.path.join(OUT, folder, f'{name}.webp'), 'WEBP', quality=kw.get('q', 84), method=6)


def cut_background(im, thr=40, feather=2):
    """Quita el fondo liso (el color de la esquina) que toca los bordes."""
    bg = im.getpixel((3, 3))
    diff = ImageChops.difference(im, Image.new('RGB', im.size, bg)).convert('L')
    # 255 = parecido al fondo; 0 = figura
    like = diff.point(lambda v: 255 if v < thr else 0)
    w, h = im.size
    seeds = [(x, y) for x in range(0, w, 16) for y in (0, h - 1)] + [(x, y) for y in range(0, h, 16) for x in (0, w - 1)]
    for s in seeds:
        if like.getpixel(s) == 255:
            ImageDraw.floodfill(like, s, 128)
    alpha = like.point(lambda v: 0 if v == 128 else 255)
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(feather))
    out = im.convert('RGBA')
    out.putalpha(alpha)
    return out.crop(alpha.point(lambda v: 255 if v > 20 else 0).getbbox())


def fit(im, size):
    im = im.copy()
    im.thumbnail((size, size), Image.LANCZOS)
    return im


# El Claro: círculo de piedras (sin fondo) sobre el suelo del bosque.
save(fit(cut_background(load(7), thr=30), 1100), 'ui', 'claro-piedras')
save(fit(load(8), 1300), 'ui', 'claro', q=80)
# Mesa de madera para el fondo de la página.
save(load(9).resize((1920, 1080), Image.LANCZOS), 'ui', 'mesa', q=82)

# Mascotas: hoja de 3 × 2 (gato, lechuza, zorro / cervatillo, liebre, conejo).
sheet = load(10)
cw, ch = sheet.width // 3, sheet.height // 2
for (cx, cy), name in {(1, 0): 'lechuza', (2, 0): 'zorro', (0, 1): 'cervatillo', (1, 1): 'liebre'}.items():
    # Márgenes para no arrastrar orejas o colas de los vecinos.
    cell = sheet.crop((cx * cw + 12, cy * ch + 8, (cx + 1) * cw - 12, (cy + 1) * ch - (40 if cy == 0 else 8)))
    save(fit(cut_background(cell, thr=28), 420), 'mascotas', name)

# Ingredientes: cuatro fichas redondas (Éter, Umbra / Lumen, Raíz).
tokens = load(11)
bg = tokens.getpixel((3, 3))
ink = ImageChops.difference(tokens, Image.new('RGB', tokens.size, bg)).convert('L').point(lambda v: 255 if v > 45 else 0)
mx, my = tokens.width // 2, tokens.height // 2
for (qx, qy), name in {(0, 0): 'eter', (1, 0): 'umbra', (0, 1): 'lumen', (1, 1): 'raiz'}.items():
    box = (qx * mx, qy * my, (qx + 1) * mx, (qy + 1) * my)
    l, t, r, b = ink.crop(box).getbbox()
    l, t, r, b = l + box[0], t + box[1], r + box[0], b + box[1]
    # El ancho es fiable; en vertical las fichas vecinas pueden solaparse en el recorte.
    side = r - l
    cx = (l + r) // 2
    cy = t + side // 2 if qy == 0 else b - side // 2
    piece = tokens.crop((cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)).convert('RGBA')
    big = Image.new('L', (side * 4, side * 4), 0)
    m = side * 4 * 0.035
    ImageDraw.Draw(big).ellipse((m, m, side * 4 - m, side * 4 - m), fill=255)
    piece.putalpha(big.resize((side, side), Image.LANCZOS))
    save(piece.resize((256, 256), Image.LANCZOS), 'ingredientes', name, q=88)
print('listo')
