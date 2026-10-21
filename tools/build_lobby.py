"""원작 로비 대사(Table_LobbyScript): 동료와 대화할 때 쓰는 글·표정·음성 -> js/lobby.js + assets/voice/<음성 이름>.mp3

python tools/build_lobby.py
"""
import json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_media import to_mp3  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
LOJSON = r'E:/LAO/1_Onestre_QA/Assets/LastOneTable/LoJson.js.bytes'
VOICE = r'E:/LAO_Google_QA/Assets/AssetBundleResource/Sounds/Voice/'
# 게임 인물 -> 원작 로비 대사 키, 음성 폴더
HEROES = {'constantia': ('LobbyScript_3P_ConstantiaS2', 'ConstantiaS2'), 'griffon': ('LobbyScript_BR_PA00EL', 'PA00EL'),
          'johanna': ('LobbyScript_DS_Johanna', 'Johanna'), 'lrl': ('LobbyScript_PECS_LRL', 'LRL'),
          'pupphead': ('LobbyScript_PECS_PuppHead', 'PuppHead'), 'fallen': ('LobbyScript_AGS_Fallen', 'Fallen'),
          'fortune': ('LobbyScript_PECS_Fortune', 'Fortune')}


def clean(s):
    s = (s or '').replace('&n', '\n')
    s = re.sub(r'\[c\]\[[0-9a-fA-F]{6}\]|\[-\]\[/c\]|\[/?[a-z]\]', '', s)
    return s.replace('{0}', '사령관')


def main():
    big = json.load(open(LOJSON, encoding='utf-8-sig'))
    loc = {r['Key']: r.get('Korea', '') for r in big['Table_Localization']}
    rows = {r['Key']: r for r in big['Table_LobbyScript']}
    out = {}
    for hero, (key, folder) in HEROES.items():
        r = rows.get(key)
        if not r:
            print('없음', key); continue
        lines, seen = [], set()
        for grp in ('LobbyScript1', 'LobbyScript2', 'LobbyScript3', 'LobbyScript4', 'LobbyScriptSp1', 'LobbyScriptSp2'):
            texts, faces, voices = r.get(grp) or [], r.get(grp + 'FaceName') or [], r.get(grp + 'VoiceName') or []
            for i, k in enumerate(texts):
                t = clean(loc.get(str(k), ''))
                if not t or t in seen:
                    continue
                seen.add(t)
                v = voices[i] if i < len(voices) else ''
                src = next((VOICE + folder + '/' + v + ext for ext in ('.mp3', '.wav') if v and os.path.exists(VOICE + folder + '/' + v + ext)), None)
                if src:
                    to_mp3(src, os.path.join(ROOT, 'assets', 'voice', v + '.mp3'), 96)
                lines.append({'t': t, 'f': faces[i] if i < len(faces) else '', 'v': v if src else ''})
        out[hero] = lines
        print(hero, len(lines), '줄')
    with open(os.path.join(ROOT, 'js', 'lobby.js'), 'w', encoding='utf8') as f:
        f.write('// tools/build_lobby.py 로 생성: 원작 로비 대사 (동료와 대화)\nwindow.LOBBY = ' + json.dumps(out, ensure_ascii=False) + ';\n')


if __name__ == '__main__':
    main()
