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
    const def = { clear: 0, heroes: {}, troops: {}, opts: { fight: true, fast: false, sound: true, autoEnd: true } };
    s = Object.assign(def, s || {});
    s.opts = Object.assign(def.opts, s.opts || {});
    for (const id in D.HEROES) if (!s.heroes[id]) s.heroes[id] = { lv: 1, exp: 0, tier: 0 };
    return s;
  }
  function writeSave() { try { localStorage.setItem('orca_srpg_save2', JSON.stringify(save)); } catch (e) { /* 저장 불가 환경 */ } }
  AU.on = save.opts.sound;
  speedK = save.opts.fast ? 2 : 1;

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
  const TS = 64; // 지면 텍스처의 칸당 픽셀
  let G = null; // 현재 전투 상태 (RULES.newGame)
  let world = null; // 지도 3D 객체 묶음
  const isWaterC = (c) => c === 'w';
  const pathy = (c) => c === 'r' || c === '=' || c === 'v' || c === 'c';

  function drawGround(G) {
    const c = canvas(G.w * TS, G.h * TS), g = c.getContext('2d');
    const at = (x, y) => (R.inB(G, x, y) ? G.map[y][x] : null);
    const grass = (px, py, x, y, base, var1, var2) => {
      g.fillStyle = base; g.fillRect(px, py, TS, TS);
      for (let i = 0; i < 26; i++) {
        const r = hash(x, y, i);
        g.fillStyle = i % 2 ? var1 : var2;
        const bx = px + hash(x, y, i + 50) * TS, by = py + hash(x, y, i + 90) * TS;
        g.globalAlpha = 0.35 + r * 0.4;
        g.fillRect(bx, by, 2 + r * 3, 2);
        if (i % 5 === 0) { g.fillRect(bx, by - 3, 1.5, 4); g.fillRect(bx + 2, by - 2, 1.5, 3); }
      }
      g.globalAlpha = 1;
    };
    for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
      const t = G.map[y][x], px = x * TS, py = y * TS;
      switch (t) {
        case 'f': grass(px, py, x, y, '#4c8a3a', '#3b6e2c', '#5f9e48'); break;
        case 'm':
          g.fillStyle = '#8b8170'; g.fillRect(px, py, TS, TS);
          for (let i = 0; i < 14; i++) { g.fillStyle = i % 2 ? '#a29884' : '#6d6455'; g.globalAlpha = 0.5; g.beginPath(); g.arc(px + hash(x, y, i) * TS, py + hash(x, y, i + 9) * TS, 2 + hash(x, y, i + 3) * 4, 0, 7); g.fill(); }
          g.globalAlpha = 1; break;
        case 'h':
          grass(px, py, x, y, '#79ae55', '#5f9244', '#93c46c');
          g.fillStyle = 'rgba(255,255,200,.18)'; g.beginPath(); g.ellipse(px + TS * 0.5, py + TS * 0.55, TS * 0.42, TS * 0.3, 0, 0, 7); g.fill();
          g.strokeStyle = 'rgba(60,90,30,.45)'; g.lineWidth = 2;
          g.beginPath(); g.ellipse(px + TS * 0.5, py + TS * 0.58, TS * 0.42, TS * 0.3, 0, 0.1, Math.PI - 0.1); g.stroke();
          g.beginPath(); g.ellipse(px + TS * 0.5, py + TS * 0.55, TS * 0.24, TS * 0.15, 0, 0.2, Math.PI - 0.2); g.stroke();
          break;
        case 'w': case '=': {
          const lg = g.createLinearGradient(px, py, px, py + TS);
          lg.addColorStop(0, '#2c6aa6'); lg.addColorStop(1, '#245a92');
          g.fillStyle = lg; g.fillRect(px, py, TS, TS);
          g.strokeStyle = 'rgba(190,230,255,.25)'; g.lineWidth = 2;
          for (let i = 0; i < 3; i++) { const yy = py + 12 + i * 18 + hash(x, y, i) * 6; g.beginPath(); g.moveTo(px + 6 + hash(x, y, i + 4) * 10, yy); g.quadraticCurveTo(px + 24, yy - 4, px + 40 + hash(x, y, i + 7) * 14, yy); g.stroke(); }
          // 물가: 땅과 맞닿은 변에 모래·거품
          [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([dx, dy]) => {
            const n = at(x + dx, y + dy);
            if (n == null || isWaterC(n) || n === '=') return;
            const gr = dx ? g.createLinearGradient(px + (dx > 0 ? TS : 0), 0, px + (dx > 0 ? TS - 12 : 12), 0) : g.createLinearGradient(0, py + (dy > 0 ? TS : 0), 0, py + (dy > 0 ? TS - 12 : 12));
            gr.addColorStop(0, 'rgba(225,215,160,.95)'); gr.addColorStop(0.45, 'rgba(240,250,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = gr;
            if (dx) g.fillRect(px + (dx > 0 ? TS - 12 : 0), py, 12, TS); else g.fillRect(px, py + (dy > 0 ? TS - 12 : 0), TS, 12);
          });
          if (t === '=') {
            const horiz = !isWaterC(at(x - 1, y) || 'w') || !isWaterC(at(x + 1, y) || 'w') || at(x - 1, y) === '=' || at(x + 1, y) === '=';
            g.save(); g.translate(px + TS / 2, py + TS / 2); if (!horiz) g.rotate(Math.PI / 2);
            g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-TS / 2, -TS * 0.3 + 4, TS, TS * 0.6);
            for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#a0703e' : '#b5824a'; g.fillRect(-TS / 2 + i * 8, -TS * 0.3, 7.2, TS * 0.6); }
            g.fillStyle = '#5e3c1c'; g.fillRect(-TS / 2, -TS * 0.33, TS, 4); g.fillRect(-TS / 2, TS * 0.29, TS, 4);
            g.restore();
          }
          break;
        }
        case 'c':
          g.fillStyle = '#a99f8b'; g.fillRect(px, py, TS, TS);
          g.strokeStyle = 'rgba(70,60,45,.35)'; g.lineWidth = 1.5;
          for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(px, py + i * 16); g.lineTo(px + TS, py + i * 16); g.stroke(); }
          for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { g.beginPath(); const xx = px + j * 32 + (i % 2) * 16; g.moveTo(xx, py + i * 16); g.lineTo(xx, py + i * 16 + 16); g.stroke(); }
          g.fillStyle = 'rgba(120,20,30,.25)'; g.fillRect(px + 8, py + 8, TS - 16, TS - 16);
          break;
        case '#':
          g.fillStyle = '#58534d'; g.fillRect(px, py, TS, TS);
          g.fillStyle = '#8c867c'; g.fillRect(px + 2, py + 2, TS - 4, TS - 18);
          g.strokeStyle = 'rgba(40,36,30,.6)'; g.lineWidth = 2;
          for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(px + 2, py + 2 + i * 15); g.lineTo(px + TS - 2, py + 2 + i * 15); g.stroke(); }
          for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { g.beginPath(); const xx = px + 4 + j * 21 + (i % 2) * 10; g.moveTo(xx, py + 2 + i * 15); g.lineTo(xx, py + 17 + i * 15); g.stroke(); }
          g.fillStyle = '#3c3833'; g.fillRect(px, py + TS - 16, TS, 16);
          break;
        case 's':
          g.fillStyle = '#b3a385'; g.fillRect(px, py, TS, TS);
          g.strokeStyle = 'rgba(80,65,45,.5)'; g.lineWidth = 1.5;
          for (let i = 0; i < 3; i++) { g.beginPath(); let xx = px + hash(x, y, i) * TS, yy = py + hash(x, y, i + 5) * TS; g.moveTo(xx, yy); for (let k = 0; k < 4; k++) { xx += (hash(x, y, i * 9 + k) - 0.5) * 20; yy += (hash(x, y, i * 7 + k + 3) - 0.5) * 20; g.lineTo(xx, yy); } g.stroke(); }
          for (let i = 0; i < 7; i++) { g.fillStyle = i % 2 ? '#8a7c66' : '#cfc3a6'; g.fillRect(px + hash(x, y, i + 20) * TS, py + hash(x, y, i + 30) * TS, 4 + hash(x, y, i) * 5, 3 + hash(x, y, i + 1) * 4); }
          break;
        default: grass(px, py, x, y, '#68a64c', '#558f3d', '#82bd62');
      }
      if (t === 'v') { g.fillStyle = 'rgba(205,190,150,.75)'; g.beginPath(); g.roundRect ? g.roundRect(px + 6, py + 6, TS - 12, TS - 12, 10) : g.rect(px + 6, py + 6, TS - 12, TS - 12); g.fill(); }
    }
    // 길: 이어진 칸끼리 둥근 선으로
    const roadPass = (w, col) => {
      g.strokeStyle = col; g.fillStyle = col; g.lineCap = 'round'; g.lineWidth = w;
      for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
        const t = G.map[y][x];
        if (t !== 'r' && t !== 'v') continue;
        const cx = x * TS + TS / 2, cy = y * TS + TS / 2;
        g.beginPath(); g.arc(cx, cy, w / 2, 0, 7); g.fill();
        [[1, 0], [0, 1], [-1, 0], [0, -1]].forEach(([dx, dy]) => {
          const n = at(x + dx, y + dy);
          if (!n || !pathy(n)) return;
          g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + dx * TS / 2, cy + dy * TS / 2); g.stroke();
        });
      }
    };
    roadPass(TS * 0.5, '#8e7046');
    roadPass(TS * 0.4, '#c9a76c');
    // 격자
    g.strokeStyle = 'rgba(0,0,0,.13)'; g.lineWidth = 1;
    for (let x = 0; x <= G.w; x++) { g.beginPath(); g.moveTo(x * TS + 0.5, 0); g.lineTo(x * TS + 0.5, G.h * TS); g.stroke(); }
    for (let y = 0; y <= G.h; y++) { g.beginPath(); g.moveTo(0, y * TS + 0.5); g.lineTo(G.w * TS, y * TS + 0.5); g.stroke(); }
    // 가장자리 어둡게
    const vg = g.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.35, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.35)');
    g.fillStyle = vg; g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // 장식 그림 (나무·산·집)
  const DECO = {};
  function decoTex() {
    if (DECO.tree) return;
    DECO.tree = [0, 1, 2].map((v) => canvasTex(96, 128, (g) => {
      g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(48, 120, 30, 7, 0, 0, 7); g.fill();
      g.fillStyle = '#6b4526'; g.fillRect(43, 80, 10, 40);
      const cols = [['#2f6b2a', '#3f8a35', '#6cba52'], ['#2a5f34', '#3b7f43', '#69b46a'], ['#3d6e22', '#56922f', '#8cc451']][v];
      const blobs = [[48, 72, 30], [30, 60, 22], [66, 60, 22], [48, 40, 26], [48, 18, 16]];
      g.fillStyle = '#1e4219'; blobs.forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y + 3, r + 2, 0, 7); g.fill(); });
      g.fillStyle = cols[0]; blobs.forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); });
      g.fillStyle = cols[1]; blobs.forEach(([x, y, r]) => { g.beginPath(); g.arc(x - r * 0.2, y - r * 0.2, r * 0.75, 0, 7); g.fill(); });
      g.fillStyle = cols[2]; blobs.forEach(([x, y, r]) => { g.beginPath(); g.arc(x - r * 0.35, y - r * 0.4, r * 0.35, 0, 7); g.fill(); });
    }));
    DECO.mount = [0, 1].map((v) => canvasTex(192, 140, (g) => {
      g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(96, 132, 80, 9, 0, 0, 7); g.fill();
      const peaks = v ? [[60, 34, 46], [128, 12, 62]] : [[96, 8, 70], [40, 50, 40], [150, 46, 40]];
      for (const [px, py, hw] of peaks) {
        g.fillStyle = '#7d7363'; g.beginPath(); g.moveTo(px - hw, 132); g.lineTo(px, py); g.lineTo(px + hw, 132); g.fill();
        g.fillStyle = '#5b5346'; g.beginPath(); g.moveTo(px, py); g.lineTo(px + hw, 132); g.lineTo(px + hw * 0.15, 132); g.fill();
        g.fillStyle = '#f2f4f8'; g.beginPath(); g.moveTo(px, py); g.lineTo(px - hw * 0.28, py + (132 - py) * 0.28); g.lineTo(px - hw * 0.08, py + (132 - py) * 0.22); g.lineTo(px + hw * 0.05, py + (132 - py) * 0.3); g.lineTo(px + hw * 0.28, py + (132 - py) * 0.28); g.fill();
      }
    }));
    DECO.house = [0, 1].map((v) => canvasTex(96, 96, (g) => {
      g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(48, 88, 36, 7, 0, 0, 7); g.fill();
      g.fillStyle = '#e8dcc0'; g.fillRect(18, 46, 60, 40);
      g.fillStyle = '#c6b896'; g.fillRect(48, 46, 30, 40);
      g.fillStyle = v ? '#3e6fb0' : '#b8493c'; g.beginPath(); g.moveTo(10, 50); g.lineTo(48, 16); g.lineTo(86, 50); g.fill();
      g.fillStyle = v ? '#2b5089' : '#8c3329'; g.beginPath(); g.moveTo(48, 16); g.lineTo(86, 50); g.lineTo(48, 50); g.fill();
      g.fillStyle = '#5a3d22'; g.fillRect(30, 62, 12, 24);
      g.fillStyle = '#8fd0ff'; g.fillRect(56, 58, 12, 10);
    }));
    DECO.rubble = [0, 1].map((v) => canvasTex(128, 112, (g) => {
      g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(64, 102, 56, 9, 0, 0, 7); g.fill();
      const blocks = v ? [[18, 58, 40, 44, -0.2], [52, 30, 34, 72, 0.08], [84, 62, 34, 40, 0.25]] : [[20, 46, 46, 56, 0.12], [62, 62, 48, 40, -0.15], [44, 22, 26, 34, 0.3]];
      for (const [x, y, w, h, r] of blocks) {
        g.save(); g.translate(x + w / 2, y + h / 2); g.rotate(r);
        g.fillStyle = '#7d7a74'; g.fillRect(-w / 2, -h / 2, w, h);
        g.fillStyle = '#9c9890'; g.fillRect(-w / 2, -h / 2, w, h * 0.28);
        g.fillStyle = '#5a5751'; g.fillRect(w * 0.18, -h / 2, w * 0.32, h);
        g.strokeStyle = '#3d3a35'; g.lineWidth = 2; g.strokeRect(-w / 2, -h / 2, w, h);
        g.strokeStyle = '#6b4a2e'; g.lineWidth = 3; g.beginPath(); g.moveTo(-w * 0.3, -h / 2); g.lineTo(-w * 0.36, -h / 2 - 8); g.stroke();
        g.restore();
      }
    }));
    DECO.tower = canvasTex(96, 160, (g) => {
      g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(48, 152, 40, 7, 0, 0, 7); g.fill();
      g.fillStyle = '#8d877c'; g.fillRect(16, 40, 64, 112);
      g.fillStyle = '#6b665d'; g.fillRect(48, 40, 32, 112);
      for (let i = 0; i < 4; i++) { g.fillStyle = '#8d877c'; g.fillRect(12 + i * 20, 26, 14, 16); }
      g.fillStyle = '#2a2622'; g.fillRect(38, 70, 12, 18);
      g.fillStyle = '#b0242f'; g.fillRect(46, 0, 3, 28); g.beginPath(); g.moveTo(49, 2); g.lineTo(72, 9); g.lineTo(49, 16); g.fill();
    });
  }

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
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(G.w + 60, G.h + 60), new THREE.MeshBasicMaterial({ color: night ? 0x070a14 : 0x141c30 }));
    outer.rotation.x = -Math.PI / 2; outer.position.set(G.w / 2, -0.02, G.h / 2);
    root.add(outer);
    // 지면
    const gc = drawGround(G);
    const gt = new THREE.CanvasTexture(gc);
    gt.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(G.w, G.h), new THREE.MeshBasicMaterial({ map: gt, color: night ? 0x7c88b8 : 0xffffff }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(G.w / 2, 0, G.h / 2);
    root.add(ground);
    // 판 테두리 (두께감)
    const edge = new THREE.Mesh(new THREE.BoxGeometry(G.w + 0.3, 0.4, G.h + 0.3), new THREE.MeshBasicMaterial({ color: night ? 0x1a1f33 : 0x3a2e22 }));
    edge.position.set(G.w / 2, -0.22, G.h / 2);
    root.add(edge);
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
        const n = 2 + (hash(x, y, 7) > 0.6 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const ox = [0.28, 0.72, 0.5][i] + (hash(x, y, i) - 0.5) * 0.15, oz = [0.36, 0.5, 0.82][i] + (hash(x, y, i + 3) - 0.5) * 0.1;
          const s = 0.52 + hash(x, y, i + 9) * 0.16;
          decos.push(sprite(DECO.tree[Math.floor(hash(x, y, i + 1) * 3)], s, s * 1.33, x + ox, y + oz, night));
        }
      } else if (t === 'm') {
        decos.push(sprite(DECO.mount[hash(x, y, 2) > 0.5 ? 1 : 0], 1.25, 0.9, x + 0.5, y + 0.72, night));
      } else if (t === 'v') {
        decos.push(sprite(DECO.house[0], 0.5, 0.5, x + 0.3, y + 0.42, night));
        decos.push(sprite(DECO.house[1], 0.46, 0.46, x + 0.72, y + 0.62, night));
      } else if (t === '#') {
        decos.push(sprite(DECO.rubble[hash(x, y, 4) > 0.5 ? 1 : 0], 0.95, 0.83, x + 0.5, y + 0.82, night));
      }
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
  addEventListener('keydown', (e) => {
    if (mode === 'talk') { if (['Enter', 'Space', 'KeyZ'].includes(e.code)) talkNext(); if (e.code === 'Escape') talkSkip(); return; }
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
      b.onclick = (e) => { e.stopPropagation(); AU.play('click', 0.5); a.fn(); };
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
    AU.play('click', 0.6);
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
      AU.play('click', 0.25);
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
    vd.rig.c.setTint(1.8, 1.4, 1.4);
    await wait(120);
    refreshView(d);
    if (res.counter) {
      vd.rig.once('atk', Math.max(1, vd.rig.dur('atk') / 1.0) * speedK);
      AU.play(d.def.sfx, 0.6);
      await wait(380);
      fxAt(a.x, a.y, 'hit');
    }
    await wait(250);
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

  // ── 대화 (본작 대본: 노드 사슬 + 사령관 선택지) ─────────
  let talkNodes = null, talkCur = null, talkDone = null;
  // nodes: js/story.js 노드 배열 [{id, who, face, t, bg, cg, next, ch}]
  function story(nodes) {
    return new Promise((res) => {
      if (!nodes || !nodes.length) { res(); return; }
      talkNodes = new Map(nodes.map((n) => [n.id, n]));
      talkDone = res;
      talk.prev = mode;
      mode = 'talk';
      $('talk').classList.remove('hidden');
      $('talkBg').classList.remove('hidden');
      $('talkBg').style.backgroundImage = '';
      $('talkBg').querySelector('.tstage').innerHTML = '';
      showNode(nodes[0]);
    });
  }
  function talk(lines) { // 간단한 대사 [[화자, 얼굴, 문장]] (도움말 등)
    return story(lines.map(([who, face, t], i) => ({ id: i + 1, who, face, t, bg: '', cg: '', next: i + 2 <= lines.length ? i + 2 : null, ch: [] })));
  }
  function showNode(n) {
    talkCur = n;
    const el = $('talk'), bg = $('talkBg');
    if (n.bg) bg.style.backgroundImage = `url(assets/story/bg/${n.bg}.webp)`;
    const cg = bg.querySelector('.tcg');
    if (n.cg) { if (cg.dataset.k !== n.cg) { cg.src = `assets/story/cg/${n.cg}.webp`; cg.dataset.k = n.cg; } } else { cg.removeAttribute('src'); cg.dataset.k = ''; }
    bg.classList.toggle('cg', !!n.cg);
    // 전신 일러스트: 말하는 쪽은 밝게, 나머지는 어둡게 (2 = 회상)
    const stage = bg.querySelector('.tstage');
    const want = new Map((n.cast || []).map(([p, s, d]) => [p, [s, d]]));
    stage.querySelectorAll('.stand').forEach((im) => { if (!want.has(im.dataset.p)) im.remove(); });
    for (const [p, [s, d]] of want) {
      let im = stage.querySelector(`.stand[data-p="${p}"]`);
      if (!im) { im = document.createElement('img'); im.className = 'stand'; im.dataset.p = p; stage.appendChild(im); }
      if (im.dataset.s !== s) { im.src = `assets/story/stand/${s}.webp`; im.dataset.s = s; }
      im.classList.toggle('dim', !!n.spk && n.spk !== p && d !== 2);
      im.classList.toggle('past', d === 2);
    }
    if (!n.t && !(n.ch && n.ch.length)) { goNode(n.next); return; } // 화면 전환만 하는 빈 줄
    const face = el.querySelector('.tface'), img = face.querySelector('img');
    el.classList.toggle('nar', !n.who);
    face.classList.toggle('none', !n.face);
    if (n.face) {
      const icon = n.face.startsWith('icon:');
      img.className = icon ? 'icon' : '';
      img.src = icon ? IMG[n.face.slice(5)] : `assets/story/face/${n.face}.webp`;
    }
    el.querySelector('.tname').textContent = n.who || '';
    el.querySelector('.ttext').textContent = n.t;
    const ch = el.querySelector('.tchoices');
    ch.innerHTML = '';
    if (n.ch && n.ch.length) {
      for (const [text, next] of n.ch) {
        const b = document.createElement('button');
        b.textContent = text;
        b.onclick = (e) => { e.stopPropagation(); AU.play('click', 0.5); goNode(next); };
        ch.appendChild(b);
      }
    }
    el.querySelector('.tnext').style.visibility = n.ch && n.ch.length ? 'hidden' : '';
    AU.play('click', 0.25);
  }
  function goNode(id) { const n = id != null && talkNodes.get(id); if (n) showNode(n); else talkEnd(); }
  function talkNext() { if (!talkCur) return; if (talkCur.ch && talkCur.ch.length) return; goNode(talkCur.next); }
  function talkEnd() {
    talkNodes = null; talkCur = null;
    $('talk').classList.add('hidden');
    $('talkBg').classList.add('hidden');
    mode = talk.prev === 'talk' ? 'map' : talk.prev;
    const cb = talkDone; talkDone = null;
    if (cb) cb();
  }
  function talkSkip() { if (talkCur) talkEnd(); }
  $('talk').addEventListener('click', (e) => { if (e.target.closest('.tskip')) { talkSkip(); return; } if (e.target.closest('.tchoices')) return; talkNext(); });

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
      AU.play('click', 0.4);
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
      <button data-a="sound">소리: <b>${onoff(o.sound)}</b></button>
      <button data-a="help">도움말 (규칙·조작)</button>
      <button data-a="goal">승리·패배 조건</button>
      <button data-a="retry">처음부터 다시</button>
      <button data-a="quit" class="red">작전 포기 (선택 화면으로)</button>
      <button data-a="close" class="gold">닫기</button></div>`, (a) => {
      if (['fight', 'fast', 'autoEnd', 'sound'].includes(a)) {
        o[a] = !o[a]; writeSave();
        speedK = o.fast ? 2 : 1; AU.setOn(o.sound);
        openMenu();
      } else if (a === 'help') help();
      else if (a === 'goal') goalInfo();
      else if (a === 'retry') { const si = G.stage.id - 1; leaveMap(); prep(si); }
      else if (a === 'quit') { leaveMap(); stageSelect(); }
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
  function screen(html) { $('screen').innerHTML = html; mode = 'screen'; }
  function hideScreen() { $('screen').innerHTML = ''; }
  function title() {
    leaveMap();
    AU.bgm('title');
    const has = save.clear > 0 || Object.values(save.heroes).some((h) => h.lv > 1);
    screen(`<div class="scr title" style="background-image:url(assets/bg/title.webp)">
      <div class="logo">오르카 전기<small>라스트오리진 전술 시뮬레이션</small></div>
      <div class="menuBtns">
        ${has ? '<button class="gold" id="tCont">이어하기</button>' : ''}
        <button id="tNew" class="${has ? '' : 'gold'}">처음부터</button>
        <button id="tHelp">도움말</button>
      </div>
      <div class="foot">본작 메인 스토리를 따라가는 비영리 팬메이드 게임입니다.<br>세로·가로 화면과 PC 모두 지원합니다.</div></div>`);
    const go = () => { AU.play('click'); stageSelect(); };
    if ($('tCont')) $('tCont').onclick = go;
    $('tNew').onclick = () => {
      const start = () => { save.clear = 0; save.troops = {}; save.joined = []; for (const id in D.HEROES) save.heroes[id] = { lv: 1, exp: 0, tier: 0 }; writeSave(); startStage(0); };
      if (has) modal('<h3>처음부터</h3><p>지금까지의 진행이 지워집니다. 시작할까요?</p><div class="opts"><button class="red" data-a="y">처음부터 시작</button><button data-a="n">취소</button></div>', (a) => { if (a === 'y') start(); });
      else start();
    };
    $('tHelp').onclick = () => help();
  }
  function stageSelect() {
    leaveMap();
    AU.bgm('title');
    const cards = D.STAGES.map((st, i) => {
      const lock = i > save.clear, clear = i < save.clear;
      const S = window.STORY && STORY[st.idx];
      return `<button class="stg ${lock ? 'lock' : ''} ${clear ? 'clear' : ''}" data-i="${i}" ${lock ? 'disabled' : ''}>
        <span class="no">${st.idx}</span><span class="tt">${st.title}</span><span class="gl">${S ? S.desc : ''}</span><span class="gl">승리: ${st.goal} · 출격 ${st.heroes.length}명</span></button>`;
    }).join('');
    const end = save.clear >= D.STAGES.length ? '<div class="tipbox"><b>1지역을 모두 클리어했습니다!</b> 다시 플레이해 영웅을 더 키울 수 있습니다.</div>' : '';
    screen(`<div class="scr"><div class="bar"><button id="sBack" class="ghost">◀ 타이틀</button><h2>작전 선택</h2><span></span></div>
      <div class="chap"><b>1지역</b>지구의 마지막 인간</div>
      ${end}<div class="stages">${cards}</div>
      <h2 style="margin-top:22px">영웅</h2><div class="heroes">${heroCards()}</div></div>`);
    $('sBack').onclick = title;
    document.querySelectorAll('.stg').forEach((b) => (b.onclick = () => { AU.play('click'); startStage(+b.dataset.i); }));
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

  // 출격 준비: 영웅마다 병사 배속
  function prep(si) {
    const st = D.STAGES[si];
    const pick = {};
    for (const id of st.heroes) {
      const t = D.HEROES[id].tiers[save.heroes[id].tier];
      pick[id] = t.troops.includes(save.troops[id]) ? save.troops[id] : t.troops[0];
    }
    const render = () => {
      const cards = st.heroes.map((id) => {
        const h = D.HEROES[id], s = save.heroes[id], t = h.tiers[s.tier];
        const opts = t.troops.map((k) => { const tr = D.TROOPS[k]; return `<button class="${pick[id] === k ? 'on' : ''}" data-h="${id}" data-t="${k}"><img src="${IMG[tr.icon]}"><span>${tr.name} ${kindTag(tr.kind)}<small>10명 · 체력 ${tr.hp} · 공 ${tr.at} · 방 ${tr.df} · 이동 ${tr.mov}</small></span></button>`; }).join('');
        return `<div class="hero"><div class="pic" style="background-image:url(${IMG[h.icon]})"></div>
          <div class="nm">${h.full}<small>Lv${s.lv} · ${t.cls}</small></div>
          <div class="st">${heroStatLine(id)}<br>특기: ${t.skills.map((k) => D.SKILLS[k].name).join(', ')}</div>
          <div class="troopPick">${opts}</div></div>`;
      }).join('');
      screen(`<div class="scr"><div class="bar"><button id="pBack" class="ghost">◀ 작전 선택</button><h2>${st.idx} 출격 준비 · 병사 배속</h2><span></span></div>
        <div class="tipbox">영웅마다 함께 싸울 병사를 고르세요. 공격받으면 병사가 먼저 피해를 받습니다.<br>
        승리: <b>${st.goal}</b> · 패배: ${st.lose} · 상성 <b>보병 ▶ 창병 ▶ 기병 ▶ 보병</b>, 궁병 ▶ 비병 · 이동력은 영웅과 병사 중 느린 쪽</div>
        <div class="heroes">${cards}</div>
        <div class="prepFoot"><button id="pHelp" class="ghost">도움말</button><button id="pGo" class="gold">출격</button></div></div>`);
      $('pBack').onclick = stageSelect;
      $('pHelp').onclick = () => help();
      $('pGo').onclick = () => { Object.assign(save.troops, pick); writeSave(); launch(si); };
      document.querySelectorAll('.troopPick button').forEach((b) => (b.onclick = () => { AU.play('click', 0.4); pick[b.dataset.h] = b.dataset.t; render(); }));
    };
    render();
  }

  async function startStage(si) {
    const st = D.STAGES[si];
    leaveMap();
    AU.bgm('title');
    hideScreen();
    const S = window.STORY && STORY[st.idx];
    if (S) await story(S.start);
    prep(si);
  }

  // 지도 전투 시작
  let stageStart = null;
  async function launch(si) {
    const st = D.STAGES[si];
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
    st.heroes.forEach((id, i) => R.makeHero(G, id, save.heroes[id], save.troops[id], st.starts[i][0], st.starts[i][1]));
    R.spawnWave(G, 0);
    stageStart = { lv: Object.fromEntries(st.heroes.map((id) => [id, save.heroes[id].lv])) };
    const rigs = new Set();
    G.units.forEach((u) => { rigs.add(u.rig); if (u.troop) rigs.add(u.troop.rig); });
    st.waves.forEach((w) => w.units.forEach(([t]) => { const e = D.ENEMIES[t]; rigs.add(e.rig); if (e.troop) rigs.add(D.TROOPS[e.troop].rig); }));
    $('boot').classList.remove('hidden');
    $('boot').querySelector('.logo').classList.add('hidden');
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
    if (si === 0 && !save.tutSeen) { save.tutSeen = true; writeSave(); await new Promise((r) => help(r)); }
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

  async function endStage(win, why) {
    busy = true;
    const g = G, st = G.stage;
    await wait(400);
    banner(win ? '작전 성공!' : '작전 실패', why || (win ? st.goal + ' 달성' : '콘스탄챠가 퇴각했습니다'), win ? 'gold' : 'e');
    AU.bgm(null);
    AU.play(win ? 'win' : 'fail', 0.8);
    await wait(1700);
    const lines = [];
    const gain = R.stageExp(st.id - 1, win);
    lines.push(`참가 영웅 경험치 <b style="color:#f3c969">+${gain}</b> (전원 같은 양)`);
    for (const u of g.units.filter((x) => x.side === 'p')) {
      R.addExp(u, gain);
      const s = save.heroes[u.key];
      s.lv = u.lv; s.exp = u.exp;
      const before = stageStart.lv[u.key];
      if (u.lv > before) lines.push(`<span class="lvup">${u.name} Lv${before} → Lv${u.lv}</span>`);
      const h = D.HEROES[u.key];
      while (s.tier < 2 && s.lv >= D.TIER_LV[s.tier + 1]) {
        const from = h.tiers[s.tier].cls;
        s.tier++;
        lines.push(`<span class="cc">★ 전직! ${u.name}: ${from} → ${h.tiers[s.tier].cls}</span>`);
        const prev = h.tiers[s.tier - 1];
        const ns = h.tiers[s.tier].skills.filter((k) => !prev.skills.includes(k)), nt = h.tiers[s.tier].troops.filter((k) => !prev.troops.includes(k));
        if (ns.length) lines.push(`<span class="cc">　새 특기: ${ns.map((k) => D.SKILLS[k].name).join(', ')}</span>`);
        if (nt.length) lines.push(`<span class="cc">　새 병사: ${nt.map((k) => D.TROOPS[k].short).join(', ')}</span>`);
      }
    }
    if (win) save.clear = Math.max(save.clear, st.id);
    window.GAME_LAST = { idx: st.idx, win, turn: g.turn, wave: g.wave + 1, alive: g.units.filter((u) => u.side === 'p').map((u) => u.name + (u.alive ? ':' + Math.round(u.hp) : 'x')).join(' ') };
    writeSave();
    const si = st.id - 1;
    const next = win && si + 1 < D.STAGES.length;
    leaveMap();
    const S = window.STORY && STORY[st.idx];
    if (win && S) await story(S.end);
    if (win && si === D.STAGES.length - 1) AU.bgm('title');
    screen(`<div class="scr result"><div class="big ${win ? 'win' : 'lose'}">${win ? '작전 성공' : '작전 실패'}</div>
      <div class="lines">${st.idx} ${st.title}<br>${win ? '' : '얻은 경험치는 유지됩니다.<br>'}${lines.join('<br>') || '레벨 변화 없음'}</div>
      <div class="menuBtns">${next ? '<button class="gold" id="rNext">다음 작전으로</button>' : ''}${!win ? '<button class="gold" id="rRetry">다시 도전</button>' : ''}<button id="rSel">작전 선택</button></div>
      ${win && si === D.STAGES.length - 1 ? '<div class="foot">1지역 「지구의 마지막 인간」 완료. 플레이해 주셔서 감사합니다!</div>' : ''}</div>`);
    if ($('rNext')) $('rNext').onclick = () => startStage(si + 1);
    if ($('rRetry')) $('rRetry').onclick = () => prep(si);
    $('rSel').onclick = stageSelect;
    busy = false;
  }

  // ── 상단 버튼 ───────────────────────────────────────────
  $('btnEnd').onclick = () => { AU.play('click', 0.5); endTurnAsk(); };
  $('btnMenu').onclick = () => { AU.play('click', 0.5); if (busy && G && G.side === 'e') return; openMenu(); };
  $('btnDanger').onclick = () => { AU.play('click', 0.5); toggleDanger(); };
  $('btnAuto').onclick = () => { AU.play('click', 0.5); setAuto(!autoOn); };
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
      renderer.render(FIGHT.scene(), FIGHT.camera());
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
    $('boot').classList.add('hidden');
    requestAnimationFrame(frame);
    title();
    // 첫 터치에서 배경음 시작 (모바일 정책)
    const kick = () => { AU.bgm(AU.bgmName || 'title'); removeEventListener('pointerdown', kick); };
    addEventListener('pointerdown', kick);
    // 시험용 훅
    window.GAME = {
      get G() { return G; }, get mode() { return mode; }, get ui() { return ui; }, save, R, D,
      launch, prep, setAuto, startStage, endTurn, onTap, fitCamera, views, camera, cam,
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
      skip() { if (FIGHT.active()) FIGHT.skip(); if (talkCur) talkSkip(); },
    };
  }
  boot();
})();
