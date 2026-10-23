"""원작 라스트오리진 미디어를 게임으로 옮긴다: 타이틀 화면(배경·빛·로고), 배경음, 효과음, 타이틀 콜 음성, 글꼴(쓰는 글자만 추린 woff2).

python tools/build_media.py
"""
import glob, os, re, shutil, subprocess, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
G = r'E:/LAO_Google_QA/Assets/AssetBundleResource/'
O = r'E:/LAO/1_Onestre_QA/Assets/'
A = os.path.join(ROOT, 'assets')

BGM = {  # 게임 이름 -> 원작 파일
    'lo_title': '01 BGM_Title', 'lo_lobby': '02 BGM_Lobby', 'lo_talk1': '07 BGM_Talk_01', 'lo_talk2': '08 BGM_Talk_02', 'lo_talk3': '09 BGM_Talk_03',
    'lo_talk_04': '10 BGM_Talk_04',  # 5지역 원작 대본이 쓰는 대화 배경음
    'lo_battle1': '03 BGM_Battle_01', 'lo_battle2': '05 BGM_Battle_02', 'lo_battle3': '12 BGM_Battle_03', 'lo_boss1': '04 BGM_Battle_Boss_01',
    'lo_boss2': '06 BGM_Battle_Boss_02', 'lo_boss3': '31 BGM_Battle_Boss_03',  # 6지역 대본의 Prefab_Sound 가 트는 곡
    'lo_battle4': '22 BGM_Battle_04', 'lo_battle5': '30 BGM_Battle_05',  # 4~6지역 작전 전투곡
    'lo_town': '11 BGM_Talk_05', 'lo_sad': '75 BGM_Sad_Story_01',  # 마을, 패배 결과
    'lo_march': '54 BGM_Stronghold_March',  # 지역 지도
}
SFX = {
    'lo_battle_start': 'UI/battle_start.wav', 'lo_win': 'UI/battle_win.wav', 'lo_clear': 'UI/stage_clear.wav',
    'lo_trans_in': 'UI/Trainsition_in.wav', 'lo_trans_out': 'UI/Trainsition_out.wav', 'lo_stage_in': 'UI/stage_in.wav',
    'lo_pick': 'UI/pick_basic.wav', 'lo_equip': 'UI/equip_basic.wav', 'lo_rank_up': 'UI/Rank_UP.mp3', 'lo_reinforce': 'UI/Reinforce_unit.wav',
    'lo_win_music': 'UI/battle_win_music.wav', 'lo_join': 'UI/Join_SearchEnd.wav', 'lo_coin': 'UI/collect_coin_03.wav',
    # 대화 연출 (원작 NovelAddEffect 의 _SoundName)
    'lo_d_explosion1': 'DialogSfx/Explosion_01.mp3', 'lo_d_explosion3': 'DialogSfx/Explosion_03.mp3', 'lo_d_gunfire': 'DialogSfx/GunFire_01.wav',
    'lo_d_metal': 'DialogSfx/Metalic_01.wav', 'lo_d_door': 'DialogSfx/DoorOpen_01.mp3', 'lo_d_foot': 'DialogSfx/FootStep_01.mp3',
    'lo_d_alarm': 'DialogSfx/Alarm_01.mp3', 'lo_d_break': 'DialogSfx/Break_01.mp3', 'lo_d_wind': 'DialogSfx/Wind_01.mp3',
    'lo_d_rustle': 'Common/foley_cloth_light_fast_movement_05.wav', 'lo_d_inject': 'Common/sci-fi_electric_pulse_hum_02.wav',
    'lo_d_whiteout': 'DialogSfx/WhiteOut_01.mp3',
    # 월드맵 부대 걷는 소리 (한 걸음짜리 흙길 발소리)
    'lo_walk': 'Common/Move/Walk/footstep_dirt_walk_run_01.wav',
    'lo_amb_wave': 'DialogSfx/Wave_01.mp3', 'lo_amb_wind': 'DialogSfx/Wind_02.mp3',  # 마을 바깥 환경음 (되풀이)
    'lo_d_explosion2': 'DialogSfx/Explosion_02.mp3', 'lo_d_gunfire2': 'DialogSfx/GunFire_02.wav', 'lo_d_knock': 'DialogSfx/DoorKnock_01.mp3',
    # 전투: 맞는 소리 (무기 갈래 × 바이오로이드·기계)
    'lo_hit_gun': 'Common/Hit/Human/hit_human_gun_small.wav', 'lo_hit_gun_r': 'Common/Hit/Robot/hit_robot_gun_small.wav',
    'lo_hit_heavy': 'Common/Hit/Human/hit_human_gun_big.wav', 'lo_hit_heavy_r': 'Common/Hit/Robot/hit_robot_gun_big.wav',
    'lo_hit_phy': 'Common/Hit/Human/hit_human_phy_mid.wav', 'lo_hit_phy_r': 'Common/Hit/Robot/hit_robot_phy_mid.wav',
    'lo_hit_laser': 'Common/Hit/Human/hit_laser_small.wav', 'lo_hit_elec': 'Common/Hit/Common/hit_common_electric_1.wav',
    'lo_hit_sword': 'Common/Hit/Common/hit_Sword_mid-1.wav', 'lo_hit_big': 'Common/Hit/Common/hit_Heavy_sound_01.mp3',
    'lo_swing': 'Common/Atk/Swing/atk_swing_mid.wav', 'lo_swing_r': 'Common/Atk/Swing/atk_swing_robot_small.wav',
    # 전투: 움직임 (돌격 발소리·말발굽 대신 원작 달리기, 비행, 걷기)
    'lo_run': 'Common/Move/Walk/CHR_F_Run.mp3', 'lo_dash': 'Common/Move/Walk/common_move_fast1.wav',
    'lo_march': 'Common/Move/Walk/Soldier/move_walk_soldier.wav', 'lo_walk_r': 'Common/Move/Walk/Robot/move_walk_robot_small_2foot_1.wav',
    'lo_walk_rb': 'Common/Move/Walk/Robot/move_walk_robot_big_4foot.wav', 'lo_fly': 'Common/Move/Fly/move_fly_jet.wav',
    'lo_whoosh': 'Common/Move/Fly/Synth Whoosh 1_1_IN.wav', 'lo_jump': 'Common/Move/Jump/move_jump_fast.wav',
    # 전투: 쓰러짐
    'lo_fall': 'Common/Move/Fall/move_fall_human.wav', 'lo_fall_r': 'Common/Move/Fall/move_fall_robot_small.wav',
    'lo_fall_rb': 'Common/Move/Fall/move_fall_robot_big.wav',
    # 전투: 차례·증원·특기 효과
    'lo_round': 'UI/battle_start_part02_round.wav', 'lo_warn': 'UI/Warning_infinite.wav',
    'lo_heal': 'Common/magic/shine_spell_02.wav', 'lo_buff': 'Common/effect/power_up_flash_01.wav',
    'lo_shield': 'Common/sci-fi_shield_power_on_impact_02.wav', 'lo_debuff': 'Common/magic/spell_harness_01.wav',
    'lo_cast': 'Common/Atk/Energy/Energy_In_aura_sound.wav', 'lo_reload': 'Common/Reload/Reload_1.wav',
    # 결과·성장
    'lo_rank_up_ss': 'UI/Rank_UP_SS.mp3', 'lo_reinforce_eq': 'UI/Reinforce_equip.wav', 'lo_like': 'UI/Likeability_up-1.wav',
    'lo_win_sfx': 'UI/battle_win_sfx.wav', 'lo_purchase': 'UI/item_purchase.wav',
}
# 영웅 고유 효과음 (원작 SFX/Character·Robot/<폴더>/char_NN_death·win·skill) -> assets/sfx/h_<영웅>_<종류>.mp3
HERO_SFX = {'constantia': 'Character/ConstantiaS2', 'griffon': 'Character/PA00EL', 'johanna': 'Character/Johanna', 'lrl': 'Character/LRL',
            'pupphead': 'Robot/PuppHead', 'fallen': 'Robot/Fallen', 'marie': 'Character/Marie', 'labiata': 'Character/Labiata',
            'scathy': 'Character/Scathy', 'amy': 'Character/Amy', 'coco': 'Robot/CoCoWhiteShell'}
