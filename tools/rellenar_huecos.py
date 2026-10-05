"""Rellena los huecos que el quitado de fondo abrió dentro de las figuras
(túnicas claras, caras): un hueco es una zona transparente que no llega al
fondo exterior por un paso de al menos 2·R píxeles. Se pinta con el color
del dibujo original. Uso: rellenar_huecos.py <dir originales> <imagenes...>"""
import os
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

R = int(os.environ.get('HUECO_R', 4))


def fill(png, orig):
    im = Image.open(png).convert('RGBA')
    a = np.asarray(im).astype(float)
    alpha = a[..., 3]
    T = alpha < 128
    yy, xx = np.mgrid[-R:R + 1, -R:R + 1]
    disk = (xx ** 2 + yy ** 2) <= R * R
    Topen = ndimage.binary_opening(T, structure=disk)
    lab, n = ndimage.label(Topen)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    ext = np.isin(lab, list(border))
    ext = ndimage.binary_dilation(ext, structure=disk) & T
    # lo que queda transparente y no es exterior: hueco
    holes = T & ~ext
    # crece desde el exterior por pasos estrechos solo si está pegado al borde de la imagen
    # dentro de la figura nada debe quedar a medio transparentar (túnicas claras)
    solid = ndimage.binary_erosion(ndimage.binary_fill_holes(~ext), iterations=2)
    semi = solid & (alpha < 250)
    if not holes.any() and not semi.any():
        return 0
    rgb = np.asarray(Image.open(orig).convert('RGB')).astype(float)
    # Solo se rellena lo que tiene dibujo (trazos de tinta, pliegues); el papel liso
    # entre las piernas o bajo los brazos sigue transparente.
    gray = rgb.mean(axis=2)
    detail = ndimage.uniform_filter(np.abs(ndimage.sobel(gray, 0)) + np.abs(ndimage.sobel(gray, 1)), 7)
    region = (holes | (solid & T))
    lab, n = ndimage.label(region)
    keep = np.zeros_like(region)
    for i in range(1, n + 1):
        comp = lab == i
        if detail[comp].mean() > float(os.environ.get('HUECO_DET', 55)):
            keep |= comp
    plain = region & ~keep
    holes = holes & keep
    solid = solid & ~plain
    semi = semi & ~plain
    soft = np.asarray(Image.fromarray((holes * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.8))).astype(float)
    newa = np.maximum(alpha, soft)
    newa[solid] = 255
    out = a.copy()
    m = holes | (soft > 0) | semi
    out[m, :3] = rgb[m]
    out[..., 3] = newa
    Image.fromarray(out.clip(0, 255).astype('uint8'), 'RGBA').save(png, quality=88)
    return int(holes.sum() + semi.sum())


if __name__ == '__main__':
    src = sys.argv[1]
    for f in sys.argv[2:]:
        k = os.path.basename(f)
        print(k, fill(f, os.path.join(src, k)))
