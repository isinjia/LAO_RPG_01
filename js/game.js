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
    try { s = JSON.parse(localStorage.getItem('orca_srpg_save') || 'null'); } catch (e) { s = null; }
    const def = { clear: 0, gold: 600, heroes: {}, hire: {}, opts: { fight: true, fast: false, sound: true, autoEnd: true } };
    s = Object.assign(def, s || {});
    s.opts = Object.assign(def.opts, s.opts || {});
    for (const id in D.HEROES) if (!s.heroes[id]) s.heroes[id] = { lv: 1, exp: 0, tier: 0 };
    return s;
  }
  function writeSave() { try { localStorage.setItem('orca_srpg_save', JSON.stringify(save)); } catch (e) { /* 저장 불가 환경 */ } }
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
        const corner = (G.map[y][x - 1] !== '#' || G.map[y][x + 1] !== '#');
        if (corner && hash(x, y, 4) > 0.3) decos.push(sprite(DECO.tower, 0.6, 1.0, x + 0.5, y + 0.8, night));
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
  const views = new Map(); // uid -> 표시 객체
  const badgeCache = {};
  function badgeTex(side, hp, cmd, acted) {
    const k = side + hp + cmd + acted;
    if (badgeCache[k]) return badgeCache[k];
    return (badgeCache[k] = canvasTex(72, 48, (g) => {
      const col = acted ? ['#4b5163', '#2e3342'] : side === 'p' ? ['#3f9bff', '#1c4f9c'] : ['#ff5a4f', '#9c241c'];
      g.fillStyle = 'rgba(0,0,0,.5)'; rr(g, 3, 7, 66, 38, 10); g.fill();
      const lg = g.createLinearGradient(0, 4, 0, 42); lg.addColorStop(0, col[0]); lg.addColorStop(1, col[1]);
      g.fillStyle = lg; rr(g, 2, 4, 66, 38, 10); g.fill();
      g.strokeStyle = cmd ? '#ffd76a' : 'rgba(255,255,255,.6)'; g.lineWidth = cmd ? 4 : 2; rr(g, 2, 4, 66, 38, 10); g.stroke();
      g.fillStyle = '#fff'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(hp), cmd ? 42 : 35, 25);
      if (cmd) { g.fillStyle = '#ffd76a'; g.font = 'bold 22px sans-serif'; g.fillText('★', 16, 24); }
    }));
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  const ringTex = {};
  function getRingTex(side, cmd) {
    const k = side + cmd;
    if (ringTex[k]) return ringTex[k];
    return (ringTex[k] = canvasTex(128, 128, (g) => {
      const c = side === 'p' ? '74,168,255' : '255,90,80';
      const rg = g.createRadialGradient(64, 64, 10, 64, 64, 62);
      rg.addColorStop(0, `rgba(0,0,0,.45)`); rg.addColorStop(0.6, `rgba(${c},.35)`); rg.addColorStop(0.85, `rgba(${c},.9)`); rg.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = rg; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
      if (cmd) { g.strokeStyle = 'rgba(255,215,106,.95)'; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 50, 0, 7); g.stroke(); }
    }));
  }
  function addView(u) {
    const g = new THREE.Group();
    const bb = new THREE.Group();
    g.add(bb);
    const h = (u.cmd ? (u.def.mapH || 1.02) : 0.74) * (u.def.sizeK || 1);
    const rig = new Rig(u.rig, h, u.side === 'p' ? 1 : -1);
    rig.face(u.side === 'p' ? 1 : -1);
    rig.loop('idle');
    rig.c.time = Math.random() * 2;
    bb.add(rig.g);
    bb.quaternion.copy(camera.quaternion);
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.86), new THREE.MeshBasicMaterial({ map: getRingTex(u.side, u.cmd), transparent: true, depthTest: false, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012; ring.renderOrder = 4;
    g.add(ring);
    const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTex(u.side, u.hp, u.cmd, false), depthTest: false, transparent: true }));
    badge.scale.set(0.36, 0.24, 1);
    badge.center.set(0.5, 0.5);
    badge.position.set(0.3, 0.06, 0.32);
    badge.renderOrder = 5000;
    g.add(badge);
    g.position.set(u.x + 0.5, 0, u.y + 0.5);
    world.root.add(g);
    const v = { u, g, bb, rig, ring, badge, h, fade: 1, bob: Math.random() * 6 };
    views.set(u.uid, v);
    refreshView(u);
    return v;
  }
  function refreshView(u) {
    const v = views.get(u.uid);
    if (!v) return;
    v.badge.material.map = badgeTex(u.side, Math.max(0, Math.round(u.hp)), u.cmd, u.acted && u.side === G.side);
    const dim = u.acted && u.side === G.side && u.side === 'p';
    v.rig.c.setTint(dim ? 0.5 : 1, dim ? 0.5 : 1, dim ? 0.58 : 1);
  }
  function removeView(u) {
    const v = views.get(u.uid);
    if (!v) return;
    v.rig.dispose();
    v.g.parent && v.g.parent.remove(v.g);
    v.ring.material.dispose(); v.ring.geometry.dispose(); v.badge.material.dispose();
    views.delete(u.uid);
  }
  function clearViews() { for (const v of [...views.values()]) removeView(v.u); }
  const tilePos = (x, y) => new THREE.Vector3(x + 0.5, 0, y + 0.5);
  function faceTo(u, x) { const v = views.get(u.uid); if (v && x !== u.x) v.rig.face(x > u.x ? 1 : -1); }

  // 화면 좌표
  function toScreen(p) {
    const v = p.clone().project(camera);
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
  }
  function pop(x, y, text, cls = 'dmg', dy = 0.9) {
    const s = toScreen(new THREE.Vector3(x + 0.5, dy, y + 0.5).add(new THREE.Vector3(0, 0, 0)));
    const e = document.createElement('div');
    e.className = 'pop ' + cls;
    e.textContent = text;
    e.style.left = s.x + 'px'; e.style.top = s.y + 'px';
    $('pops').appendChild(e);
    setTimeout(() => e.remove(), 1200);
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
  function auraTiles(c) {
    if (!c || !c.cmd || !c.alive) return null;
    const r = R.baseStat(c, 'cmd'), out = [];
    for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) if (R.dist(x, y, c.x, c.y) <= r) out.push([x, y]);
    return out;
  }
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
  let mode = 'boot'; // boot | title | screen | talk | map | fight
  function setHint(t) { $('hint').textContent = t || ''; }
  const kindTag = (k) => `<span class="kind" style="color:${D.KIND[k].color}">${D.KIND[k].name}</span>`;
  function showInfo(u, tile) {
    const el = $('info');
    if (!u && !tile) { el.classList.add('hidden'); syncInfoH(); return; }
    if (!u) {
      const t = R.terr(G, tile[0], tile[1]);
      const c = t.cost;
      const cs = (v) => (v >= 99 ? '불가' : v);
      el.innerHTML = `<div class="pic" style="background:#203050"></div><div class="nm">${t.name}</div>
        <div class="st">방어 보정 <b>${t.def > 0 ? '+' : ''}${Math.round(t.def * 100)}%</b>${t.heal ? ' · 차례 시작 시 병력 <b>+' + t.heal + '</b>' : ''}</div>
        <div class="st">이동 소모: 보병 <b>${cs(c.foot)}</b> · 기동 <b>${cs(c.horse)}</b> · 비행 <b>${cs(c.fly)}</b></div>`;
      el.classList.remove('hidden'); syncInfoH(); return;
    }
    const at = R.stat(u, 'at'), df = R.stat(u, 'df'), bat = R.baseStat(u, 'at') + R.buffSum(u, 'at'), bdf = R.baseStat(u, 'df') + R.buffSum(u, 'df');
    const up = (v, b) => (v - b > 0.01 ? ` <span class="up">(+${Math.round(v - b)})</span>` : '');
    const pips = Array.from({ length: 10 }, (_, i) => `<i class="${i < Math.round(u.hp) ? 'on' : ''}"></i>`).join('');
    const t = R.terr(G, u.x, u.y);
    let ex = '';
    if (u.cmd) {
      const sk = R.skillsOf(u).map((s) => D.SKILLS[s].name).join(', ') || '없음';
      ex = `지휘 범위 <b>${R.baseStat(u, 'cmd')}</b> · 용병 공격 <b>+${R.baseStat(u, 'ca')}</b> 방어 <b>+${R.baseStat(u, 'cd')}</b> · 특기: ${sk}`;
      if (u.side === 'p') ex += ` · 경험치 <b>${u.exp}</b>/100`;
    } else {
      ex = `지휘관 <b>${u.cmdr.name}</b> · ${R.inAura(u) ? '<span style="color:#ffd76a">지휘 범위 안</span>' : '<span style="color:#ff8a7a">지휘 범위 밖 (보정 없음)</span>'}`;
    }
    const buf = u.buffs.length ? ' · <span class="up">강화 중</span>' : '';
    el.innerHTML = `<div class="pic ${u.side}" style="background-image:url(${IMG[u.icon]})"><span class="lv">Lv${u.lv}</span></div>
      <div class="nm">${u.name}${kindTag(u.kind)}<small>${u.cmd ? u.cls : '용병'}</small></div>
      <div class="hpbar ${u.side}">${pips}<span>${Math.round(u.hp)}</span></div>
      <div class="st">공격 <b>${Math.round(at)}</b>${up(at, bat)} · 방어 <b>${Math.round(df)}</b>${up(df, bdf)} · 이동 <b>${R.stat(u, 'mov')}</b> · 사거리 <b>${u.rng}</b>${u.cmd ? ` · MP <b>${u.mp}</b>/${R.maxMp(u)}` : ''}${buf}</div>
      <div class="ex">${ex} · 지형 ${t.name}${u.move !== 'fly' && t.def ? ` (${t.def > 0 ? '+' : ''}${Math.round(t.def * 100)}%)` : ''}</div>`;
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
    $('goalBox').innerHTML = `승리: <b>${st.goal}</b> · 패배: ${st.lose}`;
    $('btnEnd').disabled = G.side !== 'p' || busy;
    $('btnAuto').disabled = false;
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
    if (ui.state === 'skill' && t) { previewSkillArea(t); }
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
        if (u && u.side === 'e') { // 칠 수 있는 적을 바로 누르면 알맞은 칸으로 가서 공격
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
        const ok = OV.skill && OV.skill.some(([a, b]) => a === x && b === y);
        if (!ok) return;
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
    OV.aura = auraTiles(u.cmd ? u : u.cmdr);
    OV.path = null; OV.targets = null; OV.skill = null; OV.area = null;
    drawOverlay();
    if (u.side === 'e') setHint(`${u.name}: 이동·공격 가능 범위`); else setHint('');
  }
  function selectUnit(u) {
    AU.play('click', 0.6);
    ui.sel = u; ui.state = 'move'; ui.from = [u.x, u.y];
    ui.reach = R.reach(G, u);
    const rg = ranges(u, ui.reach);
    OV.move = rg.mv; OV.atk = rg.atk; OV.aura = auraTiles(u.cmd ? u : u.cmdr); OV.path = null; OV.targets = null;
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
  // 적 u를 칠 수 있는 칸 중 가장 좋은 곳 (지금 자리 > 방어 지형 > 가까운 칸)
  function bestSpot(a, u) {
    let best = null;
    for (const t of ui.reach.values()) {
      if (!t.stop) continue;
      const d = R.dist(t.x, t.y, u.x, u.y);
      if (d < 1 || d > a.rng) continue;
      let sc = -t.c * 0.2 + (a.move === 'fly' ? 0 : R.terr(G, t.x, t.y).def) * 5 + (t.x === a.x && t.y === a.y ? 3 : 0);
      if (a.rng > 1 && d === a.rng) sc += 2; // 사격은 반격 받지 않는 거리
      if (!a.cmd && R.inAura(a, t.x, t.y)) sc += 1.5;
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
      v.rig.loop('move', 1.3);
      let i = 1;
      const step = () => {
        if (i >= path.length) { v.rig.loop('idle'); res(); return; }
        const [nx, ny] = path[i];
        faceTo(u, nx);
        const from = v.g.position.clone(), to = tilePos(nx, ny);
        const dur = (u.move === 'horse' || u.move === 'fly' ? 0.1 : 0.13) / speedK;
        animate(dur, (k) => v.g.position.lerpVectors(from, to, k), () => { u.x = nx; u.y = ny; i++; step(); });
      };
      step();
      AU.play('click', 0.25);
    });
  }
  function openActions() {
    const u = ui.sel;
    ui.state = 'menu';
    OV.move = null; OV.atk = null; OV.path = null;
    OV.aura = auraTiles(u.cmd ? u : u.cmdr);
    const tg = R.targetsFrom(G, u, u.x, u.y);
    OV.targets = tg.map((o) => [o.x, o.y]);
    drawOverlay();
    showInfo(u);
    const acts = [];
    acts.push({ label: '공격', cls: tg.length ? 'gold' : '', disabled: !tg.length, fn: () => { ui.state = 'target'; setHint('공격할 적을 고르세요'); showActs([{ label: '취소', fn: cancel }]); if (tg.length === 1) showForecast(tg[0]); } });
    if (u.cmd && R.skillsOf(u).length) acts.push({ label: '특기', sub: `MP ${u.mp}`, fn: openSkills });
    acts.push({ label: '대기', fn: () => finishAct(u) });
    acts.push({ label: '취소', fn: cancel });
    showActs(acts);
    setHint(tg.length ? '공격할 수 있는 적이 있습니다' : '');
  }
  function openSkills() {
    const u = ui.sel;
    ui.state = 'skillpick';
    const list = R.skillsOf(u).map((sk) => {
      const s = D.SKILLS[sk];
      return { label: s.name, sub: `MP ${s.mp} · ${s.desc}`, disabled: u.mp < s.mp, fn: () => pickSkill(sk) };
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
    if (!u || !sk) return;
    const s = D.SKILLS[sk];
    if (s.tgt === 'self') return;
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
    const p = R.preview(G, a, d, a.x, a.y);
    const el = $('forecast');
    const rel = p.relA > 0 ? `<span class="good">▲ 상성 우위 (공방 x1.25)</span>` : p.relA < 0 ? `<span class="bad">▼ 상성 열세 (공방 x0.85)</span>` : '상성 보통';
    const terr = R.terr(G, d.x, d.y);
    const hpA = Math.max(0, Math.round(a.hp - p.aLoss)), hpD = Math.max(0, Math.round(d.hp - p.dLoss));
    el.innerHTML = `<div class="row">
      <div class="side"><img src="${IMG[a.icon]}"><div><div class="n">${a.name}</div><div class="h">${Math.round(a.hp)}<em>→ ${hpA}</em></div></div></div>
      <div class="mid">예상<b>⚔</b>${p.counter ? '반격 있음' : '반격 없음'}</div>
      <div class="side R"><img src="${IMG[d.icon]}"><div><div class="n">${d.name}</div><div class="h">${Math.round(d.hp)}<em>→ ${hpD}</em></div></div></div></div>
      <div class="rel">${rel} · 적 지형 ${terr.name}${d.move !== 'fly' && terr.def ? ` ${terr.def > 0 ? '+' : ''}${Math.round(terr.def * 100)}%` : ''}</div>
      <div class="btns"><button class="gold" id="fcGo">공격</button><button id="fcNo">취소</button></div>`;
    el.classList.remove('hidden');
    $('fcGo').onclick = () => confirmAttack();
    $('fcNo').onclick = () => backToTarget();
    showInfo(d);
    showActs(null);
    setHint('같은 적을 한 번 더 누르면 공격합니다');
  }
  function backToTarget() {
    $('forecast').classList.add('hidden');
    ui.target = null;
    openActions();
  }
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
      case 'menu': { // 이동 되돌리기
        const u = ui.sel;
        const v = views.get(u.uid);
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
    if (!save.opts.autoEnd || G.side !== 'p') return;
    if (G.units.every((u) => !u.alive || u.side !== 'p' || u.acted)) wait(450).then(() => { if (G && G.side === 'p' && !busy && mode === 'map') endTurn(); });
  }
  function endTurnAsk() {
    if (busy || G.side !== 'p' || mode !== 'map') return;
    const left = G.units.filter((u) => u.alive && u.side === 'p' && !u.acted).length;
    if (!left) { endTurn(); return; }
    modal(`<h3>턴 종료</h3><p>아직 행동하지 않은 유닛이 <b>${left}</b> 있습니다. 턴을 마칠까요?</p>
      <div class="opts"><button class="gold" data-a="yes">턴 종료</button><button data-a="no">계속하기</button></div>`, (a) => { if (a === 'yes') endTurn(); });
  }

  // ── 행동 실행 (아군·적 공용) ─────────────────────────────
  let bossTalked = false;
  async function attack(a, d) {
    faceTo(a, d.x); faceTo(d, a.x);
    if (!bossTalked && (a.boss || d.boss) && G.stage.bossTalk) { bossTalked = true; await talk(G.stage.bossTalk); }
    const res = R.combat(G, a, d, a.x, a.y, Math.random);
    const bg = R.terr(G, d.x, d.y).bg;
    if (save.opts.fight) {
      mode = 'fight';
      $('hud').classList.add('hidden');
      $('banner').classList.add('hidden');
      await FIGHT.play(a, d, res, { bg, speed: speedK });
      mode = 'map';
      $('hud').classList.remove('hidden');
    } else {
      await mapClash(a, d, res);
    }
    // 결과 반영
    const dl = d.hp - res.dHp, al = a.hp - res.aHp;
    d.hp = res.dHp; a.hp = res.aHp;
    if (dl > 0) pop(d.x, d.y, '-' + Math.round(dl), 'dmg');
    if (al > 0) setTimeout(() => pop(a.x, a.y, '-' + Math.round(al), 'dmg'), 150);
    gainExp(a, d, dl, d.hp <= 0);
    if (res.counter) gainExp(d, a, al, a.hp <= 0);
    refreshView(a); refreshView(d);
    if (d.side === 'e' || a.side === 'e') { const sq = G.squads[(a.side === 'e' ? a : d).squad]; if (sq) sq.woke = true; }
    const deaths = [];
    if (d.hp <= 0) deaths.push(kill(d));
    if (a.hp <= 0) deaths.push(kill(a));
    await Promise.all(deaths);
    if (deaths.length) await wait(200);
  }
  // 전투 장면을 끈 경우: 지도 위에서 짧게
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
  function gainExp(src, tgt, dmg, killed) {
    const hero = src.cmd ? src : src.cmdr;
    if (!hero || hero.side !== 'p' || !hero.alive) return;
    const e = R.expFor(src, tgt, dmg, killed);
    if (!e) return;
    const ups = R.addExp(hero, e);
    if (ups) { setTimeout(() => { pop(hero.x, hero.y, '레벨 업!', 'info big', 1.4); AU.play('rankUp', 0.7); }, 500); }
  }
  async function kill(u) {
    u.alive = false; u.hp = 0;
    const v = views.get(u.uid);
    if (v) {
      if (v.rig.c.has('die')) v.rig.once('die', 1.4 * speedK, true);
      await animateP(0.9, (k) => v.rig.c.setOpacity(1 - k * k));
      removeView(u);
    }
    // 지휘관이 쓰러지면 그 용병들도 퇴각
    if (u.cmd) {
      const alive = u.troops.filter((t) => t.alive);
      if (alive.length) {
        pop(u.x, u.y, u.side === 'p' ? '퇴각' : '격파!', 'info big', 1.3);
        await Promise.all(alive.map((t, i) => wait(i * 90).then(() => { pop(t.x, t.y, '퇴각', 'info'); return kill(t); })));
      } else pop(u.x, u.y, u.side === 'p' ? '퇴각' : '격파!', 'info big', 1.3);
      AU.play(u.side === 'p' ? 'fail' : 'expB', 0.6);
    }
    updateDanger();
  }
  async function useSkill(u, sk, tx, ty) {
    const s = D.SKILLS[sk];
    u.mp -= s.mp;
    faceTo(u, tx);
    const v = views.get(u.uid);
    panTo(tx, ty);
    banner(s.name, u.name, u.side === 'e' ? 'e' : 'gold');
    if (v && v.rig.c.has('skill')) v.rig.once('skill', Math.max(1, v.rig.dur('skill') / 1.6) * speedK);
    AU.play('charge', 0.5);
    OV.area = R.skillArea(G, u, sk, tx, ty); drawOverlay();
    await wait(800);
    AU.play(s.sfx, 0.8);
    const area = OV.area;
    area.forEach(([x, y], i) => fxAt(x, y, s.fx, i * 40));
    await wait(350);
    const res = R.skillEffect(G, u, sk, tx, ty, Math.random);
    const deaths = [];
    for (const r of res) {
      if (r.dmg) {
        r.u.hp = Math.max(0, r.u.hp - r.dmg);
        pop(r.u.x, r.u.y, '-' + r.dmg, 'dmg');
        gainExp(u, r.u, r.dmg, r.u.hp <= 0);
        refreshView(r.u);
        if (r.u.side === 'e') { const sq = G.squads[r.u.squad]; if (sq) sq.woke = true; }
        if (r.u.hp <= 0) deaths.push(kill(r.u));
      }
      if (r.heal) { r.u.hp = Math.min(10, r.u.hp + r.heal); pop(r.u.x, r.u.y, '+' + r.heal, 'heal'); refreshView(r.u); if (u.side === 'p') R.addExp(u, 4 * r.heal); }
      if (r.buff) {
        r.u.buffs = r.u.buffs.filter((b) => !Object.keys(s.buff).some((k) => b[k]));
        r.u.buffs.push({ ...s.buff, until: G.turn + (s.buff.mov ? 2 : 1), side: u.side });
        pop(r.u.x, r.u.y, Object.entries(s.buff).map(([k, n]) => ({ at: '공격', df: '방어', mov: '이동' }[k] + ' +' + n)).join(' '), 'info');
        if (u.side === 'p') R.addExp(u, 3);
      }
    }
    await Promise.all(deaths);
    OV.area = null; drawOverlay();
    await wait(250);
  }
  // 행동 뒤 승패 확인. 계속 진행하면 true
  async function afterAction() {
    const r = R.check(G);
    if (r) { await endStage(r === 'win'); return false; }
    return true;
  }

  // ── 차례 진행 ───────────────────────────────────────────
  async function startPhase(side) {
    G.side = side;
    // 강화 효과 만료, 회복, 행동 초기화
    for (const u of G.units) {
      if (!u.alive) continue;
      u.buffs = u.buffs.filter((b) => !(b.side === side && b.until <= G.turn));
      if (u.side !== side) continue;
      u.acted = false;
      if (u.cmd) u.mp = Math.min(R.maxMp(u), u.mp + 1);
    }
    clearOv(); setTop();
    if (side === 'p' && G.stage.turnLimit && G.turn > G.stage.turnLimit) { await endStage(false, '제한 턴을 넘겼습니다'); return; }
    banner(side === 'p' ? `${G.turn}턴 · 아군 차례` : '적 차례', side === 'p' && G.stage.turnLimit ? `제한 ${G.stage.turnLimit}턴` : '', side === 'e' ? 'e' : '');
    AU.play(side === 'p' ? 'start' : 'warning', 0.5);
    await wait(900);
    // 회복: 마을·요새, 지휘관 곁의 용병
    let healed = false;
    for (const u of G.units) {
      if (!u.alive || u.side !== side || u.hp >= 10) continue;
      const t = R.terr(G, u.x, u.y);
      let h = t.heal || 0;
      if (!u.cmd && u.cmdr && u.cmdr.alive && R.dist(u.x, u.y, u.cmdr.x, u.cmdr.y) === 1) h = Math.max(h, 2);
      if (h) { const n = Math.min(10 - u.hp, h); u.hp += n; pop(u.x, u.y, '+' + Math.round(n), 'heal'); refreshView(u); healed = true; }
    }
    if (healed) { AU.play('energy', 0.4); await wait(500); }
    // 스테이지 이벤트
    for (const ev of G.stage.events) {
      if (ev.done || ev.turn !== G.turn || ev.side !== side) continue;
      ev.done = true;
      if (ev.talk) await talk(ev.talk);
      for (const spec of ev.reinforce || []) {
        const b = R.makeBoss(G, JSON.parse(JSON.stringify(spec)));
        G.squads[b.squad].woke = true;
        for (const u of [b, ...b.troops]) { addView(u); fxAt(u.x, u.y, 'spawn'); }
        panTo(spec.x, spec.y);
      }
      if (ev.reinforce) { AU.play('reinforce', 0.7); await wait(700); }
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
    const near = (u) => Math.min(99, ...G.units.filter((o) => o.alive && o.side !== side).map((o) => R.dist(o.x, o.y, u.x, u.y)));
    for (let pass = 0; pass < 2; pass++) {
      const list = G.units.filter((u) => u.alive && u.side === side && !u.acted && (pass === 0 ? !u.cmd : u.cmd)).sort((a, b) => near(a) - near(b));
      for (const u of list) {
        if (!G || !u.alive || mode === 'screen') return false;
        if (side === 'p' && !autoOn) return true;
        const plan = R.plan(G, u, fields);
        u.acted = true;
        const moved = plan.to[0] !== u.x || plan.to[1] !== u.y;
        if (!moved && plan.act === 'wait') { refreshView(u); continue; }
        panTo(u.x, u.y);
        await wait(moved ? 160 : 80);
        if (moved) {
          const reach = R.reach(G, u);
          const path = R.path(reach, plan.to[0], plan.to[1]);
          if (path.length > 1) await walk(u, path);
          else { u.x = plan.to[0]; u.y = plan.to[1]; }
        }
        if (plan.act === 'attack' && plan.target.alive && R.dist(u.x, u.y, plan.target.x, plan.target.y) <= u.rng) {
          showInfo(plan.target);
          await wait(200);
          await attack(u, plan.target);
        } else if (plan.act === 'skill') {
          await useSkill(u, plan.skill, plan.tx, plan.ty);
        }
        refreshView(u);
        if (!(await afterAction())) return false;
        await wait(80);
      }
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
  // 아군 자동 전투: 켜 두면 아군 차례마다 판단 장치가 대신 움직인다
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

  // ── 대화 ─────────────────────────────────────────────────
  let talkQ = null, talkDone = null;
  function talk(lines, bg) {
    return new Promise((res) => {
      talkQ = lines.slice(); talkDone = res;
      const prev = mode;
      talk.prev = prev;
      mode = 'talk';
      const el = $('talk');
      el.classList.remove('hidden');
      let bgEl = $('talkBg');
      if (bg) {
        if (!bgEl) { bgEl = document.createElement('div'); bgEl.id = 'talkBg'; document.body.appendChild(bgEl); }
        bgEl.style.backgroundImage = `url(assets/bg/${bg}.webp)`;
      } else if (bgEl) bgEl.remove();
      talkNext();
    });
  }
  function talkNext() {
    if (!talkQ) return;
    const line = talkQ.shift();
    if (!line) { talkEnd(); return; }
    const [who, ex, text] = line;
    const el = $('talk');
    const face = el.querySelector('.tface'), img = face.querySelector('img');
    el.classList.toggle('nar', who === 'nar');
    let name = '', src = '';
    if (who === 'nar') face.classList.add('none');
    else {
      face.classList.remove('none');
      const h = D.HEROES[who], b = D.BOSSES[who];
      const def = h || b;
      name = def ? (h ? h.full : b.name) : who;
      if (def && def.face && ex) src = `assets/face/${def.face}_${ex}.webp`;
      else src = def ? IMG[def.icon] : '';
      img.onerror = () => { img.onerror = null; img.src = def ? IMG[def.icon] : ''; };
      img.src = src;
    }
    el.querySelector('.tname').textContent = name;
    el.querySelector('.ttext').textContent = text;
    AU.play('click', 0.3);
  }
  function talkEnd() {
    talkQ = null;
    $('talk').classList.add('hidden');
    const bgEl = $('talkBg'); if (bgEl) bgEl.remove();
    mode = talk.prev === 'talk' ? 'map' : talk.prev;
    const cb = talkDone; talkDone = null;
    if (cb) cb();
  }
  function talkSkip() { if (talkQ) { talkQ = []; talkNext(); } }
  $('talk').addEventListener('click', (e) => { if (e.target.closest('.tskip')) { talkSkip(); return; } talkNext(); });

  // ── 모달 ─────────────────────────────────────────────────
  function modal(html, cb) {
    const m = $('modal');
    m.innerHTML = `<div class="mbox">${html}</div>`;
    m.classList.remove('hidden');
    m.onclick = (e) => {
      const b = e.target.closest('[data-a]');
      if (!b && e.target !== m) return;
      const a = b ? b.dataset.a : null;
      if (b && b.dataset.keep) { cb && cb(a, b); return; }
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
      <button data-a="quit" class="red">스테이지 포기 (선택 화면으로)</button>
      <button data-a="close" class="gold">닫기</button></div>`, (a) => {
      if (['fight', 'fast', 'autoEnd', 'sound'].includes(a)) {
        o[a] = !o[a]; writeSave();
        speedK = o.fast ? 2 : 1; AU.setOn(o.sound);
        openMenu();
      } else if (a === 'help') help();
      else if (a === 'goal') goalInfo();
      else if (a === 'retry') startStage(G.stage.id - 1, true);
      else if (a === 'quit') { leaveMap(); stageSelect(); }
    });
  }
  function goalInfo() {
    const st = G.stage;
    modal(`<h3>${st.id}장 · ${st.title}</h3><p>승리 조건: <b>${st.goal}</b></p><p>패배 조건: ${st.lose}</p>
      <p style="color:#9aa6c4">적 지휘관을 쓰러뜨리면 그 부하 용병도 함께 퇴각합니다.</p><div class="opts"><button class="gold" data-a="ok">확인</button></div>`);
  }
  function help(cb) {
    modal(`<h3>도움말</h3>
      <p><b>지휘관과 용병</b> · 지휘관(★)은 용병을 거느립니다. 용병은 지휘관의 <b>지휘 범위</b>(노란 테두리) 안에 있을 때 공격·방어 보정을 받습니다. 지휘관이 쓰러지면 그 용병도 모두 퇴각합니다.</p>
      <p><b>병종 상성</b> · 경장 ▶ 중장 ▶ 기동 ▶ 경장. 기동은 사격에도 강합니다. 비행은 지상 근접 병종에 강하고 사격에 약합니다. 우위면 공격·방어 x1.25, 열세면 x0.85.</p>
      <p><b>사격</b> · 사거리 2. 두 칸 떨어져 쏘면 근접 부대는 반격하지 못합니다. 붙어서 싸우면 약해집니다.</p>
      <p><b>병력</b> · 모든 부대는 병력 10. 남은 병력이 곧 싸우는 병사 수라, 지친 부대는 약합니다.</p>
      <p><b>회복</b> · 마을·요새 위에서 차례를 시작하면 +3, 지휘관 바로 옆의 용병은 +2. 다프네의 수복 특기로도 회복합니다.</p>
      <p><b>지형</b> · 숲·언덕·산·요새는 방어 보정이 있습니다. 적과 맞닿은 칸에 들어가면 더 나아갈 수 없습니다(지배 영역).</p>
      <p><b>조작</b> · 누르기: 선택·이동·공격 / 끌기: 지도 이동 / 두 손가락·휠: 확대 / 오른쪽 클릭·Esc: 취소 / 방향키+Enter: 커서 / E: 턴 종료 / D: 위험 범위</p>
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
      <div class="foot">라스트오리진 에셋을 사용한 비영리 팬메이드 게임입니다.<br>세로·가로 화면과 PC 모두 지원합니다.</div></div>`);
    const go = () => { AU.play('click'); stageSelect(); };
    if ($('tCont')) $('tCont').onclick = go;
    $('tNew').onclick = () => {
      const start = () => { save.clear = 0; save.gold = 600; save.hire = {}; for (const id in D.HEROES) save.heroes[id] = { lv: 1, exp: 0, tier: 0 }; writeSave(); go(); };
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
      return `<button class="stg ${lock ? 'lock' : ''} ${clear ? 'clear' : ''}" data-i="${i}" ${lock ? 'disabled' : ''}>
        <span class="no">${st.id}장</span><span class="tt">${st.title}</span><span class="gl">승리: ${st.goal}</span><span class="gl">출격: ${st.heroes.map((h) => D.HEROES[h].name).join(', ')}</span></button>`;
    }).join('');
    const end = save.clear >= D.STAGES.length ? '<div class="tipbox"><b>모든 장을 클리어했습니다!</b> 원하는 장을 다시 플레이해 영웅을 더 키울 수 있습니다.</div>' : '';
    screen(`<div class="scr"><div class="bar"><button id="sBack" class="ghost">◀ 타이틀</button><h2>작전 선택</h2><span class="gold-n">자금 ${save.gold}</span></div>
      ${end}<div class="stages">${cards}</div>
      <h2 style="margin-top:22px">영웅</h2><div class="heroes">${heroCards()}</div></div>`);
    $('sBack').onclick = title;
    document.querySelectorAll('.stg').forEach((b) => (b.onclick = () => { AU.play('click'); startStage(+b.dataset.i); }));
  }
  function heroCards(only) {
    return Object.entries(D.HEROES).filter(([id]) => !only || only.includes(id)).map(([id, h]) => {
      const s = save.heroes[id], t = h.tiers[s.tier];
      const at = Math.round(t.at + h.grow.at * (s.lv - D.TIER_LV[s.tier])), df = Math.round(t.df + h.grow.df * (s.lv - D.TIER_LV[s.tier]));
      return `<div class="hero"><div class="pic" style="background-image:url(${IMG[h.icon]})"></div>
        <div class="nm">${h.full}<small>Lv${s.lv} · ${t.cls}</small></div>
        <div class="st">${kindTag(h.kind)} 공격 <b>${at}</b> · 방어 <b>${df}</b> · 이동 <b>${t.mov}</b> · 지휘 <b>${t.cmd}</b> (+${t.ca}/+${t.cd}) · 용병 <b>${t.slots}</b></div></div>`;
    }).join('');
  }

  // 출격 준비: 용병 고용
  function prep(si) {
    const st = D.STAGES[si];
    const hire = {};
    for (const id of st.heroes) {
      const h = D.HEROES[id], t = h.tiers[save.heroes[id].tier];
      const prev = save.hire[id] || [];
      hire[id] = Array.from({ length: t.slots }, (_, i) => (prev[i] && t.troops.includes(prev[i]) ? prev[i] : prev[i] === null ? null : t.troops[i % t.troops.length]));
    }
    const cost = () => Object.values(hire).flat().reduce((s, k) => s + (k ? D.TROOPS[k].cost : 0), 0);
    // 처음엔 자금 안에서 앞쪽부터 채운다
    while (cost() > save.gold) { const all = Object.values(hire); const row = all.reduce((a, b) => (b.filter(Boolean).length > a.filter(Boolean).length ? b : a)); const i = row.map(Boolean).lastIndexOf(true); if (i < 0) break; row[i] = null; }
    const render = () => {
      const c = cost();
      const cards = st.heroes.map((id) => {
        const h = D.HEROES[id], s = save.heroes[id], t = h.tiers[s.tier];
        const slots = hire[id].map((k, i) => k
          ? `<div class="slot on" data-h="${id}" data-i="${i}"><img src="${IMG[D.TROOPS[k].icon]}">${D.TROOPS[k].name}<div class="c">${D.TROOPS[k].cost}</div></div>`
          : `<div class="slot empty" data-h="${id}" data-i="${i}"><img src="${IMG[h.icon]}">비어 있음<div class="c">+ 고용</div></div>`).join('');
        return `<div class="hero"><div class="pic" style="background-image:url(${IMG[h.icon]})"></div>
          <div class="nm">${h.full}<small>Lv${s.lv} · ${t.cls}</small></div>
          <div class="st">${kindTag(h.kind)} 지휘 범위 <b>${t.cmd}</b> · 용병 공격 <b>+${t.ca}</b> 방어 <b>+${t.cd}</b> · 특기 ${t.skills.map((k) => D.SKILLS[k].name).join(', ')}</div>
          <div class="slots">${slots}</div></div>`;
      }).join('');
      screen(`<div class="scr"><div class="bar"><button id="pBack" class="ghost">◀ 작전 선택</button><h2>${st.id}장 출격 준비</h2>
        <span class="gold-n">자금 ${save.gold - c} <small style="color:#9aa6c4;font-size:12px">(고용 ${c})</small></span></div>
        <div class="tipbox">칸을 눌러 용병을 고릅니다. 용병은 이번 전투에만 함께하며, 남은 자금은 다음 전투로 넘어갑니다.<br>
        승리: <b>${st.goal}</b> · 패배: ${st.lose} · 상성 <b>경장 ▶ 중장 ▶ 기동 ▶ 경장·사격</b>, 비행 ▶ 지상 근접, 사격 ▶ 비행</div>
        <div class="heroes">${cards}</div>
        <div class="prepFoot"><button id="pHelp" class="ghost">도움말</button><button id="pAuto">자동 편성</button><button id="pClear">모두 비우기</button><button id="pGo" class="gold">출격</button></div></div>`);
      $('pBack').onclick = stageSelect;
      $('pHelp').onclick = () => help();
      $('pAuto').onclick = () => {
        for (const id of st.heroes) { const t = D.HEROES[id].tiers[save.heroes[id].tier]; hire[id] = hire[id].map((_, i) => t.troops[i % t.troops.length]); }
        while (cost() > save.gold) { let done = false; for (const id of [...st.heroes].reverse()) { const i = hire[id].map(Boolean).lastIndexOf(true); if (i >= 0 && cost() > save.gold) { hire[id][i] = null; done = true; } } if (!done) break; }
        render();
      };
      $('pClear').onclick = () => { for (const id of st.heroes) hire[id] = hire[id].map(() => null); render(); };
      $('pGo').onclick = () => {
        save.gold -= cost();
        save.hire = Object.assign(save.hire, hire);
        writeSave();
        launch(si, hire);
      };
      document.querySelectorAll('.slot').forEach((el) => (el.onclick = () => {
        const id = el.dataset.h, i = +el.dataset.i, t = D.HEROES[id].tiers[save.heroes[id].tier];
        const left = save.gold - cost() + (hire[id][i] ? D.TROOPS[hire[id][i]].cost : 0);
        const opts = t.troops.map((k) => { const tr = D.TROOPS[k]; return `<button data-a="${k}" ${tr.cost > left ? 'disabled' : ''}><img src="${IMG[tr.icon]}">${tr.name}<small>${D.KIND[tr.kind].name} · 공${tr.at} 방${tr.df} 이동${tr.mov}${tr.rng > 1 ? ' · 사거리' + tr.rng : ''}</small><small style="color:#f3c969">${tr.cost}</small></button>`; }).join('');
        modal(`<h3>${D.HEROES[id].name}의 용병</h3><div class="pick">${opts}<button data-a="none">비우기</button></div>`, (a) => {
          if (!a) return;
          hire[id][i] = a === 'none' ? null : a;
          render();
        });
      }));
    };
    render();
  }

  async function startStage(si, retry) {
    const st = D.STAGES[si];
    leaveMap();
    if (!retry) {
      AU.bgm('title');
      hideScreen();
      await talk(st.intro, st.bg);
    }
    prep(si);
  }

  // 지도 전투 시작
  let stageStart = null;
  async function launch(si, hire) {
    const st = D.STAGES[si];
    st.events.forEach((e) => { e.done = false; });
    hideScreen();
    if (G) leaveMap();
    G = R.newGame(st);
    bossTalked = false;
    buildWorld();
    for (let i = 0; i < st.heroes.length; i++) {
      const id = st.heroes[i];
      const [x, y] = st.starts[i];
      const hu = R.makeHero(G, id, save.heroes[id], x, y);
      const list = (hire[id] || []).filter(Boolean);
      const spots = R.freeAround(G, x, y, { move: 'foot' }, list.length);
      list.forEach((k, j) => { if (spots[j]) R.makeTroop(G, k, hu, spots[j][0], spots[j][1]); });
    }
    for (const e of st.enemies) R.makeBoss(G, JSON.parse(JSON.stringify(e)));
    stageStart = { lv: Object.fromEntries(st.heroes.map((id) => [id, save.heroes[id].lv])), kills: 0 };
    // 리그 불러오기
    const rigs = [...new Set(G.units.map((u) => u.rig).concat(st.events.flatMap((e) => (e.reinforce || []).flatMap((r) => [D.BOSSES[r.cmd].rig, ...r.troops.map((t) => D.TROOPS[t[0]].rig)]))))];
    $('boot').classList.remove('hidden');
    $('boot').querySelector('.logo').classList.add('hidden');
    let n = 0;
    await Promise.all(rigs.map((id) => SD.prepare(id).then(() => { $('loadMsg').textContent = `부대 집결 중… ${++n}/${rigs.length}`; })));
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
    if (save.clear === 0 && si === 0 && !save.tutSeen) {
      save.tutSeen = true; writeSave();
      await new Promise((r) => help(r));
    }
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
    const st = G.stage;
    await wait(400);
    banner(win ? '승리!' : '패배', why || (win ? st.goal + ' 달성' : '라비아타가 퇴각했습니다'), win ? 'gold' : 'e');
    AU.bgm(null);
    AU.play(win ? 'win' : 'fail', 0.8);
    await wait(1700);
    // 성장 반영 (패배해도 얻은 경험치는 남는다)
    const lines = [];
    const heroes = G.units.filter((u) => u.cmd && u.side === 'p');
    for (const u of heroes) {
      const s = save.heroes[u.key];
      s.lv = u.lv; s.exp = u.exp;
      const before = stageStart.lv[u.key];
      if (u.lv > before) lines.push(`<span class="lvup">${u.name} Lv${before} → Lv${u.lv}</span>`);
      // 전직
      const h = D.HEROES[u.key];
      while (s.tier < 2 && s.lv >= D.TIER_LV[s.tier + 1]) {
        const from = h.tiers[s.tier].cls;
        s.tier++;
        lines.push(`<span class="cc">★ 전직! ${u.name}: ${from} → ${h.tiers[s.tier].cls}</span>`);
        const ns = h.tiers[s.tier].skills.filter((k) => !h.tiers[s.tier - 1].skills.includes(k));
        if (ns.length) lines.push(`<span class="cc">　새 특기: ${ns.map((k) => D.SKILLS[k].name).join(', ')}</span>`);
      }
    }
    let gold = 0;
    if (win) {
      const kills = G.units.filter((u) => u.side === 'e' && !u.alive);
      gold = st.reward + kills.reduce((a, u) => a + (u.cmd ? 80 : 20), 0);
      save.gold += gold;
      save.clear = Math.max(save.clear, st.id);
    }
    writeSave();
    const si = st.id - 1;
    const next = win && si + 1 < D.STAGES.length;
    if (win) await talk(st.outro, st.bg);
    leaveMap();
    if (win && si === D.STAGES.length - 1) AU.bgm('title');
    screen(`<div class="scr result"><div class="big ${win ? 'win' : 'lose'}">${win ? '승리' : '패배'}</div>
      <div class="lines">${st.id}장 · ${st.title}<br>${win ? `획득 자금 <b style="color:#f3c969">+${gold}</b> (보유 ${save.gold})<br>` : '얻은 경험치는 유지됩니다.<br>'}${lines.join('<br>') || '레벨 변화 없음'}</div>
      <div class="menuBtns">${next ? '<button class="gold" id="rNext">다음 장으로</button>' : ''}${!win ? '<button class="gold" id="rRetry">다시 도전</button>' : ''}<button id="rSel">작전 선택</button></div>
      ${win && si === D.STAGES.length - 1 ? '<div class="foot">모든 장을 클리어했습니다. 플레이해 주셔서 감사합니다!</div>' : ''}</div>`);
    if ($('rNext')) $('rNext').onclick = () => startStage(si + 1);
    if ($('rRetry')) $('rRetry').onclick = () => startStage(si, true);
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
      v.rig.update(dt * (v.u.acted && v.u.side === 'p' ? 0.4 : 1));
      v.rig.order = 100 + Math.round(v.g.position.z * 20) + 2;
      const sel = ui.sel === v.u;
      v.ring.scale.setScalar(sel ? 1 + Math.sin(t * 6) * 0.08 : 1);
      if (v.u.def.mapFly || v.u.move === 'fly') v.bb.position.y = 0.06 + Math.sin(t * 2.2 + v.bob) * 0.04;
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
    const first = ['labiata', 'leona', 'daphne'];
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
      launch: (si) => launch(si, save.hire), setAuto, startStage, endTurn, onTap, fitCamera, views, camera, cam,
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
      skip() { if (FIGHT.active()) FIGHT.skip(); if (talkQ) talkSkip(); },
    };
  }
  boot();
})();
