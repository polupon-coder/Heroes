"""Quita el fondo de papel de una ilustración: la figura queda entera y nítida
sobre fondo transparente (sin difuminados)."""
import sys
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage


def to_alpha(img, thr=38, min_frac=0.002):
    a = np.asarray(img.convert('RGB')).astype(float)
    h, w, _ = a.shape
    border = np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3), a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
    paper = np.median(border, axis=0)
    # Si el borde es un relleno distinto del papel, usar el tono de los píxeles claros
    lum = a.mean(axis=2)
    light = a[lum > np.percentile(lum, 60)]
    if np.abs(np.median(light, axis=0) - paper).sum() > 25:
        paper = np.median(light, axis=0)
    # El papel puede variar de tono: estimarlo localmente con un filtro de mediana grande sobre el borde
    # Papel local: se eliminan los trazos oscuros con un cierre morfológico grande
    small = Image.fromarray(a.astype('uint8')).resize((max(1, w // 4), max(1, h // 4)))
    sa = np.asarray(small).astype(float)
    local = np.stack([ndimage.grey_closing(sa[..., c], size=(15, 15)) for c in range(3)], axis=-1)
    local = np.stack([ndimage.uniform_filter(local[..., c], size=9) for c in range(3)], axis=-1)
    local = np.asarray(Image.fromarray(local.clip(0, 255).astype('uint8')).resize((w, h), Image.BILINEAR)).astype(float)
    # El papel local solo vale si se parece al papel del borde (si no, es la figura)
    near = np.abs(local - paper).sum(axis=2) < 120
    ref = np.where(near[..., None], local, paper)
    diff = np.abs(a - ref).sum(axis=2)
    # Lo que se parece al relleno del borde también es fondo
    fill = np.median(border, axis=0)
    mask = (diff > thr) & (np.abs(a - fill).sum(axis=2) > thr)
    mask = ndimage.binary_opening(mask, iterations=1)
    mask = ndimage.binary_closing(mask, iterations=3)
    mask = ndimage.binary_fill_holes(mask)
    lab, n = ndimage.label(mask)
    if n:
        sizes = ndimage.sum(mask, lab, range(1, n + 1))
        keep = [i + 1 for i, s in enumerate(sizes) if s >= max(sizes.max() * 0.01, h * w * min_frac)]
        mask = np.isin(lab, keep)
    # Borde suave de 1 px para que no quede dentado (no es un difuminado de la figura)
    soft = np.clip((diff - thr * 0.6) / (thr * 0.8), 0, 1)
    edge = ndimage.binary_dilation(mask, iterations=2) & ~ndimage.binary_erosion(mask, iterations=1)
    alpha = np.where(mask, 1.0, 0.0)
    alpha = np.where(edge, np.maximum(alpha * 0.85, soft), alpha)
    alpha = np.asarray(Image.fromarray((alpha * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.6))) / 255
    out = np.dstack([a, alpha * 255]).astype('uint8')
    return Image.fromarray(out, 'RGBA')


if __name__ == '__main__':
    thr = float(sys.argv[1])
    for f in sys.argv[2:]:
        to_alpha(Image.open(f), thr).save(f, 'WEBP', quality=84)
