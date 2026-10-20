"""원작 UI 아틀라스(NGUI) 조각 잘라내기: Atlas/<이름>.prefab 의 mSprites(name, x, y, width, height, border*)를 읽어
tools/ui_src/<아틀라스>/<조각>.png 로 저장하고, 늘림 경계(border)를 ui_src/<아틀라스>.json 에 적는다.

python tools/extract_ui.py DialogAtlas_v2 Common_Atlas Battle ...
"""
import json, os, re, sys
from PIL import Image

SRC = r'E:/LAO_Google_QA/Assets/AssetBundleResource/Atlas/'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ui_src')


def sprites(prefab):
    t = open(prefab, encoding='utf8', errors='ignore').read()
    i = t.index('mSprites:')
    out = []
    for m in re.finditer(r'- name: (.*)\n((?:    .*\n)+)', t[i:]):
        d = {'name': m.group(1).strip()}
        for k, v in re.findall(r'    (\w+): (-?\d+)', m.group(2)):
            d[k] = int(v)
        if 'width' in d: out.append(d)
    return out


def main():
    for arg in sys.argv[1:]:  # 아틀라스이름 또는 프리팹이름:그림이름
        name, pngname = (arg.split(':') + [arg])[:2]
        png = SRC + pngname + '.png'
        prefab = SRC + name + '.prefab'
        im = Image.open(png).convert('RGBA')
        sp = sprites(prefab)
        os.makedirs(os.path.join(OUT, name), exist_ok=True)
        meta = {}
        for s in sp:
            box = (s['x'], s['y'], s['x'] + s['width'], s['y'] + s['height'])
            im.crop(box).save(os.path.join(OUT, name, s['name'] + '.png'))
            meta[s['name']] = [s['width'], s['height'], s.get('borderLeft', 0), s.get('borderRight', 0), s.get('borderTop', 0), s.get('borderBottom', 0)]
        json.dump(meta, open(os.path.join(OUT, name + '.json'), 'w'), indent=0)
        print(name, len(sp), '조각')


if __name__ == '__main__':
    main()
