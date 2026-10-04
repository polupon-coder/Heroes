"""Deja solo la figura central de un recorte: borra trozos de figuras vecinas
que asoman por los bordes y los rellena con el color del pergamino."""
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage


def isolate(im, central=(0.3, 0.7), dilate=5, thr=48):
    a = np.asarray(im.convert('RGB')).astype(float)
    h, w, _ = a.shape
    lum = a.mean(axis=2)
    # Color del papel: mediana de los píxeles claros
    light = a[lum > np.percentile(lum, 70)]
    paper = np.median(light, axis=0)
    diff = np.abs(a - paper).sum(axis=2)
    ink = diff > thr
    grown = ndimage.binary_dilation(ink, iterations=dilate)
    lab, n = ndimage.label(grown)
    if n == 0:
        return im
    x0, x1 = int(w * central[0]), int(w * central[1])
    centre = lab[int(h * 0.12):int(h * 0.95), x0:x1]
    keep_ids = set(np.unique(centre)) - {0}
    if not keep_ids:  # por si acaso: el componente más grande
        sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
        keep_ids = {int(np.argmax(sizes)) + 1}
    keep = np.isin(lab, list(keep_ids))
    keep = ndimage.binary_dilation(keep, iterations=3)
    # Suavizar el borde de la máscara
    m = Image.fromarray((keep * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(3))
    m = np.asarray(m).astype(float)[..., None] / 255
    rng = np.random.default_rng(0)
    fill = np.clip(paper + rng.normal(0, 3, a.shape), 0, 255)
    out = a * m + fill * (1 - m)
    return Image.fromarray(out.astype('uint8'))


if __name__ == '__main__':
    import sys
    for f in sys.argv[1:]:
        isolate(Image.open(f)).save(f, 'WEBP', quality=84)
