"""원작 피해 숫자 글꼴(BMFont: E:/LAO_Google_QA/Assets/font/DamageFont) -> assets/ui/dmg_<종류>.png + js/dmgfont.js
python tools/build_dmgfont.py

글자 0~9를 같은 폭 칸에 나란히 다시 깔고(칸 안 위치는 원작 xoffset·yoffset 그대로), 글자마다 나아가는 폭(xadvance)을 적는다.
게임에서는 숫자 한 자리마다 칸 하나를 배경 그림으로 보여 준다.
"""
import json, os, re
from PIL import Image

SRC = 'E:/LAO_Google_QA/Assets/font/DamageFont/'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = {  # 종류: (글자표, 그림)
    'base': ('DamageFont_Base.txt', 'DamageFont_Base.png'),   # 적에게 준 피해 (노랑)
    'cri': ('DamageFont_Cri.txt', 'DamageFont_Cri.png'),      # 강한 일격 (빨강)
    'me': ('DamageFont_Me.fnt', 'DamageFont_Me_0.png'),       # 아군이 받은 피해 (주황)
    'enemy': ('DamageFont_Enemy.fnt', 'DamageFont_Enemy_0.png'),  # (파랑)
    'heal': ('HP_recovery.txt', 'HP_recovery.png'),           # 회복 (초록)
}


def main():
    out = {}
    for k, (fnt, png) in FONTS.items():
        t = open(SRC + fnt, encoding='utf8').read()
        lh = int(re.search(r'lineHeight=(\d+)', t).group(1))
        ch = {}
        for m in re.finditer(r'char id=(\d+)\s+x=(-?\d+)\s+y=(-?\d+)\s+width=(\d+)\s+height=(\d+)\s+xoffset=(-?\d+)\s+yoffset=(-?\d+)\s+xadvance=(\d+)', t):
            c = chr(int(m.group(1)))
            ch[c] = [int(v) for v in m.groups()[1:]]
        im = Image.open(SRC + png).convert('RGBA')
        minx = min(v[4] for v in ch.values())
        cw = max(v[2] + v[4] - minx for v in ch.values())
        hh = max(lh, max(v[3] + v[5] for v in ch.values()))
        strip = Image.new('RGBA', (cw * 10, hh), (0, 0, 0, 0))
        adv = []
        for i in range(10):
            x, y, w, h, xo, yo, xa = ch[str(i)]
            strip.alpha_composite(im.crop((x, y, x + w, y + h)), (i * cw + xo - minx, max(0, yo)))
            adv.append(xa)
        strip.save(os.path.join(ROOT, 'assets', 'ui', 'dmg_%s.png' % k))
        out[k] = {'src': 'assets/ui/dmg_%s.png' % k, 'cw': cw, 'h': hh, 'ox': -minx, 'adv': adv}
        print(k, strip.size)
    with open(os.path.join(ROOT, 'js', 'dmgfont.js'), 'w', encoding='utf8') as f:
        f.write('// tools/build_dmgfont.py 로 생성: 원작 피해 숫자 글꼴 (숫자 칸 폭 cw, 높이 h, 칸 안 왼쪽 여백 ox, 글자마다 나아가는 폭 adv)\n')
        f.write('window.DMGFONT = ' + json.dumps(out) + ';\n')


if __name__ == '__main__':
    main()
