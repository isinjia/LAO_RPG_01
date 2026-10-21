"""곁가지 작전(원작 1-3B ~ 1-6B 의뢰, 1-1Ex ~ 1-4Ex 고난도) -> js/side.js
같은 장소의 본편 작전 지도·시작 칸을 쓰고, 적 편성·레벨은 원작 표(tools/story_ch01.json 의 waves)를 따른다.
의뢰를 주는 인물(giver)은 원작 의뢰 대화의 첫 화자.

python tools/build_side.py
"""
import json, os, re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
# 원작 철충 -> 이 게임의 철충 종류 (같은 계열로)
MOB = [(r'Stalker', 'stalker'), (r'BigChick', 'bigchick'), (r'NightChickM|NightChickSP', 'launcher'),
       (r'NightChickS', 'shielder'), (r'NightChick', 'chick')]
GIVER = {'콘스탄챠': 'constantia', '그리폰': 'griffon', '요안나': 'johanna', 'LRL': 'lrl', '포츈': 'fortune', '펍 헤드': 'pupphead', '폴른': 'fallen'}


def mob(key):
    for pat, k in MOB:
        if re.search(pat, key):
            return k
    return 'chick'


def main():
    S = json.load(open(os.path.join(ROOT, 'tools', 'story_ch01.json'), encoding='utf8'))
    out = []
    for s in S:
        m = re.match(r'(\d+)-(\d+)(B|Ex)$', s['idx'])
        if not m:
            continue
        base, kind = int(m.group(2)), m.group(3)
        who = next((n['who'] for n in s['start'] if n['who']), '')
        giver = next((v for k, v in GIVER.items() if k in who), 'constantia')
        waves = [[[mob(k), int(lv)] for k, lv, _ in w] for w in s['waves']]
        out.append({'idx': s['idx'], 'title': s['name'], 'desc': s['desc'], 'base': base, 'kind': kind, 'giver': giver, 'waves': waves,
                    # 의뢰(B)는 그 장소의 본편을 깬 뒤, 고난도(Ex)는 1장을 모두 마친 뒤
                    'unlock': base if kind == 'B' else 8})
        print(s['idx'], s['name'], giver, [len(w) for w in waves], 'Lv', sorted({lv for w in waves for _, lv in w}))
    with open(os.path.join(ROOT, 'js', 'side.js'), 'w', encoding='utf8') as f:
        f.write('// tools/build_side.py 로 생성: 곁가지 작전 (의뢰·고난도). 지도·시작 칸은 base 작전(1-<base>)의 것을 쓴다\nwindow.SIDE = ' + json.dumps(out, ensure_ascii=False) + ';\n')


if __name__ == '__main__':
    main()
