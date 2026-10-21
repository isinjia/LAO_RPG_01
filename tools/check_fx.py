"""원작 전투 효과 재생 검사: 브라우저(js/fx.js)가 그린 낱장을 유니티가 구운 원본 낱장(tools/unity_ref/proj/fxbake/<이름>.png)과 견준다.
python tools/check_fx.py [유니티 참조 프로젝트 경로]

먼저 브라우저(게임을 띄운 창)의 개발자 콘솔에서 아래를 돌려 tools/lab/out/fxcmp_<이름>.json 을 만든다 (serve.py 가 받아 저장):
  for (const name of FXLIB.names()) { const d = FXDATA[name], W = d.w, H = d.h, cv = document.createElement('canvas');
    const r = new THREE.WebGLRenderer({ canvas: cv, preserveDrawingBuffer: true }); r.setPixelRatio(1); r.setSize(W, H, false); r.setClearColor(0, 1);
    const sc = new THREE.Scene(), ww = W / H, cam = new THREE.OrthographicCamera(-ww / 2, ww / 2, .5, -.5, -10, 10);
    await FXLIB.load(name); const h = FXLIB.spawn(sc, name, { x: (d.anchor[0] - .5) * ww, y: (.5 - d.anchor[1]), height: 1 });
    await new Promise((s) => setTimeout(s, 30)); const k = Math.floor(d.n * .4); FXLIB.update((k + .5) / d.fps); h.speed = 0; r.render(sc, cam);
    await fetch('/tools/lab/out/fxcmp_' + name + '.json', { method: 'PUT', body: JSON.stringify({ d: cv.toDataURL('image/png'), k }) }); h.stop(); r.dispose(); }
결과: 효과마다 PSNR·SSIM, tools/lab/out/fx_side_by_side.png (왼쪽 유니티 원본, 오른쪽 브라우저)
"""
import json, base64, io, os, sys
import numpy as np
from PIL import Image
sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
U = os.path.join(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'tools', 'unity_ref', 'proj'), 'fxbake') + '/'
os.chdir(ROOT)
fd=open('js/fx_data.js',encoding='utf8').read()
D=json.loads(fd[fd.index('window.FXDATA = ')+16:].rstrip().rstrip(';'))
def ssim(a,b):
    a=a.mean(2); b=b.mean(2); C1=(0.01*255)**2; C2=(0.03*255)**2
    ma,mb=a.mean(),b.mean(); va,vb=a.var(),b.var(); cov=((a-ma)*(b-mb)).mean()
    return ((2*ma*mb+C1)*(2*cov+C2))/((ma*ma+mb*mb+C1)*(va+vb+C2))
rows=[]; sheet=[]
for f in sorted(os.listdir('tools/lab/out')):
    if not f.startswith('fxcmp_'): continue
    name=f[6:-5]; j=json.load(open('tools/lab/out/'+f)); k=j['k']; d=D[name]
    bimg=Image.open(io.BytesIO(base64.b64decode(j['d'].split(',')[1]))).convert('RGB'); b=np.asarray(bimg).astype(float)
    atl=Image.open(U+name+'.png').convert('RGBA'); W,H=d['w'],d['h']
    uw,uh=atl.size[0]//d['cols'], atl.size[1]//d['rows']
    c,r=k%d['cols'],k//d['cols']
    refimg=atl.crop((c*uw,r*uh,c*uw+uw,r*uh+uh)).resize((W,H),Image.LANCZOS).convert('RGB')
    ref=np.asarray(refimg).astype(float)
    mse=((ref-b)**2).mean(); psnr=99 if mse==0 else 10*np.log10(255*255/mse)
    rows.append((name,k,round(psnr,1),round(ssim(ref,b),3),round(ref.mean(),1),round(b.mean(),1)))
    pair=Image.new('RGB',(W*2+4,H),(255,255,255)); pair.paste(refimg,(0,0)); pair.paste(bimg,(W+4,0)); sheet.append(pair)
print('효과 낱장 PSNR SSIM 원본밝기 브라우저밝기')
for r in rows: print(*r)
# 나란히 모음
cw=max(p.size[0] for p in sheet); ch=sum(p.size[1]+4 for p in sheet)
S=Image.new('RGB',(cw,ch),(255,255,255)); y=0
for p in sheet: S.paste(p,(0,y)); y+=p.size[1]+4
S.save('tools/lab/out/fx_side_by_side.png')
