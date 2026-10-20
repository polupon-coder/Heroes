"""Icono de la app (pantalla de inicio, favorito y pestaña): el pergamino lacrado sobre el claro del bosque."""
from PIL import Image, ImageDraw, ImageFilter

claro = Image.open('public/img/ui/claro.webp').convert('RGB')
import sys
sys.path.insert(0, 'tools')
sys.argv = ['x', sys.argv[1]]  # carpeta con los originales numerados
import preparar_arte as P
sello = P.cut_background(P.load(23), thr=34, feather=1.5)  # pergamino lacrado a resolución original
sello = sello.crop(sello.getchannel('A').point(lambda v: 255 if v > 30 else 0).getbbox())

S = 1024
w, h = claro.size
side = min(w, h) * 0.55  # el centro del claro (tierra clara)
bg = claro.crop((int(w / 2 - side / 2), int(h / 2 - side / 2), int(w / 2 + side / 2), int(h / 2 + side / 2))).resize((S, S), Image.LANCZOS)
# viñeta suave para que el pergamino destaque
vig = Image.new('L', (S, S), 0)
ImageDraw.Draw(vig).ellipse((-S * .15, -S * .15, S * 1.15, S * 1.15), fill=255)
vig = vig.filter(ImageFilter.GaussianBlur(S * .12))
dark = Image.new('RGB', (S, S), (24, 34, 12))
bg = Image.composite(bg, dark, vig).convert('RGBA')

# pergamino lacrado, grande y algo inclinado, con sombra
s = sello.copy()
s = s.resize((int(S * .8), int(S * .8 * s.height / s.width)), Image.LANCZOS)
s = s.rotate(28, expand=True, resample=Image.BICUBIC)
x, y = (S - s.width) // 2, (S - s.height) // 2
shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
sh = Image.new('RGBA', s.size, (20, 12, 4, 150))
sh.putalpha(s.getchannel('A').point(lambda v: v * 150 // 255))
shadow.paste(sh, (x + 10, y + 22), sh)
bg.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(18)))
bg.alpha_composite(s, (x, y))

out = bg.convert('RGB')
out.resize((512, 512), Image.LANCZOS).save('public/icon-512.png', optimize=True)
out.resize((192, 192), Image.LANCZOS).save('public/icon-192.png', optimize=True)
out.resize((180, 180), Image.LANCZOS).save('public/apple-touch-icon.png', optimize=True)
# favicon: esquinas redondeadas y transparente
fav = bg.resize((64, 64), Image.LANCZOS)
m = Image.new('L', (64, 64), 0)
ImageDraw.Draw(m).rounded_rectangle((0, 0, 63, 63), radius=14, fill=255)
fav.putalpha(m)
fav.save('public/favicon.png')
fav.resize((32, 32), Image.LANCZOS).save('public/favicon.ico', sizes=[(32, 32)])
print('listo')
