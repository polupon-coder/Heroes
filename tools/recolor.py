from PIL import Image
import numpy as np, sys
TARGET={'rojo':(170,40,35),'azul':(45,80,170),'verde':(50,125,55),'amarillo':(205,160,40)}
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
    t=np.array(TARGET[color])/255.0
    tl=0.3*t[0]+0.59*t[1]+0.11*t[2]
    tint=np.clip(lum[...,None]/255.0/tl*t*255*0.95,0,255)
    out=a*(1-w[...,None]*0.85)+tint*(w[...,None]*0.85)
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
