"""원작 전투 효과 프리팹을 유니티 참조 프로젝트로 복사하고 fx_jobs.txt 를 쓴다.
python tools/unity_ref/setup_fx.py            고른 효과 (FX 표)
python tools/unity_ref/setup_fx.py cand       후보를 작게 시험 굽기 (CAND 표)
python tools/unity_ref/setup_fx.py 이름 ...    FX 표 가운데 몇 개만
그다음 Unity -batchmode -executeMethod RefFxBake.Run (그래픽 켠 채로, -nographics 금지) → proj/fxbake/*.png,json
그다음 python tools/build_fx.py
"""
import json
import re
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..'))
import setup as S  # noqa: E402
import build_sd as B  # noqa: E402


def main_checkout_tools():
    """작업 갈래(worktree)에서 돌려도 본 저장소의 tools 를 찾는다 (참조 프로젝트·GUID 색인이 거기 있다)."""
    p = os.path.abspath(os.path.join(HERE, '..'))
    norm = p.replace('\\', '/')
    if '/.claude/worktrees/' in norm:
        return os.path.join(norm.split('/.claude/worktrees/')[0], 'tools')
    return p


MAIN_TOOLS = main_checkout_tools()
S.PROJ = os.path.join(MAIN_TOOLS, 'unity_ref', 'proj')
if B._guid_index is None and not os.path.exists(os.path.join(HERE, '..', 'lab', 'guid_index.json')):
    cache = os.path.join(MAIN_TOOLS, 'lab', 'guid_index.json')
    if os.path.exists(cache):
        B._guid_index = json.load(open(cache, encoding='utf-8'))


def extra_index():
    """효과 재질 일부는 AssetBundleResource 밖(GraphicResources 등)에 있다. 나머지 Assets 전체의 GUID 도 더한다."""
    gi = B.guid_index()
    cache = os.path.join(HERE, '..', 'lab', 'out', 'guid_index_extra.json')
    if os.path.exists(cache):
        extra = json.load(open(cache, encoding='utf-8'))
    else:
        extra = {}
        skip = {'AssetBundleResource', 'AssetBundleResourceSub'}
        for top in os.listdir(S.SRC_ROOT):
            base = os.path.join(S.SRC_ROOT, top)
            if top in skip or not os.path.isdir(base):
                continue
            for dp, _, fn in os.walk(base):
                for f in fn:
                    if f.endswith('.meta'):
                        with open(os.path.join(dp, f), encoding='utf-8', errors='ignore') as h:
                            h.readline()
                            m = re.search(r'guid: ([0-9a-f]+)', h.readline())
                            if m:
                                extra[m.group(1)] = os.path.join(dp, f[:-5]).replace('\\', '/')
        os.makedirs(os.path.dirname(cache), exist_ok=True)
        json.dump(extra, open(cache, 'w', encoding='utf-8'))
    for k, v in extra.items():
        gi.setdefault(k, v)


extra_index()
A = S.SRC_ROOT + '/AssetBundleResource/'
C = 'FX/character_prefab/'

