"""장마다 다른 마을 필드 그림을 원작 배경 묶음에서 오려 낸다 -> assets/town/t*.webp

마을은 장의 무대에 맞춰 꾸민다 (js/town.js TOWNMAPS):
  1장 등대 아래 비밀기지 (바닷가)       2장 헤파이스 철공소 거점 (공단 창고)
  3장 고갯길 진지 (81번 실험장 앞 숲)   4장 패스파인더 기지 (지하 수로·동굴)
  5장 건너편 역사 거점 (지하 역사)      6장 라비아타의 은신처 (눈 덮인 산)

조각: (원본, x, y, w, h, 최대 긴 변) — 영역 안에서 투명하지 않은 부분만 다시 잘라 낸다.
투명 바탕 둘레가 검거나 분홍으로 번지지 않게 줄일 때는 알파를 곱한 채로(RGBa) 줄인다.

python tools/build_town.py
"""
import os
import numpy as np
from PIL import Image, ImageFilter

from build_tiles import seamless, SIZE  # noqa: F401  (바닥 질감 이음매 없애기)

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
B = r'E:/LAO_Google_QA/Assets/AssetBundleResourceSub/BG/'
OUT = os.path.join(ROOT, 'assets', 'town')

FOOD = 'BG_Ch02S01/ch02s03FoodStrorage.png'
PLANT = 'BG_06_PowerPlant/ch02s02_PowerPlant.png'
SEED = 'BG_05_GenSeedFacility_Way/Ch02S01_GenSeedFacility.png'
SUB = 'BG_Ch09/BG_Vancouver_SubUrban.png'
LAB = 'BG_12_Laboratory/Laboratory_main.png'
SNOWR = 'BG_Ch13/BG_Ch13_snow_far_road.png'
XMAS = 'BG_Christmas/BG_Christmas_snow_road.png'

