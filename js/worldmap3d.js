// 원작 3D 지역 지도를 브라우저에서 그대로 그린다 (tools/build_world3d.py 로 만든 assets/world/<장>/scene.*).
// 원작 셰이더(홀로그램 가산·바닥 단색·그림 조각)를 같은 식으로 옮겼고, 원작은 감마 색 공간이라 색 변환 없이 값 그대로 더한다.
// 카메라는 작전마다 원작 애니메이터 클립(초당 15번 표본)을 그대로 돌리고, 작전을 바꾸면 지금 자세에서 부드럽게 이어 간다.
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
    const scroll = [];
    let ground = null;

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
      scene.add(obj);
    }
    // 작전 지점 표시(원작 map_point 입자: 2초마다 하나, 커지며 흰색→빨강으로 사라짐)
    const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(S.marker), transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    marker.visible = false;
    marker.renderOrder = 10; // 원작은 지점 전용 카메라(깊이만 지우고)로 맨 위에 그린다
    scene.add(marker);
    scene.updateMatrixWorld(true);
    const clips = {};
    for (const k in S.clips) clips[k] = { len: S.clips[k].len, d: f32(S.clips[k].cam) };
    return { S, scene, clips, ground, marker, scroll, stages: S.stages.map((s) => s.pos), town: S.town, center: S.stages.reduce((a, s) => a.add(new THREE.Vector3().fromArray(s.pos)), new THREE.Vector3()).multiplyScalar(1 / S.stages.length) };
  }

  // ── 카메라 ──
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.3, 1000);
  const cam = { clip: null, start: 0, from: null, blend: 0 };
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _p2 = new THREE.Vector3(), _q2 = new THREE.Quaternion();
  function sample(c, t, P, Q) {
    const n = c.d.length / 7 - 1, f = ((t % c.len) / c.len) * n, i = Math.min(n - 1, Math.floor(f)), k = f - i, a = i * 7, b = a + 7, d = c.d;
    P.set(d[a] + (d[b] - d[a]) * k, d[a + 1] + (d[b + 1] - d[a + 1]) * k, d[a + 2] + (d[b + 2] - d[a + 2]) * k);
    Q.set(d[a + 3], d[a + 4], d[a + 5], d[a + 6]);
    _q2.set(d[b + 3], d[b + 4], d[b + 5], d[b + 6]);
    Q.slerp(_q2, k);
  }
  // 작전 바꾸기: 그 작전의 원작 카메라 클립을 처음부터, 지금 자세에서 BLEND초 동안 섞어 들어간다
  const BLEND = 1.8, MAXD = 1.5;
  function setClip(name, instant) {
    if (!cur || !cur.clips[name]) return;
    if (cam.clip === cur.clips[name]) return;
    cam.from = instant || !cam.clip ? null : { p: camera.position.clone(), q: camera.quaternion.clone() };
    cam.clip = cur.clips[name];
    cam.start = time.value;
  }
  // 확인용: ?wm=상태@초 → 그 클립의 그 순간에 카메라를 세운다 (tools/unity_ref 의 ref_*.png 와 견주기)
  const FREEZE = (/[?&]wm=([\w]+)@([\d.]+)/.exec(location.search) || []).slice(1);
  function updateCamera() {
    if (FREEZE.length && cur.clips[FREEZE[0]]) { cam.clip = cur.clips[FREEZE[0]]; cam.from = null; cam.start = time.value - +FREEZE[1]; }
    if (!cam.clip) return;
    const t = time.value - cam.start;
    sample(cam.clip, t, _p, _q);
    if (cam.from && t < BLEND) {
      const k = t / BLEND, e = k * k * (3 - 2 * k);
      _p2.copy(cam.from.p).lerp(_p, e); _q2.copy(cam.from.q).slerp(_q, e);
      camera.position.copy(_p2); camera.quaternion.copy(_q2);
    } else { cam.from = null; camera.position.copy(_p); camera.quaternion.copy(_q); }
    // 원작 클립의 먼 장면은 작전 지점이 겹쳐 누르기 어려워, 작전 지점들의 가운데를 향해 maxD 거리까지 당긴다.
    // 그 가운데를 잇는 선 위로만 움직이므로 화면 속 자리와 원작 카메라 각도는 그대로, 크기만 커진다 (가까운 장면은 그대로)
    if (!FREEZE.length) {
      _p2.copy(cur.center).sub(camera.position);
      const d = _p2.length();
      if (d > maxD) camera.position.addScaledVector(_p2, (d - maxD) / d);
    }
    camera.updateMatrixWorld();
  }

  // 원작은 16:9 가로 기준(세로 시야 45°). 더 좁은 화면에서는 가로 시야를 지키도록 세로 시야를 넓히고,
  // 가로로 보이는 폭이 좁아진 만큼 카메라를 더 당겨(maxD) 지점 간격을 16:9 때와 비슷하게 둔다.
  // 세로 화면은 원작 구도대로면 지점들이 옆으로 잘리므로 지점들 가운데를 가로 가운데에 두고, 아래를 덮는 정보 창을 피해 조금 위로 올린다
  const TAN = Math.tan((22.5 * Math.PI) / 180);
  let maxD = MAXD;
  function fit(w, h) {
    const a = w / h, ref = a < 1 ? 1 : 16 / 9;
    camera.aspect = a;
    camera.fov = a >= ref ? 45 : (2 * Math.atan(TAN * (ref / a)) * 180) / Math.PI;
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    maxD = MAXD * Math.sqrt(Math.min(1, (Math.tan((camera.fov * Math.PI) / 360) * a) / (TAN * 16 / 9)));
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
    if (w < h) {
      camera.clearViewOffset(); camera.updateProjectionMatrix();
      const cx = _p.copy(cur.center).project(camera).x * w / 2;
      camera.setViewOffset(w, h, cx, h * 0.08, w, h); camera.updateProjectionMatrix();
    }
    R.render(cur.scene, camera);
    for (const cb of frameCbs) cb();
  }

  window.WM3D = {
    load,
    // 지도 화면 안 el 에 그림판을 붙이고 그리기 시작. 그림판이 화면에서 빠지면 저절로 멈춘다
    async mount(el, ch, clip) {
      host = el; frameCbs = []; marker = null;
      if (!R) {
        canvas = document.createElement('canvas');
        canvas.className = 'w3d';
        R = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }); // 화면 전환 때 지금 모습을 떠 갈 수 있게
      }
      el.prepend(canvas);
      canvas.classList.remove('on');
      cur = await load(ch);
      if (host !== el || !el.isConnected) return false;
      cam.clip = null;
      setClip(clip, true);
      fit(el.clientWidth || 16, el.clientHeight || 9);
      time.value = (performance.now() - t0) / 1000;
      updateCamera();
      if (!running) { running = true; requestAnimationFrame(frame); }
      requestAnimationFrame(() => canvas.classList.add('on'));
      return true;
    },
    get ready() { return !!(cur && running && canvas && canvas.isConnected); },
    get data() { return cur; },
    setClip,
    // 작전 지점 표시를 그 자리(3D)에. null 이면 끈다
    setMarker(p) { marker = p; if (cur) { cur.marker.visible = !!p; if (p) cur.marker.position.set(p[0], p[1] + 0.012, p[2]); } },
    onFrame(cb) { frameCbs.push(cb); },
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
