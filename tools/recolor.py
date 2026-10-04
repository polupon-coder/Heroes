from PIL import Image
import numpy as np, sys
# Tono (0-360) y saturación de cada color de jugador: algo apagados, como pigmentos antiguos.
TARGET={'rojo':(4,0.55),'azul':(218,0.45),'verde':(118,0.38),'amarillo':(36,0.66)}
def recolor(path,color,T=38,W=22):
    a=np.asarray(Image.open(path).convert('RGB')).astype(float)
    r,g,b=a[...,0],a[...,1],a[...,2]
    lum=(0.3*r+0.59*g+0.11*b)
    warm=r-b
    w=np.clip((T-warm)/W,0,1)              # menos cálido que pergamino/piel
    hsv=np.asarray(Image.open(path).convert('HSV')).astype(float)
    hue=hsv[...,0]*360/256; sat=hsv[...,1]/255
    olive=np.clip((hue-50)/8,0,1)*np.clip((200-hue)/10,0,1)*np.clip((sat-0.18)/0.1,0,1)
    red=np.clip((((r-g)-(g-b))-35)/20,0,1)*np.clip((sat-0.3)/0.1,0,1)
    w=np.maximum.reduce([w,olive,red])
    w*=np.clip((lum-25)/30,0,1)*np.clip((235-lum)/30,0,1)  # ni tinta ni luces
    # suavizar máscara
    m=Image.fromarray((w*255).astype('uint8')).filter(__import__('PIL.ImageFilter',fromlist=['x']).GaussianBlur(1.5))
    w=np.asarray(m)/255.0
    # Cambiar tono y saturación conservando la luminosidad original (sin mezclar colores).
    th, ts = TARGET[color]
    import colorsys
    v = np.asarray(Image.open(path).convert('HSV')).astype(float)[..., 2] / 255
    # Amarillo: algo más de luz para que no tire a verde oliva en las sombras
    if color == 'amarillo':
        v = np.clip(v * 1.3 + 0.14, 0, 1)
    h6 = (th / 60.0) % 6
    c = v * ts
    x = c * (1 - abs(h6 % 2 - 1))
    m0 = v - c
    i = int(h6)
    rgb = [(c, x, 0), (x, c, 0), (0, c, x), (0, x, c), (x, 0, c), (c, 0, x)][i]
    tint = np.stack([(rgb[k] if not np.isscalar(rgb[k]) else np.full_like(v, rgb[k])) + m0 for k in range(3)], axis=-1) * 255
    k = 1.0
    out=a*(1-w[...,None]*k)+tint*(w[...,None]*k)
    return Image.fromarray(out.clip(0,255).astype('uint8'))
if __name__=='__main__':
    fs=['humano-guerrero','elfo-mago','durgan-barbaro','silvano-druida','gnomo-clerigo','enano-ladron','faunar-explorador','humano-mago']
    cols=['rojo','azul','verde','amarillo']
    s=Image.new('RGB',(8*120,5*160))
    for i,f in enumerate(fs):
        s.paste(Image.open(f'/home/user/Heroes/public/img/heroes/{f}.webp').convert('RGB').resize((120,160)),(i*120,0))
        for j,c in enumerate(cols):
            s.paste(recolor(f'/home/user/Heroes/public/img/heroes/{f}.webp',c).resize((120,160)),(i*120,(j+1)*160))
    s.save('/tmp/claude-0/-home-user-Heroes/9a8ffaf0-e0fb-5d25-a918-42910bb83198/scratchpad/tint.png')
