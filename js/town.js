// 마을 (라켓몬스터식 필드): 칸 단위로 걷는 2D 지도, 건물(원작 배경에서 오린 외관)에 들어가면
// 원작 오르카 기지 시설 그림으로 꾸민 방. 사람은 원작 SD 리그(js/sd.js)를 화면 밖 WebGL 캔버스 한 장에 칸별로 그려 합성한다.
// 조작: 누른 칸까지 길을 찾아 걷기 (사람을 누르면 옆까지 가서 말 걸기) / 방향키·WASD 한 칸, Enter·Space 앞 사람과 대화.
// 시간은 게임 루프가 부르는 TOWNF.update(dt) 로만 흐른다.
(function () {
  const TILE = 48;
  const IMGS = {};
  const img = (n) => {
    if (IMGS[n]) return IMGS[n];
    const im = new Image(); im.src = `assets/${n}.webp`; IMGS[n] = im; return im;
  };
  const ok = (im) => im && im.complete && im.naturalWidth > 0;

  // 1장 기지 방 셋 (다른 장은 TOWNMAPS.rooms 로 그림만 바꾼다)
  const MAPS = {
    cmd: {
      name: '지휘실', rows: room(13, 9), indoor: 1, bg: 'town/r_train_0', fl: 365,
      objects: [
        { t: 'exit', x: 6, y: 8, w: 1, h: 1, to: 'back' },
        { t: 'deco', art: 'town/r_andr2_42', x: 2, y: 2, w: 2, h: 1, hh: 1.8, block: 1 },
        { t: 'deco', art: 'town/r_mk4_1', x: 9, y: 2, w: 1, h: 1, hh: 1.4, block: 1 },
        { t: 'deco', art: 'town/r_mk4_2', x: 10, y: 2, w: 1, h: 1, hh: 1.3, block: 1 },
        { t: 'deco', art: 'town/r_andr1_11', x: 5, y: 2, w: 3, h: 1, hh: 1.2, block: 1, board: 1 },
        { t: 'npc', id: 'johanna', x: 8, y: 4, dir: -1 },
        { t: 'npc', id: 'marie', x: 4, y: 5, dir: 1 },
        { t: 'npc', id: 'labiata', x: 10, y: 5, dir: -1 },
      ],
    },
    shop: {
      name: '정비실', rows: room(13, 9), indoor: 1, bg: 'town/r_mm0_0', fl: 370,
      objects: [
        { t: 'exit', x: 6, y: 8, w: 1, h: 1, to: 'back' },
        { t: 'deco', art: 'town/r_iron1_5', x: 1, y: 2, w: 1, h: 1, hh: 1.8, block: 1 },
        { t: 'deco', art: 'town/r_iron1_6', x: 2, y: 2, w: 1, h: 1, hh: 1.8, block: 1 },
        { t: 'deco', art: 'town/r_iron1_9', x: 10, y: 2, w: 2, h: 1, hh: 1.6, block: 1 },
        { t: 'deco', art: 'town/r_dis1_21', x: 9, y: 5, w: 2, h: 1, hh: 1.0, block: 1 },
        { t: 'deco', art: 'town/r_mk0_3', x: 5, y: 2, w: 1, h: 1, hh: 1.5, block: 1 },
        { t: 'npc', id: 'fortune', x: 6, y: 4, dir: 1 },
        { t: 'npc', id: 'pupphead', x: 3, y: 5, dir: 1 },
        { t: 'npc', id: 'coco', x: 8, y: 6, dir: -1 },
      ],
    },
    cafe: {
      name: '휴게실', rows: room(13, 9), indoor: 1, bg: 'town/r_cafe4_0', fl: 268,
      objects: [
        { t: 'exit', x: 6, y: 8, w: 1, h: 1, to: 'back' },
        { t: 'deco', art: 'town/r_cafe4_1', x: 3, y: 4, w: 3, h: 1, hh: 1.2, block: 1 },
        { t: 'deco', art: 'town/r_cafe4_1', x: 8, y: 5, w: 3, h: 1, hh: 1.2, block: 1 },
        { t: 'deco', art: 'town/r_cafe4_3', x: 10, y: 2, w: 1, h: 1, hh: 1.7, block: 1 },
        { t: 'deco', art: 'town/r_cafe2_3', x: 1, y: 2, w: 1, h: 1, hh: 0.8, block: 1 },
        { t: 'npc', id: 'amy', x: 2, y: 6, dir: 1 },
        { t: 'npc', id: 'scathy', x: 11, y: 6, dir: -1 },
      ],
    },
  };
  // 방: 원작 기지 시설 그림(배경 bg, 바닥이 시작하는 줄 fl, 옆벽 색 wall)과 가구. 사람·출구는 원래 방(지휘실·정비실·휴게실) 그대로
  const ROOM = (label, bg, fl, wall, deco) => ({ label, bg: 'town/' + bg, fl, wall, deco });
  const PROPS = { // 장면 방에 놓는 소품: [그림, 가로 비율, 바닥 첫 줄에서 아래로, 칸 넓이, 그림 높이]
    '지휘실': [['town/r_andr2_10', 0.3, 0, 3, 1.0], ['town/r_mk4_1', 0.12, 0, 1, 1.4], ['town/r_andr1_11', 0.66, 0, 2, 1.2]],
    '드론 관제실': [['town/r_mm1_12', 0.12, 0, 1, 1.7], ['town/r_mk4_1', 0.24, 0, 1, 1.4], ['tiles/console', 0.7, 0, 2, 1.4], ['town/r_mm2_2', 0.86, 0, 1, 1.5], ['tiles/crystal0', 0.06, 2, 1, 1.4, [100, '90,230,220']], ['town/t4_rock', 0.9, 2, 2, 0.6]],
    '드론 격납고': [['tiles/crystal1', 0.08, 2, 1, 1.3, [100, '120,240,230']], ['tiles/crate1', 0.86, 2, 1, 1.0], ['town/t4_ore', 0.74, 2, 2, 0.8]],
    '보급고 휴게실': [['tiles/crystal0', 0.9, 2, 1, 1.3, [100, '90,230,220']], ['town/t4_rock', 0.06, 2, 2, 0.6]],
    '진지 지휘소': [['tiles/bags0', 0.1, 2, 2, 0.7], ['tiles/crate1', 0.86, 2, 1, 1.0], ['tiles/crate0', 0.92, 2, 1, 0.9]],
    '무기고': [['tiles/bags1', 0.08, 2, 2, 0.7], ['tiles/barrel', 0.9, 2, 1, 1.0]],
    '서버 관제실': [['town/t5_server', 0.74, 2, 2, 1.4, [80, '90,255,180']]],
    '열차 정비실': [['town/t5_core', 0.12, 2, 2, 1.3, [90, '150,220,255']], ['tiles/crate1', 0.9, 2, 1, 1.0]],
    '주둔지 지휘소': [['tiles/barrel', 0.08, 2, 1, 1.0], ['tiles/crate1', 0.14, 2, 1, 1.0], ['town/t3_radar', 0.9, 1, 1, 1.8]],
    '함대 통신실': [['tiles/console', 0.12, 2, 2, 1.4, [90, '120,220,255']], ['tiles/crate0', 0.9, 2, 1, 0.9]],
    '분교 은신처': [['tiles/crate1', 0.1, 2, 1, 1.0], ['town/b_bench', 0.84, 2, 2, 0.8]],
    '연구소 정비실': [['tiles/tank0', 0.1, 2, 1, 1.6, [80, '90,255,170']]],
  };
  // ── 지도 ──────────────────────────────────────────────
  // 칸: . 바탕  s 넓은 바닥  _ 길  ~ 물(막힘)  # 벼랑·잔해·덤불(막힘)  b 뒷배경 자리(막힘, 뒷배경 그림이 덮는다)  r 선로(막힘)
  function grid(W, H, fill, paint) {
    const g = []; for (let y = 0; y < H; y++) g.push(Array(W).fill(fill));
    const R = (x, y, w, h, c) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (g[yy] && xx >= 0 && xx < W) g[yy][xx] = c; };
    paint(R);
    return g.map((r) => r.join(''));
  }
  // 실내: 뒤 두 줄은 벽, 양옆·아래 벽, 아래 가운데 문
  function room(w, h) {
    const g = [];
    for (let y = 0; y < h; y++) { const r = []; for (let x = 0; x < w; x++) r.push(y < 2 || x === 0 || x === w - 1 || y === h - 1 ? '#' : 'M'); g.push(r); }
    g[h - 1][Math.floor(w / 2)] = 'D';
    return g.map((r) => r.join(''));
  }
  // 소품: art 그림, (x, y) 왼쪽 위 칸, w 칸 넓이, hh 그림 높이(칸). o: { h 칸 높이, block 0 이면 지나감, cells 막을 칸만 [dx,dy], lit [반지름, 색], ox 픽셀 밀기, flip }
  const D = (art, x, y, w, hh, o) => Object.assign({ t: 'deco', art, x, y, w, h: 1, hh, block: 1 }, o);
  const DEC = (art, x, y, w, a = 1) => ({ t: 'decal', art, x, y, w, a }); // 바닥에 납작하게 까는 무늬 (금·맨홀·물웅덩이)
  const FIRE = (x, y) => ({ t: 'deco', kind: 'fire', x, y, w: 1, h: 1, block: 1, lit: [150, '255,170,90'] }); // 모닥불 (직접 그림)
  // 건물: to 들어갈 방, door 문 칸(x), label 은 방 이름으로 바뀐다
  const BLD = (to, art, x, y, w, h, door, o) => Object.assign({ t: 'building', x, y, w, h, art, label: '', door, to: [to, 6, 7] }, o);
  const CON = (x, y) => ({ t: 'npc', id: 'constantia', x, y, dir: -1 }); // 콘스탄챠는 마을 입구에서 사령관을 맞는다
  const NPC = (g, l, f) => [{ t: 'npc', id: 'griffon', x: g[0], y: g[1], dir: g[2] || 1 }, { t: 'npc', id: 'lrl', x: l[0], y: l[1], dir: l[2] || 1 }, { t: 'npc', id: 'fallen', x: f[0], y: f[1], dir: f[2] || -1 }];
  const EXIT = (x, y) => ({ t: 'exit', x, y, w: 2, h: 1 });

  // 1장 등대 아래 비밀기지: 바닷가. 위는 바다, 모래사장 위에 기관총 진지, 등대
  function coastRows() {
    const W = 26, H = 18, g = [];
    for (let y = 0; y < H; y++) g.push(Array(W).fill('.'));
    for (let x = 0; x < W; x++) { g[0][x] = g[1][x] = '~'; g[2][x] = (x % 7 === 3) ? '~' : 's'; g[3][x] = x < 7 || x > 20 ? 's' : '.'; }
    for (let y = 0; y < 6; y++) { g[y][0] = '~'; if (y > 1) g[y][1] = 's'; }
    for (let x = 4; x <= 21; x++) g[10][x] = '_';
    for (let y = 10; y < H; y++) { g[y][12] = '_'; g[y][13] = '_'; }
    for (let y = 9; y <= 10; y++) for (let x = 6; x <= 7; x++) g[y][x] = '_';
    for (let y = 9; y <= 10; y++) for (let x = 18; x <= 19; x++) g[y][x] = '_';
    for (let x = 0; x < W; x++) if (x < 11 || x > 14) g[H - 1][x] = '#';
    for (let y = 6; y < H; y++) { g[y][0] = '#'; g[y][W - 1] = '#'; }
    return g.map((r) => r.join(''));
  }
  const TOWNMAPS = {
    coast: {
      rows: coastRows(), start: [12, 16], water: 'sea',
      floor: { base: 'town/g_grass', zone: 'tiles/sand', path: 'tiles/sand', wall: 'tiles/forest', edge: 'rgba(70,50,20,.3)' },
      objects: [
        BLD('cmd', 'town/t1_bunker', 3, 5, 7, 4, 6, { plinth: 0, glow: '255,220,160' }), BLD('shop', 'town/b_shop', 16, 5, 6, 4, 18), BLD('cafe', 'town/b_cafe', 9, 12, 6, 2, 11, { plinth: 0 }),
        { t: 'deco', kind: 'lighthouse', x: 2, y: 3, w: 2, h: 2, block: 1, lit: [170, '255,226,150'] },
        D('town/t0_mgnest', 14, 3, 3, 1.2), D('town/t3_mg', 15, 3, 1, 1.25, { block: 0, ox: 6 }), D('tiles/bags0', 8, 3, 2, 0.75),
        D('town/b_palm1', 1, 7, 1, 2.6), D('town/b_palm2', 23, 4, 1, 2.6), D('town/b_palm1', 10, 3, 1, 2.4), D('town/b_palm2', 22, 13, 1, 2.6),
        D('tiles/tree0', 1, 12, 1, 2.2), D('tiles/tree1', 2, 15, 1, 2.0), D('tiles/tree2', 23, 10, 1, 2.2), D('tiles/tree3', 24, 16, 1, 1.7), D('town/b_pine2', 20, 15, 1, 2.2),
        D('town/b_rock', 23, 7, 2, 1.5), D('town/b_ruin1', 16, 14, 3, 1.5), D('town/b_ruin2', 4, 14, 3, 1.6),
        D('town/t0_lamp', 11, 9, 1, 2.1, { lit: [110, '255,222,160'] }), D('town/t0_lamp', 15, 9, 1, 2.1, { lit: [110, '255,222,160'] }),
        D('town/b_bench', 14, 11, 2, 0.9), D('town/b_barricade', 10, 16, 1, 1.0), D('town/b_barricade', 15, 16, 1, 1.0), D('town/b_stop', 16, 16, 1, 1.7),
        D('tiles/crate1', 20, 9, 1, 1.0), D('tiles/barrel', 21, 9, 1, 1.0), D('tiles/crate0', 3, 9, 1, 0.9),
        DEC('town/d_crack', 7, 10, 2, 0.55), DEC('town/d_crack', 17, 12, 2, 0.4),
        EXIT(12, 17), ...NPC([13, 8], [4, 4], [21, 11]), { t: 'npc', id: 'constantia', x: 11, y: 15, dir: 1 },
      ],
    },
    // 2장 헤파이스 철공소 거점: 공단 창고 거리. 위는 담장, 창고 셋이 큰길을 보고 섰고, 쇳물 바가지에서 불티가 튄다. 입구는 차단기
    works: {
      rows: grid(26, 18, '.', (R) => {
        R(0, 0, 26, 4, 'b'); R(0, 0, 1, 18, '#'); R(25, 0, 1, 18, '#'); R(0, 17, 26, 1, '#');
        R(1, 7, 24, 1, '_'); R(12, 7, 2, 11, '_'); R(3, 9, 20, 6, 's'); R(12, 7, 2, 11, '_'); R(21, 8, 1, 2, '_');
      }),
      floor: { base: 'tiles/concrete', zone: 'tiles/factory', zoneA: 0.22, path: 'town/g_asph', wall: 'tiles/concrete', back: '#3b3a3c', crisp: 1, lane: 'rgba(230,180,40,.8)', edge: 'rgba(0,0,0,0)' },
      sky: ['#5d5a68', '#c79a72'], fx: 'sparks', start: [12, 16],
      back: [{ art: 'town/t2_fence', by: 4.05, h: 2.0, repeat: 1 }],
      objects: [
        BLD('cmd', 'town/t2_cmd', 1, 4, 7, 3, 6), BLD('shop', 'town/t2_shop', 9, 4, 8, 3, 14), BLD('cafe', 'town/t2_cafe', 19, 4, 5, 3, 21),
        D('town/t2_ladle', 18, 10, 2, 2.6, { lit: [170, '255,120,40'], sparks: 1 }), D('tiles/crate1', 15, 12, 1, 1.0), D('tiles/crate0', 16, 12, 1, 0.9), D('tiles/gas', 21, 12, 2, 1.4),
        D('tiles/wreck0', 2, 11, 2, 1.5), D('tiles/wreck1', 3, 13, 2, 1.3), D('tiles/wreck2', 1, 15, 2, 1.6), D('tiles/barrel', 22, 15, 1, 1.1), D('tiles/crate1', 23, 15, 1, 1.0),
        D('tiles/barrel', 23, 12, 1, 1.1), D('tiles/barrel', 22, 12, 1, 1.0), D('tiles/crate0', 8, 9, 1, 0.9), D('tiles/crate1', 9, 9, 1, 1.0), D('tiles/crate1', 6, 15, 1, 1.0),
        D('tiles/bags1', 15, 15, 2, 0.8), D('town/t2_booth', 19, 15, 3, 1.9), D('town/t2_gate', 9, 16, 8, 2.6, { cells: [[0, 0], [1, 0], [7, 0]] }),
        D('town/t0_lamp', 4, 8, 1, 2.1, { lit: [120, '255,214,150'] }), D('town/t0_lamp', 20, 8, 1, 2.1, { lit: [120, '255,214,150'] }), D('town/t0_lamp', 10, 13, 1, 2.1, { lit: [120, '255,214,150'] }),
        D('town/b_bench', 6, 9, 2, 0.9), D('tiles/sign', 24, 9, 1, 1.4),
        DEC('town/d_crack', 5, 12, 3, 0.7), DEC('town/d_crack', 17, 14, 2, 0.6), DEC('town/d_grate', 8, 7, 1.4), DEC('town/d_grate', 17, 7, 1.4),
        EXIT(12, 17), ...NPC([11, 10], [7, 12, -1], [19, 13]), CON(14, 13),
      ],
      rooms: {
        cmd: Object.assign(ROOM('작업 지휘소', 'r_mm4_0', 365, ['#5a5a66', '#a9a7b8'], [D('town/r_mm4_11', 1, 2, 2, 1.7), D('town/r_mk0_3', 9, 2, 1, 1.5), D('town/r_andr2_42', 11, 2, 1, 1.6), D('town/r_iron1_7', 4, 6, 2, 0.8)]), { tint: '#ffe4c8' }),
        shop: Object.assign(ROOM('철공 작업장', 'r_factory', 355, ['#6b5552', '#b59d96'], [D('town/r_iron2_2', 1, 2, 2, 1.9), D('town/r_iron1_6', 10, 2, 2, 1.6), D('town/r_iron1_15', 10, 5, 2, 1.3)]), { tint: '#ffd9b8' }),
        cafe: Object.assign(ROOM('배식소', 'r_cafe1_0', 268, ['#8f877a', '#ece7de'], [D('town/r_cafe1_2', 8, 2, 3, 1.9), D('town/r_cafe1_1', 4, 4, 3, 1.0), D('town/r_cafe1_1', 8, 5, 3, 1.0), D('town/r_cafe3_2', 1, 2, 1, 1.0), D('town/r_cafe2_3', 2, 2, 1, 0.6)]), { tint: '#ead8ba' }),
      },
    },
    // 3장 고갯길 진지: 81번 실험장 정문 앞 버려진 고갯마을. 빈집 셋을 진지로 쓰고, 모래주머니 기관총 진지와 모닥불
    camp: {
      rows: grid(26, 18, '.', (R) => {
        R(0, 0, 26, 5, 'b'); R(0, 0, 2, 18, '#'); R(24, 0, 2, 18, '#'); R(0, 17, 26, 1, '#');
        R(7, 10, 13, 6, 's'); R(2, 9, 22, 1, '_'); R(12, 5, 2, 13, '_'); R(5, 15, 7, 1, '_');
      }),
      floor: { base: 'tiles/forest', zone: 'town/g_grass', path: 'tiles/dirt', wall: 'tiles/forest', back: '#2e3a2c' },
      sky: ['#6d88b3', '#f1c79a'], tint: '#ffe7c4', fx: 'leaves', start: [12, 16],
      back: [{ art: 'town/t3_plant', by: 4.3, h: 5.6, x: 13 }, { art: 'town/t3_fence', by: 5.05, h: 2.1, repeat: 1 }, { art: 'town/t3_gate', by: 5.05, h: 2.1, x: 13, w: 12.5 }, { art: 'town/t3_bush', by: 5.25, h: 0.7, repeat: 1, alpha: 0.9 }],
      objects: [
        BLD('cmd', 'town/t3_cmd', 2, 6, 8, 3, 7, { plinth: 0 }), BLD('shop', 'town/b_ruin2', 17, 6, 6, 3, 21, { plinth: 0 }), BLD('cafe', 'town/t3_cafe', 4, 12, 5, 3, 7, { plinth: 0 }),
        FIRE(15, 12), D('tiles/bags0', 9, 13, 2, 0.8), D('town/t3_mg', 10, 12, 1, 1.3, { block: 0 }), D('tiles/bags1', 17, 14, 2, 0.85),
        D('town/t3_radar', 21, 11, 1, 2.4), D('town/t3_sign', 14, 6, 1, 1.6), D('tiles/crate1', 16, 10, 1, 1.0), D('tiles/crate0', 17, 10, 1, 0.9), D('tiles/barrel', 18, 10, 1, 1.0),
        D('tiles/bags0', 10, 6, 2, 0.75), D('tiles/bags0', 14, 7, 2, 0.75, { flip: 1 }),
        D('town/b_pine2', 0, 6, 2, 2.6), D('tiles/tree0', 0, 9, 2, 2.4), D('tiles/tree2', 0, 12, 2, 2.5), D('town/b_pine2', 0, 15, 2, 2.6), D('tiles/tree1', 1, 17, 1, 2.2),
        D('tiles/tree1', 24, 6, 2, 2.4), D('town/b_pine2', 24, 9, 2, 2.6), D('tiles/tree0', 24, 12, 2, 2.5), D('tiles/tree2', 24, 15, 2, 2.4), D('tiles/tree4', 22, 16, 1, 1.9),
        D('tiles/tree3', 9, 16, 1, 1.6), D('tiles/tree4', 16, 16, 1, 1.8), D('tiles/rock0', 20, 15, 2, 1.0), D('tiles/mush0', 8, 10, 1, 0.6, { block: 0 }), D('tiles/mush1', 22, 13, 1, 0.6, { block: 0 }),
        DEC('town/d_crack', 13, 7, 2, 0.35),
        EXIT(12, 17), ...NPC([13, 11], [9, 11], [20, 13]), CON(14, 16),
      ],
      rooms: {
        cmd: ROOM('진지 지휘소', 'r_cap', 355, ['#3f6b62', '#8fc0b3'], [D('town/r_mm2_2', 2, 2, 1, 1.6), D('town/r_dis1_10', 11, 2, 1, 1.8), D('tiles/crate1', 1, 6, 1, 1.0)]),
        shop: Object.assign(ROOM('무기고', 'r_rein2_0', 370, ['#6b5552', '#b59d96'], [D('town/r_res2_16', 1, 2, 1, 2.0), D('town/r_res1_8', 11, 2, 1, 1.8), D('tiles/crate1', 10, 5, 1, 1.0)]), { tint: '#eef2dc' }),
        cafe: Object.assign(ROOM('야전 식당', 'r_cafe2_0', 268, ['#8f877a', '#ece7de'], [D('town/r_cafe2_1', 3, 4, 3, 1.0), D('town/r_cafe2_3b', 8, 2, 3, 1.3), D('town/r_cafe2_2', 8, 5, 3, 1.0), D('town/r_cafe2_3', 1, 2, 1, 0.6), D('town/r_cafe2_1', 3, 6, 3, 1.0), D('town/r_cafe3_2', 11, 2, 1, 1.0), D('town/r_cafe1_1', 8, 7, 3, 1.0, { block: 0 })]), { tint: '#f1e0c0' }),
      },
    },
    // 4장 패스파인더 기지: 지하 수로 옆 동굴. 위는 원형 수문이 달린 수로 벽과 물길, 드론 정류대, 빛나는 결정과 돌기둥
    sewer: {
      rows: grid(26, 18, '.', (R) => {
        R(0, 0, 26, 4, 'b'); R(0, 4, 26, 2, '~'); R(0, 0, 1, 18, '#'); R(25, 0, 1, 18, '#'); R(0, 17, 26, 1, '#'); R(1, 15, 2, 2, '#'); R(23, 6, 2, 3, '#');
        R(11, 10, 12, 6, 's'); R(2, 9, 21, 1, '_'); R(12, 9, 2, 9, '_');
      }),
      floor: { base: 'tiles/cave', zone: 'tiles/concrete', path: 'tiles/labd', wall: 'tiles/cave', back: '#10161a', zoneA: 0.55 },
      sky: ['#05080b', '#0f1a20'], dark: 0.56, torch: 1, water: 'canal', fx: 'drip', start: [12, 16],
      lights: [[3, 3.4, 150, '255,90,60'], [9, 3.6, 120, '120,220,230'], [16, 3.6, 120, '120,220,230'], [22, 3.4, 150, '255,90,60']],
      back: [{ art: 'town/t4_cave', by: 4.15, h: 4.6, repeat: 1, mirror: 1 }, { art: 'town/t4_ceil', by: 1.1, h: 1.1, repeat: 1, mirror: 1 }],
      objects: [
        BLD('cmd', 'town/t4_cmd', 3, 6, 3, 3, 4, { plinth: 0, glow: '255,110,50' }), BLD('shop', 'town/t4_shop', 14, 6, 8, 3, 17, { plinth: 0, glow: '120,255,240' }), BLD('cafe', 'town/t2_booth', 3, 12, 6, 3, 6, { plinth: 0, glow: '200,150,110', lightR: 60, dim: 0.45 }),
        D('tiles/crystal0', 1, 10, 1, 2.0, { lit: [130, '90,230,220'] }), D('tiles/crystal1', 22, 12, 2, 1.8, { lit: [140, '120,240,230'] }), D('tiles/crystal0', 10, 16, 1, 1.5, { lit: [100, '90,230,220'] }),
        D('town/t4_ore', 8, 10, 2, 1.0), D('town/t4_ore', 1, 15, 2, 0.9), D('town/t4_rock', 22, 16, 2, 0.7), D('town/t4_rock', 16, 16, 2, 0.7),
        D('town/t4_rock', 23, 7, 2, 0.8), D('town/t4_stal', 0, 12, 2, 1.5, { flip: 1 }), D('tiles/crystal1', 0, 9, 1, 1.4, { lit: [90, '120,240,230'] }), D('town/t4_rock', 21, 9, 2, 0.6),
        D('town/t4_ore', 18, 16, 2, 0.9), D('tiles/crystal1', 3, 16, 1, 1.3, { lit: [90, '120,240,230'] }),
        D('tiles/console', 18, 11, 2, 1.4, { lit: [90, '120,220,255'] }), D('tiles/gas', 20, 14, 2, 1.4), D('tiles/crate0', 11, 14, 1, 0.9), D('tiles/crate1', 10, 14, 1, 1.0), D('tiles/bags0', 15, 15, 2, 0.75),
        D('tiles/crystal0', 7, 8, 1, 1.4, { lit: [120, '90,230,220'] }), D('tiles/crystal1', 10, 8, 1, 1.2, { lit: [110, '120,240,230'] }),
        DEC('town/d_crack2', 4, 10, 4, 0.85), DEC('town/d_crack2', 17, 15, 3, 0.75), DEC('town/d_grate', 12, 13, 1.5),
        EXIT(12, 17), ...NPC([12, 11], [10, 11], [20, 10]), CON(14, 15),
      ],
      rooms: {
        cmd: Object.assign(ROOM('드론 관제실', 'r_mm0_0', 556, ['#3c5a5c', '#88a9ab'], [D('town/r_mk4_1', 1, 6, 1, 1.4), D('town/r_mm2_2', 11, 7, 1, 1.5)]), { floorTex: 'tiles/labd', tint: '#a9bcc6' }),
        shop: Object.assign(ROOM('드론 격납고', 'r_parts_1', 365, ['#55606e', '#9aa6b6'], [D('town/r_iron1_5b', 1, 2, 1, 1.9), D('town/r_iron2_16', 11, 2, 1, 2.2)]), { tint: '#9fb6be' }),
        cafe: Object.assign(ROOM('보급고 휴게실', 'r_ware', 552, ['#8f877a', '#ece7de'], [D('town/r_cafe5_1', 4, 4, 3, 1.1), D('town/r_cafe2_1', 8, 4, 3, 1.0), D('town/r_cafe3_2', 11, 3, 1, 1.0)]), { floorTex: 'tiles/factory', tint: '#b9c6cc' }),
      },
    },
    // 5장 건너편 역사 거점: 지하 철도 승강장. 위는 기둥과 화물칸이 선 승강장, 언더와처 시설의 금고문과 서버
    station: {
      rows: grid(26, 18, '.', (R) => {
        R(0, 0, 26, 5, 'b'); R(0, 0, 1, 18, '#'); R(25, 0, 1, 18, '#'); R(0, 17, 26, 1, '#');
        R(3, 9, 20, 6, 's'); R(1, 8, 24, 1, '_'); R(12, 8, 2, 10, '_');
      }),
      floor: { base: 'tiles/labd', zone: 'tiles/factory', zoneA: 0.3, path: 'tiles/labw', wall: 'tiles/labd', back: '#0b1218', pathA: 0.3, crisp: 1, wallDark: 0.12, lane: 'rgba(90,220,255,.35)' },
      sky: ['#04070b', '#0d1c26'], fx: 'dust', edgeLine: 5, start: [12, 16],
      back: [{ art: 'town/t5_platform', by: 5.15, h: 5.2, repeat: 1 }],
      objects: [
        BLD('cmd', 'town/t5_cmd', 10, 5, 6, 3, 12, { plinth: 0, glow: '140,230,255' }), BLD('shop', 'town/t5_shop', 18, 5, 6, 3, 20, { plinth: 0, glow: '255,90,90' }), BLD('cafe', 'town/t5_cafe', 2, 5, 6, 3, 4, { plinth: 0 }),
        D('town/t5_server', 3, 10, 3, 1.8, { lit: [110, '90,255,180'] }), D('town/t5_server', 20, 10, 3, 1.8, { lit: [110, '90,255,180'] }),
        D('town/t5_core', 8, 12, 2, 1.6, { lit: [130, '150,220,255'] }), D('town/t5_core', 16, 12, 2, 1.6, { lit: [130, '150,220,255'] }),
        D('tiles/crate1', 1, 13, 1, 1.0), D('tiles/crate0', 24, 13, 1, 0.9), D('town/b_bench', 8, 16, 2, 0.9), D('town/b_bench', 16, 16, 2, 0.9),
        D('tiles/console', 6, 15, 2, 1.4, { lit: [90, '120,220,255'] }), D('tiles/tank0', 21, 15, 1, 1.9, { lit: [90, '90,255,170'] }), D('tiles/tank1', 3, 15, 1, 1.9, { lit: [90, '90,255,170'] }),
        D('town/b_bench', 10, 9, 2, 0.9), D('town/b_bench', 14, 9, 2, 0.9), D('tiles/crate0', 22, 8, 1, 0.9), D('tiles/crate1', 23, 8, 1, 1.0), D('tiles/crate1', 1, 9, 1, 1.0),
        DEC('town/d_grate', 5, 13, 1.5), DEC('town/d_grate', 18, 13, 1.5), DEC('town/d_grate', 10, 16, 1.5), DEC('town/d_crack', 19, 15, 2, 0.45),
        EXIT(12, 17), ...NPC([12, 11], [7, 10], [18, 13]), CON(14, 15),
      ],
      lights: [5, 12.5, 20].flatMap((x) => [9, 13, 16].map((y) => [x, y, 210, '200,230,255'])), // 천장 조명: 고르게
      rooms: {
        cmd: Object.assign(ROOM('서버 관제실', 'r_arch', 552, ['#2f4f4a', '#7fa69c'], [D('town/r_andr2_10', 2, 6, 3, 1.0), D('tiles/server', 9, 6, 2, 1.1)]), { floorTex: 'tiles/labd' }),
        shop: Object.assign(ROOM('열차 정비실', 'r_dis3_0', 365, ['#55606e', '#9aa6b6'], [D('town/r_iron1_9', 1, 2, 2, 1.7), D('town/r_var2_14', 11, 2, 1, 2.4)]), { tint: '#d2deef' }),
        cafe: ROOM('역무실 휴게실', 'r_cafe5_0', 268, ['#8f877a', '#ece7de'], [D('town/r_cafe5_3', 8, 2, 3, 1.0), D('town/r_cafe2_1', 3, 4, 3, 1.0), D('town/r_cafe4_1', 8, 5, 3, 1.1), D('town/r_cafe3_2', 1, 2, 1, 1.0)]),
      },
    },
    // 6장 라비아타의 은신처: 눈 덮인 산속. 뒤로 설산과 눈 덮인 숲, 석조 건물과 눈 속 연구소 입구, 모닥불과 가로등
    snow: {
      rows: grid(26, 18, '.', (R) => {
        R(0, 0, 26, 5, 'b'); R(0, 0, 1, 18, '#'); R(25, 0, 1, 18, '#'); R(0, 17, 26, 1, '#');
        R(7, 10, 11, 6, 's'); R(1, 9, 24, 1, '_'); R(12, 9, 2, 9, '_'); R(14, 15, 5, 1, '_'); R(21, 8, 1, 1, '_');
      }),
      floor: { base: 'town/g_snow', zone: 'town/g_snowpath', path: 'town/g_snowpath', wall: 'town/g_snowpath', back: '#cfd9e3', pathA: 0.45, edge: 'rgba(120,140,170,.22)', wallDark: 0.06 },
      sky: ['#8ea6c2', '#eef3f8'], fx: 'snow', start: [12, 16],
      back: [{ art: 'town/t6_mount', by: 3.6, h: 5.4, x: 7 }, { art: 'town/t6_mount', by: 3.4, h: 4.2, x: 20, flip: 1, alpha: 0.85 },
        { art: 'town/t6_trees', by: 5.0, h: 3.4, x: 2.5 }, { art: 'town/t6_tree0', by: 4.9, h: 3.2, x: 23.5 }, { art: 'town/t6_tree2', by: 4.8, h: 2.6, x: 17.5 },
        { art: 'town/t6_fence', by: 5.1, h: 1.15, repeat: 1 }],
      objects: [
        BLD('cmd', 'town/t6_cmd', 1, 6, 8, 3, 5, { plinth: 0 }), BLD('shop', 'town/t6_bunker', 18, 6, 7, 3, 21, { plinth: 0, glow: '140,240,255' }), BLD('cafe', 'town/t6_cafe', 15, 12, 5, 3, 18, { plinth: 0 }),
        FIRE(11, 12), D('town/t0_lamp', 9, 8, 1, 2.2, { lit: [130, '255,210,150'] }), D('town/t0_lamp', 17, 8, 1, 2.2, { lit: [130, '255,210,150'] }), D('town/t0_lamp', 14, 16, 1, 2.0, { lit: [120, '255,210,150'], flip: 1 }),
        D('town/t6_post', 10, 16, 1, 1.5), D('town/t6_mound', 1, 13, 3, 1.9), D('town/t6_rock', 21, 10, 1, 0.6), D('town/t6_rock', 6, 15, 1, 0.55),
        D('town/t6_grass0', 3, 10, 2, 0.8, { block: 0 }), D('town/t6_grass1', 19, 16, 1, 1.0, { block: 0 }), D('town/t6_grass0', 22, 13, 2, 0.8, { block: 0 }), D('town/t6_bush', 8, 16, 1, 1.6),
        D('town/t6_tree0', 0, 11, 2, 3.2), D('town/t6_pine', 24, 10, 1, 3.0), D('town/t6_tree2', 0, 16, 2, 2.6), D('town/t6_trees', 22, 16, 3, 3.2), D('town/t6_pine', 5, 16, 1, 2.6),
        D('tiles/crate1', 9, 6, 1, 1.0), D('tiles/crate0', 10, 6, 1, 0.9), D('tiles/barrel', 16, 6, 1, 1.0), D('town/b_bench', 8, 13, 2, 0.9),
        D('town/t6_rock', 15, 11, 1, 0.5), D('town/t6_grass1', 10, 14, 1, 0.9, { block: 0 }), D('tiles/crate1', 13, 13, 1, 0.9), D('town/t6_bush', 18, 9, 1, 1.4, { block: 0 }), D('town/t6_pine', 6, 12, 1, 2.6), D('tiles/bags0', 5, 12, 2, 0.7),
        EXIT(12, 17), ...NPC([13, 11], [9, 11], [20, 11]), CON(14, 14),
      ],
      rooms: { // 숨어 지내던 곳이라 방마다 따뜻한 등불 빛
        cmd: Object.assign(ROOM('분교 은신처', 'r_lab', 546, ['#6a5a50', '#b8a495'], [D('town/r_cafe4_1b', 1, 6, 3, 1.0)]), { floorTex: 'tiles/labw' }),
        shop: Object.assign(ROOM('연구소 정비실', 'r_bio', 498, ['#6b5b62', '#b8a2ab'], [D('town/r_iron1_9', 10, 4, 2, 1.5)]), { floorTex: 'tiles/labw' }),
        cafe: Object.assign(ROOM('산장 쉼터', 'r_cafe3_0', 268, ['#8f877a', '#ece7de'], [D('town/r_cafe4_2', 8, 2, 3, 1.2), D('town/r_cafe5_1', 3, 4, 3, 1.1), D('town/r_cafe4_1', 8, 5, 3, 1.1), D('town/r_cafe4_3', 1, 2, 1, 1.6)]), { tint: '#ffe2bf' }),
      },
    },
    // 7장 새 주둔지: 해군 시설 군항. 뒤로 먼 바다 수평선, 부두 끝 노란 경고 띠, 헬기장과 격납고, 물고기 그림 컨테이너 식당
    port: {
      rows: grid(26, 18, '.', (R) => {
        R(0, 0, 26, 6, 'b'); R(0, 0, 1, 18, '#'); R(25, 0, 1, 18, '#'); R(0, 17, 26, 1, '#');
        R(3, 11, 14, 5, 's'); R(1, 10, 24, 1, '_'); R(12, 10, 2, 8, '_'); R(21, 11, 1, 1, '_');
      }),
      floor: { base: 'tiles/concrete', zone: 'tiles/factory', zoneA: 0.16, path: 'town/g_asph', wall: 'tiles/concrete', back: '#2d6f8f', crisp: 1, lane: 'rgba(230,180,40,.8)' },
      sky: ['#3f8fd0', '#8fd0ea'], fx: 'dust', edgeLine: 6, start: [12, 16],
      back: [{ art: 'town/t7_sea', by: 6.05, h: 6.4, repeat: 1, mirror: 1 }],
      objects: [
        BLD('cmd', 'town/t7_tower', 4, 7, 3, 3, 5, { plinth: 0 }), BLD('shop', 'town/t7_terminal', 14, 7, 8, 3, 18, { plinth: 0 }), BLD('cafe', 'town/t2_cafe', 19, 13, 5, 3, 21, { plinth: 0 }),
        D('town/t3_radar', 23, 9, 1, 2.4), D('town/t0_mgnest', 10, 7, 3, 1.1), D('town/t3_mg', 11, 7, 1, 1.2, { block: 0 }),
        D('tiles/crate1', 3, 12, 1, 1.0), D('tiles/crate0', 4, 12, 1, 0.9), D('tiles/crate1', 3, 13, 1, 1.0), D('tiles/barrel', 15, 12, 1, 1.1), D('tiles/barrel', 16, 12, 1, 1.0),
        D('tiles/console', 8, 14, 2, 1.4, { lit: [90, '120,220,255'] }), D('tiles/gas', 1, 15, 2, 1.4), D('tiles/bags1', 15, 15, 2, 0.8), D('town/b_bench', 5, 15, 2, 0.9),
        D('town/t0_lamp', 11, 9, 1, 2.1, { lit: [120, '255,222,160'] }), D('town/t0_lamp', 22, 9, 1, 2.1, { lit: [120, '255,222,160'] }), D('town/t0_lamp', 10, 13, 1, 2.1, { lit: [120, '255,222,160'] }),
        D('tiles/wreck2', 1, 13, 2, 1.4), D('tiles/sign', 24, 11, 1, 1.4),
        DEC('town/d_grate', 7, 10, 1.4), DEC('town/d_grate', 17, 10, 1.4), DEC('town/d_crack', 5, 13, 2, 0.45),
        EXIT(12, 17), ...NPC([12, 12], [8, 12], [17, 14]), CON(14, 15),
      ],
      rooms: {
        cmd: ROOM('주둔지 지휘소', 'r_rein3_0', 345, ['#2f4f4a', '#7fa69c'], []),
        shop: ROOM('함대 통신실', 'r_secret', 425, ['#3c5a5c', '#88a9ab'], []),
        cafe: ROOM('부두 식당', 'r_cafe4_0', 232, ['#8f877a', '#ece7de'], []),
      },
    },
  };
  const ROOMS0 = { cmd: MAPS.cmd, shop: MAPS.shop, cafe: MAPS.cafe }; // 1장 방 (원래 그대로)
  const ROOMNAME0 = { cmd: '지휘실', shop: '정비실', cafe: '휴게실' };
  // ── 방: 원작 기지 시설 보기처럼 방 그림 한 장을 그대로 펼치고, 그림 속 바닥 위를 걷는다 ──
  // 그림의 뒷벽은 비율 그대로, 바닥 부분만 걸을 자리가 넉넉하도록(3칸 남짓) 세로로 늘린다.
  // fl: 그림(가로 1024 기준)에서 바닥이 시작하는 높이, blk: 바닥 위에 선 큰 기계 자리(가로 비율 구간, 지나갈 수 없음)
  const STAGE = {
    r_train_0: { fl: 335, h: 512 }, r_dis2_0: { fl: 335, h: 512, blk: [[0.66, 1]] }, r_mm4_0: { fl: 395, h: 512, blk: [[0.06, 0.27], [0.43, 0.63], [0.88, 1]] },
    r_rein1_0: { fl: 360, h: 512 }, r_dis1_0: { fl: 360, h: 512 }, r_rein2_0: { fl: 345, h: 512, blk: [[0.66, 1]] },
    r_parts_1: { fl: 370, h: 512, blk: [[0, 0.15], [0.27, 0.68]] }, r_rein3_0: { fl: 345, h: 512, blk: [[0.66, 1]] },
    r_cap: { fl: 425, h: 546, blk: [[0.56, 0.82]] }, r_mm0_0: { fl: 370, h: 512 },
    r_factory: { fl: 525, h: 750, back: '#c3ccd8' }, r_lab: { fl: 350, h: 445 }, r_arch: { fl: 425, h: 552, blk: [[0, 0.16]] }, r_secret: { fl: 425, h: 556 },
    r_ware: { fl: 430, h: 552, blk: [[0, 0.2], [0.82, 1]] }, r_bio: { fl: 415, h: 498 },
    r_cafe1_0: { fl: 232, h: 340 }, r_cafe2_0: { fl: 232, h: 340 }, r_cafe3_0: { fl: 232, h: 340 },
    r_cafe4_0: { fl: 232, h: 340 }, r_cafe5_0: { fl: 232, h: 340 }, r_dis3_0: { fl: 345, h: 512, blk: [[0.68, 1]] },
  };
  // 사람 자리 (가로 비율, 바닥 첫 줄에서 몇 줄 아래)
  const STAGE_NPC = { cmd: [['johanna', 0.6, 0], ['marie', 0.3, 1], ['labiata', 0.76, 1]], shop: [['fortune', 0.5, 0], ['pupphead', 0.26, 1], ['coco', 0.72, 1]], cafe: [['amy', 0.22, 1], ['scathy', 0.8, 1]] };
  function stageRoom(k, name, bgPath, tint, props) {
    const key = bgPath.replace('town/', ''), st = STAGE[key] || { fl: 340, h: 512 };
    const W = st.w || 20, sc = (W * TILE) / 1024, top0 = st.fl * sc, floorH = Math.max((st.h - st.fl) * sc, TILE * 3.3, TILE * 8.8 - top0); // 위아래 검은 띠 없이 화면을 채운다
    const H = Math.ceil((top0 + floorH) / TILE), off = H * TILE - (top0 + floorH);
    const r0 = Math.min(H - 2, Math.ceil((off + top0) / TILE + 0.45));
    const blocked = (x) => x < 1 || x > W - 2 || (st.blk || []).some(([a, b]) => (x + 0.5) / W > a && (x + 0.5) / W < b);
    const rows = [];
    for (let y = 0; y < H; y++) { let r = ''; for (let x = 0; x < W; x++) r += y < r0 || x < 1 || x > W - 2 || (blocked(x) && y < H - 1) ? '#' : 'M'; rows.push(r); } // 큰 기계 앞 맨 아래 줄은 지나갈 수 있다 (방이 둘로 갈리지 않게)
    const mid = Math.floor(W / 2), mx = blocked(mid) ? [...Array(W).keys()].filter((x) => !blocked(x)).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0] : mid;
    const used = [];
    const free0 = (x) => { for (let d = 0; d < W; d++) for (const s of [1, -1]) { const t = x + d * s; if (t > 0 && t < W - 1 && !blocked(t) && t !== mx) return t; } return x; };
    const free = (x) => { for (let d = 0; d < W; d++) for (const sg of [1, -1]) { const t = x + d * sg; if (t > 0 && t < W - 1 && !blocked(t) && Math.abs(t - mx) > 0 && used.every((u) => Math.abs(u - t) >= 2)) { used.push(t); return t; } } return free0(x); };
    const objects = [{ t: 'exit', x: mx, y: H - 1, w: 1, h: 1, to: 'back' }, ...STAGE_NPC[k].map(([id, fx, dy]) => ({ t: 'npc', id, x: free(Math.round(fx * W)), y: Math.min(H - 2, r0 + dy), dir: fx > 0.5 ? -1 : 1 }))];
    for (const [art, fx, dy, w, hh, lit] of props || []) { const x = Math.max(1, Math.round(fx * W)), y = Math.min(H - 2, r0 + dy); if (x === mx || objects.some((o) => o.t === 'npc' && o.x >= x && o.x < x + w && o.y === y)) continue; objects.push({ t: 'deco', art, x, y, w, h: 1, hh, block: 1, lit }); }
    return { name, rows, indoor: 1, stage: { bg: bgPath, fl: st.fl, h: st.h, sc, top0, floorH, off, back: st.back }, bg: bgPath, tint, spawn: [mx, H - 2], objects };
  }
  // 방 안 분위기 (장별): 어둠, 어둠 빛깔, 사령관 둘레 등불, 떠다니는 것
  const ROOMATMO = { works: { dark: 0.12, darkC: '30,18,8', torch: 1, fx: 'dust' }, camp: { dark: 0.14, darkC: '30,22,10', torch: 1, fx: 'dust' }, sewer: { dark: 0.5, darkC: '4,12,16', torch: 1, fx: 'drip', tint: '#b4c6cc' }, station: { dark: 0.25, darkC: '6,12,22', torch: 1, fx: 'dust' }, port: { dark: 0.1, darkC: '10,20,30', torch: 1, fx: 'dust' }, snow: { dark: 0.28, darkC: '40,22,8', torch: 1, fx: 'dust', tint: '#ffd6a8' } };
  const ROOMBG0 = { cmd: 'town/r_train_0', shop: 'town/r_dis2_0', cafe: 'town/r_cafe4_0' }; // 1장
  function baseFor(look, name) {
    const m = TOWNMAPS[look] || TOWNMAPS.coast, R = m.rooms;
    for (const k of ['cmd', 'shop', 'cafe']) MAPS[k] = Object.assign(R ? stageRoom(k, R[k].label, R[k].bg, R[k].tint, PROPS[R[k].label]) : stageRoom(k, ROOMNAME0[k], ROOMBG0[k], undefined, PROPS[ROOMNAME0[k]]), ROOMATMO[look] || {});
    const objects = m.objects.map((o) => (o.t === 'building' ? Object.assign({}, o, { label: R ? R[o.to[0]].label : ROOMNAME0[o.to[0]] }) : o));
    return Object.assign({}, m, { name: name || '마을', bgm: 'lo_town', objects });
  }
  let backTo = null; // 방에서 나가면 돌아갈 자리 (들어간 건물 문 앞)
  // 실내 방 그림: 원작 방 배경의 위쪽(뒷벽)과 아래쪽(바닥)을 나눠 쓴다 (라켓몬스터와 같은 방식)
  const ROOMWALL = { cmd: ['#5d6580', '#a3abc6'], shop: ['#6b5b62', '#b8a2ab'], cafe: ['#8f877a', '#ece7de'] };

  // ── 상태 ──────────────────────────────────────────────
  let cv = null, ctx = null, hud = null, map = null, layer = null, open = false, done = null, opts = null;
  let look = 'coast'; // 마을 모습 (환경음 고르기)
  let px = 0, py = 0, pfx = 0, pfy = 0, dir = 1, path = [], moving = 0, busy = false, fade = 0, fadeTo = 0, pendingWarp = null, onArrive = null;
  let hold = null; // 처음 들어갈 때 그림 기다리기
  let ents = [], blocks = null, S = 1, camX = 0, camY = 0, T = 0, banner = 0;
  const player = { id: 'commander', face: 'up', anim: 0 }; // 사령관: SD 리그가 아니라 js/commander.js 로 그린다

  // ── SD 그리기: 화면 밖 WebGL 한 장에 칸별로 ──
  const SDF = { CW: 380, CH: 420, NH: 210, COLS: 6, // NH: 몸 높이 기준 칸. 위로 든 창·날개는 CH 남는 자리에 그린다
    // 칸이 좁으면 긴 무기·날개가 잘려 보인다
    R: null, scene: null, cam: null, c: null };
  function sdInit() {
    if (SDF.R) return;
    SDF.c = document.createElement('canvas');
    SDF.R = new THREE.WebGLRenderer({ canvas: SDF.c, alpha: true, antialias: true, premultipliedAlpha: false });
    SDF.R.setPixelRatio(1);
    SDF.R.setSize(SDF.COLS * SDF.CW, 2 * SDF.CH, false);
    SDF.R.setClearColor(0x000000, 0);
    SDF.scene = new THREE.Scene();
    SDF.cam = new THREE.OrthographicCamera(0, SDF.COLS * SDF.CW, 2 * SDF.CH, 0, -1000, 1000);
  }
  // who: {id, sd, anim, flip} -> 칸 번호
  function sdRender(list, dt) {
    const R = SDF.R; if (!R) return;
    list.forEach((e, i) => {
      if (!e.sd && window.SD && SD.ready(e.id)) { e.sd = SD.create(e.id); e.sd.hideNodes(/^(taget|target|AP|bullet|wave_1|bufIcon|buffIcon|skill_bubble|skilconfirm|3DFX_.*)$/i); e.sd.play('idle', null, true); // 전투용 조준·버프 표시는 마을에서 숨긴다
        e.sd.time = Math.random() * 2; e.sdAnim = 'idle'; }
      const c = e.sd; if (!c) return;
      const anim = e.walk ? 'move' : 'idle';
      if (e.sdAnim !== anim && c.has(anim)) { c.play(anim, null, true); e.sdAnim = anim; }
      c.update(dt);
      // 조종 손잡이(이름이 _CTRL 로 끝나는 뼈)에 붙은 빨간 조준 고리 그림은 끈다 (그 아래 몸은 그대로)
      if (!e.mute) { const N = c.tpl.data.nodes; e.mute = c.tpl.rends.map((r, k) => (N[r.node] && /_CTRL$/.test(N[r.node].n) ? k : -1)).filter((k) => k >= 0); }
      for (const k of e.mute) c.rEn[k] = 0;
      const t = c.tpl, bw = Math.max(t.box.max.x - t.box.min.x, 0.01);
      const k = Math.min((SDF.NH - 26) / Math.min(Math.max(t.height, 0.01), 10.5) * (e.big ? 0.95 : 0.8), (SDF.CW - 10) / bw); // 창을 높이 든 동료(라비아타)도 몸 크기는 같게
      const col = i % SDF.COLS, row = Math.floor(i / SDF.COLS);
      const cx = col * SDF.CW + SDF.CW / 2, by = (1 - row) * SDF.CH + 8;
      const f = e.flip ? -1 : 1;
      c.root.scale.set(k * f, k, 1);
      const mid = ((t.box.min.x + t.box.max.x) / 2) * k;
      c.root.position.set(cx - mid * f, by - t.box.min.y * k, 0);
      if (!c.root.parent) SDF.scene.add(c.root);
      c.root.visible = true;
      e.slot = { sx: col * SDF.CW, sy: row * SDF.CH };
      e.head = Math.min(t.height, 10.5) * k * (TILE * 2.2) / SDF.NH; // 발에서 머리 꼭대기까지 (화면 픽셀)
    });
    R.render(SDF.scene, SDF.cam);
    list.forEach((e) => { if (e.sd) e.sd.root.visible = false; });
  }
  function sdDraw(e, X, Y) { // 발 위치 (X, Y)
    if (!e.slot || !e.sd) return false;
    const w = SDF.CW, h = SDF.CH, s = (TILE * 2.2) / SDF.NH;
    ctx.drawImage(SDF.c, e.slot.sx, e.slot.sy, w, h, X - (w * s) / 2, Y - h * s + 8 * s, w * s, h * s);
    return true;
  }

  // ── 불러오기 ───────────────────────────────────────────
  function loadMap(id, x, y) {
    map = Object.assign({ id }, MAPS[id]);
    const H = map.rows.length, W = map.rows[0].length;
    map.w = W; map.h = H;
    blocks = [];
    for (let yy = 0; yy < H; yy++) { blocks.push([]); for (let xx = 0; xx < W; xx++) { const c = map.rows[yy][xx]; blocks[yy].push(c === '~' || c === '#' || c === 'b' || c === 'r'); } }
    // 사람: 합류한 동료만 (opts.present)
    ents = [];
    for (const o of map.objects) {
      if (o.t === 'building') { for (let yy = o.y; yy < o.y + o.h; yy++) for (let xx = o.x; xx < o.x + o.w; xx++) if (!(xx === o.door && yy === o.y + o.h - 1)) blocks[yy][xx] = true; }
      if (o.t === 'deco' && o.block) {
        if (o.cells) for (const [dx, dy] of o.cells) blocks[o.y + dy][o.x + dx] = true;
        else for (let yy = o.y; yy < o.y + o.h; yy++) for (let xx = o.x; xx < o.x + o.w; xx++) blocks[yy][xx] = true;
      }
      if (o.t === 'npc' && opts.present(o.id)) ents.push({ id: o.id, x: o.x, y: o.y, flip: o.dir < 0, big: o.id === 'pupphead' || o.id === 'fallen' });
    }
    px = pfx = x; py = pfy = y; path = []; moving = 0;
    layer = buildLayer();
    initLights(); initFx();
    // 그림이 아직 안 왔으면 오는 대로 바닥을 다시 그린다
    const F = map.floor || {};
    let need = map.indoor ? [img(map.bg)] : [...new Set([F.base || 'tiles/grass', F.zone || 'tiles/asphalt', F.path || 'tiles/asphalt', F.wall || 'tiles/grass'])].map(img);
    for (const b of map.back || []) img(b.art);
    for (const o of map.objects) if (o.t === 'decal') need.push(img(o.art));
    need.filter((im) => !ok(im)).forEach((im) => im.addEventListener('load', () => { if (map && map.id === id) layer = buildLayer(); }, { once: true }));
    banner = 2.4;
    hud.querySelector('.tn-name').textContent = map.name;
    if (window.SD) for (const e of ents) SD.prepare(e.id);
    if (map.bgm) AU.bgm(map.bgm);
    AU.amb(map.indoor ? null : look === 'coast' || look === 'sewer' ? 'lo_amb_wave' : 'lo_amb_wind', look === 'coast' ? 0.3 : look === 'sewer' ? 0.14 : 0.22); // 바깥은 원작 파도·바람 소리, 방 안은 조용히
  }

  // 바닥 미리 그리기 (원작 손그림 질감: assets/tiles)
  function buildLayer() {
    const W = map.w * TILE, H = map.h * TILE;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    if (map.stage) { drawStage(g); return c; }
    if (map.indoor) { drawRoomFloor(g); return c; }
    const pat = (n, sc = 0.75, ox = 0, oy = 0, rot = 0) => { const im = img(n); if (!ok(im)) return '#6a8a4a'; const p = g.createPattern(im, 'repeat'); p.setTransform(new DOMMatrix().translate(ox, oy).rotate(rot).scale(sc)); return p; };
    // 같은 질감이 바둑판처럼 되풀이되어 보이지 않게: 크기·각도를 달리한 같은 질감을 큰 얼룩 모양으로 군데군데 겹치고, 넓은 명암 물결을 은은하게 깐다
    const breakTiling = (n) => {
      const m = document.createElement('canvas'); m.width = Math.ceil(W / 24); m.height = Math.ceil(H / 24);
      const mg = m.getContext('2d'), id = mg.createImageData(m.width, m.height), Dd = id.data;
      for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
        const v = vnoise(x / 7, y / 7, 31) * 0.65 + vnoise(x / 3, y / 3, 37) * 0.35, a = Math.max(0, Math.min(1, (v - 0.45) * 3));
        const i = (y * m.width + x) * 4; Dd[i] = Dd[i + 1] = Dd[i + 2] = 255; Dd[i + 3] = a * 255;
      }
      mg.putImageData(id, 0, 0);
      const l = document.createElement('canvas'); l.width = W; l.height = H;
      const lg = l.getContext('2d'); lg.fillStyle = pat(n, 0.93, 137, 71, 90); lg.fillRect(0, 0, W, H);
      lg.globalCompositeOperation = 'destination-in'; lg.imageSmoothingEnabled = true; lg.drawImage(m, 0, 0, W, H);
      g.globalAlpha = 0.75; g.drawImage(l, 0, 0); g.globalAlpha = 1;
      const sh = document.createElement('canvas'); sh.width = Math.ceil(W / 24); sh.height = Math.ceil(H / 24); // 넓은 명암 물결 (작게 그려 부드럽게 늘린다)
      const sg = sh.getContext('2d'), sd = sg.createImageData(sh.width, sh.height), Q = sd.data;
      for (let y = 0; y < sh.height; y++) for (let x = 0; x < sh.width; x++) {
        const v = vnoise(x / 11, y / 11, 53) - 0.5, i = (y * sh.width + x) * 4;
        if (v > 0) { Q[i] = 255; Q[i + 1] = 250; Q[i + 2] = 235; Q[i + 3] = v * 0.1 * 255; } else { Q[i] = 10; Q[i + 1] = 12; Q[i + 2] = 16; Q[i + 3] = -v * 0.14 * 255; }
      }
      sg.putImageData(sd, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(sh, 0, 0, W, H);
    };
    // 칸 모양 바닥 층: 칸 값(있다 1, 없다 0)을 부드럽게 이어 붙인 뒤 잡음을 섞어 경계를 자연스럽게 흔든다.
    // 네모 칸이나 같은 무늬의 물결이 드러나지 않는다. 6픽셀마다 한 점씩 계산한 작은 그림을 부드럽게 늘려 쓴다.
    const hash = (x, y, k) => { const v = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453; return v - Math.floor(v); };
    const sstep = (t) => t * t * (3 - 2 * t);
    const vnoise = (x, y, k) => { // 값 잡음 0~1
      const xi = Math.floor(x), yi = Math.floor(y), fx = sstep(x - xi), fy = sstep(y - yi);
      const a = hash(xi, yi, k), b = hash(xi + 1, yi, k), c = hash(xi, yi + 1, k), d = hash(xi + 1, yi + 1, k);
      return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
    };
    const STEP = 6, SW = Math.ceil(W / STEP), SH = Math.ceil(H / STEP);
    let layerNo = 0;
    const layerOf = (test, fill, blur, crisp) => {
      layerNo++;
      const at = (x, y) => (test(map.rows[Math.max(0, Math.min(map.h - 1, y))][Math.max(0, Math.min(map.w - 1, x))]) ? 1 : 0);
      const m = document.createElement('canvas'); m.width = SW; m.height = SH;
      const mg = m.getContext('2d'), id = mg.createImageData(SW, SH), D = id.data;
      const amp = crisp ? 0 : Math.min(0.36, Math.max(0.26, blur / TILE)), soft = crisp ? 0.025 : 0.06 + Math.min(0.2, (blur / TILE) * 0.35);
      for (let py = 0; py < SH; py++) for (let px = 0; px < SW; px++) {
        const u = ((px + 0.5) * STEP) / TILE - 0.5, v = ((py + 0.5) * STEP) / TILE - 0.5;
        const xi = Math.floor(u), yi = Math.floor(v), fx = sstep(u - xi), fy = sstep(v - yi);
        const c00 = at(xi, yi), c10 = at(xi + 1, yi), c01 = at(xi, yi + 1), c11 = at(xi + 1, yi + 1);
        let val = (c00 + (c10 - c00) * fx) * (1 - fy) + (c01 + (c11 - c01) * fx) * fy;
        if (val > 0 && val < 1 && amp > 0) { // 경계 근처만 흔든다
          const n = (vnoise(u * 0.9, v * 0.9, layerNo) - 0.5) * 0.75 + (vnoise(u * 2.3, v * 2.3, layerNo + 9) - 0.5) * 0.35;
          val += n * amp * 2;
        }
        const al = Math.max(0, Math.min(1, (val - (0.5 - soft)) / (2 * soft)));
        const i = (py * SW + px) * 4; D[i] = D[i + 1] = D[i + 2] = 255; D[i + 3] = Math.round(sstep(al) * 255);
      }
      mg.putImageData(id, 0, 0);
      const l = document.createElement('canvas'); l.width = W; l.height = H;
      const lg = l.getContext('2d'); lg.fillStyle = fill; lg.fillRect(0, 0, W, H);
      lg.globalCompositeOperation = 'destination-in'; lg.imageSmoothingEnabled = true; lg.imageSmoothingQuality = 'high'; lg.drawImage(m, 0, 0, W, H);
      g.drawImage(l, 0, 0);
    };
    const F = map.floor || {}, sea = map.water === 'sea';
    g.fillStyle = pat(F.base || 'tiles/grass'); g.fillRect(0, 0, W, H);
    breakTiling(F.base || 'tiles/grass');
    g.globalAlpha = F.zoneA || 1;
    layerOf((t) => t === 's' || (sea && t === '~'), pat(F.zone || 'tiles/asphalt', 0.9), TILE * 0.35);
    g.globalAlpha = 1;
    g.globalAlpha = F.pathA || 1;
    layerOf((t) => t === '_', pat(F.path || 'tiles/asphalt'), TILE * 0.12, F.crisp);
    g.globalAlpha = 1;
    if (F.pathTint) layerOf((t) => t === '_', F.pathTint, TILE * 0.12, F.crisp);
    if (F.lane) { // 차선: 길 한가운데 끊어진 노란 줄
      g.fillStyle = F.lane;
      for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
        const r = map.rows[y]; if (r[x] !== '_') continue;
        const up = map.rows[y - 1] && map.rows[y - 1][x] === '_', dn = map.rows[y + 1] && map.rows[y + 1][x] === '_', L = r[x - 1] === '_', Rt = r[x + 1] === '_';
        if (L && Rt && !up && !dn && x % 2 === 0) g.fillRect(x * TILE + 6, y * TILE + TILE / 2 - 2, TILE - 12, 4);
        if (up && dn && Rt && !L && y % 2 === 0) g.fillRect((x + 1) * TILE - 2, y * TILE + 6, 4, TILE - 12);
      }
    }
    for (const o of map.objects) if (o.t === 'decal') { // 바닥 무늬
      const im = img(o.art); if (!ok(im)) continue;
      const dw = o.w * TILE, dh = (im.naturalHeight * dw) / im.naturalWidth;
      g.globalAlpha = o.a; g.drawImage(im, o.x * TILE, o.y * TILE + TILE / 2 - dh / 2, dw, dh); g.globalAlpha = 1;
    }
    if (map.rows.some((r) => r.includes('#'))) { // 벼랑·잔해·덤불: 거친 질감을 어둡게
      layerOf((t) => t === '#', pat(F.wall || F.base || 'tiles/grass', 0.6), TILE * 0.25);
      layerOf((t) => t === '#', `rgba(8,10,14,${F.wallDark != null ? F.wallDark : 0.3})`, TILE * 0.3);
    }
    if (map.water === 'sea') {
      const sg = g.createLinearGradient(0, 0, 0, TILE * 3);
      sg.addColorStop(0, '#1f5f93'); sg.addColorStop(1, '#3a8fc0');
      layerOf((t) => t === '~', sg, TILE * 0.18);
    } else if (map.water === 'canal') { // 지하 수로: 콘크리트 턱 + 짙은 청록 물
      layerOf((t) => t === '~', '#6d7a80', TILE * 0.04);
      const rows = map.rows.map((r, y) => (r.includes('~') ? y : -1)).filter((y) => y >= 0), y0 = rows[0] * TILE, y1 = (rows[rows.length - 1] + 1) * TILE;
      const wg = g.createLinearGradient(0, y0, 0, y1); wg.addColorStop(0, '#0a1c22'); wg.addColorStop(1, '#14414a');
      g.fillStyle = wg; g.fillRect(0, y0, W, y1 - y0 - 8);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y0, W, 10);
    }
    if (map.rows.some((r) => r.includes('b'))) layerOf((t) => t === 'b', F.back || '#222', 2);
    if (map.edgeLine != null) { // 승강장 끝: 노란 점자 블록 띠
      const y0 = map.edgeLine * TILE + 4;
      g.fillStyle = '#c9a42a'; g.fillRect(0, y0, W, 14);
      g.fillStyle = 'rgba(255,230,140,.55)'; for (let x = 4; x < W; x += 9) for (let k = 0; k < 2; k++) { g.beginPath(); g.arc(x, y0 + 4 + k * 6, 1.6, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y0 + 14, W, 3);
    }
    // 가장자리 어둡게
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.28)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    return c;
  }
  // 방 바닥·옆벽 (원작 방 그림의 바닥 부분을 방 크기에 맞춰)
  function drawRoomFloor(g) {
    const im = img(map.bg), mw = map.w * TILE, mh = map.h * TILE, y1 = 2 * TILE + 6, y2 = mh - TILE + 4, fx0 = TILE - 14, fx1 = mw - TILE + 14;
    g.fillStyle = '#05070c'; g.fillRect(0, y1, mw, mh - y1); // 뒷벽 자리(위 두 줄)는 비워 둔다
    // 바닥은 원작 방 그림 바닥 가운데의 깨끗한 부분만 늘려 깐다 (옆벽의 서버장·경사로가 늘어지거나 잘려 보이지 않게).
    // 방 그림 전체를 뒷벽으로 쓰는 방(floorTex)은 바닥 질감을 따로 깐다
    const ft = map.floorTex && img(map.floorTex);
    if (ft && ok(ft)) { const p = g.createPattern(ft, 'repeat'); p.setTransform(new DOMMatrix().scale(0.5)); g.fillStyle = p; g.fillRect(fx0, y1, fx1 - fx0, y2 - y1); }
    else if (ok(im)) g.drawImage(im, im.width * 0.46, map.fl + 6, im.width * 0.36, im.height - map.fl - 6, fx0, y1, fx1 - fx0, y2 - y1);
    const sg = g.createLinearGradient(0, y1, 0, y1 + 60); sg.addColorStop(0, 'rgba(0,0,0,0.25)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sg; g.fillRect(fx0, y1, fx1 - fx0, 60);
    g.fillStyle = 'rgba(20,22,28,.55)'; g.fillRect(fx0, y1, fx1 - fx0, 5); // 걸레받이: 벽과 바닥이 만나는 선
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) { const lx = mw * (0.22 + i * 0.28), ly = y1 + (y2 - y1) * 0.35; const rg = g.createRadialGradient(lx, ly, 10, lx, ly, mw * 0.2); rg.addColorStop(0, 'rgba(255,255,240,0.12)'); rg.addColorStop(1, 'rgba(255,255,240,0)'); g.fillStyle = rg; g.fillRect(lx - mw * 0.2, ly - mw * 0.2, mw * 0.4, mw * 0.4); }
    g.restore();
    const wc = map.wall || ROOMWALL[map.id] || ['#55606e', '#8a95a3'];
    for (const side of [0, 1]) {
      const ex = side ? fx1 : fx0, d = side ? -1 : 1;
      g.fillStyle = wc[0]; g.beginPath(); g.moveTo(ex, y1); g.lineTo(ex + d * 4, y1); g.lineTo(ex + d * 30, y2); g.lineTo(ex, y2); g.closePath(); g.fill();
    }
    // 아래 벽과 문 매트
    g.fillStyle = wc[0]; g.fillRect(0, y2, mw, mh - y2);
    const dx = Math.floor(map.w / 2) * TILE;
    g.fillStyle = 'rgba(40,34,28,.9)'; g.fillRect(dx + 6, y2 - 4, TILE - 12, TILE - 8);
    g.fillStyle = '#e8c547'; g.fillRect(dx + 6, y2 - 4, TILE - 12, 3);
  }
  // 방 그림 한 장: 뒷벽은 비율 그대로, 바닥은 걸을 자리만큼 세로로 늘린다. 문 자리(아래 가운데)에 문 매트
  function drawStage(g) {
    const st = map.stage, im = img(st.bg), mw = map.w * TILE, mh = map.h * TILE;
    g.fillStyle = '#05070c'; g.fillRect(0, 0, mw, mh);
    if (st.back) { g.fillStyle = st.back; g.fillRect(0, st.off, mw, st.top0); } // 그림의 뚫린 창·하늘 자리
    else { const cg = g.createLinearGradient(0, st.off, 0, st.off + st.top0); cg.addColorStop(0, '#0d1118'); cg.addColorStop(1, '#3a4250'); g.fillStyle = cg; g.fillRect(0, st.off, mw, st.top0); } // 뚫린 문 너머: 불 켜진 복도처럼 흐린 빛
    if (ok(im)) {
      const k = im.width / 1024;
      g.drawImage(im, 0, st.fl * k, im.width, (st.h - st.fl) * k, 0, st.off + st.top0, mw, st.floorH);
      g.drawImage(im, 0, 0, im.width, st.fl * k + 2, 0, st.off, mw, st.top0 + 2 * st.sc); // 바닥과 2픽셀 겹쳐 이음선이 안 보이게
    }
    const sg = g.createLinearGradient(0, mh - TILE * 1.2, 0, mh); sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,.35)');
    g.fillStyle = sg; g.fillRect(0, mh - TILE * 1.2, mw, TILE * 1.2);
    const ex = map.objects.find((o) => o.t === 'exit'), dx = (ex ? ex.x : Math.floor(map.w / 2)) * TILE, ey = mh - TILE + 8;
    const eg = g.createRadialGradient(dx + TILE / 2, ey + 18, 4, dx + TILE / 2, ey + 18, 46); eg.addColorStop(0, 'rgba(255,214,120,.35)'); eg.addColorStop(1, 'rgba(255,214,120,0)');
    g.fillStyle = eg; g.fillRect(dx - 30, ey - 30, TILE + 60, 80);
    g.fillStyle = 'rgba(28,30,36,.9)'; g.beginPath(); g.ellipse(dx + TILE / 2, ey + 20, 20, 10, 0, 0, 7); g.fill(); // 바닥 해치
    g.strokeStyle = 'rgba(232,197,71,.9)'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#ffd86a'; for (let i = 0; i < 2; i++) { const yy = ey + 12 + i * 7; g.beginPath(); g.moveTo(dx + TILE / 2 - 7, yy); g.lineTo(dx + TILE / 2, yy + 5); g.lineTo(dx + TILE / 2 + 7, yy); g.lineTo(dx + TILE / 2 + 7, yy + 2); g.lineTo(dx + TILE / 2, yy + 7); g.lineTo(dx + TILE / 2 - 7, yy + 2); g.closePath(); g.fill(); } // 나가는 쪽 화살표
  }
  function drawRoomBack() {
    const im = img(map.bg); if (!ok(im)) return;
    const mw = map.w * TILE, rx = TILE - 14, rw = mw - TILE * 2 + 28, dh = (map.fl * rw) / im.width, y1 = 2 * TILE + 6;
    ctx.drawImage(im, 0, 0, im.width, map.fl, rx, y1 - dh, rw, dh);
    const g = ctx.createLinearGradient(0, y1, 0, y1 + 18); g.addColorStop(0, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(TILE, y1, mw - TILE * 2, 18);
  }

  // ── 그리기 ─────────────────────────────────────────────
  function drawDeco(o) {
    const X = o.x * TILE + (o.ox || 0), Y = o.y * TILE, w = o.w * TILE, h = o.h * TILE;
    if (o.kind === 'lighthouse') return drawLighthouse(X + w / 2, Y + h);
    if (o.kind === 'fire') return drawFire(X + w / 2, Y + h - 10);
    const im = img(o.art); if (!ok(im)) return;
    const dh = TILE * (o.hh || 1.6), dw = (im.naturalWidth * dh) / im.naturalHeight;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(X + w / 2, Y + h - 4, Math.max(dw, w) * 0.42, 8, 0, 0, 7); ctx.fill();
    if (o.flip) { ctx.save(); ctx.translate(X + w / 2, 0); ctx.scale(-1, 1); ctx.drawImage(im, -dw / 2, Y + h - dh, dw, dh); ctx.restore(); }
    else ctx.drawImage(im, X + w / 2 - dw / 2, Y + h - dh, dw, dh);
  }
  // 모닥불: 둘레 돌, 엇갈린 장작, 겹겹이 흔들리는 불꽃 (불티는 fx 가 날린다)
  function drawFire(cx, by) {
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(cx, by + 2, 26, 9, 0, 0, 7); ctx.fill();
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; ctx.fillStyle = i % 2 ? '#6f6a66' : '#8a847d'; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * 20, by + Math.sin(a) * 7, 6, 4.5, 0, 0, 7); ctx.fill(); }
    ctx.lineCap = 'round';
    for (const [r, c] of [[0.5, '#4a2c18'], [-0.5, '#5a3820'], [0.05, '#3f2514']]) { ctx.strokeStyle = c; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx - Math.cos(r) * 17, by - 1 - Math.sin(r) * 6); ctx.lineTo(cx + Math.cos(r) * 17, by - 1 + Math.sin(r) * 6); ctx.stroke(); }
    const flame = (w, h, col, ph) => {
      const sway = Math.sin(T * 9 + ph) * w * 0.25, hh = h * (0.85 + Math.sin(T * 13 + ph * 2) * 0.15);
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(cx - w, by - 3);
      ctx.quadraticCurveTo(cx - w * 0.9, by - hh * 0.55, cx + sway, by - hh);
      ctx.quadraticCurveTo(cx + w * 0.9, by - hh * 0.55, cx + w, by - 3); ctx.closePath(); ctx.fill();
    };
    flame(15, 46, 'rgba(232,70,18,.92)', 0); flame(11, 36, 'rgba(255,150,30,.95)', 1.7); flame(6, 24, 'rgba(255,236,150,1)', 3.1);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const rg = ctx.createRadialGradient(cx, by - 18, 2, cx, by - 18, 40); rg.addColorStop(0, 'rgba(255,170,80,.35)'); rg.addColorStop(1, 'rgba(255,170,80,0)');
    ctx.fillStyle = rg; ctx.fillRect(cx - 40, by - 58, 80, 80);
    ctx.restore();
  }
  function drawLighthouse(cx, by) { // 등대 (원작에 맞는 그림이 없어 직접): 돌 받침, 흰·빨강 띠 탑에 둥근 음영, 난간, 돌아가는 불빛
    const h = TILE * 4.2, w0 = TILE * 1.25, w1 = TILE * 0.78;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(cx + 18, by - 2, w0, 13, 0, 0, 7); ctx.fill();
    // 돌 받침
    ctx.fillStyle = '#7c7468'; ctx.beginPath(); ctx.ellipse(cx, by - 6, w0 * 0.72, 10, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#958c7f'; ctx.fillRect(cx - w0 * 0.72, by - 22, w0 * 1.44, 16);
    ctx.fillStyle = '#a99f91'; ctx.beginPath(); ctx.ellipse(cx, by - 22, w0 * 0.72, 9, 0, 0, 7); ctx.fill();
    const base = by - 22, hh = h - 22;
    for (let i = 0; i < 6; i++) {
      const y0 = base - (hh * i) / 6, y1 = base - (hh * (i + 1)) / 6, a = w0 + ((w1 - w0) * i) / 6, b = w0 + ((w1 - w0) * (i + 1)) / 6;
      const gr = ctx.createLinearGradient(cx - a / 2, 0, cx + a / 2, 0);
      if (i % 2) { gr.addColorStop(0, '#e05a4c'); gr.addColorStop(0.55, '#c3392f'); gr.addColorStop(1, '#7e2019'); } else { gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.55, '#e6e0d4'); gr.addColorStop(1, '#a9a297'); }
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(cx - a / 2, y0); ctx.lineTo(cx + a / 2, y0); ctx.lineTo(cx + b / 2, y1); ctx.lineTo(cx - b / 2, y1); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#3a3f48'; ctx.fillRect(cx - 5, base - hh * 0.42, 10, 14); // 작은 창
    const ty = by - h;
    // 난간 발코니
    ctx.fillStyle = '#2b2f36'; ctx.fillRect(cx - w1 / 2 - 9, ty - 4, w1 + 18, 6);
    ctx.strokeStyle = '#2b2f36'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx - w1 / 2 - 9, ty - 12); ctx.lineTo(cx + w1 / 2 + 9, ty - 12); ctx.stroke();
    for (let x = -w1 / 2 - 8; x <= w1 / 2 + 8; x += 6) { ctx.beginPath(); ctx.moveTo(cx + x, ty - 12); ctx.lineTo(cx + x, ty - 4); ctx.stroke(); }
    const glow = 0.7 + Math.sin(T * 2.4) * 0.2;
    ctx.fillStyle = `rgba(255,232,150,${glow})`; ctx.fillRect(cx - w1 / 2 + 5, ty - 34, w1 - 10, 22);
    ctx.strokeStyle = '#2b2f36'; ctx.lineWidth = 2; for (const f of [-0.2, 0.2]) { ctx.beginPath(); ctx.moveTo(cx + w1 * f, ty - 34); ctx.lineTo(cx + w1 * f, ty - 12); ctx.stroke(); }
    ctx.fillStyle = '#c3392f'; ctx.beginPath(); ctx.moveTo(cx - w1 / 2 - 4, ty - 34); ctx.quadraticCurveTo(cx, ty - 62, cx + w1 / 2 + 4, ty - 34); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2b2f36'; ctx.fillRect(cx - 1.5, ty - 66, 3, 8);
    // 돌아가는 불빛 줄기
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const ang = T * 0.9, len = 260, ly = ty - 23;
    for (const dir of [0, Math.PI]) {
      const a = ang + dir, gx = Math.cos(a), gy = Math.sin(a) * 0.35;
      const bg = ctx.createLinearGradient(cx, ly, cx + gx * len, ly + gy * len); bg.addColorStop(0, `rgba(255,236,170,${0.32 * glow})`); bg.addColorStop(1, 'rgba(255,236,170,0)');
      ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(cx, ly); ctx.lineTo(cx + gx * len - gy * 60, ly + gy * len + gx * 21); ctx.lineTo(cx + gx * len + gy * 60, ly + gy * len - gx * 21); ctx.closePath(); ctx.fill();
    }
    const rg = ctx.createRadialGradient(cx, ly, 4, cx, ly, 70); rg.addColorStop(0, `rgba(255,220,140,${glow * 0.5})`); rg.addColorStop(1, 'rgba(255,220,140,0)');
    ctx.fillStyle = rg; ctx.fillRect(cx - 70, ly - 70, 140, 140); ctx.restore();
  }
  // 어두운 곳의 밝은 건물 그림은 미리 그늘을 입혀 둔다 (캔버스 filter 는 무시되는 브라우저가 있어 직접 칠한다)
  const DIM = new Map();
  function dimmed(im, a) {
    const key = im.src + a; if (DIM.has(key)) return DIM.get(key);
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(10,22,28,${a})`; g.fillRect(0, 0, c.width, c.height);
    DIM.set(key, c); return c;
  }
  function drawBuilding(b) {
    const im = img(b.art), w = b.w * TILE, base = (b.y + b.h) * TILE + 6;
    if (ok(im)) {
      let dw = w * 1.1, dh = (im.naturalHeight * dw) / im.naturalWidth;
      const maxH = (b.h + 2.6) * TILE; if (dh > maxH) { dw *= maxH / dh; dh = maxH; }
      const x = b.x * TILE + w / 2 - dw / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.26)'; ctx.beginPath(); ctx.ellipse(x + dw / 2, base - 4, dw * 0.5, 12, 0, 0, 7); ctx.fill();
      if (b.plinth !== 0) { // 바닥 받침 (1장 기지 건물)
        ctx.fillStyle = '#a89f8c'; ctx.fillRect(x - 8, base - 8, dw + 16, 14);
        ctx.fillStyle = '#cfc6b4'; ctx.fillRect(x - 8, base - 12, dw + 16, 10);
      }
      ctx.drawImage(b.dim ? dimmed(im, b.dim) : im, x, base - dh, dw, dh);
    }
    // 문: 불빛 + 매트
    const dx = b.door * TILE, by = base - 6;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gc = b.glow || '255,226,160', lg = ctx.createRadialGradient(dx + 24, by, 4, dx + 24, by, 44); lg.addColorStop(0, `rgba(${gc},0.4)`); lg.addColorStop(1, `rgba(${gc},0)`);
    ctx.fillStyle = lg; ctx.fillRect(dx - 24, by - 40, 96, 80); ctx.restore();
    ctx.fillStyle = 'rgba(40,34,28,0.85)'; ctx.fillRect(dx + 9, by + 4, 30, 8); ctx.fillStyle = '#e8c547'; ctx.fillRect(dx + 9, by + 4, 30, 2);
    // 이름표
    const cx = dx + TILE / 2, cy = base - 6 - TILE * 2.2;
    ctx.font = "700 13px 'LO_B', sans-serif"; const tw = ctx.measureText(b.label).width + 20;
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(cx - tw / 2 + 2, cy - 10, tw, 22);
    ctx.fillStyle = '#ffcc00'; ctx.fillRect(cx - tw / 2, cy - 12, tw, 22);
    ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b.label, cx, cy);
  }
  function drawMarker(X, Y) { // 의뢰 표시 (머리 위 느낌표)
    const b = Math.sin(T * 4) * 4;
    ctx.font = "900 34px 'LO_B', sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 5; ctx.strokeStyle = '#3a2a00'; ctx.strokeText('!', X, Y - 8 + b);
    ctx.fillStyle = '#ffcc00'; ctx.fillText('!', X, Y - 8 + b);
  }
  // 뒷배경: 하늘(천장) 빛 + 원작 배경 그림 띠 (b 칸 위)
  function drawBack() {
    const B = map.back; if (!B && !map.sky) return;
    const mw = map.w * TILE, nb = map.rows.filter((r) => r.includes('b')).length;
    if (map.sky && nb) {
      const sg = ctx.createLinearGradient(0, -TILE, 0, nb * TILE); sg.addColorStop(0, map.sky[0]); sg.addColorStop(1, map.sky[1]);
      ctx.fillStyle = sg; ctx.fillRect(-TILE, -TILE * 4, mw + TILE * 2, nb * TILE + TILE * 4);
    }
    for (const L of B || []) {
      const im = img(L.art); if (!ok(im)) continue;
      const dh = L.h * TILE, dw = L.w ? L.w * TILE : (im.naturalWidth * dh) / im.naturalHeight, y = L.by * TILE - dh;
      ctx.globalAlpha = L.alpha || 1;
      const one = (x) => { if (L.flip) { ctx.save(); ctx.translate(x + dw / 2, 0); ctx.scale(-1, 1); ctx.drawImage(im, -dw / 2, y, dw, dh); ctx.restore(); } else ctx.drawImage(im, x, y, dw, dh); };
      if (L.repeat) { let i = 0; for (let x = ((mw / 2 - dw / 2) % dw) - dw; x < mw; x += dw - 1, i++) { if (L.mirror && i % 2) { ctx.save(); ctx.translate(x + dw / 2, 0); ctx.scale(-1, 1); ctx.drawImage(im, -dw / 2, y, dw, dh); ctx.restore(); } else one(x); } }
      else one(L.x * TILE - dw / 2);
      ctx.globalAlpha = 1;
    }
  }
  // 물결: 바다는 흰 물마루가 밀려오고, 수로는 빛 줄기가 흔들린다
  function drawWater(x0, y0, x1, y1) {
    if (!map.water) return;
    for (let y = Math.max(0, y0); y < Math.min(map.h, y1); y++) for (let x = Math.max(0, x0); x < Math.min(map.w, x1); x++) {
      if (map.rows[y][x] !== '~') continue;
      const X = x * TILE, Y = y * TILE, ph = T * 1.3 + x * 0.9 + y * 2.1;
      if (map.water === 'sea') {
        ctx.strokeStyle = `rgba(230,245,255,${0.18 + 0.16 * Math.sin(ph)})`; ctx.lineWidth = 2;
        const o = (T * 10 + x * 13) % TILE;
        ctx.beginPath(); ctx.moveTo(X + o - 14, Y + 26); ctx.quadraticCurveTo(X + o, Y + 20, X + o + 14, Y + 26); ctx.stroke();
        if ((x * 7 + y * 5 + Math.floor(T * 1.5)) % 11 === 0) { ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(X + 20, Y + 12, 2, 2); }
      } else {
        ctx.fillStyle = `rgba(120,220,230,${0.06 + 0.05 * Math.sin(ph)})`;
        ctx.fillRect(X + ((T * 14 + y * 17) % TILE) - 8, Y + 10 + 8 * Math.sin(ph * 0.7), 22, 2);
        ctx.fillRect(X + ((T * 9 + x * 11) % TILE), Y + 30, 14, 1.5);
      }
    }
  }
  // ── 빛 ── 어두운 마을은 그림자를 깔고 등불·결정·문 둘레만 밝힌다
  let lights = [], dk = null;
  function initLights() {
    lights = [];
    if (map.indoor && !map.stage) return;
    if (map.stage) { const ex = map.objects.find((o) => o.t === 'exit'); if (ex) lights.push({ x: ex.x * TILE + TILE / 2, y: (ex.y + 0.6) * TILE, r: 110, c: '255,214,150', fl: 0.1, ph: 1 });
      for (const o of map.objects) if (o.t === 'deco' && o.lit) lights.push({ x: (o.x + o.w / 2) * TILE, y: (o.y + o.h) * TILE - (o.hh || 1) * TILE * 0.5, r: o.lit[0], c: o.lit[1], fl: 0.15, ph: o.x }); return; }
    for (const o of map.objects) {
      if (o.t === 'deco' && o.lit) {
        const hh = o.kind === 'fire' ? 0.5 : o.art && o.art.includes('lamp') ? (o.hh || 2) * 0.88 : o.kind === 'lighthouse' ? 4.6 : (o.hh || 1.6) * 0.5;
        const lamp = !!(o.art && o.art.includes('lamp'));
        lights.push({ x: (o.x + o.w / 2) * TILE + (o.ox || 0) + (lamp ? TILE * 0.28 * (o.flip ? -1 : 1) : 0), y: (o.y + o.h) * TILE - hh * TILE, r: o.lit[0], c: o.lit[1], fl: o.kind === 'fire' ? 1 : 0.15, ph: o.x * 1.7 + o.y, lamp, gy: (o.y + o.h) * TILE - 6 });
      }
      if (o.t === 'building') lights.push({ x: o.door * TILE + TILE / 2, y: (o.y + o.h) * TILE - 4, r: o.lightR || 95, c: o.glow || '255,214,150', fl: 0.1, ph: o.x });
    }
    for (const [x, y, r, c] of map.lights || []) lights.push({ x: x * TILE + TILE / 2, y: y * TILE, r, c, fl: 0.05, ph: x });
  }
  function drawLights(vw, vh) {
    const a = map.dark || 0;
    if (!a) { drawGlows(vw, vh, 0); return; }
    const W = cv.width, H = cv.height;
    if (!dk || dk.width !== W || dk.height !== H) { dk = document.createElement('canvas'); dk.width = W; dk.height = H; }
    const g = dk.getContext('2d');
    g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W, H);
    g.fillStyle = `rgba(${map.darkC || '6,10,18'},${a})`; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r) => {
      const X = (x - camX) * S, Y = (y - camY) * S, R = r * S;
      if (X < -R || Y < -R || X > W + R || Y > H + R) return;
      const rg = g.createRadialGradient(X, Y, 0, X, Y, R); rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(0.45, 'rgba(0,0,0,.75)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(X - R, Y - R, R * 2, R * 2);
    };
    const fl = (L) => 1 + Math.sin(T * 11 + L.ph) * 0.3 * L.fl + Math.sin(T * 23 + L.ph * 3) * 0.18 * L.fl;
    for (const L of lights) hole(L.x, L.y, L.r * fl(L));
    if (map.torch) hole(pfx * TILE + TILE / 2, pfy * TILE - 6, 190);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(dk, 0, 0); ctx.restore();
    drawGlows(vw, vh, a);
  }
  // 빛깔: 더해 그리는 은은한 빛 + 등불 자체의 밝은 심지 (낮에도 켜진 등은 보인다)
  function drawGlows(vw, vh, a) {
    const fl = (L) => 1 + Math.sin(T * 11 + L.ph) * 0.3 * L.fl + Math.sin(T * 23 + L.ph * 3) * 0.18 * L.fl;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const L of lights) if (L.lamp && !(map.fx === 'snow')) {
      const c = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, 26); c.addColorStop(0, `rgba(${L.c},.9)`); c.addColorStop(0.25, `rgba(${L.c},.45)`); c.addColorStop(1, `rgba(${L.c},0)`);
      ctx.fillStyle = c; ctx.fillRect(L.x - 26, L.y - 26, 52, 52);
      const gy = L.gy, pr = ctx.createRadialGradient(L.x, gy, 0, L.x, gy, 70); pr.addColorStop(0, `rgba(${L.c},${0.16 + a * 0.2})`); pr.addColorStop(1, `rgba(${L.c},0)`);
      ctx.save(); ctx.translate(L.x, gy); ctx.scale(1, 0.45); ctx.translate(-L.x, -gy); ctx.fillStyle = pr; ctx.fillRect(L.x - 70, gy - 70, 140, 140); ctx.restore();
    }
    for (const L of lights) {
      if (L.x < camX - L.r || L.x > camX + vw + L.r || L.y < camY - L.r || L.y > camY + vh + L.r) continue;
      const r = L.r * 0.7 * fl(L), rg = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, r);
      rg.addColorStop(0, `rgba(${L.c},${0.05 + a * 0.4})`); rg.addColorStop(1, `rgba(${L.c},0)`);
      ctx.fillStyle = rg; ctx.fillRect(L.x - r, L.y - r, r * 2, r * 2);
    }
    ctx.restore();
  }
  // ── 날씨·입자: 공단 불티와 연기, 숲 낙엽, 동굴 물방울과 포자, 역사 먼지, 설산 눈 ──
  let fx = [], emit = [];
  const rnd = (a, b) => a + Math.random() * (b - a);
  function initFx() {
    fx = [];
    emit = map.indoor && !map.stage ? [] : map.objects.filter((o) => o.t === 'deco' && (o.kind === 'fire' || o.sparks)).map((o) => ({ x: (o.x + o.w / 2) * TILE, y: (o.y + o.h) * TILE - (o.kind === 'fire' ? 34 : TILE * (o.hh || 2) * 0.62), fire: o.kind === 'fire' }));
    const n = { snow: 150, leaves: 22, dust: 60, drip: 45 }[map.fx] || 0;
    for (let i = 0; i < n; i++) fx.push(seedFx(map.fx, true));
  }
  function seedFx(k, any) { // 화면(뷰) 기준 자리: 0~1
    if (k === 'snow') return { k, x: Math.random(), y: any ? Math.random() : -0.03, z: rnd(0.5, 1.6), ph: rnd(0, 7) };
    if (k === 'leaves') return { k, x: any ? Math.random() : rnd(-0.1, 0.9), y: any ? Math.random() : -0.05, z: rnd(0.7, 1.3), ph: rnd(0, 7), c: ['#d9862e', '#c9a83a', '#8fa83a', '#b45a2a'][Math.floor(Math.random() * 4)] };
    if (k === 'dust') return { k, x: Math.random(), y: Math.random(), z: rnd(0.5, 1.5), ph: rnd(0, 7) };
    return { k, x: Math.random(), y: any ? Math.random() : 1.04, z: rnd(0.6, 1.4), ph: rnd(0, 7) }; // drip: 떠오르는 포자
  }
  function stepFx(dt, vw) {
    for (const p of fx) {
      if (p.life) continue;
      if (p.k === 'snow') { p.y += dt * 0.05 * p.z; p.x += dt * 0.012 * Math.sin(T * 0.8 + p.ph) + dt * 0.006; }
      else if (p.k === 'leaves') { p.y += dt * 0.06 * p.z; p.x += dt * (0.03 + 0.03 * Math.sin(T * 1.4 + p.ph)); }
      else if (p.k === 'dust') { p.y -= dt * 0.006 * p.z; p.x += dt * 0.008 * Math.sin(T * 0.4 + p.ph); }
      else if (p.k === 'drip') { p.y -= dt * 0.018 * p.z; p.x += dt * 0.01 * Math.sin(T * 0.7 + p.ph); }
      if (p.y > 1.05 || p.y < -0.06 || p.x > 1.08 || p.x < -0.08) Object.assign(p, seedFx(p.k, p.k === 'dust'));
    }
    // 불티 (모닥불·쇳물): 월드 좌표, 위로 튀어 꺼진다
    for (const e of emit) if (Math.random() < dt * (e.fire ? 9 : 22)) fx.push({ k: 'spark', x: e.x + rnd(-10, 10), y: e.y, vx: rnd(-30, 30) * (e.fire ? 0.5 : 1.6), vy: rnd(-110, -40) * (e.fire ? 0.8 : 1.3), life: rnd(0.6, 1.4), t: 0, g: e.fire ? 10 : 160 });
    for (const e of emit) if (!e.fire && Math.random() < dt * 2.2) fx.push({ k: 'smoke', x: e.x + rnd(-8, 8), y: e.y - 20, vx: rnd(4, 14), vy: rnd(-26, -16), life: rnd(2.2, 3.4), t: 0, r: rnd(10, 16) });
    // 동굴 물방울: 천장에서 수로로
    if (map.fx === 'drip' && !map.indoor && Math.random() < dt * 2.5) fx.push({ k: 'drop', x: camX + Math.random() * vw, y: 0, vy: 0, to: rnd(4.1, 5.9) * TILE, t: 0, life: 9 });
    for (const p of fx) if (p.life) {
      p.t += dt;
      if (p.k === 'spark' || p.k === 'smoke') { p.x += p.vx * dt; p.y += p.vy * dt; if (p.g) p.vy += p.g * dt; }
      if (p.k === 'drop') { if (p.ring == null) { p.vy += 900 * dt; p.y += p.vy * dt; if (p.y >= p.to) { p.y = p.to; p.ring = 0; } } else { p.ring += dt; if (p.ring > 0.7) p.t = p.life; } }
    }
    fx = fx.filter((p) => !p.life || p.t < p.life);
  }
  function drawFx(vw, vh) {
    for (const p of fx) {
      if (p.life) {
        const k = 1 - p.t / p.life;
        if (p.k === 'spark') { ctx.fillStyle = `rgba(255,${(150 + 90 * k) | 0},${(60 * k) | 0},${k})`; ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); }
        else if (p.k === 'smoke') { ctx.fillStyle = `rgba(90,86,84,${0.13 * k})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (2 - k), 0, 7); ctx.fill(); }
        else if (p.k === 'drop') {
          if (p.ring == null) { ctx.fillStyle = 'rgba(170,230,240,.7)'; ctx.fillRect(p.x - 1, p.y - 7, 2, 7); }
          else { ctx.strokeStyle = `rgba(170,230,240,${0.6 * (1 - p.ring / 0.7)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(p.x, p.y, 4 + p.ring * 26, 1.5 + p.ring * 7, 0, 0, 7); ctx.stroke(); }
        }
        continue;
      }
      const X = camX + p.x * vw, Y = camY + p.y * vh;
      if (p.k === 'snow') { ctx.fillStyle = `rgba(255,255,255,${0.55 + 0.3 * p.z / 1.6})`; ctx.beginPath(); ctx.arc(X, Y, 1 + p.z * 1.2, 0, 7); ctx.fill(); }
      else if (p.k === 'leaves') { ctx.save(); ctx.translate(X, Y); ctx.rotate(T * 2 * p.z + p.ph); ctx.scale(1, 0.45 + 0.4 * Math.sin(T * 3 + p.ph)); ctx.fillStyle = p.c; ctx.beginPath(); ctx.ellipse(0, 0, 5 * p.z, 2.6 * p.z, 0, 0, 7); ctx.fill(); ctx.restore(); }
      else if (p.k === 'dust') { ctx.fillStyle = `rgba(200,230,255,${0.18 + 0.18 * Math.sin(T * 1.3 + p.ph)})`; ctx.fillRect(X, Y, 1.6 * p.z, 1.6 * p.z); }
      else if (p.k === 'drip') { ctx.fillStyle = `rgba(120,255,230,${0.35 + 0.3 * Math.sin(T * 2 + p.ph)})`; ctx.beginPath(); ctx.arc(X, Y, 1.2 * p.z, 0, 7); ctx.fill(); }
    }
  }
  function draw() {
    const W = cv.width, H = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = map.indoor ? '#05070c' : (map.sky ? map.sky[0] : '#0c1410'); ctx.fillRect(0, 0, W, H);
    const vw = W / S, vh = H / S, mw = map.w * TILE, mh = map.h * TILE;
    const ppx = pfx * TILE + TILE / 2, ppy = pfy * TILE + TILE / 2;
    camX = mw < vw ? (mw - vw) / 2 : Math.max(0, Math.min(mw - vw, ppx - vw / 2));
    let top = 0;
    if (map.indoor && !map.stage) { const bi = img(map.bg); top = ok(bi) ? Math.min(-TILE * 3.2, 2 * TILE + 6 - (map.fl * (map.w * TILE - TILE * 2 + 28)) / bi.width + 30) : -TILE * 3.2; } // 뒷벽 그림 높이만큼 위를 더 보여 준다 (천장 끝 조금은 잘려도 된다)
    camY = mh - top < vh ? top - (vh - (mh - top)) / 2 : Math.max(top, Math.min(mh - vh, ppy - vh / 2));
    ctx.setTransform(S, 0, 0, S, -camX * S, -camY * S);
    ctx.drawImage(layer, 0, 0);
    if (map.indoor && !map.stage) drawRoomBack();
    else { drawBack(); drawWater(Math.floor(camX / TILE), Math.floor(camY / TILE), Math.ceil((camX + vw) / TILE), Math.ceil((camY + vh) / TILE)); }
    // 깊이 순서: 아래쪽(발 위치가 큰) 것이 앞
    const list = [];
    for (const o of map.objects) {
      if (o.t === 'building') list.push({ y: o.y + o.h, f: () => drawBuilding(o) });
      else if (o.t === 'deco' && !o.skip) list.push({ y: o.y + o.h - 0.01, f: () => drawDeco(o) });
    }
    for (const e of ents) list.push({ y: e.y + 1, f: () => { const X = e.x * TILE + TILE / 2, Y = e.y * TILE + TILE - 4; shadow(X, Y); sdDraw(e, X, Y); } });
    list.push({ y: pfy + 1.001, f: () => { const X = pfx * TILE + TILE / 2, Y = pfy * TILE + TILE - 4; if (window.CMDR) { ctx.save(); ctx.translate(X, Y); ctx.scale(1.5, 1.5); CMDR.draw(ctx, -24, -45, player.face, moving ? player.anim : 0); ctx.restore(); } } }); // 사령관은 동료 SD 키에 맞춰 1.5배
    list.sort((a, b) => a.y - b.y).forEach((d) => d.f());
    if (map.tint) { ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = map.tint; ctx.fillRect(camX, camY, vw, vh); ctx.restore(); }
    if (!map.indoor || map.stage) { drawLights(vw, vh); ctx.save(); if (map.stage) { ctx.beginPath(); ctx.rect(0, map.stage.off, map.w * TILE, map.h * TILE - map.stage.off); ctx.clip(); } drawFx(vw, vh); ctx.restore(); }
    // 의뢰 표시는 어둠·날씨 위에 (늘 잘 보이게)
    for (const e of ents) if (opts.marker(e.id)) drawMarker(e.x * TILE + TILE / 2, e.y * TILE + TILE - 4 - (e.head || TILE * 1.6) - 4);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, W, H); }
  }
  function shadow(X, Y) { ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(X, Y, 18, 7, 0, 0, 7); ctx.fill(); }

  // ── 이동 ───────────────────────────────────────────────
  const inB = (x, y) => x >= 0 && y >= 0 && x < map.w && y < map.h;
  const entAt = (x, y) => ents.find((e) => e.x === x && e.y === y);
  const walkable = (x, y) => inB(x, y) && !blocks[y][x] && !entAt(x, y);
  function findPath(tx, ty) {
    if (!walkable(tx, ty)) return null;
    const key = (x, y) => y * map.w + x, prev = new Map([[key(px, py), null]]), q = [[px, py]];
    while (q.length) {
      const [x, y] = q.shift();
      if (x === tx && y === ty) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (prev.has(k) || !walkable(nx, ny)) continue;
        prev.set(k, key(x, y)); q.push([nx, ny]);
      }
    }
    if (!prev.has(key(tx, ty))) return null;
    const out = [];
    for (let k = key(tx, ty); k != null && k !== key(px, py); k = prev.get(k)) out.unshift([k % map.w, Math.floor(k / map.w)]);
    return out;
  }
  function goTo(tx, ty, then) {
    const p = findPath(tx, ty);
    if (!p) return false;
    path = p; onArrive = then || null;
    return true;
  }
  // 칸에 도착했을 때: 문·출구 확인
  function arrived() {
    for (const o of map.objects) {
      if (o.t === 'building' && px === o.door && py === o.y + o.h - 1) { backTo = ['base', o.door, o.y + o.h]; const r = MAPS[o.to[0]]; warp(r && r.spawn ? [o.to[0], ...r.spawn] : o.to); return true; }
      if (o.t === 'exit' && px >= o.x && px < o.x + o.w && py >= o.y && py < o.y + o.h) {
        if (o.to) warp(o.to === 'back' ? backTo || ['base', ...(MAPS.base.start || [12, 16])] : o.to); else leave();
        return true;
      }
    }
    return false;
  }
  function warp(to) {
    busy = true; path = []; AU.play('lo_d_door', 0.5);
    fadeTo = 1;
    pendingWarp = to;
  }
  function leave() { busy = true; path = []; fadeTo = 1; pendingWarp = 'leave'; }

  // 말 걸기: 사람 옆까지 가서
  function talkTo(e) {
    const near = [[e.x, e.y + 1], [e.x - 1, e.y], [e.x + 1, e.y], [e.x, e.y - 1]].filter(([x, y]) => walkable(x, y) || (x === px && y === py));
    near.sort((a, b) => Math.abs(a[0] - px) + Math.abs(a[1] - py) - (Math.abs(b[0] - px) + Math.abs(b[1] - py)));
    const start = async () => {
      busy = true;
      dir = e.x < px ? -1 : e.x > px ? 1 : dir;
      player.face = e.x < px ? 'left' : e.x > px ? 'right' : e.y < py ? 'up' : 'down';
      e.flip = px < e.x; // 사령관 쪽을 본다
      await opts.talk(e.id);
      busy = false;
      questList();
    };
    if (near.some(([x, y]) => x === px && y === py)) { start(); return; }
    for (const [x, y] of near) if (goTo(x, y, start)) return;
  }

  // ── 입력 ───────────────────────────────────────────────
  function onPointer(ev) {
    if (!open || busy || fade > 0.05) return;
    const r = cv.getBoundingClientRect(), dpr = cv.width / r.width;
    const wx = ((ev.clientX - r.left) * dpr) / S + camX, wy = ((ev.clientY - r.top) * dpr) / S + camY;
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    // 사람은 몸이 칸보다 위로 솟아 있으니 위 칸을 눌러도 그 사람
    const e = entAt(tx, ty) || entAt(tx, ty + 1);
    if (e) { talkTo(e); return; }
    // 건물을 누르면 문 앞까지
    const b = map.objects.find((o) => o.t === 'building' && tx >= o.x && tx < o.x + o.w && ty >= o.y - 2 && ty < o.y + o.h);
    if (b) { goTo(b.door, b.y + b.h - 1); return; }
    goTo(tx, ty);
  }
  function onKey(ev) {
    if (!open || busy) return;
    const d = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] }[ev.code];
    if (d && !moving) {
      if (d[0]) dir = d[0];
      player.face = d[0] < 0 ? 'left' : d[0] > 0 ? 'right' : d[1] < 0 ? 'up' : 'down';
      const nx = px + d[0], ny = py + d[1];
      if (walkable(nx, ny)) path = [[nx, ny]];
      ev.preventDefault();
    } else if (ev.code === 'Enter' || ev.code === 'Space') {
      const e = ents.find((x) => Math.abs(x.x - px) + Math.abs(x.y - py) === 1);
      if (e) talkTo(e);
      ev.preventDefault();
    }
  }

  // ── 진행 ───────────────────────────────────────────────
  let viewAcross = 0; // 시험용: 한눈에 보이는 칸 수
  function resize() {
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
    // 보이는 칸 수: 가로 화면 약 15칸, 세로 화면 약 9칸
    const across = viewAcross || (innerWidth > innerHeight ? 15 : 9);
    S = cv.width / (across * TILE);
  }
  function update(dt) {
    if (!open) return;
    T += dt;
    if (hold) { hold.t += dt; if (hold.list.every(ok) || hold.t > 2.5) { layer = buildLayer(); hold = null; fadeTo = 0; busy = false; } }
    // 화면 전환 (어둡게 → 지도 바꾸기 → 밝게)
    if (fade < fadeTo) { fade = Math.min(fadeTo, fade + dt * 4); if (fade >= 1 && pendingWarp) {
      const to = pendingWarp; pendingWarp = null;
      if (to === 'leave') { close(); return; }
      loadMap(to[0], to[1], to[2]); fadeTo = 0; busy = false;
    } } else if (fade > fadeTo) fade = Math.max(fadeTo, fade - dt * 3);
    // 걷기
    if (!moving && path.length && !busy) {
      const [nx, ny] = path[0];
      if (!walkable(nx, ny)) path = [];
      else { if (nx !== px) dir = nx < px ? -1 : 1; player.face = nx < px ? 'left' : nx > px ? 'right' : ny < py ? 'up' : 'down'; moving = 1; player.from = [px, py]; px = nx; py = ny; player.t = 0; AU.play('lo_walk', 0.35, 0.92 + Math.random() * 0.16); } // 한 칸마다 원작 흙길 발소리
    }
    if (moving) {
      player.t += dt * 4.6; player.anim += dt * 9;
      const k = Math.min(1, player.t);
      pfx = player.from[0] + (px - player.from[0]) * k; pfy = player.from[1] + (py - player.from[1]) * k;
      if (k >= 1) {
        moving = 0; path.shift();
        if (!arrived() && !path.length && onArrive) { const f = onArrive; onArrive = null; f(); }
      }
    }
    player.walk = !!moving || path.length > 0;
    player.flip = dir < 0;
    sdRender(ents, dt);
    if (!map.indoor || map.stage) stepFx(dt, cv.width / S);
    draw();
    if (banner > 0) banner -= dt;
    hud.classList.toggle('show', banner > 0);
  }

  function close() {
    open = false;
    AU.amb(null);
    removeEventListener('keydown', onKey);
    removeEventListener('resize', resize);
    for (const e of ents) if (e.sd) { e.sd.root.parent && e.sd.root.parent.remove(e.sd.root); e.sd.dispose(); e.sd = null; e.slot = null; }
    cv.remove(); hud.remove(); cv = null;
    const cb = done; done = null;
    if (cb) cb();
  }

  // 이 마을에 들어온 새 의뢰와 맡기는 사람 (opts.quests)
  function questList() {
    const el = hud && hud.querySelector('.tn-quest'); if (!el) return;
    const q = (opts.quests && opts.quests()) || [];
    el.innerHTML = q.length ? `<h4>새 의뢰 <small>${q.length}건</small></h4>` + q.map((x) => `<div class="${x.ex ? 'ex' : ''}"><b>${x.who}</b><span>${x.ex ? '고난도 · ' : ''}${x.t}</span></div>`).join('') : '';
    el.classList.toggle('on', !!q.length);
  }
  // opts: { present(id) -> 이 동료가 마을에 있는가, marker(id) -> 머리 위 '!' 여부, talk(id) -> Promise(대화) }
  function enter(o) {
    return new Promise((res) => {
      opts = o; done = res;
      MAPS.base = baseFor(o.look, o.name); backTo = null; look = o.look || 'coast';
      sdInit();
      // 건물·소품·방 그림 미리 불러오기
      for (const m of Object.values(MAPS)) { if (m.bg) img(m.bg); for (const ob of m.objects) if (ob.art) img(ob.art); }
      for (const ob of MAPS.base.objects) if (ob.art) img(ob.art);
      const F = MAPS.base.floor || {}; // 바닥 질감·뒷배경도 미리 (늦게 오면 바닥이 대체 색으로 그려진다)
      [F.base, F.zone, F.path, F.wall].filter(Boolean).forEach(img); for (const b of MAPS.base.back || []) img(b.art);
      ['tiles/grass', 'tiles/asphalt'].forEach(img);
      cv = document.createElement('canvas'); cv.id = 'townCv';
      ctx = cv.getContext('2d');
      hud = document.createElement('div'); hud.id = 'townHud';
      hud.innerHTML = `<div class="tn-name"></div><div class="tn-quest"></div><button class="lo-btn dark tn-out">월드맵으로</button><div class="tn-help">누른 곳으로 걷기 · 동료를 누르면 대화 · 머리 위 <b>!</b> 는 새 의뢰</div>`;
      document.body.appendChild(cv); document.body.appendChild(hud);
      hud.querySelector('.tn-out').onclick = () => { if (!busy) { AU.play('lo_click', 0.6); leave(); } };
      cv.addEventListener('pointerdown', onPointer);
      addEventListener('keydown', onKey);
      addEventListener('resize', resize);
      resize();
      open = true; fade = 1; fadeTo = 1; busy = true; T = 0;
      loadMap('base', ...(MAPS.base.start || [12, 16]));
      // 바닥·뒷배경·건물 그림이 다 올 때까지 (길어도 2.5초) 검은 화면으로 기다렸다가 밝힌다
      hold = { t: 0, list: [F.base, F.zone, F.path, F.wall, ...(MAPS.base.back || []).map((b) => b.art), ...MAPS.base.objects.filter((ob) => ob.t === 'building').map((ob) => ob.art)].filter(Boolean).map(img) };
      questList();
      dir = 1;
    });
  }

  window.TOWNF = {
    enter, update, get open() { return open; }, MAPS, TOWNMAPS, debug: () => ({ map: map && map.id, px, py, busy, ents: ents.map((e) => e.id) }),
    // 시험용: 칸으로 걷기, 사람에게 말 걸기
    goTo: (x, y) => goTo(x, y), talk: (id) => { const e = ents.find((x) => x.id === id); if (e) talkTo(e); return !!e; },
    shot: () => cv && cv.toDataURL('image/jpeg', 0.85),
    view: (n) => { viewAcross = n || 0; resize(); },
    sdShot: () => SDF.c && SDF.c.toDataURL('image/png'),
    warpTo: (x, y) => { px = pfx = x; py = pfy = y; path = []; },
  };
})();
