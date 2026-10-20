"""원작 3D 지역 지도 프리팹을 유니티 참조 프로젝트로 복사하고 worldmap_jobs.txt 를 쓴다.
python tools/unity_ref/setup_worldmap.py 3D_worldmap_A1_1   그다음 Unity -executeMethod RefWorldMap.Run (그래픽 켠 채로)
"""
import os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..'))
import setup as S  # noqa: E402


def main():
    names = sys.argv[1:] or ['3D_worldmap_A1_1']
    os.makedirs(os.path.join(S.PROJ, 'Assets', 'Editor'), exist_ok=True)
    shutil.copyfile(os.path.join(HERE, 'WorldMap.cs'), os.path.join(S.PROJ, 'Assets', 'Editor', 'RefWorldMap.cs'))
    copied, jobs = set(), []
    for n in names:
        rel = S.copy_asset(S.SRC_ROOT + '/AssetBundleResource/BG/World map/%s.prefab' % n, copied)
        jobs.append('%s|%s' % (n, rel))
    open(os.path.join(S.PROJ, 'worldmap_jobs.txt'), 'w').write('\n'.join(jobs) + '\n')
    print('assets:', len(copied), jobs)


if __name__ == '__main__':
    main()