# 철충 우두머리 고유 효과음 (원작 SFX/Enemy/<폴더>) -> assets/sfx/e_<적>_<종류>.mp3
ENEMY_SFX = {'stalker': 'Stalker', 'predator': 'Predator', 'trickster': 'Kidnapper', 'harvester': 'Harvester', 'raider': 'Raider',
             'blackknight': 'BlackKnight', 'goltarion': 'Goltarion', 'underwatcher': 'UnderWatcher', 'scout': 'Scout', 'legion': 'Legion',
             'centurion': 'Centurion', 'bigchick': 'BigChick', 'sniper': 'NightChickSP_N', 'chemical': 'NightChickCM_N', 'detector': 'NightChickDE_N',
             'chick': 'NightChick', 'zapper': 'Zapper'}


def pick(folder, kind):
    """폴더에서 종류(death·win·skill1·skill2)에 맞는 파일 하나: 통째(FULL) > 하나짜리 > 첫 조각"""
    fs = sorted(f for f in glob.glob(folder + '/*') if not f.endswith('.meta') and os.path.isfile(f))
    hit = [f for f in fs if re.search(r'[_ ]%s(_FULL|_0?1)?\.' % kind, os.path.basename(f))]
    full = [f for f in hit if '_FULL' in f]
    one = [f for f in hit if re.search(r'[_ ]%s\.' % kind, os.path.basename(f))]
    return (full or one or hit or [None])[0]


