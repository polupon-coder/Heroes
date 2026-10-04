"""Siluetas limpias (tinta) de lo que piden los monstruos de formas:
public/img/formas/{forma}-tinta.webp. Figuras geométricas exactas; la espiral
se toma de la pieza dibujada y se suaviza."""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

N = 512
D = 'public/img/formas/'
INK, FILL = (58, 44, 30, 255), (112, 90, 64, 255)


def shape_mask(sh):
    im = Image.new('L', (N, N), 0)
    d = ImageDraw.Draw(im)
    m = 22
    if sh == 'circulo':
        d.ellipse([m, m, N - m, N - m], fill=255)
    elif sh == 'cuadrado':
        d.rounded_rectangle([m + 20, m + 20, N - m - 20, N - m - 20], radius=28, fill=255)
    elif sh == 'rombo':
        d.polygon([(N / 2, m), (N - m, N / 2), (N / 2, N - m), (m, N / 2)], fill=255)
    elif sh == 'triangulo':
        d.polygon([(N / 2, m + 10), (N - m, N - m - 30), (m, N - m - 30)], fill=255)
    else:
        # espiral: banda que se estrecha desde fuera hacia el centro
        import math
        c = N / 2
        turns = 2.15
        tmax = turns * 2 * math.pi
        R = N / 2 - m - 18
        steps = 2400
        for k in range(steps):
            t = tmax * k / steps
            f = 1 - t / tmax                     # 1 fuera, 0 en el centro
            r = 6 + (R - 6) * f ** 1.1
            ang = -t - 0.35
            x, y = c + r * math.cos(ang), c + r * math.sin(ang)
            w = 16 + 76 * f ** 0.9
            if k < steps * 0.06:                 # punta afilada del extremo exterior
                w *= k / (steps * 0.06)
            d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=255)
    return np.asarray(im) > 128


for sh in ['circulo', 'cuadrado', 'rombo', 'triangulo', 'espiral']:
    mk = shape_mask(sh)
    inner = ndimage.binary_erosion(mk, iterations=11 if sh == 'espiral' else 16)
    out = np.zeros((N, N, 4), 'uint8')
    out[mk] = INK
    out[inner] = FILL
    Image.fromarray(out, 'RGBA').resize((128, 128), Image.LANCZOS).save(D + f'{sh}-tinta.webp', quality=92)
print('ok')
