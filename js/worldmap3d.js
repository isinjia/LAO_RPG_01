// 원작 3D 지역 지도를 브라우저에서 그대로 그린다 (tools/build_world3d.py 로 만든 assets/world/<장>/scene.*).
// 원작 셰이더(홀로그램 가산·바닥 단색·그림 조각)를 같은 식으로 옮겼고, 원작은 감마 색 공간이라 색 변환 없이 값 그대로 더한다.
// 카메라는 위에서 비스듬히 내려다보는 쿼터뷰로 고정하고, 유저가 끌어서 돌리고 휠·두 손가락으로 당기고 민다.
(function () {
  const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  // LastOne/LO_Hologram_additive_worldmap
  const FS_HOLO_WM = `uniform sampler2D tMain, tH; uniform vec4 stMain, stH; uniform vec3 tint, hCol, baseCol; uniform float time, speed, seg, pw, ss, sp, hasMain;
    varying vec2 vUv;
    void main() {
      vec3 m = hasMain > 0.5 ? texture2D(tMain, vUv * stMain.xy + stMain.zw).rgb : vec3(1.0);
      float wave = pow(fract(((1.0 - vUv.y) + time * speed) * seg), pw);
      float scan = 0.1 * (floor(fract(vUv.y * ss) * sp) / (sp - 1.0) + 0.9);
      gl_FragColor = vec4(hCol * texture2D(tH, vUv * stH.xy + stH.zw).rgb + m * (wave + scan + 0.9) * tint + baseCol, 1.0);
    }`;
  // LastOne/LO_Hologram_additive
  const FS_HOLO = `uniform sampler2D tMain; uniform vec4 stMain; uniform vec3 tint; uniform float time, speed, seg, pw, ss, sp, uU, uV;
    varying vec2 vUv;
    void main() {
      vec3 m = texture2D(tMain, vec2(uU * vUv.x + speed * time, uV) * stMain.xy + stMain.zw).rgb;
      float wave = pow(fract(((1.0 - vUv.y) + time * speed) * seg), pw);
      float scan = 0.1 * (floor(fract(vUv.y * ss) * sp) / (sp - 1.0) + 0.9);
      gl_FragColor = vec4(m * (wave + scan + 0.9) * tint, 1.0);
    }`;
  const FS_SPRITE = 'uniform sampler2D tMain; uniform vec4 color; varying vec2 vUv; void main() { gl_FragColor = texture2D(tMain, vUv) * color; }';
  // 바닥 선 재질의 원작 대기 애니메이션: 그림 세로 밀기 0→1 (2.85초 반복)
  const IDLE_SCROLL = { aera_fx: 2.85 };

  const cache = {};
  let R = null, canvas = null, cur = null, host = null, running = false, frameCbs = [];
  const time = { value: 0 };
  const t0 = performance.now();

  function load(ch) {
    if (cache[ch]) return cache[ch];
    const dir = `assets/world/${ch}/`;
    return (cache[ch] = Promise.all([fetch(dir + 'scene.json').then((r) => r.json()), fetch(dir + 'scene.bin').then((r) => r.arrayBuffer())]).then(([S, bin]) => build(S, bin, dir))
      .catch((e) => { delete cache[ch]; throw e; }));
  }

  function build(S, bin, dir) {
    const texs = {};
    // 원작 그림 설정 그대로: 감싸기(반복/가장자리 늘이기)·밉맵. 바둑판 반복 그림 조각은 언제나 반복
    const tex = (name, repeat) => {
      if (!name) return null;
      const key = name + (repeat ? '#r' : '');
      if (texs[key]) return texs[key];
      const t = new THREE.TextureLoader().load(dir + name + '.png'), info = S.texInfo[name] || { wrapU: 1, wrapV: 1, mip: 0 };
      const wrap = (m) => (repeat || m === 0 ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping);
      t.wrapS = wrap(info.wrapU); t.wrapT = wrap(info.wrapV);
      t.generateMipmaps = !!info.mip;
      t.minFilter = info.mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
      t.anisotropy = 8;
      return (texs[key] = t);
    };
    const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat); white.needsUpdate = true;
    const f32 = ([o, n]) => new Float32Array(bin, o, n), u16 = ([o, n]) => new Uint16Array(bin, o, n);
    const v4 = (a) => new THREE.Vector4(a[0], a[1], a[2], a[3]);
    const c3 = (a = [1, 1, 1]) => new THREE.Vector3(a[0], a[1], a[2]);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(S.cam.bg[0], S.cam.bg[1], S.cam.bg[2]);
    const scroll = [], byPath = {};
    let ground = null, sea = null;

    function material(m, name) {
      const p = m.p, add = { transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor };
      const common = { time, speed: { value: p._speed_wave }, seg: { value: p._Segments }, pw: { value: p._pawerofwave }, ss: { value: p._Screen_Segments }, sp: { value: p._Sceen_posterize }, tint: { value: c3(p._TintColor) } };
      if (m.shader === 'LastOne/LO_Hologram_additive_worldmap') {
        const u = Object.assign(common, {
          tMain: { value: tex(p._MainTex.tex) || white }, hasMain: { value: p._MainTex.tex ? 1 : 0 }, stMain: { value: v4(p._MainTex.st) },
          tH: { value: tex(p._node_7585.tex) || white }, stH: { value: v4(p._node_7585.st) }, hCol: { value: c3(p._h_color) }, baseCol: { value: c3(p._base_color) },
        });
        if (IDLE_SCROLL[name]) scroll.push([u.stMain.value, IDLE_SCROLL[name]]);
        return new THREE.ShaderMaterial(Object.assign({ uniforms: u, vertexShader: VS, fragmentShader: FS_HOLO_WM }, add));
      }
      if (m.shader === 'LastOne/LO_Hologram_additive') {
        const u = Object.assign(common, { tMain: { value: tex(p._MainTex.tex) || white }, stMain: { value: v4(p._MainTex.st) }, uU: { value: p._uv_cont_U }, uV: { value: p._uv_cont_V } });
        return new THREE.ShaderMaterial(Object.assign({ uniforms: u, vertexShader: VS, fragmentShader: FS_HOLO }, add));
      }
      // LastOne/LO_ZdethR_mesh 등: 단색 불투명
      const c = p._Color || [1, 1, 1, 1];
      return new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0], c[1], c[2]), side: THREE.DoubleSide });
    }

    for (const o of S.objs) {
      const name = o.path.split('/').pop();
      let obj;
      if (o.mesh) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(f32(o.mesh.v), 3));
        if (o.mesh.uv) g.setAttribute('uv', new THREE.BufferAttribute(f32(o.mesh.uv), 2));
        const idx = [];
        o.mesh.sub.forEach((s, i) => { const a = u16(s); g.addGroup(idx.length, a.length, i); for (let k = 0; k < a.length; k++) idx.push(a[k]); });
        g.setIndex(idx);
        const mats = o.mats.map((m) => material(m, name));
        obj = new THREE.Mesh(g, mats.length > 1 ? mats : mats[0]);
        if (o.mats[0].queue < 2500) { obj.renderOrder = -1; if (!ground) ground = obj; }
      } else if (o.sprite) {
        const s = o.sprite, W = s.tiled ? s.tiled[0] : s.w, H = s.tiled ? s.tiled[1] : s.h, g = new THREE.PlaneGeometry(W, H);
        g.translate((0.5 - s.pivot[0]) * W, (0.5 - s.pivot[1]) * H, 0);
        if (s.tiled) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + (uv.getX(i) - 0.5) * (W / s.w), 0.5 + (uv.getY(i) - 0.5) * (H / s.h)); }
        obj = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: { tMain: { value: tex(s.tex, !!s.tiled) }, color: { value: v4(s.color) } }, vertexShader: VS, fragmentShader: FS_SPRITE,
          transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      } else continue;
      obj.position.fromArray(o.pos); obj.quaternion.fromArray(o.rot); obj.scale.fromArray(o.scl);
      byPath[o.path] = obj;
      scene.add(obj);
    }
    // 지도 밖 바다: 지도 판 가장자리 높이 바로 아래에 넓게 깔고, 지도 안쪽은 비운다.
    // 해안선을 따라 겹겹이 퍼지는 등고선(지도 안 등고선과 같은 결)이 천천히 밀려 나가고, 멀어질수록 어둠에 묻힌다
    if (ground) {
      const b = new THREE.Box3().setFromObject(ground);
      sea = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2).translate((b.min.x + b.max.x) / 2, b.min.y - 0.01, (b.min.z + b.max.z) / 2),
        new THREE.ShaderMaterial({
          uniforms: { time, rect: { value: new THREE.Vector4(b.min.x, b.min.z, b.max.x, b.max.z) } },
          vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
          fragmentShader: `uniform vec4 rect; uniform float time; varying vec3 vW;
            void main() {
              vec2 p = vW.xz, o = max(max(rect.xy - p, p - rect.zw), 0.0);
              float d = length(o);
              if (d <= 0.0) discard;
              float dd = d + (0.09 * (sin(p.x * 3.1 + p.y * 1.3) + sin(p.y * 2.7 - p.x * 1.9)) + 0.04 * sin(p.x * 7.3 - p.y * 5.1)) * smoothstep(0.0, 0.5, d);
              float k = dd * 9.0 - time * 0.1, w = fwidth(k);
              float q = abs(fract(k + 0.5) - 0.5), line = 1.0 - smoothstep(0.03, 0.03 + w * 1.5, q); // q: 가장 가까운 등고선까지
              float near = 1.0 - smoothstep(0.4, 5.0, d);
              vec3 c = mix(vec3(0.02, 0.05, 0.12), vec3(0.08, 0.17, 0.33), near);
              c += vec3(0.07, 0.12, 0.21) * line * (0.3 + 0.7 * near) * (1.0 - smoothstep(3.0, 7.0, d));
              c += vec3(0.35, 0.28, 0.1) * exp(-d * 45.0);
              gl_FragColor = vec4(c, 1.0);
            }`,
          extensions: { derivatives: true },
        }));
      sea.renderOrder = -2;
      scene.add(sea);
    }
    // 작전 지점 표시(원작 map_point 입자: 2초마다 하나, 커지며 흰색→빨강으로 사라짐)
    const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(S.marker), transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    marker.visible = false;
    marker.renderOrder = 10; // 원작은 지점 전용 카메라(깊이만 지우고)로 맨 위에 그린다
    scene.add(marker);
    scene.updateMatrixWorld(true);
    const clips = {};
    for (const k in S.clips) clips[k] = { len: S.clips[k].len, d: f32(S.clips[k].cam) };
    return { S, scene, clips, ground, sea, byPath, marker, scroll, stages: S.stages.map((s) => s.pos), town: S.town, center: S.stages.reduce((a, s) => a.add(new THREE.Vector3().fromArray(s.pos)), new THREE.Vector3()).multiplyScalar(1 / S.stages.length) };
  }

  // ── 카메라: 위에서 비스듬히 내려다보는 쿼터뷰 고정. 끌어서 돌리고, 휠·두 손가락으로 당기고 민다 ──
  // 처음 방향은 원작 지도 카메라(전체 둘러보기 클립의 첫 자세)가 보던 쪽. 돌린 방향·거리는 다시 들어와도 그대로
  // 화면 가운데에는 늘 부대(setFocus 로 받은 자리)가 온다. 부대가 걸으면 지도가 따라 움직인다
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.3, 1000);
  const PITCH = (45 * Math.PI) / 180, DIST = 1.5, DMIN = 0.6, DMAX = 2.6;
  const orbit = { yaw: null, dist: DIST };
  let focus = null; // 카메라가 바라보는 3D 자리 (부대 위치 배열을 그대로 물고 있어 걸으면 같이 바뀐다)
  const _c = new THREE.Vector3();
  const _p = new THREE.Vector3();
  function initYaw() {
    const c = cur.clips[cur.S.overview].d; // 첫 표본: 위치 3 + 회전 4
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(c[3], c[4], c[5], c[6]));
    orbit.yaw = Math.atan2(-f.x, -f.z); // 카메라가 서는 쪽(보는 방향의 반대)
  }
  function updateCamera() {
    const d = orbit.dist * distK, c = focus ? _c.fromArray(focus) : cur.center;
    camera.position.set(c.x + Math.sin(orbit.yaw) * Math.cos(PITCH) * d, c.y + Math.sin(PITCH) * d, c.z + Math.cos(orbit.yaw) * Math.cos(PITCH) * d);
    camera.lookAt(c);
    camera.updateMatrixWorld();
  }

  // 원작은 16:9 가로 기준(세로 시야 45°). 더 좁은 화면에서는 가로 시야를 지키도록 세로 시야를 넓히고,
  // 가로로 보이는 폭이 좁아진 만큼 조금 더 당겨(distK) 지점 간격을 16:9 때와 비슷하게 둔다.
  // 세로 화면은 아래 절반을 정보 창이 덮으므로 그림을 위로 조금 올린다
  const TAN = Math.tan((22.5 * Math.PI) / 180);
  let distK = 1;
  function fit(w, h) {
    const a = w / h, ref = a < 1 ? 1 : 16 / 9;
    camera.aspect = a;
    camera.fov = a >= ref ? 45 : (2 * Math.atan(TAN * (ref / a)) * 180) / Math.PI;
    camera.setViewOffset(w, h, 0, h * (a < 1 ? 0.12 : 0.06), w, h); // 가로 화면도 아래 도구줄 몫만큼 그림을 조금 올린다
    camera.updateProjectionMatrix();
    distK = Math.sqrt(Math.min(1, (Math.tan((camera.fov * Math.PI) / 360) * a) / (TAN * 16 / 9)));
  }

  // 끌기: 6px 넘게 움직이면 돌리기로 보고, 그 뒤 따라오는 누르기(걷기·지점 고르기)는 막는다
  const ptrs = new Map();
  let drag = null, eatClick = false;
  function bindInput(el) {
    if (el._wm3d) return;
    el._wm3d = true;
    el.addEventListener('pointerdown', (e) => {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, yaw: orbit.yaw, moved: false };
      else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; drag = { pinch: Math.hypot(a.x - b.x, a.y - b.y), dist: orbit.dist, moved: true }; }
    });
    el.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId) || !drag) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (drag.pinch) {
        if (ptrs.size < 2) return;
        const [a, b] = [...ptrs.values()];
        orbit.dist = Math.min(DMAX, Math.max(DMIN, drag.dist * drag.pinch / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))));
        return;
      }
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.hypot(dx, e.clientY - drag.y) < 6) return;
      if (!drag.moved) { drag.moved = true; try { el.setPointerCapture(e.pointerId); } catch (_) {} }
      orbit.yaw = drag.yaw - (dx / Math.max(320, el.clientWidth)) * Math.PI * 1.5;
    });
    const up = (e) => {
      ptrs.delete(e.pointerId);
      if (drag && drag.moved) eatClick = true;
      if (!ptrs.size) drag = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('click', (e) => { if (eatClick) { eatClick = false; e.stopPropagation(); e.preventDefault(); } }, true);
    el.addEventListener('pointerdown', () => { eatClick = false; }, true);
    el.addEventListener('wheel', (e) => { e.preventDefault(); orbit.dist = Math.min(DMAX, Math.max(DMIN, orbit.dist * Math.exp(e.deltaY * 0.001))); }, { passive: false });
  }

  let marker = null;
  function frame() {
    if (!running) return;
    if (!canvas.isConnected) { running = false; return; }
    requestAnimationFrame(frame);
    time.value = (performance.now() - t0) / 1000;
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    const pr = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * pr) || canvas.height !== Math.round(h * pr)) { R.setPixelRatio(pr); R.setSize(w, h, false); }
    if (camera.aspect !== w / h) fit(w, h);
    for (const [st, dur] of cur.scroll) st.w = (time.value / dur) % 1;
    if (marker) {
      const k = (time.value % 2) / 2;
      const sz = k < 0.032 ? k / 0.032 : k < 0.06 ? 1 - ((k - 0.032) / 0.028) * 0.316 : k < 0.758 ? 0.684 - ((k - 0.06) / 0.698) * 0.02 : 0.664 + ((k - 0.758) / 0.242) * 0.073;
      cur.marker.scale.setScalar(0.1 * sz);
      const r = k < 0.682 ? 0 : (k - 0.682) / 0.318;
      cur.marker.material.color.setRGB(1, 1 - r, 1 - r);
      cur.marker.material.opacity = k < 0.691 ? 1 : 1 - (k - 0.691) / 0.309;
    }
    updateCamera();
    R.render(cur.scene, camera);
    for (const cb of frameCbs) cb();
  }

  window.WM3D = {
    load,
    // 지도 화면 안 el 에 그림판을 붙이고 그리기 시작. 그림판이 화면에서 빠지면 저절로 멈춘다
    async mount(el, ch) {
      host = el; frameCbs = []; marker = null; focus = null;
      if (!R) {
        canvas = document.createElement('canvas');
        canvas.className = 'w3d';
        R = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }); // 화면 전환 때 지금 모습을 떠 갈 수 있게
      }
      el.prepend(canvas);
      canvas.classList.remove('on');
      cur = await load(ch);
      if (host !== el || !el.isConnected) return false;
      if (orbit.yaw == null) initYaw();
      bindInput(el);
      fit(el.clientWidth || 16, el.clientHeight || 9);
      time.value = (performance.now() - t0) / 1000;
      updateCamera();
      if (!running) { running = true; requestAnimationFrame(frame); }
      requestAnimationFrame(() => canvas.classList.add('on'));
      return true;
    },
    get ready() { return !!(cur && running && canvas && canvas.isConnected); },
    get data() { return cur; },
    // 작전 지점 표시를 그 자리(3D)에. null 이면 끈다
    setMarker(p) { marker = p; if (cur) { cur.marker.visible = !!p; if (p) cur.marker.position.set(p[0], p[1] + 0.012, p[2]); } },
    // 고른 작전(장 안 순서, null 이면 없음)에 맞춰 원작처럼 물체를 끈다 (2장 6~8: 바닥판을 꺼 그 아래 지하 제철소를 드러낸다).
    // 끈 동안 바다는 깊이를 남기지 않아, 바닥판 밖으로 뻗은 지하 시설이 바다에 덮이지 않는다
    setStage(i) {
      if (!cur) return;
      const hide = new Set((i != null && cur.S.stages[i] && cur.S.stages[i].hide) || []);
      for (const s of cur.S.stages) for (const p of s.hide || []) if (cur.byPath[p]) cur.byPath[p].visible = !hide.has(p);
      if (cur.sea) cur.sea.material.depthWrite = !hide.size;
    },
    onFrame(cb) { frameCbs.push(cb); },
    // 카메라가 따라갈 자리 [x, y, z] (배열을 바꾸면 다음 그림부터 따라간다). null 이면 지도 한가운데
    setFocus(p) { focus = p; },
    // 3D 자리 → 지도 칸 안 화면 좌표(px). 카메라 뒤면 null
    project(p) {
      _p.set(p[0], p[1], p[2]);
      const z = _p.clone().applyMatrix4(camera.matrixWorldInverse).z;
      if (z > -camera.near) return null;
      _p.project(camera);
      return { x: ((_p.x + 1) / 2) * host.clientWidth, y: ((1 - _p.y) / 2) * host.clientHeight, d: -z };
    },
    // 화면 좌표(px, 지도 칸 기준) → 바닥 위 3D 자리
    pick(x, y) {
      const rc = new THREE.Raycaster();
      rc.setFromCamera({ x: (x / host.clientWidth) * 2 - 1, y: 1 - (y / host.clientHeight) * 2 }, camera);
      const hit = cur.ground && rc.intersectObject(cur.ground)[0];
      return hit ? [hit.point.x, hit.point.y, hit.point.z] : null; // 지도 밖(빈 하늘)은 무시
    },
  };
})();
