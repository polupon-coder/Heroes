"""Prepara las ilustraciones originales para el juego (recortes, fondos transparentes, tamaños web).

Uso: python3 tools/preparar_arte.py <carpeta con los originales numerados> [escenario|adornos|libros|simbolos|druidas|mesa|fichas|cartas]
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


def cut_background(im, thr=40, feather=2, erode=3, grow=1, extra=(), holes=0):
    """Quita el fondo liso (el color de la esquina) que toca los bordes."""
    bg = im.getpixel((3, 3))
    diff = ImageChops.difference(im, Image.new('RGB', im.size, bg)).convert('L')
    for col in extra:  # otros colores de fondo (p. ej. una franja negra)
        diff = ImageChops.darker(diff, ImageChops.difference(im, Image.new('RGB', im.size, col)).convert('L'))
    # 255 = parecido al fondo; 0 = figura
    like = diff.point(lambda v: 255 if v < thr else 0)
    w, h = im.size
    seeds = [(x, y) for x in range(0, w, 16) for y in (0, h - 1)] + [(x, y) for y in range(0, h, 16) for x in (0, w - 1)]
    for s in seeds:
        if like.getpixel(s) == 255:
            ImageDraw.floodfill(like, s, 128)
    if holes:  # huecos de fondo encerrados (entre ramas, hojas...) mayores de `holes` píxeles
        for x in range(0, w, 6):
            for y in range(0, h, 6):
                if like.getpixel((x, y)) == 255:
                    ImageDraw.floodfill(like, (x, y), 77)
                    n = like.histogram()[77]
                    ImageDraw.floodfill(like, (x, y), 128 if n > holes else 200)
    alpha = like.point(lambda v: 0 if v == 128 else 255)
    alpha = alpha.filter(ImageFilter.MinFilter(erode))
    if grow > 1:  # apertura: elimina motas y filos finos
        alpha = alpha.filter(ImageFilter.MaxFilter(grow))
    alpha = alpha.filter(ImageFilter.GaussianBlur(feather))
    out = im.convert('RGBA')
    out.putalpha(alpha)
    return out.crop(alpha.point(lambda v: 255 if v > 20 else 0).getbbox())


def fit(im, size):
    im = im.copy()
    im.thumbnail((size, size), Image.LANCZOS)
    return im


def escenario_y_fichas():
    # El Claro: círculo de piedras (sin fondo) sobre el suelo del bosque.
    save(fit(cut_background(load(7), thr=30), 1100), 'ui', 'claro-piedras')
    save(fit(load(8), 1300), 'ui', 'claro', q=80)
    save(load(8), 'ui', 'claro-fondo', q=78)  # fondo de toda la página, a la resolución original
    # Mesa de madera para el fondo de la página.
    save(load(9).resize((1920, 1080), Image.LANCZOS), 'ui', 'mesa', q=82)

    # Mascotas: hoja de 3 × 2 (gato, lechuza, zorro / cervatillo, liebre, conejo).
    sheet = load(10)
    cw, ch = sheet.width // 3, sheet.height // 2
    for (cx, cy), name in {(1, 0): 'lechuza', (2, 0): 'zorro', (0, 1): 'cervatillo', (2, 1): 'liebre'}.items():  # la liebre usa el conejo (la liebre tiene las orejas cortadas)
        # Márgenes para no arrastrar orejas o colas de los vecinos.
        cell = sheet.crop((cx * cw + 12, cy * ch + 8, (cx + 1) * cw - 12, (cy + 1) * ch - (40 if cy == 0 else 8)))
        save(fit(cut_background(cell, thr=28), 420), 'mascotas', name)

    # Ingredientes: las fichas de piedra de fichas_piedra() las sustituyen.
    return
    # (Fichas antiguas: cuatro fichas redondas (Éter, Umbra / Lumen, Raíz).)
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



# ---- Adornos de acuarela (rama, corona, marcos): el pergamino pasa a transparente.
def drop_paper(im, t0=22, t1=70):
    import numpy as np
    a = np.asarray(im.convert('RGB')).astype(float)
    h, w, _ = a.shape
    edge = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3), a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
    paper = np.median(edge, axis=0)
    d = np.sqrt(((a - paper) ** 2).sum(axis=2))
    alpha = np.clip((d - t0) / (t1 - t0), 0, 1)
    out = np.dstack([a, alpha * 255]).astype('uint8')
    return Image.fromarray(out, 'RGBA')


def trim(im, pad=6):
    l, t, r, b = im.getchannel('A').filter(ImageFilter.MinFilter(5)).point(lambda v: 255 if v > 120 else 0).getbbox()
    return im.crop((max(0, l - pad), max(0, t - pad), min(im.width, r + pad), min(im.height, b + pad)))


def adornos():
    save(fit(trim(drop_paper(load(12))), 700), 'ui', 'rama', q=86)
    save(fit(trim(drop_paper(load(13))), 520), 'ui', 'corona', q=86)
    save(fit(trim(drop_paper(load(14))), 900), 'ui', 'marco-ovalo', q=86)
    save(fit(trim(drop_paper(load(15))), 700), 'ui', 'marco-retrato', q=86)
    save(fit(trim(drop_paper(load(16))), 800), 'ui', 'marco-carta', q=86)


def libros_e_iconos():
    # Libros y pergamino: se quita solo el fondo exterior (las páginas quedan).
    save(fit(cut_background(load(18), thr=28, feather=1), 1500), 'ui', 'libro', q=84)
    save(fit(cut_background(load(19), thr=28, feather=1), 1500), 'ui', 'libro-perspectiva', q=84)
    perg = cut_background(load(20), thr=45, feather=1.5, erode=13, grow=7, extra=[(0, 0, 0)])
    # El papel es pardo y apagado: los píxeles amarillos o rojos muy saturados del borde son restos del fondo.
    hsv = perg.convert('RGB').convert('HSV')
    sat, val = hsv.getchannel('S'), hsv.getchannel('V')
    vivid = ImageChops.multiply(sat.point(lambda v: 255 if v > 175 else 0), val.point(lambda v: 255 if v > 150 else 0))
    vivid = vivid.filter(ImageFilter.MaxFilter(3))
    perg.putalpha(ImageChops.subtract(perg.getchannel('A'), vivid))
    save(fit(perg, 1100), 'ui', 'pergamino', q=84)
    # Iconos de magia: hoja de 5 × 2 en tinta sepia sobre pergamino.
    sheet = load(21)
    cw, ch = sheet.width // 5, sheet.height // 2
    nombres = [['chispa', 'burbuja', 'robo', 'cambio', 'idea'], ['lio', 'pensar', 'sueno', 'suerte', 'memoria']]
    for fy, fila in enumerate(nombres):
        for fx, name in enumerate(fila):
            cell = sheet.crop((fx * cw + 10, fy * ch + 10, (fx + 1) * cw - 10, (fy + 1) * ch - 10))
            ico = trim(drop_paper(cell, t0=28, t1=80), pad=10)
            side = max(ico.size)
            sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
            sq.alpha_composite(ico, ((side - ico.width) // 2, (side - ico.height) // 2))
            save(sq.resize((256, 256), Image.LANCZOS), 'cartas', name, q=88)


def vaciar_frasco(im):
    """Cambia el líquido violeta por cristal claro, para ver lo que haya dentro."""
    import numpy as np
    rgb = np.asarray(im.convert('RGB')).astype(float)
    a = np.asarray(im.getchannel('A'))
    hsv = np.asarray(im.convert('RGB').convert('HSV')).astype(float)
    h, sat, val = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    liquid = (h > 175) & (h < 230) & (sat > 50)
    m = np.asarray(Image.fromarray((liquid * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(1.5))).astype(float)[..., None] / 255
    glass = np.array([236, 230, 240]) * (0.75 + 0.25 * val[..., None] / 255)
    out = rgb * (1 - m) + glass * m
    res = Image.fromarray(out.clip(0, 255).astype('uint8')).convert('RGBA')
    res.putalpha(Image.fromarray(a))
    return res


def simbolos():
    # Frasco (poción) y pergamino sellado (hechizo).
    pocion = fit(cut_background(load(22), thr=30, feather=1.5), 300)
    save(pocion, 'ui', 'pocion', q=88)
    save(vaciar_frasco(pocion), 'ui', 'pocion-vacia', q=88)
    save(fit(cut_background(load(23), thr=34, feather=1.5), 300), 'ui', 'hechizo', q=88)


def retratos():
    # Caras: los cuatro cuadrantes completos de la hoja de retratos.
    sheet = load(6)
    w, h = sheet.size
    for (qx, qy), name in {(0, 0): 'mostaza', (1, 0): 'azul', (0, 1): 'verde', (1, 1): 'lila'}.items():
        save(sheet.crop((qx * w // 2, qy * h // 2, (qx + 1) * w // 2, (qy + 1) * h // 2)), 'retratos', name, q=86)


def mesa_y_papiro():
    # Mesa de trabajo girada en vertical (para que se vea entera en las columnas laterales)
    # y pergamino desplegado en horizontal (para la cara del personaje).
    mesa = Image.open(os.path.join(OUT, 'ui', 'mesa.webp')).convert('RGB')
    save(mesa.rotate(90, expand=True), 'ui', 'mesa-vertical', q=82)
    perg = Image.open(os.path.join(OUT, 'ui', 'pergamino.webp'))
    save(perg.rotate(90, expand=True), 'ui', 'papiro', q=86)


def fichas_piedra():
    # Fichas de ingredientes de piedra (hoja 2 × 2: Éter, Umbra / Lumen, Raíz).
    tokens = load(24)
    bg = tokens.getpixel((3, 3))
    ink = ImageChops.difference(tokens, Image.new('RGB', tokens.size, bg)).convert('L').point(lambda v: 255 if v > 80 else 0)
    mx, my = tokens.width // 2, tokens.height // 2
    for (qx, qy), name in {(0, 0): 'eter', (1, 0): 'umbra', (0, 1): 'lumen', (1, 1): 'raiz'}.items():
        box = (qx * mx, qy * my, (qx + 1) * mx, (qy + 1) * my)
        l, t, r, b = ink.crop(box).getbbox()
        l, t, r, b = l + box[0], t + box[1], r + box[0], b + box[1]
        # La sombra cae hacia abajo: el ancho da el diámetro y el disco empieza arriba.
        side = r - l
        x0, y0 = l, t
        piece = tokens.crop((x0, y0, x0 + side, y0 + side)).convert('RGBA')
        big = Image.new('L', (side * 4, side * 4), 0)
        m = side * 4 * 0.035
        ImageDraw.Draw(big).ellipse((m, m, side * 4 - m, side * 4 - m), fill=255)
        piece.putalpha(big.resize((side, side), Image.LANCZOS))
        save(piece.resize((256, 256), Image.LANCZOS), 'ingredientes', name, q=88)


def cartas_ilustradas():
    # Conocimientos ilustrados: pergaminos (arriba) y frascos (abajo). Las piezas no caen en una
    # cuadrícula exacta, así que cada una se localiza por los huecos de papel que la rodean.
    import numpy as np
    sheet = load(25)
    a = np.asarray(sheet).astype(int)
    bg = np.asarray(sheet.getpixel((3, 3)))
    ink = np.abs(a - bg).sum(axis=2) > 60
    h = sheet.height
    filas = [['chispa', 'burbuja', 'robo', 'cambio', 'idea'], ['lio', 'pensar', 'sueno', 'suerte', 'memoria']]
    for fy, fila in enumerate(filas):
        y0, y1 = (0, h // 2) if fy == 0 else (h // 2, h)
        cols = ink[y0:y1].sum(axis=0) > 3
        runs, start = [], None
        for x, v in enumerate(list(cols) + [False]):
            if v and start is None:
                start = x
            elif not v and start is not None:
                if x - start > 40:
                    runs.append((start, x))
                start = None
        assert len(runs) == len(fila), runs
        for (x0, x1), name in zip(runs, fila):
            rows = np.nonzero(ink[y0:y1, x0:x1].sum(axis=1) > 2)[0]
            t, b = y0 + rows.min(), y0 + rows.max() + 1
            cell = sheet.crop((max(0, x0 - 6), max(0, t - 6), x1 + 6, b + 6))
            save(fit(cut_background(cell, thr=22, feather=1.2), 360), 'cartas-ilustradas', name, q=88)


def druidas_recortados():
    # Cuerpo entero sin el fondo de papel, para la mesa del druida.
    for n, name in [(2, 'mostaza'), (3, 'azul'), (4, 'verde'), (5, 'lila')]:
        im = cut_background(load(n), thr=26, feather=1.2, erode=3)
        save(fit(im, 1000), 'druidas-recorte', name, q=86)


if __name__ == '__main__':
    que = sys.argv[2:] or ['escenario', 'adornos', 'libros', 'simbolos', 'druidas', 'mesa', 'fichas', 'cartas']
    if 'escenario' in que:
        escenario_y_fichas()
    if 'adornos' in que:
        adornos()
    if 'libros' in que:
        libros_e_iconos()
    if 'simbolos' in que:
        simbolos()
    if 'druidas' in que:
        druidas_recortados()
        retratos()
    if 'mesa' in que:
        mesa_y_papiro()
    if 'fichas' in que:
        fichas_piedra()
    if 'cartas' in que:
        cartas_ilustradas()
    print('listo')
