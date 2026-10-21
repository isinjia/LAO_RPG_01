// 원작 전투 효과 플립북 재생기. 그림 목록은 js/fx_data.js (window.FXDATA, tools/build_fx.py 가 만든다).
// 그림은 미리 곱한 색 + 투명도라서 One / OneMinusSrcAlpha 로 섞는다 (더하기 입자·연기 모두 원작과 비슷하게 보인다).
// 쓰는 법:
//   FXLIB.preload(['hit_bullet', 'explosion_big']);
//   const h = FXLIB.spawn(scene, 'hit_bullet', { x, y, z, height: 1.2, flipX: true });
//   매 장면마다 FXLIB.update(dt)  (dt 는 초) — 다 재생한 효과는 스스로 장면에서 빠진다.
(function () {
  const T = window.THREE;
  const texCache = {};   // 이름 → Promise<THREE.Texture>
  const live = [];       // 재생 중인 효과
  const geo = new T.PlaneGeometry(1, 1);

  const VS = 'varying vec2 vUv; uniform vec4 uvRect;\n' +
    'void main() { vUv = uvRect.xy + uv * uvRect.zw; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  // 색은 감마 값 그대로 내보낸다 (원작 프로젝트도 감마 색공간)
  const FS = 'varying vec2 vUv; uniform sampler2D map; uniform vec3 tint; uniform float opacity;\n' +
    'void main() { vec4 c = texture2D(map, vUv); gl_FragColor = vec4(c.rgb * tint, c.a) * opacity; }';

  function load(name) {
    if (texCache[name]) return texCache[name];
    const d = window.FXDATA && FXDATA[name];
    if (!d) return Promise.reject(new Error('효과 없음: ' + name));
    texCache[name] = new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => {
        const t = new T.Texture(im);
        t.minFilter = T.LinearFilter; t.magFilter = T.LinearFilter;
        t.generateMipmaps = false; t.premultiplyAlpha = false; // 이미 미리 곱해 두었다
        t.needsUpdate = true;
        res(t);
      };
      im.onerror = () => { delete texCache[name]; rej(new Error('효과 그림 못 읽음: ' + d.src)); };
      im.src = (FXLIB.base || '') + d.src;
    });
    return texCache[name];
  }

  // 효과 하나를 띄운다.
  // o: x, y, z (효과 원점 자리), height (낱장 세로를 장면 단위로 맞춤) 또는 scale (원작 유니티 단위 × FXLIB.unit × scale),
  //    flipX (좌우 뒤집기), rotation (라디안), speed (재생 빠르기), renderOrder, tint (0xffffff 같은 색), opacity,
  //    loop (true 면 계속 반복, life 초가 지나면 끝), life, delay (초), onEnd
  function spawn(scene, name, o) {
    o = o || {};
    const d = FXDATA[name];
    if (!d) { console.warn('효과 없음', name); return null; }
    const mat = new T.ShaderMaterial({
      uniforms: {
        map: { value: null }, uvRect: { value: new T.Vector4(0, 0, 1 / d.cols, 1 / d.rows) },
        tint: { value: new T.Color(o.tint === undefined ? 0xffffff : o.tint) }, opacity: { value: o.opacity === undefined ? 1 : o.opacity },
      },
      vertexShader: VS, fragmentShader: FS, transparent: true, depthTest: false, depthWrite: false,
      blending: T.CustomBlending, blendEquation: T.AddEquation, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor,
    });
    // 크기: 낱장 한 장이 덮는 넓이
    let hgt = o.height !== undefined ? o.height : d.size[1] * FXLIB.unit * (o.scale === undefined ? 1 : o.scale);
    const wid = hgt * d.size[0] / d.size[1];
    const mesh = new T.Mesh(geo, mat);
    mesh.scale.set(wid, hgt, 1);
    // 원점이 효과의 기준점(anchor)에 오도록 옮긴다
    mesh.position.set((0.5 - d.anchor[0]) * wid, (d.anchor[1] - 0.5) * hgt, 0);
    mesh.frustumCulled = false;
    mesh.renderOrder = o.renderOrder || 600;
    mesh.visible = false;
    const g = new T.Group();
    g.position.set(o.x || 0, o.y || 0, o.z || 0);
    g.rotation.z = o.rotation || 0;
    if (o.flipX) g.scale.x = -1;
    g.add(mesh);
    scene.add(g);
    const h = {
      name, group: g, mesh, mat, data: d, t: -(o.delay || 0), speed: o.speed === undefined ? 1 : o.speed,
      loop: !!o.loop, life: o.life, onEnd: o.onEnd, done: false, frame: -1,
      stop() { finish(h); },
    };
    load(name).then((t) => { mat.uniforms.map.value = t; }).catch((e) => { console.warn(e.message); finish(h); });
    live.push(h);
    return h;
  }

  function finish(h) {
    if (h.done) return;
    h.done = true;
    if (h.group.parent) h.group.parent.remove(h.group);
    h.mat.dispose();
    const i = live.indexOf(h);
    if (i >= 0) live.splice(i, 1);
    if (h.onEnd) h.onEnd(h);
  }

  function step(h, dt) {
    if (h.done) return;
    h.t += dt * h.speed;
    if (h.t < 0) return;
    const d = h.data;
    let f = Math.floor(h.t * d.fps);
    if (h.loop) {
      if (h.life !== undefined && h.t >= h.life) { finish(h); return; }
      f %= d.n;
    } else if (f >= d.n) { finish(h); return; }
    if (!h.mat.uniforms.map.value) return; // 그림이 아직 안 왔다
    h.mesh.visible = true;
    if (f !== h.frame) {
      h.frame = f;
      const c = f % d.cols, r = Math.floor(f / d.cols);
      // 그림 위쪽 줄이 첫 줄 (텍스처 v 는 아래가 0)
      h.mat.uniforms.uvRect.value.set(c / d.cols, 1 - (r + 1) / d.rows, 1 / d.cols, 1 / d.rows);
    }
  }

  const FXLIB = {
    unit: 0.1,   // 원작 유니티 단위 → 장면 단위 (scale 로 띄울 때만 쓴다)
    base: '',    // 그림 경로 앞에 붙일 말 (보통 비워 둔다)
    load,
    preload(names) { return Promise.all((names || Object.keys(FXDATA)).map((n) => load(n).catch(() => null))); },
    spawn,
    update(dt) { for (let i = live.length - 1; i >= 0; i--) step(live[i], dt); },
    clear() { while (live.length) finish(live[live.length - 1]); },
    get active() { return live.length; },
    names() { return Object.keys(window.FXDATA || {}); },
  };
  window.FXLIB = FXLIB;
})();
