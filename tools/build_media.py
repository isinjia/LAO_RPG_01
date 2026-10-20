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
    'lo_pick': 'UI/pick_basic.wav',
}
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
    for v in VOICE:
        to_mp3(G + 'Sounds/LogoVoice/' + v + '.mp3', os.path.join(A, 'voice', v + '.mp3'), 96)
    title_images()
    fonts()
    print('끝')


if __name__ == '__main__':
    main()