def unit_sfx():
    for hero, folder in HERO_SFX.items():
        for kind in ('death', 'win', 'skill1', 'skill2'):
            src = pick(G + 'Sounds/SFX/' + folder, kind)
            if src: to_mp3(src, os.path.join(A, 'sfx', 'h_%s_%s.mp3' % (hero, kind)), 112)
    for key, folder in ENEMY_SFX.items():
        for kind in ('death', 'skill1', 'skill2', 'skill', 'win', 'roar'):
            src = pick(G + 'Sounds/SFX/Enemy/' + folder, kind)
            if src: to_mp3(src, os.path.join(A, 'sfx', 'e_%s_%s.mp3' % (key, kind)), 112)
# 원작 단추 소리는 클라이언트 기본 자원에 있다
SFX_ABS = {'lo_click': O + 'Resources/Sounds/UI/UI_Click.wav'}
# 인물 음성 (원작 Sounds/Voice/<폴더>/Voice_<모델>_<상황>.mp3) -> assets/voice/<영웅>_<상황>.mp3
HERO_VOICE = {'constantia': ('ConstantiaS2', '3P_ConstantiaS2'), 'griffon': ('PA00EL', 'BR_PA00EL'), 'johanna': ('Johanna', 'DS_Johanna'),
              'lrl': ('LRL', 'PECS_LRL_N'), 'pupphead': ('PuppHead', 'PECS_PuppHead'), 'fallen': ('Fallen', 'AGS_Fallen'),
              # 2~6지역 합류
              'amy': ('Amy', 'BR_Amy'), 'coco': ('CoCoWhiteShell', 'PECS_CoCoWhiteShell'), 'marie': ('Marie', 'BR_Marie'),
              'aeda': ('Aeda', 'AGS_Aeda'), 'tomoe': ('Tomoe', 'BR_Tomoe'), 'vanilla': ('Vanilla', '3P_Vanilla'),
              'scathy': ('Scathy', 'BR_Scathy'), 'may': ('May', 'BR_May'), 'nightangel': ('NightAngel', 'BR_NightAngel'),
              'daika': ('Daika', 'BR_Daika'), 'labiata': ('Labiata', '3P_Labiata')}
VOICE_KIND = ['Join', 'SortiePick', 'SquadJoin', 'StageStart', 'MVP', 'Retreat', 'ActionApprove', 'SpSkill', 'BattleFocus', 'Leader', 'Login', 'SearchEnd', 'Reinforce', 'SearchStart', 'ItemEquip', 'Repair']
VOICE = ['Title-2', 'Title-4', 'Title-6', 'Title-8', 'Voice_3P_ConstantiaS2_Title-4', 'Voice_3P_ConstantiaS2_Title-8',
         'Voice_BR_PA00EL_Title-4', 'Voice_BR_PA00EL_Title-7', 'Voice_PECS_LRL_N_Title-1', 'Voice_PECS_LRL_N_Title-4',
         'Voice_PECS_PuppHead_Title-3', 'Voice_PECS_PuppHead_Title-5']


def ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def to_mp3(src, dst, kbps=128):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.exists(dst):
        return
    if src.lower().endswith('.mp3') and kbps >= 160:
        shutil.copyfile(src, dst); return
    subprocess.run([ffmpeg(), '-y', '-loglevel', 'error', '-i', src, '-b:a', '%dk' % kbps, dst], check=True)