PIECES = {
    # 2장: 공단 창고 거리 (식량 창고 배경 띠를 건물 단위로 나눈다)
    't2_cmd': (FOOD, 80, 80, 610, 466, 720),        # 컨테이너를 쌓은 작업 지휘소
    't2_shop': (FOOD, 686, 80, 730, 466, 760),      # 지게차가 선 초록 창고 (철공 작업장)
    't2_cafe': (FOOD, 1398, 120, 420, 426, 560),    # 물고기 그림 주황 창고 (배식소)
    't2_fence': (FOOD, 22, 676, 892, 172, 900),     # 공단 담장 (위 가장자리에 이어 붙인다)
    't2_booth': (FOOD, 907, 578, 300, 190, 360),    # 경비 초소
    't2_gate': (PLANT, 17, 946, 1488, 458, 900),    # CLOSE 표지 출입 차단기 (마을 입구)
    't2_ladle': ('BG_07_02_Factory_infection/Factory2_furnace_N.png', 625, 560, 808, 1488, 520),  # 쇳물 바가지
    # 3장: 81번 실험장 앞 버려진 고갯마을 진지
    't3_plant': (SEED, 0, 68, 2036, 825, 1600),     # 81번 실험장 (뒤 배경)
    't3_gate': (SEED, 0, 917, 2048, 356, 1600),     # 실험장 담장과 정문
    't3_fence': (SEED, 7, 1400, 363, 181, 363),
    't3_bush': (SEED, 393, 1387, 932, 197, 700),
    't3_cmd': (SUB, 1092, 1531, 896, 351, 760),     # 넓은 집 (진지 지휘소)
    't3_shop': (PLANT, 3, 28, 1010, 830, 760),      # 화물차와 상자가 선 보급 창고 (무기고)
    't3_cafe': (SUB, 548, 1489, 522, 389, 560),     # 작은 집 (야전 식당)
    't3_radar': (LAB, 1108, 364, 250, 416, 300),    # 부서진 레이더 구
    't3_sign': (LAB, 303, 62, 129, 289, 200),       # B-TECH 안내판
    't3_mg': ('BG_OBJ/defense_line.png', 732, 33, 242, 234, 240),  # 거치 기관총
    # 4장: 지하 수로 옆 드론 기지
    't4_wall': ('BG_sewerage/BG_sewerage_1.png', 0, 571, 2048, 440, 1600),  # 원형 수문이 있는 수로 벽
    't4_cmd': ('BG_OBJ/Underground_facility.png', 1316, 470, 652, 960, 560),  # 붉은 불빛 문 (드론 관제실)
    't4_shop': (PLANT, 1010, 28, 1036, 830, 760),   # 드론 정류대와 헬기장 (드론 격납고)
    't4_cafe': ('BG_OBJ/Underground_facility.png', 330, 470, 960, 900, 600),  # 바위를 파고 지은 시설 벽 (보급고)
    't4_ore': ('IW/IW_Ore_01_02_Final.png', 0, 0, 576, 272, 400),
    't4_stal': ('IW/IW_Middle_Stalagmite_01A_Final.png', 0, 0, 1112, 537, 640),
    't4_stal2': ('IW/IW_Ground_Stalagmite_01_Final.png', 0, 0, 4000, 4000, 420),
    't4_rock': ('IW/IW_Rock_01_Final.png', 0, 0, 4000, 4000, 360),
    't4_pillar': ('IW/IW_Middle_Pillar 02_Final.png', 0, 0, 4260, 3847, 900),
    # 5장: 건너편 지하 역사와 언더와처 시설 입구
    't5_platform': ('BG_subway_station/BG_subway_station_Far.png', 0, 1207, 2048, 830, 1600),  # 승강장과 기둥, 화물칸
    't5_cmd': ('BG_Ch08/BG_Ch08_lab.png', 1193, 0, 855, 405, 720),     # 삼각 문장 금고문 (서버 관제실)
    't5_shop': ('BG_subway_station/BG_subway_on_train.png', 0, 939, 2048, 1109, 720),  # 열차 격납 문 (정비실)
    't5_cafe': ('BG_Ch08/BG_Ch08_lab.png', 0, 0, 853, 402, 640),       # 셔터 달린 역무실 (휴게실)
    't5_server': ('BG_secret_lab/BG_secret_lab.png', 102, 1219, 880, 508, 420),
    't5_core': ('BG_Ch08/BG_Ch08_lab.png', 29, 462, 592, 384, 360),    # 빛나는 원통 장치
    't5_pillar': ('BG_subway_station/BG_subway_station_Close.png', 120, 640, 180, 720, 300),
    # 6장: 눈 덮인 산속 은신처
    't6_mount': ('BG_Snowmountain/BG_EV14_3.png', 66, 30, 1974, 746, 1600),
    't6_shop': ('BG_Snowmountain/BG_EV14_3.png', 104, 1224, 556, 752, 420),  # 눈 속 연구소 입구 (정비실)
    't6_tree0': (SNOWR, 16, 41, 675, 986, 420),
    't6_trees': (SNOWR, 701, 137, 818, 853, 520),
    't6_tree2': (SNOWR, 1515, 210, 528, 779, 360),
    't6_grass0': (SNOWR, 28, 1380, 811, 241, 360),
    't6_grass1': (SNOWR, 1546, 1322, 429, 255, 260),
    't6_rock': (SNOWR, 103, 1051, 157, 70, 160),
    't6_pine': (XMAS, 1126, 0, 461, 766, 400),
    't6_lamp': (XMAS, 77, 150, 152, 331, 200),
    't6_fence': (XMAS, 317, 1028, 1366, 187, 900),
    't6_post': (XMAS, 977, 247, 93, 169, 120),
    't6_bush': (XMAS, 468, 76, 352, 420, 300),
    't6_mound': ('BG_Ch13/BG_Ch13Stage00_atlas01.png', 188, 239, 1053, 453, 520),  # 눈 덮인 바위 더미
    # 바닥 무늬 (밟고 지나가는 납작한 그림)
    'd_crack': ('BG_Coastal_city_ruins/BG_Coastal_city_ruins_1.png', 12, 913, 692, 304, 360),
    'd_crack2': ('IW/IW_Ground_Crack_B_Final.png', 154, 137, 1785, 429, 480),
    'd_grate': (SUB, 1316, 789, 363, 73, 200),
    # 여러 장에서 함께 쓰는 소품
    't4_cave': ('IW/IW_BG_Final.png', 0, 0, 4500, 1952, 1600),  # 동굴 바위 벽
    't4_ceil': ('IW/IW_Ceiling_Near_View 01_Final.png', 0, 0, 9562, 766, 1600),  # 종유석 천장
    't7_sea': ('BG_Ch09/BG_Ch09_sky_Far.png', 0, 500, 2048, 880, 1600),  # 먼 바다 수평선 (7장 군항)
    't7_tower': ('BG_Ch09/BG_Vancouver_Airport1.png', 1309, 1, 94, 317, 400),  # 관제탑 (7장 주둔지 지휘소)
    't7_terminal': ('BG_Ch09/BG_Vancouver_Airport1.png', 420, 19, 470, 150, 640),  # 터미널 가운데 동 (7장 함대 통신실)
    't7_isle': ('BG_Ch09/BG_Ch09_sky_Far.png', 0, 1848, 2048, 158, 900),  # 먼 섬
    't0_lamp': (SUB, 11, 775, 177, 484, 240),  # 공원 가로등
    't0_mgnest': ('BG_OBJ/defense_line.png', 35, 558, 968, 442, 480),
}
# 6장 거실·휴게실: 교외 집에 눈을 얹어 쓴다
SNOWHOUSE = [('t6_cafe', SUB, 10, 1495, 535, 380, 560), ('t6_cmd', 'BG_School/BG_School_main_02.png', 540, 29, 1484, 508, 760), ('t6_lab', 'BG_Tropical_island/BG_Tropical_island _1.png', 14, 13, 764, 633, 560)]  # 산장, 버려진 분교 (은신처 본관)
# 바닥 질감 (지도 칸에 반복해서 깐다)
GROUND = {
    'g_snow': (XMAS, 0, 1500, 640, 520),
    'g_snowpath': (SNOWR, 200, 1720, 600, 300),
    'g_asph': (SUB, 300, 20, 420, 420),
    'g_grass': ('BG_Tropical_island/BG_Tropical_island _1.png', 200, 1440, 600, 600),
}


