"""유니티로 찍은 대화 전신 그림(tools/unity_ref/proj/portrait/*.png, RefPortrait.Run) -> assets/story/stand/<이름>.webp
칠해진 영역만 잘라 높이 900 으로 맞춘다. 이미 있는 파일은 그대로 둔다 (--all 이면 다시 만듦).
python tools/build_stands.py [--all]
"""
import glob, os, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'tools', 'unity_ref', 'proj', 'portrait')
DST = os.path.join(ROOT, 'assets', 'story', 'stand')


def main():
    redo = '--all' in sys.argv
    n = 0
    for f in sorted(glob.glob(os.path.join(SRC, '*.png'))):
        out = os.path.join(DST, os.path.basename(f)[:-4] + '.webp')
        if os.path.exists(out) and not redo:
            continue
        im = Image.open(f).convert('RGBA')
        bb = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
        if not bb:
            continue
        im = im.crop(bb)
        if im.height != 900:
            im = im.resize((max(1, round(im.width * 900 / im.height)), 900), Image.LANCZOS)
        im.save(out, quality=88)
        n += 1
    print('새 전신 그림', n)


if __name__ == '__main__':
    main()
