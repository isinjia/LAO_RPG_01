"""전직 스킨 아이콘: 원작 FormationIcon_<모델>_<스킨>.png -> js/assets.js 의 IMG.c_<모델>_<스킨> (128px webp)
js/classes.js 의 전직 나무에 나오는 스킨만. 이미 있는 키는 그대로 둔다.  python tools/add_skin_icons.py"""
import base64, io, json, os, re
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = r'E:/LAO_Google_QA/Assets/AssetBundleResource/Texture/FormationIcon'
A = os.path.join(ROOT, 'js', 'assets.js')
cls = open(os.path.join(ROOT, 'js', 'classes.js'), encoding='utf8').read()
data = open(os.path.join(ROOT, 'js', 'data.js'), encoding='utf8').read()
icons = dict(re.findall(r"^\s{4}(\w+): \{\n\s+name: .*?icon: 'c_(\w+)_N'", data, re.M | re.S))
want = set()
for hid, body in re.findall(r"^\s{4}(\w+): \{ A: (.*?)\] \]", cls, re.M | re.S):
    pass
for hid in icons:
    m = re.search(r"\b%s: \{ A: \[(.*?)\]\],\s*B: \[(.*?)\]\] \}" % hid, cls, re.S)
    if not m: continue
    for skin in re.findall(r"'[^']*', '(\w+)', '", m.group(1) + m.group(2)):
        if skin != 'N': want.add(icons[hid] + '_' + skin)
text = open(A, encoding='utf8').read()
i = text.index('{', text.index('window.IMG'))
img, end = json.JSONDecoder().raw_decode(text[i:])
n = 0
for m in sorted(want):
    k = 'c_' + m
    if k in img: continue
    p = os.path.join(SRC, 'FormationIcon_%s.png' % m)
    if not os.path.exists(p): print('아이콘 없음', m); continue
    im = Image.open(p).convert('RGBA').resize((128, 128), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, 'WEBP', quality=85, method=6)
    img[k] = 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode(); n += 1
open(A, 'w', encoding='utf8').write(text[:i] + json.dumps(img) + text[i + end:])
print('새 아이콘', n, sorted(want))