# 이름: (프리팹, 긴 변 픽셀, 초당 장수, 최대 초, 옵션)  옵션 loop=시작초 / box=반폭 / fit=0
FX = {
    # 맞음
    'hit_bullet':      (C + 'Alvis_skill/skill1/Smg_Simple_Hit.prefab', 224, 24, 1.0, ''),       # 작은 총탄 불꽃 + 연기
    'hit_crit':        ('FX/Hit_bass.prefab', 256, 24, 1.0, ''),                                  # 사방으로 튀는 불꽃 (치명타)
    'hit_heavy':       (C + 'bloodypanther_skill/skill_2/cannon_hit.prefab', 256, 24, 1.2, ''),   # 포탄 맞음 (노란 빛 + 연기)
    'hit_slash':       (C + 'Labiata_skill/NS1_skill/skill1/Labiata_NS1_skill1_blade_Hit.prefab', 256, 24, 1.0, ''),  # 칼날 맞음
    'slash_line':      (C + 'Boryeon_skill/skill1/Boryeon_skill1_Blade_Hit.prefab', 256, 24, 0.6, ''),  # 비스듬한 베기 선
    'hit_energy':      (C + 'Alice_skill/Alice_NS2/skill1/Alice_NS2_Sword_Hit_Prefab_F.prefab', 256, 24, 1.0, ''),  # 푸른 에너지 맞음
    # 폭발
    'explosion_small': ('FX/hit_prefab/simple_explosion.prefab', 256, 24, 1.2, ''),
    'explosion_big':   ('FX/FX_hit_EXPLOSION 1.prefab', 256, 20, 2.0, ''),                      # 큰 철충 쓰러짐
    # 총구
    'muzzle_small':    ('FX/FX_shot_flash.prefab', 128, 30, 0.3, ''),                             # 짧은 총구 번쩍임 (연사용)
    'muzzle_rifle':    (C + 'brownie_skill/brownie_shoot.prefab', 224, 24, 1.0, ''),              # 소총 불꽃 + 연기
    'muzzle_heavy':    (C + 'Leprechaun_skill/leprechaun_fire.prefab', 256, 24, 1.0, ''),         # 큰 총 불꽃
    # 날아가는 탄
    'bullet':          ('Bullet_Effect/Brownie_bullet.prefab', 128, 20, 0.5, 'loop=0.5'),        # 주황 예광탄 (계속 재생)
    'bullet_bug':      ('Bullet_Effect/FX_bullet_bug.prefab', 128, 20, 1.0, 'loop=1'),          # 철충 녹색 탄 (계속 재생)
    'missile':         ('Bullet_Effect/FX_bullet_hand_Missile.prefab', 160, 20, 1.0, 'loop=1'),  # 그리폰(PA00EL) 손 미사일 (계속 재생, 날아가는 탄)
    # 보조
    'heal':            (C + 'daphne_skill/skill_1/daphne_hit.prefab', 256, 20, 2.0, ''),          # 나노봇 회복
    'buff':            (C + 'Azazel_skill/skill2/Azazel_skill2_buff_FX.prefab', 256, 20, 2.0, ''),  # 황금빛 강화
    'debuff':          (C + 'Faucre_skill/skill2/Faucre_skill2_Debuff_prefab.prefab', 256, 20, 2.0, ''),  # 보랏빛 약화
    'shield':          (C + 'VFX_Public_Buff/VFX_Shield/VFX_Public_Buff_shield.prefab', 256, 20, 2.0, ''),  # 보호막 방울
    'charge':          ('FX/enemy_prefab/Delta_skill/delta_skill2_charge.prefab', 256, 20, 2.0, ''),  # 기 모으기 (빛 모임)
    'cast':            (C + 'Andvari_skill/Andvari_skill2_buff_fx.prefab', 256, 20, 1.5, ''),     # 스킬 시전 고리
    # 먼지
    'dust_fall':       ('FX/FX_falldown_dust_F.prefab', 256, 20, 1.5, ''),                        # 쓰러질 때 먼지
    'dust_step':       ('FX/vfx_Frontstep_Dust.prefab', 224, 20, 1.2, ''),                       # 발걸음·앞으로 내딛는 흙먼지
    'land_crack':      ('FX/FX_jump_hitground.prefab', 256, 20, 2.0, ''),                         # 내려찍기 땅 갈라짐
    # 화면 번쩍임
    'big_flash':       ('FX/FX_big_glow_flash.prefab', 256, 20, 4.0, ''),                         # 스킬용 큰 빛 번쩍임
}

