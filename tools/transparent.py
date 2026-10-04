"""Quita el papel de fondo de una ilustración: la figura queda entera y nítida
sobre fondo transparente. También vacía el papel que queda entre brazos y
piernas y elimina trozos de figuras vecinas que asoman por los bordes."""
import sys
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage


def paper_reference(a):
    h, w, _ = a.shape
    border = np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3), a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
    fill = np.median(border, axis=0)
    lum = a.mean(axis=2)
    paper = np.median(a[lum > np.percentile(lum, 60)], axis=0)
    # Papel local (el tono varía por la hoja): cierre morfológico que borra los trazos
    small = np.asarray(Image.fromarray(a.astype('uint8')).resize((max(1, w // 4), max(1, h // 4)))).astype(float)
    local = np.stack([ndimage.uniform_filter(ndimage.grey_closing(small[..., c], size=(15, 15)), size=9) for c in range(3)], axis=-1)
    local = np.asarray(Image.fromarray(local.clip(0, 255).astype('uint8')).resize((w, h), Image.BILINEAR)).astype(float)
    near = np.abs(local - paper).sum(axis=2) < 120
    return np.where(near[..., None], local, paper), fill


def to_alpha(img, thr=38, loose=75):
    a = np.asarray(img.convert('RGB')).astype(float)
    h, w, _ = a.shape
    ref, fill = paper_reference(a)
    diff = np.minimum(np.abs(a - ref).sum(axis=2), np.abs(a - fill).sum(axis=2))
    # Fondo = papel conectado con el borde de la imagen (inunda también los huecos
    # entre brazos y piernas que se abren hacia fuera). La figura está rodeada de
    # tinta, así que sus zonas claras (túnicas, pergaminos) no se pierden.
    paperish = diff < loose
    paperish = ndimage.binary_opening(paperish, iterations=1)
    lab, n = ndimage.label(paperish)
    edge_ids = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge_ids))
    # Huecos cerrados grandes y muy parecidos al papel (entre brazo y cuerpo)
    strict = diff < thr
    sl, sn = ndimage.label(strict & ~bg)
    if sn:
        ss = ndimage.sum(np.ones_like(sl), sl, range(1, sn + 1))
        bg |= np.isin(sl, [i + 1 for i, v in enumerate(ss) if v > h * w * 0.004])
    mask = ~bg
    mask = ndimage.binary_opening(mask, iterations=1)
    # Componentes: la figura central y sus piezas; fuera trozos vecinos en los bordes.
    lab, n = ndimage.label(ndimage.binary_dilation(mask, iterations=2))
    if n:
        sizes = ndimage.sum(mask, lab, range(1, n + 1))
        cy0, cy1, cx0, cx1 = int(h * .2), int(h * .9), int(w * .3), int(w * .7)
        central = set(np.unique(lab[cy0:cy1, cx0:cx1])) - {0}
        if not central:
            central = {int(np.argmax(sizes)) + 1}
        big = max(sizes[i - 1] for i in central)
        keep = []
        for i in range(1, n + 1):
            comp = lab == i
            touches = comp[0].any() or comp[-1].any() or comp[:, 0].any() or comp[:, -1].any()
            if i in central and sizes[i - 1] >= big * 0.02:
                keep.append(i)
            elif not touches and sizes[i - 1] >= big * 0.03:
                keep.append(i)
        mask = mask & np.isin(lab, keep)
    alpha = np.asarray(Image.fromarray((mask * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.7))).astype(float)
    # Sin líneas de corte: los cantos del recorte (suelo o trozos cortados) se desvanecen
    # en una franja estrecha; la figura no se toca.
    m = max(3, int(min(h, w) * 0.035))
    ramp = np.minimum.reduce([
        np.clip(np.arange(h) / m, 0, 1)[:, None] * np.ones((1, w)),
        np.clip((h - 1 - np.arange(h)) / m, 0, 1)[:, None] * np.ones((1, w)),
        np.ones((h, 1)) * np.clip(np.arange(w) / m, 0, 1)[None, :],
        np.ones((h, 1)) * np.clip((w - 1 - np.arange(w)) / m, 0, 1)[None, :],
    ])
    alpha = alpha * ramp
    return Image.fromarray(np.dstack([a, alpha]).astype('uint8'), 'RGBA')


if __name__ == '__main__':
    thr = float(sys.argv[1])
    for f in sys.argv[2:]:
        to_alpha(Image.open(f), thr).save(f, 'WEBP', quality=84)
