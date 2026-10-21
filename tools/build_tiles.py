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
    # 작전 장소(지형 갈래)마다 바꿔 까는 바닥
    'sand': ('BG_Beach/BG_Beach.png', 400, 1450, 560, 560),
    'concrete': ('BG_01_city/BG_01_city_main_F.png', 500, 1560, 480, 480),
    'factory': ('BG_07_Factory_inside/Factory_Wall_floor_all_N.png', 200, 1450, 560, 560),
    'grate': ('BG_07_01_Factory/Factory1_Floor_N.png', 200, 300, 600, 600),
    'labw': ('BG_secret_lab/BG_secret_lab.png', 100, 620, 470, 470),
    'cave': ('BG_Cave/BG_Cave_01.png', 200, 1400, 640, 640),
    'tomb': ('BG_TombOfKim/BG_TombOfKim_in_01.png', 300, 1450, 600, 600),
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
    # 실내·지하 갈래 소품
    'server': ('BG_secret_lab/BG_secret_lab.png', 102, 1217, 880, 445),
    'tank0': ('BG_12_Laboratory_in/BG_Laboratory_in_main.png', 1497, 23, 262, 467),
    'tank1': ('BG_12_Laboratory_in/BG_Laboratory_in_main.png', 1100, 23, 378, 467),
    'goo0': ('BG_12_Laboratory_in/BG_Laboratory_in_main.png', 91, 1525, 956, 478),
    'goo1': ('BG_12_Laboratory_in/BG_Laboratory_in_main.png', 1456, 1547, 250, 455),
    'console': ('BG_LaboratoryOfLatentScientists/BG_LaboratoryOfLatentScientists.png', 592, 290, 728, 564),
    'gas': ('BG_LaboratoryOfLatentScientists/BG_LaboratoryOfLatentScientists.png', 1380, 262, 645, 558),
    'desk': ('BG_LaboratoryOfLatentScientists/BG_LaboratoryOfLatentScientists.png', 23, 228, 523, 410),
    'mach0': ('BG_12_Laboratory/Laboratory_M.png', 68, 774, 432, 455),
    'mach1': ('BG_12_Laboratory/Laboratory_M.png', 614, 774, 820, 455),
    'crate0': ('BG_OBJ/warehouse_Obj.png', 34, 216, 212, 116),
    'crate1': ('BG_OBJ/warehouse_Obj.png', 34, 11, 212, 172),
    'shelf': ('BG_OBJ/warehouse_Obj.png', 273, 182, 200, 156),
    'fwall': ('BG_07_01_Factory/Factory1_Floor_N.png', 20, 1400, 720, 640),
    'hive0': ('BG_EW_OBJ/EW_OBJ_tex.png', 40, 20, 1360, 760),
    'hive1': ('BG_EW_OBJ/EW_OBJ_tex.png', 0, 880, 1280, 720),
    'crystal0': ('BG_EW_OBJ/EW_OBJ_tex.png', 1547, 0, 410, 560),
    'crystal1': ('BG_EW_OBJ/EW_OBJ_tex.png', 60, 1650, 400, 390),
    'spike': ('BG_EW_OBJ/EW_OBJ_tex.png', 1500, 1400, 548, 640),
    'mush0': ('BG_OBJ/mushroom.png', 245, 110, 135, 90),
    'mush1': ('BG_OBJ/mushroom.png', 273, 216, 80, 86),
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


def vr_floor():
    """가상 공간 바닥: 원작 가상 공간 배경 결(짙은 남색 + 하늘빛 격자 + 흐린 빛 얼룩)을 이음매 없이 그린다"""
    rng = np.random.default_rng(7)
    a = np.zeros((SIZE, SIZE, 3), np.float32) + np.array([22, 38, 66], np.float32)
    yy, xx = np.mgrid[0:SIZE, 0:SIZE] / SIZE
    for _ in range(6):  # 둥근 빛 얼룩 (둘레를 감아 이어지게)
        cx, cy, r = rng.random(), rng.random(), 0.12 + rng.random() * 0.2
        dx = np.minimum(abs(xx - cx), 1 - abs(xx - cx)); dy = np.minimum(abs(yy - cy), 1 - abs(yy - cy))
        a += np.exp(-(dx * dx + dy * dy) / (r * r))[:, :, None] * np.array([20, 60, 90], np.float32) * 0.5
    g = SIZE // 6  # 칸 넓이의 반 = 질감 한 장에 격자 6줄
    line = np.zeros((SIZE, SIZE), np.float32)
    for k in range(6):
        for d, w in ((0, 1.0), (1, 0.4), (-1, 0.4)):
            line[:, (k * g + d) % SIZE] = np.maximum(line[:, (k * g + d) % SIZE], w)
            line[(k * g + d) % SIZE, :] = np.maximum(line[(k * g + d) % SIZE, :], w)
    a += line[:, :, None] * np.array([60, 150, 190], np.float32) * 0.55
    for _ in range(40):  # 깨진 화면 조각 같은 작은 빛 사각형
        x, y, w, h = rng.integers(0, SIZE, 2).tolist() + rng.integers(4, 26, 2).tolist()
        a[y:y + h, x:x + w] += np.array([30, 80, 110], np.float32) * rng.random()
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, (src, x, y, w, h) in GROUND.items():
        im = Image.open(B + src).convert('RGB').crop((x, y, x + w, y + h)).resize((512, 512), Image.LANCZOS)
        seamless(im).save(os.path.join(OUT, name + '.webp'), quality=88)
    vr_floor().save(os.path.join(OUT, 'vr.webp'), quality=88)
    # 어두운 시설 바닥: 흰 연구소 바닥을 짙은 철빛으로 눌러 쓴다 (원작 지하 시설 결)
    a = np.asarray(Image.open(os.path.join(OUT, 'labw.webp')).convert('RGB')).astype(np.float32)
    Image.fromarray(np.clip(a * np.array([0.36, 0.42, 0.5]), 0, 255).astype(np.uint8)).save(os.path.join(OUT, 'labd.webp'), quality=88)
    for name, (src, x, y, w, h) in PROPS.items():
        im = Image.open(B + src).convert('RGBA').crop((x, y, x + w, y + h))
        im = im.crop(im.getbbox())
        if name.startswith('tree'):  # 공원 나무 밑의 화단 테두리는 숲에 어울리지 않아 잘라 낸다
            im = im.crop((0, 0, im.width, int(im.height * 0.86)))
        im.thumbnail((360, 360), Image.LANCZOS)
        im.save(os.path.join(OUT, name + '.webp'), quality=90)
    print('바닥', len(GROUND) + 2, '소품', len(PROPS))


if __name__ == '__main__':
    main()
