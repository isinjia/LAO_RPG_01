"""원작 전투 배경(옆에서 본 손그림 묶음)에서 지도용 바닥 질감과 소품을 만든다 -> assets/tiles/*.webp

바닥: 옆에서 본 그림이라 위아래로 밝기가 변하고 끝이 이어지지 않는다.
  1) 큰 흐림을 빼서 밝기 기울기를 없애고  2) 반 칸 밀어 겹친 그림과 가장자리에서 섞어 이음매를 없앤다.
소품: 투명 바탕 조각을 오려 아래쪽 가운데를 발 자리로 쓴다.

python tools/build_tiles.py
"""
import os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
B = r'E:/LAO_Google_QA/Assets/AssetBundleResourceSub/BG/'
OUT = os.path.join(ROOT, 'assets', 'tiles')
SIZE = 384  # 바닥 질감 한 장 (지도에서 3칸 넓이로 반복)

# 이름: (원본, 오릴 영역 x, y, w, h)
GROUND = {
    'grass': ('BG_11_island/BG_main_island.png', 0, 960, 1080, 1080),
    'forest': ('BG_10_forest/D01_forest.png', 0, 1400, 640, 640),
    'dirt': ('BG_Wildland/BG_Wildland.png', 200, 1300, 740, 740),
    'asphalt': ('BG_Coastal_city_ruins/BG_Coastal_city_ruins_1.png', 300, 1500, 540, 540),
}
PROPS = {
    'tree0': ('BG_Snowmountain/BG_EV14_4.png', 980, 3, 344, 503),
    'tree1': ('BG_Snowmountain/BG_EV14_4.png', 1337, 3, 335, 453),
    'tree2': ('BG_Snowmountain/BG_EV14_4.png', 1700, 0, 348, 500),
    'tree3': ('BG_Snowmountain/BG_EV14_4.png', 641, 3, 113, 158),
    'tree4': ('BG_Snowmountain/BG_EV14_4.png', 851, 9, 117, 160),
    'rock0': ('BG_11_island/BG_main_Cliff_2.png', 40, 0, 1322, 578),
    'rock1': ('BG_11_island/BG_main_Cliff_2.png', 28, 692, 1235, 749),
    'ruin0': ('BG_Coastal_city_ruins/BG_Coastal_city_ruins_1.png', 19, 27, 871, 394),
    'ruin1': ('BG_Coastal_city_ruins/BG_Coastal_city_ruins_1.png', 1118, 22, 898, 376),
    'wall': ('BG_Coastal_city_ruins/BG_Coastal_city_ruins_1.png', 787, 437, 282, 334),
    'sign': ('BG_Coastal_city_ruins/BG_Coastal_city_ruins_1.png', 389, 473, 208, 302),
    'bags0': ('BG_OBJ/defense_line.png', 44, 26, 609, 224),
    'bags1': ('BG_OBJ/defense_line.png', 38, 561, 962, 436),
    'barrel': ('BG_OBJ/defense_line.png', 70, 271, 230, 341),
    'wreck0': ('BG_OBJ/bgobject_destoryed_machine.png', 1390, 25, 607, 374),
    'wreck1': ('BG_OBJ/bgobject_destoryed_machine.png', 807, 643, 506, 367),
    'wreck2': ('BG_OBJ/bgobject_destoryed_machine.png', 52, 1410, 576, 448),
}


def _wrap(a, axis, o):
    """한 방향 이음매 없애기: 끝의 o 픽셀을 처음 o 픽셀 위에 서서히 겹치고 잘라 낸다 (가운데 이음매가 생기지 않는다)"""
    a = np.moveaxis(a, axis, 0)
    n = a.shape[0] - o
    k = (np.arange(o) / (o - 1))[:, None, None]
    k = k * k * (3 - 2 * k)
    out = a[:n].copy()
    out[:o] = a[n:] * (1 - k) + a[:o] * k
    return np.moveaxis(out, 0, axis)


def seamless(im):
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    # 밝기 기울기 없애기: 아주 큰 흐림(저주파)을 빼고 전체 평균을 더한다
    low = np.asarray(im.convert('RGB').filter(ImageFilter.GaussianBlur(im.size[0] / 4))).astype(np.float32)
    a = np.clip(a - low + low.mean(axis=(0, 1)), 0, 255)
    o = a.shape[0] // 4
    a = _wrap(_wrap(a, 1, o), 0, o)
    return Image.fromarray(a.astype(np.uint8)).resize((SIZE, SIZE), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, (src, x, y, w, h) in GROUND.items():
        im = Image.open(B + src).convert('RGB').crop((x, y, x + w, y + h)).resize((512, 512), Image.LANCZOS)
        seamless(im).save(os.path.join(OUT, name + '.webp'), quality=88)
    for name, (src, x, y, w, h) in PROPS.items():
        im = Image.open(B + src).convert('RGBA').crop((x, y, x + w, y + h))
        im = im.crop(im.getbbox())
        if name.startswith('tree'):  # 공원 나무 밑의 화단 테두리는 숲에 어울리지 않아 잘라 낸다
            im = im.crop((0, 0, im.width, int(im.height * 0.86)))
        im.thumbnail((360, 360), Image.LANCZOS)
        im.save(os.path.join(OUT, name + '.webp'), quality=90)
    print('바닥', len(GROUND), '소품', len(PROPS))


if __name__ == '__main__':
    main()
