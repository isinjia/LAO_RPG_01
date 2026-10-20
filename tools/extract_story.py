"""본작 메인 스토리 추출: 1_Onestre_QA의 암호화된 대사 파일 + 마스터 표(LoJson)에서
지정한 지역의 스테이지 목록, 전투 전·중간·후 대사(화자·표정·문장), 적 편성을 뽑는다.

python tools/extract_story.py            -> tools/story_cache.json (중간 자료) + tools/story_ch01.txt (읽기용)
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nrbf

SRC = r'E:/LAO/1_Onestre_QA/Assets'
DG = SRC + '/AssetBundleResource/Table/Table_DialogScript/'
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
CACHE = os.path.join(ROOT, 'tools', 'story_cache.json')
CHAPTER = sys.argv[1] if len(sys.argv) > 1 else 'Ch01'
POS = ['L', 'R', 'C', 'LC', 'RC']


def load_master():
    """필요한 표만 골라 작은 캐시로 (157MB를 매번 읽지 않게)."""
    if os.path.exists(CACHE):
        return json.load(open(CACHE, encoding='utf8'))
    print('마스터 표 읽는 중 (1회)…')
    big = json.load(open(SRC + '/LastOneTable/LoJson.js.bytes', encoding='utf-8-sig'))
    keep = {}
    for t in ['Table_MapChapter', 'Table_MapStage', 'Table_CutScene', 'Table_MobGroup', 'Table_Monster', 'Table_MonsterAbility']:
        keep[t] = big.get(t, [])
    keep['loc'] = {r['Key']: r.get('Korea', '') for r in big['Table_Localization']}
    json.dump(keep, open(CACHE, 'w', encoding='utf8'), ensure_ascii=False)
    return keep


def clean(s):
    s = s or ''
    s = s.replace('&n', '\n')
    s = re.sub(r'\[c\]\[[0-9a-fA-F]{6}\]|\[-\]\[/c\]|\[/?[a-z]\]', '', s)
    return s.replace('{0}', '사령관')


def dialog(group, loc):
    """대사 그룹 -> 노드 목록 (분기 유지). 노드: id, who, model, expr, text, bg, cg, next, choices[[문장, 다음 id]]"""
    path = DG + group + '.bin.bytes'
    if not os.path.exists(path):
        return []
    rows = {r['Key']: r for r in nrbf.load_table(path)}
    num = lambda k: int(k.rsplit('_', 1)[1]) if k and k.rsplit('_', 1)[1].isdigit() else None
    order = sorted(rows, key=lambda k: num(k) or 0)
    # 처음 노드에서 닿는 것만 (선택지 갈래 포함)
    reach, stack = [], [order[0]]
    seen = set()
    while stack:
        k = stack.pop()
        if k in seen or k not in rows: continue
        seen.add(k); reach.append(k)
        r = rows[k]
        nxt = [r.get('NextDialogScript')] + list(r.get('SelectionIndex_Next') or [])
        stack.extend(x for x in reversed(nxt) if x)
    out = []
    for k in sorted(reach, key=lambda k: num(k) or 0):
        r = rows[k]
        sp = r.get('Dialog_Speaker', 5)
        who = expr = model = ''
        if isinstance(sp, int) and sp < 5:
            p = POS[sp]
            who = clean(loc.get(str(r.get('Char_Name_' + p) or ''), ''))
            model = (r.get('Char_ImageName_' + p) or '').replace('2DModel_', '')
            expr = r.get('Char_ImageVarName_' + p) or ''
        cg = r.get('Add_ImageName') or ''  # 도입부 컷 그림(2DModel_*_Dialog010101)은 인물 자리에 서므로 cast 로
        if 'Dialog0' in model: model = model.replace('_Dialog010101', '_N')
        ch = [[clean(loc.get(str(s), '')), num(n)] for s, n in zip(r.get('SelectionIndex') or [], (r.get('SelectionIndex_Next') or []) + [r.get('NextDialogScript')] * 9)]
        # 화면에 선 인물: 위치별 [모델, 표정, 밝기(0 보통 / 1 어둡게 / 2 회상)]
        cast = {}
        for p in POS:
            m = (r.get('Char_ImageName_' + p) or '').replace('2DModel_', '')
            if not m: continue
            cast[p] = [m, r.get('Char_ImageVarName_' + p) or '', r.get('Char_SCGActivation_' + p) or 0]
        out.append({'id': num(k), 'who': who, 'model': model, 'expr': expr, 'text': clean(loc.get(str(r.get('Script')), '')),
                    'bg': r.get('BG_ImageName') or '', 'cg': cg, 'next': num(r.get('NextDialogScript')), 'choices': ch,
                    'cast': cast, 'spk': POS[sp] if isinstance(sp, int) and sp < 5 else '',
                    # 연출: 장소 자막, 덧붙임 효과(소리·흔들림 등), 화면 효과, 중간 배경음, 등장·퇴장 효과
                    'place': [clean(loc.get(str(r.get('BG_Name') or ''), '')), clean(loc.get(str(r.get('BG_Description') or ''), ''))] if r.get('BG_Name') else [],
                    'fx': r.get('Add_Effect') or '', 'scr': r.get('Screen_Effect') or 6, 'bgm': r.get('Bgm_Sound') or '',
                    'app': {p: r.get('Char_AppearEffect_' + p) for p in POS if r.get('Char_AppearEffect_' + p) not in (None, 6, 7)},
                    'off': {p: r.get('Char_OffEffect_' + p) for p in POS if r.get('Char_OffEffect_' + p) not in (None, 6, 7)},
                    'fade': {p: 1 for p in POS if r.get('Char_AppearEffect_' + p) == 6}})
    return out


def main():
    M = load_master()
    loc = M['loc']
    cut = {c['Key']: c for c in M['Table_CutScene']}
    mob = {m['Key']: m for m in M['Table_MobGroup']}
    mon = {m['Key']: m for m in M['Table_Monster']}
    stages = [s for s in M['Table_MapStage'] if re.match(r'^%sStage\d+$' % CHAPTER, str(s.get('Key', '')).replace('_', ''))
              or re.match(r'^%sStage\d\d$' % CHAPTER, str(s.get('Key', '')))]
    if not stages:  # 키 형식이 다르면 StageIdxString으로
        n = int(CHAPTER[2:])
        stages = [s for s in M['Table_MapStage'] if re.match(r'^%d-\d+$' % n, str(s.get('StageIdxString', ''))) and str(s.get('StageSubType', '0')) in ('0', '')]
    stages.sort(key=lambda s: int(str(s['StageIdxString']).split('-')[1]))
    res = []
    for s in stages:
        def cs(field):
            c = cut.get(str(s.get(field) or ''))
            return dialog(c['FileName'], loc) if c else []
        waves = []
        for i in range(1, 10):
            g = s.get('WaveMobGroup%d' % i)
            for gk in (g if isinstance(g, list) else [g] if g else []):
                m = mob.get(gk)
                if not m: continue
                waves.append([[m.get('mobIndexString%d' % j), m.get('mobLevel%d' % j), clean(loc.get(str((mon.get(m.get('mobIndexString%d' % j)) or {}).get('Name')), ''))]
                              for j in range(1, 10) if m.get('mobIndexString%d' % j)])
                break
        bg = s.get('BossMobGroup') or ''
        boss = mob.get(bg[0] if isinstance(bg, list) and bg else bg if isinstance(bg, str) else '')
        if boss:
            waves.append([[boss.get('mobIndexString%d' % j), boss.get('mobLevel%d' % j), clean(loc.get(str((mon.get(boss.get('mobIndexString%d' % j)) or {}).get('Name')), ''))]
                          for j in range(1, 10) if boss.get('mobIndexString%d' % j)])
        bgm = lambda f: (cut.get(str(s.get(f) or '')) or {}).get('BGMFileName') or ''
        res.append({'bgm_start': bgm('StartCutsceneIndex'), 'bgm_end': bgm('EndCutsceneIndex'),
                    'key': s['Key'], 'idx': s['StageIdxString'], 'name': clean(loc.get(str(s.get('StageName')), '')),
                    'desc': clean(loc.get(str(s.get('StageDesc')), '')), 'start': cs('StartCutsceneIndex'),
                    'mid': cs('MidCutsceneIndex'), 'end': cs('EndCutsceneIndex'), 'waves': waves})
    json.dump(res, open(os.path.join(ROOT, 'tools', 'story_%s.json' % CHAPTER.lower()), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    with open(os.path.join(ROOT, 'tools', 'story_%s.txt' % CHAPTER.lower()), 'w', encoding='utf8') as f:
        for s in res:
            f.write('\n==== %s %s ====\n%s\n' % (s['idx'], s['name'], s['desc']))
            f.write('적: %s\n' % ' | '.join(', '.join('%s Lv%s' % (n or k, lv) for k, lv, n in w) for w in s['waves']))
            for part in ('start', 'mid', 'end'):
                if not s[part]: continue
                f.write('-- %s --\n' % {'start': '전투 전', 'mid': '중간', 'end': '전투 후'}[part])
                for d in s[part]:
                    f.write('[%s|%s] %s\n' % (d['who'] or '해설', d['expr'], d['text'].replace('\n', ' ')))
    print('스테이지', len(res), [(s['idx'], s['name'], len(s['start']), len(s['mid']), len(s['end'])) for s in res])


if __name__ == '__main__':
    main()
