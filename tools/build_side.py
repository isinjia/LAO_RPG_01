"""곁가지 작전(원작 <장>-<n>B 의뢰, <장>-<n>Ex 고난도) -> js/side.js
같은 장소의 본편 작전 지도·시작 칸을 쓰고, 적 편성·레벨은 원작 표(tools/story_<장>.json 의 waves)를 따른다.
의뢰를 주는 인물(giver)은 원작 의뢰 대화의 첫 화자.

python tools/build_side.py ch01 ch02 ...
"""
import json, os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
CHS = sys.argv[1:] or ['ch01']
# 원작 철충 -> 이 게임의 철충 종류. 원작 표의 모델 이름(MonsterModelID)으로 같은 계열을 고른다 (위에서부터 먼저 맞는 것)
MOB = [(r'Stalker', 'stalker'), (r'Predator', 'predator'), (r'Kidnapper', 'trickster'), (r'Centurion', 'centurion'),
       (r'FABigChick|Juggernaut|Mammoth', 'fabigchick'), (r'BigChick', 'bigchick'), (r'Legion', 'legion'), (r'Zapper', 'zapper'),
       (r'Phalangites', 'phalanx'), (r'HeavyScout|Scout_V2', 'heavyscout'), (r'Raider', 'raider'), (r'Wasp', 'wasp'), (r'Scarab', 'scarab'),
       (r'NightChickSP', 'sniper'), (r'NightChickDE', 'detector'), (r'NightChickCM', 'chemical'),
       (r'UnderWatcherArm', 'uw_arm'), (r'UnderWatcherGenerator', 'uw_gen'), (r'UnderWatcherSensor', 'uw_sensor'), (r'UnderWatcher', 'underwatcher'),
       (r'Model_MP_Fallen', 'g_fallen'), (r'Model_MP_Rampart', 'g_rampart'), (r'Model_MP_Drone', 'g_drone'), (r'AMG11', 'g_amg'),
       (r'Model_MP_PuppHead', 'g_pupphead'), (r'Stinger', 'g_stinger'), (r'Gigantes', 'g_gigantes'), (r'Seljuq', 'g_seljuq'),
       (r'Scout', 'scout'), (r'Harvester', 'harvester'), (r'NightChickC_|NightChickCEX', 'cannon'), (r'NightChickSI', 'shielderx'),
       (r'NightChickM|NightChickSP', 'launcher'), (r'NightChickS', 'shielder'), (r'NightChick', 'chick')]
GIVER = {'콘스탄챠': 'constantia', '그리폰': 'griffon', '요안나': 'johanna', 'LRL': 'lrl', '포츈': 'fortune', '펍 헤드': 'pupphead', '폴른': 'fallen',
         '에이미': 'amy', '코코': 'coco', '마리': 'marie', '에이다': 'constantia', '스카디': 'scathy'}
MODEL = {m['Key']: m['MonsterModelID'] for m in json.load(open(os.path.join(ROOT, 'tools', 'story_cache.json'), encoding='utf8'))['Table_Monster']}


def mob(key):
    # 키 이름에 계열이 드러나면 그대로 (1장은 예전 결과와 같게), 아니면 모델 이름으로
    for name in (key, MODEL.get(key, key)):
        for pat, k in MOB:
            if re.search(pat, name):
                return k
    return 'chick'


def main():
    out = []
    for ch in CHS:
        c = int(ch[2:])
        S = json.load(open(os.path.join(ROOT, 'tools', 'story_%s.json' % ch), encoding='utf8'))
        for s in S:
            m = re.match(r'(\d+)-(\d+)(B|Ex)$', s['idx'])
            if not m:
                continue
            base, kind = (c - 1) * 8 + int(m.group(2)), m.group(3)  # base: 전체 본편 작전 번호(1부터)
            who = next((n['who'] for n in s['start'] if n['who']), '')
            giver = next((v for k, v in GIVER.items() if k in who), 'constantia')
            waves = [[[mob(k), int(lv)] for k, lv, _ in w] for w in s['waves']]
            out.append({'idx': s['idx'], 'title': s['name'], 'desc': s['desc'], 'base': base, 'kind': kind, 'giver': giver, 'waves': waves,
                        # 의뢰(B)는 그 장소의 본편을 깬 뒤, 고난도(Ex)는 그 지역을 모두 마친 뒤
                        'unlock': base if kind == 'B' else c * 8})
            print(s['idx'], s['name'], giver, [len(w) for w in waves], 'Lv', sorted({lv for w in waves for _, lv in w}))
    with open(os.path.join(ROOT, 'js', 'side.js'), 'w', encoding='utf8') as f:
        f.write('// tools/build_side.py 로 생성: 곁가지 작전 (의뢰·고난도). 지도·시작 칸은 base 작전(전체 본편 번호)의 것을 쓴다\nwindow.SIDE = ' + json.dumps(out, ensure_ascii=False) + ';\n')


if __name__ == '__main__':
    main()
