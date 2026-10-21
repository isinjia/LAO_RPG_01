// 움직이는 대화 일러스트: 원작 2DModel 프리팹(tools/build_sd.py "p_<영웅>")을 로비 움직임으로 재생한다.
// 인물마다 <canvas class="stand"> 하나. 공용 WebGL 렌더러 하나로 그려 각 캔버스에 옮겨 그리므로
// 위치·좌우 반전·어둡게·등장 효과는 정지 그림(<img>)과 같은 CSS 를 그대로 쓴다.
// 리그를 불러오는 동안에는 같은 구도의 정지 그림(assets/story/stand)을 대신 그린다.
(function () {
  // 대본의 그림 이름 앞부분(모델) -> 리그
  const MODELS = { '3P_ConstantiaS2_N': 'p_constantia', BR_PA00EL_N: 'p_griffon', DS_Johanna_N: 'p_johanna', PECS_LRL_N: 'p_lrl', PECS_PuppHead_N: 'p_pupphead', AGS_Fallen_N: 'p_fallen' };
  const rigOf = (stand) => {
    if (!stand || stand.includes('_Dialog0')) return null; // 도입부 컷 그림은 정지 그림
    for (const m in MODELS) if (stand === m || stand.startsWith(m + '_')) return MODELS[m];
    return null;
  };
  let R3 = null, scene = null;
  const live = new Set(); // {el, ctx, uid, stand, c, frame, still}
  const frames = {}; // uid -> {box} (한 번 재서 고정: 숨쉬기에 따라 화면이 흔들리지 않게)

  function renderer() {
    if (R3) return R3;
    R3 = new THREE.WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: false });
    R3.setClearColor(0x000000, 0);
    scene = new THREE.Scene();
    return R3;
  }

  function setFace(p) {
    const faces = window.SD_DATA && SD_DATA[p.uid] && SD_DATA[p.uid].faces;
    if (!p.c || !faces) return;
    const key = faces[p.stand];
    if (!key) return;
    if (p.faceIx == null) p.faceIx = p.c.tpl.rends.findIndex((r) => r.slots && r.slots[key] != null);
    if (p.faceIx >= 0) p.c.rKey[p.faceIx] = key;
  }

  // 구도: 넓게 한 번 그려서 실제로 칠해진 영역(알파)을 읽는다 (늘어나는 조각까지 정확히)
  function measure(p) {
    if (frames[p.uid]) return frames[p.uid];
    const r = renderer(), N = 768;
    const tb = p.c.tpl.box, hgt = p.c.tpl.height || 1;
    let cx = (tb.min.x + tb.max.x) / 2, cy = (tb.min.y + tb.max.y) / 2, half = hgt * 1.6;
    const rt = new THREE.WebGLRenderTarget(N, N);
    const px = new Uint8Array(N * N * 4);
    let x0, y0, x1, y1;
    scene.add(p.c.root);
    // 칠해진 영역이 측정 범위 가장자리에 닿으면 (늘어나는 조각이 대부분인 모델) 범위를 넓혀 다시 잰다
    for (let tries = 0; tries < 5; tries++) {
      x0 = N; y0 = N; x1 = -1; y1 = -1;
      const cam = new THREE.OrthographicCamera(cx - half, cx + half, cy + half, cy - half, -1000, 1000);
      cam.position.z = 100;
      p.c.play('idle', null, true);
      for (const dt of [0, 3, 3, 3, 3, 3]) { // 움직임 중 여러 순간을 겹쳐 잰다
        p.c.update(dt);
        r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(); r.render(scene, cam);
        r.readRenderTargetPixels(rt, 0, 0, N, N, px);
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (px[(y * N + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      if (x1 < 0 || (x0 > 0 && y0 > 0 && x1 < N - 1 && y1 < N - 1)) break;
      const u0 = (2 * half) / N;
      cx = cx - half + ((x0 + x1) / 2) * u0; cy = cy - half + ((y0 + y1) / 2) * u0; half *= 2;
    }
    r.setRenderTarget(null);
    scene.remove(p.c.root);
    rt.dispose();
    p.c.play('idle', null, true);
    if (x1 < 0) { x0 = 0; y0 = 0; x1 = N - 1; y1 = N - 1; }
    const u = (2 * half) / N, mx = (x1 - x0) * 0.03 * u, my = (y1 - y0) * 0.015 * u;
    const box = { min: { x: cx - half + x0 * u - mx, y: cy - half + y0 * u - my }, max: { x: cx - half + (x1 + 1) * u + mx, y: cy - half + (y1 + 1) * u + my } };
    box.w = box.max.x - box.min.x; box.h = box.max.y - box.min.y;
    return (frames[p.uid] = { box });
  }

  function sizeCanvas(p, aspect) {
    // 그릴 높이: 지정(카드 등) 또는 화면 높이, 화소 밀도 2배까지
    const base = p.h || window.innerHeight;
    const H = Math.round(Math.min(1500, base * Math.min(2, window.devicePixelRatio || 1)));
    const W = Math.max(8, Math.round(H * aspect));
    if (p.el.width !== W || p.el.height !== H) { p.el.width = W; p.el.height = H; }
  }

  // 정지 그림을 먼저 (같은 구도)
  function drawStill(p) {
    if (!p.still || !p.still.complete || !p.still.naturalWidth) return;
    if (!p.c) sizeCanvas(p, p.still.naturalWidth / p.still.naturalHeight);
    p.ctx.clearRect(0, 0, p.el.width, p.el.height);
    p.ctx.drawImage(p.still, 0, 0, p.el.width, p.el.height);
  }

  // opts.h: 화면에 그려질 대략의 높이(px). 작은 카드는 작게 그려 부담을 줄인다
  function attach(el, stand, opts) {
    const uid = rigOf(stand);
    const p = { el, ctx: el.getContext('2d'), uid, stand, c: null, h: opts && opts.h };
    el._portrait = p;
    live.add(p);
    p.still = new Image();
    p.still.onload = () => drawStill(p);
    p.still.src = `assets/story/stand/${stand}.webp`;
    SD.prepare(uid).then(() => {
      if (!live.has(p) || !SD.ready(uid)) return;
      p.c = SD.create(uid);
      p.c.play('idle', null, true);
      p.c.time = Math.random() * 4; // 여러 명이 같은 박자로 움직이지 않게
      setFace(p);
      const f = measure(p);
      sizeCanvas(p, f.box.w / f.box.h);
      // 얼굴 가로 위치 (0~1): 좁은 카드에서 얼굴이 가운데 오게 CSS 변수로 넘긴다
      if (f.fx == null) {
        const nodes = p.c.tpl.data.nodes;
        const fi = nodes.findIndex((n) => n.n === 'face');
        f.fx = fi >= 0 ? Math.max(0.15, Math.min(0.85, (p.c.posU(fi)[0] - f.box.min.x) / f.box.w)) : 0.5;
      }
      el.style.setProperty('--fx', f.fx.toFixed(3));
      draw(p);
    });
    return p;
  }

  function change(el, stand) {
    const p = el._portrait;
    if (!p) return;
    p.stand = stand;
    if (p.c) setFace(p);
    else { p.still.src = `assets/story/stand/${stand}.webp`; }
  }

  function detach(el) {
    const p = el._portrait;
    if (!p) return;
    live.delete(p);
    if (p.c) { p.c.root.parent && p.c.root.parent.remove(p.c.root); p.c.dispose(); p.c = null; }
    el._portrait = null;
  }

  function draw(p) {
    const r = renderer(), f = frames[p.uid];
    const b = f.box, W = p.el.width, H = p.el.height;
    r.setSize(W, H, false);
    setFace(p); // 움직임을 다시 시작하면 기본 표정으로 돌아가므로 그릴 때마다 끼운다
    const cam = new THREE.OrthographicCamera(b.min.x, b.max.x, b.max.y, b.min.y, -1000, 1000);
    cam.position.z = 100;
    scene.add(p.c.root);
    r.render(scene, cam);
    scene.remove(p.c.root);
    p.ctx.clearRect(0, 0, W, H);
    p.ctx.drawImage(r.domElement, 0, 0);
  }

  let acc = 0;
  function update(dt) {
    if (!live.size) return;
    acc += dt;
    if (acc < 1 / 30) return; // 30장/초면 충분
    const step = acc;
    acc = 0;
    for (const p of live) {
      if (!p.el.isConnected) { detach(p.el); continue; }
      if (!p.c) continue;
      p.c.update(step);
      draw(p);
    }
  }

  // 대본에 나오는 리그를 미리 불러 둔다
  function preload(nodes) {
    const ids = new Set();
    for (const n of nodes) for (const c of n.cast || []) { const u = rigOf(c[1]); if (u) ids.add(u); }
    ids.forEach((u) => SD.prepare(u));
  }

  window.PORTRAIT = { rigOf, attach, change, detach, update, preload };
})();
