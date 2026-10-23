// 전투 연출 (랑그릿사 모바일식): 영웅은 뒤(바깥쪽), 배속 병사는 영웅 앞(적 쪽)에 늘어선다.
// 양쪽이 동시에 싸운다: RULES.combat 의 접전(rounds)마다 두 부대가 함께 공격하고, 그 접전의 피해가 동시에 들어간다.
// 근접은 두 부대가 함께 돌진해 맞붙고, 원거리(2칸 이상)는 화면을 둘로 나눠 탄이 가운데 경계를 넘어 오간다.
// 쓰러진 병사는 맞은 반대쪽으로 짧게 밀려나며 뒤로 젖혀지고, 하얗게 깜빡이다 사라진다. 아군은 항상 왼쪽, 적은 오른쪽.
// 맞을 때마다 맞은 병사 머리 위에 피해 숫자가 튀어 오른다.
// 카메라 (랑그릿사처럼): 공격하는 쪽에 바짝 붙어 시작해 전장 전체로 물러나고, 맞붙는 순간 가운데로 다가간다. 큰 타격엔 흔들림과 짧은 멈춤,
// 결판이 나는 마지막 일격은 느리게 보여 주고 쓰러진 쪽으로 다가간 뒤 '격파'·'퇴각' 글자를 띄우고 어둡게 닫는다.
(function () {
  const FIGHT = {};
  let scene, cam, bgMesh, bgMat;
  const bgTex = { L: null, R: null }; // 나뉜 화면: 왼쪽·오른쪽 부대가 저마다 서 있는 칸의 배경
  let VW = 16, VH = 9;
  const GROUND = -0.5; // 부대가 서는 높이: 아래 구석 초상에 가리지 않게 길 가운데쯤 (배경은 그대로)
  let actors = [], fxs = [], tl = [], T = 0, done = null, active = false;
  const tweens = [];
  const el = () => document.getElementById('fight');
  // 원거리 화면 분할: 두 부대를 GAP 만큼 떼어 놓고 반쪽 화면마다 카메라 하나
  let split = false;
  const GAP = 7, TRAVEL = 0.42; // 떼어 놓는 거리, 탄이 경계를 건너는 시간(초)
  let camL, camR;
  // 카메라: z 확대(1=전장 전체), x·y 이동, 흔들림. timeK 는 느린 동작 배율, stop 은 타격 멈춤(초)
  const CAM = { z: 1, x: 0, y: 0, sh: 0, sh0: 1, shA: 0 };
  let CY = 0.6, timeK = 1, stopT = 0;
  function applyCam() {
    const hw = VW / 2 / CAM.z, hh = VH / 2 / CAM.z;
    const room = Math.max(0, (bgMesh.scale.x - VW / CAM.z) / 2 - 0.05); // 배경 밖이 보이지 않게
    let cx = Math.max(-room, Math.min(room, CAM.x)), cy = CY + CAM.y;
    if (CAM.sh > 0) { const k = CAM.shA * (CAM.sh / CAM.sh0); cx += (Math.random() - 0.5) * k; cy += (Math.random() - 0.5) * k * 0.6; }
    cam.left = cx - hw; cam.right = cx + hw; cam.top = cy + hh; cam.bottom = cy - hh;
    cam.updateProjectionMatrix();
  }
  function shake(a, dur = 0.22) { if (window.GAME && GAME.save && GAME.save.opts.shake === false) return; if (a >= CAM.shA * (CAM.sh / CAM.sh0)) { CAM.shA = a; CAM.sh = CAM.sh0 = dur; } }
  let stopLeft = 0.4; // 한 전투의 멈춤 총량 (쌓여서 늘어지지 않게). force 는 영웅이 쓰러질 때처럼 꼭 멈출 때
  function hitStop(sec, force) { const d = force ? sec : Math.min(sec, stopLeft); if (d <= 0) return; if (!force) stopLeft -= d; stopT = Math.max(stopT, d); }
  FIGHT.timeK = () => (stopT > 0 ? 0 : timeK); // 원작 효과 플립북도 같은 빠르기로 (game.js)

  FIGHT.init = function () {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101826);
    cam = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, -50, 50);
    camL = cam.clone(); camR = cam.clone();
    bgMat = new THREE.MeshBasicMaterial({ color: 0x223044, depthTest: false, depthWrite: false });
    bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bgMat);
    bgMesh.renderOrder = -10;
    scene.add(bgMesh);
    el().addEventListener('pointerdown', () => { if (active) finish(); });
  };
  FIGHT.resize = function (w, h) {
    const a = w / h;
    if (a < 1) { VW = 7.2; VH = VW / a; } // 세로 화면: 병사를 크게 else { VH = Math.max(8.4, 12.5 / a); VW = VH * a; }
    CY = a < 1 ? -0.4 : 0.6; // 세로 화면: 부대가 화면 가운데쯤 오게
    CAM.z = 1; CAM.x = CAM.y = 0;
    applyCam();
    fitBg();
  };
  function fitBg(tex = bgMat.map) {
    const img = tex && tex.image;
    const ia = img ? img.width / img.height : 16 / 9;
    let h = VH * 1.08, w = h * ia;
    if (w < VW * 1.08) { w = VW * 1.08; h = w / ia; }
    bgMesh.scale.set(w, h, 1);
    bgMesh.position.set(0, CY + (h - VH) * 0.12, -5);
  }
  FIGHT.scene = () => scene;
  FIGHT.camera = () => cam;
  FIGHT.active = () => active;
  // 그리기: 보통은 한 화면, 원거리면 왼쪽 부대 / 오른쪽 부대를 반쪽씩 따로 비춘다
  FIGHT.render = function (renderer) {
    if (!split) { bgMesh.position.x = 0; renderer.render(scene, cam); return; }
    const sz = renderer.getSize(new THREE.Vector2()), hw = Math.floor(sz.x / 2);
    renderer.setScissorTest(true);
    for (const [c, side] of [[camL, -1], [camR, 1]]) {
      const cx = side * (VW / 4 + GAP) + (cam.left + cam.right) / 2; // 보통 화면의 그쪽 절반을 GAP 만큼 옮긴 자리 (+흔들림)
      c.left = cx - VW / 4; c.right = cx + VW / 4; c.top = cam.top; c.bottom = cam.bottom;
      c.updateProjectionMatrix();
      const tx = side < 0 ? bgTex.L : bgTex.R; // 반쪽마다 제 자리의 지형 배경
      if (tx && bgMat.map !== tx) { bgMat.map = tx; fitBg(tx); }
      bgMesh.position.x = cx; // 배경은 반쪽마다 따라간다
      const x = side < 0 ? 0 : hw, w = side < 0 ? hw : sz.x - hw;
      renderer.setViewport(x, 0, w, sz.y); renderer.setScissor(x, 0, w, sz.y);
      renderer.render(scene, c);
    }
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, sz.x, sz.y);
    bgMesh.position.x = 0;
  };

  const figN = (u, thp) => RULES.soldiers(u, thp);
  // 발밑 그림자: 공중병은 몸만 떠 있고 그림자는 땅에 남는다 (랑그릿사처럼)
  let shadowGeo = null, shadowMat = null;
  function addShadow(f) {
    if (!shadowGeo) {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 64;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 32, 0, 64, 32, 64);
      gr.addColorStop(0, 'rgba(0,0,0,0.92)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.setTransform(1, 0, 0, 0.5, 0, 16);
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      shadowGeo = new THREE.PlaneGeometry(1, 0.5);
      shadowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false, depthWrite: false, opacity: 0.8 });
    }
    const m = new THREE.Mesh(shadowGeo, shadowMat);
    const w = (f.hero ? 1.25 : 1.05) * (f.air ? 0.8 : 1);
    m.scale.set(w, w * 0.6, 1);
    m.position.set(0, 0.02, 0);
    m.renderOrder = 5; // 배경 위, 모든 유닛 아래
    f.rig.g.add(m);
    f.shadow = m;
    if (f.hero) { // 영웅 발밑: 편 색 고리 (병사 속에서도 지휘관이 한눈에)
      const r = new THREE.Mesh(shadowGeo, ringMat(f.side));
      r.scale.set(1.9, 1.9 * 0.6, 1); r.position.set(0, 0.03, 0); r.renderOrder = 6;
      f.rig.g.add(r); f.ring = r;
    }
    // 공중병: 리그만 들어 올리고 천천히 오르내린다
    f.by0 = f.rig.c.root.position.y; f.bx0 = f.rig.c.root.position.x;
    f.bob = Math.random() * Math.PI * 2;
  }
  const RINGS = {};
  function ringMat(side) {
    if (RINGS[side]) return RINGS[side];
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d'), col = side === 'L' ? '63,180,255' : '255,64,98';
    g.setTransform(1, 0, 0, 0.5, 0, 0);
    const gr = g.createRadialGradient(128, 128, 60, 128, 128, 124);
    gr.addColorStop(0, `rgba(${col},0)`); gr.addColorStop(0.55, `rgba(${col},0.25)`); gr.addColorStop(0.8, `rgba(${col},0.95)`); gr.addColorStop(0.88, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    return (RINGS[side] = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  }
  const isAir = (u, hero) => (hero ? u.kind : u.troop && u.troop.kind) === 'fly';
  const lift = (f) => (f.air ? f.air + Math.sin(T * 3 + f.bob) * 0.07 : 0);
  // 랑그릿사 모바일처럼: 영웅은 맨 뒤(바깥쪽), 병사 무리는 영웅 앞(적 쪽)에 3줄
  // 영웅은 바깥쪽이되, 모서리 인물 그림에 가리지 않게 가장자리에서 조금 들인다
  const EDGE = () => Math.min(2.6, VW * 0.19); // 지휘관이 화면 끝·구석 초상에 걸리지 않게 안쪽으로
  const PORT = () => VW < VH; // 세로 화면
  // 세로 화면은 폭이 좁아 진형을 촘촘히: 앞줄 0.75, 열 간격 0.4, 영웅은 맨 뒷열 바로 뒤 (화면 안)
  const heroX = (dir) => dir * (PORT() ? Math.min(VW / 2 - 0.6, 0.75 + 3 * 0.4 + 1.0) : VW / 2 - EDGE());
  function soldierSlots(n, side, wide = 1) {
    const dir = side === 'L' ? -1 : 1;
    const front = PORT() ? 0.75 : 1.6, back = VW / 2 - EDGE() - 0.9; // 앞줄은 가운데에서 떨어뜨려 돌격할 거리가 남게
    const span = PORT() ? 0.4 : Math.min(0.95 * wide, Math.max(0.5, (back - front) / 3.2));
    const out = [];
    const R5 = PORT() ? 3 : 5; // 세로 줄 수 (가로 화면은 5줄: 다섯 쌍이 나란히 맞붙는 넓은 전선)
    for (let i = 0; i < n; i++) {
      const row = i % R5, col = Math.floor(i / R5); // 앞 열부터 채운다
      const jx = PORT() ? 0 : (Math.random() - 0.5) * 0.18, jy = (Math.random() - 0.5) * 0.08; // 자로 잰 듯한 격자가 아니게 살짝
      const x = PORT() ? front + col * span + (row === 1 ? span * 0.45 : 0) : front + col * 1.05 * wide + (row % 2) * 0.3; // 줄마다 반 걸음 어긋나게
      const y = PORT() ? GROUND - 0.3 + row * 0.45 : GROUND - 1.05 + row * 0.52;
      out.push([dir * (x + jx), y + jy, row]);
    }
    return out;
  }

  // 아래 가운데 판 (랑그릿사식): 영웅·병사 막대가 가운데 글자를 사이에 두고 마주 본다. 깎인 만큼 흰 잔상이 늦게 따라 줄어든다
  function setBars(cls, u, thp, hp, instant) {
    const bar = (row, v, max, txt) => {
      const b = el().querySelector(`.frow.${row} .fbar.${cls}`), w = Math.max(0, Math.min(1, v / max)) * 100 + '%';
      b.style.visibility = '';
      b.querySelectorAll('i').forEach((i) => { if (instant) i.style.transition = 'none'; i.style.width = w; });
      if (instant) { void b.offsetWidth; b.querySelectorAll('i').forEach((i) => { i.style.transition = ''; }); }
      b.querySelector('b').innerHTML = txt;
      const n = el().querySelector(`.frow.${row} .fval.${cls}`); // 막대 안쪽 끝, 가운데 글자 옆의 큰 숫자
      n.innerHTML = txt; n.style.visibility = '';
    };
    if (u.troop) bar('t', thp, u.troop.hpMax, `${RULES.soldiers(u, thp)}<small>명</small>`);
    else el().querySelectorAll(`.frow.t .fbar.${cls}, .frow.t .fval.${cls}`).forEach((e) => { e.style.visibility = 'hidden'; });
    bar('h', hp, u.hpMax, Math.max(0, Math.round(hp)));
  }
  // 모서리 인물 그림: 아군 영웅은 대화용 전신 그림의 윗몸, 그림이 없는 적은 얼굴 아이콘을 틀에 넣는다
  const STAND = { constantia: '3P_ConstantiaS2_N_Resolve', griffon: 'BR_PA00EL_N_Resolve', johanna: 'DS_Johanna_N_Serious', lrl: 'PECS_LRL_N_Idle', pupphead: 'PECS_PuppHead_N', fallen: 'AGS_Fallen_N',
    amy: 'BR_Amy_N_Serious', coco: 'PECS_CoCoWhiteShell_N_Smile', marie: 'BR_Marie_N_Pride', scathy: 'BR_Scathy_N_Elegance', labiata: '3P_Labiata_N_Smile' };
  const WHOLE = new Set(['pupphead', 'fallen']); // 기계 몸이라 전신을 통째로 줄여 넣는다
  // 적 초상 (랑그릿사처럼 모서리에 큰 윗몸): 원작 적은 일러스트가 없어, 전투에 쓰는 SD 모델을 따로 크게 그려 그림으로 쓴다
  let BR = null;
  function sdBust(u, side) {
    try {
      if (!window.SD || !SD.template(u.rig)) return null;
      if (!BR) {
        const c = document.createElement('canvas'); c.width = c.height = 640;
        const r = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true, preserveDrawingBuffer: true, premultipliedAlpha: false });
        r.setClearColor(0x000000, 0);
        BR = { c, r, scene: new THREE.Scene() };
      }
      const H = 10, native = u.side === 'p' ? 1 : -1, rig = new window.KIT.Rig(u.rig, H, native);
      rig.face(side === 'L' ? 1 : -1); // 가운데(상대 쪽)를 본다
      rig.loop('idle'); rig.update(0.35);
      const span = H * (u.def.big ? 1.05 : 0.8), top = H * 1.04; // 머리부터 허리쯤까지
      const cam = new THREE.OrthographicCamera(-span / 2, span / 2, top, top - span, -100, 100);
      BR.scene.add(rig.g);
      BR.r.render(BR.scene, cam);
      const url = BR.c.toDataURL('image/png');
      BR.scene.remove(rig.g); rig.dispose();
      return url;
    } catch (e) { return null; }
  }
  FIGHT.STAND = STAND; // 특기 컷인(lohud.js)도 같은 그림을 쓴다
  function shakeBust(side) { const b = el().querySelector('.fcorner.' + side + ' .fbust'); b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit'); }

  // a: 공격자, d: 방어자, res: RULES.combat 결과, opt: { bg, speed }
  FIGHT.play = function (a, d, res, opt) {
    const K = window.KIT;
    return new Promise((resolve) => {
      done = resolve;
      active = true;
      T = 0; tl = []; actors = []; fxs = []; tweens.length = 0;
      timeK = 1; stopT = 0; CAM.sh = 0; stopLeft = 0.4;
      const sp = opt.speed || 1;
      bgMat.map = null; bgMat.color.set(0x223044); bgMat.needsUpdate = true;
      const L = a.side === 'p' ? a : d, Rr = L === a ? d : a;
      // 배경: 붙어 싸우면 맞는 쪽 칸 하나, 떨어져 쏘면(화면 둘로 나눔) 두 부대가 저마다 서 있는 칸의 지형
      const url = (b) => (b.includes('/') ? b : 'assets/bg/' + b + '.webp');
      const bgD = opt.bg, bgAt = opt.bgA || opt.bg;
      bgTex.L = bgTex.R = null;
      K.loadTex(url(bgD)).then((t) => { if (!t) return; bgMat.map = t; bgMat.color.set(0xffffff); bgMat.needsUpdate = true; fitBg(); if (L === d) bgTex.L = t; else bgTex.R = t; });
      K.loadTex(url(bgAt)).then((t) => { if (!t) return; if (L === a) bgTex.L = t; else bgTex.R = t; });
      const ui = el();
      ui.classList.remove('hidden', 'fout');
      split = res.dist > 1; // 떨어져서 쏘는 원거리 공격
      ui.classList.toggle('split', split);
      const off = split ? GAP : 0;
      const st = { [a.uid]: { thp: a.troop ? a.troop.hp : 0, hp: a.hp }, [d.uid]: { thp: d.troop ? d.troop.hp : 0, hp: d.hp } };
      const setSide = (cls, u) => {
        const c = ui.querySelector('.fcorner.' + cls), sd = u.side === 'p' && STAND[u.key]; // 전직하면 모델 이름이 바뀌므로 영웅으로 찾는다
        const bust = sd ? null : sdBust(u, cls); // 일러스트가 없는 적은 원작 SD 모델을 크게 그린 윗몸
        c.classList.toggle('stand', !!sd); c.classList.toggle('whole', !!sd && WHOLE.has(u.key)); c.classList.toggle('sd', !!bust);
        c.querySelector('.fbust').classList.remove('hit');
        const im = c.querySelector('.fimg'); // 앞 전투의 그림이 잠깐 비치지 않게, 새 그림이 다 오면 틀째로 보인다
        c.classList.add('loading');
        im.onload = () => c.classList.remove('loading');
        im.src = sd ? 'assets/story/stand/' + sd + '.webp' : bust || (window.IMG && IMG[u.icon]) || '';
        if (im.complete && im.naturalWidth) c.classList.remove('loading');
        const kind = DATA.KIND[u.troop && st[u.uid].thp > 0 ? u.troop.kind : u.kind].name;
        ui.querySelector('.fname.' + cls).innerHTML = `<b>${u.name}</b><i>${u.troop ? u.troop.def.short : kind}</i><small>Lv.${u.lv}</small>`;
        setBars(cls, u, st[u.uid].thp, st[u.uid].hp, true);
      };
      ui.querySelector('.fnums').innerHTML = '';
      ui.querySelector('.fvs small').textContent = res.rel > 0 ? `${a.name} 상성 우위` : res.rel < 0 ? `${a.name} 상성 열세` : '';
      setSide('L', L); setSide('R', Rr);

      const mk = (u, side) => {
        const dir = side === 'L' ? -1 : 1;
        const f = side === 'L' ? 1 : -1;
        const list = [];
        const native = u.side === 'p' ? 1 : -1;
        const hh = (u.def.big ? 3.3 : 2.5) * (u.def.sizeK || 1); // 영웅은 병사(1.5)보다 확실히 크게
        const hero = new K.Rig(u.rig, hh, native);
        hero.face(f);
        // 영웅 몸 폭만큼 화면 가장자리 안쪽으로 (세로 화면처럼 좁을 때 잘리지 않게)
        const hw = (hero.c.tpl.box.max.x - hero.c.tpl.box.min.x) * hero.k;
        const hx = dir * Math.min(Math.abs(heroX(dir)), VW / 2 - hw / 2 - 0.15) + dir * off, hy = GROUND + 0.05;
        hero.g.position.set(hx + dir * 7, hy, 0);
        hero.order = 190; // 지휘관은 병사들 앞에 그린다 (병사에 묻히지 않게)
        scene.add(hero.g);
        hero.loop('move');
        list.push({ rig: hero, side, x: hx, y: hy, u, home: hx, hero: true, alive: true, air: isAir(u, true) ? 0.85 : 0 });
        addShadow(list[list.length - 1]);
        soldierSlots(figN(u, st[u.uid].thp), side, u.side === 'e' ? 1.3 : 1).forEach(([x0, y, row], i) => {
          const x = x0 + dir * off;
          const r = new K.Rig(u.troop.rig, 1.5 * (0.95 + Math.random() * 0.1), native); // 키도 조금씩 다르게
          r.face(f);
          r.g.position.set(x + dir * 7, y, 0);
          r.order = 100 + (5 - row) * 20 + i; // 아래(앞) 줄이 위에 그려진다
          scene.add(r.g);
          r.loop('move');
          r.c.time = Math.random();
          list.push({ rig: r, side, x, y, u, row, home: x, hero: false, alive: true, air: isAir(u, false) ? 0.6 : 0 });
          addShadow(list[list.length - 1]);
        });
        actors.push(...list);
        return list;
      };
      const LA = mk(L, 'L'), RA = mk(Rr, 'R');
      const att = a === L ? LA : RA, def = a === L ? RA : LA;
      const attSide = a === L ? 'L' : 'R', defSide = attSide === 'L' ? 'R' : 'L';

      // 등장: 두 부대가 화면 밖에서 달려 들어온다. 카메라는 공격하는 쪽에 바짝 붙었다가 전장 전체로 물러난다
      const enter = 0.65 / sp;
      for (const f of actors) tween(f.rig.g.position, 'x', f.rig.g.position.x, f.x, 0, enter);
      tl.push({ t: enter, fn: () => actors.forEach((f) => f.rig.loop('idle')) });
      if (!split) {
        const ax = (attSide === 'L' ? -1 : 1) * VW * 0.2;
        CAM.z = 1.22; CAM.x = ax; CAM.y = -0.25; applyCam();
        tween(CAM, 'z', 1.22, 1.06, 0.05, enter + 0.25 / sp); tween(CAM, 'x', ax, 0, 0.05, enter + 0.25 / sp); tween(CAM, 'y', -0.25, 0, 0.05, enter + 0.25 / sp);
      } else { CAM.z = 1; CAM.x = CAM.y = 0; applyCam(); }
      let t0 = enter + 0.2 / sp;
      // 근접: 공격하는 쪽은 크게, 반격하는 쪽도 맞받아 함께 나선다. 병사는 병과마다 랑그릿사식으로 (STYLE)
      if (!split) {
        // 돌격 (랑그릿사 전통): 근접 병사와 그 지휘관은 줄을 지킨 채 달려 나가 맞붙는 선에서 멈춘다.
        // 둘 다 근접이면 두 앞줄 한가운데서, 아니면 방어하는 쪽 앞줄 바로 앞에서. 총·활 병사는 한두 걸음 나와 제자리에서 쏜다
        const frontX = (l, d) => { const c = l.filter((f) => !f.hero); return c.length ? c.reduce((m, f) => (f.x * d > m * d ? f.x : m), c[0].x) : null; };
        const dA = attSide === 'L' ? 1 : -1;
        const meleeA = att.some((f) => !f.hero && isMelee(f)), meleeD = res.counter && def.some((f) => !f.hero && isMelee(f));
        const fA = frontX(att, dA), fD = frontX(def, -dA);
        const meetX = fA != null && fD != null ? (meleeD ? (fA + fD) / 2 : fD - dA * 0.7) : null; // 몸집 큰 철충과도 겹치지 않을 만큼
        const meleeOf = (f) => (f.hero ? ['rush', 'wall', 'lance'].includes(styleOf(f)) : isMelee(f)); // 지휘관: 보병·창병·기병이면 맞붙으러 나간다
        const charge = (list, side, foe) => {
          const dir = side === 'L' ? 1 : -1, me = frontX(list, dir), theirs = frontX(foe, -dir) ?? (foe.find((f) => f.hero) || {}).x;
          const shift = meetX != null && me != null ? meetX - dir * 0.55 - me : 0; // 내 앞줄이 맞붙는 선까지
          list.forEach((f) => {
            const sty = styleOf(f), p = f.rig.g.position;
            const run = (speed, dust) => tl.push({ t: t0, fn: () => { f.rig.loop('move', speed); if (Math.random() < dust) fx('dust_step', p.x, f.y + 0.05, { flipX: side === 'R', k: f.hero ? 1 : 0.7, renderOrder: 90 }); } });
            if (meleeOf(f) && shift * dir > 0.05) { // 줄을 지킨 채 달려든다 (기병은 빠르게, 중장병은 천천히)
              const ts = sty, d = ts === 'lance' ? 0.4 : ts === 'wall' ? 0.6 : 0.5;
              run(ts === 'lance' ? 2.4 : ts === 'wall' ? 0.9 : 1.5, ts === 'lance' ? 0.9 : f.hero ? 1 : 0.4);
              const x1 = f.hero ? meetX - dir * (!list.some((o) => !o.hero && isMelee(o)) ? 0.9 : ts === 'lance' ? 2.6 : 2.8) : f.x + shift + (Math.random() - 0.5) * 0.1; // 지휘관은 제 병사들 바로 뒤 (병사가 총을 들고 남으면 홀로 맞붙는 선까지)
              if ((x1 - f.x) * dir > 0.05) { tween(p, 'x', f.x, x1, t0, t0 + d / sp); f.x = x1; }
              return;
            }
            if (sty === 'stay') return; // 궁병·전자전·의무 병종은 (지휘관도) 제자리에서 쏘거나 주문을 건다
            if (sty === 'swoop' && theirs != null && me != null) { // 높이 떠올라 적 앞줄 위로
              const adv = f.hero ? theirs - dir * 0.9 - f.x : theirs - me - dir * 0.35; run(1.3, 0);
              tween(f, 'air', f.air, 1.5, t0, t0 + 0.5 / sp); tween(p, 'x', f.x, f.x + adv, t0, t0 + 0.5 / sp); f.x += adv;
              return;
            }
            if (sty === 'blink' && theirs != null && me != null) { // 하얗게 사라졌다가 적 코앞에 나타난다
              const x1 = f.hero ? theirs - dir * 0.9 : f.x + theirs - me - dir * 0.6, t1 = t0 + 0.16 / sp;
              tl.push({ t: t0, fn: () => { f.rig.c.setFlash(1); fx('dust_step', p.x, f.y + 0.05, { k: 0.6, renderOrder: 90 }); } });
              tween(null, null, 1, 0, t0, t1, (v) => f.rig.c.setOpacity(v));
              tl.push({ t: t1, fn: () => { p.x = x1; f.flashT = T; } });
              tween(null, null, 0, 1, t1, t1 + 0.14 / sp, (v) => f.rig.c.setOpacity(v));
              f.x = x1;
              return;
            }
            run(1.1, 0.2); const x1 = f.x + dir * 0.45; tween(p, 'x', f.x, x1, t0, t0 + 0.4 / sp); f.x = x1; // 총을 든 병사: 한두 걸음
          });
        };
        charge(att, attSide, def);
        if (res.counter) charge(def, defSide, att);
        const sol = actors.filter((f) => !f.hero), cx = Math.max(-2.2, Math.min(2.2, sol.reduce((m, f) => m + f.x, 0) / Math.max(1, sol.length) * 0.85)); // 실제로 맞붙는 곳으로
        tween(CAM, 'z', 1.06, 1.14, t0, t0 + 0.45 / sp); tween(CAM, 'x', 0, cx, t0, t0 + 0.45 / sp); tween(CAM, 'y', 0, -0.2, t0, t0 + 0.45 / sp);
        // 부딪치는 순간: 두 앞줄이 서로 튕기며 크게 번쩍, 화면이 흔들리고 한순간 멈춘다
        tl.push({ t: t0 + 0.42 / sp, fn: () => {
          if (!meleeA) { shake(0.12, 0.2); return; }
          shake(0.4, 0.32); hitStop(0.1);
          fx('dust_fall', meetX ?? cx, GROUND + 0.1, { k: 1.6, renderOrder: 95 });
          const hitLine = (list, side, flash) => { const d = side === 'L' ? 1 : -1; const fr = list.filter((f) => !f.hero && f.alive).sort((p, q) => (q.x - p.x) * d).slice(0, 5);
            fr.forEach((f, i) => later(T + i * 0.04 + Math.random() * 0.03, () => { f.kb = 0.45; f.kbT = T; if (flash) f.flashT = T; })); return fr; }; // 줄마다 어긋나게, 맞는 쪽만 번쩍
          const fa = hitLine(att, attSide, false); hitLine(def, defSide, true);
          fa.forEach((f, i) => { const q = f.rig.g.position; fx(i % 2 ? 'hit_slash' : 'hit_heavy', q.x + dA * 0.5, q.y + 0.6, { k: i % 2 ? 0.7 : 0.8, renderOrder: 530, rotation: (Math.random() - 0.5) * 0.6 }); });
          K.AU.play('expM', 0.5);
        } });
        t0 += 0.55 / sp;
      }
      // 재능 발동 판 (원작 패시브 표시): 이번 교전에 효과가 있는 재능만
      const sa = { hp: a.hp, thp: a.troop ? a.troop.hp : 0 }, sd0 = { hp: d.hp, thp: d.troop ? d.troop.hp : 0 };
      const frontD = d.troop && sd0.thp > 0 ? 'T' : 'H', frontA = a.troop && sa.thp > 0 ? 'T' : 'H';
      const namesA = RULES.activeTraits(a, d, true, res.dist, sa, sd0, frontD);
      const namesD = [...RULES.guardTraits(d, frontD), ...(res.counter ? RULES.activeTraits(d, a, false, res.dist, sd0, sa, frontA) : [])];
      if (res.counter && res.dist > d.rng) namesD.push(...RULES.traits(d).filter((t) => t.rangeCounter).map((t) => t.name));
      [...new Set(namesA)].slice(0, 2).forEach((n, i) => tl.push({ t: enter * 0.6 + i * 0.25, fn: () => passivePlate(attSide, n, i) }));
      [...new Set(namesD)].slice(0, 2).forEach((n, i) => tl.push({ t: enter * 0.6 + 0.15 + i * 0.25, fn: () => passivePlate(defSide, n, i) }));
      const end = brawl(att, def, attSide, defSide, a, d, res, t0, sp, st);
      const close = finale(end, sp, st, a, d, res, attSide, defSide);
      tl.push({ t: close, fn: () => ui.classList.add('fout') }); // 어둡게 닫는다 (css)
      tl.push({ t: close + 0.28, fn: () => finish() });
      tl.sort((p, q) => p.t - q.t);
    });
  };

  // 동시 전투: 접전(round)마다 양쪽 부대가 함께 공격하고, 그 접전의 피해를 동시에 반영한다. 반환: 끝나는 시각
  function brawl(att, def, attSide, defSide, a, d, res, t0, sp, st) {
    const r0 = res.rounds && res.rounds.length ? res.rounds : [{ dT: res.dT, dH: res.dH, aT: res.aT, aH: res.aH }];
    // 접전은 최대 4번으로 묶는다 (랑그릿사처럼 돌격 왕복이 3~4번)
    const NP = Math.min(r0.length, 4), rounds = Array.from({ length: NP }, () => ({ dT: 0, dH: 0, aT: 0, aH: 0 }));
    r0.forEach((r, i) => { const q = rounds[Math.floor((i * NP) / r0.length)]; for (const k in q) q[k] += r[k] || 0; });
    const step = (split ? 0.55 : 0.52) / sp; // 접전 사이 간격
    // 기댓값이 아니라 실제로 들어간 피해(정수)에 맞춰 접전별 피해를 나눈다
    const tot = (k) => rounds.reduce((s, r) => s + r[k], 0) || 1;
    const share = { dT: res.dT / tot('dT'), dH: res.dH / tot('dH'), aT: res.aT / tot('aT'), aH: res.aH / tot('aH') };
    const sides = [
      { from: att, to: def, toSide: defSide, au: a, du: d, kT: 'dT', kH: 'dH' },
      { from: def, to: att, toSide: attSide, au: d, du: a, kT: 'aT', kH: 'aH', counter: true },
    ];
    let end = t0;
    rounds.forEach((r, ri) => {
      const tr = t0 + ri * step;
      for (const s of sides) {
        if (s.counter && !res.counter) continue;
        if (r[s.kT] + r[s.kH] <= 0 && s.counter) continue;
        // 살아 있는 쪽이 저마다 조금씩 어긋나게 공격 동작 (실시간 난전처럼)
        const hitT = tr + 0.18 / sp;
        if (s.counter && ri === 0) tl.push({ t: tr - 0.12 / sp, fn: () => wordOver(s.from, 'counter') }); // 원작 「반격」 글자
        tl.push({ t: tr, fn: () => {
          for (const f of s.from) {
            if (!f.alive) continue;
            const dur = f.rig.dur('atk');
            const speed = Math.max(1, dur / (f.hero ? 1.6 : 1.1)) * sp * (0.9 + Math.random() * 0.25);
            const go = () => { // 병사마다 0~0.14초 어긋나게: 한 박자에 다 같이 움직이지 않는다
              if (!f.alive) return;
              if (Math.random() < (f.hero ? 1 : 0.8)) { f.rig.once('atk', speed); muzzle(f, s.au); if (!split) strike(f, s.to, s.au, sp); }
              if (split && isRanged(f, s.au) && Math.random() < (f.hero ? 1 : 0.55)) bolt(f, s.to, s.au);
            };
            if (f.hero) go(); else later(T + Math.random() * 0.14 / sp, go);
          }
        } });
        const far = split;
        tl.push({ t: hitT + (far ? TRAVEL / sp : 0), fn: () => {
          const S = st[s.du.uid];
          const dT = r[s.kT] * share[s.kT], dH = r[s.kH] * share[s.kH];
          S.thp = Math.max(0, S.thp - dT); S.hp = Math.max(0, S.hp - dH);
          const soldiers = s.to.filter((f) => !f.hero && f.alive);
          const heroF = s.to.find((f) => f.hero);
          // 맞는 쪽: 병사 몇 명과 (병사가 없거나 영웅 피해가 있으면) 영웅이 번쩍
          const pool = soldiers.slice().sort(() => Math.random() - 0.5).slice(0, 3);
          const nS = pool.length;
          if (dH > 0 || !pool.length) pool.push(heroF);
          pool.forEach((v, k) => {
            if (!v || !v.alive) return;
            const advH = s.counter ? res.rel < 0 : res.rel > 0;
            hitFx(s.from.find((f) => f.alive) || s.from[0], v, s.au, far, k === 0, v.hero && advH);
            // 피해 숫자: 병사 피해는 맞은 병사들이 나눠 받고, 영웅은 영웅 피해(병사가 없으면 전부)
            const n = v.hero ? (dH > 0 ? dH : dT) : k === 0 ? dT : 0; // 병사 피해는 그 접전 합계를 한 숫자로
            const adv = s.counter ? res.rel < 0 : res.rel > 0;
            if (n > 0.05) dmgNum(v, n, v.hero && adv ? 'cri' : s.du.side === 'p' ? 'me' : 'base');
          });
          const keep = figN(s.du, S.thp);
          while (s.to.filter((f) => !f.hero && f.alive).length > keep) die(s.to.filter((f) => !f.hero && f.alive).sort((p, q) => Math.abs(p.x) - Math.abs(q.x))[0]);
          setBars(s.toSide, s.du, S.thp, S.hp);
          if (dH > 0) { shakeBust(s.toSide); shake(0.22, 0.24); hitStop(0.07); } else shake(0.1, 0.16);
          if (dH > 0 && (s.counter ? res.rel < 0 : res.rel > 0)) { shake(0.38, 0.32); hitStop(0.12); } // 상성 우위 강한 일격
          if (S.hp <= 0.5 && heroF.alive) die(heroF);
        } });
        end = Math.max(end, hitT + (far ? TRAVEL / sp : 0) + 0.2 / sp);
      }
    });
    return end;
  }

  // 진행 중에 시각표에 끼워 넣기 (시각 순서 유지)
  function later(t, fn) { let i = tl.length; while (i > 0 && tl[i - 1].t > t) i--; tl.splice(i, 0, { t, fn }); }
  // 마무리 (랑그릿사): 결판이 나면 느린 동작으로 쓰러진 쪽에 다가가 '격파'·'퇴각', 아니면 전장 전체로 물러나 잠깐 숨을 고른다. 반환: 닫는 시각
  function finale(end, sp, st, a, d, res, attSide, defSide) {
    const sideOf = (u) => (u === a ? attSide : defSide);
    // 접전이 다 끝난 뒤의 체력 (st 는 시각표가 돌며 깎이므로 결과에서 미리 계산)
    const hpEnd = (u) => st[u.uid].hp - (u === a ? res.aH : res.dH), thpEnd = (u) => st[u.uid].thp - (u === a ? res.aT : res.dT);
    const lost = [a, d].filter((u) => hpEnd(u) <= 0.5);
    const wiped = [a, d].filter((u) => hpEnd(u) > 0.5 && u.troop && figN(u, st[u.uid].thp) > 0 && figN(u, Math.max(0, thpEnd(u))) <= 0); // 화면의 병사 수로
    const t1 = end - 0.32 / sp;
    FIGHT.lastEnd = { lost: lost.map((u) => u.name), wiped: wiped.map((u) => u.name), hp: [a, d].map(hpEnd), thp: [a, d].map(thpEnd), t1 }; // 시험용
    if (lost.length || wiped.length) {
      const u = lost[0] || wiped[0], side = sideOf(u), hs = actors.filter((f) => f.hero), x = split ? 0 : hs.reduce((m, f) => m + f.x, 0) / Math.max(1, hs.length) + (side === 'L' ? -1 : 1) * 0.6; // 두 지휘관 사이 (진 쪽으로 조금)
      tl.push({ t: t1, fn: () => { timeK = 0.4; if (!split) { tween(CAM, 'z', CAM.z, 1.12, T, T + 0.35); tween(CAM, 'x', CAM.x, x, T, T + 0.35); tween(CAM, 'y', CAM.y, -0.3, T, T + 0.35); } shake(0.22, 0.35); } });
      tl.push({ t: t1 + 0.24 / sp, fn: () => {
        timeK = 1; banner(side, lost.length ? (u.side === 'e' ? '격파' : '퇴각') : '병사 전멸', u.side === 'e');
        actors.filter((f) => f.alive && f.side !== side).forEach((f, i) => { // 이긴 쪽은 펄쩍 뛰며 무기를 든다
          const q = f.rig.g.position, y0 = q.y, t = T + 0.05 + (i % 4) * 0.05;
          tween(q, 'y', y0, y0 + 0.3, t, t + 0.14); tween(q, 'y', y0 + 0.3, y0, t + 0.14, t + 0.3);
          later(t, () => f.alive && f.rig.once('atk', 1.2));
        });
        later(T + 0.45, () => retreat(sp)); // 환호 뒤 제자리로
      } });
      return t1 + 1.4 / sp; // 결판 글자 → 환호 → 복귀까지
    }
    tl.push({ t: t1 + 0.15 / sp, fn: () => {
      if (!split) { tween(CAM, 'z', CAM.z, 1.06, T, T + 0.5 / sp); tween(CAM, 'x', CAM.x, 0, T, T + 0.5 / sp); tween(CAM, 'y', CAM.y, 0, T, T + 0.5 / sp); }
      retreat(sp);
    } });
    return t1 + 1.15 / sp;
  }
  // 복귀 (랑그릿사 전통): 접전이 끝나면 살아남은 병사와 지휘관이 제 대열 자리로 돌아간다
  function retreat(sp) {
    for (const f of actors) {
      if (!f.alive || f.home == null || Math.abs(f.rig.g.position.x - f.home) < 0.1) continue;
      const p = f.rig.g.position;
      f.rig.loop('move', 1.3);
      tween(p, 'x', p.x, f.home, T, T + 0.45 / sp); f.x = f.home;
      later(T + 0.47 / sp, () => f.alive && f.rig.loop('idle'));
    }
  }
  // 결판 글자: 원작 노란 띠 위 큰 글자
  function banner(side, text, good) {
    const e = document.createElement('div');
    el().querySelectorAll('.fnums > :not(.lopassive)').forEach((x) => x.remove()); // 결판 글자만 또렷하게
    e.className = 'fresult ' + side + (good ? ' good' : ' bad');
    e.innerHTML = `<b>${text}</b>`;
    el().querySelector('.fnums').appendChild(e);
  }

  // 병과별 싸우는 모습 (랑그릿사): 소총병·해병·변이체는 달려들고(rush), 중장병은 대열로 밀고 나가 찌르며(wall),
  // 기동병은 깊숙이 돌격해 들이받고(lance), 공중병은 떠올라 내리꽂으며(swoop), 침투병은 사라졌다 적 코앞에 나타난다(blink).
  // 사격병·전자전병·의무병은 뒤에 남아 쏘거나 주문을 건다(stay)
  const STYLE = { inf: 'rush', water: 'rush', demon: 'rush', pike: 'wall', cav: 'lance', fly: 'swoop', assassin: 'blink', arch: 'stay', mage: 'stay', priest: 'stay' };
  const styleOf = (f) => STYLE[f.hero ? f.u.kind : f.u.troop && f.u.troop.kind] || 'rush'; // 지휘관은 지휘관 자신의 병종대로
  // 접전마다 병과에 맞는 한 동작: 찌르기·들이받기·내리꽂기 / 뒤에서 쏘는 병과는 제 손으로 탄·주문을 날린다
  function strike(f, to, au, sp) {
    const sty = styleOf(f), p = f.rig.g.position, dir = f.side === 'L' ? 1 : -1, x = f.x;
    const out = (d, a, b) => { tween(p, 'x', x, x + d * dir, T, T + a / sp); tween(p, 'x', x + d * dir, x, T + a / sp, T + b / sp); };
    if (f.hero ? ['rush', 'wall', 'lance'].includes(sty) : isMelee(f)) { out(sty === 'lance' ? 0.45 : 0.3, 0.08, 0.3); return; } // 맞붙은 자리에서 찌르듯 한 걸음
    if (sty === 'swoop') { out(0.25, 0.12, 0.4); tween(f, 'air', f.air, 0.3, T, T + 0.12 / sp); tween(f, 'air', 0.3, 1.5, T + 0.14 / sp, T + 0.42 / sp); }
    else if (sty === 'stay' && !f.hero && f.u.troop.kind !== 'priest') {
      const tg = to.filter((o) => o.alive);
      if (!tg.length) return;
      const d = tg[Math.floor(Math.random() * tg.length)], q = d.rig.g.position;
      const x1 = q.x + (Math.random() - 0.5) * 0.3, y1 = q.y + lift(d) + (d.hero ? 0.8 : 0.45);
      if (f.u.troop.kind === 'mage') fx('hit_energy', x1, y1, { k: 0.55, tint: 0xd6a8ff, renderOrder: 515 }); // 전자전: 적 몸에서 번쩍
      else tracer(p.x + dir * 0.42, p.y + lift(f) + 0.62, x1, y1, au.side === 'e', 0.16, f.u.troop.def.sfx === 'missile');
    }
  }

  // 몸으로 맞붙는 병사: 근접 무기이거나, 돌격(기동)·밀고 나가는(중장) 병과
  const isMelee = (f) => { const tr = f.u.troop; return !!tr && (['lance', 'wall'].includes(STYLE[tr.kind]) || WEAPON[tr.def.sfx] === 'melee'); };
  const isRanged = (src, au) => { const kind = src.hero ? au.kind : au.troop && au.troop.kind; return au.rng > 1 || kind === 'arch'; };

  // 쓰러질 때 (랑그릿사식): 한 번 하얗게 번쩍인 뒤 맞은 반대쪽으로 튕겨 날아가며 뒤로 넘어가고, 어두워지며 옅어져 사라진다
  const DIE_KNOCK = 0.42, DIE_END = 0.95; // 날아가는 시간, 사라질 때까지
  function die(f) {
    if (!f || !f.alive) return;
    f.alive = false;
    { const p = f.rig.g.position; // 원작 효과: 철충은 폭발, 바이오로이드는 쓰러지는 먼지
      if (f.u.side === 'e') fx(f.hero && f.u.def.big ? 'explosion_big' : 'explosion_small', p.x, p.y + lift(f) + (f.hero ? 0.9 : 0.5), { k: f.hero ? 1 : 0.55, renderOrder: 540 });
      else fx('dust_fall', p.x, p.y + 0.15, { k: f.hero ? 1 : 0.8, renderOrder: 95 }); }
    if (f.shadow) f.shadow.visible = false;
    if (f.ring) f.ring.visible = false;
    const away = f.side === 'L' ? -1 : 1;
    let k = f.hero ? 0.7 : 1;
    if (PORT()) k *= 0.7; // 세로 화면은 좁아서 덜 밀려난다
    const g = f.rig.g.position;
    const heavy = f.u.def.big || f.hero; // 큰 몸·영웅은 덜 날아간다
    f.fly = { t: 0, x0: g.x, y0: g.y, dx: away * (heavy ? 0.8 : 1.6 + Math.random() * 1.1) * k, hop: (heavy ? 0.3 : 0.7 + Math.random() * 0.45) * k, tilt: -away * (heavy ? 0.5 : 1.0 + Math.random() * 0.9) };
    if (f.hero) { hitStop(0.14, true); shake(0.45, 0.4); } // 병사는 멈추지 않는다 (멈춤이 쌓여 늘어지지 않게)
    const lx = g.x + f.fly.dx, ly = g.y; later(T + DIE_KNOCK, () => fx('dust_fall', lx, ly + 0.1, { k: f.hero ? 1.3 : 0.9, renderOrder: 95 })); // 떨어진 자리에 흙먼지
    f.rig.c.speed = 0.25; // 자세는 맞은 순간에서 거의 멈춘다
    f.flashT = null; f.rig.c.setFlash(1);
  }

  // 피해 숫자: 맞은 몸 머리 위에서 크게 튀어나왔다가 위로 떠오르며 사라진다 (화면 좌표로 옮겨 HTML 글자로)
  function toScreen(x, y, side) {
    const W = innerWidth, H = innerHeight;
    let c = cam, x0 = 0, w = W;
    if (split) { const hw = Math.floor(W / 2); c = side === 'L' ? camL : camR; x0 = side === 'L' ? 0 : hw; w = side === 'L' ? hw : W - hw; }
    return [x0 + ((x - c.left) / (c.right - c.left)) * w, ((c.top - y) / (c.top - c.bottom)) * H];
  }
  // 원작 피해 숫자 글꼴: 적이 맞으면 노랑, 아군이 맞으면 주황, 상성 우위로 친 영웅 피해는 빨강(강한 일격)
  function dmgNum(f, n, kind) {
    const p = f.rig.g.position, [sx, sy] = toScreen(p.x + (Math.random() - 0.5) * 0.3, p.y + lift(f) + (f.hero ? 2.3 : 1.4) + Math.random() * 0.3, f.side);
    const px = (f.hero ? 58 : 40) * Math.min(1.4, Math.max(0.75, innerHeight / 800));
    LOHUD.float(LOHUD.num(Math.max(1, n), kind, kind === 'cri' ? px * 1.2 : px), sx, sy, kind === 'cri' ? 'big' : '', el().querySelector('.fnums'), 750);
  }
  // 원작 글자 그림(반격 등)·재능 발동 판을 그 편 영웅 머리 위에
  function wordOver(list, k) {
    const h = list.find((f) => f.hero && f.alive);
    if (!h) return;
    const p = h.rig.g.position, [sx, sy] = toScreen(p.x, p.y + lift(h) + 2.9, h.side);
    LOHUD.float(LOHUD.word(k, 40 * Math.min(1.3, Math.max(0.8, innerHeight / 800))), sx, sy, 'big', el().querySelector('.fnums'), 1100);
  }
  function passivePlate(side, name, i = 0) {
    const e = document.createElement('div');
    e.className = 'lopassive ' + side;
    e.style.marginTop = i * 52 + 'px'; // 둘째 판은 아래에
    e.innerHTML = `<small>재능 발동</small><b>${name}</b>`;
    el().querySelector('.fnums').appendChild(e);
    setTimeout(() => e.remove(), 1700);
  }

  // 분할 화면을 건너는 탄: 쏜 쪽 화면 끝으로 사라졌다가 맞는 쪽 화면에서 날아든다
  function bolt(src, to, au) {
    const tex = window.KIT.tex('fx_spark');
    const s = src.rig.g.position, dir = src.side === 'L' ? 1 : -1;
    const targets = to.filter((f) => f.alive);
    const tf = targets[Math.floor(Math.random() * targets.length)] || to[0], d = tf.rig.g.position;
    const x0 = s.x + dir * 0.4, y0 = s.y + lift(src) + (src.hero ? 1.2 : 0.7), x1 = d.x + (Math.random() - 0.5) * 0.4, y1 = d.y + lift(tf) + 0.5 + Math.random() * 0.4;
    if (window.FXLIB) { tracer(x0, y0, x1, y1, au.side === 'e', TRAVEL * (0.9 + Math.random() * 0.2), (src.hero ? au.def.sfx : au.troop && au.troop.def.sfx) === 'missile'); return; }
    const col = au.side === 'p' ? 0x9fd8ff : 0xff9a7a;
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: col, transparent: true, depthTest: false, blending: THREE.AdditiveBlending }));
    m.renderOrder = 520;
    m.scale.set(0.6, 0.6, 1);
    m.position.set(x0, y0, 1);
    scene.add(m);
    fxs.push({ m, t: 0, life: TRAVEL * (0.9 + Math.random() * 0.2), path: [x0, y0, x1, y1] });
  }

  // 맞는 효과: 번쩍임 + 불꽃. 붙어서 쏘는 원거리는 빛줄기. 소리는 접전마다 한 번(snd)
  function hitFx(src, dst, au, far, snd, crit) {
    const K = window.KIT;
    if (!dst || !dst.alive) return;
    const p = dst.rig.g.position, up = lift(dst);
    const h = dst.hero ? 1.3 : 0.7;
    const ranged = isRanged(src, au);
    const w = weaponOf(src, au);
    if (ranged && !far && src.alive) {
      const s = src.rig.g.position, sx = s.x + (src.side === 'L' ? 0.4 : -0.4), sy = s.y + lift(src) + (src.hero ? 1.2 : 0.7);
      if (window.FXLIB && w !== 'energy') { const mis = (src.hero ? au.def.sfx : au.troop && au.troop.def.sfx) === 'missile'; tracer(sx, sy, p.x, p.y + up + h * 0.6, au.side === 'e', mis ? 0.22 : 0.12, mis); }
      else beam(sx, sy, p.x, p.y + up + h * 0.6, au.side === 'p' ? 0x9fd8ff : 0xff9a7a);
    }
    const hx = p.x + (Math.random() - 0.5) * 0.4, hy = p.y + up + h * (0.4 + Math.random() * 0.5);
    if (window.FXLIB) { // 원작 타격 효과 (무기 갈래별) + 상성 우위로 영웅을 친 강한 일격
      fx(HIT_FX[w], hx, hy, { k: (dst.hero ? 0.85 : 0.45) * (w === 'heavy' ? 0.75 : 1), flipX: dst.side === 'L', rotation: (Math.random() - 0.5) * 0.5 });
      if (w === 'melee' && Math.random() < 0.5) fx('slash_line', hx, hy, { k: dst.hero ? 1 : 0.7, rotation: (Math.random() - 0.5) * 1.2 });
      if (crit) fx('hit_crit', hx, hy + 0.1, { k: 1.1, renderOrder: 530 });
    } else spark(hx, hy, ranged);
    dst.flashT = T; // 맞으면 하얗게 번쩍 (랑그릿사처럼)
    if (dst.alive) { dst.kb = (dst.hero ? 0.2 : 0.3) * (crit ? 1.7 : 1); dst.kbT = T; } // 맞은 반대쪽으로 확 밀린다
    if (snd) K.AU.play(far ? 'expS' : src.hero ? au.def.sfx : (au.troop ? au.troop.def.sfx : au.def.sfx), far ? 0.35 : 0.6);
  }
  function spark(x, y, ranged) {
    const tex = window.KIT.tex(ranged ? 'fx_spark' : 'fx_firehit');
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, blending: THREE.AdditiveBlending }));
    m.position.set(x, y, 1);
    m.renderOrder = 500;
    m.scale.set(0.9, 0.9, 1);
    scene.add(m);
    fxs.push({ m, t: 0, life: 0.35, grow: 1.8 });
  }
  function beam(x0, y0, x1, y1, color) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.06), new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false, blending: THREE.AdditiveBlending }));
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 1);
    m.rotation.z = Math.atan2(y1 - y0, x1 - x0);
    m.scale.x = len;
    m.renderOrder = 499;
    scene.add(m);
    fxs.push({ m, t: 0, life: 0.15, beam: true });
  }
  function tween(obj, key, a, b, t0, t1, set) { tweens.push({ obj, key, a, b, t0, t1, set }); }

  // ── 원작 효과 (js/fx.js, 유니티에서 구운 원작 효과 플립북) ──
  // 무기 갈래: 그 몸의 공격 소리로 나눈다 (총·기관총·중화기·에너지·근접)
  const WEAPON = { rifle: 'gun', gun: 'gun', mg: 'mg', cannon: 'heavy', missile: 'heavy', expM: 'heavy', expB: 'heavy', laserBig: 'energy', elec: 'energy',
    energy: 'energy', charge: 'energy', spray: 'energy', slash: 'melee', swing: 'melee' };
  const weaponOf = (src, au) => WEAPON[src.hero ? au.def.sfx : (au.troop ? au.troop.def.sfx : au.def.sfx)] || 'gun';
  const HIT_FX = { gun: 'hit_bullet', mg: 'hit_bullet', heavy: 'hit_heavy', energy: 'hit_energy', melee: 'hit_slash' };
  const MUZZLE_FX = { gun: 'muzzle_rifle', mg: 'muzzle_small', heavy: 'muzzle_heavy', energy: 'muzzle_small' };
  // 효과마다 장면에서의 낱장 세로 (병사 키 1.5 기준으로 눈대중)
  const FXH = { hit_bullet: 1.5, hit_crit: 2.4, hit_heavy: 3.2, hit_slash: 2.4, slash_line: 2.2, hit_energy: 2.6, explosion_small: 2.6, explosion_big: 5.2,
    muzzle_rifle: 1.2, muzzle_heavy: 1.5, muzzle_small: 0.9, dust_fall: 1.8, dust_step: 1.5, bullet: 0.09, bullet_bug: 0.5, missile: 0.75 };
  let fxhs = [];
  function fx(name, x, y, o = {}) {
    if (!window.FXLIB || !window.FXDATA || !FXDATA[name]) return null;
    const h = FXLIB.spawn(scene, name, Object.assign({ x, y, z: 1, height: (FXH[name] || 2) * (o.k || 1), renderOrder: 510 }, o));
    if (h) fxhs.push(h);
    return h;
  }
  // 총구 번쩍임: 몸 앞쪽 총구 높이
  function muzzle(f, au) {
    const w = weaponOf(f, au);
    if (w === 'melee' || !f.alive) return;
    const p = f.rig.g.position, dir = f.side === 'L' ? 1 : -1;
    fx(MUZZLE_FX[w], p.x + dir * (f.hero ? 0.6 : 0.42), p.y + lift(f) + (f.hero ? 1.0 : 0.62), { flipX: dir < 0, k: f.hero ? 0.75 : 0.4, tint: w === 'energy' ? 0x9fd8ff : 0xffffff, renderOrder: 515 });
  }
  // 날아가는 탄 (예광탄): 원작 탄 효과를 반복 재생하며 x0,y0 에서 x1,y1 로 옮긴다
  function tracer(x0, y0, x1, y1, bug, life, missile) {
    const name = missile ? 'missile' : bug ? 'bullet_bug' : 'bullet'; // 미사일 무기는 원작 미사일
    const h = fx(name, x0, y0, { loop: true, life: life + 0.1, rotation: Math.atan2(y1 - y0, x1 - x0), renderOrder: 520, tint: bug || missile ? 0xffffff : 0xffe2a0, k: missile ? 1 : 1 });
    if (h) { if (!bug && !missile) h.mesh.scale.x *= 1.6; fxs.push({ fxh: h, t: 0, life, path: [x0, y0, x1, y1] }); }
  }

  function finish() {
    if (!active) return;
    active = false;
    for (const f of actors) { scene.remove(f.rig.g); f.rig.dispose(); }
    for (const x of fxs) { if (x.fxh) continue; scene.remove(x.m); x.m.material.dispose(); if (x.beam) x.m.geometry.dispose(); }
    for (const h of fxhs) h.stop();
    fxhs = [];
    actors = []; fxs = []; tl = []; tweens.length = 0;
    el().querySelector('.fnums').innerHTML = '';
    split = false; timeK = 1; stopT = 0; CAM.z = 1; CAM.x = CAM.y = 0; CAM.sh = 0; applyCam();
    el().classList.remove('split');
    el().classList.add('hidden');
    const cb = done; done = null;
    if (cb) cb();
  }
  FIGHT.skip = finish;
  FIGHT.actors = () => actors; // 시험용
  FIGHT.now = () => T; // 시험용: 전투 장면 안의 시각

  FIGHT.update = function (dt) {
    if (!active) return;
    if (CAM.sh > 0) CAM.sh = Math.max(0, CAM.sh - dt);
    if (stopT > 0) { stopT -= dt; applyCam(); return; } // 타격 멈춤: 장면이 한순간 굳는다
    dt *= timeK;
    T += dt;
    while (tl.length && tl[0].t <= T) { const e = tl.shift(); e.fn(); if (!active) return; }
    for (let i = tweens.length - 1; i >= 0; i--) {
      const w = tweens[i];
      if (T < w.t0) continue;
      const k = Math.min(1, (T - w.t0) / Math.max(1e-3, w.t1 - w.t0));
      const v = w.a + (w.b - w.a) * k * (2 - k);
      if (w.set) w.set(v); else w.obj[w.key] = v;
      if (k >= 1) tweens.splice(i, 1);
    }
    applyCam();
    for (const f of actors) {
      f.rig.update(dt);
      if (f.air && f.alive) f.rig.c.root.position.y = f.by0 + lift(f);
      if (f.kb) { // 0.05초에 확 밀리고 0.3초에 걸쳐 제자리로
        const e = T - f.kbT, k = e / 0.32, v = e < 0.05 ? Math.sin((e / 0.05) * Math.PI / 2) : Math.pow(Math.max(0, 1 - (e - 0.05) / 0.27), 2);
        f.rig.c.root.position.x = f.bx0 + (f.side === 'L' ? -1 : 1) * f.kb * (k >= 1 ? 0 : v); if (k >= 1) f.kb = 0;
      }
      if (f.flashT != null) { const k = (T - f.flashT) / 0.09; f.rig.c.setFlash(k >= 1 ? 0 : 0.42 * (k < 0.3 ? 1 : (1 - k) / 0.7)); if (k >= 1) f.flashT = null; } // 하얗게 다 덮지 않고 밝게만
      if (f.fly) { // 튕겨 밀려나기 → 하얗게 깜빡이며 옅어지다 사라짐
        const q = f.fly, g = f.rig.g;
        q.t += dt;
        const a = Math.min(1, q.t / DIE_KNOCK), e = 1 - (1 - a) * (1 - a); // 처음에 세게, 끝에 멈추듯
        g.position.x = q.x0 + q.dx * e;
        g.position.y = q.y0 + q.hop * Math.sin(Math.PI * a);
        g.rotation.z = q.tilt * e;
        f.rig.c.setFlash(0.7 * Math.max(0, 1 - q.t / 0.1)); // 맞은 순간 한 번만 번쩍
        const dk = Math.min(1, q.t / DIE_KNOCK); f.rig.c.setTint(1 - 0.55 * dk, 1 - 0.58 * dk, 1 - 0.5 * dk); // 어두워진다
        f.rig.c.setOpacity(q.t < DIE_KNOCK ? 1 : Math.max(0, 1 - (q.t - DIE_KNOCK) / (DIE_END - DIE_KNOCK)));
        if (q.t >= DIE_END) { g.visible = false; f.fly = null; }
      }
    }
    for (let i = fxs.length - 1; i >= 0; i--) {
      const x = fxs[i];
      x.t += dt;
      const k = x.t / x.life;
      if (k >= 1) { if (x.fxh) x.fxh.stop(); else { scene.remove(x.m); x.m.material.dispose(); if (x.beam) x.m.geometry.dispose(); } fxs.splice(i, 1); continue; }
      if (x.fxh) { // 원작 탄 효과를 옮긴다
        const [x0, y0, x1, y1] = x.path;
        x.fxh.group.position.set(x0 + (x1 - x0) * Math.min(1, k), y0 + (y1 - y0) * Math.min(1, k), 1);
        continue;
      }
      if (x.path) { // 날아가는 탄 (살짝 포물선)
        const [x0, y0, x1, y1] = x.path;
        x.m.position.set(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k + Math.sin(k * Math.PI) * 0.6, 1);
        continue;
      }
      x.m.material.opacity = 1 - k;
      if (x.grow) x.m.scale.setScalar(0.9 + k * x.grow);
    }
  };

  window.FIGHT = FIGHT;
})();