def cut(src, x, y, w, h):
    im = Image.open(B + src).convert('RGBA').crop((x, y, x + w, y + h))
    a = np.asarray(im)[:, :, 3]
    ys, xs = np.nonzero(a > 12)
    return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def shrink(im, n):
    s = min(1.0, n / max(im.size))
    if s >= 1:
        return im
    return im.convert('RGBa').resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS).convert('RGBA')


def add_snow(im):
    """위로 드러난 면(지붕·처마·창틀)마다 눈을 얹고, 전체를 차가운 빛으로 누른다"""
    a = np.asarray(im).astype(np.float32)
    al = a[:, :, 3] > 40
    h, w = al.shape
    top = np.zeros_like(al)
    k = max(8, h // 14)  # 눈 두께
    above = np.zeros_like(al)
    above[k:] = al[:-k]
    top = al & ~above  # 위 k 픽셀 안이 비어 있는 곳 = 위로 드러난 면
    m = Image.fromarray((top * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    m = np.asarray(m).astype(np.float32) / 255 * al
    rng = np.random.default_rng(3)
    noise = np.asarray(Image.fromarray((rng.random((h // 6 + 1, w // 6 + 1)) * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)).astype(np.float32) / 255
    m = np.clip(m * (0.75 + noise * 0.5), 0, 1)[:, :, None]
    cold = a[:, :, :3] * np.array([0.84, 0.9, 1.02])
    snow = np.array([244, 248, 255], np.float32) - (1 - noise[:, :, None]) * np.array([30, 22, 10])
    # 밑동의 풀(초록 빛)은 눈에 덮인다
    g = (a[:, :, 1] > a[:, :, 0] * 1.08) & (a[:, :, 1] > a[:, :, 2] * 1.05) & al
    g[: int(h * 0.7)] = False
    gm = np.asarray(Image.fromarray((g * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5))).astype(np.float32)[:, :, None] / 255
    m = np.maximum(m, gm)
    rgb = cold * (1 - m) + snow * m
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 255), a[:, :, 3:]]).astype(np.uint8))


FADE = {'t4_cafe': {'t': 0.3, 'r': 0.18}, 't4_pillar': {'t': 0.25}, 't4_cmd': {'t': 0.12}, 't2_cafe': {'l': 0.1, 't': 0.06}}
ONLY = set(os.sys.argv[1:])  # 이름을 주면 그 조각만 다시 만든다


def puddle():
    """물웅덩이: 가장자리가 울퉁불퉁한 납작한 타원, 가운데가 짙고 하늘빛 반사 줄이 비친다"""
    W, H = 260, 96
    rng = np.random.default_rng(11)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    ang = np.arctan2((yy - H / 2) / (H / 2), (xx - W / 2) / (W / 2))
    rad = np.hypot((xx - W / 2) / (W / 2 - 6), (yy - H / 2) / (H / 2 - 6))
    edge = 0.86 + 0.08 * np.sin(ang * 3 + 1.1) + 0.05 * np.sin(ang * 7 + 2.3) + 0.03 * np.sin(ang * 13)
    inside = np.clip((edge - rad) * 14, 0, 1)
    depth = np.clip(1 - rad / edge, 0, 1)
    rgb = np.zeros((H, W, 3), np.float32)
    rgb[:] = np.array([52, 62, 74])
    rgb += (depth[:, :, None] * np.array([-14, -10, -2]))
    for k in range(3):  # 반사 줄
        y0 = H * (0.32 + 0.16 * k) + rng.uniform(-3, 3)
        band = np.exp(-((yy - y0) / 2.2) ** 2) * np.exp(-((xx - W * (0.38 + 0.12 * k)) / (W * 0.18)) ** 2)
        rgb += band[:, :, None] * np.array([150, 170, 190]) * (0.8 - 0.2 * k)
    rim = np.clip(1 - np.abs(edge - rad) * 18, 0, 1) * (yy < H / 2)
    rgb += rim[:, :, None] * np.array([60, 66, 70])
    a = inside * (0.55 + 0.35 * depth)
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 255), a * 255]).astype(np.uint8))


