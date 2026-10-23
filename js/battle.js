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
    const w = (f.hero ? 1.0 : 0.75) * (f.air ? 0.8 : 1);
    m.scale.set(w, w * 0.6, 1);
    m.position.set(0, 0.02, 0);
    m.renderOrder = 5; // 배경 위, 모든 유닛 아래
    f.rig.g.add(m);
    f.shadow = m;
    if (f.hero) { // 영웅 발밑: 편 색 고리 (병사 속에서도 지휘관이 한눈에)
      const r = new THREE.Mesh(shadowGeo, ringMat(f.side));
      r.scale.set(1.3, 1.3 * 0.6, 1); r.position.set(0, 0.03, 0); r.renderOrder = 6;
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
  const EDGE = () => (PORT() ? Math.min(2.6, VW * 0.19) : Math.min(1.5, VW * 0.1)); // 지휘관은 화면 끝 가까이 (대열 뒤)
  const PORT = () => VW < VH; // 세로 화면
  // 세로 화면은 폭이 좁아 진형을 촘촘히: 앞줄 0.75, 열 간격 0.4, 영웅은 맨 뒷열 바로 뒤 (화면 안)
  const heroX = (dir) => dir * (PORT() ? Math.min(VW / 2 - 0.6, 0.75 + 3 * 0.4 + 1.0) : VW / 2 - EDGE());
  function soldierSlots(n, side, wide = 1) {
    const dir = side === 'L' ? -1 : 1;
    const front = PORT() ? 0.75 : Math.min(2.6, VW * 0.175), back = VW / 2 - EDGE() - 0.9; // 두 대열은 화면 양쪽에서 시작: 가운데까지 길게 돌격한다
    const span = PORT() ? 0.4 : Math.min(0.95 * wide, Math.max(0.5, (back - front) / 3.2));
    const out = [];
    // 원작(랑그릿사 2 피시판) 진형: 앞·가운데·뒤 3열에 3·4·3명. 가운데 열은 깊이 0·14·28·42, 앞뒤 열은 7·21·35 (열 간격 24, 깊이 7 단위)
    const COLS = [[7, 21, 35], [0, 14, 28, 42], [7, 21, 35]];
    const SLOT = COLS.flatMap((ds, c) => ds.map((dp) => [c, dp]));
    for (let i = 0; i < n; i++) {
      if (PORT()) {
        const row = i % 3, col = Math.floor(i / 3);
        out.push([dir * (front + col * span + (row === 1 ? span * 0.45 : 0)), GROUND - 0.3 + row * 0.45, row]);
        continue;
      }
      const [c, dp] = SLOT[i % SLOT.length], jx = (Math.random() - 0.5) * 0.08;
      out.push([dir * (front + c * 0.62 * wide + (Math.floor(i / SLOT.length) * 0.3) + jx), GROUND - 0.55 + (dp / 42) * 0.95, dp / 14]);
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
      T = 0; tl = []; actors = []; fxs = []; tweens.length = 0; SIM = null;
      timeK = 1; stopT = 0; CAM.sh = 0; stopLeft = 0.4; numStack.L = numStack.R = 0;
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
      K.AU.play('lo_whoosh', 0.45); // 전투 장면으로 넘어가는 바람 소리
      if (a.side === 'p') K.AU.voice(a.key + '_BattleFocus', 0.85); // 먼저 치는 우리 영웅의 원작 전투 음성
      else if (d.side === 'p') K.AU.voice(d.key + '_BattleFocus', 0.85); // 적이 먼저 치면 막는 우리 영웅의 원작 전투 음성

      const mk = (u, side) => {
        const dir = side === 'L' ? -1 : 1;
        const f = side === 'L' ? 1 : -1;
        const list = [];
        const native = u.side === 'p' ? 1 : -1;
        const hh = (u.def.big ? 2.3 : 1.65) * (u.def.sizeK || 1); // 지휘관은 병사(1.1)보다 조금 크게 (움짤처럼)
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
        soldierSlots(figN(u, st[u.uid].thp), side, u.side === 'e' ? 1.15 : 1).forEach(([x0, y, row], i) => {
          const x = x0 + dir * off;
          const r = new K.Rig(u.troop.rig, 1.1 * (0.95 + Math.random() * 0.1), native); // 작은 병사, 키도 조금씩 다르게
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

      // 등장 (원작): 공격하는 부대만 화면 밖에서 걸어 들어오고 (120px 를 8px/프레임), 방어하는 부대는 처음부터 제자리에 서 있다
      const enter = 0.4 / sp;
      for (const f of actors) {
        if (att.includes(f)) tween(f.rig.g.position, 'x', f.rig.g.position.x, f.x, 0, enter);
        else { f.rig.g.position.x = f.x; f.rig.loop('idle'); }
      }
      tl.push({ t: enter, fn: () => actors.forEach((f) => f.rig.loop('idle')) });
      if (!split) {
        const ax = (attSide === 'L' ? -1 : 1) * VW * 0.2;
        CAM.z = 1.06; CAM.x = 0; CAM.y = 0; applyCam(); // 카메라는 끝까지 고정 (랑그릿사 모바일)
      } else { CAM.z = 1; CAM.x = CAM.y = 0; applyCam(); }
      let t0 = enter + 0.12 / sp;
      // 근접: 원작 전투 코드 그대로 프레임마다 움직이는 상태 기계 (simStart). 원거리(화면 둘로 나눔)는 시각표(brawl)
      // 재능 발동 판 (원작 패시브 표시): 이번 교전에 효과가 있는 재능만
      const sa = { hp: a.hp, thp: a.troop ? a.troop.hp : 0 }, sd0 = { hp: d.hp, thp: d.troop ? d.troop.hp : 0 };
      const frontD = d.troop && sd0.thp > 0 ? 'T' : 'H', frontA = a.troop && sa.thp > 0 ? 'T' : 'H';
      const namesA = RULES.activeTraits(a, d, true, res.dist, sa, sd0, frontD);
      const namesD = [...RULES.guardTraits(d, frontD), ...(res.counter ? RULES.activeTraits(d, a, false, res.dist, sd0, sa, frontA) : [])];
      if (res.counter && res.dist > d.rng) namesD.push(...RULES.traits(d).filter((t) => t.rangeCounter).map((t) => t.name));
      [...new Set(namesA)].slice(0, 2).forEach((n, i) => tl.push({ t: enter * 0.6 + i * 0.25, fn: () => passivePlate(attSide, n, i) }));
      [...new Set(namesD)].slice(0, 2).forEach((n, i) => tl.push({ t: enter * 0.6 + 0.15 + i * 0.25, fn: () => passivePlate(defSide, n, i) }));
      if (split) {
        const end = brawl(att, def, attSide, defSide, a, d, res, t0, sp, st);
        const close = finale(end, sp, st, a, d, res, attSide, defSide);
        tl.push({ t: close, fn: () => ui.classList.add('fout') }); // 어둡게 닫는다 (css)
        tl.push({ t: close + 0.28, fn: () => finish() });
      } else simStart(att, def, attSide, defSide, a, d, res, t0, sp, st);
      tl.sort((p, q) => p.t - q.t);
    });
  };

  // ── 근접 전투: 원작(랑그릿사 2 피시판) 전투 코드를 옮긴 상태 기계 ──
  // 병사·지휘관 하나하나가 프레임마다 제 상태대로 움직인다 (원작 1프레임 = FR 초, 거리 1px = PX).
  //  · 보병(소총병·중장병·침투병): 4프레임마다 1px씩 빨라져 3px/프레임까지 걷는다. 가장 가까운 적 하나를 골라(같은 줄 먼저)
  //    그 앞 가장자리에서 멈추고, 둘이 21프레임 동안 밀치락달치락하다 같은 순간에 서로 한 번씩 친다. 공격 횟수가 남으면 다음 적에게,
  //    다 쓰면 20프레임 숨을 고르고 제자리로 걸어 돌아간다
  //  · 기병(기동병): 2프레임마다 1px씩 빨라져 4px/프레임으로 달려, 적 대열을 꿰뚫고 반대편 화면 끝까지 가며 지나는 적을 하나씩 친다.
  //    끝에 닿으면 곧바로 돌아온다. 달리는 동안은 밀리지 않는다
  //  · 비병(공중병): 적 높이까지 내려와 4px/프레임으로 적 대열을 여러 번 오가며 꿰뚫는다
  //  · 궁병(사격병·전자전병·의무병): 앞으로 나서지 않는다. 병사마다 8프레임씩 어긋나 시작해 24프레임마다 한 발 (지휘관은 16프레임마다).
  //    이미 날아가는 탄이 적은 적을 노린다. 탄은 낮은 포물선으로 34프레임 안에 꽂힌다
  //  · 땅 위 근접 병종이 날아 있는 적을 만나면 제자리에서 던진다 (원작의 대체 행동)
  //  · 근접 지휘관: 잔상을 끌며 매 프레임 1px씩 빨라져 5px/프레임으로 적 대열을 한 번 꿰뚫고 돌아와 11프레임 숨을 고른다
  //  · 마법 지휘관(전자전·의무): 제자리에서 한 번 주문을 건다
  //  · 맞으면 4프레임 동안 5·4·3·3px 밀려난다. 쓰러지면 뒤로 튕겨 떨어진 뒤 깜빡이다 사라진다
  // 피해 합계는 RULES 가 정한 그대로: 편마다 쓰러질 병사 수만큼(지휘관 피해는 2~3번에 나눠) '한 방'을 마련해 두고, 친 순간 하나씩 쓴다.
  // 다 쓰면 그 뒤로 닿는 공격은 막힌다. 시간이 끝났는데 남은 몫은 마지막에 한꺼번에 들어간다
  const FR = 1 / 50, KB = [5, 4, 3, 3]; // 원작 한 프레임을 1/50초로 (원작 그대로면 접전이 늘어진다)
  let SIM = null;
  const kindOf = (f) => (f.hero ? f.u.kind : f.u.troop && f.u.troop.kind);
  function roleOf(f, foeAir) {
    const k = kindOf(f);
    if (f.hero ? f.u.rng > 1 || RANGED_KIND.includes(k) : RANGED_KIND.includes(k)) return f.hero && (k === 'mage' || k === 'priest') ? 'cast' : 'shoot';
    if (k === 'fly') return 'fly';
    if (foeAir) return 'shoot';
    if (k === 'cav') return 'cav';
    return f.hero ? 'dash' : 'foot';
  }
  function simStart(att, def, attSide, defSide, a, d, res, t0, sp, st) {
    const front = PORT() ? 0.75 : Math.min(2.6, VW * 0.175);
    const snap = { [a.uid]: { ...st[a.uid] }, [d.uid]: { ...st[d.uid] } }; // 마무리(finale)는 깎이기 전 체력으로 결과를 미리 셈한다
    const side = (from, to, toSide, au, du, kT, kH, counter) => {
      const S = st[du.uid], dT = res[kT], dH = res[kH];
      const thpEnd = Math.max(0, S.thp - dT), hpEnd = Math.max(0, S.hp - dH);
      const K = du.troop ? figN(du, S.thp) - figN(du, thpEnd) : 0;
      const nT = dT > 0.01 ? Math.max(K, 2) : 0, nH = dH > 0.01 ? (dH >= du.hpMax * 0.4 ? 3 : 2) : 0;
      return { from, to, toSide, au, du, counter, live: !counter || !!res.counter, nT, nH, cT: dT / Math.max(1, nT), cH: dH / Math.max(1, nH), thpEnd, hpEnd, snd: -1 };
    };
    const SA = side(att, def, defSide, a, d, 'dT', 'dH', false), SD = side(def, att, attSide, d, a, 'aT', 'aH', true);
    SIM = { t0, sp, st, res, a, d, attSide, defSide, snap, PX: (2 * front) / 88, lim: VW / 2 / 1.06 - 0.45, n: 0, acc: 0, flying: 0, cap: Math.round(3.6 / FR), all: [...att, ...def], over: false };
    const foeAir = (list) => { const s = list.filter((f) => !f.hero); return !!(s.length ? s[0].air : (list.find((f) => f.hero) || {}).air); };
    for (const S of [SA, SD]) {
      const air = foeAir(S.to);
      S.from.forEach((f, i) => {
        f.S = S; f.dir = f.side === 'L' ? 1 : -1; f.v = 0; f.timer = 0; f.home = f.x; f.homeY = f.rig.g.position.y; f.air0 = f.air;
        f.role = roleOf(f, air);
        const R = f.role, k = f.hero ? 0 : i - 1;
        f.atk = { foot: 2, cav: 1, fly: 2, shoot: f.hero ? 4 : 3, dash: 1, cast: 1 }[R];
        f.wait = { foot: k * 2, cav: k, fly: k * 2, shoot: f.hero ? 0 : k * 8, dash: 4, cast: 0 }[R];
        f.st = S.live ? 'wait' : 'idle';
      });
    }
  }
  const foes = (f) => f.S.to.filter((o) => o.alive);
  const moveTo = (f, x, v) => { const p = f.rig.g.position, dx = x - p.x, s = v * SIM.PX; if (Math.abs(dx) <= s) { p.x = x; return true; } p.x += Math.sign(dx) * s; return false; };
  function pickFoe(f) { // 가장 가까운 적 (같은 줄을 먼저, 병사가 남아 있으면 병사부터). 병사가 다 쓰러졌고 지휘관에게 줄 피해도 없으면 싸움은 끝
    const p = f.rig.g.position, l = foes(f), s = l.filter((o) => !o.hero), pool = s.length ? s : f.S.nH > 0 ? l : [];
    let best = null, bd = 1e9;
    for (const o of pool) { const q = o.rig.g.position, dd = Math.abs(q.x - p.x) + Math.abs(q.y - p.y) * 3; if (dd < bd) { bd = dd; best = o; } }
    return best;
  }
  const W = (f) => (f.hero ? 0.7 : 0.42); // 몸 폭
  // 밀치기가 끝난 뒤: 보병은 다음 적에게(공격 횟수가 남으면) / 쏘는 병종은 다시 쏘던 자리로 / 싸우지 않는 쪽은 그대로 선다
  function resume(x) {
    x.pair = null; x.timer = 0;
    if (!x.S.live) x.st = 'idle';
    else if (x.role === 'foot') x.st = x.atk > 0 ? 'pause' : 'rest';
    else x.st = x.role === 'shoot' || x.role === 'cast' ? x.role : 'done';
    x.rig.loop('idle');
  }
  function goHome(f, v) { f.st = 'home'; f.v = v; f.rig.face(-f.dir); f.rig.loop('move', 1.2); }
  function simStep() {
    const S = SIM, PX = S.PX;
    S.n++;
    for (const f of S.all) {
      if (!f.alive) continue;
      const p = f.rig.g.position;
      if (f.kbF > 0 && f.st !== 'run') { p.x -= f.dir * KB[4 - f.kbF] * PX; f.kbF--; } // 맞고 밀려남
      switch (f.st) {
        case 'wait':
          if (--f.wait > 0) break;
          if (f.role === 'foot') { f.st = 'adv'; f.rig.loop('move', 1.1); moveSnd(f); }
          else if (f.role === 'cav' || f.role === 'fly' || f.role === 'dash') {
            f.st = 'run'; f.goal = f.dir * S.lim; f.hitSet = new Set(); f.rig.loop('move', f.role === 'cav' ? 2.2 : 1.6); moveSnd(f);
            const dur = (Math.abs(f.goal - p.x) / ((f.role === 'dash' ? 5 : 4) * PX)) * FR / S.sp;
            streak(f, T, dur);
            if (f.hero) trail(f, T, dur); // 지휘관 돌진의 잔상
            if (f.role === 'fly') { const lo = Math.max(0, ...foes(f).map((o) => o.air || 0)) + 0.2; tween(f, 'air', f.air, lo, T, T + 0.3 / S.sp); }
          } else { f.st = f.role; f.timer = 0; }
          break;
        case 'adv': { // 보병: 가장 가까운 적 앞 가장자리까지 걷는다
          if (!f.tgt || !f.tgt.alive) f.tgt = pickFoe(f);
          const t = f.tgt;
          if (!t) { f.st = 'rest'; f.timer = 0; f.rig.loop('idle'); break; }
          if (S.n % 4 === 0) f.v = Math.min(3, f.v + 1); else f.v = Math.max(f.v, 1);
          const q = t.rig.g.position, gx = q.x - f.dir * (W(f) + W(t)) / 2;
          const dy = q.y - p.y; p.y += Math.sign(dy) * Math.min(Math.abs(dy), f.v * PX * 0.35);
          if ((gx - p.x) * f.dir <= f.v * PX && Math.abs(q.y - p.y) < 0.2) { // 맞닿았다: 둘이 밀치기
            f.st = 'shove'; f.lead = true; f.timer = 0; f.sx = p.x; f.pair = null; f.rig.loop('idle');
            if (t.st !== 'shove' && t.st !== 'run' && t.st !== 'home') { t.prev = t.st; t.st = 'shove'; t.lead = false; t.timer = 0; t.sx = q.x; t.pair = f; f.pair = t; t.tgt = f; t.rig.loop('idle'); }
          } else moveTo(f, p.x + f.dir * Math.max(0, (gx - p.x) * f.dir), f.v);
          break;
        }
        case 'shove': { // 21프레임 동안 1~2px씩 흔들리며 맞선다 (8프레임마다 방향이 바뀐다)
          f.timer++;
          const sgn = Math.floor(f.timer / 8) % 2 ? 1 : -1;
          p.x = f.sx + sgn * f.dir * (1 + (f.timer % 2)) * PX;
          if (!f.lead) { if (!f.pair || !f.pair.alive || f.pair.st !== 'shove') { p.x = f.sx; resume(f); } break; }
          if (!f.tgt || !f.tgt.alive || Math.abs(f.tgt.rig.g.position.x - f.sx) > 1.2) { p.x = f.sx; f.st = 'pause'; f.timer = 0; if (f.pair && f.pair.st === 'shove') { f.pair.rig.g.position.x = f.pair.sx; resume(f.pair); } f.pair = null; break; }
          if (f.timer < 21) break;
          const b = f.pair; // 같은 순간에 서로 한 번씩 친다
          p.x = f.sx; if (b) b.rig.g.position.x = b.sx;
          f.rig.once('atk', 1.4);
          if (b && b.S.live) b.rig.once('atk', 1.4);
          const t = f.tgt;
          later(T + 0.08 / S.sp, () => { if (f.alive) land(f, t, false); if (b && b.alive && b.S.live && f.alive) land(b, f, false); });
          for (const x of [f, b]) {
            if (!x) continue;
            x.tgt = null;
            if (x.S.live && x.role === 'foot') x.atk--;
            resume(x);
          }
          break;
        }
        case 'pause': if (++f.timer >= 6) { f.st = 'adv'; f.rig.loop('move', 1.1); } break;
        case 'rest': if (++f.timer >= 20) goHome(f, 3); break;
        case 'run': { // 기병·비병·근접 지휘관: 적 대열을 꿰뚫고 화면 끝까지
          if (f.role === 'dash') f.v = Math.min(5, f.v + 1); else if (S.n % 2 === 0 || !f.v) f.v = Math.min(4, f.v + 1);
          const arrived = moveTo(f, f.goal, f.v);
          for (const o of foes(f)) {
            if (f.hitSet.has(o)) continue;
            const q = o.rig.g.position;
            if (Math.abs(q.x - p.x) * 2 <= W(f) + W(o) && (f.role === 'fly' || Math.abs(q.y - p.y) < 0.5)) { f.hitSet.add(o); land(f, o, false); if (S.n % 3 === 0) f.rig.once('atk', 1.8); }
          }
          if (S.n % 12 === 0 && f.role !== 'fly') { fx('dust_step', p.x, p.y + 0.05, { flipX: f.dir < 0, k: f.hero ? 1 : 0.7, renderOrder: 90 }); if (f.hero || f === f.S.from[1]) window.KIT.AU.play(window.KIT.AU.mech(f.u) ? 'lo_walk_r' : 'lo_run', 0.35, 0.9 + Math.random() * 0.2); } // 12프레임마다 말발굽 먼지 + 원작 달리기 소리
          if (!arrived) break;
          if (f.role === 'fly' && --f.atk > 0) { f.goal = -f.goal; f.hitSet = new Set(); f.rig.face(Math.sign(f.goal)); break; } // 비병은 되짚어 다시 꿰뚫는다
          goHome(f, f.role === 'dash' ? 5 : 4);
          break;
        }
        case 'home': {
          const arrived = moveTo(f, f.home, f.v);
          const dy = (f.homeY ?? p.y) - p.y; p.y += Math.sign(dy) * Math.min(Math.abs(dy), f.v * PX * 0.35);
          if (!arrived) break;
          f.rig.face(f.dir); f.rig.loop('idle'); f.x = f.home;
          if (f.role === 'fly') tween(f, 'air', f.air, f.air0, T, T + 0.3 / S.sp);
          f.st = f.role === 'dash' ? 'breath' : 'done'; f.timer = 0;
          break;
        }
        case 'breath': if (++f.timer >= 11) f.st = 'done'; break;
        case 'shoot': { // 제자리 사격: 8프레임째(지휘관 3) 한 발, 24프레임(지휘관 16)마다 다시
          f.timer++;
          const at = f.hero ? 3 : 8, cyc = f.hero ? 16 : 24;
          if (f.timer === 1) f.rig.once('atk', 1.2);
          if (f.timer === at) { const l = foes(f); if (l.length) shot(f, l.slice().sort((x, y) => (x.pend || 0) - (y.pend || 0) || Math.random() - 0.5)[0]); }
          if (f.timer >= cyc) { f.timer = 0; if (--f.atk <= 0) { f.st = 'done'; f.rig.loop('idle'); } else if (f.hero) window.KIT.AU.play('lo_reload', 0.3); } // 다시 쏘기 전 원작 장전 소리
          break;
        }
        case 'cast': { // 마법 지휘관: 한 번 주문을 건다
          f.timer++;
          if (f.timer === 2) { f.rig.once('atk', 1); window.KIT.AU.play('lo_cast', 0.5); window.KIT.AU.play(f.u.def.sfx, 0.5); }
          if (f.timer === 8) foes(f).sort(() => Math.random() - 0.5).slice(0, 4).forEach((o, i) => later(T + i * 0.06 / S.sp, () => { if (o.alive) { const q = o.rig.g.position; fx('hit_energy', q.x, q.y + lift(o) + 0.6, { k: 0.9, tint: 0xd6a8ff, renderOrder: 530 }); land(f, o, true); } }));
          if (f.timer >= 24) f.st = 'done';
          break;
        }
      }
      if (f.st !== 'shove') f.x = p.x;
    }
    const busy = S.all.some((f) => f.alive && f.st !== 'done' && f.st !== 'idle');
    if ((!busy && S.flying <= 0) || S.n >= S.cap) simEnd();
  }
  // 움직이기 시작할 때 한 번 (부대마다): 걷는 보병은 행군, 기병은 달리기, 비병은 제트, 근접 지휘관은 날랜 돌진
  function moveSnd(f) {
    const AU = window.KIT.AU, S = f.S, mech = AU.mech(f.u);
    const name = f.role === 'fly' ? 'lo_fly' : f.role === 'dash' ? 'lo_dash' : f.role === 'cav' ? (mech ? 'lo_walk_rb' : 'lo_run') : mech ? 'lo_walk_r' : 'lo_march';
    if (S.mv && S.mv[name] && T - S.mv[name] < 0.5) return;
    (S.mv || (S.mv = {}))[name] = T;
    AU.play(name, f.role === 'fly' ? 0.4 : 0.5, 0.95 + Math.random() * 0.1);
  }
  // 탄: 쏜 자리에서 노린 적까지 낮은 포물선 (64px 넘게 떨어지면 더 높이), 최대 34프레임
  function shot(f, o) {
    const S = SIM, p = f.rig.g.position, q = o.rig.g.position;
    muzzle(f, f.S.au);
    if (T - (f.S.fire || -1) > 0.07) { f.S.fire = T; window.KIT.AU.play(f.hero ? f.u.def.sfx : f.u.troop ? f.u.troop.def.sfx : f.u.def.sfx, f.hero ? 0.55 : 0.4, 0.94 + Math.random() * 0.12); } // 쏘는 소리 (원작 무기 소리)
    const x0 = p.x + f.dir * 0.42, y0 = p.y + lift(f) + (f.hero ? 1.0 : 0.62), x1 = q.x, y1 = q.y + lift(o) + (o.hero ? 0.8 : 0.45);
    const dpx = Math.abs(x1 - x0) / S.PX, life = (Math.min(34, Math.max(6, dpx / 5)) * FR) / S.sp;
    const w = weaponOf(f, f.S.au);
    if (w === 'energy') beam(x0, y0, x1, y1, f.u.side === 'p' ? 0x9fd8ff : 0xff9a7a);
    else tracer(x0, y0, x1, y1, f.u.side === 'e', life, (f.hero ? f.u.def.sfx : f.u.troop && f.u.troop.def.sfx) === 'missile', (dpx >= 64 ? 20 : 6) * S.PX);
    o.pend = (o.pend || 0) + 1; S.flying++;
    later(T + (w === 'energy' ? 0.05 / S.sp : life), () => { S.flying--; o.pend--; if (o.alive && SIM === S) land(f, o, true); });
  }
  // 한 번 친 것이 닿았다: 효과·소리, 마련해 둔 '한 방'을 쓰고, 살아남았으면 밀려난다
  function land(src, dst, ranged) {
    const S = src.S;
    if (!dst || !dst.alive || !SIM || SIM.over) return;
    if (S.counter && !S.said) { S.said = true; wordOver(S.from, 'counter'); } // 원작 「반격」 글자
    const p = dst.rig.g.position, w = ranged ? weaponOf(src, S.au) : 'melee';
    const hx = p.x + (Math.random() - 0.5) * 0.3, hy = p.y + lift(dst) + (dst.hero ? 1.3 : 0.7) * (0.4 + Math.random() * 0.5);
    if (window.FXLIB) { fx(HIT_FX[w], hx, hy, { k: dst.hero ? 0.85 : 0.45, flipX: dst.side === 'L', rotation: (Math.random() - 0.5) * 0.5 }); if (w === 'melee' && Math.random() < 0.5) fx('slash_line', hx, hy, { k: dst.hero ? 1 : 0.7, rotation: (Math.random() - 0.5) * 1.2 }); }
    else spark(hx, hy, ranged);
    dst.flashT = T;
    if (T - S.snd > 0.09) { // 맞는 소리: 무기 갈래 × 맞은 몸 (철충은 쇳소리). 근접은 휘두르는 소리와 함께
      S.snd = T;
      const AU = window.KIT.AU, sfx = src.hero ? S.au.def.sfx : (S.au.troop ? S.au.troop.def.sfx : S.au.def.sfx), r = 0.92 + Math.random() * 0.16;
      if (ranged) { AU.hit(sfx, AU.mech(S.du), 0.45, r); if (AU.weapon(sfx) === 'heavy') AU.play('expS', 0.35, r); }
      else { AU.play(AU.mech(S.au) ? 'lo_swing_r' : 'lo_swing', 0.45, r); AU.hit(AU.weapon(sfx) === 'sword' ? 'slash' : 'swing', AU.mech(S.du), 0.5, r); }
    }
    spendBlow(S, dst);
    if (dst.alive && dst.st !== 'run') dst.kbF = 4;
  }
  function spendBlow(S, victim) {
    const Sx = SIM.st[S.du.uid];
    let dT = 0, dH = 0;
    const takeT = () => { S.nT--; dT = S.nT <= 0 ? Sx.thp - S.thpEnd : S.cT; }, takeH = () => { S.nH--; dH = S.nH <= 0 ? Sx.hp - S.hpEnd : S.cH; };
    if (victim && victim.hero && S.nH > 0) takeH(); else if (S.nT > 0) takeT(); else if (S.nH > 0) takeH(); else return false;
    Sx.thp = Math.max(0, Sx.thp - dT); Sx.hp = Math.max(0, Sx.hp - dH);
    const heroF = S.to.find((f) => f.hero), adv = S.counter ? SIM.res.rel < 0 : SIM.res.rel > 0;
    const shown = dH > 0 ? heroF : victim && victim.alive && !victim.hero ? victim : S.to.find((f) => !f.hero && f.alive) || heroF;
    if (shown && shown.alive) {
      dmgNum(shown, dT || dH, dH > 0 && adv ? 'cri' : S.du.side === 'p' ? 'me' : 'base');
      if (shown !== victim) { shown.flashT = T; shown.kb = 0.2; shown.kbT = T; }
    }
    const keep = figN(S.du, Sx.thp), alive = () => S.to.filter((f) => !f.hero && f.alive);
    if (alive().length > keep && victim && !victim.hero) die(victim);
    while (alive().length > keep) { const q = (victim || heroF).rig.g.position; die(alive().sort((x, y) => Math.abs(x.rig.g.position.x - q.x) - Math.abs(y.rig.g.position.x - q.x))[0]); }
    setBars(S.toSide, S.du, Sx.thp, Sx.hp);
    if (dH > 0) { shakeBust(S.toSide); shake(adv ? 0.38 : 0.22, 0.28); hitStop(adv ? 0.12 : 0.07); if (adv) window.KIT.AU.play('lo_hit_big', 0.5); } else shake(0.08, 0.14); // 상성 우위로 지휘관을 친 강한 일격: 묵직한 원작 타격음
    if (Sx.hp <= 0.5 && heroF && heroF.alive) die(heroF);
    return true;
  }
  function simEnd() {
    const S = SIM;
    S.over = true;
    for (const side of new Set(S.all.map((f) => f.S))) { // 시간이 끝났는데 남은 몫은 한꺼번에
      let guard = 20;
      while ((side.nT > 0 || side.nH > 0) && guard--) { const l = side.to.filter((f) => f.alive); spendBlow(side, l[Math.floor(Math.random() * l.length)] || null); }
    }
    const close = finale(T + 0.42 / S.sp, S.sp, S.snap, S.a, S.d, S.res, S.attSide, S.defSide);
    later(close, () => el().classList.add('fout'));
    later(close + 0.28, () => finish());
  }

  // 전투 시각표 (랑그릿사의 공격 속도): 접전을 한꺼번에 주고받지 않고, 저마다의 공격 속도대로 친 순간에 피해가 들어간다.
  //  · 궁병·법사(발사 공격)는 시작하자마자 일제 사격 → 화살이 돌격해 오는 적에게 먼저 꽂힌다 (근접 공격을 받은 궁병은 맞은 뒤에야 반격)
  //  · 근접 병사는 닿는 순간부터 친다: 기병이 가장 빨리, 보병·창병은 그다음. 기병 영웅은 제 병사보다 앞서 닿는다
  //  · 전투 시간은 정해져 있다: 시간이 끝나면 (다 잡지 못했어도) 물러난다
  // 피해 합계(res)는 RULES 가 정한 그대로, 공격 한 번 한 번에 무게(병사 무리 2, 지휘관 1)만큼 나눠 순서대로 넣는다
  function brawl(att, def, attSide, defSide, a, d, res, t0, sp, st) {
    const base = split ? t0 : t0 - 0.55 / sp; // 돌격이 시작된 시각
    const END = base + (split ? 1.9 : 1.85) / sp;
    const contactOf = (f) => base + (f.hero ? (styleOf(f) === 'lance' ? 0.32 : 0.62) : styleOf(f) === 'lance' ? 0.46 : 0.62) / sp;
    const sides = [
      { from: att, to: def, toSide: defSide, au: a, du: d, kT: 'dT', kH: 'dH' },
      { from: def, to: att, toSide: attSide, au: d, du: a, kT: 'aT', kH: 'aH', counter: true },
    ];
    // 맞붙은 상대 쪽에서 가장 먼저 닿는 시각 (근접 공격을 받은 궁병은 그 뒤에야 쏜다)
    const firstContact = (list) => { const m = list.filter((f) => meleeHit(f)); return m.length ? Math.min(...m.map(contactOf)) : null; };
    const meleeHit = (f) => !split && (f.hero ? f.u.rng <= 1 && !RANGED_KIND.includes(f.u.kind) : isMelee(f));
    let end = t0;
    for (const s of sides) {
      if (s.counter && !res.counter) continue;
      const T0 = res[s.kT], H0 = res[s.kH];
      if (T0 + H0 <= 0 && s.counter) continue;
      // 이 편의 공격들: [시각, 누가(무리/지휘관), 근접?]
      const ev = [];
      const troops = s.from.filter((f) => !f.hero), hero = s.from.find((f) => f.hero);
      const foeFirst = firstContact(s.to);
      if (troops.length) {
        const m = meleeHit(troops[0]);
        let t = m ? Math.min(...troops.map(contactOf)) : base + 0.05 / sp;
        if (!m && s.counter && foeFirst != null) t = foeFirst + 0.25 / sp; // 근접 공격을 받은 궁병은 다 맞은 뒤에야 반격
        for (; t < END; t += (m ? 0.55 : 0.7) / sp) ev.push({ t, who: 'troop', melee: m, w: 2 });
      }
      if (hero) {
        const m = meleeHit(hero);
        let t = m ? contactOf(hero) : base + 0.15 / sp;
        if (!m && s.counter && foeFirst != null) t = Math.max(t, foeFirst + 0.25 / sp);
        for (; t < END; t += (m ? 0.6 : 0.8) / sp) ev.push({ t, who: 'hero', melee: m, w: 1 });
      }
      ev.sort((p, q) => p.t - q.t);
      const W = ev.reduce((m, e) => m + e.w, 0) || 1;
      ev.forEach((e, i) => {
        const fly = split ? TRAVEL / sp : e.melee ? 0.08 / sp : 0.28 / sp; // 발사 공격은 날아가는 시간
        if (s.counter && i === 0) tl.push({ t: e.t - 0.12 / sp, fn: () => wordOver(s.from, 'counter') }); // 원작 「반격」 글자
        tl.push({ t: e.t, fn: () => {
          const who = e.who === 'hero' ? [hero] : troops;
          if (!e.melee && who.some((f) => f && f.alive)) window.KIT.AU.play(e.who === 'hero' ? s.au.def.sfx : s.au.troop ? s.au.troop.def.sfx : s.au.def.sfx, e.who === 'hero' ? 0.55 : 0.45, 0.94 + Math.random() * 0.12); // 일제 사격 소리 (원작 무기 소리)
          for (const f of who) {
            if (!f || !f.alive) continue;
            const speed = Math.max(1, f.rig.dur('atk') / (f.hero ? 1.6 : 1.1)) * sp * (0.9 + Math.random() * 0.25);
            const go = () => {
              if (!f.alive) return;
              f.rig.once('atk', speed); muzzle(f, s.au);
              if (!split) strike(f, s.to, s.au, sp);
              else if (isRanged(f, s.au) && Math.random() < (f.hero ? 1 : 0.55)) bolt(f, s.to, s.au);
            };
            if (f.hero || !e.melee) go(); else later(T + Math.random() * 0.12 / sp, go); // 근접은 조금씩 어긋나게, 일제 사격은 한꺼번에
          }
        } });
        tl.push({ t: e.t + fly, fn: () => hit(s, T0 * e.w / W, H0 * e.w / W, e.who === 'hero' ? hero : troops.find((f) => f.alive) || hero, res, st) });
        end = Math.max(end, e.t + fly + 0.2 / sp);
      });
    }
    return end;
  }
  // 맞는 순간: 피해를 넣고, 맞은 몸이 번쩍·움찔, 숫자, 쓰러짐, 막대
  function hit(s, dT, dH, src, res, st) {
    const Sx = st[s.du.uid];
    Sx.thp = Math.max(0, Sx.thp - dT); Sx.hp = Math.max(0, Sx.hp - dH);
    const soldiers = s.to.filter((f) => !f.hero && f.alive);
    const heroF = s.to.find((f) => f.hero);
    const pool = soldiers.slice().sort(() => Math.random() - 0.5).slice(0, 4);
    const nS = pool.length;
    if (dH > 0 || !pool.length) pool.push(heroF);
    const adv = s.counter ? res.rel < 0 : res.rel > 0;
    pool.forEach((v, k) => {
      if (!v || !v.alive) return;
      hitFx(src && src.alive ? src : s.from.find((f) => f.alive) || s.from[0], v, s.au, split, k === 0, v.hero && adv);
      const n = v.hero ? (dH > 0 ? dH : dT) : dT / Math.max(1, nS); // 맞은 병사마다 제 몫의 숫자 (움짤처럼 숫자가 겹겹이 쌓인다)
      if (n > 0.05) dmgNum(v, n, v.hero && adv ? 'cri' : s.du.side === 'p' ? 'me' : 'base');
    });
    const keep = figN(s.du, Sx.thp);
    while (s.to.filter((f) => !f.hero && f.alive).length > keep) die(s.to.filter((f) => !f.hero && f.alive).sort((p, q) => Math.abs(p.x) - Math.abs(q.x))[0]);
    setBars(s.toSide, s.du, Sx.thp, Sx.hp);
    if (dH > 0) { shakeBust(s.toSide); shake(0.22, 0.24); hitStop(0.07); } else shake(0.1, 0.16);
    if (dH > 0 && adv) { shake(0.38, 0.32); hitStop(0.12); window.KIT.AU.play('lo_hit_big', 0.5); } // 상성 우위 강한 일격
    if (Sx.hp <= 0.5 && heroF && heroF.alive) die(heroF);
  }

  // 돌진 잔상: 달려드는 동안 몸 뒤로 길게 끌리는 하얀 바람 줄기 (움짤의 돌진처럼), 멈추면 사라진다
  let streakTex = null;
  function streak(f, t0, dur) {
    if (!streakTex) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 64;
      const g = c.getContext('2d');
      const gx = g.createLinearGradient(0, 0, 256, 0); gx.addColorStop(0, 'rgba(255,255,255,0)'); gx.addColorStop(0.75, 'rgba(255,255,255,0.55)'); gx.addColorStop(1, 'rgba(255,255,255,0.9)');
      g.fillStyle = gx;
      for (let i = 0; i < 5; i++) { const y = 10 + i * 11, h = 3 + (i % 2) * 3; g.globalAlpha = 0.5 + 0.5 * Math.random(); g.fillRect(40 * Math.random(), y, 256, h); } // 바람 결 여러 줄
      streakTex = new THREE.CanvasTexture(c);
    }
    const dir = f.side === 'L' ? 1 : -1, s = f.hero ? 1.4 : 1;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2 * s, 0.9 * s), new THREE.MeshBasicMaterial({ map: streakTex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(-dir * 1.0 * s, (f.hero ? 0.9 : 0.55), 0); m.scale.x = dir; m.renderOrder = 95;
    f.rig.g.add(m);
    tween(null, null, 0, 0.8, t0, t0 + dur * 0.3, (v) => { m.material.opacity = v; });
    tween(null, null, 0.8, 0, t0 + dur, t0 + dur + 0.2, (v) => { m.material.opacity = v; });
    later(t0 + dur + 0.25, () => { f.rig.g.remove(m); m.geometry.dispose(); m.material.dispose(); });
  }
  // 기병 영웅 돌격의 파란 기운 잔상 (움짤의 적 기병 영웅처럼): 몸을 감싼 빛이 돌격하는 동안 번졌다가 사라진다
  function trail(f, t0, dur) {
    const tex = window.KIT && KIT.tex('fx_spark');
    if (!tex) return;
    const col = f.side === 'L' ? 0x7fc8ff : 0x9fd8ff;
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: col, transparent: true, opacity: 0, depthTest: false, blending: THREE.AdditiveBlending }));
    m.renderOrder = 189; m.scale.set(3.2, 2.2, 1); m.position.set(-(f.side === 'L' ? 1 : -1) * 0.6, 1.0, 0);
    f.rig.g.add(m);
    tween(null, null, 0, 0.85, t0, t0 + dur * 0.4, (v) => { m.material.opacity = v; });
    tween(null, null, 0.85, 0, t0 + dur, t0 + dur + 0.35, (v) => { m.material.opacity = v; });
    later(t0 + dur + 0.4, () => { f.rig.g.remove(m); m.material.dispose(); });
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
    if (lost.length) {
      const u = lost[0], side = sideOf(u), hs = actors.filter((f) => f.hero), x = split ? 0 : hs.reduce((m, f) => m + f.x, 0) / Math.max(1, hs.length) + (side === 'L' ? -1 : 1) * 0.6; // 두 지휘관 사이 (진 쪽으로 조금)
      tl.push({ t: t1, fn: () => shake(0.22, 0.35) });
      tl.push({ t: t1 + 0.24 / sp, fn: () => {
        banner(side, u.side === 'e' ? '격파' : '퇴각', u.side === 'e');
        const AU = window.KIT.AU; // 결판: 묵직한 일격 소리 + 이긴 우리 영웅의 원작 승리 소리 / 진 우리 영웅의 퇴각 음성
        AU.play('lo_hit_big', 0.6);
        const won = [a, d].find((x) => x.side === 'p' && x !== u && hpEnd(x) > 0.5);
        if (u.side === 'e' && won) later(T + 0.35, () => { const w = AU.unitSfx(won, 'win'); if (w) AU.play(w, 0.6); });
        else if (u.side === 'p') {
          later(T + 0.3, () => AU.voice(u.key + '_Retreat', 0.9));
          const foe = [a, d].find((x) => x.side === 'e' && hpEnd(x) > 0.5), w = foe && AU.unitSfx(foe, 'win'); // 이긴 철충 지휘관의 원작 승리 소리
          if (w) later(T + 0.6, () => AU.cut(AU.play(w, 0.5), 2.5));
        }
        actors.filter((f) => f.alive && f.side !== side).forEach((f, i) => { // 이긴 쪽은 펄쩍 뛰며 무기를 든다
          const q = f.rig.g.position, y0 = q.y, t = T + 0.05 + (i % 4) * 0.05;
          tween(q, 'y', y0, y0 + 0.3, t, t + 0.14); tween(q, 'y', y0 + 0.3, y0, t + 0.14, t + 0.3);
          later(t, () => f.alive && f.rig.once('atk', 1.2));
        });
        later(T + 0.45, () => retreat(sp)); // 환호 뒤 제자리로
      } });
      return t1 + 1.5 / sp; // 결판 글자 → 환호 → 복귀까지
    }
    tl.push({ t: t1 + 0.15 / sp, fn: () => {
      retreat(sp);
    } });
    return t1 + 1.1 / sp;
  }
  // 복귀 (랑그릿사 전통): 접전이 끝나면 살아남은 병사와 지휘관이 제 대열 자리로 돌아간다
  function retreat(sp) {
    for (const f of actors) {
      if (!f.alive || f.home == null || Math.abs(f.rig.g.position.x - f.home) < 0.1) continue;
      const p = f.rig.g.position, face = f.side === 'L' ? 1 : -1, t1 = T + (f.hero ? 0 : Math.random() * 0.22) / sp, d = (0.6 + Math.random() * 0.15) / sp;
      later(t1, () => { if (!f.alive) return; f.rig.loop('move', 1.1); });
      tween(p, 'x', p.x, f.home, t1, t1 + d); f.x = f.home;
      if (f.yHome != null) tween(p, 'y', p.y, f.yHome, t1, t1 + d);
      if (f.air) tween(f, 'air', f.air, f.hero ? 0.85 : 0.6, t1, t1 + d); // 공중병은 원래 높이로
      later(t1 + d, () => { if (f.alive) f.rig.loop('idle'); }); // 제자리에서 다시 적을 본다
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
  // 랑그릿사 규칙: 보병·창병·기병·비병·침투(근접 병종)는 달려 나가 맞붙고, 궁병·법사·승려(원거리 병종)는 제자리에서 쏜다
  const STYLE = { inf: 'rush', water: 'rush', demon: 'rush', pike: 'rush', cav: 'lance', fly: 'swoop', assassin: 'blink', arch: 'stay', mage: 'stay', priest: 'stay' };
  const styleOf = (f) => STYLE[f.hero ? f.u.kind : f.u.troop && f.u.troop.kind] || 'rush'; // 지휘관은 지휘관 자신의 병종대로
  // 접전마다 병과에 맞는 한 동작: 찌르기·들이받기·내리꽂기 / 뒤에서 쏘는 병과는 제 손으로 탄·주문을 날린다
  function strike(f, to, au, sp) {
    const sty = styleOf(f), p = f.rig.g.position, dir = f.side === 'L' ? 1 : -1, x = f.x;
    const out = (d, a, b) => { tween(p, 'x', x, x + d * dir, T, T + a / sp); tween(p, 'x', x + d * dir, x, T + a / sp, T + b / sp); };
    if (f.hero ? f.u.rng <= 1 && !RANGED_KIND.includes(f.u.kind) : isMelee(f)) { out(sty === 'lance' ? 0.55 : 0.42, 0.08, 0.3); return; } // 맞붙은 자리에서 마주 선 적에게 파고들며 친다
    if (sty === 'swoop') { out(0.25, 0.12, 0.4); tween(f, 'air', f.air, 0.3, T, T + 0.12 / sp); tween(f, 'air', 0.3, 1.5, T + 0.14 / sp, T + 0.42 / sp); }
    else if (sty === 'stay' && !f.hero && f.u.troop.kind !== 'priest') {
      const tg = to.filter((o) => o.alive);
      if (!tg.length) return;
      const d = tg[Math.floor(Math.random() * tg.length)], q = d.rig.g.position;
      const x1 = q.x + (Math.random() - 0.5) * 0.3, y1 = q.y + lift(d) + (d.hero ? 0.8 : 0.45);
      if (f.u.troop.kind === 'mage') fx('hit_energy', x1, y1, { k: 0.55, tint: 0xd6a8ff, renderOrder: 515 }); // 전자전: 적 몸에서 번쩍
      else { tracer(p.x + dir * 0.42, p.y + lift(f) + 0.62, x1, y1, au.side === 'e', 0.24, f.u.troop.def.sfx === 'missile'); later(T + 0.24 / sp, () => { if (d.alive) { d.kb = 0.18; d.kbT = T; d.flashT = T; } }); } // 탄이 꽂히면 맞은 병사가 움찔
    }
  }

  // 몸으로 맞붙는 병사: 근접 무기이거나, 돌격(기동)·밀고 나가는(중장) 병과
  const RANGED_KIND = ['arch', 'mage', 'priest'];
  const isMelee = (f) => { const tr = f.u.troop; return !!tr && !RANGED_KIND.includes(tr.kind); }; // 병사: 원거리 병종이 아니면 근접 (무기 모양과 상관없이)
  const isRanged = (src, au) => { const kind = src.hero ? au.kind : au.troop && au.troop.kind; return au.rng > 1 || kind === 'arch'; };

  // 쓰러질 때 (랑그릿사식): 한 번 하얗게 번쩍인 뒤 맞은 반대쪽으로 튕겨 날아가며 뒤로 넘어가고, 어두워지며 옅어져 사라진다
  const DIE_KNOCK = 0.3; // 튕겨 날아갔다 떨어지는 시간 (그 뒤 깜빡이다 사라진다)
  function die(f) {
    if (!f || !f.alive) return;
    f.alive = false;
    { const p = f.rig.g.position; // 원작 효과: 철충은 폭발, 바이오로이드는 쓰러지는 먼지
      if (f.u.side === 'e') fx(f.hero && f.u.def.big ? 'explosion_big' : 'explosion_small', p.x, p.y + lift(f) + (f.hero ? 0.9 : 0.5), { k: f.hero ? 1 : 0.55, renderOrder: 540 });
      else fx('dust_fall', p.x, p.y + 0.15, { k: f.hero ? 1 : 0.8, renderOrder: 95 }); }
    { const AU = window.KIT.AU, r = 0.9 + Math.random() * 0.2; // 쓰러지는 소리: 지휘관은 원작 고유 소리, 병사는 몸에 맞게 (철충은 작은 폭발)
      if (f.hero) { AU.fall(f.u, 0.75); if (f.u.side === 'e') AU.play(f.u.def.big ? 'expB' : 'expM', 0.55); }
      else if (f.u.side === 'e') { AU.play('expS', 0.3, r); AU.play('lo_fall_r', 0.3, r); }
      else AU.play('lo_fall', 0.4, r); }
    if (f.shadow) f.shadow.visible = false;
    if (f.ring) f.ring.visible = false;
    const away = f.side === 'L' ? -1 : 1;
    let k = f.hero ? 0.7 : 1;
    if (PORT()) k *= 0.7; // 세로 화면은 좁아서 덜 밀려난다
    const g = f.rig.g.position;
    const heavy = f.u.def.big || f.hero; // 큰 몸·영웅은 덜 날아간다
    f.fly = { t: 0, x0: g.x, y0: g.y, dx: away * (heavy ? 0.4 : 0.6 + Math.random() * 0.5) * k, hop: (heavy ? 0.3 : 0.55 + Math.random() * 0.25) * k, tilt: -away * (heavy ? 0.35 : 0.5 + Math.random() * 0.2) }; // 뒤쪽 위로 튕겨 날아갔다 떨어진다 (원작은 맞은 자세 그대로, 눕지 않는다)
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
  const numStack = { L: 0, R: 0 }; // 편마다 숫자 기둥의 몇 번째 칸
  function dmgNum(f, n, kind) {
    const k = numStack[f.side]++ % 7; // 새 숫자는 앞 숫자보다 한 칸 위에 (7칸 쌓이면 다시 아래부터)
    const px = (f.hero ? 50 : 36) * Math.min(1.4, Math.max(0.75, innerHeight / 800));
    const p = f.rig.g.position, [sx, sy] = toScreen(p.x + (Math.random() - 0.5) * 0.5, p.y + lift(f) + (f.hero ? 1.8 : 1.15), f.side);
    LOHUD.float(LOHUD.num(Math.max(1, n), kind, kind === 'cri' ? px * 1.2 : px), sx + (Math.random() - 0.5) * px, sy - k * px * 0.55, 'stack' + (kind === 'cri' ? ' big' : ''), el().querySelector('.fnums'), 1300);
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
    if (snd) { const sfx = src.hero ? au.def.sfx : (au.troop ? au.troop.def.sfx : au.def.sfx); if (!far) K.AU.play(sfx, 0.5); K.AU.hit(sfx, K.AU.mech(dst.u), 0.45); }
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
  function tracer(x0, y0, x1, y1, bug, life, missile, arc = 0) {
    const name = missile ? 'missile' : bug ? 'bullet_bug' : 'bullet'; // 미사일 무기는 원작 미사일
    const h = fx(name, x0, y0, { loop: true, life: life + 0.1, rotation: Math.atan2(y1 - y0, x1 - x0), renderOrder: 520, tint: bug || missile ? 0xffffff : 0xffe2a0, k: missile ? 1 : 1 });
    if (h) { if (!bug && !missile) { h.mesh.scale.x *= 3.2; h.mesh.scale.y *= 2.6; } fxs.push({ fxh: h, t: 0, life, path: [x0, y0, x1, y1], arc }); } // 날아가는 탄이 눈에 보이게
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
    split = false; SIM = null; timeK = 1; stopT = 0; CAM.z = 1; CAM.x = CAM.y = 0; CAM.sh = 0; applyCam();
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
    if (SIM && !SIM.over && T >= SIM.t0) { // 근접 전투: 원작 프레임 단위로 한 걸음씩
      SIM.acc += dt;
      const fr = FR / SIM.sp;
      while (SIM && !SIM.over && SIM.acc >= fr) { SIM.acc -= fr; simStep(); }
    }
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
      if (f.blinkT != null) { // 원작: 착지한 뒤 42프레임 깜빡이다 사라진다 (시체는 남지 않는다)
        f.blinkT += dt;
        f.rig.g.visible = Math.floor(f.blinkT / 0.05) % 2 === 0;
        if (f.blinkT >= 42 * FR) { f.rig.g.visible = false; f.blinkT = null; }
      }
      if (f.fly) { // 맞은 반대쪽 위로 튕겨 날아갔다 떨어진다
        const q = f.fly, g = f.rig.g;
        q.t += dt;
        const a = Math.min(1, q.t / DIE_KNOCK), e = 1 - (1 - a) * (1 - a); // 처음에 세게, 끝에 멈추듯
        g.position.x = q.x0 + q.dx * e;
        g.position.y = q.y0 + q.hop * Math.sin(Math.PI * a);
        g.rotation.z = q.tilt * e;
        f.rig.c.setFlash(0.7 * Math.max(0, 1 - q.t / 0.1)); // 맞은 순간 한 번만 번쩍
        const dk = Math.min(1, q.t / DIE_KNOCK); f.rig.c.setTint(1 - 0.45 * dk, 1 - 0.47 * dk, 1 - 0.42 * dk); // 어두워진다
        if (q.t >= DIE_KNOCK) { f.rig.c.speed = 0; f.fly = null; f.blinkT = 0; } // 떨어진 자리에서 깜빡이다 사라진다 (원작)
      }
    }
    for (let i = fxs.length - 1; i >= 0; i--) {
      const x = fxs[i];
      x.t += dt;
      const k = x.t / x.life;
      if (k >= 1) { if (x.fxh) x.fxh.stop(); else { scene.remove(x.m); x.m.material.dispose(); if (x.beam) x.m.geometry.dispose(); } fxs.splice(i, 1); continue; }
      if (x.fxh) { // 원작 탄 효과를 옮긴다
        const [x0, y0, x1, y1] = x.path;
        x.fxh.group.position.set(x0 + (x1 - x0) * Math.min(1, k), y0 + (y1 - y0) * Math.min(1, k) + (x.arc || 0) * Math.sin(Math.min(1, k) * Math.PI), 1);
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
