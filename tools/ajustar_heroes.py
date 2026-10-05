# Ajuste de los retratos: quita el papel que quedaba entre piernas, brazos y armas,
# corrige el tono amarillento y iguala el tamaño visible (pies sobre la misma línea).
# Uso: python3 tools/ajustar_heroes.py <carpeta_trabajo> x  (necesita orig/heroes y herobak)
import sys
sys.path.insert(0, __import__('os').path.dirname(__file__))
from ov_papel import comps
from PIL import Image
import numpy as np
from scipy import ndimage as nd
S = sys.argv[1]
razas = ['humano', 'elfo', 'enano', 'gnomo', 'silvano', 'durgan', 'faunar']
clases = ['guerrero', 'mago', 'ladron', 'druida', 'explorador', 'clerigo', 'barbaro']
# Huecos con papel (entre piernas, brazos y armas), revisados uno a uno.
PAPEL = {
 'durgan': {'guerrero': [19, 25], 'ladron': [3, 10, 11, 12, 15, 16], 'druida': [4, 6, 12], 'explorador': [3, 4], 'clerigo': [2], 'barbaro': [6, 7, 21, 23, 25]},
 'elfo': {'guerrero': [44, 50, 54, 59, 61], 'ladron': [5, 7, 8], 'druida': [11, 38, 40, 42, 43, 44], 'barbaro': [12, 13, 15, 17]},
 'enano': {'guerrero': [7], 'ladron': [10, 11, 12, 15], 'druida': [11, 13, 15], 'explorador': [1, 2], 'barbaro': [10, 19, 21]},
 'gnomo': {'guerrero': [46, 47, 48, 49], 'ladron': [16, 17], 'druida': [3, 15, 16, 50], 'explorador': [12], 'clerigo': [3, 4], 'barbaro': [13, 14]},
 'silvano': {'guerrero': [22, 23, 24, 26], 'mago': [3], 'ladron': [5, 6, 8, 11, 14], 'druida': [8], 'explorador': [5, 11], 'clerigo': [5, 7, 9], 'barbaro': [30, 31, 32, 33, 34, 36, 42]},
 'faunar': {'guerrero': [7, 10, 11, 12, 14], 'mago': [1, 3], 'druida': [1, 4, 18, 23, 25, 27, 39, 40, 43], 'explorador': [1, 2, 8, 9, 10, 11, 13], 'clerigo': [3, 10, 50, 52], 'barbaro': [1, 8, 15, 19, 21, 23, 25]},
}
TARGET = 265  # "masa" visible común (raíz del área opaca)
for r in razas:
    for cl in clases:
        n = f'{r}-{cl}'
        c = np.array(Image.open(f'{S}/herobak/{n}.webp').convert('RGBA')).astype(float)
        if r != 'humano':
            ids = PAPEL.get(r, {}).get(cl, [])
            if ids:
                _, lab, _, bg = comps(n)
                o = np.array(Image.open(f'{S}/orig/heroes/{n}.webp').convert('RGB')).astype(float)
                d = np.sqrt(((o - bg) ** 2).sum(-1))
                kill = np.isin(lab, ids)
                kill |= nd.binary_dilation(kill, iterations=3) & (d < 45)
                a = c[..., 3]
                a[kill] = 0
                edge = nd.binary_dilation(kill, iterations=1) & ~kill
                a[edge] = np.minimum(a[edge], 140)
            # Menos amarillo, algo más de luz y negros con cuerpo (como los humanos).
            rgb = c[..., :3] / 255
            rgb = rgb ** 0.82 * 1.04
            g = rgb.mean(-1, keepdims=True)
            rgb = g + (rgb - g) * 0.78
            rgb[..., 2] += 0.025; rgb[..., 0] -= 0.01
            rgb = np.clip(rgb, 0, 1)
            rgb = np.clip((rgb - 0.10) / 0.92, 0, 1) ** 1.12
            c[..., :3] = rgb * 255
        # Tamaño: misma "masa" visible y los pies sobre la misma línea.
        a = c[..., 3]
        ys, xs = np.where(a > 40)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        m = np.sqrt((a > 128).sum())
        fit = min(352 / (x1 - x0), 462 / (y1 - y0))
        s = min(fit, TARGET / m)
        im = Image.fromarray(c.astype('uint8')).crop((x0, y0, x1, y1))
        w, h = max(1, round((x1 - x0) * s)), max(1, round((y1 - y0) * s))
        im = im.resize((w, h), Image.LANCZOS)
        out = Image.new('RGBA', (360, 480), (0, 0, 0, 0))
        out.alpha_composite(im, ((360 - w) // 2, 480 - 10 - h))
        out.save(f'public/img/heroes/{n}.webp', quality=92)
        print(n, f'escala {s:.2f} alto {h}')
