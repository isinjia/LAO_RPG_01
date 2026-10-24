"""유니티에서 뽑은 원작 3D 지역 지도(tools/unity_ref/proj/worldmap3d, RefWorldMap3D.Run) -> assets/world/<장>/scene.json + scene.bin + 그림
python tools/build_world3d.py [ch02 ch03 ...] [유니티 참조 프로젝트 경로]   (기본: 모든 장, tools/unity_ref/proj)

scene.json: 물체(모델·그림 조각), 재질 값, 작전 지점 8곳과 마을의 3D 위치, 작전별 카메라 클립(bin 안의 위치)
scene.bin : Float32 꼭짓점·uv, Uint16 삼각형, Float32 카메라 표본(초당 15번: 위치 3 + 회전 4)
"""
import json, os, re, shutil, struct, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHS = [a for a in sys.argv[1:] if a.startswith('ch')]
_rest = [a for a in sys.argv[1:] if not a.startswith('ch')]
PROJ = _rest[0] if _rest else os.path.join(ROOT, 'tools', 'unity_ref', 'proj')
SRC = os.path.join(PROJ, 'worldmap3d')
MATDIR = os.path.join(PROJ, 'Assets', 'Ref', 'AssetBundleResourceSub', 'BG', 'World map', 'Materials')
ANIMDIR = os.path.join(PROJ, 'Assets', 'Ref', 'AssetBundleResourceSub', 'BG', 'World map', 'animation')
MAPS = {'ch%02d' % n: '3D_worldmap_A%d_1' % n for n in range(1, 8)}
# 작전 n(0부터) -> 애니메이터 상태 이름, 마을·처음 화면은 전체 둘러보기
STAGE_STATE = ['S_%02d' % (8 + i) for i in range(8)]
OVERVIEW = 'S_Default'
FPS = 15


class Bin:
    def __init__(self):
        self.b = bytearray()

    def put(self, fmt, vals):
        while len(self.b) % 4:
            self.b.append(0)
        off = len(self.b)
        self.b += struct.pack('<%d%s' % (len(vals), fmt), *vals)
        return [off, len(vals)]


def r4(v):
    return [round(x, 4) for x in v]


