// 전투 연출 (랑그릿사 모바일식): 영웅은 뒤(바깥쪽), 배속 병사는 영웅 앞(적 쪽)에 늘어선다.
// 양쪽이 동시에 싸운다: RULES.combat 의 접전(rounds)마다 두 부대가 함께 공격하고, 그 접전의 피해가 동시에 들어간다.
// 근접은 두 부대가 함께 돌진해 맞붙고, 원거리(2칸 이상)는 화면을 둘로 나눠 탄이 가운데 경계를 넘어 오간다.
// 쓰러진 병사는 맞은 반대쪽으로 짧게 밀려나며 뒤로 젖혀지고, 하얗게 깜빡이다 사라진다. 아군은 항상 왼쪽, 적은 오른쪽.
// 맞을 때마다 맞은 병사 머리 위에 피해 숫자가 튀어 오르고, 정보판 위 별 모양에 그 편이 받은 피해 합계가 쌓인다.
(function () {
  const FIGHT = {};
  let scene, cam, bgMesh, bgMat;
  let VW = 16, VH = 9;
  const GROUND = -1.6;
  let actors = [], fxs = [], tl = [], T = 0, done = null, active = false;
  const tweens = [];
  const el = () => document.getElementById('fight');
  // 원거리 화면 분할: 두 부대를 GAP 만큼 떼어 놓고 반쪽 화면마다 카메라 하나
  let split = false;
  const GAP = 7, TRAVEL = 0.42; // 떼어 놓는 거리, 탄이 경계를 건너는 시간(초)
  let camL, camR;

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
    const cy = a < 1 ? -0.4 : 0.6; // 세로 화면: 부대가 화면 가운데쯤 오게
    cam.left = -VW / 2; cam.right = VW / 2; cam.top = VH / 2 + cy; cam.bottom = -VH / 2 + cy;
    cam.updateProjectionMatrix();
    fitBg();
  };
  function fitBg() {
    const img = bgMat.map && bgMat.map.image;
    const ia = img ? img.width / img.height : 16 / 9;
    let h = VH * 1.02, w = h * ia;
    if (w < VW * 1.02) { w = VW * 1.02; h = w / ia; }
    bgMesh.scale.set(w, h, 1);
    bgMesh.position.set(0, (cam.top + cam.bottom) / 2 + (h - VH) * 0.12, -5);
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
      const cx = side * (VW / 4 + GAP); // 보통 화면의 그쪽 절반을 GAP 만큼 옮긴 자리
      c.left = cx - VW / 4; c.right = cx + VW / 4; c.top = cam.top; c.bottom = cam.bottom;
      c.updateProjectionMatrix();
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
      gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.setTransform(1, 0, 0, 0.5, 0, 16);
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      shadowGeo = new THREE.PlaneGeometry(1, 0.5);
      shadowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false, depthWrite: false, opacity: 0.55 });
    }
    const m = new THREE.Mesh(shadowGeo, shadowMat);
    const w = (f.hero ? 1.25 : 0.8) * (f.air ? 0.8 : 1);
    m.scale.set(w, w * 0.6, 1);
    m.position.set(0, 0.02, 0);
    m.renderOrder = 5; // 배경 위, 모든 유닛 아래
    f.rig.g.add(m);
    f.shadow = m;
    // 공중병: 리그만 들어 올리고 천천히 오르내린다
    f.by0 = f.rig.c.root.position.y;
    f.bob = Math.random() * Math.PI * 2;
  }
  const isAir = (u, hero) => (hero ? u.kind : u.troop && u.troop.kind) === 'fly';
  const lift = (f) => (f.air ? f.air + Math.sin(T * 3 + f.bob) * 0.07 : 0);
  // 랑그릿사 모바일처럼: 영웅은 맨 뒤(바깥쪽), 병사 무리는 영웅 앞(적 쪽)에 3줄
  // 영웅은 바깥쪽이되, 모서리 인물 그림에 가리지 않게 가장자리에서 조금 들인다
  const EDGE = () => Math.min(1.9, VW * 0.16);
  const PORT = () => VW < VH; // 세로 화면
  // 세로 화면은 폭이 좁아 진형을 촘촘히: 앞줄 0.75, 열 간격 0.4, 영웅은 맨 뒷열 바로 뒤 (화면 안)
  const heroX = (dir) => dir * (PORT() ? Math.min(VW / 2 - 0.6, 0.75 + 3 * 0.4 + 1.0) : VW / 2 - EDGE());
  function soldierSlots(n, side) {
    const dir = side === 'L' ? -1 : 1;
    const front = PORT() ? 0.75 : 1.25, back = VW / 2 - EDGE() - 1.1; // 앞줄은 가운데에서 떨어뜨려 맞붙어도 틈이 남게
    const span = PORT() ? 0.4 : Math.min(0.95, Math.max(0.5, (back - front) / 3.2));
    const out = [];
    for (let i = 0; i < n; i++) {
      const row = i % 3, col = Math.floor(i / 3); // 앞 열부터 채운다
      out.push([dir * (front + col * span + (row === 1 ? span * 0.45 : 0)), GROUND - 0.3 + row * 0.45, row]);
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
    };
    if (u.troop) bar('t', thp, u.troop.hpMax, `${RULES.soldiers(u, thp)}<small>명</small>`);
    else el().querySelector('.frow.t .fbar.' + cls).style.visibility = 'hidden';
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
        const c = document.createElement('canvas'); c.width = c.height = 420;
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
      const sp = opt.speed || 1;
      bgMat.map = null; bgMat.color.set(0x223044); bgMat.needsUpdate = true;
      K.loadTex(opt.bg.includes('/') ? opt.bg : 'assets/bg/' + opt.bg + '.webp').then((t) => { if (!t) return; bgMat.map = t; bgMat.color.set(0xffffff); bgMat.needsUpdate = true; fitBg(); });
      const L = a.side === 'p' ? a : d, Rr = L === a ? d : a;
      const ui = el();
      ui.classList.remove('hidden');
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
      ui.querySelectorAll('.ftot').forEach((e) => { e.classList.remove('on', 'pop'); e.querySelector('b').textContent = ''; });
      tot = { L: 0, R: 0 };
      ui.querySelector('.fvs small').textContent = res.rel > 0 ? `${a.name} 상성 우위` : res.rel < 0 ? `${a.name} 상성 열세` : '';
      setSide('L', L); setSide('R', Rr);

      const mk = (u, side) => {
        const dir = side === 'L' ? -1 : 1;
        const f = side === 'L' ? 1 : -1;
        const list = [];
        const native = u.side === 'p' ? 1 : -1;
        const hh = (u.def.big ? 2.8 : 2.0) * (u.def.sizeK || 1);
        const hero = new K.Rig(u.rig, hh, native);
        hero.face(f);
        // 영웅 몸 폭만큼 화면 가장자리 안쪽으로 (세로 화면처럼 좁을 때 잘리지 않게)
        const hw = (hero.c.tpl.box.max.x - hero.c.tpl.box.min.x) * hero.k;
        const hx = dir * Math.min(Math.abs(heroX(dir)), VW / 2 - hw / 2 - 0.15) + dir * off, hy = GROUND + 0.05;
        hero.g.position.set(hx + dir * 7, hy, 0);
        hero.order = 140;
        scene.add(hero.g);
        hero.loop('move');
        list.push({ rig: hero, side, x: hx, y: hy, u, hero: true, alive: true, air: isAir(u, true) ? 0.85 : 0 });
        addShadow(list[list.length - 1]);
        soldierSlots(figN(u, st[u.uid].thp), side).forEach(([x0, y, row], i) => {
          const x = x0 + dir * off;
          const r = new K.Rig(u.troop.rig, 1.5, native);
          r.face(f);
          r.g.position.set(x + dir * 7, y, 0);
          r.order = 100 + (3 - row) * 20 + i;
          scene.add(r.g);
          r.loop('move');
          r.c.time = Math.random();
          list.push({ rig: r, side, x, y, u, hero: false, alive: true, air: isAir(u, false) ? 0.6 : 0 });
          addShadow(list[list.length - 1]);
        });
        actors.push(...list);
        return list;
      };
      const LA = mk(L, 'L'), RA = mk(Rr, 'R');
      const att = a === L ? LA : RA, def = a === L ? RA : LA;
      const attSide = a === L ? 'L' : 'R', defSide = attSide === 'L' ? 'R' : 'L';

      // 등장
      const enter = 0.55 / sp;
      for (const f of actors) tween(f.rig.g.position, 'x', f.rig.g.position.x, f.x, 0, enter);
      tl.push({ t: enter, fn: () => actors.forEach((f) => f.rig.loop('idle')) });
      let t0 = enter + 0.15 / sp;
      // 근접: 공격하는 쪽은 크게, 반격하는 쪽도 맞받아 함께 나선다. 병사는 병과마다 랑그릿사식으로 (STYLE)
      if (!split) {
        const charge = (list, side, far, foe) => {
          const dir = side === 'L' ? 1 : -1;
          const front = (l, d) => l.filter((f) => !f.hero).reduce((m, f) => (m == null || f.x * d > m * d ? f.x : m), null); // d 쪽으로 가장 나온 병사
          const mine = front(list, dir), theirs = front(foe, -dir) ?? (foe.find((f) => f.hero) || {}).x;
          list.forEach((f) => {
            const sty = styleOf(f), p = f.rig.g.position;
            if (sty === 'stay') return;
            const run = (speed, dust) => tl.push({ t: t0, fn: () => { f.rig.loop('move', speed); if (Math.random() < dust) fx('dust_step', p.x, f.y + 0.05, { flipX: side === 'R', k: f.hero ? 1 : 0.7, renderOrder: 90 }); } });
            let adv = far * dir, dur = 0.45;
            if (sty === 'wall') { adv *= 0.55; dur = 0.6; run(0.8, 0.15); } // 대열을 지켜 천천히 밀고 나간다
            else if (sty === 'lance') { adv *= 1.5; dur = 0.32; run(2.2, 0.9); } // 먼지를 일으키며 빠르게 돌격
            else if (sty === 'swoop' && theirs != null) { // 높이 떠올라 적 앞줄 위로
              adv = theirs - mine - dir * 0.35; dur = 0.5; run(1.3, 0);
              tween(f, 'air', f.air, 1.5, t0, t0 + dur / sp);
            } else if (sty === 'blink' && theirs != null) { // 하얗게 사라졌다가 적 코앞에 나타난다
              adv = theirs - mine - dir * 0.6;
              const x1 = f.x + adv, t1 = t0 + 0.16 / sp;
              tl.push({ t: t0, fn: () => { f.rig.c.setFlash(1); fx('dust_step', p.x, f.y + 0.05, { k: 0.6, renderOrder: 90 }); } });
              tween(null, null, 1, 0, t0, t1, (v) => f.rig.c.setOpacity(v));
              tl.push({ t: t1, fn: () => { p.x = x1; f.flashT = T; } });
              tween(null, null, 0, 1, t1, t1 + 0.14 / sp, (v) => f.rig.c.setOpacity(v));
              f.x = x1;
              return;
            } else run(1.4, f.hero ? 1 : 0.4); // 달려든다
            tween(p, 'x', f.x, f.x + adv, t0, t0 + dur / sp);
            f.x += adv;
          });
        };
        // 맞붙되 두 부대 앞줄 사이에 틈을 남긴다 (한 덩어리로 겹치지 않게)
        charge(att, attSide, Math.min(0.7, VW * 0.045), def);
        if (res.counter) charge(def, defSide, Math.min(0.3, VW * 0.02), att);
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
      tl.push({ t: end + 0.7 / sp, fn: () => finish() });
      tl.sort((p, q) => p.t - q.t);
    });
  };

  // 동시 전투: 접전(round)마다 양쪽 부대가 함께 공격하고, 그 접전의 피해를 동시에 반영한다. 반환: 끝나는 시각
  function brawl(att, def, attSide, defSide, a, d, res, t0, sp, st) {
    const rounds = res.rounds && res.rounds.length ? res.rounds : [{ dT: res.dT, dH: res.dH, aT: res.aT, aH: res.aH }];
    const step = (split ? 0.5 : 0.42) / sp; // 접전 사이 간격
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
            if (Math.random() < (f.hero ? 1 : 0.75)) { f.rig.once('atk', speed); muzzle(f, s.au); if (!split) strike(f, s.to, s.au, sp); }
            if (split && isRanged(f, s.au) && Math.random() < (f.hero ? 1 : 0.5)) bolt(f, s.to, s.au);
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
          addTotal(s.toSide, dT + dH);
          const keep = figN(s.du, S.thp);
          while (s.to.filter((f) => !f.hero && f.alive).length > keep) die(s.to.filter((f) => !f.hero && f.alive).sort((p, q) => Math.abs(p.x) - Math.abs(q.x))[0]);
          setBars(s.toSide, s.du, S.thp, S.hp);
          if (dH > 0) shakeBust(s.toSide);
          if (S.hp <= 0.5 && heroF.alive) die(heroF);
        } });
        end = Math.max(end, hitT + (far ? TRAVEL / sp : 0) + 0.35 / sp);
      }
    });
    return end;
  }

  // 병과별 싸우는 모습 (랑그릿사): 소총병·해병·변이체는 달려들고(rush), 중장병은 대열로 밀고 나가 찌르며(wall),
  // 기동병은 깊숙이 돌격해 들이받고(lance), 공중병은 떠올라 내리꽂으며(swoop), 침투병은 사라졌다 적 코앞에 나타난다(blink).
  // 사격병·전자전병·의무병은 뒤에 남아 쏘거나 주문을 건다(stay)
  const STYLE = { inf: 'rush', water: 'rush', demon: 'rush', pike: 'wall', cav: 'lance', fly: 'swoop', assassin: 'blink', arch: 'stay', mage: 'stay', priest: 'stay' };
  const styleOf = (f) => (f.hero ? 'rush' : STYLE[f.u.troop && f.u.troop.kind] || 'rush');
  // 접전마다 병과에 맞는 한 동작: 찌르기·들이받기·내리꽂기 / 뒤에서 쏘는 병과는 제 손으로 탄·주문을 날린다
  function strike(f, to, au, sp) {
    const sty = styleOf(f), p = f.rig.g.position, dir = f.side === 'L' ? 1 : -1, x = f.x;
    const out = (d, a, b) => { tween(p, 'x', x, x + d * dir, T, T + a / sp); tween(p, 'x', x + d * dir, x, T + a / sp, T + b / sp); };
    if (sty === 'wall') out(0.22, 0.08, 0.3);
    else if (sty === 'lance') out(0.6, 0.12, 0.42);
    else if (sty === 'swoop') { out(0.25, 0.12, 0.4); tween(f, 'air', f.air, 0.3, T, T + 0.12 / sp); tween(f, 'air', 0.3, 1.5, T + 0.14 / sp, T + 0.42 / sp); }
    else if (sty === 'stay' && !f.hero && f.u.troop.kind !== 'priest') {
      const tg = to.filter((o) => o.alive);
      if (!tg.length) return;
      const d = tg[Math.floor(Math.random() * tg.length)], q = d.rig.g.position;
      const x1 = q.x + (Math.random() - 0.5) * 0.3, y1 = q.y + lift(d) + (d.hero ? 0.8 : 0.45);
      if (f.u.troop.kind === 'mage') fx('hit_energy', x1, y1, { k: 0.55, tint: 0xd6a8ff, renderOrder: 515 }); // 전자전: 적 몸에서 번쩍
      else tracer(p.x + dir * 0.42, p.y + lift(f) + 0.62, x1, y1, au.side === 'e', 0.16, f.u.troop.def.sfx === 'missile');
    }
  }

  const isRanged = (src, au) => { const kind = src.hero ? au.kind : au.troop && au.troop.kind; return au.rng > 1 || kind === 'arch'; };

  // 쓰러질 때 (랑그릿사식): 맞은 반대쪽으로 짧게 튕겨 밀려나며 뒤로 젖혀지고, 하얗게 깜빡이다 사라진다
  const DIE_KNOCK = 0.22, DIE_END = 0.62; // 밀려나는 시간, 사라질 때까지
  function die(f) {
    if (!f || !f.alive) return;
    f.alive = false;
    { const p = f.rig.g.position; // 원작 효과: 철충은 폭발, 바이오로이드는 쓰러지는 먼지
      if (f.u.side === 'e') fx(f.hero && f.u.def.big ? 'explosion_big' : 'explosion_small', p.x, p.y + lift(f) + (f.hero ? 0.9 : 0.5), { k: f.hero ? 1 : 0.55, renderOrder: 540 });
      else fx('dust_fall', p.x, p.y + 0.15, { k: f.hero ? 1 : 0.8, renderOrder: 95 }); }
    if (f.shadow) f.shadow.visible = false;
    const away = f.side === 'L' ? -1 : 1;
    let k = f.hero ? 0.7 : 1;
    if (PORT()) k *= 0.7; // 세로 화면은 좁아서 덜 밀려난다
    const g = f.rig.g.position;
    f.fly = { t: 0, x0: g.x, y0: g.y, dx: away * (0.7 + Math.random() * 0.5) * k, hop: (0.18 + Math.random() * 0.12) * k, tilt: -away * (0.22 + Math.random() * 0.12) };
    f.rig.c.speed = 0.25; // 자세는 맞은 순간에서 거의 멈춘다
    f.flashT = null; f.rig.c.setFlash(1);
  }

  // 피해 숫자: 맞은 몸 머리 위에서 크게 튀어나왔다가 위로 떠오르며 사라진다 (화면 좌표로 옮겨 HTML 글자로)
  let tot = { L: 0, R: 0 };
  function toScreen(x, y, side) {
    const W = innerWidth, H = innerHeight;
    let c = cam, x0 = 0, w = W;
    if (split) { const hw = Math.floor(W / 2); c = side === 'L' ? camL : camR; x0 = side === 'L' ? 0 : hw; w = side === 'L' ? hw : W - hw; }
    return [x0 + ((x - c.left) / (c.right - c.left)) * w, ((c.top - y) / (c.top - c.bottom)) * H];
  }
  // 원작 피해 숫자 글꼴: 적이 맞으면 노랑, 아군이 맞으면 주황, 상성 우위로 친 영웅 피해는 빨강(강한 일격)
  function dmgNum(f, n, kind) {
    const p = f.rig.g.position, [sx, sy] = toScreen(p.x + (Math.random() - 0.5) * 0.3, p.y + lift(f) + (f.hero ? 2.3 : 1.4) + Math.random() * 0.3, f.side);
    const px = (f.hero ? 46 : 32) * Math.min(1.4, Math.max(0.75, innerHeight / 800));
    LOHUD.float(LOHUD.num(Math.max(1, n), kind, kind === 'cri' ? px * 1.2 : px), sx, sy, kind === 'cri' ? 'big' : '', el().querySelector('.fnums'), 1000);
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
    e.innerHTML = `<small>PASSIVE</small><b>${name}</b>`;
    el().querySelector('.fnums').appendChild(e);
    setTimeout(() => e.remove(), 1700);
  }
  // 그 편이 받은 피해 합계 (정보판 위 별 모양)
  function addTotal(side, n) {
    if (n <= 0) return;
    tot[side] += n;
    const e = el().querySelector('.fcorner.' + side + ' .ftot');
    e.querySelector('b').textContent = Math.round(tot[side]);
    e.classList.add('on'); e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop');
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
      fx(HIT_FX[w], hx, hy, { k: dst.hero ? 1.1 : 0.8, flipX: dst.side === 'L', rotation: (Math.random() - 0.5) * 0.5 });
      if (w === 'melee' && Math.random() < 0.5) fx('slash_line', hx, hy, { k: dst.hero ? 1 : 0.7, rotation: (Math.random() - 0.5) * 1.2 });
      if (crit) fx('hit_crit', hx, hy + 0.1, { k: 1.1, renderOrder: 530 });
    } else spark(hx, hy, ranged);
    dst.flashT = T; // 맞으면 하얗게 번쩍 (랑그릿사처럼)
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
    fx(MUZZLE_FX[w], p.x + dir * (f.hero ? 0.6 : 0.42), p.y + lift(f) + (f.hero ? 1.0 : 0.62), { flipX: dir < 0, k: f.hero ? 1.1 : 0.7, tint: w === 'energy' ? 0x9fd8ff : 0xffffff, renderOrder: 515 });
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
    split = false;
    el().classList.remove('split');
    el().classList.add('hidden');
    const cb = done; done = null;
    if (cb) cb();
  }
  FIGHT.skip = finish;
  FIGHT.actors = () => actors; // 시험용

  FIGHT.update = function (dt) {
    if (!active) return;
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
    for (const f of actors) {
      f.rig.update(dt);
      if (f.air && f.alive) f.rig.c.root.position.y = f.by0 + lift(f);
      if (f.flashT != null) { const k = (T - f.flashT) / 0.18; f.rig.c.setFlash(k >= 1 ? 0 : k < 0.3 ? 1 : (1 - k) / 0.7); if (k >= 1) f.flashT = null; }
      if (f.fly) { // 튕겨 밀려나기 → 하얗게 깜빡이며 옅어지다 사라짐
        const q = f.fly, g = f.rig.g;
        q.t += dt;
        const a = Math.min(1, q.t / DIE_KNOCK), e = 1 - (1 - a) * (1 - a); // 처음에 세게, 끝에 멈추듯
        g.position.x = q.x0 + q.dx * e;
        g.position.y = q.y0 + q.hop * Math.sin(Math.PI * a);
        g.rotation.z = q.tilt * e;
        f.rig.c.setFlash(Math.floor(q.t / 0.06) % 2 ? 0.15 : 0.9); // 깜빡임
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
