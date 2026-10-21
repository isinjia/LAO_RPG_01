// 오르카 전기: 랑그릿사식 전술 시뮬레이션.
// 지도(비스듬히 내려다보는 3D 판 + SD 리그 빌보드), 입력(터치·마우스·키보드), 차례 진행, 적 행동, 화면(타이틀·선택·편성·결과).
(function () {
  const D = DATA, R = RULES;
  const $ = (id) => document.getElementById(id);
  const MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 1100);

  // ── 렌더러 ───────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: /shot=1/.test(location.search) });
  renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 2 : 2));
  $('stage').appendChild(renderer.domElement);
  SD.gpuSkin = renderer.capabilities.floatVertexTextures;
  SD.renderer = renderer;
  SD.crossfade = 0.12;
  SD.pinRoot = true;
  SD.pinRange = 0;
  SD.mipmaps = renderer.capabilities.isWebGL2;
  SD.texScale = MOBILE ? 0.35 : 0.5;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1020);
  const TILT = 54 * Math.PI / 180;
  const CAMDIR = new THREE.Vector3(0, Math.sin(TILT), Math.cos(TILT));
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 400);
  const VIEW_H = 10;
  const cam = { x: 0, z: 0, zoom: 1, tx: null, tz: null };
  function placeCamera() {
    camera.position.set(cam.x + CAMDIR.x * 100, CAMDIR.y * 100, cam.z + CAMDIR.z * 100);
    camera.lookAt(cam.x, 0, cam.z);
    camera.zoom = cam.zoom;
    camera.updateProjectionMatrix();
  }
  function resize() {
    const w = innerWidth, h = innerHeight, a = w / h;
    camera.left = -VIEW_H * a / 2; camera.right = VIEW_H * a / 2; camera.top = VIEW_H / 2; camera.bottom = -VIEW_H / 2;
    renderer.setSize(w, h);
    FIGHT.resize(w, h);
    if (G) fitCamera(false);
    placeCamera();
  }
  addEventListener('resize', () => { resize(); setTimeout(resize, 250); });

  // ── 공용 도구 ───────────────────────────────────────────
  const texCache = {};
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function canvasTex(w, h, draw) {
    const c = canvas(w, h);
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }
  function tex(name) { // assets.js 의 그림
    if (texCache[name]) return texCache[name];
    const im = new Image();
    const t = new THREE.Texture(im);
    im.onload = () => { t.needsUpdate = true; };
    im.src = IMG[name];
    return (texCache[name] = t);
  }
  function loadTex(url) {
    if (texCache[url]) return Promise.resolve(texCache[url]);
    return new Promise((res) => {
      const im = new Image();
      im.onload = () => { const t = new THREE.Texture(im); t.needsUpdate = true; texCache[url] = t; res(t); };
      im.onerror = () => res(null);
      im.src = url;
    });
  }
  const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  let speedK = 1, simT = 0;
  // 기다림은 화면 갱신 시계(simT)를 따른다: 프레임이 멈추면 진행도 멈춘다
  const timers = [];
  const wait = (ms) => new Promise((r) => timers.push({ t: simT + ms / 1000 / speedK, r }));
  const save = loadSave();
  function loadSave() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem('orca_srpg_save2') || 'null'); } catch (e) { s = null; }
    const def = { clear: 0, heroes: {}, troops: {}, opts: { fight: true, fast: false, sound: true, autoEnd: true, bgmV: 70, sfxV: 80, voiceV: 90, blip: true, textSpd: 1 } };
    const defOpts = def.opts;
    s = Object.assign(def, s || {});
    s.opts = Object.assign({}, defOpts, s.opts || {}); // 예전 저장 기록에 없는 옵션은 기본값으로
    for (const id in D.HEROES) if (!s.heroes[id]) s.heroes[id] = { lv: 1, exp: 0, tier: 0 };
    return s;
  }
  function writeSave() { try { localStorage.setItem('orca_srpg_save2', JSON.stringify(save)); } catch (e) { /* 저장 불가 환경 */ } }
  // 옵션 적용: 소리 크기(배경음·효과음·음성), 글자 소리, 글자 속도, 빠른 진행
  function applyOpts() {
    const o = save.opts;
    AU.setOn(o.sound);
    AU.setVolume(o.bgmV / 100, o.sfxV / 100, o.voiceV / 100);
    AU.blipOn = o.blip;
    if (window.TALK) TALK.speed = [26, 42, 80][o.textSpd] || 42;
    speedK = o.fast ? 2 : 1;
  }
  applyOpts();

  // ── SD 리그 래퍼 ─────────────────────────────────────────
  // 발밑 중앙을 기준점으로 두고 키를 맞춘다. native: 원작 리그가 보는 방향 (아군 +1 오른쪽, 철충 -1 왼쪽)
  class Rig {
    constructor(id, height, native) {
      const t = SD.template(id);
      if (!t.shadowOff) {
        t.shadowOff = true;
        t.rends.forEach((r) => { if (/^(parts?_)?shadow( \(1\)|_1)?$/i.test(t.data.nodes[r.node].n)) r.broken = true; });
      }
      this.c = SD.create(id);
      this.k = height / t.height;
      this.cx = (t.box.min.x + t.box.max.x) / 2;
      this.by = t.box.min.y;
      this.native = native;
      this.g = new THREE.Group();
      this.g.add(this.c.root);
      this.cur = '';
      this.hold = false;
      this.face(1);
    }
    face(f) {
      this.f = f;
      const s = f * this.native;
      this.c.root.scale.set(this.k * s, this.k, 1);
      this.c.root.position.set(-this.cx * this.k * s, -this.by * this.k, 0);
    }
    dur(name) { const c = this.c.tpl.data.clips[name]; return c ? c.dur : 1; }
    loop(name, speed = 1) {
      if (this.cur === name && !this.hold) { this.c.speed = speed; return; }
      this.c.play(name, null, true);
      this.c.speed = speed; this.cur = name; this.hold = false;
    }
    once(name, speed = 1, hold = false, onEnd = null) {
      this.c.play(name, () => { this.cur = 'idle'; if (onEnd) onEnd(); });
      this.c.speed = speed; this.cur = name; this.hold = hold;
    }
    update(dt) {
      const c = this.c;
      if (!c.clip) return;
      if (this.hold) {
        const end = c.clip.dur - 0.02;
        if (c.time + dt * c.speed >= end) dt = Math.max(0, (end - c.time) / (c.speed || 1));
      }
      if (dt > 0) c.update(dt);
    }
    set order(o) { this.c.mesh.renderOrder = o; }
    dispose() { this.g.parent && this.g.parent.remove(this.g); this.c.dispose(); }
  }
  window.KIT = { Rig, tex, loadTex, AU };

  // ── 지도 그림 ───────────────────────────────────────────
  const TS = 96; // 지면 텍스처의 칸당 픽셀
  let G = null; // 현재 전투 상태 (RULES.newGame)
  let world = null; // 지도 3D 객체 묶음
  const isWaterC = (c) => c === 'w';
  const pathy = (c) => c === 'r' || c === '=' || c === 'v' || c === 'c';

  // 지도 바닥: 원작 전투 배경의 손그림 질감(assets/tiles, tools/build_tiles.py)을 지형별로 깔고 경계는 흐린 가면으로 섞는다
  const TILE_NAMES = ['grass', 'forest', 'dirt', 'asphalt', 'tree0', 'tree1', 'tree2', 'tree3', 'tree4', 'rock0', 'rock1', 'ruin0', 'ruin1', 'wall', 'sign', 'bags0', 'bags1', 'barrel', 'wreck0', 'wreck1', 'wreck2'];
  const TILE = {};
  function loadTiles() {
    return Promise.all(TILE_NAMES.map((n) => new Promise((r) => { const im = new Image(); im.onload = () => { TILE[n] = im; r(); }; im.onerror = r; im.src = `assets/tiles/${n}.webp`; })));
  }
  // 지도 밖 PAD 칸까지 지형을 이어 그린다: 화면이 빈 바탕 없이 꽉 차고, 못 가는 바깥은 어둡게 덮어 구분한다
  const PAD = 6;
  const OUTER = 0x171f14, OUTER_CSS = '#171f14'; // 늘린 지형 너머의 판 색 (어둡게 덮인 풀빛)
  function extendMap(G) {
    const w = G.w + PAD * 2, h = G.h + PAD * 2, map = [];
    const road = (c) => c === 'r' || c === '=';
    for (let y = 0; y < h; y++) {
      let row = '';
      for (let x = 0; x < w; x++) {
        const gx = x - PAD, gy = y - PAD;
        if (R.inB(G, gx, gy)) { row += G.map[gy][gx]; continue; }
        const cx = Math.max(0, Math.min(G.w - 1, gx)), cy = Math.max(0, Math.min(G.h - 1, gy));
        let c = G.map[cy][cx];
        const outX = gx !== cx, outY = gy !== cy;
        if (road(c)) {
          // 길·다리는 지도 끝에서 바깥으로 곧게 나가는 것만 잇는다 (끝줄을 따라 나란히 달리던 길은 넓은 판이 되지 않게)
          const ix = outX && !outY ? cx + (gx < 0 ? 1 : -1) : cx, iy = outY && !outX ? cy + (gy < 0 ? 1 : -1) : cy;
          const inner = R.inB(G, ix, iy) ? G.map[iy][ix] : null;
          c = outX && outY ? '.' : inner && (road(inner) || inner === 'v' || inner === 'c') ? (c === '=' ? '=' : 'r') : c === '=' ? 'w' : '.';
        } else if ('cvs#'.includes(c)) c = '.';
        else if (c === 'm') c = hash(x, y, 11) < 0.6 ? 'm' : 'h';
        if ((c === '.' || c === 'h') && hash(x, y, 12) > 0.72) c = 'f';
        else if (c === 'f' && hash(x, y, 13) > 0.8) c = '.';
        row += c;
      }
      map.push(row);
    }
    return { w, h, map };
  }
  function drawGround(G0) {
    const G = extendMap(G0);
    const c = canvas(G.w * TS, G.h * TS), g = c.getContext('2d');
    const at = (x, y) => (R.inB(G, x, y) ? G.map[y][x] : null);
    const PAT = (TS * 3) / 384; // 질감 한 장 = 3칸
    const fillTex = (ctx, name) => {
      const im = TILE[name];
      if (!im) { ctx.fillStyle = '#6a8a4a'; ctx.fillRect(0, 0, c.width, c.height); return; }
      const pat = ctx.createPattern(im, 'repeat');
      pat.setTransform(new DOMMatrix().scale(PAT));
      ctx.fillStyle = pat; ctx.fillRect(0, 0, c.width, c.height);
    };
    // 지형 칸들(또는 shapeFn 모양)의 흐린 가면 위에만 질감을 칠한다
    const mask = (test, blur, shapeFn) => {
      const m = canvas(c.width, c.height), mg = m.getContext('2d');
      mg.fillStyle = '#fff';
      if (shapeFn) shapeFn(mg);
      else for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) if (test(G.map[y][x])) mg.fillRect(x * TS - 2, y * TS - 2, TS + 4, TS + 4);
      const mb = canvas(c.width, c.height), bg = mb.getContext('2d');
      bg.filter = `blur(${blur}px)`; bg.drawImage(m, 0, 0); bg.filter = 'none';
      return mb;
    };
    const layer = (name, test, blur, shapeFn) => {
      const l = canvas(c.width, c.height), lg = l.getContext('2d');
      fillTex(lg, name);
      lg.globalCompositeOperation = 'destination-in'; lg.drawImage(mask(test, blur, shapeFn), 0, 0);
      g.drawImage(l, 0, 0);
    };
    const tint = (color, m) => {
      const l = canvas(c.width, c.height), lg = l.getContext('2d');
      lg.fillStyle = color; lg.fillRect(0, 0, c.width, c.height);
      lg.globalCompositeOperation = 'destination-in'; lg.drawImage(m, 0, 0);
      g.drawImage(l, 0, 0);
    };
    fillTex(g, 'grass');
    layer('forest', (t) => t === 'f', TS * 0.22);
    layer('dirt', (t) => t === 'm' || t === 's' || t === '#', TS * 0.2);
    layer('asphalt', (t) => t === 'c', TS * 0.12);
    // 언덕: 볼록한 빛과 그늘
    for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
      if (G.map[y][x] !== 'h') continue;
      const cx = x * TS + TS / 2, cy = y * TS + TS * 0.55;
      const rg = g.createRadialGradient(cx - TS * 0.12, cy - TS * 0.14, TS * 0.05, cx, cy, TS * 0.55);
      rg.addColorStop(0, 'rgba(255,250,200,.32)'); rg.addColorStop(0.6, 'rgba(255,250,200,.08)'); rg.addColorStop(1, 'rgba(40,50,10,0)');
      g.fillStyle = rg; g.beginPath(); g.ellipse(cx, cy, TS * 0.55, TS * 0.45, 0, 0, 7); g.fill();
      g.strokeStyle = 'rgba(60,70,20,.28)'; g.lineWidth = 3; g.beginPath(); g.ellipse(cx, cy + 4, TS * 0.46, TS * 0.34, 0, 0.15, Math.PI - 0.15); g.stroke();
    }
    // 길: 이어진 칸끼리 둥근 띠 모양. 가장자리 그늘을 먼저 깔고 아스팔트
    const roadShape = (w) => (mg) => {
      mg.strokeStyle = '#fff'; mg.lineCap = 'round'; mg.lineWidth = w;
      for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
        const t = G.map[y][x];
        if (t !== 'r' && t !== 'v') continue;
        const cx = x * TS + TS / 2, cy = y * TS + TS / 2;
        mg.beginPath(); mg.arc(cx, cy, w / 2, 0, 7); mg.fill();
        [[1, 0], [0, 1], [-1, 0], [0, -1]].forEach(([dx, dy]) => {
          const n = at(x + dx, y + dy);
          if (!n || !pathy(n)) return;
          mg.beginPath(); mg.moveTo(cx, cy); mg.lineTo(cx + (dx * TS) / 2, cy + (dy * TS) / 2); mg.stroke();
        });
      }
    };
    tint('rgba(45,38,20,.5)', mask(null, TS * 0.1, roadShape(TS * 0.76)));
    layer('asphalt', null, TS * 0.04, roadShape(TS * 0.62));
    tint('rgba(70,58,40,.22)', mask(null, TS * 0.04, roadShape(TS * 0.62)));
    // 물: 칸 모양이 드러나지 않게 흐린 가면으로 모래톱 → 얕은 물 → 깊은 물 순서로 겹친다
    const wet = (t) => t === 'w' || t === '=';
    if (G.map.some((r) => r.includes('w'))) {
      // 바다 칸 모양 (지도 끝에 닿은 칸은 바깥으로 늘려 끝에 물가가 생기지 않게)
      const grow = (pad) => (mg) => {
        for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
          if (!wet(G.map[y][x])) continue;
          const x0 = x === 0 ? -TS : x * TS - pad, y0 = y === 0 ? -TS : y * TS - pad;
          const x1 = x === G.w - 1 ? (x + 2) * TS : (x + 1) * TS + pad, y1 = y === G.h - 1 ? (y + 2) * TS : (y + 1) * TS + pad;
          mg.fillRect(x0, y0, x1 - x0, y1 - y0);
        }
      };
      tint('rgba(226,212,162,.95)', mask(null, TS * 0.18, grow(TS * 0.12)));
      const sea = canvas(c.width, c.height), sg = sea.getContext('2d');
      const lg = sg.createLinearGradient(0, 0, 0, c.height);
      lg.addColorStop(0, '#3484bb'); lg.addColorStop(1, '#2a6fa6');
      sg.fillStyle = lg; sg.fillRect(0, 0, c.width, c.height);
      sg.strokeStyle = 'rgba(200,235,255,.22)'; sg.lineWidth = 2; sg.lineCap = 'round';
      for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) for (let i = 0; i < 3; i++) {
        const px = x * TS, yy = y * TS + TS * (0.2 + i * 0.28) + hash(x, y, i) * 8;
        sg.beginPath(); sg.moveTo(px + 8 + hash(x, y, i + 4) * 14, yy); sg.quadraticCurveTo(px + TS * 0.4, yy - 5, px + TS * 0.62 + hash(x, y, i + 7) * 20, yy); sg.stroke();
      }
      // 물가는 밝은 얕은 물빛
      const shallow = canvas(c.width, c.height), shg = shallow.getContext('2d');
      shg.fillStyle = 'rgba(120,205,220,.55)'; shg.fillRect(0, 0, c.width, c.height);
      shg.globalCompositeOperation = 'destination-out'; shg.drawImage(mask(null, TS * 0.3, grow(1)), 0, 0); shg.drawImage(mask(null, TS * 0.3, grow(1)), 0, 0);
      sg.drawImage(shallow, 0, 0);
      sg.globalCompositeOperation = 'destination-in'; sg.drawImage(mask(null, TS * 0.06, grow(1)), 0, 0);
      g.drawImage(sea, 0, 0);
    }
    for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
      const t = G.map[y][x], px = x * TS, py = y * TS;
      if (t !== '=') continue;
      const horiz = !isWaterC(at(x - 1, y) || 'w') || !isWaterC(at(x + 1, y) || 'w') || at(x - 1, y) === '=' || at(x + 1, y) === '=';
      g.save(); g.translate(px + TS / 2, py + TS / 2); if (!horiz) g.rotate(Math.PI / 2);
      const pw = TS / 8;
      g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-TS / 2, -TS * 0.3 + 5, TS, TS * 0.6);
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#a0703e' : '#b5824a'; g.fillRect(-TS / 2 + i * pw, -TS * 0.3, pw * 0.9, TS * 0.6); }
      g.fillStyle = '#5e3c1c'; g.fillRect(-TS / 2, -TS * 0.33, TS, 5); g.fillRect(-TS / 2, TS * 0.29, TS, 5);
      g.restore();
    }
    // 소품 발밑 그림자 (지도에 붙어 보이게)
    for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
      const t = G.map[y][x];
      if (!'fm#cs'.includes(t)) continue;
      const cx = x * TS + TS / 2, cy = y * TS + TS * 0.72;
      const rg = g.createRadialGradient(cx, cy, 2, cx, cy, TS * 0.5);
      rg.addColorStop(0, `rgba(20,25,10,${t === 'f' ? 0.4 : 0.3})`); rg.addColorStop(1, 'rgba(20,25,10,0)');
      g.fillStyle = rg; g.beginPath(); g.ellipse(cx, cy, TS * 0.5, TS * 0.3, 0, 0, 7); g.fill();
    }
    // 격자 (지도 안만)
    const X0 = PAD * TS, Y0 = PAD * TS, X1 = (PAD + G0.w) * TS, Y1 = (PAD + G0.h) * TS;
    g.strokeStyle = 'rgba(0,0,0,.14)'; g.lineWidth = 1;
    for (let x = 0; x <= G0.w; x++) { g.beginPath(); g.moveTo(X0 + x * TS + 0.5, Y0); g.lineTo(X0 + x * TS + 0.5, Y1); g.stroke(); }
    for (let y = 0; y <= G0.h; y++) { g.beginPath(); g.moveTo(X0, Y0 + y * TS + 0.5); g.lineTo(X1, Y0 + y * TS + 0.5); g.stroke(); }
    // 못 가는 바깥: 어둡게 덮고 경계선
    g.save();
    g.beginPath(); g.rect(0, 0, c.width, c.height); g.rect(X0, Y0, X1 - X0, Y1 - Y0);
    g.fillStyle = 'rgba(8,12,20,.5)'; g.fill('evenodd');
    g.restore();
    for (const [x, y, w, h, gx0, gy0, gx1, gy1] of [[X0, Y0, X1 - X0, TS * 0.4, 0, Y0, 0, Y0 + TS * 0.4], [X0, Y1 - TS * 0.4, X1 - X0, TS * 0.4, 0, Y1, 0, Y1 - TS * 0.4],
      [X0, Y0, TS * 0.4, Y1 - Y0, X0, 0, X0 + TS * 0.4, 0], [X1 - TS * 0.4, Y0, TS * 0.4, Y1 - Y0, X1, 0, X1 - TS * 0.4, 0]]) {
      const lg = g.createLinearGradient(gx0, gy0, gx1, gy1);
      lg.addColorStop(0, 'rgba(0,0,0,.28)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = lg; g.fillRect(x, y, w, h);
    }
    g.strokeStyle = 'rgba(255,224,140,.85)'; g.lineWidth = 4; g.setLineDash([18, 10]);
    g.strokeRect(X0 + 2, Y0 + 2, X1 - X0 - 4, Y1 - Y0 - 4);
    g.setLineDash([]);
    // 맨 끝은 바깥 판 색으로 사라진다 (그 너머까지 보여도 끊긴 데가 없게)
    const F = TS * 2.5;
    for (const [gx0, gy0, gx1, gy1, x, y, w, h] of [[0, 0, 0, F, 0, 0, c.width, F], [0, c.height, 0, c.height - F, 0, c.height - F, c.width, F],
      [0, 0, F, 0, 0, 0, F, c.height], [c.width, 0, c.width - F, 0, c.width - F, 0, F, c.height]]) {
      const lg = g.createLinearGradient(gx0, gy0, gx1, gy1);
      lg.addColorStop(0, OUTER_CSS); lg.addColorStop(1, 'rgba(23,31,20,0)');
      g.fillStyle = lg; g.fillRect(x, y, w, h);
    }
    return c;
  }

  // 장식: 원작 소품 그림 (나무·바위 더미·무너진 건물·모래주머니·철충 잔해)
  const DECO = {};
  function decoTex() {
    if (DECO.tree) return;
    const tex = (n) => { const im = TILE[n]; const t = new THREE.Texture(im); t.needsUpdate = true; t.anisotropy = 4; t.aspect = im ? im.width / im.height : 1; return t; };
    DECO.tree = ['tree0', 'tree1', 'tree2', 'tree3', 'tree4'].map(tex);
    DECO.mount = ['rock0', 'rock1'].map(tex);
    DECO.rubble = ['ruin0', 'ruin1', 'wall'].map(tex);
    DECO.ruins = ['wreck0', 'wreck1', 'wreck2', 'sign', 'wall'].map(tex);
    DECO.camp = ['bags0', 'bags1', 'barrel'].map(tex);
  }
  // 그림 비율대로 높이 h 인 소품
  const prop = (t, h, x, z, night) => sprite(t, h * t.aspect, h, x, z, night);

  function sprite(t, w, h, x, z, night) {
    const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, color: night ? 0x8a96c8 : 0xffffff });
    const s = new THREE.Sprite(m);
    s.center.set(0.5, 0.06);
    s.scale.set(w, h, 1);
    s.position.set(x, 0, z);
    s.renderOrder = 100 + Math.round(z * 20);
    return s;
  }

  function buildWorld() {
    if (world) { scene.remove(world.root); world.dispose(); }
    decoTex();
    const root = new THREE.Group();
    const night = !!G.stage.night;
    // 바닥 바깥 (어두운 판)
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(G.w + 80, G.h + 80), new THREE.MeshBasicMaterial({ color: night ? 0x0b0f1a : OUTER }));
    outer.rotation.x = -Math.PI / 2; outer.position.set(G.w / 2, -0.02, G.h / 2);
    root.add(outer);
    // 지면
    const gc = drawGround(G);
    const gt = new THREE.CanvasTexture(gc);
    gt.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(G.w + PAD * 2, G.h + PAD * 2), new THREE.MeshBasicMaterial({ map: gt, color: night ? 0x7c88b8 : 0xffffff }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(G.w / 2, 0, G.h / 2);
    root.add(ground);
    // 물결 (움직이는 겹 무늬)
    const waveT = canvasTex(128, 128, (g) => {
      g.strokeStyle = 'rgba(220,240,255,.55)'; g.lineWidth = 2; g.lineCap = 'round';
      for (let i = 0; i < 9; i++) { const x = (i * 47) % 128, y = (i * 29) % 128; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 8, y - 4, x + 18, y); g.stroke(); }
    });
    waveT.wrapS = waveT.wrapT = THREE.RepeatWrapping;
    const wpos = [], wuv = [];
    for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
      if (G.map[y][x] !== 'w') continue;
      const q = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y], [x + 1, y + 1], [x, y + 1]];
      for (const [a, b] of q) { wpos.push(a, 0.005, b); wuv.push(a * 0.5, -b * 0.5); }
    }
    let water = null;
    if (wpos.length) {
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
      wg.setAttribute('uv', new THREE.Float32BufferAttribute(wuv, 2));
      water = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ map: waveT, transparent: true, opacity: 0.6, depthWrite: false }));
      water.renderOrder = 1;
      root.add(water);
    }
    // 겹쳐 그리는 판: 이동·공격 범위, 지휘 범위
    const OS = 32;
    const oc = canvas(G.w * OS, G.h * OS);
    const ot = new THREE.CanvasTexture(oc);
    const overlay = new THREE.Mesh(new THREE.PlaneGeometry(G.w, G.h), new THREE.MeshBasicMaterial({ map: ot, transparent: true, depthWrite: false, depthTest: false }));
    overlay.rotation.x = -Math.PI / 2; overlay.position.set(G.w / 2, 0.01, G.h / 2);
    overlay.renderOrder = 2;
    root.add(overlay);
    // 커서
    const curT = canvasTex(64, 64, (g) => {
      g.strokeStyle = '#ffe9a8'; g.lineWidth = 6; g.lineCap = 'round';
      const L = 18;
      [[4, 4, 1, 1], [60, 4, -1, 1], [4, 60, 1, -1], [60, 60, -1, -1]].forEach(([x, y, sx, sy]) => { g.beginPath(); g.moveTo(x, y + sy * L); g.lineTo(x, y); g.lineTo(x + sx * L, y); g.stroke(); });
    });
    const cursor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: curT, transparent: true, depthTest: false, depthWrite: false }));
    cursor.rotation.x = -Math.PI / 2; cursor.renderOrder = 3; cursor.visible = false;
    root.add(cursor);
    // 장식
    const decos = [];
    for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
      const t = G.map[y][x];
      if (t === 'f') {
        const n = 2 + (hash(x, y, 7) > 0.55 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const ox = [0.3, 0.72, 0.5][i] + (hash(x, y, i) - 0.5) * 0.14, oz = [0.38, 0.52, 0.86][i] + (hash(x, y, i + 3) - 0.5) * 0.08;
          const k = Math.floor(hash(x, y, i + 1) * 5), small = k >= 3;
          decos.push(prop(DECO.tree[k], (small ? 0.62 : 0.86) + hash(x, y, i + 9) * 0.14, x + ox, y + oz, night));
        }
      } else if (t === 'm') {
        decos.push(prop(DECO.mount[hash(x, y, 2) > 0.5 ? 1 : 0], 0.62, x + 0.5, y + 0.8, night));
      } else if (t === '#') {
        const k = Math.floor(hash(x, y, 4) * 3);
        decos.push(prop(DECO.rubble[k], k === 2 ? 0.95 : 0.5, x + 0.5, y + 0.82, night));
      } else if (t === 's') {
        const r = hash(x, y, 5);
        if (r < 0.55) decos.push(prop(DECO.ruins[Math.floor(hash(x, y, 6) * 3)], 0.42, x + 0.3 + hash(x, y, 8) * 0.4, y + 0.74, night));
        else if (r < 0.7) decos.push(prop(DECO.ruins[3], 0.62, x + 0.7, y + 0.6, night));
        else if (r < 0.82) decos.push(prop(DECO.ruins[4], 0.7, x + 0.3, y + 0.62, night));
      } else if (t === 'c') {
        decos.push(prop(DECO.camp[hash(x, y, 3) > 0.5 ? 1 : 0], 0.36, x + 0.5, y + 0.88, night));
        if (hash(x, y, 9) > 0.6) decos.push(prop(DECO.camp[2], 0.34, x + 0.18, y + 0.5, night));
      }
    }
    // 지도 밖 숲·바위 (어둡게)
    const E = extendMap(G);
    for (let y = 0; y < E.h; y++) for (let x = 0; x < E.w; x++) {
      const gx = x - PAD, gy = y - PAD;
      if (R.inB(G, gx, gy)) continue;
      const t = E.map[y][x], dim = [];
      if (t === 'f') {
        const n = 1 + (hash(x, y, 7) > 0.5 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const k = Math.floor(hash(x, y, i + 1) * 5);
          dim.push(prop(DECO.tree[k], 0.7 + hash(x, y, i + 9) * 0.2, gx + [0.35, 0.7][i] + (hash(x, y, i) - 0.5) * 0.2, gy + [0.45, 0.8][i], night));
        }
      } else if (t === 'm') dim.push(prop(DECO.mount[hash(x, y, 2) > 0.5 ? 1 : 0], 0.62, gx + 0.5, gy + 0.8, night));
      dim.forEach((s) => { s.material.color.multiplyScalar(0.55); decos.push(s); });
    }
    decos.forEach((s) => root.add(s));
    scene.add(root);
    world = {
      root, oc, ot, overlay, cursor, water, ground,
      dispose() {
        root.traverse((o) => { if (Array.isArray(o.material) || o.userData.keep) return; if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map && !Object.values(texCache).includes(o.material.map) && !isDeco(o.material.map)) o.material.map.dispose(); if (o.material) o.material.dispose(); });
      },
    };
  }
  const isDeco = (t) => Object.values(DECO).flat().includes(t);

  // ── 유닛 표시 ───────────────────────────────────────────
  // 한 칸 = 영웅(큰 리그) + 뒤쪽 병사 2명(작은 리그). 발밑 고리 색 = 진영, 앞쪽 막대 = 병사(위)·영웅(아래) 체력
  const views = new Map(); // uid -> 표시 객체
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  const ringTex = {};
  function getRingTex(side, big) {
    const k = side + big;
    if (ringTex[k]) return ringTex[k];
    return (ringTex[k] = canvasTex(128, 128, (g) => {
      const c = side === 'p' ? '74,168,255' : '255,90,80';
      const rg = g.createRadialGradient(64, 64, 10, 64, 64, 62);
      rg.addColorStop(0, 'rgba(0,0,0,.45)'); rg.addColorStop(0.6, `rgba(${c},.35)`); rg.addColorStop(0.85, `rgba(${c},.9)`); rg.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = rg; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
      if (big) { g.strokeStyle = 'rgba(255,215,106,.95)'; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 50, 0, 7); g.stroke(); }
    }));
  }
  function billboard(rigId, h, native, f) {
    const bb = new THREE.Group();
    const rig = new Rig(rigId, h, native);
    rig.face(f);
    rig.loop('idle');
    rig.c.time = Math.random() * 2;
    bb.add(rig.g);
    bb.quaternion.copy(camera.quaternion);
    return { bb, rig };
  }
  function addView(u) {
    const g = new THREE.Group();
    const native = u.side === 'p' ? 1 : -1, f = u.side === 'p' ? 1 : -1;
    const hero = billboard(u.rig, (u.def.big ? 1.2 : 0.88) * (u.def.sizeK || 1), native, f);
    hero.bb.position.set(0, 0, 0.12);
    g.add(hero.bb);
    const soldiers = [];
    if (u.troop) for (const [ox, oz] of [[-0.34, -0.2], [0.34, -0.26]]) {
      const s = billboard(u.troop.rig, 0.58, native, f);
      s.bb.position.set(ox, 0, oz);
      g.add(s.bb);
      soldiers.push(s);
    }
    const big = !!(u.lead || u.boss || u.def.big);
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: getRingTex(u.side, big), transparent: true, depthTest: false, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012; ring.renderOrder = 4;
    g.add(ring);
    const bc = canvas(112, 40);
    const bt = new THREE.CanvasTexture(bc);
    const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: bt, depthTest: false, transparent: true }));
    badge.scale.set(0.62, 0.22, 1);
    badge.center.set(0.5, 0.5);
    badge.position.set(0, 0.02, 0.5);
    badge.renderOrder = 5000;
    g.add(badge);
    g.position.set(u.x + 0.5, 0, u.y + 0.5);
    world.root.add(g);
    const v = { u, g, bb: hero.bb, rig: hero.rig, soldiers, ring, badge, bc, bt, bob: Math.random() * 6 };
    views.set(u.uid, v);
    refreshView(u);
    return v;
  }
  function drawBadge(v) {
    const u = v.u, g = v.bc.getContext('2d'), W = v.bc.width;
    const acted = u.acted && u.side === G.side && u.side === 'p';
    g.clearRect(0, 0, W, 40);
    g.fillStyle = 'rgba(0,0,0,.6)'; rr(g, 0, 2, W, 36, 8); g.fill();
    const bar = (y, k, c0, c1) => {
      g.fillStyle = '#1a2036'; rr(g, 16, y, W - 22, 11, 4); g.fill();
      if (k > 0) { const lg = g.createLinearGradient(16, 0, W - 6, 0); lg.addColorStop(0, acted ? '#777' : c0); lg.addColorStop(1, acted ? '#999' : c1); g.fillStyle = lg; rr(g, 16, y, Math.max(6, (W - 22) * k), 11, 4); g.fill(); }
    };
    if (u.troop) bar(8, u.troop.hp / u.troop.hpMax, u.side === 'p' ? '#3a8cff' : '#ff8a3a', u.side === 'p' ? '#9cd0ff' : '#ffc890');
    bar(u.troop ? 22 : 15, u.hp / u.hpMax, u.side === 'p' ? '#2fc46c' : '#e8402f', u.side === 'p' ? '#9dffbc' : '#ff9a8a');
    g.fillStyle = u.lead || u.boss ? '#ffd76a' : D.KIND[R.troopAlive(u) ? u.troop.kind : u.kind].color;
    g.font = 'bold 16px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(u.troop ? String(R.soldiers(u)) : (u.lead || u.boss ? '★' : '●'), 9, 21);
    v.bt.needsUpdate = true;
  }
  function refreshView(u) {
    const v = views.get(u.uid);
    if (!v) return;
    drawBadge(v);
    const dim = u.acted && u.side === G.side && u.side === 'p';
    const k = u.troop && u.troop.hp > 0 ? (u.troop.hp / u.troop.hpMax > 0.5 ? 2 : 1) : 0;
    v.soldiers.forEach((s, i) => { s.bb.visible = i < k; });
    for (const r of [v.rig, ...v.soldiers.map((s) => s.rig)]) r.c.setTint(dim ? 0.5 : 1, dim ? 0.5 : 1, dim ? 0.58 : 1);
  }
  function removeView(u) {
    const v = views.get(u.uid);
    if (!v) return;
    v.rig.dispose();
    v.soldiers.forEach((s) => s.rig.dispose());
    v.g.parent && v.g.parent.remove(v.g);
    v.ring.material.dispose(); v.ring.geometry.dispose(); v.badge.material.dispose(); v.bt.dispose();
    views.delete(u.uid);
  }
  function clearViews() { for (const v of [...views.values()]) removeView(v.u); }
  const tilePos = (x, y) => new THREE.Vector3(x + 0.5, 0, y + 0.5);
  function faceTo(u, x) {
    const v = views.get(u.uid);
    if (!v || x === u.x) return;
    const f = x > u.x ? 1 : -1;
    v.rig.face(f);
    v.soldiers.forEach((s) => s.rig.face(f));
  }

  // 화면 좌표
  function toScreen(p) {
    const v = p.clone().project(camera);
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
  }
  function pop(x, y, text, cls = 'dmg', dy = 0.9) {
    const s = toScreen(new THREE.Vector3(x + 0.5, dy, y + 0.5));
    const e = document.createElement('div');
    e.className = 'pop ' + cls;
    e.textContent = text;
    e.style.left = s.x + 'px'; e.style.top = s.y + 'px';
    $('pops').appendChild(e);
    setTimeout(() => e.remove(), 1200);
  }
  // 피해 표시: 병사(주황)·영웅(빨강)
  function popDmg(u, t, h) {
    if (t > 0) { const lost = R.soldiers(u, u.troop.hp + t) - R.soldiers(u); pop(u.x, u.y, lost > 0 ? `병사 -${lost}명` : '병사 -' + Math.round(t), 'tdmg', 1.15); }
    if (h > 0) wait(140).then(() => pop(u.x, u.y, '-' + Math.round(h), 'dmg', 0.8));
  }

  // 지도 위 이펙트
  const mapFx = [];
  function fxAt(x, y, kind, delay = 0) {
    const map = { fire: 'fx_firehit', bolt: 'fx_bolt', heal: 'fx_glow', buff: 'fx_ring', shield: 'fx_ring', slash: 'fx_cross', laser: 'fx_glow', shot: 'fx_spark', spawn: 'fx_ring', hit: 'fx_spark' }[kind] || 'fx_glow';
    const col = { heal: 0x70ff9a, buff: 0xffc14d, shield: 0x7fc8ff, laser: 0xff7ad5, spawn: 0xff6655 }[kind] || 0xffffff;
    wait(delay).then(() => {
      if (!world) return;
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(map), color: col, transparent: true, depthTest: false, blending: THREE.AdditiveBlending }));
      m.center.set(0.5, 0.3);
      m.position.set(x + 0.5, kind === 'bolt' ? 0.3 : 0.35, y + 0.55);
      m.renderOrder = 4500;
      const s0 = kind === 'bolt' ? 1.6 : 0.9;
      m.scale.set(s0, s0, 1);
      world.root.add(m);
      mapFx.push({ m, t: 0, life: 0.6, s0 });
    });
  }

  // ── 카메라 맞춤·이동 ─────────────────────────────────────
  function insets() {
    const port = innerHeight > innerWidth;
    const top = 52;
    let bottom = 8, left = 0, right = 0;
    if (port) bottom = Math.min(260, innerHeight * 0.3);
    return { top, bottom, left, right };
  }
  function fitCamera(focusLead) {
    const ins = insets();
    const aw = innerWidth - ins.left - ins.right, ah = innerHeight - ins.top - ins.bottom;
    const needW = G.w + 0.4, needH = G.h * Math.sin(TILT) + 1.3;
    // 다 보이게(fit) 하되 칸이 너무 작으면 한 방향을 꽉 채우고(fill) 나머지는 끌어서 본다
    const fit = Math.min(aw / needW, ah / needH), fill = Math.max(aw / needW, ah / needH);
    cam.fitZoom = fit * VIEW_H / innerHeight;
    let ppw = fit < 46 ? Math.max(fit, Math.min(fill, 60)) : fit;
    cam.zoom = ppw * VIEW_H / innerHeight;
    cam.minZoom = Math.min(cam.fitZoom, cam.zoom) * 0.9;
    cam.maxZoom = (110 * VIEW_H) / innerHeight;
    // 사용 가능 영역 가운데에 지도 중심이 오도록
    const wpp = VIEW_H / (innerHeight * cam.zoom);
    const offY = (ins.top - ins.bottom) / 2 * wpp / Math.sin(TILT);
    cam.x = G.w / 2; cam.z = G.h / 2 - 0.35 - offY;
    if (focusLead) { // 화면에 다 들어가지 않는 방향만 라비아타 쪽으로
      const lead = G.units.find((u) => u.lead && u.alive);
      if (lead && needW * ppw > aw) cam.x = lead.x + 0.5;
      if (lead && needH * ppw > ah) cam.z = lead.y + 0.5 - offY;
    }
    clampCam();
    placeCamera();
  }
  function clampCam() {
    cam.x = Math.max(-0.5, Math.min(G.w + 0.5, cam.x));
    cam.z = Math.max(-0.5, Math.min(G.h + 1, cam.z));
  }
  function panTo(x, y, force) { // 칸이 화면 밖이면 부드럽게 옮긴다
    const s = toScreen(tilePos(x, y));
    const ins = insets();
    const m = 70;
    if (!force && s.x > m && s.x < innerWidth - m && s.y > ins.top + m && s.y < innerHeight - ins.bottom - m) return;
    const wpp = VIEW_H / (innerHeight * cam.zoom);
    const offY = (ins.top - ins.bottom) / 2 * wpp / Math.sin(TILT);
    cam.tx = x + 0.5; cam.tz = y + 0.5 - offY;
  }

  // ── 입력 ─────────────────────────────────────────────────
  const ptrs = new Map();
  let drag = null, pinch = null, hoverTile = null;
  const ray = new THREE.Raycaster();
  function pickTile(cx, cy) {
    const ndc = new THREE.Vector2(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    if (Math.abs(d.y) < 1e-6) return null;
    const t = -o.y / d.y;
    const x = Math.floor(o.x + d.x * t), y = Math.floor(o.z + d.z * t);
    return G && R.inB(G, x, y) ? [x, y] : null;
  }
  const cv = renderer.domElement;
  cv.addEventListener('contextmenu', (e) => { e.preventDefault(); if (mode === 'map') cancel(); });
  cv.addEventListener('pointerdown', (e) => {
    if (mode !== 'map') return;
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
    if (ptrs.size === 1) drag = { moved: false, x: e.clientX, y: e.clientY, btn: e.button };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.zoom }; drag && (drag.moved = true); }
  });
  cv.addEventListener('pointermove', (e) => {
    if (mode !== 'map') return;
    const p = ptrs.get(e.pointerId);
    if (!p) { // 마우스 올려두기
      if (e.pointerType === 'mouse') { const t = pickTile(e.clientX, e.clientY); if (!t || !hoverTile || t[0] !== hoverTile[0] || t[1] !== hoverTile[1]) { hoverTile = t; onHover(t); } }
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      cam.zoom = Math.max(cam.minZoom, Math.min(cam.maxZoom, pinch.z * d / pinch.d));
      placeCamera();
      return;
    }
    if (drag && (Math.abs(p.x - p.x0) + Math.abs(p.y - p.y0) > 9)) drag.moved = true;
    if (drag && drag.moved) {
      const wpp = VIEW_H / (innerHeight * cam.zoom);
      cam.x -= dx * wpp; cam.z -= dy * wpp / Math.sin(TILT);
      cam.tx = cam.tz = null;
      clampCam(); placeCamera();
    }
  });
  const endPtr = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 0) {
      if (drag && !drag.moved && mode === 'map') {
        if (drag.btn === 2) cancel();
        else { const t = pickTile(e.clientX, e.clientY); if (t) onTap(t[0], t[1]); }
      }
      drag = null;
    }
  };
  cv.addEventListener('pointerup', endPtr);
  cv.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); drag = null; pinch = null; });
  cv.addEventListener('wheel', (e) => {
    if (mode !== 'map') return;
    e.preventDefault();
    cam.zoom = Math.max(cam.minZoom, Math.min(cam.maxZoom, cam.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    placeCamera();
  }, { passive: false });
  // 치트: 타이틀에서 "치트활성화온"을 치면 켜진다. 한글·영문 입력 상태와 상관없이 눌린 자판 위치(e.code)로 알아본다
  // (두벌식: 치=cl 트=xm 활=ghkf 성=tjd 화=ghk 온=dhs). 켜진 뒤 전투 중 Y = 적을 모두 지우고 바로 승리
  const CHEAT_KEYS = 'clxmghkftjdghkdhs';
  // 챕터 목록 (지금은 1장만. 2장을 넣으면 H/J 치트로 오갈 수 있다)
  const CHAPTERS = [{ id: 'ch01', name: '1장 지구의 마지막 인간' }];
  let cheatBuf = '', cheatWin = false;
  function toast(msg) {
    let t = $('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.remove('on'); void t.offsetWidth; t.classList.add('on');
  }
  async function cheatClear() {
    if (cheatWin || !G || !G.stage) return;
    cheatWin = true;
    if (FIGHT.active()) FIGHT.skip();
    for (const u of G.units) if (u.side === 'e' && u.alive) { u.alive = false; const v = views.get(u.uid); if (v) v.g.visible = false; }
    toast('치트: 전투 자동 클리어');
    await endStage(true, '치트로 자동 클리어');
    cheatWin = false;
  }
  addEventListener('keydown', (e) => {
    if (/^Key[A-Z]$/.test(e.code)) {
      cheatBuf = (cheatBuf + e.code[3].toLowerCase()).slice(-CHEAT_KEYS.length);
      if (cheatBuf === CHEAT_KEYS && $('screen').querySelector('.title2')) {
        save.cheat = !save.cheat; writeSave(); cheatBuf = '';
        AU.play('lo_join', 0.7);
        toast(save.cheat ? '치트 활성화 · 전투 중 Y = 자동 클리어' : '치트 비활성화');
        return;
      }
      if (e.code === 'KeyY' && save.cheat && G && (mode === 'map' || mode === 'fight')) { e.preventDefault(); cheatClear(); return; }
      // 월드맵 치트: U 모든 지점 열기, H/J 이전·다음 챕터
      if (save.cheat && mode === 'screen' && $('screen').querySelector('.wscr')) {
        if (e.code === 'KeyU') {
          save.clear = D.STAGES.length; writeSave();
          AU.play('lo_join', 0.6); toast('치트: 월드맵 모든 지점 열림');
          stageSelect(); return;
        }
        if (e.code === 'KeyH' || e.code === 'KeyJ') {
          const to = (save.chapter || 0) + (e.code === 'KeyH' ? -1 : 1);
          if (to < 0 || to >= CHAPTERS.length) { toast(e.code === 'KeyH' ? '이전 챕터가 없습니다' : '다음 챕터가 없습니다 (지금은 1장만 있음)'); return; }
          save.chapter = to; writeSave();
          toast(`치트: ${CHAPTERS[to].name}(으)로 이동`); stageSelect(); return;
        }
      }
    }
    // ESC = 뒤로: 창 닫기 → 정보 창 닫기 → 앞 화면으로
    if (e.code === 'Escape' && mode !== 'talk' && mode !== 'fight') {
      const m = $('modal');
      if (!m.classList.contains('hidden')) { e.preventDefault(); m.click(); return; }
      if (mode === 'town') { const out = document.querySelector('#townHud .tn-out'); if (out) out.click(); return; }
      if (mode === 'screen') {
        const info = $('screen').querySelector('.wscr .winfo.on'); // 전환용으로 복제해 둔 옛 화면(#wipeOld)은 빼고
        if (info) { info.classList.remove('on'); return; }
        const back = $('screen').querySelector('#pBack, #sBack');
        if (back) { e.preventDefault(); back.click(); }
        return;
      }
    }
    if (mode === 'talk') { if (['Enter', 'Space', 'KeyZ'].includes(e.code)) TALK.next(); if (e.code === 'Escape') TALK.askSkip(); return; }
    if (mode === 'fight') { if (['Enter', 'Space', 'Escape', 'KeyZ'].includes(e.code)) FIGHT.skip(); return; }
    if (mode !== 'map') return;
    const k = e.code;
    if (!kcur) kcur = [Math.floor(G.w / 2), Math.floor(G.h / 2)];
    const mv = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0] }[k];
    if (mv) { e.preventDefault(); kcur = [Math.max(0, Math.min(G.w - 1, kcur[0] + mv[0])), Math.max(0, Math.min(G.h - 1, kcur[1] + mv[1]))]; hoverTile = kcur; onHover(kcur); panTo(kcur[0], kcur[1]); }
    else if (k === 'Enter' || k === 'Space' || k === 'KeyZ') { e.preventDefault(); if (ui.state === 'forecast') confirmAttack(); else onTap(kcur[0], kcur[1]); }
    else if (k === 'Escape' || k === 'KeyX' || k === 'Backspace') { if (ui.state === 'idle' && !busy) openMenu(); else cancel(); }
    else if (k === 'KeyE') endTurnAsk();
    else if (k === 'KeyD') toggleDanger();
    else if (k === 'KeyQ') setAuto(!autoOn);
  });
  let kcur = null;

  // ── 겹침 판 그리기 ───────────────────────────────────────
  const OV = { move: null, atk: null, aura: null, skill: null, area: null, danger: null, path: null, targets: null };
  function drawOverlay() {
    if (!world) return;
    const OS = 32, g = world.oc.getContext('2d');
    g.clearRect(0, 0, world.oc.width, world.oc.height);
    const fillTiles = (list, fill, stroke) => {
      if (!list) return;
      for (const [x, y] of list) {
        g.fillStyle = fill; rr(g, x * OS + 1.5, y * OS + 1.5, OS - 3, OS - 3, 5); g.fill();
        if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.5; g.stroke(); }
      }
    };
    if (OV.danger) fillTiles(OV.danger, 'rgba(255,60,70,.22)', 'rgba(255,90,90,.35)');
    if (OV.aura) {
      const set = new Set(OV.aura.map(([x, y]) => x + ',' + y));
      g.fillStyle = 'rgba(255,214,100,.16)';
      for (const [x, y] of OV.aura) g.fillRect(x * OS, y * OS, OS, OS);
      g.strokeStyle = 'rgba(255,214,100,.95)'; g.lineWidth = 2.5;
      for (const [x, y] of OV.aura) {
        if (!set.has(x + ',' + (y - 1))) { g.beginPath(); g.moveTo(x * OS, y * OS + 1); g.lineTo(x * OS + OS, y * OS + 1); g.stroke(); }
        if (!set.has(x + ',' + (y + 1))) { g.beginPath(); g.moveTo(x * OS, y * OS + OS - 1); g.lineTo(x * OS + OS, y * OS + OS - 1); g.stroke(); }
        if (!set.has((x - 1) + ',' + y)) { g.beginPath(); g.moveTo(x * OS + 1, y * OS); g.lineTo(x * OS + 1, y * OS + OS); g.stroke(); }
        if (!set.has((x + 1) + ',' + y)) { g.beginPath(); g.moveTo(x * OS + OS - 1, y * OS); g.lineTo(x * OS + OS - 1, y * OS + OS); g.stroke(); }
      }
    }
    fillTiles(OV.atk, 'rgba(255,70,70,.32)', 'rgba(255,120,120,.6)');
    fillTiles(OV.move, 'rgba(70,150,255,.38)', 'rgba(160,210,255,.75)');
    fillTiles(OV.skill, 'rgba(150,70,255,.42)', 'rgba(220,180,255,.9)');
    fillTiles(OV.area, 'rgba(255,150,50,.55)', 'rgba(255,220,150,.95)');
    fillTiles(OV.targets, 'rgba(255,40,40,.5)', 'rgba(255,200,200,.95)');
    if (OV.path && OV.path.length > 1) {
      g.strokeStyle = 'rgba(255,240,180,.95)'; g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath();
      OV.path.forEach(([x, y], i) => { const px = x * OS + OS / 2, py = y * OS + OS / 2; if (i) g.lineTo(px, py); else g.moveTo(px, py); });
      g.stroke();
      const [ex, ey] = OV.path[OV.path.length - 1];
      g.fillStyle = 'rgba(255,240,180,.95)'; g.beginPath(); g.arc(ex * OS + OS / 2, ey * OS + OS / 2, 6, 0, 7); g.fill();
    }
    world.ot.needsUpdate = true;
  }
  function clearOv(keepDanger = true) { for (const k in OV) if (!(keepDanger && k === 'danger')) OV[k] = null; drawOverlay(); }
  // 이동 칸 + 그 칸들에서 칠 수 있는 칸
  function ranges(u, reach) {
    const mv = [], atk = new Map();
    for (const t of reach.values()) {
      if (t.stop) mv.push([t.x, t.y]);
      if (!t.stop) continue;
      for (let dy = -u.rng; dy <= u.rng; dy++) for (let dx = -u.rng; dx <= u.rng; dx++) {
        const d = Math.abs(dx) + Math.abs(dy);
        if (d < 1 || d > u.rng) continue;
        const x = t.x + dx, y = t.y + dy;
        if (R.inB(G, x, y)) atk.set(x + ',' + y, [x, y]);
      }
    }
    const mvSet = new Set(mv.map(([x, y]) => x + ',' + y));
    return { mv, atk: [...atk.values()].filter(([x, y]) => !mvSet.has(x + ',' + y)) };
  }
  let dangerOn = false;
  function toggleDanger() {
    dangerOn = !dangerOn;
    $('btnDanger').classList.toggle('on', dangerOn);
    updateDanger();
  }
  function updateDanger() {
    if (!dangerOn || !G) { OV.danger = null; drawOverlay(); return; }
    const all = new Map();
    for (const u of G.units) {
      if (!u.alive || u.side !== 'e') continue;
      const rg = ranges(u, R.reach(G, u));
      for (const t of [...rg.mv, ...rg.atk]) all.set(t[0] + ',' + t[1], t);
    }
    OV.danger = [...all.values()];
    drawOverlay();
  }

  // ── 화면 요소 (정보·행동·예상) ───────────────────────────
  const ui = { state: 'idle', sel: null, reach: null, from: null, target: null, skill: null, skillTile: null };
  let busy = false;
  let mode = 'boot'; // boot | screen | talk | map | fight
  function setHint(t) { $('hint').textContent = t || ''; }
  const kindTag = (k) => `<span class="kind" style="color:${D.KIND[k].color}">${D.KIND[k].name}</span>`;
  const bars = (u) => `<div class="bars2 ${u.side}">${u.troop ? `<div class="bar2 t"><i style="width:${(u.troop.hp / u.troop.hpMax) * 100}%"></i><b>병사 ${R.soldiers(u)}/10명 · ${Math.round(u.troop.hp)}</b></div>` : ''}<div class="bar2 h"><i style="width:${(u.hp / u.hpMax) * 100}%"></i><b>영웅 ${Math.round(u.hp)} / ${u.hpMax}</b></div></div>`;
  function showInfo(u, tile) {
    const el = $('info');
    if (!u && !tile) { el.classList.add('hidden'); syncInfoH(); return; }
    if (!u) {
      const t = R.terr(G, tile[0], tile[1]);
      const cs = (v) => (v >= 99 ? '불가' : v);
      el.innerHTML = `<div class="pic" style="background:#203050"></div><div class="nm">${t.name}</div>
        <div class="st">방어 보정 <b>${t.def > 0 ? '+' : ''}${Math.round(t.def * 100)}%</b>${t.heal ? ' · 차례 시작 시 체력 <b>+' + Math.round(t.heal * 100) + '%</b>' : ''}</div>
        <div class="st">이동 소모: 보병 <b>${cs(t.cost.foot)}</b> · 기동 <b>${cs(t.cost.horse)}</b> · 비행 <b>${cs(t.cost.fly)}</b></div>`;
      el.classList.remove('hidden'); syncInfoH(); return;
    }
    const t = R.terr(G, u.x, u.y);
    const pct = (k) => { const b = R.buffK(u, k); return b > 1.001 ? ` <span class="up">(+${Math.round((b - 1) * 100)}%)</span>` : ''; };
    const sk = R.skillsOf(u).map((s) => D.SKILLS[s].name + (u.cd[s] > 0 ? `<span class="cd">(${u.cd[s]})</span>` : '')).join(', ') || '없음';
    const troopLine = u.troop ? `<div class="tline"><img src="${IMG[u.troop.icon]}">${u.troop.name} ${kindTag(u.troop.kind)} 공격 <b>${Math.round(R.atk(u, 'T'))}</b> · 방어 <b>${Math.round(R.def(u, 'T'))}</b></div>` : '<div class="tline">병사 없음</div>';
    el.innerHTML = `<div class="pic ${u.side}" style="background-image:url(${IMG[u.icon]})"><span class="lv">Lv${u.lv}</span></div>
      <div class="nm">${u.name}${kindTag(u.kind)}<small>${u.cls}</small></div>
      ${bars(u)}
      <div class="st">공격 <b>${Math.round(R.atk(u, 'H'))}</b>${pct('at')} · 방어 <b>${Math.round(R.def(u, 'H'))}</b>${pct('df')} · 이동 <b>${R.mov(u)}</b> · 사거리 <b>${u.rng}</b></div>
      <div class="ex">${troopLine}특기: ${sk}${u.side === 'p' ? ` · 경험치 <b>${u.exp}</b>/100` : ''} · 지형 ${t.name}${u.move !== 'fly' && t.def ? ` (${t.def > 0 ? '+' : ''}${Math.round(t.def * 100)}%)` : ''}</div>`;
    el.classList.remove('hidden');
    syncInfoH();
  }
  function syncInfoH() {
    const el = $('info');
    document.documentElement.style.setProperty('--info-h', (el.classList.contains('hidden') ? 0 : el.offsetHeight) + 'px');
  }
  function showActs(list) {
    const el = $('acts');
    if (!list) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.innerHTML = '';
    for (const a of list) {
      const b = document.createElement('button');
      b.innerHTML = a.label + (a.sub ? `<small>${a.sub}</small>` : '');
      if (a.cls) b.className = a.cls;
      b.disabled = !!a.disabled;
      b.onclick = (e) => { e.stopPropagation(); AU.play('lo_click', 0.5); a.fn(); };
      el.appendChild(b);
    }
    el.classList.remove('hidden');
  }
  function banner(text, sub, cls = '') {
    const el = $('banner');
    el.className = cls;
    el.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
    void el.offsetWidth;
    el.classList.remove('hidden');
    clearTimeout(banner.t);
    banner.t = setTimeout(() => el.classList.add('hidden'), 1500 / speedK);
  }
  function setTop() {
    $('turnNo').textContent = G.turn + (G.stage.turnLimit ? '/' + G.stage.turnLimit : '');
    const ph = $('phase');
    ph.textContent = G.side === 'p' ? '아군 차례' : '적 차례';
    ph.className = G.side;
    const st = G.stage;
    const nt = R.nextWaveTurn(G);
    $('goalBox').innerHTML = `${st.idx} ${st.title} · 승리: <b>${st.goal}</b>${nt ? ` · 증원 ${nt}턴` : ''} · 패배: ${st.lose}`;
    $('btnEnd').disabled = G.side !== 'p' || busy;
  }

  // ── 플레이어 조작 ───────────────────────────────────────
  function onHover(t) {
    if (!G || mode !== 'map') return;
    if (t) { world.cursor.visible = true; world.cursor.position.set(t[0] + 0.5, 0.02, t[1] + 0.5); } else world.cursor.visible = false;
    if (busy) return;
    if (ui.state === 'move' && t) {
      const n = ui.reach.get(ui.reach.key(t[0], t[1]));
      OV.path = n && n.stop ? R.path(ui.reach, t[0], t[1]) : null;
      drawOverlay();
    }
    if (ui.state === 'skill' && t) previewSkillArea(t);
    if (ui.state === 'idle' && t) { const u = R.unitAt(G, t[0], t[1]); showInfo(u, u ? null : t); }
  }
  function onTap(x, y) {
    if (busy || G.side !== 'p') return;
    world.cursor.visible = true; world.cursor.position.set(x + 0.5, 0.02, y + 0.5);
    const u = R.unitAt(G, x, y);
    switch (ui.state) {
      case 'idle':
        if (u && u.side === 'p' && !u.acted) selectUnit(u);
        else if (u) inspect(u);
        else { clearOv(); showInfo(null, [x, y]); }
        break;
      case 'move': {
        const n = ui.reach.get(ui.reach.key(x, y));
        if (u === ui.sel) { openActions(); return; }
        if (n && n.stop) { moveSel(x, y); return; }
        if (u && u.side === 'e') {
          const spot = bestSpot(ui.sel, u);
          if (spot) { moveSel(spot[0], spot[1], u); return; }
          inspect(u); return;
        }
        if (u && u.side === 'p' && !u.acted) { selectUnit(u); return; }
        deselect();
        if (u) inspect(u); else showInfo(null, [x, y]);
        break;
      }
      case 'target':
        if (u && u.side === 'e' && R.dist(ui.sel.x, ui.sel.y, u.x, u.y) <= ui.sel.rng) showForecast(u);
        break;
      case 'forecast':
        if (u === ui.target) confirmAttack();
        else if (u && u.side === 'e' && R.dist(ui.sel.x, ui.sel.y, u.x, u.y) <= ui.sel.rng) showForecast(u);
        else backToTarget();
        break;
      case 'skill': {
        if (!(OV.skill && OV.skill.some(([a, b]) => a === x && b === y))) return;
        if (ui.skillTile && ui.skillTile[0] === x && ui.skillTile[1] === y) { doSkill(); return; }
        ui.skillTile = [x, y];
        previewSkillArea([x, y]);
        showActs([{ label: '발동', cls: 'gold', fn: doSkill }, { label: '취소', fn: cancel }]);
        setHint('한 번 더 누르거나 「발동」을 누르면 특기를 씁니다');
        break;
      }
      default: break;
    }
  }
  function inspect(u) {
    showInfo(u);
    const rg = ranges(u, R.reach(G, u));
    OV.move = u.side === 'e' ? null : rg.mv;
    OV.atk = u.side === 'e' ? [...rg.mv, ...rg.atk] : rg.atk;
    OV.aura = null; OV.path = null; OV.targets = null; OV.skill = null; OV.area = null;
    drawOverlay();
    setHint(u.side === 'e' ? `${u.name}: 이동·공격 가능 범위` : '');
  }
  function selectUnit(u) {
    AU.play('lo_click', 0.6);
    ui.sel = u; ui.state = 'move'; ui.from = [u.x, u.y];
    ui.reach = R.reach(G, u);
    const rg = ranges(u, ui.reach);
    OV.move = rg.mv; OV.atk = rg.atk; OV.aura = null; OV.path = null; OV.targets = null;
    drawOverlay();
    showInfo(u);
    showActs([{ label: '제자리', sub: '이동 안 함', fn: openActions }, { label: '취소', fn: deselect }]);
    setHint('파란 칸: 이동 · 빨간 칸의 적을 누르면 다가가 공격');
  }
  function deselect() {
    ui.sel = null; ui.state = 'idle'; ui.reach = null; ui.target = null;
    clearOv(); showActs(null); setHint(''); $('forecast').classList.add('hidden');
    showInfo(null);
  }
  // 적 u를 칠 수 있는 칸 중 가장 좋은 곳 (지금 자리 > 반격 안 받는 거리 > 방어 지형 > 가까운 칸)
  function bestSpot(a, u) {
    let best = null;
    for (const t of ui.reach.values()) {
      if (!t.stop) continue;
      const d = R.dist(t.x, t.y, u.x, u.y);
      if (d < 1 || d > a.rng) continue;
      let sc = -t.c * 0.2 + (a.move === 'fly' ? 0 : R.terr(G, t.x, t.y).def) * 5 + (t.x === a.x && t.y === a.y ? 3 : 0);
      if (a.rng > 1 && d > u.rng) sc += 4;
      if (!best || sc > best.sc) best = { sc, x: t.x, y: t.y };
    }
    return best ? [best.x, best.y] : null;
  }
  async function moveSel(x, y, thenTarget) {
    const u = ui.sel;
    const path = R.path(ui.reach, x, y);
    busy = true; showActs(null); clearOv(); setHint('');
    await walk(u, path);
    busy = false;
    if (thenTarget) { ui.state = 'target'; showForecast(thenTarget); } else openActions();
  }
  function walk(u, path) {
    return new Promise((res) => {
      const v = views.get(u.uid);
      if (!v || path.length < 2) { res(); return; }
      const rigs = [v.rig, ...v.soldiers.map((s) => s.rig)];
      rigs.forEach((r) => r.loop('move', 1.3));
      let i = 1;
      const stepTile = () => {
        if (i >= path.length) { rigs.forEach((r) => r.loop('idle')); res(); return; }
        const [nx, ny] = path[i];
        faceTo(u, nx);
        const from = v.g.position.clone(), to = tilePos(nx, ny);
        const dur = (u.move === 'horse' || u.move === 'fly' ? 0.1 : 0.13) / speedK;
        animate(dur, (k) => v.g.position.lerpVectors(from, to, k), () => { u.x = nx; u.y = ny; i++; stepTile(); });
      };
      stepTile();
      AU.play('lo_click', 0.25);
    });
  }
  function openActions() {
    const u = ui.sel;
    ui.state = 'menu';
    OV.move = null; OV.atk = null; OV.path = null; OV.aura = null;
    const tg = R.targetsFrom(G, u, u.x, u.y);
    OV.targets = tg.map((o) => [o.x, o.y]);
    drawOverlay();
    showInfo(u);
    const ready = R.skillsOf(u).some((s) => R.skillReady(u, s));
    const acts = [{ label: '공격', cls: tg.length ? 'gold' : '', disabled: !tg.length, fn: () => { ui.state = 'target'; setHint('공격할 적을 고르세요'); showActs([{ label: '취소', fn: cancel }]); if (tg.length === 1) showForecast(tg[0]); } }];
    if (R.skillsOf(u).length) acts.push({ label: '특기', sub: ready ? '사용 가능' : '대기 중', disabled: !ready, fn: openSkills });
    acts.push({ label: '대기', fn: () => finishAct(u) });
    acts.push({ label: '취소', fn: cancel });
    showActs(acts);
    setHint(tg.length ? '공격할 수 있는 적이 있습니다' : '');
  }
  function openSkills() {
    const u = ui.sel;
    ui.state = 'skillpick';
    const list = R.skillsOf(u).map((sk) => {
      const s = D.SKILLS[sk], cd = u.cd[sk] || 0;
      return { label: s.name, sub: cd > 0 ? `${cd}턴 뒤 사용 가능` : `${s.desc} · 대기 ${s.cd}턴`, disabled: cd > 0, fn: () => pickSkill(sk) };
    });
    list.push({ label: '취소', fn: openActions });
    showActs(list);
    setHint('쓸 특기를 고르세요');
  }
  function pickSkill(sk) {
    const u = ui.sel, s = D.SKILLS[sk];
    ui.skill = sk; ui.skillTile = null; ui.state = 'skill';
    OV.targets = null; OV.aura = null;
    OV.skill = R.skillTargets(G, u, sk);
    OV.area = null;
    if (s.tgt === 'self') {
      ui.skillTile = [u.x, u.y];
      OV.area = R.skillArea(G, u, sk, u.x, u.y);
      showActs([{ label: '발동', cls: 'gold', sub: s.name, fn: doSkill }, { label: '취소', fn: cancel }]);
      setHint(s.desc);
    } else {
      showActs([{ label: '취소', fn: cancel }]);
      setHint(`${s.name}: 보라색 칸에서 목표를 고르세요`);
    }
    drawOverlay();
  }
  function previewSkillArea(t) {
    const u = ui.sel, sk = ui.skill;
    if (!u || !sk || D.SKILLS[sk].tgt === 'self') return;
    const ok = OV.skill && OV.skill.some(([a, b]) => a === t[0] && b === t[1]);
    const tt = ok ? t : ui.skillTile;
    OV.area = tt ? R.skillArea(G, u, sk, tt[0], tt[1]) : null;
    drawOverlay();
  }
  async function doSkill() {
    const u = ui.sel, sk = ui.skill, [tx, ty] = ui.skillTile;
    busy = true; showActs(null); clearOv(); setHint('');
    await useSkill(u, sk, tx, ty);
    busy = false;
    if (!(await afterAction())) return;
    finishAct(u);
  }
  function showForecast(d) {
    const a = ui.sel;
    ui.target = d; ui.state = 'forecast';
    OV.targets = R.targetsFrom(G, a, a.x, a.y).map((o) => [o.x, o.y]);
    OV.area = [[d.x, d.y]];
    drawOverlay();
    const p = R.combat(G, a, d, a.x, a.y);
    const el = $('forecast');
    const aK = R.troopAlive(a) ? a.troop.kind : a.kind, dK = R.troopAlive(d) ? d.troop.kind : d.kind;
    const rel = R.relX(aK, dK) ? `<span class="good">▲ 상성 유리 (${D.KIND[aK].name} ▶ ${D.KIND[dK].name} +${Math.round(R.relX(aK, dK) * 100)}%)</span>`
      : R.relX(dK, aK) ? `<span class="bad">▼ 상성 불리 (${D.KIND[dK].name} ▶ ${D.KIND[aK].name})</span>` : '상성 없음';
    const near = p.dist === 1 && [aK, a.kind].some((k) => D.KIND[k].ranged) ? ' · <span class="bad">원거리 병종 근접전 (피해 30%)</span>' : '';
    const terr = R.terr(G, d.x, d.y);
    const side = (u, t, h, cls) => `<div class="side ${cls}"><img src="${IMG[u.icon]}"><div><div class="n">${u.name}</div>
      ${u.troop ? `<div class="h" style="font-size:14px">병사 ${Math.round(u.troop.hp)}<em>→ ${Math.max(0, Math.round(u.troop.hp - t))}</em></div>` : ''}
      <div class="h" style="font-size:16px">영웅 ${Math.round(u.hp)}<em>→ ${Math.max(0, Math.round(u.hp - h))}</em></div></div></div>`;
    el.innerHTML = `<div class="row">${side(a, p.aT, p.aH, '')}<div class="mid">예상<b>⚔</b>${p.counter ? '반격 있음' : '반격 없음'}</div>${side(d, p.dT, p.dH, 'R')}</div>
      <div class="rel">${rel}${near} · 적 지형 ${terr.name}${d.move !== 'fly' && terr.def ? ` ${terr.def > 0 ? '+' : ''}${Math.round(terr.def * 100)}%` : ''}${p.dDead ? ' · <span class="good">격파 예상</span>' : ''}</div>
      <div class="btns"><button class="gold" id="fcGo">공격</button><button id="fcNo">취소</button></div>`;
    el.classList.remove('hidden');
    $('fcGo').onclick = () => confirmAttack();
    $('fcNo').onclick = () => backToTarget();
    showInfo(d);
    showActs(null);
    setHint('같은 적을 한 번 더 누르면 공격합니다');
  }
  function backToTarget() { $('forecast').classList.add('hidden'); ui.target = null; openActions(); }
  async function confirmAttack() {
    const a = ui.sel, d = ui.target;
    if (!a || !d) return;
    $('forecast').classList.add('hidden');
    busy = true; showActs(null); clearOv(); setHint('');
    await attack(a, d);
    busy = false;
    if (!(await afterAction())) return;
    if (a.alive) finishAct(a); else { deselect(); checkAutoEnd(); }
  }
  function cancel() {
    if (busy) return;
    $('forecast').classList.add('hidden');
    switch (ui.state) {
      case 'move': deselect(); break;
      case 'menu': {
        const u = ui.sel, v = views.get(u.uid);
        u.x = ui.from[0]; u.y = ui.from[1];
        v.g.position.copy(tilePos(u.x, u.y));
        selectUnit(u);
        break;
      }
      case 'target': case 'forecast': case 'skillpick': openActions(); break;
      case 'skill': openSkills(); break;
      default: deselect(); break;
    }
  }
  function finishAct(u) {
    u.acted = true;
    refreshView(u);
    deselect();
    updateDanger();
    checkAutoEnd();
  }
  function checkAutoEnd() {
    if (!save.opts.autoEnd || !G || G.side !== 'p') return;
    if (G.units.every((u) => !u.alive || u.side !== 'p' || u.acted)) wait(450).then(() => { if (G && G.side === 'p' && !busy && mode === 'map') endTurn(); });
  }
  function endTurnAsk() {
    if (busy || G.side !== 'p' || mode !== 'map') return;
    const left = G.units.filter((u) => u.alive && u.side === 'p' && !u.acted).length;
    if (!left) { endTurn(); return; }
    modal(`<h3>턴 종료</h3><p>아직 행동하지 않은 영웅이 <b>${left}</b>명 있습니다. 턴을 마칠까요?</p>
      <div class="opts"><button class="gold" data-a="yes">턴 종료</button><button data-a="no">계속하기</button></div>`, (a) => { if (a === 'yes') endTurn(); });
  }

  // ── 행동 실행 (아군·적 공용) ─────────────────────────────
  async function attack(a, d) {
    faceTo(a, d.x); faceTo(d, a.x);
    const res = R.combat(G, a, d, a.x, a.y, Math.random);
    if (save.opts.fight) {
      mode = 'fight';
      $('hud').classList.add('hidden');
      $('banner').classList.add('hidden');
      await FIGHT.play(a, d, res, { bg: R.terr(G, d.x, d.y).bg, speed: speedK });
      mode = 'map';
      $('hud').classList.remove('hidden');
    } else await mapClash(a, d, res);
    R.apply(d, res.dT, res.dH);
    R.apply(a, res.aT, res.aH);
    a.dealt = (a.dealt || 0) + res.dT + res.dH; d.dealt = (d.dealt || 0) + res.aT + res.aH; // 결과 화면의 최우수 (MVP)
    popDmg(d, res.dT, res.dH);
    wait(150).then(() => popDmg(a, res.aT, res.aH));
    refreshView(a); refreshView(d);
    const deaths = [];
    if (d.hp <= 0) deaths.push(kill(d));
    if (a.hp <= 0) deaths.push(kill(a));
    await Promise.all(deaths);
    if (deaths.length) await wait(200);
  }
  async function mapClash(a, d, res) {
    const va = views.get(a.uid), vd = views.get(d.uid);
    va.rig.once('atk', Math.max(1, va.rig.dur('atk') / 1.0) * speedK);
    AU.play(a.def.sfx, 0.7);
    await wait(380);
    fxAt(d.x, d.y, 'hit');
    vd.rig.c.setFlash(1);
    await wait(120);
    vd.rig.c.setFlash(0);
    refreshView(d);
    if (res.counter) {
      vd.rig.once('atk', Math.max(1, vd.rig.dur('atk') / 1.0) * speedK);
      AU.play(d.def.sfx, 0.6);
      await wait(380);
      fxAt(a.x, a.y, 'hit');
      va.rig.c.setFlash(1);
      await wait(120);
      va.rig.c.setFlash(0);
    }
    await wait(130);
  }
  async function kill(u) {
    u.alive = false; u.hp = 0;
    const v = views.get(u.uid);
    pop(u.x, u.y, u.side === 'p' ? '퇴각' : '격파!', 'info big', 1.3);
    if (v) {
      for (const r of [v.rig, ...v.soldiers.map((s) => s.rig)]) if (r.c.has('die')) r.once('die', 1.4 * speedK, true);
      await animateP(0.9, (k) => { for (const r of [v.rig, ...v.soldiers.map((s) => s.rig)]) r.c.setOpacity(1 - k * k); });
      removeView(u);
    }
    if (u.boss || u.lead) AU.play(u.side === 'p' ? 'fail' : 'expB', 0.6);
    updateDanger();
  }
  async function useSkill(u, sk, tx, ty) {
    const s = D.SKILLS[sk];
    u.cd[sk] = s.cd + 1; // 다음 차례 시작에 1 줄어 s.cd 턴 동안 못 쓴다
    faceTo(u, tx);
    const v = views.get(u.uid);
    panTo(tx, ty);
    banner(s.name, u.name, u.side === 'e' ? 'e' : 'gold');
    if (v && v.rig.c.has('skill')) v.rig.once('skill', Math.max(1, v.rig.dur('skill') / 1.6) * speedK);
    AU.play('charge', 0.5);
    OV.area = R.skillArea(G, u, sk, tx, ty); drawOverlay();
    await wait(800);
    AU.play(s.sfx, 0.8);
    OV.area.forEach(([x, y], i) => fxAt(x, y, s.fx, i * 40));
    await wait(350);
    const deaths = [];
    for (const r of R.skillEffect(G, u, sk, tx, ty, Math.random)) {
      if (r.toT != null) {
        R.apply(r.u, r.toT, r.toH);
        u.dealt = (u.dealt || 0) + r.toT + r.toH;
        popDmg(r.u, r.toT, r.toH);
        if (s.slow) r.u.slowNext = s.slow;
        refreshView(r.u);
        if (r.u.hp <= 0) deaths.push(kill(r.u));
      } else {
        if (r.hH || r.hT) {
          r.u.hp += r.hH; if (r.u.troop) r.u.troop.hp += r.hT;
          pop(r.u.x, r.u.y, '+' + Math.round(r.hH + r.hT), 'heal');
        }
        if (r.buff) {
          r.u.buffs = r.u.buffs.filter((b) => !Object.keys(s.buff).some((k) => b[k]));
          r.u.buffs.push({ ...s.buff, until: G.turn + 1, side: u.side });
          pop(r.u.x, r.u.y, Object.entries(s.buff).map(([k, n]) => ({ at: '공격', df: '방어', mov: '이동' }[k] + ' +' + Math.round(n * 100) + '%')).join(' '), 'info');
        }
        refreshView(r.u);
      }
    }
    await Promise.all(deaths);
    OV.area = null; drawOverlay();
    await wait(250);
  }
  // 행동 뒤 승패 확인. 계속 진행하면 true
  async function afterAction() {
    if (!G) return false;
    const r = R.check(G);
    if (r) { await endStage(r === 'win'); return false; }
    return true;
  }

  // ── 차례 진행 ───────────────────────────────────────────
  async function startPhase(side) {
    G.side = side;
    for (const u of G.units) {
      if (!u.alive) continue;
      u.buffs = u.buffs.filter((b) => !(b.side === side && b.until <= G.turn));
      if (u.side !== side) continue;
      u.acted = false;
      for (const k in u.cd) if (u.cd[k] > 0) u.cd[k]--;
      u.slow = u.slowNext || 0; u.slowNext = 0;
    }
    clearOv(); setTop();
    if (side === 'p' && G.stage.turnLimit && G.turn > G.stage.turnLimit) { await endStage(false, '제한 턴을 넘겼습니다'); return; }
    banner(side === 'p' ? `${G.turn}턴 · 아군 차례` : '적 차례', side === 'p' && G.stage.turnLimit ? `제한 ${G.stage.turnLimit}턴` : '', side === 'e' ? 'e' : '');
    AU.play(side === 'p' ? 'start' : 'warning', 0.5);
    await wait(900);
    let healed = false;
    for (const u of G.units) {
      if (!u.alive || u.side !== side) continue;
      const h = R.terr(G, u.x, u.y).heal;
      if (!h) continue;
      const a = Math.min(u.hpMax - u.hp, Math.round(u.hpMax * h)), b = u.troop ? Math.min(u.troop.hpMax - u.troop.hp, Math.round(u.troop.hpMax * h)) : 0;
      if (a + b <= 0) continue;
      u.hp += a; if (u.troop) u.troop.hp += b;
      pop(u.x, u.y, '+' + (a + b), 'heal'); healed = true;
    }
    if (healed) { AU.play('energy', 0.4); await wait(500); }
    if (side === 'e') { // 정해진 턴의 적 차례에 증원
      for (const i of R.wavesAt(G, G.turn)) {
        const list = R.spawnWave(G, i);
        banner('철충 증원!', `${list.length}기 출현`, 'e');
        AU.play('reinforce', 0.7);
        for (const u of list) { addView(u); fxAt(u.x, u.y, 'spawn'); }
        if (list[0]) panTo(list[0].x, list[0].y, true);
        setTop();
        await wait(1000);
      }
    }
    G.units.forEach(refreshView);
    updateDanger();
    if (side === 'e') await enemyPhase();
    else { setTop(); setHint(''); const lead = G.units.find((u) => u.lead && u.alive); if (lead) panTo(lead.x, lead.y); if (autoOn) autoPlayer(); }
  }
  async function endTurn() {
    if (busy || G.side !== 'p') return;
    deselect();
    busy = true; setTop();
    await startPhase('e');
  }
  // 판단 장치로 한 편의 유닛을 모두 움직인다 (적 차례, 아군 자동 전투). 승패가 나면 false
  async function runAI(side) {
    const fields = {};
    const g0 = G; // 도중에 작전이 바뀌면(포기·재시작) 멈춘다
    const near = (u) => Math.min(99, ...G.units.filter((o) => o.alive && o.side !== side).map((o) => R.dist(o.x, o.y, u.x, u.y)));
    const list = G.units.filter((u) => u.alive && u.side === side && !u.acted).sort((a, b) => (a.lead || a.boss ? 1 : 0) - (b.lead || b.boss ? 1 : 0) || near(a) - near(b));
    for (const u of list) {
      if (G !== g0 || mode === 'screen') return false;
      if (!u.alive) continue;
      if (side === 'p' && !autoOn) return true;
      const plan = R.plan(G, u, fields);
      u.acted = true;
      const moved = plan.to[0] !== u.x || plan.to[1] !== u.y;
      if (!moved && plan.act === 'wait') { refreshView(u); continue; }
      panTo(u.x, u.y);
      await wait(moved ? 160 : 80);
      if (moved) {
        const path = R.path(R.reach(G, u), plan.to[0], plan.to[1]);
        if (path.length > 1) await walk(u, path); else { u.x = plan.to[0]; u.y = plan.to[1]; }
      }
      if (plan.act === 'attack' && plan.target.alive && R.dist(u.x, u.y, plan.target.x, plan.target.y) <= u.rng) {
        showInfo(plan.target);
        await wait(200);
        if (G !== g0) return false;
        await attack(u, plan.target);
      } else if (plan.act === 'skill') await useSkill(u, plan.skill, plan.tx, plan.ty);
      if (G !== g0) return false;
      refreshView(u);
      fields.threat = null;
      if (!(await afterAction())) return false;
      await wait(80);
    }
    return true;
  }
  async function enemyPhase() {
    busy = true;
    if (!(await runAI('e'))) return;
    showInfo(null);
    busy = false;
    G.turn++;
    await startPhase('p');
  }
  let autoOn = false;
  async function autoPlayer() {
    if (!autoOn || !G || G.side !== 'p' || busy || mode !== 'map') return;
    deselect();
    busy = true; setTop();
    const ok = await runAI('p');
    busy = false;
    if (!ok || !G) return;
    setTop();
    if (autoOn) endTurn();
  }
  function setAuto(v) {
    autoOn = v;
    $('btnAuto').classList.toggle('on', v);
    if (v) autoPlayer();
  }

  // ── 대화 (본작 대본: 노드 사슬 + 사령관 선택지) → js/talk.js ──
  async function story(nodes) {
    if (!nodes || !nodes.length) return;
    const prev = mode;
    mode = 'talk';
    wipe();
    await TALK.play(nodes);
    mode = prev === 'talk' ? 'map' : prev;
  }
  function talk(lines) { // 간단한 대사 [[화자, 얼굴, 문장]] (도움말 등)
    return story(lines.map(([who, face, t], i) => ({ id: i + 1, who, face, t, bg: '', cg: '', next: i + 2 <= lines.length ? i + 2 : null, ch: [] })));
  }

  // ── 모달 ─────────────────────────────────────────────────
  function modal(html, cb) {
    const m = $('modal');
    m.innerHTML = `<div class="mbox">${html}</div>`;
    m.classList.remove('hidden');
    m.onclick = (e) => {
      const b = e.target.closest('[data-a]');
      if (!b && e.target !== m) return;
      const a = b ? b.dataset.a : null;
      m.classList.add('hidden'); m.innerHTML = '';
      AU.play('lo_click', 0.4);
      cb && cb(a, b);
    };
  }
  function openMenu() {
    if (mode !== 'map') return;
    const o = save.opts;
    const onoff = (v) => (v ? '켜짐' : '꺼짐');
    modal(`<h3>메뉴</h3><div class="opts">
      <button data-a="fight">전투 장면: <b>${onoff(o.fight)}</b></button>
      <button data-a="fast">빠른 진행: <b>${onoff(o.fast)}</b></button>
      <button data-a="autoEnd">모두 행동하면 자동 턴 종료: <b>${onoff(o.autoEnd)}</b></button>
      <button data-a="opts">옵션 (소리·대화·전투)</button>
      <button data-a="help">도움말 (규칙·조작)</button>
      <button data-a="goal">승리·패배 조건</button>
      <button data-a="retry">처음부터 다시</button>
      <button data-a="quit" class="red">작전 포기 (선택 화면으로)</button>
      <button data-a="close" class="gold">닫기</button></div>`, (a) => {
      if (['fight', 'fast', 'autoEnd', 'sound'].includes(a)) {
        o[a] = !o[a]; writeSave();
        speedK = o.fast ? 2 : 1; AU.setOn(o.sound);
        openMenu();
      } else if (a === 'opts') options(openMenu);
      else if (a === 'help') help();
      else if (a === 'goal') goalInfo();
      else if (a === 'retry') { const st = G.stage; leaveMap(); prep(st); }
      else if (a === 'quit') { leaveMap(); stageSelect(); }
    });
  }
  // 옵션 창: 소리 크기는 밀대로 바로 바뀌고, 켜기/끄기·속도는 누를 때마다 바뀐다. back: 닫은 뒤 돌아갈 곳
  function options(back) {
    const o = save.opts;
    const onoff = (v) => (v ? '켜짐' : '꺼짐');
    const slider = (k, label) => `<label class="oslide"><span>${label}</span><input type="range" min="0" max="100" step="5" value="${o[k]}" data-k="${k}"><b>${o[k]}</b></label>`;
    modal(`<h3>옵션</h3><div class="osec">소리</div>
      <div class="opts"><button data-a="sound">소리 전체: <b>${onoff(o.sound)}</b></button></div>
      ${slider('bgmV', '배경음')}${slider('sfxV', '효과음')}${slider('voiceV', '음성')}
      <div class="osec">대화</div><div class="opts">
      <button data-a="blip">글자 소리: <b>${onoff(o.blip)}</b></button>
      <button data-a="textSpd">글자 나오는 속도: <b>${['느리게', '보통', '빠르게'][o.textSpd]}</b></button></div>
      <div class="osec">전투</div><div class="opts">
      <button data-a="fight">전투 장면: <b>${onoff(o.fight)}</b></button>
      <button data-a="fast">빠른 진행: <b>${onoff(o.fast)}</b></button>
      <button data-a="autoEnd">모두 행동하면 자동 턴 종료: <b>${onoff(o.autoEnd)}</b></button>
      <button data-a="close" class="gold">닫기</button></div>`, (a) => {
      if (['sound', 'blip', 'fight', 'fast', 'autoEnd'].includes(a)) o[a] = !o[a];
      else if (a === 'textSpd') o.textSpd = (o.textSpd + 1) % 3;
      else { writeSave(); if (back) back(); return; }
      writeSave(); applyOpts(); options(back);
    });
    // 밀대: 움직이는 동안 바로 적용, 효과음은 크기를 들려준다
    document.querySelectorAll('#modal input[type=range]').forEach((r) => {
      r.oninput = () => { o[r.dataset.k] = +r.value; r.nextElementSibling.textContent = r.value; applyOpts(); };
      r.onchange = () => { writeSave(); if (r.dataset.k === 'sfxV') AU.play('lo_click', 1); if (r.dataset.k === 'voiceV') AU.voice('constantia_SortiePick'); };
    });
  }
  function goalInfo() {
    const st = G.stage;
    modal(`<h3>${st.idx} ${st.title}</h3><p>승리 조건: <b>${st.goal}</b></p><p>패배 조건: ${st.lose}</p>
      <p style="color:#9aa6c4">적 무리를 모두 쓰러뜨리면 다음 무리가 나타납니다 (전체 ${st.waves.length}무리).</p><div class="opts"><button class="gold" data-a="ok">확인</button></div>`);
  }
  function help(cb) {
    modal(`<h3>도움말</h3>
      <p><b>영웅과 병사</b> · 지도 위 한 칸은 영웅 한 명과 배속된 병사 부대입니다. 공격받으면 <b>병사가 먼저</b> 피해를 받고, 병사가 전멸하면 영웅이 직접 맞습니다. 영웅이 쓰러지면 그 칸은 퇴각합니다.</p>
      <p><b>병사 배속</b> · 출격 전에 영웅마다 병사를 고릅니다. 고를 수 있는 병사는 영웅의 전직 단계에 따라 늘어납니다.</p>
      <p><b>병사 10명</b> · 한 부대의 병사는 10명입니다. 남은 병사 수만큼만 공격하므로 병사가 줄면 부대가 약해집니다. 이동력은 영웅과 병사 중 느린 쪽을 따릅니다.</p>
      <p><b>병종 상성</b> · 보병 ▶ 창병 ▶ 기병 ▶ 보병 (+30%), 궁병 ▶ 비병 (+40%), 승려 ▶ 마물 (+80%). 그 밖에는 상성이 없습니다. 병사는 병사의 병종, 영웅은 영웅의 병종으로 따집니다.</p>
      <p><b>원거리</b> · 궁병은 사거리 2. 두 칸에서 쏘면 근접 부대는 반격하지 못합니다. 원거리 병종이 붙어서 싸우면 피해가 30%로 줄어듭니다.</p>
      <p><b>적의 움직임</b> · 적은 아군이 자기 공격 범위(위험 범위)에 들어와야 움직이기 시작합니다. 「위험」 단추로 범위를 확인하고 하나씩 끌어내세요. 증원은 정해진 턴에 나타나며, 그 전에 적을 모두 쓰러뜨리면 승리합니다.</p>
      <p><b>경험치</b> · 전투가 끝나면 참가한 영웅 전원이 같은 양을 받습니다.</p>
      <p><b>특기</b> · 쓰고 나면 정해진 턴 동안 다시 쓸 수 없습니다(괄호 안 숫자).</p>
      <p><b>지형</b> · 숲 +20%, 산·언덕·기지 +10%, 폐허·마을 +5% 방어. 기병은 숲·산에서 느려지고, 비병은 지형의 영향을 받지 않습니다. 적 칸은 지나갈 수 없습니다.</p>
      <p><b>조작</b> · 누르기: 선택·이동·공격 / 끌기: 지도 이동 / 두 손가락·휠: 확대 / 오른쪽 클릭·Esc: 취소 / 방향키+Enter: 커서 / E: 턴 종료 / D: 위험 범위 / Q: 자동</p>
      <div class="opts"><button class="gold" data-a="ok">확인</button></div>`, cb);
  }

  // ── 화면들 ───────────────────────────────────────────────
  // 화면 전환: 왼쪽에서 빛나는 사선이 날아오고, 그 선을 따라 새 화면이 옛 화면을 덮는다.
  // 옛 화면은 바뀌기 직전에 복제해(그림판 내용까지 옮겨 그려) 새 화면 밑(#wipeOld)에 깔아 둔다
  const WIPE_LAYERS = ['screen', 'talkBg', 'talk'];
  let oldSnap = null;
  function snap() {
    const box = document.createElement('div');
    for (const id of WIPE_LAYERS) {
      const e = $(id);
      if (!e.childElementCount || e.classList.contains('hidden')) continue;
      const c = e.cloneNode(true), dst = c.querySelectorAll('canvas');
      c.classList.remove('wipein');
      e.querySelectorAll('canvas').forEach((s, i) => { dst[i]._portrait = true; try { dst[i].getContext('2d').drawImage(s, 0, 0); } catch (_) {} });
      box.appendChild(c);
    }
    return box.childElementCount ? box : null;
  }
  // 지금 모습을 떠 두기 (곧이어 전환이 없으면 버린다)
  function keepSnap() { const s = snap(); if (s) oldSnap = s; requestAnimationFrame(() => { oldSnap = null; }); }
  window.WIPE = { keep: keepSnap };
  function wipe() {
    const wo = $('wipeOld'), els = [$('wipe'), ...WIPE_LAYERS.map($)];
    wo.replaceChildren(...(oldSnap ? [oldSnap] : [])); oldSnap = null;
    els.forEach((e) => e.classList.remove('wipein')); void wo.offsetWidth;
    els.forEach((e) => e.classList.add('wipein'));
    clearTimeout(wipe.t);
    wipe.t = setTimeout(() => { wo.replaceChildren(); els.forEach((e) => e.classList.remove('wipein')); }, 760);
  }
  // 같은 화면을 새로 그릴 때(출격 준비에서 영웅·병사 고르기 등)는 전환 효과 없이
  function screen(html) {
    const kind = (html.match(/class="([\w-]+)/) || [])[1];
    const same = kind && $('screen').firstElementChild && $('screen').firstElementChild.classList.contains(kind);
    if (!same) keepSnap();
    $('screen').innerHTML = html; mode = 'screen';
    if (!same) wipe();
  }
  function hideScreen() { keepSnap(); $('screen').innerHTML = ''; }
  // 타이틀: 원작과 같은 구성 (폐허를 올려다보는 배경 + 빛 + LAST ORIGIN 로고 + 화면 터치 + 타이틀 콜)
  const GAME_VERSION = '0.16';
  const TITLE_CALLS = ['Title-2', 'Title-4', 'Title-6', 'Title-8', 'Voice_3P_ConstantiaS2_Title-4', 'Voice_3P_ConstantiaS2_Title-8', 'Voice_BR_PA00EL_Title-4', 'Voice_BR_PA00EL_Title-7', 'Voice_PECS_LRL_N_Title-1', 'Voice_PECS_LRL_N_Title-4', 'Voice_PECS_PuppHead_Title-3', 'Voice_PECS_PuppHead_Title-5'];
  function title() {
    leaveMap();
    AU.bgm('lo_title');
    const has = save.clear > 0 || Object.values(save.heroes).some((h) => h.lv > 1);
    const motes = Array.from({ length: 14 }, (_, i) => `<i style="left:${(i * 53) % 100}%;animation-delay:${-(i * 1.7) % 9}s;animation-duration:${8 + (i % 5)}s;--s:${0.4 + (i % 4) * 0.25}"></i>`).join('');
    screen(`<div class="title2">
      <div class="tbg"></div><div class="tlight"></div><div class="tmotes">${motes}</div><div class="tvig"></div>
      <div class="tcenter"><img class="tlogo" src="assets/title/logo.webp" alt=""><div class="tsub">개발자 B의 내 마음대로 LAST ORIGIN</div></div>
      <div class="ttouch" id="tTouch">화면을 터치해 주세요</div>
      <div class="tmenu hidden" id="tMenu">
        ${has ? '<button id="tCont">이어하기</button>' : ''}
        <button id="tNew">처음부터</button>
        <button id="tOpt">옵션</button>
        <button id="tHelp">도움말</button>
      </div>
      <div class="tver">Ver ${GAME_VERSION}</div></div>`);
    let touched = false;
    $('screen').querySelector('.title2').onclick = (e) => {
      if (touched || e.target.closest('button')) return;
      touched = true;
      AU.bgm('lo_title');
      AU.voice(TITLE_CALLS[Math.floor(Math.random() * TITLE_CALLS.length)]);
      AU.play('lo_stage_in', 0.6);
      $('tTouch').classList.add('hidden');
      $('tMenu').classList.remove('hidden');
    };
    const go = () => { AU.play('lo_click', 0.7); AU.play('lo_trans_in', 0.5); stageSelect(); };
    if ($('tCont')) $('tCont').onclick = go;
    $('tNew').onclick = () => {
      AU.play('lo_click', 0.7);
      const start = () => { save.clear = 0; save.troops = {}; save.joined = []; for (const id in D.HEROES) save.heroes[id] = { lv: 1, exp: 0, tier: 0 }; writeSave(); startStage(0); };
      if (has) modal('<h3>처음부터</h3><p>지금까지의 진행이 지워집니다. 시작할까요?</p><div class="opts"><button class="red" data-a="y">처음부터 시작</button><button data-a="n">취소</button></div>', (a) => { if (a === 'y') start(); });
      else start();
    };
    $('tHelp').onclick = () => { AU.play('lo_click', 0.7); help(); };
    $('tOpt').onclick = () => { AU.play('lo_click', 0.7); options(); };
  }
  // ── 월드맵 (창세기전식): 원작 3D 지역 지도 위 지점을 눌러 부대가 길을 따라 이동한다 ──
  // 지점 = 본편 작전 장소 8곳 + 마을(등대 아래 비밀기지). 아직 깨지 않은 본편 지점에 가면 이야기 전투,
  // 지나온 지점에서는 소탕전과 받아 둔 의뢰 전투, 마을 지점에서는 마을로 들어간다.
  const TOWN = { name: '등대 아래 비밀기지', sub: '오르카 임시 거점', unlock: 3 };
  const WT = 'T'; // 마을 지점 id
  const nodeIds = () => D.STAGES.map((_, i) => i).concat([WT]);
  const nodeOpen = (id) => (id === WT ? save.clear >= TOWN.unlock : id <= Math.min(save.clear, D.STAGES.length - 1));
  // 지점의 3D 자리
  const nodePos = (id) => (id === WT ? WM3D.data.town : WM3D.data.stages[id]);
  const sideList = () => (window.SIDE || []);
  const sideState = (idx) => (save.side || {})[idx];
  // 마을에서 받을 수 있는 의뢰 (아직 받지 않은 것)
  const sideNew = () => sideList().filter((s) => save.clear >= s.unlock && !sideState(s.idx));
  const partyLv = () => { const j = [...joined()]; return j.length ? Math.round(j.reduce((s, id) => s + save.heroes[id].lv, 0) / j.length) : 1; };

  // 작전 자료: 본편은 D.STAGES 그대로, 소탕전·의뢰는 그 장소 본편의 지도와 시작 칸을 빌려 만든다
  const stageOf = (x) => (typeof x === 'number' ? D.STAGES[x] : x);
  function repeatStage(si) {
    const b = D.STAGES[si], lv = partyLv();
    const waves = b.waves.map((w) => Object.assign({}, w, { units: w.units.map(([k, l]) => [k, Math.max(l, lv - 1 + (D.ENEMIES[k].big ? 2 : 0))]) }));
    return Object.assign({}, b, { kind: 'repeat', base: si, title: b.title + ' · 소탕전', goal: '철충 전멸', lose: '콘스탄챠 퇴각', win: 'all', turnLimit: 0, waves, free: b.starts.length, heroes: null });
  }
  function sideStage(idx) {
    const s = sideList().find((x) => x.idx === idx), b = D.STAGES[s.base - 1];
    const waves = s.waves.map((units, i) => ({ turn: 1 + i * 3, at: b.waves[i % b.waves.length].at, units })); // 원작은 무리를 하나씩 상대: 증원 간격을 넉넉히
    return Object.assign({}, b, { kind: 'side', side: s, base: s.base - 1, idx: s.idx, title: s.title, goal: '철충 전멸', lose: '콘스탄챠 퇴각', win: 'all', turnLimit: 0, waves,
      free: 4, heroes: null, bgm: s.kind === 'Ex' ? 'lo_battle2' : b.bgm });
  }

  let stageSel = -1; // 예전 이름 유지: 선택(정보 창)한 지점
  function stageSelect() {
    leaveMap();
    AU.bgm('lo_lobby');
    if (save.node == null || !nodeOpen(save.node)) save.node = Math.min(save.clear, D.STAGES.length - 1);
    const here = save.node;
    // 깼거나 지금 갈 수 있는 지점만 보이고, 나머지는 숨긴다
    const pins = nodeIds().filter(nodeOpen).map((id) => {
      const town = id === WT;
      const st = town ? null : D.STAGES[id];
      const clear = !town && id < save.clear;
      const col = town ? 'Grn' : st.win === 'boss' ? 'Red' : clear ? 'Grn' : 'Yel';
      const sides = town ? [] : sideList().filter((s) => s.base === id + 1 && sideState(s.idx) === 'open');
      const mark = town ? (sideNew().length ? '<b class="wq">!</b>' : '') : sides.length ? '<b class="wq s">!</b>' : '';
      const tag = town ? TOWN.name : st.idx;
      const em = town ? '<em class="town">TOWN</em>' : clear ? '<em>CLEAR</em>' : id === save.clear ? '<em class="new">NEW</em>' : '';
      return `<button class="wnode ${clear ? 'clear' : ''} ${town ? 'town' : ''} c${col}" data-n="${id}">
        <i class="ol" style="background-image:url(assets/ui/UI_WolrdMap_Chapter_Icon_Selected_OL_${col}.png)"></i>
        <i class="base" style="background-image:url(assets/ui/UI_WolrdMap_Chapter_Icon_Base_${col}.png)"></i>
        <i class="ico" style="background-image:url(assets/ui/${town ? 'UI_WolrdMap_Chapter_Icon_Story_WH' : `UI_WolrdMap_Chapter_Icon_Main_${col}`}.png)"></i>
        <b class="tag">${tag}</b>${em}${mark}</button>`;
    }).join('');
    screen(`<div class="wscr">
      <div class="wmap">${pins}
        <div class="wtoken" id="wTok"><img src="${IMG[D.HEROES.constantia.icon]}" alt=""></div></div>
      <div class="wvig"></div>
      <div class="whead"><button class="wback" id="sBack" aria-label="뒤로"></button>
        <div class="wtitle"><small>CHAPTER 01</small><b>지구의 마지막 인간</b></div></div>
      <div class="wtools"><button class="lo-btn dark" id="sHero">부대 현황</button></div>
      <div class="winfo" id="sInfo"></div></div>`);
    $('sBack').onclick = () => { AU.play('lo_click', 0.6); title(); };
    $('sHero').onclick = () => { AU.play('lo_click', 0.6); heroRoster(); };
    // 원작 3D 지도를 깔고, 지점 단추와 부대 말은 매 순간 3D 자리를 화면에 비춰 붙인다
    let moving = 0, tokPos = null;
    const map = $('screen').querySelector('.wscr .wmap'), tok = $('screen').querySelector('#wTok');
    const pinEls = [...map.querySelectorAll('.wnode')];
    const SPEED = 0.35; // 지도 단위 / 초
    function place() {
      for (const b of pinEls) {
        const s = WM3D.project(nodePos(b.dataset.n === WT ? WT : +b.dataset.n));
        b.style.visibility = s ? '' : 'hidden';
        if (s) { b.style.left = s.x + 'px'; b.style.top = s.y + 'px'; b.style.zIndex = Math.round(1000 - s.d * 100); }
      }
      const s = tokPos && WM3D.project(tokPos);
      tok.style.visibility = s ? '' : 'hidden';
      if (s) { tok.style.left = s.x + 'px'; tok.style.top = s.y + 'px'; }
    }
    WM3D.mount(map, 'ch01').then((ok) => {
      if (!ok) return;
      if (!save.wpos3) save.wpos3 = nodePos(here).slice();
      tokPos = save.wpos3.slice();
      WM3D.setFocus(tokPos); // 카메라 가운데에 늘 부대
      WM3D.setMarker(here === WT ? null : nodePos(here));
      WM3D.onFrame(place);
      place();
      map.classList.add('ready');
    });
    // 지도 어디든 누르면 부대가 그 자리까지 걸어간다. 지점 근처를 누르면 그 지점에 붙어 멈추고, 도착하면 정보 창 (끌면 지도를 돌린다)
    async function walkTo(p, node) {
      const my = ++moving;
      $('sInfo').classList.remove('on'); // 걷는 동안은 정보 창을 닫는다
      const a = tokPos.slice(), dur = Math.max(0.15, Math.hypot(p[0] - a[0], p[2] - a[2]) / SPEED), t0 = performance.now();
      tok.classList.add('walk');
      let foot = 0;
      await new Promise((done) => {
        const step = () => {
          if (my !== moving || !tok.isConnected) return done();
          const now = performance.now(), k = Math.min(1, (now - t0) / 1000 / dur);
          for (let i = 0; i < 3; i++) tokPos[i] = a[i] + (p[i] - a[i]) * k;
          if (now >= foot && k < 1) { AU.play('lo_walk', 0.4 + Math.random() * 0.15); foot = now + 360; } // 한 걸음씩
          if (k < 1) requestAnimationFrame(step); else done();
        };
        step();
      });
      if (my !== moving || !tok.isConnected) return;
      tok.classList.remove('walk');
      save.wpos3 = p.slice();
      if (node != null) { save.node = node; WM3D.setMarker(node === WT ? null : nodePos(node)); }
      writeSave();
      moving = 0;
      if (node != null) { stageSel = node; nodeInfo(); }
    }
    map.addEventListener('click', (ev) => {
      if (!WM3D.ready || !tokPos) return;
      const r = map.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
      // 가까운 지점에 붙는다 (지점 단추를 직접 눌러도 같음)
      let best = null, bd = 0.045 * Math.max(r.width, r.height * 16 / 9);
      for (const id of nodeIds().filter(nodeOpen)) { const s = WM3D.project(nodePos(id)); if (!s) continue; const dd = Math.hypot(s.x - x, s.y - y); if (dd < bd) { bd = dd; best = id; } }
      const btn = ev.target.closest('.wnode');
      if (btn) best = btn.dataset.n === WT ? WT : +btn.dataset.n;
      if (best == null) { const p = WM3D.pick(x, y); if (p) { AU.play('lo_pick', 0.5); walkTo(p, null); } return; }
      AU.play('lo_pick', 0.5);
      const np = nodePos(best);
      if (best === save.node && !moving && Math.hypot(tokPos[0] - np[0], tokPos[2] - np[2]) < 1e-3) { stageSel = best; nodeInfo(); return; }
      walkTo(np.slice(), best);
    });
    stageSel = here;
    $('screen').querySelectorAll('.wnode').forEach((b) => b.classList.toggle('sel', b.dataset.n === String(here)));
  }
  // 도착한 지점의 정보 창을 오른쪽에 띄운다 (도착 전에는 숨김)
  function placeInfo() {
    const box = $('sInfo');
    if (!box) return;
    box.classList.remove('on'); void box.offsetWidth; // 다시 미끄러져 들어오게
    box.classList.add('on');
  }
  // 오른쪽 정보 창: 지점의 종류에 따라 할 수 있는 일
  function nodeInfo() {
    const id = save.node;
    $('screen').querySelectorAll('.wnode').forEach((b) => b.classList.toggle('sel', b.dataset.n === String(id)));
    if (id === WT) {
      const nw = sideNew();
      $('sInfo').innerHTML = `<button class="wclose" onclick="this.parentElement.classList.remove('on')">✕</button><div class="wi-top"><span class="wi-no wi-town">TOWN</span><div class="wi-name">${TOWN.name}<em class="town">${TOWN.sub}</em></div></div>
        <p class="wi-desc">등대 아래에 숨겨진 옛 비밀기지. 오르카의 임시 거점이다.\n동료들과 이야기하고, 들어온 의뢰를 받을 수 있다.</p>
        ${nw.length ? `<div class="wi-sub">새 의뢰 <small>${nw.length}건</small></div><div class="wi-list">${nw.map((s) => `<div><b>${s.title}</b><small>${s.desc}</small></div>`).join('')}</div>` : ''}
        <button class="wgo" id="sTown"><b>마을로 들어가기</b><small>ENTER</small></button>`;
      $('sTown').onclick = () => { AU.play('lo_click', 0.7); AU.play('lo_trans_in', 0.5); enterTown(); };
      placeInfo();
      return;
    }
    const st = D.STAGES[id], S = window.STORY && STORY[st.idx];
    const foes = {};
    st.waves.forEach((w) => w.units.forEach(([k, lv]) => { const f = foes[k] || (foes[k] = { n: 0, lv: 0 }); f.n++; f.lv = Math.max(f.lv, lv); }));
    const foeHtml = Object.entries(foes).map(([k, f]) => { const e = D.ENEMIES[k]; return `<div class="wfoe ${e.big ? 'boss' : ''}"><img src="${IMG[e.icon]}" alt=""><span>Lv.${f.lv}</span><small>${e.name}${f.n > 1 ? ' ×' + f.n : ''}</small></div>`; }).join('');
    const clear = id < save.clear;
    const sides = sideList().filter((s) => s.base === id + 1 && sideState(s.idx) === 'open');
    const done = sideList().filter((s) => s.base === id + 1 && sideState(s.idx) === 'done');
    let acts;
    if (!clear) {
      const j = joined();
      const heroHtml = st.heroes.map((h) => { const H = D.HEROES[h]; return `<div class="whero ${j.has(h) ? '' : 'new'}"><img src="${IMG[H.icon]}" alt=""><small>${j.has(h) ? 'Lv.' + save.heroes[h].lv : '합류'}</small></div>`; }).join('');
      acts = `<div class="wi-row"><label>승리 조건</label><span>${st.goal}</span></div><div class="wi-row"><label>패배 조건</label><span>${st.lose}</span></div>
        <div class="wi-sub">적 정보 <small>증원 ${st.waves.length - 1}회</small></div><div class="wi-foes">${foeHtml}</div>
        <div class="wi-sub">출격 인원 <small>${st.heroes.length}명</small></div><div class="wi-heroes">${heroHtml}</div>
        <button class="wgo" id="sGo"><b>작전 개시</b><small>BATTLE START</small></button>`;
    } else {
      const lv = partyLv();
      acts = `<div class="wi-sub">할 수 있는 일</div><div class="wi-acts">
        ${sides.map((s) => `<button class="wact side" data-side="${s.idx}"><b>${s.kind === 'Ex' ? '고난도' : '의뢰'} · ${s.title}</b><small>${s.desc}</small><em>적 Lv.${Math.min(...s.waves.flat().map((u) => u[1]))}~</em></button>`).join('')}
        <button class="wact" id="sRep"><b>소탕전</b><small>이 지역에 남은 철충을 다시 쓸어 낸다. 적이 부대 레벨에 맞춰 나온다.</small><em>적 Lv.${lv - 1}~</em></button>
        ${S ? '<button class="wact dim" id="sStory"><b>이야기 다시 보기</b><small>이 작전의 앞뒤 대화를 다시 본다.</small></button>' : ''}
        ${done.map((s) => `<div class="wdone">완료한 의뢰 · ${s.title}</div>`).join('')}</div>`;
    }
    $('sInfo').innerHTML = `<button class="wclose" onclick="this.parentElement.classList.remove('on')">✕</button><div class="wi-top"><span class="wi-no">${st.idx}</span><div class="wi-name">${st.title}${clear ? '<em>CLEAR</em>' : ''}</div></div>
      <p class="wi-desc">${S ? S.desc : ''}</p>${acts}`;
    if ($('sGo')) $('sGo').onclick = () => { AU.play('lo_click', 0.7); startStage(id); };
    if ($('sRep')) $('sRep').onclick = () => { AU.play('lo_click', 0.7); prep(repeatStage(id)); };
    if ($('sStory')) $('sStory').onclick = async () => { AU.play('lo_click', 0.7); hideScreen(); AU.bgm(S.bgmStart); await story(S.start); AU.bgm(S.bgmEnd); await story(S.end); stageSelect(); };
    document.querySelectorAll('.wact.side').forEach((b) => (b.onclick = () => { AU.play('lo_click', 0.7); prep(sideStage(b.dataset.side)); }));
    placeInfo();
  }
  function stageInfo() { nodeInfo(); }

  // ── 마을: js/town.js 필드. 동료와 대화(원작 로비 대사·음성), 의뢰 받기(원작 의뢰 대화 → 월드맵에 의뢰 전투) ──
  const NPC_NAME = { fortune: '포츈' };
  const npcName = (id) => (D.HEROES[id] ? D.HEROES[id].full : NPC_NAME[id] || id);
  const STAND_OF = { pupphead: 'PECS_PuppHead_N', fallen: 'AGS_Fallen_N' }; // 표정 그림이 없는 기계
  async function enterTown() {
    hideScreen();
    leaveMap();
    mode = 'town';
    await TOWNF.enter({
      present: (id) => (id === 'fortune' ? save.clear >= TOWN.unlock : id !== 'constantia' && joined().has(id)),
      marker: (id) => sideNew().some((s) => s.giver === id),
      talk: async (id) => {
        const q = sideNew().find((s) => s.giver === id);
        if (q) {
          // 원작 의뢰 대화 (곁가지 작전 앞 대화)
          const S = window.STORY && STORY[q.idx];
          if (S) { AU.bgm(S.bgmStart); await story(S.start); AU.bgm('lo_lobby'); }
          save.side = save.side || {}; save.side[q.idx] = 'open'; writeSave();
          AU.play('lo_join', 0.6);
          await new Promise((r) => modal(`<h3>의뢰를 받았습니다</h3><p><b>${q.title}</b></p><p>${q.desc}</p><p style="color:#9aa6c4">월드맵의 ${D.STAGES[q.base - 1].idx} ${D.STAGES[q.base - 1].title} 지점에서 출격할 수 있습니다.</p><div class="opts"><button class="gold" data-a="ok">확인</button></div>`, r));
          return;
        }
        // 동료와 대화: 원작 로비 대사 중 하나 (음성과 표정 그대로)
        const lines = (window.LOBBY && LOBBY[id]) || [];
        if (!lines.length) return;
        const L = lines[Math.floor(Math.random() * lines.length)];
        const stand = STAND_OF[id] || L.f || HERO_STAND[id];
        if (L.v) AU.voice(L.v);
        await story([{ id: 1, who: npcName(id), face: '', t: L.t, bg: '', cg: '', next: null, ch: [], cast: [['C', stand, 1]], spk: 'C', see: 1 }]);
      },
    });
    mode = 'screen';
    stageSelect();
  }
  // 부대 현황: 합류한 영웅 목록
  function heroRoster() {
    const j = joined();
    const cards = Object.keys(D.HEROES).filter((id) => j.has(id)).map((id) => {
      const h = D.HEROES[id], s = save.heroes[id], t = h.tiers[s.tier], k = 1 + 0.07 * (s.lv - D.TIER_LV[s.tier]);
      return `<div class="pcard rcard"><div class="pimg ${id === 'pupphead' || id === 'fallen' ? 'whole' : ''}" style="background-image:url(assets/story/stand/${HERO_STAND[id]}.webp)"></div>
        <div class="pfoot"><span class="plv">Lv.${s.lv}</span><b>${h.name}</b><small>${kindTag(h.kind)} · ${t.cls}</small></div>
        <div class="ptroop rst"><span>체력 ${Math.round(t.hp * k)}</span><span>공격 ${Math.round(t.at * k)}</span><span>방어 ${Math.round(t.df * k)}</span></div></div>`;
    }).join('');
    $('modal').classList.add('wide');
    modal(`<h3>부대 현황 <small style="color:#8d95a8;font:13px LO_M">합류 ${j.size}명</small></h3><div class="rgrid">${cards}</div><div class="opts"><button class="gold" data-a="ok">닫기</button></div>`, () => $('modal').classList.remove('wide'));
  }
  const joined = () => new Set(D.STAGES.slice(0, Math.min(D.STAGES.length, save.clear + 1)).flatMap((s) => s.heroes));
  function heroStatLine(id) {
    const h = D.HEROES[id], s = save.heroes[id], t = h.tiers[s.tier], k = 1 + 0.07 * (s.lv - D.TIER_LV[s.tier]);
    return `${kindTag(h.kind)} 체력 <b>${Math.round(t.hp * k)}</b> · 공격 <b>${Math.round(t.at * k)}</b> · 방어 <b>${Math.round(t.df * k)}</b> · 이동 <b>${t.mov}</b> · 사거리 <b>${h.rng}</b>`;
  }
  function heroCards() {
    const j = joined();
    return Object.entries(D.HEROES).filter(([id]) => j.has(id)).map(([id, h]) => {
      const s = save.heroes[id], t = h.tiers[s.tier];
      return `<div class="hero"><div class="pic" style="background-image:url(${IMG[h.icon]})"></div>
        <div class="nm">${h.full}<small>Lv${s.lv} · ${t.cls}</small></div>
        <div class="st">${heroStatLine(id)}</div></div>`;
    }).join('');
  }

  // 출격 준비: 원작 편성 화면처럼 영웅 카드 + 오른쪽 상세(능력치·특기·병사 배속). 고를 때 인물 음성
  const HERO_STAND = { constantia: '3P_ConstantiaS2_N_Smile', griffon: 'BR_PA00EL_N_Smile', johanna: 'DS_Johanna_N_Smile', lrl: 'PECS_LRL_N_Laugh', pupphead: 'PECS_PuppHead_N', fallen: 'AGS_Fallen_N' };
  const heroVoice = (id, kind) => AU.voice(id + '_' + kind);
  // 화면 안의 일러스트 캔버스(data-stand)를 움직이는 일러스트로 (js/portrait.js). 화면이 바뀌면 알아서 정리된다
  function liveCards() {
    document.querySelectorAll('canvas[data-stand]').forEach((cv) => {
      if (cv._portrait) return;
      const box = cv.parentElement.getBoundingClientRect();
      PORTRAIT.attach(cv, cv.dataset.stand, { h: Math.max(200, box.height * (cv.parentElement.classList.contains('whole') ? 1 : 1.9)) });
    });
  }
  function prep(x) {
    const st = stageOf(x);
    // 소탕전·의뢰: 합류한 영웅 중에서 st.free 명까지 고른다 (콘스탄챠는 지휘관이라 항상 출전)
    const roster = st.free ? ['constantia', ...[...joined()].filter((id) => id !== 'constantia')] : st.heroes;
    if (st.free && !st.heroes) {
      const last = (save.party || []).filter((id) => roster.includes(id) && id !== 'constantia');
      st.heroes = ['constantia', ...last, ...roster.filter((id) => id !== 'constantia' && !last.includes(id))].slice(0, st.free);
    }
    const pick = {};
    for (const id of roster) {
      const t = D.HEROES[id].tiers[save.heroes[id].tier];
      pick[id] = t.troops.includes(save.troops[id]) ? save.troops[id] : t.troops[0];
    }
    const j = joined();
    let cur = roster.find((id) => !j.has(id) || id === 'constantia') || roster[0];
    // 이번에 처음 합류하는 영웅이 있으면 합류 음성
    const fresh = st.heroes.find((id) => !(save.joined || []).includes(id));
    AU.bgm('lo_lobby');
    const stat = (id) => {
      const h = D.HEROES[id], s = save.heroes[id], t = h.tiers[s.tier], k = 1 + 0.07 * (s.lv - D.TIER_LV[s.tier]);
      return { h, s, t, hp: Math.round(t.hp * k), at: Math.round(t.at * k), df: Math.round(t.df * k) };
    };
    const card = (id) => {
      const { h, s, t } = stat(id), tr = D.TROOPS[pick[id]];
      return `<button class="pcard ${id === cur ? 'sel' : ''} ${st.heroes.includes(id) ? '' : 'off'}" data-h="${id}">
        <div class="pimg ${id === 'pupphead' || id === 'fallen' ? 'whole' : ''}"><canvas class="pcv" data-stand="${HERO_STAND[id]}"></canvas></div>
        ${(save.joined || []).includes(id) ? '' : '<i class="pnew">NEW</i>'}
        <div class="pfoot"><span class="plv">Lv.${s.lv}</span><b>${h.name}</b><small>${kindTag(h.kind)} · ${t.cls}</small></div>
        <div class="ptroop"><img src="${IMG[tr.icon]}" alt=""><span>${tr.short} ×${R.SQUAD}</span></div><i class="psel"></i><i class="poff">대기</i></button>`;
    };
    const detail = () => {
      const id = cur, { h, s, t, hp, at, df } = stat(id);
      const next = D.TIER_LV[s.tier + 1];
      const troops = t.troops.map((k) => { const tr = D.TROOPS[k]; return `<button class="ptr ${pick[id] === k ? 'on' : ''}" data-t="${k}"><img src="${IMG[tr.icon]}" alt="">
        <span><b>${tr.name}</b>${kindTag(tr.kind)}<small>체력 ${tr.hp} · 공격 ${tr.at} · 방어 ${tr.df} · 이동 ${tr.mov}</small></span></button>`; }).join('');
      const inP = st.heroes.includes(id);
      const sortie = !st.free ? '' : id === 'constantia' ? '<div class="pd-sortie lead">지휘관 · 항상 출전</div>'
        : `<button class="pd-sortie ${inP ? 'on' : ''}" id="pTog">${inP ? '출전 중 · 누르면 대기' : st.heroes.length >= st.free ? `대기 중 · 출전 인원이 가득 찼습니다 (${st.free}명)` : '대기 중 · 누르면 출전'}</button>`;
      return `<div class="pd-head"><b>${h.full}</b><span>${t.cls}</span></div>${sortie}
        <div class="pd-lv"><span>Lv.<b>${s.lv}</b></span><div class="pd-exp"><i style="width:${Math.min(100, s.exp)}%"></i></div>${next ? `<small>Lv.${next}에 전직</small>` : '<small>최종 전직</small>'}</div>
        <div class="pd-stats"><div><label>병종</label>${kindTag(h.kind)}</div><div><label>체력</label><b>${hp}</b></div><div><label>공격</label><b>${at}</b></div>
          <div><label>방어</label><b>${df}</b></div><div><label>이동</label><b>${t.mov}</b></div><div><label>사거리</label><b>${h.rng}</b></div></div>
        <div class="wi-sub">특기</div><div class="pd-skills">${t.skills.map((k) => { const sk = D.SKILLS[k]; return `<div><b>${sk.name}</b><small>재사용 ${sk.cd}턴 · ${sk.desc}</small></div>`; }).join('')}</div>
        <div class="wi-sub">병사 배속 <small>공격받으면 병사가 먼저 피해를 받습니다</small></div><div class="pd-troops">${troops}</div>`;
    };
    const render = () => {
      screen(`<div class="pscr">
        <div class="pbg"></div>
        <div class="whead"><button class="wback" id="pBack" aria-label="뒤로"></button><div class="wtitle"><small>${st.idx} · ${st.title}</small><b>출격 준비</b></div></div>
        <div class="pcards">${roster.map(card).join('')}</div>
        <div class="pdetail">${detail()}</div>
        <div class="pfootbar"><div class="pgoal"><span>승리 <b>${st.goal}</b></span><span>패배 ${st.lose}</span><span class="dim">보병 ▶ 창병 ▶ 기병 ▶ 보병 · 궁병 ▶ 비병</span></div>
          <button class="lo-btn dark" id="pHelp">도움말</button><button class="wgo pgo" id="pGo"><b>출격</b><small>SORTIE</small></button></div></div>`);
      $('pBack').onclick = () => { AU.play('lo_click', 0.6); stageSelect(); };
      $('pHelp').onclick = () => { AU.play('lo_click', 0.6); help(); };
      $('pGo').onclick = () => {
        Object.assign(save.troops, pick);
        if (st.free) save.party = st.heroes.slice();
        writeSave();
        AU.play('lo_click', 0.8);
        heroVoice(st.heroes.includes('constantia') ? 'constantia' : st.heroes[0], 'StageStart');
        launch(st);
      };
      liveCards();
      document.querySelectorAll('.pcard').forEach((b) => (b.onclick = () => {
        if (cur === b.dataset.h) return;
        cur = b.dataset.h; AU.play('lo_pick', 0.5); heroVoice(cur, 'SortiePick'); refresh();
      }));
      bindTroops();
    };
    // 고를 때는 화면 전체를 다시 그리지 않고 바뀐 곳만 (움직이는 일러스트가 처음부터 다시 시작하지 않게)
    const bindTroops = () => {
      document.querySelectorAll('.ptr').forEach((b) => (b.onclick = () => {
        if (pick[cur] === b.dataset.t) return;
        pick[cur] = b.dataset.t; AU.play('lo_equip', 0.6); heroVoice(cur, 'SquadJoin'); refresh();
      }));
      // 출전 / 대기 바꾸기 (자유 편성)
      if ($('pTog')) $('pTog').onclick = () => {
        const i = st.heroes.indexOf(cur);
        if (i >= 0) st.heroes.splice(i, 1);
        else if (st.heroes.length < st.free) { st.heroes.push(cur); heroVoice(cur, 'SquadJoin'); }
        else return;
        AU.play('lo_equip', 0.6); refresh();
      };
    };
    const refresh = () => {
      document.querySelectorAll('.pcard').forEach((b) => {
        b.classList.toggle('sel', b.dataset.h === cur);
        b.classList.toggle('off', !st.heroes.includes(b.dataset.h));
        const tr = D.TROOPS[pick[b.dataset.h]];
        b.querySelector('.ptroop').innerHTML = `<img src="${IMG[tr.icon]}" alt=""><span>${tr.short} ×${R.SQUAD}</span>`;
      });
      const pd = document.querySelector('.pdetail');
      const top = pd.scrollTop;
      pd.innerHTML = detail();
      pd.scrollTop = top;
      bindTroops();
    };
    render();
    if (fresh) heroVoice(fresh, 'Join'); else heroVoice(cur, 'SortiePick');
  }

  async function startStage(si) {
    const st = D.STAGES[si];
    leaveMap();
    hideScreen();
    const S = window.STORY && STORY[st.idx];
    AU.play('lo_trans_in', 0.5);
    if (S) { AU.bgm(S.bgmStart); await story(S.start); }
    prep(si);
  }

  // 지도 전투 시작
  let stageStart = null;
  async function launch(x) {
    const st = stageOf(x);
    hideScreen();
    if (G) leaveMap();
    G = R.newGame(st);
    buildWorld();
    // 처음 합류하는 영웅은 일행 평균 레벨 근처에서 시작한다 (본작처럼 뒤늦게 합류해도 뒤처지지 않게)
    save.joined = save.joined || [];
    const old = save.joined.filter((id) => save.heroes[id]);
    for (const id of st.heroes) {
      if (save.joined.includes(id)) continue;
      if (old.length) {
        const avg = old.reduce((s, k) => s + save.heroes[k].lv, 0) / old.length;
        const lv = Math.max(save.heroes[id].lv, Math.round(avg) - 1);
        save.heroes[id] = { lv, exp: 0, tier: lv >= D.TIER_LV[2] ? 2 : lv >= D.TIER_LV[1] ? 1 : 0 };
      }
      save.joined.push(id);
    }
    st.heroes.forEach((id, i) => {
      // 시작 칸이 모자라면 (자유 편성으로 인원이 많을 때) 첫 시작 칸 근처 빈칸
      const p = st.starts[i] || R.freeAround(G, st.starts[0][0], st.starts[0][1], D.HEROES[id].move, 1)[0];
      R.makeHero(G, id, save.heroes[id], save.troops[id], p[0], p[1]);
    });
    R.spawnWave(G, 0);
    stageStart = { lv: Object.fromEntries(st.heroes.map((id) => [id, save.heroes[id].lv])) };
    const rigs = new Set();
    G.units.forEach((u) => { rigs.add(u.rig); if (u.troop) rigs.add(u.troop.rig); });
    st.waves.forEach((w) => w.units.forEach(([t]) => { const e = D.ENEMIES[t]; rigs.add(e.rig); if (e.troop) rigs.add(D.TROOPS[e.troop].rig); }));
    $('boot').classList.remove('hidden');
    $('boot').querySelector('.logo').classList.add('hidden');
    $('boot').querySelector('.bstage').innerHTML = `<span>${st.idx}</span>${st.title}<small>승리 조건 · ${st.goal}</small>`;
    let n = 0;
    await Promise.all([...rigs].map((id) => SD.prepare(id).then(() => { $('loadMsg').textContent = `부대 집결 중… ${++n}/${rigs.size}`; })));
    await Promise.all([...new Set(st.map.join('').split('').map((c) => (D.TERRAIN[c] || D.TERRAIN['.']).bg))].map((b) => loadTex('assets/bg/' + b + '.webp')));
    $('boot').classList.add('hidden');
    $('boot').querySelector('.logo').classList.remove('hidden');
    for (const u of G.units) addView(u);
    fitCamera(true);
    mode = 'map';
    $('hud').classList.remove('hidden');
    ui.state = 'idle'; busy = false; dangerOn = false; $('btnDanger').classList.remove('on'); autoOn = false; $('btnAuto').classList.remove('on');
    AU.bgm(st.bgm);
    setTop();
    if (st.id === 1 && !st.kind && !save.tutSeen) { save.tutSeen = true; writeSave(); await new Promise((r) => help(r)); }
    AU.play('lo_battle_start', 0.7);
    await startPhase('p');
  }
  function leaveMap() {
    if (FIGHT.active()) FIGHT.skip();
    clearViews();
    if (world) { scene.remove(world.root); world.dispose(); world = null; }
    for (const f of mapFx) f.m.material.dispose();
    mapFx.length = 0;
    G = null;
    $('hud').classList.add('hidden');
    $('forecast').classList.add('hidden');
    showActs(null);
    $('info').classList.add('hidden');
    $('modal').classList.add('hidden');
    ui.state = 'idle'; ui.sel = null;
  }

  // 결과: 원작 MISSION COMPLETE 화면 (최우수 인물 전신 + 음성, 영웅별 경험치 막대)
  function result(st, win, gain, rows, turn) {
    return new Promise((res) => {
      const mvp = win ? rows.filter((r) => r.alive).sort((a, b) => b.dealt - a.dealt)[0] || rows[0] : null;
      const lead = rows.find((r) => r.id === 'constantia') || rows[0];
      const face = mvp || lead;
      AU.bgm(null);
      AU.play(win ? 'lo_win_music' : 'fail', 0.7);
      const list = rows.map((r, i) => {
        const up = r.lv1 > r.lv0, h = D.HEROES[r.id];
        return `<div class="rrow ${r === mvp ? 'mvp' : ''}" style="animation-delay:${0.35 + i * 0.08}s">
          <img src="${IMG[h.icon]}" alt=""><div class="rinfo"><div class="rname"><b>${r.name}</b>${r === mvp ? '<i>MVP</i>' : ''}${r.alive ? '' : '<small>퇴각</small>'}</div>
          <div class="rlv">Lv.<b>${r.lv1}</b>${up ? `<span class="rup">LEVEL UP</span>` : ''}<em>+${gain} EXP</em></div>
          <div class="rbar"><i data-w="${r.exp1}" style="width:${up ? 0 : r.exp0}%"></i></div>${r.notes.map((n) => `<div class="rnote">${n}</div>`).join('')}</div></div>`;
      }).join('');
      screen(`<div class="rscr ${win ? 'win' : 'lose'}"><div class="pbg"></div>
        <div class="rmvp"><canvas data-stand="${HERO_STAND[face.id]}"></canvas></div>
        <div class="rpanel">
          <div class="rhead">${win ? '<img src="assets/ui/UI_Battle_Main_missionclear_label_2.png" alt="MISSION COMPLETE">' : '<b class="rfail">MISSION FAILED</b>'}
            <div class="rstage"><span>${st.idx}</span>${st.title}<small>${turn}턴</small></div></div>
          <div class="rsub">${win ? '참가 영웅 전원이 같은 경험치를 얻었습니다' : '얻은 경험치는 유지됩니다'}</div>
          <div class="rlist">${list}</div>
          <div class="rbtns">${win ? '<button class="wgo" id="rOk"><b>확인</b><small>NEXT</small></button>' : '<button class="lo-btn dark" id="rSel">작전 선택</button><button class="wgo" id="rRetry"><b>다시 도전</b><small>RETRY</small></button>'}</div>
        </div></div>`);
      liveCards();
      wait(700).then(() => AU.voice(face.id + '_' + (win ? (mvp ? 'MVP' : 'SearchEnd') : 'Retreat')));
      requestAnimationFrame(() => setTimeout(() => document.querySelectorAll('.rbar i').forEach((b) => (b.style.width = b.dataset.w + '%')), 500));
      if ($('rOk')) $('rOk').onclick = () => { AU.play('lo_click', 0.7); res(); };
      if ($('rRetry')) $('rRetry').onclick = () => { AU.play('lo_click', 0.7); prep(st); };
      if ($('rSel')) $('rSel').onclick = () => { AU.play('lo_click', 0.7); stageSelect(); };
    });
  }
  async function endStage(win, why) {
    if (!G || G.ended) return; // 한 전투는 한 번만 끝난다 (치트·적 차례가 겹쳐도)
    G.ended = true;
    busy = true;
    const g = G, st = G.stage;
    await wait(400);
    banner(win ? '작전 성공!' : '작전 실패', why || (win ? st.goal + ' 달성' : '콘스탄챠가 퇴각했습니다'), win ? 'gold' : 'e');
    AU.bgm(null);
    AU.play(win ? 'lo_win' : 'fail', 0.8);
    await wait(1700);
    // 경험치: 그 장소 본편 기준. 의뢰는 조금 더, 고난도는 1장 끝 기준으로
    const gain = Math.round(R.stageExp(st.kind === 'side' && st.side.kind === 'Ex' ? 9 : st.id - 1, win) * (st.kind === 'side' ? 1.25 : 1));
    const rows = [];
    for (const u of g.units.filter((x) => x.side === 'p')) {
      const s = save.heroes[u.key], h = D.HEROES[u.key];
      const row = { id: u.key, name: u.name, lv0: stageStart.lv[u.key], exp0: s.exp, alive: u.alive, dealt: u.dealt || 0, notes: [] };
      R.addExp(u, gain);
      s.lv = u.lv; s.exp = u.exp;
      row.lv1 = u.lv; row.exp1 = u.exp;
      while (s.tier < 2 && s.lv >= D.TIER_LV[s.tier + 1]) {
        const from = h.tiers[s.tier].cls;
        s.tier++;
        row.notes.push(`전직 · ${from} → <b>${h.tiers[s.tier].cls}</b>`);
        const prev = h.tiers[s.tier - 1];
        const ns = h.tiers[s.tier].skills.filter((k) => !prev.skills.includes(k)), nt = h.tiers[s.tier].troops.filter((k) => !prev.troops.includes(k));
        if (ns.length) row.notes.push(`새 특기 · ${ns.map((k) => D.SKILLS[k].name).join(', ')}`);
        if (nt.length) row.notes.push(`새 병사 · ${nt.map((k) => D.TROOPS[k].short).join(', ')}`);
      }
      rows.push(row);
    }
    if (win && !st.kind) save.clear = Math.max(save.clear, st.id);
    if (win && st.kind === 'side') { save.side = save.side || {}; save.side[st.idx] = 'done'; }
    window.GAME_LAST = { idx: st.idx, win, turn: g.turn, wave: g.wave + 1, alive: g.units.filter((u) => u.side === 'p').map((u) => u.name + (u.alive ? ':' + Math.round(u.hp) : 'x')).join(' ') };
    writeSave();
    const si = st.id - 1;
    leaveMap();
    await result(st, win, gain, rows, g.turn);
    // 이야기: 본편과 의뢰는 끝 대화 (소탕전은 없음)
    const S = st.kind !== 'repeat' && window.STORY && STORY[st.idx];
    if (win && S) { AU.bgm(S.bgmEnd); await story(S.end); }
    if (win) {
      stageSelect();
      if (!st.kind && si === D.STAGES.length - 1) modal('<h3>1지역 완료</h3><p>「지구의 마지막 인간」을 모두 마쳤습니다. 플레이해 주셔서 감사합니다!</p><p style="color:#9aa6c4">마을에 고난도 의뢰가 들어왔습니다. 소탕전으로 영웅을 더 키워 도전해 보세요.</p><div class="opts"><button class="gold" data-a="ok">확인</button></div>');
      else if (!st.kind && sideNew().length) modal(`<h3>새 의뢰</h3><p>${TOWN.name}에 새 의뢰가 들어왔습니다.</p><div class="opts"><button class="gold" data-a="ok">확인</button></div>`);
    }
    busy = false;
  }

  // ── 상단 버튼 ───────────────────────────────────────────
  $('btnEnd').onclick = () => { AU.play('lo_click', 0.5); endTurnAsk(); };
  $('btnMenu').onclick = () => { AU.play('lo_click', 0.5); if (busy && G && G.side === 'e') return; openMenu(); };
  $('btnDanger').onclick = () => { AU.play('lo_click', 0.5); toggleDanger(); };
  $('btnAuto').onclick = () => { AU.play('lo_click', 0.5); setAuto(!autoOn); };
  $('goalBox').onclick = () => goalInfo();

  // ── 애니메이션 도구 ─────────────────────────────────────
  const anims = [];
  function animate(dur, fn, done) { anims.push({ t: 0, dur: Math.max(0.001, dur), fn, done }); }
  const animateP = (dur, fn) => new Promise((r) => animate(dur / speedK, fn, r));

  // ── 메인 루프 ───────────────────────────────────────────
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt);
  }
  function step(dt) {
    simT += dt;
    TALK.update(dt);
    if (window.TOWNF && TOWNF.open) TOWNF.update(dt);
    const now = simT * 1000;
    for (let i = timers.length - 1; i >= 0; i--) if (timers[i].t <= simT) { const r = timers[i].r; timers.splice(i, 1); r(); }
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i];
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      a.fn(k);
      if (k >= 1) { anims.splice(i, 1); a.done && a.done(); }
    }
    if (mode === 'fight') {
      FIGHT.update(dt);
      FIGHT.render(renderer);
      return;
    }
    if (!G || !world) { renderer.render(scene, camera); return; }
    // 카메라 부드럽게 이동
    if (cam.tx != null) {
      const k = 1 - Math.pow(0.0015, dt);
      cam.x += (cam.tx - cam.x) * k; cam.z += (cam.tz - cam.z) * k;
      if (Math.abs(cam.tx - cam.x) + Math.abs(cam.tz - cam.z) < 0.02) cam.tx = cam.tz = null;
      clampCam(); placeCamera();
    }
    const t = now / 1000;
    for (const v of views.values()) {
      const sp = dt * (v.u.acted && v.u.side === 'p' ? 0.4 : 1);
      v.rig.update(sp);
      v.rig.order = 100 + Math.round((v.g.position.z + 0.1) * 20) + 2;
      for (const s of v.soldiers) { if (!s.bb.visible) continue; s.rig.update(sp); s.rig.order = 100 + Math.round((v.g.position.z + s.bb.position.z) * 20); }
      v.ring.scale.setScalar(ui.sel === v.u ? 1 + Math.sin(t * 6) * 0.08 : 1);
      if (v.u.move === 'fly') v.bb.position.y = 0.06 + Math.sin(t * 2.2 + v.bob) * 0.04;
    }
    if (world.water) world.water.material.map.offset.set(t * 0.03, t * 0.02);
    if (world.cursor.visible) world.cursor.scale.setScalar(1 + Math.sin(t * 5) * 0.04);
    for (let i = mapFx.length - 1; i >= 0; i--) {
      const f = mapFx[i];
      f.t += dt * speedK;
      const k = f.t / f.life;
      if (k >= 1) { world.root.remove(f.m); f.m.material.dispose(); mapFx.splice(i, 1); continue; }
      f.m.material.opacity = 1 - k;
      f.m.scale.setScalar(f.s0 * (0.8 + k * 0.7));
    }
    renderer.render(scene, camera);
  }

  // ── 시작 ─────────────────────────────────────────────────
  async function boot() {
    FIGHT.init();
    resize();
    // 타이틀 전에 아군 영웅 리그만 먼저 (나머지는 출격 때)
    const first = ['constantia', 'griffon'];
    let n = 0;
    await Promise.all(first.map((id) => SD.prepare(id).then(() => { $('loadMsg').textContent = `불러오는 중… ${++n}/${first.length}`; })));
    // 타이틀 그림은 미리 받아 둔다 (검은 화면에서 튀어나오지 않게)
    await Promise.all(['assets/title/bg.webp', 'assets/title/light.webp', 'assets/title/logo.webp'].map((u) => new Promise((r) => { const im = new Image(); im.onload = im.onerror = r; im.src = u; })));
    await loadTiles();
    await document.fonts.load('16px LO_B').catch(() => {});
    $('boot').classList.add('hidden');
    requestAnimationFrame(frame);
    title();
    WM3D.load('ch01').catch(() => {}); // 월드맵 3D 자료는 타이틀 동안 미리 받아 둔다
    // 첫 터치에서 배경음 시작 (모바일 정책)
    const kick = () => { AU.bgm(AU.bgmName || 'lo_title'); removeEventListener('pointerdown', kick); };
    addEventListener('pointerdown', kick);
    // 시험용 훅
    window.GAME = {
      get G() { return G; }, get mode() { return mode; }, get ui() { return ui; }, save, R, D,
      launch, prep, setAuto, startStage, endTurn, onTap, fitCamera, views, camera, cam, stageSelect, title, enterTown,
      // 창이 숨겨져 rAF가 멈춘 상태에서 시험할 때: 시간을 직접 진행하고 한 장 찍어 서버에 저장
      step(sec) { for (let i = 0; i < Math.round(sec * 30); i++) step(1 / 30); },
      // 시간을 진행하면서 약속(Promise)들도 풀리게 한다 (숨은 창에서도 타이머 제한 없이)
      async run(sec, until) {
        const tick = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
        for (let i = 0; i < Math.round(sec * 30); i++) { step(1 / 30); await tick(); if (until && until()) break; }
      },
      async shot(name = 'shot') {
        step(0.001);
        const d = renderer.domElement.toDataURL('image/jpeg', 0.85);
        await fetch('/tools/lab/out/' + name + '.json', { method: 'PUT', body: JSON.stringify({ d }) });
        return d.length;
      },
      skip() { if (FIGHT.active()) FIGHT.skip(); if (TALK.active) TALK.skip(); },
    };
  }
  boot();
})();
