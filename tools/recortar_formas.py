"""Recorta la lámina de formas (6 colores x 6 formas) en piezas transparentes:
public/img/formas/{forma}-{color}.webp. Uso: recortar_formas.py lamina.webp"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

COLS = ['rojo', 'azul', 'verde', 'amarillo', 'blanco', 'negro']
ROWS = ['circulo', 'cuadrado', 'rombo', 'triangulo', 'estrella', 'cruz']
OUT = 128

img = Image.open(sys.argv[1]).convert('RGB')
a = np.asarray(img).astype(float)
h, w, _ = a.shape
# papel local: cierre morfológico grande sobre la imagen reducida
small = np.asarray(img.resize((w // 8, h // 8))).astype(float)
paper = np.stack([ndimage.grey_closing(small[..., c], size=(9, 9)) for c in range(3)], -1)
paper = np.asarray(Image.fromarray(paper.astype('uint8')).resize((w, h), Image.BILINEAR)).astype(float)
diff = np.abs(a - paper).sum(-1)
fig = diff > 70
fig = ndimage.binary_closing(fig, iterations=2)
fig = ndimage.binary_fill_holes(fig)
# rejilla: centros de columnas y filas a partir de las figuras grandes
lab, n = ndimage.label(fig)
sizes = ndimage.sum(fig, lab, range(1, n + 1))
objs = ndimage.find_objects(lab)
big = [o for o, sz in zip(objs, sizes) if sz > 0.25 * np.median(sorted(sizes)[-36:])
       and (o[0].stop - o[0].start) < h / 4 and (o[1].stop - o[1].start) < w / 4]
def centers(vals, k):
    vals = np.sort(np.array(vals))
    gaps = np.argsort(np.diff(vals))[::-1][:k - 1]
    cuts = np.sort(gaps)
    groups = np.split(vals, cuts + 1)
    return [float(np.median(g)) for g in groups]
cx = centers([(o[1].start + o[1].stop) / 2 for o in big], 6)
cy = centers([(o[0].start + o[0].stop) / 2 for o in big], 6)
hx = min(np.diff(cx)) / 2
hy = min(np.diff(cy)) / 2
for r, yc in enumerate(cy):
    for c, xc in enumerate(cx):
        y0, y1, x0, x1 = int(yc - hy), int(yc + hy), int(xc - hx), int(xc + hx)
        cell = fig[y0:y1, x0:x1]
        l2, n2 = ndimage.label(cell)
        sz = ndimage.sum(cell, l2, range(1, n2 + 1))
        m = l2 == (int(np.argmax(sz)) + 1)
        m = ndimage.binary_erosion(ndimage.binary_fill_holes(m), iterations=1)
        ys, xs = np.where(m)
        by0, by1, bx0, bx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        alpha = ndimage.gaussian_filter(m.astype(float), 0.7)[by0:by1, bx0:bx1]
        rgba = np.dstack([a[y0:y1, x0:x1][by0:by1, bx0:bx1], alpha * 255]).astype('uint8')
        piece = Image.fromarray(rgba, 'RGBA')
        side = max(by1 - by0, bx1 - bx0)
        canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        canvas.paste(piece, ((side - (bx1 - bx0)) // 2, (side - (by1 - by0)) // 2))
        canvas.resize((OUT, OUT), Image.LANCZOS).save(f'public/img/formas/{ROWS[r]}-{COLS[c]}.webp', quality=92)
# Lo que pide un monstruo de formas: la silueta en tinta sepia.
for sh in ROWS:
    al = np.asarray(Image.open(f'public/img/formas/{sh}-negro.webp').convert('RGBA'))[..., 3]
    ink = np.zeros(al.shape + (4,), 'uint8')
    ink[..., :3] = (74, 58, 40)
    ink[..., 3] = (al * 0.92).astype('uint8')
    Image.fromarray(ink, 'RGBA').save(f'public/img/formas/{sh}-tinta.webp', quality=92)
print('ok', [round(x) for x in cx], [round(y) for y in cy])
