"""대화용 전신 일러스트 준비: 대본(tools/story_<ch>.json)에 나오는 인물·표정마다 2DModel 프리팹과 표정 그림을
유니티 참조 프로젝트로 복사하고 portrait_jobs.txt 를 쓴다.  python tools/unity_ref/setup_portrait.py ch01
그다음 Unity -executeMethod RefPortrait.Run, 결과는 proj/portrait/*.png
"""
import json, os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..'))
import setup as S  # noqa: E402  (copy_asset, PROJ)

SRC = S.SRC_ROOT
CH = sys.argv[1] if len(sys.argv) > 1 else 'ch01'


def main():
    story = json.load(open(os.path.join(HERE, '..', 'story_%s.json' % CH), encoding='utf8'))
    want = {}
    for s in story:
        for part in ('start', 'mid', 'end'):
            for n in s[part]:
                for m, e, _ in n.get('cast', {}).values():
                    want.setdefault(m, set()).add(e)
    copied, jobs = set(), []
    os.makedirs(os.path.join(S.PROJ, 'Assets', 'Editor'), exist_ok=True)
    shutil.copyfile(os.path.join(HERE, 'Portrait.cs'), os.path.join(S.PROJ, 'Assets', 'Editor', 'RefPortrait.cs'))
    for m, exprs in sorted(want.items()):
        prefab = SRC + '/AssetBundleResource/Character_2D/2DModel_%s.prefab' % m
        if not os.path.exists(prefab):
            print('전신 모델 없음:', m); continue
        rel = S.copy_asset(prefab, copied)
        face_dir = SRC + '/AssetBundleResource/Texture/face/' + m
        faces = sorted(f[:-4] for f in os.listdir(face_dir) if f.endswith('.png')) if os.path.isdir(face_dir) else []
        default = next((f for f in faces if f.lower().endswith('_idle')), None) or next((f for f in faces if 'smile' in f.lower()), faces[0] if faces else '')
        exprs = {e or default for e in exprs} | ({default} if default else set())
        for e in sorted(exprs):
            fp = ''
            if e:
                frel = S.copy_asset(face_dir + '/' + e + '.png', copied)
                fp = frel or ''
            jobs.append('%s|%s|%s' % (e or m, rel, fp))
        if not exprs:
            jobs.append('%s|%s|' % (m, rel))
    open(os.path.join(S.PROJ, 'portrait_jobs.txt'), 'w').write('\n'.join(jobs) + '\n')
    print('assets:', len(copied), 'jobs:', len(jobs))


if __name__ == '__main__':
    main()
