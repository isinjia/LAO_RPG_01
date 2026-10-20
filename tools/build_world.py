"""유니티로 찍은 원작 3D 지역 지도(tools/unity_ref/proj/worldmap, RefWorldMap.Run) -> assets/world/<장>.webp + js/world.js (작전 지점 화면 위치)
python tools/build_world.py
"""
import json, os
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'tools', 'unity_ref', 'proj', 'worldmap')
MAPS = {'ch01': '3D_worldmap_A1_1'}


def main():
    os.makedirs(os.path.join(ROOT, 'assets', 'world'), exist_ok=True)
    out = {}
    for ch, name in MAPS.items():
        Image.open(os.path.join(SRC, name + '.png')).convert('RGB').resize((1920, 1080), Image.LANCZOS).save(os.path.join(ROOT, 'assets', 'world', ch + '.webp'), quality=84)
        pts = json.load(open(os.path.join(SRC, name + '.json')))
        out[ch] = [pts[k] for k in sorted(pts, key=int)]
    with open(os.path.join(ROOT, 'js', 'world.js'), 'w', encoding='utf8') as f:
        f.write('// tools/build_world.py 로 생성: 원작 지역 지도 위 작전 지점 (그림 기준 0~1 비율)\nwindow.WORLD = ' + json.dumps(out) + ';\n')
    print(out)


if __name__ == '__main__':
    main()