def build(ch, name):
    d = json.load(open(os.path.join(SRC, name + '.json'), encoding='utf8'))
    out_dir = os.path.join(ROOT, 'assets', 'world', ch)
    os.makedirs(out_dir, exist_ok=True)
    B = Bin()
    texs = set()

    def mat(m):
        p = {}
        for k, v in (m or {}).get('p', {}).items():
            if isinstance(v, dict):
                if v.get('tex'):
                    texs.add(v['tex'])
                p[k] = {'tex': v.get('tex'), 'st': v['st']}
            else:
                p[k] = v
        return {'shader': m['shader'], 'queue': m['queue'], 'p': p}

    cam = next(o for o in d['objs'] if o['path'] == d['camPath'])['cam']
    objs, points = [], {}
    for o in d['objs']:
        base = {'path': o['path'], 'pos': r4(o['pos']), 'rot': r4(o['rot']), 'scl': r4(o['scl'])}
        if o['path'].split('/')[-1].startswith('point_'):
            points[int(o['path'].split('_')[-1])] = r4(o['pos'])
            continue
        if not o['active'] or not (cam['mask'] >> o['layer']) & 1:  # 지도 카메라가 안 그리는 층(UI 층의 뒤 빛 등)은 뺀다
            continue
        if 'mesh' in o:
            m = o['mesh']
            # 모든 재질이 그림자 없는 빛 효과라 법선은 버린다
            base['mesh'] = {'v': B.put('f', m['v']), 'uv': B.put('f', m['uv']) if 'uv' in m else None,
                            'sub': [B.put('H', s) for s in m['sub']]}
            base['mats'] = [mat(x) for x in o['mats']]
        elif 'sprite' in o:
            s = o['sprite']
            texs.add(s['tex'])
            base['sprite'] = {'tex': s['tex'], 'w': s['tw'] / s['ppu'], 'h': s['th'] / s['ppu'],
                              'pivot': [s['pivot'][0] / s['tw'], s['pivot'][1] / s['th']], 'color': s['color']}
            if s['draw'] == 2:  # 바둑판 반복(Tiled): 이 크기만큼 그림을 되풀이해 깐다
                base['sprite']['tiled'] = s['size']
        else:
            continue
        objs.append(base)

    clips = {}
    for a in d['anims']:
        for s in a['states']:
            if s['name'] in STAGE_STATE + [OVERVIEW] and s.get('cam'):
                clips[s['name']] = {'len': s['len'], 'cam': B.put('f', s['cam'])}
    stages = [{'pos': points[i + 1], 'clip': STAGE_STATE[i]} for i in range(len(STAGE_STATE))]
    # 작전을 고를 때 원작 클립이 끄는 물체(2장 6~8: 바닥판을 꺼 그 아래 지하 제철소가 보이게)
    paths = {o['path'] for o in objs}
    clip_of = {s['name']: s.get('clip') for a in d['anims'] for s in a['states']}
    for st in stages:
        hide, show = stage_toggles(ch, clip_of.get(st['clip']))
        missing = [p for p in show if p not in paths]
        if missing:  # 원작이 켜 주는 물체를 아직 뽑지 않은 장(3장 지하 연구소 등)은 끄지도 않는다
            print(ch, st['clip'], 'skip toggles, not exported:', missing)
        elif hide & paths:
            st['hide'] = sorted(hide & paths)

    # 마을(등대 아래 비밀기지)은 1장에만: 옛 지도 사진 위 자리를 작전 지점들로 맞춘 평면 변환으로 3D에 옮긴다
    town = town_pos(points) if ch == 'ch01' else None

    scene = {'objs': objs, 'cam': {'fov': cam['fov'], 'near': cam['near'], 'far': cam['far'], 'bg': cam['bg']},
             'fps': FPS, 'clips': clips, 'overview': OVERVIEW, 'stages': stages, 'town': town, 'marker': 'map_point',
             'texInfo': d.get('texInfo', {})}  # 그림별 원작 설정: 감싸기(0 반복, 1 가장자리 늘이기)·밉맵
    texs.add('map_point')
    for t in texs:
        src = os.path.join(SRC, 'tex', t + '.png')
        if not os.path.exists(src):
            src = os.path.join(MATDIR, t + '.png')
        shutil.copyfile(src, os.path.join(out_dir, t + '.png'))
    open(os.path.join(out_dir, 'scene.bin'), 'wb').write(bytes(B.b))
    with open(os.path.join(out_dir, 'scene.json'), 'w', encoding='utf8') as f:
        json.dump(scene, f, ensure_ascii=False, separators=(',', ':'))
    print(ch, 'objs', len(objs), 'clips', sorted(clips), 'bin', len(B.b), 'tex', sorted(texs), 'town', town)


def stage_toggles(ch, clip):
    """원작 작전 클립(.anim)에서 처음(0초)에 끄고 켜는 물체 경로. 작전 지점·이동선은 빼고"""
    hide, show = set(), set()
    f = os.path.join(ANIMDIR, ch, (clip or '') + '.anim')
    if not clip or not os.path.exists(f):
        return hide, show
    t = open(f, encoding='utf8', errors='ignore').read()
    for m in re.finditer(r'- curve:\s*\n\s*serializedVersion: \d+\s*\n\s*m_Curve:\s*\n\s*- serializedVersion: \d+\s*\n\s*time: 0\s*\n\s*value: ([-\d.]+)(?:(?!- curve:).)*?attribute: m_IsActive\s*\n\s*path: ([^\n]+)', t, re.S):
        p = m.group(2).strip()
        if p.split('/')[-1].startswith('point_') or p.endswith('move_line'):
            continue
        (show if float(m.group(1)) else hide).add(p)
    return hide, show


def town_pos(points):
    old = json.load(open(os.path.join(ROOT, 'tools', 'world_old_ch01.json'), encoding='utf8'))
    town2d = old['town']
    pts2d = old['points']
    import numpy as np
    A = np.array([[x, y, 1] for x, y in pts2d])
    X = np.array([points[i + 1][0] for i in range(8)]); Z = np.array([points[i + 1][2] for i in range(8)])
    cx = np.linalg.lstsq(A, X, rcond=None)[0]; cz = np.linalg.lstsq(A, Z, rcond=None)[0]
    tv = np.array([town2d[0], town2d[1], 1])
    near = points[3]
    return [round(float(tv @ cx), 4), near[1], round(float(tv @ cz), 4)]


if __name__ == '__main__':
    for ch, name in MAPS.items():
        if not CHS or ch in CHS:
            build(ch, name)
