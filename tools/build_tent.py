# 3장 천막 (원작에 천막 그림이 없어 직접 그린다). 쓰는 법: python tools/build_tent.py assets/town/t3_tent.webp [cmd]
# cmd: 지휘소 천막 (모래빛 천, 무전 안테나와 깃발, 지도판)
import numpy as np, sys
CMD = len(sys.argv) > 2 and sys.argv[2] == 'cmd'
from PIL import Image, ImageDraw, ImageFilter
W,H=840,600
TOP=40
rng=np.random.default_rng(3)
def poly_mask(pts):
    m=Image.new('L',(W,H),0); ImageDraw.Draw(m).polygon(pts,fill=255); return np.asarray(m)/255.0
def noise(scale,amp):
    n=rng.random((H//scale+2,W//scale+2)); im=Image.fromarray((n*255).astype(np.uint8)).resize((W,H),Image.BICUBIC); return (np.asarray(im)/255.0-0.5)*amp
out=np.zeros((H,W,4))
def paint(mask,col,shade=None,tex=0.08):
    c=np.array(col,float)/255
    s=np.ones((H,W)) if shade is None else shade
    st=Image.fromarray(((rng.random((H,W))*255)).astype(np.uint8)).filter(ImageFilter.BoxBlur(1)).resize((W//3,H//3)).resize((W,H),Image.BICUBIC).filter(ImageFilter.GaussianBlur(1))
    st=np.asarray(st.rotate(-28,resample=Image.BICUBIC).filter(ImageFilter.BoxBlur(4)))/255.0-0.5  # 붓결
    t=1+noise(6,tex)+noise(40,tex*1.8)+st*0.35
    rgb=c[None,None,:]*(s*t)[:,:,None]
    a=mask[:,:,None]
    out[:,:,:3]=out[:,:,:3]*(1-a)+rgb*a; out[:,:,3]=np.maximum(out[:,:,3],mask)
yy,xx=np.mgrid[0:H,0:W]
# 그림자
sh=Image.new('L',(W,H),0); ImageDraw.Draw(sh).polygon([(60,445),(570,428),(810,335),(830,360),(600,470),(40,470)],fill=170); sh=np.asarray(sh.filter(ImageFilter.GaussianBlur(14)))/255
out[:,:,3]=sh*0.55
# 지붕 오른쪽 면 (뒤로 뻗은 경사)
ridgeF=(300,110); ridgeB=(600,70)
roofR=[ridgeF,ridgeB,(790,330),(560,420)]
paint(poly_mask(roofR),(132,118,82) if CMD else (104,112,66),shade=0.72+0.25*(1-(yy-70)/360).clip(0,1))
# 지붕 왼쪽 면 (보이는 앞 경사)
# 앞 삼각 면
front=[ridgeF,(560,420),(80,440)]
paint(poly_mask(front),(150,136,96) if CMD else (118,124,72),shade=0.85+0.25*((yy-110)/330).clip(0,1)*(1-((xx-300)/300).clip(0,1)*0.3))
# 지붕 솔기·주름
img=Image.fromarray((out*255).clip(0,255).astype(np.uint8),'RGBA'); d=ImageDraw.Draw(img)
for i in range(1,6):
    t=i/6; a=(ridgeF[0]+(ridgeB[0]-ridgeF[0])*t, ridgeF[1]+(ridgeB[1]-ridgeF[1])*t); b=(560+(790-560)*t,420+(330-420)*t)
    d.line([a,b],fill=(70,76,44,170),width=3)
d.line([ridgeF,ridgeB],fill=(60,64,38,255),width=6)
# 문 (열린 앞 자락)
door=[(300,190),(390,430),(215,433)]
d.polygon(door,fill=(34,32,24,255))
d.polygon([(300,190),(215,433),(170,433),(262,250)],fill=(150,154,96,255))  # 젖힌 자락
d.line([(300,190),(170,433)],fill=(80,84,50,255),width=3)
# 가장자리 선
for a,b in [(ridgeF,(80,440)),(ridgeF,(560,420)),((80,440),(560,420)),(ridgeB,(790,330)),((560,420),(790,330))]:
    d.line([a,b],fill=(52,56,32,255),width=4)
# 기둥과 끈
d.line([(300,110),(300,60)],fill=(70,52,30,255),width=7); d.line([(600,70),(600,30)],fill=(70,52,30,255),width=6)
for a,b in [((300,62),(40,300)),((600,32),(830,200)),((300,62),(560,40))]:
    d.line([a,b],fill=(205,190,150,200),width=2)
for p in [(40,300),(830,200)]:
    d.rectangle((p[0]-4,p[1]-2,p[0]+4,p[1]+14),fill=(80,60,36,255))
if CMD:  # 무전 안테나, 깃발, 지도판
    d.line([(600,30),(600,-0)],fill=(60,60,60,255),width=4); d.line([(640,70),(640,0)],fill=(50,50,50,255),width=3)
    d.polygon([(300,62),(300,10),(370,22),(300,38)],fill=(170,40,40,255)); d.line([(300,110),(300,6)],fill=(70,52,30,255),width=6)
    d.rectangle((420,290,520,360),fill=(214,206,170,255),outline=(70,60,40,255),width=3)
    for i in range(4): d.line([(430,302+i*14),(510,302+i*14+(i%2)*4)],fill=(120,96,60,255),width=2)
    d.ellipse((470,315,486,331),outline=(170,40,40,255),width=3)
else:
  # 앞에 붙인 표지 (적십자 대신 숟가락·포크 표시 없이 단순한 흰 판)
  d.rectangle((420,300,500,350),fill=(222,214,186,255),outline=(70,60,40,255),width=3)
  d.line([(445,312),(445,338)],fill=(90,70,40,255),width=4); d.line([(475,312),(475,338)],fill=(90,70,40,255),width=4); d.ellipse((439,306,451,320),outline=(90,70,40,255),width=3)
img=img.filter(ImageFilter.SMOOTH)
bb=img.getbbox(); img=img.crop(bb)
img.save(sys.argv[1],quality=90,method=6); print(img.size)
