"""Recorta las piezas sueltas de una lámina sobre pergamino y las guarda con
fondo transparente (128 px). Uso:
  recortar_piezas.py lamina.webp nombre1 nombre2 ...   (en orden de lectura)"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

OUT = 128
src, names = sys.argv[1], sys.argv[2:]
img = Image.open(src).convert('RGB')
a = np.asarray(img).astype(float)
h, w, _ = a.shape
small = np.asarray(img.resize((w // 8, h // 8))).astype(float)
paper = np.stack([ndimage.grey_closing(small[..., c], size=(9, 9)) for c in range(3)], -1)
paper = np.asarray(Image.fromarray(paper.astype('uint8')).resize((w, h), Image.BILINEAR)).astype(float)
fig = np.abs(a - paper).sum(-1) > 70
fig = ndimage.binary_closing(fig, iterations=2)
lab, n = ndimage.label(fig)
sizes = ndimage.sum(fig, lab, range(1, n + 1))
objs = ndimage.find_objects(lab)
cand = [(sizes[i], objs[i], i + 1) for i in range(n)
        if (objs[i][0].stop - objs[i][0].start) < h * 0.6 and (objs[i][1].stop - objs[i][1].start) < w * 0.6]
cand = sorted(cand, key=lambda c: -c[0])[:len(names)]
rowh = h / 6
cand.sort(key=lambda c: (round(((c[1][0].start + c[1][0].stop) / 2) / rowh / 1.5), (c[1][1].start + c[1][1].stop) / 2))
for name, (_, s, i) in zip(names, cand):
    y0, y1, x0, x1 = s[0].start, s[0].stop, s[1].start, s[1].stop
    # se rellenan los huecos interiores (zonas claras de la pieza); el hueco de la
    # espiral queda fuera porque se abre hacia el exterior
    m = ndimage.binary_erosion(ndimage.binary_fill_holes(lab[y0:y1, x0:x1] == i), iterations=1)
    alpha = ndimage.gaussian_filter(m.astype(float), 0.7)
    rgba = np.dstack([a[y0:y1, x0:x1], alpha * 255]).astype('uint8')
    side = max(y1 - y0, x1 - x0)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(Image.fromarray(rgba, 'RGBA'), ((side - (x1 - x0)) // 2, (side - (y1 - y0)) // 2))
    canvas.resize((OUT, OUT), Image.LANCZOS).save(f'public/img/formas/{name}.webp', quality=92)
    print(name, (x0 + x1) // 2, (y0 + y1) // 2)