# 장마다 다른 방 뒷벽: 원작 기지 시설 방 그림 전체를 뒷벽으로 쓴다 (바닥은 게임이 따로 깐다)
ROOMBG = {
    'r_cap': ('UI_Facility/CaptainRoom.png', 1091),
    'r_arch': ('UI_Facility/Room_Archives.png', 1104),
    'r_secret': ('UI_Facility/Room_Secret.png', 1112),
    'r_ware': ('UI_Facility/Room_Warehouse.png', 1104),
    'r_bio': ('BG_Ch10_Biological Laboratory/Biological Laboratory (2).png', 996),
    'r_factory': ('BG_07_Factory_inside/Factory_Wall_floor_all_N.png', 1500),
    'r_lab': ('BG_12_Laboratory_in/BG_Laboratory_in_m.png', 1010),
}
FLIP = set()
TOP = {'r_lab': 120}  # 위쪽의 흐린 회색 띠는 잘라 낸다
MAT = {'r_cap': (840, 790, 1100, 845), 'r_secret': (840, 790, 1100, 845)}  # 문 앞 깔개 글자가 거꾸로(180도) 그려져 있어 깔개만 바로 돌린다 (원본 좌표)


def composite():
    """원작 조각을 겹쳐 새 건물 두 채를 만든다
    t1_bunker: 바닷가 벼랑 바위에 박힌 강철 문 (1장 지휘실, 등대 아래 비밀기지 입구)
    t6_bunker: 눈 더미에 파묻힌 연구소 문 (6장 정비실)"""
    rock = shrink(cut('BG_11_island/BG_main_Cliff_2.png', 28, 692, 1235, 749), 680)
    door = Image.open(os.path.join(OUT, 'b_center.webp')).convert('RGBA').crop((196, 96, 364, 410))
    W, H = rock.size
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    out.alpha_composite(rock)
    dh = int(H * 0.62); dw = int(door.width * dh / door.height)
    door = door.resize((dw, dh), Image.LANCZOS)
    # 문 둘레를 바위 속 그늘로 (파낸 자리)
    hole = Image.new('RGBA', (dw + 40, dh + 24), (0, 0, 0, 0))
    a = np.zeros((dh + 24, dw + 40), np.float32); a[12:, 14:-14] = 1
    hole = Image.fromarray(np.dstack([np.full(a.shape + (3,), 28, np.uint8), (a * 200).astype(np.uint8)])).filter(ImageFilter.GaussianBlur(8))
    x0 = W // 2 - dw // 2; y0 = H - dh - int(H * 0.04)
    hole = Image.fromarray(np.dstack([np.full(a.shape + (3,), 18, np.uint8), (np.clip(a * 1.2, 0, 1) * 235).astype(np.uint8)])).filter(ImageFilter.GaussianBlur(10))
    out.alpha_composite(hole, (x0 - 20, y0 - 12))
    da = np.asarray(door).astype(np.float32); da[:, :, :3] *= np.array([0.78, 0.8, 0.76]); door = Image.fromarray(da.astype(np.uint8))  # 바위 그늘 속 빛깔
    out.alpha_composite(door, (x0, y0))
    # 문 양옆 가장자리 위로 바위가 조금씩 덮이게
    ra = np.asarray(rock).astype(np.float32)
    band = np.zeros(ra.shape[:2], np.float32)
    for ex in (x0, x0 + dw):
        xs = np.arange(W); w = np.clip(1 - np.abs(xs - ex) / 16, 0, 1)
        band[y0 + 20:, :] = np.maximum(band[y0 + 20:, :], w[None, :])
    rng = np.random.default_rng(5)
    nz = np.asarray(Image.fromarray((rng.random((H // 8 + 1, W // 8 + 1)) * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)).astype(np.float32) / 255
    ra[:, :, 3] *= np.clip(band * (0.4 + nz), 0, 1)
    out.alpha_composite(Image.fromarray(ra.astype(np.uint8)))
    out.save(os.path.join(OUT, 't1_bunker.webp'), quality=90, method=6)

    mound = Image.open(os.path.join(OUT, 't6_mound.webp')).convert('RGBA')
    lab = Image.open(os.path.join(OUT, 't6_shop.webp')).convert('RGBA')
    W = 720; mh = int(mound.height * W / mound.width) + 60
    mound = mound.resize((W, mh), Image.LANCZOS)
    lh = int(mh * 1.25); lw = int(lab.width * lh / lab.height)
    lab = lab.resize((lw, lh), Image.LANCZOS)
    H = lh + 10
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    out.alpha_composite(mound, (0, H - mh))
    out.alpha_composite(lab, (W // 2 - lw // 2, H - lh))
    # 양옆 눈 더미를 다시 덮어 문이 눈 속에 묻힌 것처럼
    L = mound.crop((0, 0, int(W * 0.36), mh)); R = mound.crop((int(W * 0.64), 0, W, mh))
    out.alpha_composite(L, (0, H - mh)); out.alpha_composite(R, (int(W * 0.64), H - mh))
    oa = np.asarray(out).astype(np.float32); hh2, ww2 = oa.shape[:2]  # 눈 더미 양 끝의 곧은 자른 자국을 녹인다
    for side in ('l', 'r'):
        n = int(ww2 * 0.12); r = (np.arange(n) / n) ** 1.4
        if side == 'l': oa[:, :n, 3] *= r[None, :]
        else: oa[:, ww2 - n:, 3] *= r[None, ::-1]
    out = Image.fromarray(oa.astype(np.uint8))
    out.save(os.path.join(OUT, 't6_bunker.webp'), quality=90, method=6)


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, (src, x, y, w, h, n) in PIECES.items():
        if ONLY and name not in ONLY:
            continue
        im = shrink(cut(src, x, y, w, h), n)
        if name in FADE:  # 원본에서 곧게 잘린 가장자리는 어둠 속으로 녹인다 (네모로 오린 자국이 안 보이게)
            a = np.asarray(im).astype(np.float32); hh, ww = a.shape[:2]
            for side, frac in FADE[name].items():
                n = int((hh if side in 'tb' else ww) * frac); r = (np.arange(n) / n) ** 1.5
                if side == 't': a[:n, :, 3] *= r[:, None]
                if side == 'b': a[hh - n:, :, 3] *= r[::-1, None]
                if side == 'l': a[:, :n, 3] *= r[None, :]
                if side == 'r': a[:, ww - n:, 3] *= r[None, ::-1]
            im = Image.fromarray(a.astype(np.uint8))
        if name == 'd_crack':  # 흙빛 금은 회색 바닥에서 핏자국처럼 보여 빛깔을 뺀다
            a = np.asarray(im).astype(np.float32)
            l = a[:, :, :3].mean(axis=2, keepdims=True) * 0.8
            a[:, :, :3] = a[:, :, :3] * 0.12 + l * 0.88
            im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
        im.save(os.path.join(OUT, name + '.webp'), quality=90, method=6)
    for name, src, x, y, w, h, n in SNOWHOUSE:
        add_snow(shrink(cut(src, x, y, w, h), n)).save(os.path.join(OUT, name + '.webp'), quality=90, method=6)
    for name, (src, h) in ROOMBG.items():
        im = Image.open(B + src).convert('RGBA').crop((0, TOP.get(name, 0), 2048, h))
        if name in MAT:
            box = MAT[name]; im.paste(im.crop(box).rotate(180), box[:2])
        im = shrink(im, 1024)
        if name in FLIP:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        im.save(os.path.join(OUT, name + '.webp'), quality=88, method=6)
    composite()
    puddle().save(os.path.join(OUT, 'd_puddle.webp'), quality=90)
    for name, (src, x, y, w, h) in GROUND.items():
        im = Image.open(B + src).convert('RGB').crop((x, y, x + w, y + h)).resize((512, 512), Image.LANCZOS)
        seamless(im).save(os.path.join(OUT, name + '.webp'), quality=88)
    print('조각', len(PIECES) + 1, '바닥', len(GROUND))


if __name__ == '__main__':
    main()
