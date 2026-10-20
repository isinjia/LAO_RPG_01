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
                nodes.append({'id': n['id'], 'who': n['who'], 'face': face_for(n['model'], n['expr']) if n['who'] else '',
                              't': n['text'], 'bg': bg, 'cg': cg, 'next': n['next'], 'ch': n['choices']})
            parts[part] = nodes
        story[s['idx']] = {'name': s['name'], 'desc': s['desc'], **parts}
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
