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

  // ── 지도 ──────────────────────────────────────────────
  // 칸: . 풀  _ 길  s 모래  ~ 바다  (막힘: ~ 와 건물·소품 자리)
  function outdoor() {
    const W = 26, H = 18, g = [];
    for (let y = 0; y < H; y++) g.push(Array(W).fill('.'));
    for (let x = 0; x < W; x++) { g[0][x] = g[1][x] = '~'; g[2][x] = (x % 7 === 3) ? '~' : 's'; g[3][x] = x < 7 || x > 20 ? 's' : '.'; }
    for (let y = 0; y < 6; y++) { g[y][0] = '~'; if (y > 1) g[y][1] = 's'; }
    for (let x = 4; x <= 21; x++) g[10][x] = '_';
    for (let y = 10; y < H; y++) { g[y][12] = '_'; g[y][13] = '_'; }
    for (let y = 9; y <= 10; y++) for (let x = 6; x <= 7; x++) g[y][x] = '_';
    for (let y = 9; y <= 10; y++) for (let x = 18; x <= 19; x++) g[y][x] = '_';
    return g.map((r) => r.join(''));
  }
  // 실내: 뒤 두 줄은 벽, 양옆·아래 벽, 아래 가운데 문
  function room(w, h) {
    const g = [];
    for (let y = 0; y < h; y++) { const r = []; for (let x = 0; x < w; x++) r.push(y < 2 || x === 0 || x === w - 1 || y === h - 1 ? '#' : 'M'); g.push(r); }
    g[h - 1][Math.floor(w / 2)] = 'D';
    return g.map((r) => r.join(''));
  }
  const MAPS = {
    base: {
      name: '등대 아래 비밀기지', rows: outdoor(), bgm: 'lo_lobby',
      objects: [
        { t: 'building', x: 4, y: 5, w: 5, h: 4, art: 'town/b_center', label: '지휘실', door: 6, to: ['cmd', 6, 7] },
        { t: 'building', x: 16, y: 5, w: 6, h: 4, art: 'town/b_shop', label: '정비실', door: 18, to: ['shop', 6, 7] },
        { t: 'building', x: 9, y: 12, w: 6, h: 2, art: 'town/b_cafe', label: '휴게실', door: 11, to: ['cafe', 6, 7] },
        { t: 'deco', kind: 'lighthouse', x: 2, y: 3, w: 2, h: 2, block: 1 },
        { t: 'deco', art: 'town/b_palm1', x: 1, y: 7, w: 1, h: 1, hh: 2.6, block: 1 },
        { t: 'deco', art: 'town/b_palm2', x: 23, y: 4, w: 1, h: 1, hh: 2.6, block: 1 },
        { t: 'deco', art: 'town/b_palm1', x: 9, y: 3, w: 1, h: 1, hh: 2.4, block: 1 },
        { t: 'deco', art: 'tiles/tree0', x: 1, y: 12, w: 1, h: 1, hh: 2.2, block: 1 },
        { t: 'deco', art: 'tiles/tree1', x: 2, y: 15, w: 1, h: 1, hh: 2.0, block: 1 },
        { t: 'deco', art: 'tiles/tree2', x: 23, y: 13, w: 1, h: 1, hh: 2.2, block: 1 },
        { t: 'deco', art: 'tiles/tree3', x: 24, y: 16, w: 1, h: 1, hh: 1.7, block: 1 },
        { t: 'deco', art: 'town/b_pine2', x: 20, y: 15, w: 1, h: 1, hh: 2.2, block: 1 },
        { t: 'deco', art: 'town/b_rock', x: 23, y: 8, w: 2, h: 1, hh: 1.5, block: 1 },
        { t: 'deco', art: 'town/b_ruin1', x: 16, y: 14, w: 3, h: 1, hh: 1.5, block: 1 },
        { t: 'deco', art: 'town/b_ruin2', x: 4, y: 14, w: 3, h: 1, hh: 1.6, block: 1 },
        { t: 'deco', art: 'town/b_lamp', x: 11, y: 9, w: 1, h: 1, hh: 2.1, block: 1 },
        { t: 'deco', art: 'town/b_lamp', x: 15, y: 9, w: 1, h: 1, hh: 2.1, block: 1 },
        { t: 'deco', art: 'town/b_bench', x: 14, y: 11, w: 2, h: 1, hh: 0.9, block: 1 },
        { t: 'deco', art: 'town/b_barricade', x: 10, y: 16, w: 1, h: 1, hh: 1.0, block: 1 },
        { t: 'deco', art: 'town/b_barricade', x: 15, y: 16, w: 1, h: 1, hh: 1.0, block: 1 },
        { t: 'deco', art: 'town/b_stop', x: 14, y: 16, w: 1, h: 1, hh: 1.7, block: 1 },
        { t: 'exit', x: 12, y: 17, w: 2, h: 1 },
        { t: 'npc', id: 'griffon', x: 13, y: 8, dir: 1 },
        { t: 'npc', id: 'lrl', x: 4, y: 4, dir: 1 },
        { t: 'npc', id: 'fallen', x: 21, y: 11, dir: -1 },
      ],
    },
    cmd: {
      name: '지휘실', rows: room(13, 9), indoor: 1, bg: 'town/r_train_0', fl: 365,
      objects: [
        { t: 'exit', x: 6, y: 8, w: 1, h: 1, to: ['base', 6, 9] },
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
      name: '정비실', rows: room(13, 9), indoor: 1, bg: 'town/r_dis2_0', fl: 353,
      objects: [
        { t: 'exit', x: 6, y: 8, w: 1, h: 1, to: ['base', 18, 9] },
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
        { t: 'exit', x: 6, y: 8, w: 1, h: 1, to: ['base', 11, 14] },
        { t: 'deco', art: 'town/r_cafe4_1', x: 3, y: 4, w: 3, h: 1, hh: 1.2, block: 1 },
        { t: 'deco', art: 'town/r_cafe4_1', x: 8, y: 5, w: 3, h: 1, hh: 1.2, block: 1 },
        { t: 'deco', art: 'town/r_cafe4_3', x: 10, y: 2, w: 1, h: 1, hh: 1.7, block: 1 },
        { t: 'deco', art: 'town/r_cafe2_3', x: 1, y: 2, w: 1, h: 1, hh: 0.8, block: 1 },
        { t: 'npc', id: 'amy', x: 2, y: 6, dir: 1 },
        { t: 'npc', id: 'scathy', x: 11, y: 6, dir: -1 },
      ],
    },
  };
  // 실내 방 그림: 원작 방 배경의 위쪽(뒷벽)과 아래쪽(바닥)을 나눠 쓴다 (라켓몬스터와 같은 방식)
  const ROOMWALL = { cmd: ['#5d6580', '#a3abc6'], shop: ['#6b5b62', '#b8a2ab'], cafe: ['#8f877a', '#ece7de'] };

  // ── 상태 ──────────────────────────────────────────────
  let cv = null, ctx = null, hud = null, map = null, layer = null, open = false, done = null, opts = null;
  let px = 0, py = 0, pfx = 0, pfy = 0, dir = 1, path = [], moving = 0, busy = false, fade = 0, fadeTo = 0, pendingWarp = null, onArrive = null;
  let ents = [], blocks = null, S = 1, camX = 0, camY = 0, T = 0, banner = 0;
  const player = { id: 'constantia', sd: null };

  // ── SD 그리기: 화면 밖 WebGL 한 장에 칸별로 ──
  const SDF = { CW: 170, CH: 210, COLS: 6, R: null, scene: null, cam: null, c: null };
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
      if (!e.sd && window.SD && SD.ready(e.id)) { e.sd = SD.create(e.id); e.sd.play('idle', null, true); e.sd.time = Math.random() * 2; e.sdAnim = 'idle'; }
      const c = e.sd; if (!c) return;
      const anim = e.walk ? 'move' : 'idle';
      if (e.sdAnim !== anim && c.has(anim)) { c.play(anim, null, true); e.sdAnim = anim; }
      c.update(dt);
      const t = c.tpl, k = (SDF.CH - 26) / Math.max(t.height, 0.01) * (e.big ? 0.95 : 0.8);
      const col = i % SDF.COLS, row = Math.floor(i / SDF.COLS);
      const cx = col * SDF.CW + SDF.CW / 2, by = (1 - row) * SDF.CH + 8;
      const f = e.flip ? -1 : 1;
      c.root.scale.set(k * f, k, 1);
      const mid = ((t.box.min.x + t.box.max.x) / 2) * k;
      c.root.position.set(cx - mid * f, by - t.box.min.y * k, 0);
      if (!c.root.parent) SDF.scene.add(c.root);
      c.root.visible = true;
      e.slot = { sx: col * SDF.CW, sy: row * SDF.CH };
    });
    R.render(SDF.scene, SDF.cam);
    list.forEach((e) => { if (e.sd) e.sd.root.visible = false; });
  }
  function sdDraw(e, X, Y) { // 발 위치 (X, Y)
    if (!e.slot || !e.sd) return false;
    const w = SDF.CW, h = SDF.CH, s = (TILE * 2.2) / h;
    ctx.drawImage(SDF.c, e.slot.sx, e.slot.sy, w, h, X - (w * s) / 2, Y - h * s + 8 * s, w * s, h * s);
    return true;
  }

  // ── 불러오기 ───────────────────────────────────────────
  function loadMap(id, x, y) {
    map = Object.assign({ id }, MAPS[id]);
    const H = map.rows.length, W = map.rows[0].length;
    map.w = W; map.h = H;
    blocks = [];
    for (let yy = 0; yy < H; yy++) { blocks.push([]); for (let xx = 0; xx < W; xx++) { const c = map.rows[yy][xx]; blocks[yy].push(c === '~' || c === '#'); } }
    // 사람: 합류한 동료만 (opts.present)
    ents = [];
    for (const o of map.objects) {
      if (o.t === 'building') { for (let yy = o.y; yy < o.y + o.h; yy++) for (let xx = o.x; xx < o.x + o.w; xx++) if (!(xx === o.door && yy === o.y + o.h - 1)) blocks[yy][xx] = true; }
      if (o.t === 'deco' && o.block) for (let yy = o.y; yy < o.y + o.h; yy++) for (let xx = o.x; xx < o.x + o.w; xx++) blocks[yy][xx] = true;
      if (o.t === 'npc' && opts.present(o.id)) ents.push({ id: o.id, x: o.x, y: o.y, flip: o.dir < 0, big: o.id === 'pupphead' || o.id === 'fallen' });
    }
    px = pfx = x; py = pfy = y; path = []; moving = 0;
    layer = buildLayer();
    // 그림이 아직 안 왔으면 오는 대로 바닥을 다시 그린다
    const need = map.indoor ? [img(map.bg)] : ['tiles/grass', 'tiles/asphalt'].map(img);
    need.filter((im) => !ok(im)).forEach((im) => im.addEventListener('load', () => { if (map && map.id === id) layer = buildLayer(); }, { once: true }));
    banner = 2.4;
    hud.querySelector('.tn-name').textContent = map.name;
    if (window.SD) for (const e of ents.concat([player])) SD.prepare(e.id);
    if (map.bgm) AU.bgm(map.bgm);
  }

  // 바닥 미리 그리기 (원작 손그림 질감: assets/tiles)
  function buildLayer() {
    const W = map.w * TILE, H = map.h * TILE;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    if (map.indoor) { drawRoomFloor(g); return c; }
    const pat = (n, sc = 0.75) => { const im = img(n); if (!ok(im)) return '#6a8a4a'; const p = g.createPattern(im, 'repeat'); p.setTransform(new DOMMatrix().scale(sc)); return p; };
    const layerOf = (test, fill, blur) => {
      const m = document.createElement('canvas'); m.width = W; m.height = H;
      const mg = m.getContext('2d'); mg.fillStyle = '#fff';
      for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (test(map.rows[y][x])) mg.fillRect(x * TILE - 2, y * TILE - 2, TILE + 4, TILE + 4);
      const b = document.createElement('canvas'); b.width = W; b.height = H;
      const bg = b.getContext('2d'); bg.filter = `blur(${blur}px)`; bg.drawImage(m, 0, 0);
      const l = document.createElement('canvas'); l.width = W; l.height = H;
      const lg = l.getContext('2d'); lg.fillStyle = fill; lg.fillRect(0, 0, W, H);
      lg.globalCompositeOperation = 'destination-in'; lg.drawImage(b, 0, 0);
      g.drawImage(l, 0, 0);
    };
    g.fillStyle = pat('tiles/grass'); g.fillRect(0, 0, W, H);
    layerOf((t) => t === 's' || t === '~', pat('tiles/asphalt', 0.9), TILE * 0.35);
    layerOf((t) => t === '_', pat('tiles/asphalt'), TILE * 0.12);
    layerOf((t) => t === '_', 'rgba(60,48,30,.18)', TILE * 0.06);
    // 바다
    const sea = g.createLinearGradient(0, 0, 0, TILE * 3);
    sea.addColorStop(0, '#1f5f93'); sea.addColorStop(1, '#3a8fc0');
    layerOf((t) => t === '~', sea, TILE * 0.18);
    g.strokeStyle = 'rgba(220,240,255,.3)'; g.lineWidth = 2;
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (map.rows[y][x] === '~' && (x * 7 + y * 3) % 4 === 0) {
      g.beginPath(); g.moveTo(x * TILE + 8, y * TILE + 24); g.quadraticCurveTo(x * TILE + 22, y * TILE + 18, x * TILE + 38, y * TILE + 24); g.stroke();
    }
    // 가장자리 어둡게
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.3)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    return c;
  }
  // 방 바닥·옆벽 (원작 방 그림의 바닥 부분을 방 크기에 맞춰)
  function drawRoomFloor(g) {
    const im = img(map.bg), mw = map.w * TILE, mh = map.h * TILE, y1 = 2 * TILE + 6, y2 = mh - TILE + 4, fx0 = TILE - 14, fx1 = mw - TILE + 14;
    g.fillStyle = '#0d1018'; g.fillRect(0, y1, mw, mh - y1); // 뒷벽 자리(위 두 줄)는 비워 둔다
    if (ok(im)) g.drawImage(im, 0, map.fl, im.width, im.height - map.fl, fx0, y1, fx1 - fx0, y2 - y1);
    const sg = g.createLinearGradient(0, y1, 0, y1 + 60); sg.addColorStop(0, 'rgba(0,0,0,0.25)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sg; g.fillRect(fx0, y1, fx1 - fx0, 60);
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) { const lx = mw * (0.22 + i * 0.28), ly = y1 + (y2 - y1) * 0.35; const rg = g.createRadialGradient(lx, ly, 10, lx, ly, mw * 0.2); rg.addColorStop(0, 'rgba(255,255,240,0.12)'); rg.addColorStop(1, 'rgba(255,255,240,0)'); g.fillStyle = rg; g.fillRect(lx - mw * 0.2, ly - mw * 0.2, mw * 0.4, mw * 0.4); }
    g.restore();
    const wc = ROOMWALL[map.id] || ['#55606e', '#8a95a3'];
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
  function drawRoomBack() {
    const im = img(map.bg); if (!ok(im)) return;
    const mw = map.w * TILE, rx = TILE - 14, rw = mw - TILE * 2 + 28, dh = (map.fl * rw) / im.width, y1 = 2 * TILE + 6;
    ctx.drawImage(im, 0, 0, im.width, map.fl, rx, y1 - dh, rw, dh);
    const g = ctx.createLinearGradient(0, y1, 0, y1 + 18); g.addColorStop(0, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(TILE, y1, mw - TILE * 2, 18);
  }

  // ── 그리기 ─────────────────────────────────────────────
  function drawDeco(o) {
    const X = o.x * TILE, Y = o.y * TILE, w = o.w * TILE, h = o.h * TILE;
    if (o.kind === 'lighthouse') return drawLighthouse(X + w / 2, Y + h);
    const im = img(o.art); if (!ok(im)) return;
    const dh = TILE * (o.hh || 1.6), dw = (im.naturalWidth * dh) / im.naturalHeight;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(X + w / 2, Y + h - 4, Math.max(dw, w) * 0.42, 8, 0, 0, 7); ctx.fill();
    ctx.drawImage(im, X + w / 2 - dw / 2, Y + h - dh, dw, dh);
  }
  function drawLighthouse(cx, by) { // 등대 (원작에 맞는 그림이 없어 직접): 흰·빨강 띠 탑과 등불
    const h = TILE * 4.2, w0 = TILE * 1.2, w1 = TILE * 0.75;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(cx + 16, by - 4, w0 * 0.9, 12, 0, 0, 7); ctx.fill();
    for (let i = 0; i < 6; i++) {
      const y0 = by - (h * i) / 6, y1 = by - (h * (i + 1)) / 6, a = w0 + ((w1 - w0) * i) / 6, b = w0 + ((w1 - w0) * (i + 1)) / 6;
      ctx.fillStyle = i % 2 ? '#c8423a' : '#ece8de';
      ctx.beginPath(); ctx.moveTo(cx - a / 2, y0); ctx.lineTo(cx + a / 2, y0); ctx.lineTo(cx + b / 2, y1); ctx.lineTo(cx - b / 2, y1); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(cx, by - h, w0 / 2, h);
    const ty = by - h;
    ctx.fillStyle = '#2b2f36'; ctx.fillRect(cx - w1 / 2 - 6, ty - 6, w1 + 12, 8);
    const glow = 0.6 + Math.sin(T * 2.4) * 0.25;
    ctx.fillStyle = `rgba(255,226,140,${glow})`; ctx.fillRect(cx - w1 / 2 + 4, ty - 34, w1 - 8, 28);
    ctx.fillStyle = '#2b2f36'; ctx.beginPath(); ctx.moveTo(cx - w1 / 2 - 4, ty - 34); ctx.lineTo(cx, ty - 54); ctx.lineTo(cx + w1 / 2 + 4, ty - 34); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const rg = ctx.createRadialGradient(cx, ty - 20, 4, cx, ty - 20, 80); rg.addColorStop(0, `rgba(255,220,140,${glow * 0.5})`); rg.addColorStop(1, 'rgba(255,220,140,0)');
    ctx.fillStyle = rg; ctx.fillRect(cx - 80, ty - 100, 160, 160); ctx.restore();
  }
  function drawBuilding(b) {
    const im = img(b.art), w = b.w * TILE, base = (b.y + b.h) * TILE + 6;
    if (ok(im)) {
      let dw = w * 1.1, dh = (im.naturalHeight * dw) / im.naturalWidth;
      const maxH = (b.h + 2.6) * TILE; if (dh > maxH) { dw *= maxH / dh; dh = maxH; }
      const x = b.x * TILE + w / 2 - dw / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x - 4, base - 10, dw + 16, 18);
      ctx.fillStyle = '#a89f8c'; ctx.fillRect(x - 8, base - 8, dw + 16, 14);
      ctx.fillStyle = '#cfc6b4'; ctx.fillRect(x - 8, base - 12, dw + 16, 10);
      ctx.drawImage(im, x, base - dh, dw, dh);
    }
    // 문: 불빛 + 매트
    const dx = b.door * TILE, by = base - 6;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const lg = ctx.createRadialGradient(dx + 24, by, 4, dx + 24, by, 44); lg.addColorStop(0, 'rgba(255,226,160,0.4)'); lg.addColorStop(1, 'rgba(255,226,160,0)');
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
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(X, Y - 2, 9, 4, 0, 0, 7); ctx.fill();
    ctx.font = "900 34px 'LO_B', sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 5; ctx.strokeStyle = '#3a2a00'; ctx.strokeText('!', X, Y - 8 + b);
    ctx.fillStyle = '#ffcc00'; ctx.fillText('!', X, Y - 8 + b);
  }
  function draw() {
    const W = cv.width, H = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = map.indoor ? '#05070c' : '#0c1410'; ctx.fillRect(0, 0, W, H);
    const vw = W / S, vh = H / S, mw = map.w * TILE, mh = map.h * TILE;
    const ppx = pfx * TILE + TILE / 2, ppy = pfy * TILE + TILE / 2;
    camX = mw < vw ? (mw - vw) / 2 : Math.max(0, Math.min(mw - vw, ppx - vw / 2));
    const top = map.indoor ? -TILE * 3.2 : 0;
    camY = mh - top < vh ? top - (vh - (mh - top)) / 2 : Math.max(top, Math.min(mh - vh, ppy - vh / 2));
    ctx.setTransform(S, 0, 0, S, -camX * S, -camY * S);
    ctx.drawImage(layer, 0, 0);
    if (map.indoor) drawRoomBack();
    // 깊이 순서: 아래쪽(발 위치가 큰) 것이 앞
    const list = [];
    for (const o of map.objects) {
      if (o.t === 'building') list.push({ y: o.y + o.h, f: () => drawBuilding(o) });
      else if (o.t === 'deco' && !o.skip) list.push({ y: o.y + o.h - 0.01, f: () => drawDeco(o) });
    }
    for (const e of ents) list.push({ y: e.y + 1, f: () => { const X = e.x * TILE + TILE / 2, Y = e.y * TILE + TILE - 4; shadow(X, Y); sdDraw(e, X, Y); if (opts.marker(e.id)) drawMarker(X, Y - TILE * 2.45); } });
    list.push({ y: pfy + 1.001, f: () => { const X = pfx * TILE + TILE / 2, Y = pfy * TILE + TILE - 4; shadow(X, Y); sdDraw(player, X, Y); } });
    list.sort((a, b) => a.y - b.y).forEach((d) => d.f());
    // 실내 가장자리 어둡게
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
      if (o.t === 'building' && px === o.door && py === o.y + o.h - 1) { warp(o.to); return true; }
      if (o.t === 'exit' && px >= o.x && px < o.x + o.w && py >= o.y && py < o.y + o.h) {
        if (o.to) warp(o.to); else leave();
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
      e.flip = px < e.x; // 사령관 쪽을 본다
      await opts.talk(e.id);
      busy = false;
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
  function resize() {
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
    // 보이는 칸 수: 가로 화면 약 15칸, 세로 화면 약 9칸
    const across = innerWidth > innerHeight ? 15 : 9;
    S = cv.width / (across * TILE);
  }
  function update(dt) {
    if (!open) return;
    T += dt;
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
      else { if (nx !== px) dir = nx < px ? -1 : 1; moving = 1; player.from = [px, py]; px = nx; py = ny; player.t = 0; }
    }
    if (moving) {
      player.t += dt * 4.6;
      const k = Math.min(1, player.t);
      pfx = player.from[0] + (px - player.from[0]) * k; pfy = player.from[1] + (py - player.from[1]) * k;
      if (k >= 1) {
        moving = 0; path.shift();
        if (!arrived() && !path.length && onArrive) { const f = onArrive; onArrive = null; f(); }
      }
    }
    player.walk = !!moving || path.length > 0;
    player.flip = dir < 0;
    sdRender([player, ...ents], dt);
    draw();
    if (banner > 0) banner -= dt;
    hud.classList.toggle('show', banner > 0);
  }

  function close() {
    open = false;
    removeEventListener('keydown', onKey);
    removeEventListener('resize', resize);
    for (const e of ents.concat([player])) if (e.sd) { e.sd.root.parent && e.sd.root.parent.remove(e.sd.root); e.sd.dispose(); e.sd = null; e.slot = null; }
    cv.remove(); hud.remove(); cv = null;
    const cb = done; done = null;
    if (cb) cb();
  }

  // opts: { present(id) -> 이 동료가 마을에 있는가, marker(id) -> 머리 위 '!' 여부, talk(id) -> Promise(대화) }
  function enter(o) {
    return new Promise((res) => {
      opts = o; done = res;
      sdInit();
      // 건물·소품·방 그림 미리 불러오기
      for (const m of Object.values(MAPS)) { if (m.bg) img(m.bg); for (const ob of m.objects) if (ob.art) img(ob.art); }
      ['tiles/grass', 'tiles/asphalt'].forEach(img);
      cv = document.createElement('canvas'); cv.id = 'townCv';
      ctx = cv.getContext('2d');
      hud = document.createElement('div'); hud.id = 'townHud';
      hud.innerHTML = `<div class="tn-name"></div><button class="lo-btn dark tn-out">월드맵으로</button><div class="tn-help">누른 곳으로 걷기 · 동료를 누르면 대화</div>`;
      document.body.appendChild(cv); document.body.appendChild(hud);
      hud.querySelector('.tn-out').onclick = () => { if (!busy) { AU.play('lo_click', 0.6); leave(); } };
      cv.addEventListener('pointerdown', onPointer);
      addEventListener('keydown', onKey);
      addEventListener('resize', resize);
      resize();
      open = true; fade = 1; fadeTo = 0; busy = false; T = 0;
      loadMap('base', 12, 16);
      dir = 1;
    });
  }

  window.TOWNF = {
    enter, update, get open() { return open; }, MAPS, debug: () => ({ map: map && map.id, px, py, busy, ents: ents.map((e) => e.id) }),
    // 시험용: 칸으로 걷기, 사람에게 말 걸기
    goTo: (x, y) => goTo(x, y), talk: (id) => { const e = ents.find((x) => x.id === id); if (e) talkTo(e); return !!e; },
    shot: () => cv && cv.toDataURL('image/jpeg', 0.85),
  };
})();
