"""유니티에서 구운 원작 효과 플립북(proj/fxbake/*.png,json)을 게임용으로 옮긴다.
python tools/build_fx.py            → assets/fx/<이름>.webp, js/fx_data.js, assets/fx/목록.txt, tools/lab/out/fx_contact.png
python tools/build_fx.py sheet DIR  → DIR 안의 구운 결과만 한 장에 모아 본다 (후보 시험용, tools/lab/out/fx_cand.png)
그림은 미리 곱한 색(premultiplied) + 투명도이다. 브라우저에서는 One / OneMinusSrcAlpha 로 섞는다.
"""
import glob
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
sys.path.insert(0, os.path.join(HERE, 'unity_ref'))
import setup_fx as SF  # noqa: E402

BAKE = os.path.join(SF.S.PROJ, 'fxbake')
OUT = os.path.join(ROOT, 'assets', 'fx')
LAB = os.path.join(HERE, 'lab', 'out')
QUALITY = 82


def frames(img, meta):
    w, h, cols = meta['w'], meta['h'], meta['cols']
    return [img.crop(((i % cols) * w, (i // cols) * h, (i % cols) * w + w, (i // cols) * h + h)) for i in range(meta['n'])]


def on_dark(fr, bg=(24, 26, 32)):
    """미리 곱한 색 그림을 어두운 바탕 위에 얹어 본다: 결과 = 색 + 바탕 × (1 - 투명도)."""
    a = np.asarray(fr, dtype=np.float32)
    out = a[..., :3] + np.array(bg, np.float32) * (1 - a[..., 3:4] / 255)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGB')


def contact(items, path, cell=150, per_row=2):
    """이름마다 처음·가운데·가장 밝은 장을 나란히 놓는다."""
    font = None
    for f in ['C:/Windows/Fonts/malgun.ttf', 'C:/Windows/Fonts/arial.ttf']:
        if os.path.exists(f):
            font = ImageFont.truetype(f, 13)
            break
    rows = (len(items) + per_row - 1) // per_row
    W, H = per_row * (cell * 3 + 12), rows * (cell + 34)
    sheet = Image.new('RGB', (W, H), (18, 19, 24))
    d = ImageDraw.Draw(sheet)
    for k, (name, img, meta) in enumerate(items):
        fr = frames(img, meta)
        idx = [0, len(fr) // 2, meta.get('peak', 0)]
        ox, oy = (k % per_row) * (cell * 3 + 12), (k // per_row) * (cell + 34)
        label = '%s  n%d %dx%d %.1fu' % (name, meta['n'], meta['w'], meta['h'], max(meta['worldW'], meta['worldH']))
        d.text((ox + 4, oy + 2), label, fill=(230, 230, 230), font=font)
        for j, i in enumerate(idx):
            f = on_dark(fr[i], (40, 42, 52))
            f.thumbnail((cell, cell))
            px, py = ox + j * cell + (cell - f.width) // 2, oy + 20 + (cell - f.height) // 2
            d.rectangle([ox + j * cell, oy + 20, ox + j * cell + cell - 2, oy + 20 + cell - 2], fill=(40, 42, 52))
            sheet.paste(f, (px, py))
            # 효과 원점 표시
            ax, ay = meta['ax'], meta['ay']
            if 0 <= ax <= 1 and 0 <= ay <= 1:
                cx, cy = px + ax * f.width, py + ay * f.height
                d.line([cx - 3, cy, cx + 3, cy], fill=(255, 60, 60)); d.line([cx, cy - 3, cx, cy + 3], fill=(255, 60, 60))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sheet.save(path)
    print('contact:', path, sheet.size)


def load(dirpath, names=None):
    items = []
    for js in sorted(glob.glob(os.path.join(dirpath, '*.json'))):
        name = os.path.splitext(os.path.basename(js))[0]
        if names is not None and name not in names:
            continue
        meta = json.load(open(js, encoding='utf-8'))
        items.append((name, Image.open(js[:-5] + '.png').convert('RGBA'), meta))
    if names is not None:
        items.sort(key=lambda it: list(names).index(it[0]))
    return items


def main():
    if sys.argv[1:2] == ['sheet']:
        d = sys.argv[2] if len(sys.argv) > 2 else BAKE
        items = load(d)
        for k in range(0, len(items), 24):
            contact(items[k:k + 24], os.path.join(LAB, 'fx_cand%d.png' % (k // 24)), 120, 3)
        return
    names = list(SF.FX)
    items = load(BAKE, names)
    os.makedirs(OUT, exist_ok=True)
    data, lines, total = {}, [], 0
    for name, img, meta in items:
        dst = os.path.join(OUT, name + '.webp')
        img.save(dst, 'WEBP', quality=QUALITY, method=6, exact=True)
        size = os.path.getsize(dst)
        total += size
        src = SF.FX[name][0]
        data[name] = {
            'src': 'assets/fx/%s.webp' % name, 'cols': meta['cols'], 'rows': meta['rows'], 'n': meta['n'], 'fps': meta['fps'],
            'w': meta['w'], 'h': meta['h'], 'size': [round(meta['worldW'], 3), round(meta['worldH'], 3)],
            'anchor': [round(meta['ax'], 4), round(meta['ay'], 4)], 'loop': meta['loop'], 'peak': meta['peak'],
            'from': os.path.splitext(os.path.basename(src))[0],
        }
        lines.append('%-16s %-48s %2d장 %3dx%-3d %4.1f초 %5.1f×%-5.1f단위 %4dKB' % (
            name, data[name]['from'], meta['n'], meta['w'], meta['h'], meta['n'] / meta['fps'], meta['worldW'], meta['worldH'], size // 1024))
    missing = [n for n in names if n not in data]
    with open(os.path.join(ROOT, 'js', 'fx_data.js'), 'w', encoding='utf-8') as f:
        f.write('// 원작 전투 효과 플립북 목록 (tools/build_fx.py 가 만든다, 손으로 고치지 말 것)\n')
        f.write('// size: 낱장 한 장이 덮는 원작 유니티 단위 [가로, 세로], anchor: 효과 원점의 낱장 안 위치 (왼쪽 위 0 ~ 오른쪽 아래 1)\n')
        f.write('window.FXDATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('},"', '},\n  "') + ';\n')
    with open(os.path.join(OUT, '목록.txt'), 'w', encoding='utf-8') as f:
        f.write('이름             원작 프리팹                                      장수 크기   길이  덮는 범위        용량\n')
        f.write('\n'.join(lines) + '\n합계 %dKB\n' % (total // 1024))
    print('\n'.join(lines))
    print('합계 %.2fMB' % (total / 1048576), '빠짐:', missing)
    contact(items, os.path.join(LAB, 'fx_contact.png'))


if __name__ == '__main__':
    main()
