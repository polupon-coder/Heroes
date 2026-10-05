import sys, json
from PIL import Image, ImageDraw, ImageFont
import numpy as np
from scipy import ndimage as nd
S = sys.argv[1]; raza = sys.argv[2]
clases = ['guerrero', 'mago', 'ladron', 'druida', 'explorador', 'clerigo', 'barbaro']
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
except Exception: font = ImageFont.load_default()
def comps(n):
    o = np.array(Image.open(f'{S}/orig/heroes/{n}.webp').convert('RGB')).astype(float)
    c = np.array(Image.open(f'{S}/herobak/{n}.webp').convert('RGBA')).astype(int)
    bg = np.median(np.concatenate([o[:4].reshape(-1, 3), o[-4:].reshape(-1, 3), o[:, :4].reshape(-1, 3), o[:, -4:].reshape(-1, 3)]), 0)
    d = np.sqrt(((o - bg) ** 2).sum(-1))
    m = (c[..., 3] > 128) & (d < 22)
    m = nd.binary_opening(m, iterations=1)
    lab, k = nd.label(m)
    sizes = nd.sum(m, lab, range(1, k + 1))
    keep = [i + 1 for i, s in enumerate(sizes) if s >= 30]
    return c, lab, keep, bg
if __name__ == '__main__':
    tiles = []
    for cl in clases:
        n = f'{raza}-{cl}'
        c, lab, keep, bg = comps(n)
        arr = np.array(Image.fromarray(c[..., :3].astype('uint8')))
        alpha = c[..., 3] > 128
        arr[~alpha] = (40, 30, 25)
        arr = np.kron(arr, np.ones((2, 2, 1), 'uint8'))
        cols = [(255, 0, 255), (0, 200, 255), (0, 255, 0), (255, 60, 0), (255, 255, 0), (0, 90, 255), (255, 0, 120)]
        for j, L in enumerate(keep):
            mm = np.kron(lab == L, np.ones((2, 2), bool))
            arr[mm] = (arr[mm] * 0.25 + np.array(cols[j % 7]) * 0.75).astype('uint8')
        im = Image.fromarray(arr); dr = ImageDraw.Draw(im)
        for L in keep:
            ys, xs = np.where(lab == L)
            dr.text((xs.mean() * 2 - 8, ys.mean() * 2 - 10), str(L), fill=(255, 255, 255), font=font, stroke_width=3, stroke_fill=(0, 0, 0))
        dr.text((10, 10), cl, fill=(255, 255, 255), font=font, stroke_width=3, stroke_fill=(0, 0, 0))
        tiles.append(im)
    W = Image.new('RGB', (720 * 4, 960 * 2), (20, 20, 20))
    for i, t in enumerate(tiles): W.paste(t, ((i % 4) * 720, (i // 4) * 960))
    W.save(f'{S}/ov/{raza}.png')
