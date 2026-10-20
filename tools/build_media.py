"""원작 라스트오리진 미디어를 게임으로 옮긴다: 타이틀 화면(배경·빛·로고), 배경음, 효과음, 타이틀 콜 음성, 글꼴(쓰는 글자만 추린 woff2).

python tools/build_media.py
"""
import glob, os, re, shutil, subprocess
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
G = r'E:/LAO_Google_QA/Assets/AssetBundleResource/'
O = r'E:/LAO/1_Onestre_QA/Assets/'
A = os.path.join(ROOT, 'assets')

BGM = {  # 게임 이름 -> 원작 파일
    'lo_title': '01 BGM_Title', 'lo_talk1': '07 BGM_Talk_01', 'lo_talk2': '08 BGM_Talk_02', 'lo_talk3': '09 BGM_Talk_03',
    'lo_battle1': '03 BGM_Battle_01', 'lo_battle2': '05 BGM_Battle_02', 'lo_battle3': '12 BGM_Battle_03', 'lo_boss1': '04 BGM_Battle_Boss_01',
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
}
# 원작 단추 소리는 클라이언트 기본 자원에 있다
SFX_ABS = {'lo_click': O + 'Resources/Sounds/UI/UI_Click.wav'}
# 인물 음성 (원작 Sounds/Voice/<폴더>/Voice_<모델>_<상황>.mp3) -> assets/voice/<영웅>_<상황>.mp3
HERO_VOICE = {'constantia': ('ConstantiaS2', '3P_ConstantiaS2'), 'griffon': ('PA00EL', 'BR_PA00EL'), 'johanna': ('Johanna', 'DS_Johanna'),
              'lrl': ('LRL', 'PECS_LRL_N'), 'pupphead': ('PuppHead', 'PECS_PuppHead'), 'fallen': ('Fallen', 'AGS_Fallen')}
VOICE_KIND = ['Join', 'SortiePick', 'SquadJoin', 'StageStart', 'MVP', 'Retreat', 'ActionApprove', 'SpSkill', 'BattleFocus', 'Leader', 'Login', 'SearchEnd', 'Reinforce']
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


def main():
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
    for v in VOICE:
        to_mp3(G + 'Sounds/LogoVoice/' + v + '.mp3', os.path.join(A, 'voice', v + '.mp3'), 96)
    title_images()
    fonts()
    print('끝')


if __name__ == '__main__':
    main()