# 시험용 후보 (작게 굽고 한 장에 모아 본다)
CAND = [
    'FX/FX_gun_hit_spark', 'FX/Hit', 'FX/Hit_x2', 'FX/Hit_bass', 'FX/FX_hit_robot', 'FX/FX_hit_skin_robot',
    C + 'Alvis_skill/skill1/Smg_Simple_Hit', C + 'AS12TurtleDragon_skill/skill2/real_simple_hit', C + 'AS12TurtleDragon_skill/skill1/shotgun_hit',
    C + 'Bheur_skill/skill1/Sniper_Simple_Hit', C + 'Amy_skill/skill1/hnadgun_hit',
    'FX/FX_Hit_RailGun', C + 'bloodypanther_skill/skill_2/cannon_hit', 'FX/FX_hit_EXPLOSION 1', 'FX/FX_hit_bori', 'FX/FX_hit_fire',
    C + 'Alice_skill/Alice_NS2/skill1/Alice_NS2_Sword_Hit_Prefab_F', C + 'Boryeon_skill/skill1/Boryeon_skill1_Blade_Hit',
    C + 'KunoichiZero_skill/skill1/Kunoichi_skill1_Swordhit', C + 'ScissorsLise_skill/2blade_hit', C + 'Labiata_skill/NS1_skill/skill1/Labiata_NS1_skill1_blade_Hit',
    C + 'Carolina_skill/skill1/Carolina_simple_glow_hit', C + 'BS_skill/skill1/BS_skill1_lighting_hit', 'FX/FX_HIT_Labiata_skill_2',
    'FX/hit_prefab/simple_explosion', 'FX/hit_prefab/grende_explosion', 'FX/hit_prefab/explosion_hit',
    'FX/FX_explosion', 'FX/FX_explosion_x2', 'FX/FX_explosion_re', 'FX/hit_prefab/New_basic_explosion', 'FX/hit_prefab/Vfx_die_explosion', 'FX/hit_prefab/basic_explosion2',
    'FX/FX_shot_flash', 'FX/FX_shot_shotgun_flash', 'FX/FX_shot_Canon_flash', 'FX/FX_gun_shot_fog', C + 'brownie_skill/brownie_shoot', C + 'Leprechaun_skill/leprechaun_fire',
    C + 'Bheur_skill/skill1/Sniper_Shot_common',
    'Bullet_Effect/Brownie_bullet', 'Bullet_Effect/Centurion_bullet', 'Bullet_Effect/FX_bullet_bug', 'Bullet_Effect/FX_bullet_sniper', 'FX/FX_snipertrail',
    C + 'daphne_skill/skill_1/daphne_hit', C + 'Yimir_skill/Yimir_N_Skill/skill2/vfx_Yimir_n_skill2_repair', C + 'Machina_skill/skill2/Machina_skill2_Teambuff',
    'FX/vfx_ch_buff', C + 'Andvari_skill/Andvari_skill2_buff_fx', C + 'Azazel_skill/skill2/Azazel_skill2_buff_FX', C + 'Bheur_skill/skill2/Bheur_skill2_Team_buff_FX',
    C + 'Faucre_skill/skill2/Faucre_skill2_Debuff_prefab', 'FX/enemy_prefab/IronPrince_skill/skill1/IronPrince_skill1_debuff', 'FX/enemy_prefab/MP_Speaker_skill/skill2/MP_Speaker_skill2_Debuff_prefab',
    C + 'VFX_Public_Buff/VFX_Shield/VFX_Public_Buff_shield', 'FX/FX_MP_shild_FX', C + 'AS12TurtleDragon_skill/skill2/dragon_shield_skill2',
    C + 'Sadius_skill/skill1/Sadius_skill1_Charge_elec', C + 'fafnir_skill/fafnir_skill1_charge', 'FX/enemy_prefab/Delta_skill/delta_skill2_charge', C + 'Atalanta_skill/skill2/ATL_Shield_Charge',
    'FX/FX_falldown_dust_F', 'FX/vfx_Dust', C + 'Leprechaun_skill/Leprechaun_die_smoke', 'FX/FX_footstep_dust_F', 'FX/vfx_Frontstep_Dust', 'FX/FX_jump_hitground',
    'FX/FX_big_glow_flash',
]


def main():
    args = sys.argv[1:]
    os.makedirs(os.path.join(S.PROJ, 'Assets', 'Editor'), exist_ok=True)
    shutil.copyfile(os.path.join(HERE, 'FxBake.cs'), os.path.join(S.PROJ, 'Assets', 'Editor', 'RefFxBake.cs'))
    shader_dst = os.path.join(S.PROJ, 'Assets', 'Ref', 'AssetBundleResource', 'Shader')
    if not os.path.exists(shader_dst):
        shutil.copytree(S.SRC_ROOT + '/AssetBundleResource/Shader', shader_dst)
    copied, jobs = set(), []
    if args == ['cand']:
        items = [(os.path.basename(p).replace(' ', '_'), (p + '.prefab', 96, 12, 2.0, '')) for p in CAND]
    else:
        items = [(k, v) for k, v in FX.items() if not args or k in args]
    for name, (pref, px, fps, dur, opt) in items:
        rel = S.copy_asset(A + pref, copied)
        if not rel:
            print('없음:', pref)
            continue
        jobs.append('|'.join([name, rel, str(px), str(fps), str(dur), opt]))
    open(os.path.join(S.PROJ, 'fx_jobs.txt'), 'w', encoding='utf-8').write('\n'.join(jobs) + '\n')
    print('assets:', len(copied), 'jobs:', len(jobs))


if __name__ == '__main__':
    main()
