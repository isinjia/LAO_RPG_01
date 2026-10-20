"""tools/story_<ch>.json(extract_story.py) -> js/story.js + 장면 그림(assets/story/...) + 초상화(js/assets.js 에 합침)

python tools/build_story.py ch01
"""
import base64, glob, io, json, os, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
TEX = r'E:/LAO_Google_QA/Assets/AssetBundleResource/Texture/'
OUT = os.path.join(ROOT, 'assets', 'story')
CH = sys.argv[1] if len(sys.argv) > 1 else 'ch01'

# 게임 초상화 (IMG 키 -> 원본 그림)
ICONS = {
    'c_3P_ConstantiaS2_N': 'FormationIcon/FormationIcon_3P_ConstantiaS2_N.png',
    'c_BR_PA00EL_N': 'FormationIcon/FormationIcon_BR_PA00EL_N.png',
    'c_DS_Johanna_N': 'FormationIcon/FormationIcon_DS_Johanna_N.png',
    'c_PECS_LRL_N': 'FormationIcon/FormationIcon_PECS_LRL_N.png',
    'c_PECS_PuppHead_N': 'FormationIcon/FormationIcon_PECS_PuppHead_N.png',
    'c_AGS_Fallen_N': 'FormationIcon/FormationIcon_AGS_Fallen_N.png',
    'e_NightChickM_N': 'PassivePanelIcon/PanelIcon_MP_NightChickM_N.png',
    'e_NightChickS_N': 'PassivePanelIcon/PanelIcon_MP_NightChickS_N.png',
    'e_Stalker_B0108': 'ChallengeBossTx/Challenge_PanelIcon_MP_Stalker_B0108.png',
}
# 얼굴 그림이 없는 화자 -> 초상화
NO_FACE = {'PECS_PuppHead_N': 'c_PECS_PuppHead_N', 'AGS_Fallen_N': 'c_AGS_Fallen_N'}


def webp(src, dst, size=None, q=82):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.exists(dst):
        return
    im = Image.open(src).convert('RGBA')
    if size == 'bg':
        im = im.convert('RGB')
        im = im.resize((1600, 900), Image.LANCZOS) if im.size[0] == im.size[1] else im.resize((1920, round(im.size[1] * 1920 / im.size[0])), Image.LANCZOS) if im.size[0] > 1920 else im
    elif size:
        im.thumbnail((size, size), Image.LANCZOS)
    im.save(dst, quality=q)


def data_url(path, size=128):
    im = Image.open(path).convert('RGBA')
    im.thumbnail((size, size), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'WEBP', quality=88)
    return 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()


def face_for(model, expr):
    if model in NO_FACE:
        return 'icon:' + NO_FACE[model]
    folder = TEX + 'face/' + model
    if not model or not os.path.isdir(folder):
        return ''
    files = sorted(os.path.basename(f)[:-4] for f in glob.glob(folder + '/*.png'))
    if not files:
        return ''
    name = expr if expr in files else next((f for f in files if f.lower().endswith('_idle')), None) or next((f for f in files if 'smile' in f.lower()), files[0])
    webp(folder + '/' + name + '.png', os.path.join(OUT, 'face', name + '.webp'), 256, 88)
    return name


STAND = os.path.join(ROOT, 'assets', 'story', 'stand')


def stand_for(model, expr):
    """전신 일러스트 파일 이름 (tools/unity_ref/setup_portrait.py 와 같은 기본 표정 규칙)"""
    if expr and os.path.exists(os.path.join(STAND, expr + '.webp')):
        return expr
    folder = TEX + 'face/' + model
    faces = sorted(os.path.basename(f)[:-4] for f in glob.glob(folder + '/*.png')) if os.path.isdir(folder) else []
    d = next((f for f in faces if f.lower().endswith('_idle')), None) or next((f for f in faces if 'smile' in f.lower()), faces[0] if faces else model)
    return d if os.path.exists(os.path.join(STAND, d + '.webp')) else ''


def bgm(n):
    """원작 배경음 파일 이름 -> 게임 이름 (assets/bgm/<이름>.mp3, tools/build_media.py 가 옮긴다)"""
    return {'07 BGM_Talk_01': 'lo_talk1', '08 BGM_Talk_02': 'lo_talk2', '09 BGM_Talk_03': 'lo_talk3'}.get(n) or ('lo_' + n.split(' ', 1)[-1].replace('BGM_', '').lower() if n else 'lo_talk1')


def main():
    S = json.load(open(os.path.join(ROOT, 'tools', 'story_%s.json' % CH), encoding='utf8'))
    story = {}
    for s in S:
        parts = {}
        for part in ('start', 'mid', 'end'):
            nodes = []
            for n in s[part]:
                bg = n['bg'] if n['bg'] and os.path.exists(TEX + 'BGImg/' + n['bg'] + '.png') else ''
                if bg: webp(TEX + 'BGImg/' + bg + '.png', os.path.join(OUT, 'bg', bg + '.webp'), 'bg', 80)
                cg = n['cg'] if n['cg'] and os.path.exists(TEX + 'CutImg/' + n['cg'] + '.png') else ''
                if cg: webp(TEX + 'CutImg/' + cg + '.png', os.path.join(OUT, 'cg', cg + '.webp'), 1400, 82)
                cast = [[p, stand_for(m, e), d] for p, (m, e, d) in n.get('cast', {}).items()]
                nodes.append({'id': n['id'], 'who': n['who'], 'face': face_for(n['model'], n['expr']) if n['who'] else '',
                              't': n['text'], 'bg': bg, 'cg': cg, 'next': n['next'], 'ch': n['choices'],
                              'cast': [c for c in cast if c[1]], 'spk': n.get('spk', '')})
                # 연출 (있을 때만): 장소 자막, 덧붙임 효과, 화면 효과, 중간 배경음, 등장·퇴장 효과
                o = nodes[-1]
                if n.get('place'): o['place'] = n['place']
                if n.get('fx'): o['fx'] = n['fx']
                if n.get('scr', 6) != 6: o['scr'] = n['scr']
                if n.get('bgm'): o['bgm'] = bgm(n['bgm'])
                if n.get('app'): o['app'] = n['app']
                if n.get('off'): o['off'] = n['off']
                if n.get('fade'): o['fade'] = n['fade']
            parts[part] = nodes
        story[s['idx']] = {'name': s['name'], 'desc': s['desc'], 'bgmStart': bgm(s.get('bgm_start')), 'bgmEnd': bgm(s.get('bgm_end')), **parts}
    with open(os.path.join(ROOT, 'js', 'story.js'), 'w', encoding='utf8') as f:
        f.write('// tools/build_story.py 로 생성: 본작 메인 스토리 대본 (선택지 갈래 포함)\nwindow.STORY = Object.assign(window.STORY || {}, ' + json.dumps(story, ensure_ascii=False) + ');\n')
    # 초상화를 js/assets.js 에 합친다
    p = os.path.join(ROOT, 'js', 'assets.js')
    t = open(p, encoding='utf8').read()
    i = t.index('{', t.index('window.IMG'))
    img, _ = json.JSONDecoder().raw_decode(t[i:])
    for k, src in ICONS.items():
        img[k] = data_url(TEX + src)
    with open(p, 'w', encoding='utf8') as f:
        f.write(t[:i] + json.dumps(img) + ';\n')
    print('장면', len(story), '대사', sum(len(v['start']) + len(v['mid']) + len(v['end']) for v in story.values()))


if __name__ == '__main__':
    main()