def title_images():
    d = os.path.join(A, 'title'); os.makedirs(d, exist_ok=True)
    im = Image.open(O + 'Resources/Texture/chapter1_bg.png').convert('RGB').resize((1920, 1080), Image.LANCZOS)
    im.save(os.path.join(d, 'bg.webp'), quality=84)
    Image.open(O + 'Resources/Texture/chapter1_bg_LB.png').resize((1920, 1080), Image.LANCZOS).save(os.path.join(d, 'light.webp'), quality=84)
    Image.open(O + 'Resources/Texture/chapter1_bg_Addglow.png').save(os.path.join(d, 'glow.webp'), quality=88)
    Image.open(os.path.join(ROOT, 'tools', 'ui_src', 'TitleAtlas', 'LastOrigin_BI_outglow.png')).save(os.path.join(d, 'logo.webp'), quality=92)


def fonts():
    """원작 글꼴을 게임에서 쓰는 글자만 남겨 woff2 로"""
    from fontTools import subset
    text = set(chr(c) for c in range(32, 127))
    files = glob.glob(os.path.join(ROOT, 'js', '*.js')) + [os.path.join(ROOT, 'index.html')]
    for f in files:
        if os.path.basename(f) in ('assets.js', 'sd.js', 'anim_events.js'):
            continue
        text |= set(open(f, encoding='utf8').read())
    text = ''.join(c for c in text if c >= ' ')
    d = os.path.join(A, 'font'); os.makedirs(d, exist_ok=True)
    for name, out in (('FontM_ko.ttf', 'LO_M.woff2'), ('FontB_ko.ttf', 'LO_B.woff2')):
        opts = subset.Options(); opts.flavor = 'woff2'; opts.layout_features = ['*']
        font = subset.load_font(O + 'Resources/Font/' + name, opts)
        sub = subset.Subsetter(opts); sub.populate(text=text); sub.subset(font)
        subset.save_font(font, os.path.join(d, out), opts)
        print(out, os.path.getsize(os.path.join(d, out)) // 1024, 'KB')


def voices():
    for hero, (folder, model) in HERO_VOICE.items():
        for kind in VOICE_KIND:
            src = [f for f in glob.glob(G + 'Sounds/Voice/%s/Voice_*_%s.*' % (folder, kind)) if not f.endswith('.meta')]
            src = [f for f in src if os.path.basename(f).startswith('Voice_' + model.split('_N')[0])] or src
            if src:
                to_mp3(sorted(src, key=len)[0], os.path.join(A, 'voice', '%s_%s.mp3' % (hero, kind)), 96)


def main():
    if sys.argv[1:] == ['voice']:  # 인물 음성과 글꼴만 (새 대본·새 영웅을 넣었을 때)
        voices(); fonts(); return
    if sys.argv[1:] == ['sound']:  # 배경음·효과음·영웅·철충 고유 소리만
        for k, v in BGM.items():
            to_mp3(G + 'Sounds/BGM/' + v + '.mp3', os.path.join(A, 'bgm', k + '.mp3'), 128)
        for k, v in SFX.items():
            to_mp3(G + 'Sounds/SFX/' + v, os.path.join(A, 'sfx', k + '.mp3'), 128)
        unit_sfx(); return
    for k, v in BGM.items():
        to_mp3(G + 'Sounds/BGM/' + v + '.mp3', os.path.join(A, 'bgm', k + '.mp3'), 128)
    for k, v in SFX.items():
        to_mp3(G + 'Sounds/SFX/' + v, os.path.join(A, 'sfx', k + '.mp3'), 128)
    for k, v in SFX_ABS.items():
        to_mp3(v, os.path.join(A, 'sfx', k + '.mp3'), 128)
    for hero, (folder, model) in HERO_VOICE.items():
        for kind in VOICE_KIND:
            src = [f for f in glob.glob(G + 'Sounds/Voice/%s/Voice_*_%s.*' % (folder, kind)) if not f.endswith('.meta')]
            src = [f for f in src if os.path.basename(f).startswith('Voice_' + model.split('_N')[0])] or src
            if src:
                to_mp3(sorted(src, key=len)[0], os.path.join(A, 'voice', '%s_%s.mp3' % (hero, kind)), 96)
    unit_sfx()
    for v in VOICE:
        to_mp3(G + 'Sounds/LogoVoice/' + v + '.mp3', os.path.join(A, 'voice', v + '.mp3'), 96)
    title_images()
    fonts()
    print('끝')


if __name__ == '__main__':
    main()
