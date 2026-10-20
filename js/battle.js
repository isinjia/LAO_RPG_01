// 전투 연출: 랑그릿사처럼 양쪽 부대가 옆모습으로 맞붙는다.
// 용병은 남은 병력 수만큼 SD가 늘어서고, 지휘관은 크게 한 명. 원작 공격 클립의 타격 시점에 맞춰 상대가 쓰러진다.
// 아군은 항상 왼쪽(오른쪽을 봄), 적은 오른쪽(왼쪽을 봄).
(function () {
  const FIGHT = {};
  let scene, cam, bgMesh, bgMat;
  let VW = 16, VH = 9;
  const GROUND = -1.6;
  let actors = [], fxs = [], tl = [], T = 0, done = null, active = false;
  const el = () => document.getElementById('fight');

  FIGHT.init = function () {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101826);
    cam = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, -50, 50);
    bgMat = new THREE.MeshBasicMaterial({ color: 0x223044, depthTest: false, depthWrite: false });
    bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bgMat);
    bgMesh.renderOrder = -10;
    scene.add(bgMesh);
    // 바닥 그림자 띠
    el().addEventListener('pointerdown', () => { if (active) finish(); });
  };
  FIGHT.resize = function (w, h) {
    const a = w / h;
    // 세로 화면은 폭을 좁혀(병사를 3줄로 세워) 인물을 크게
    if (a < 1) { VW = 9.4; VH = VW / a; } else { VH = Math.max(8.4, 12.5 / a); VW = VH * a; }
    const cy = a < 1 ? 1.2 : 0.6; // 세로 화면은 인물을 화면 가운데쯤으로
    cam.left = -VW / 2; cam.right = VW / 2; cam.top = VH / 2 + cy; cam.bottom = -VH / 2 + cy;
    cam.updateProjectionMatrix();
    fitBg();
  };
  function fitBg() {
    const img = bgMat.map && bgMat.map.image;
    const ia = img ? img.width / img.height : 16 / 9;
    // 지면이 그림의 아래쪽 1/3에 오도록: 그림 높이를 화면 높이에 맞추되 너비가 모자라면 키운다
    let h = VH * 1.02, w = h * ia;
    if (w < VW * 1.02) { w = VW * 1.02; h = w / ia; }
    bgMesh.scale.set(w, h, 1);
    bgMesh.position.set(0, (cam.top + cam.bottom) / 2 + (h - VH) * 0.12, -5);
  }
  FIGHT.scene = () => scene;
  FIGHT.camera = () => cam;
  FIGHT.active = () => active;

  // 병사 배치: 2줄 x 5열, 앞줄이 아래(가까이)
  function slots(n, side, big) {
    const out = [];
    const dir = side === 'L' ? -1 : 1;
    const rows = VW < 11 ? 3 : 2, cols = Math.ceil(10 / rows);
    const span = Math.min(1.05, (VW / 2 - 1.6) / (cols - 0.5));
    if (big) { out.push([dir * Math.min(3.4, VW * 0.22), GROUND - 0.1, 0]); return out; }
    for (let i = 0; i < n; i++) {
      const row = i % rows, col = Math.floor(i / rows);
      const x = dir * (1.1 + col * span + (row % 2 ? span * 0.5 : 0));
      out.push([x, GROUND - 0.3 + row * 0.5, row]);
    }
    return out;
  }

  function figCount(u, hp) { return u.cmd ? 1 : Math.max(0, Math.ceil(hp)); }

  // a: 공격자, d: 방어자, res: RULES.combat 결과(정수), opt: { bg, speed }
  FIGHT.play = function (a, d, res, opt) {
    const K = window.KIT;
    return new Promise((resolve) => {
      done = resolve;
      active = true;
      T = 0; tl = []; actors = []; fxs = [];
      const sp = opt.speed || 1;
      bgMat.map = null; bgMat.color.set(0x223044); bgMat.needsUpdate = true;
      K.loadTex('assets/bg/' + opt.bg + '.webp').then((t) => { if (!t) return; bgMat.map = t; bgMat.color.set(0xffffff); bgMat.needsUpdate = true; fitBg(); });
      const L = a.side === 'p' ? a : d, Rr = L === a ? d : a;
      const ui = el();
      ui.classList.remove('hidden');
      const setSide = (cls, u, hp) => {
        const s = ui.querySelector('.fside.' + cls);
        s.querySelector('.fimg').src = (window.IMG && IMG[u.icon]) || '';
        s.querySelector('.fname').textContent = u.name + (u.cmd ? '' : ' 부대');
        s.querySelector('.fstat').textContent = `${DATA.KIND[u.kind].name} · 공격 ${Math.round(RULES.stat(u, 'at'))} · 방어 ${Math.round(RULES.stat(u, 'df'))}`;
        setHp(cls, hp);
      };
      const relTxt = res.relA > 0 ? '상성 우위' : res.relA < 0 ? '상성 열세' : '';
      ui.querySelector('.fvs small').textContent = relTxt ? `${a.name} ${relTxt}` : '';
      setSide('L', L, L.hp); setSide('R', Rr, Rr.hp);

      const mk = (u, side) => {
        const n = figCount(u, u.hp);
        const pos = slots(n, side, u.cmd);
        const big = (u.cmd ? (u.def.big || 2.9) : 1.5) * (u.def.sizeK || 1);
        const list = [];
        for (let i = 0; i < n; i++) {
          const rig = new K.Rig(u.rig, big, u.side === 'p' ? 1 : -1);
          rig.face(side === 'L' ? 1 : -1);
          const [x, y, row] = pos[i];
          rig.g.position.set(x + (side === 'L' ? -7 : 7), y, 0);
          rig.order = 100 + (3 - row) * 20 + i;
          scene.add(rig.g);
          rig.loop('move');
          rig.c.time = Math.random();
          list.push({ rig, side, x, y, u, alive: true, dying: 0, i });
        }
        actors.push(...list);
        return list;
      };
      const LA = mk(L, 'L'), RA = mk(Rr, 'R');
      const att = a === L ? LA : RA, def = a === L ? RA : LA;
      const attSide = a === L ? 'L' : 'R', defSide = attSide === 'L' ? 'R' : 'L';

      // 1) 입장
      const enter = 0.55 / sp;
      tl.push({ t: 0, fn: () => {} });
      for (const f of actors) tween(f.rig.g.position, 'x', f.rig.g.position.x, f.x, 0, enter);
      tl.push({ t: enter, fn: () => actors.forEach((f) => f.rig.loop('idle')) });

      // 2) 근접이면 공격측이 가운데로 돌진
      const melee = res.dist === 1 && a.kind !== 'arch';
      let t0 = enter + 0.15 / sp;
      if (melee) {
        const adv = Math.min(2.2, VW * 0.12) * (attSide === 'L' ? 1 : -1);
        tl.push({ t: t0, fn: () => att.forEach((f) => f.rig.loop('move', 1.4)) });
        for (const f of att) tween(f.rig.g.position, 'x', f.x, f.x + adv, t0, t0 + 0.45 / sp);
        t0 += 0.5 / sp;
      }
      // 3) 공격과 반격: 타격 시점마다 한 명씩 쓰러뜨린다
      const kills = { [defSide]: Math.round(res.dLoss), [attSide]: Math.round(res.aLoss) };
      const hpNow = { [attSide]: a.hp, [defSide]: d.hp };
      const endA = schedule(att, def, defSide, a, d, kills[defSide], t0, sp, hpNow, res.dHp);
      let endD = t0;
      if (res.counter) endD = schedule(def, att, attSide, d, a, kills[attSide], t0 + 0.55 / sp, sp, hpNow, res.aHp);
      const end = Math.max(endA, endD) + 0.7 / sp;
      tl.push({ t: end, fn: () => finish() });
      tl.sort((p, q) => p.t - q.t);
    });
  };

  function setHp(cls, hp) {
    const s = el().querySelector('.fside.' + cls);
    s.querySelector('.fhp i').style.width = Math.max(0, hp * 10) + '%';
    s.querySelector('.fhp b').textContent = Math.max(0, Math.round(hp));
  }

  // 공격 클립 재생 계획. 반환: 끝나는 시각
  function schedule(from, to, toSide, au, du, nKill, t0, sp, hpNow, finalHp) {
    const K = window.KIT;
    const live = from.filter((f) => f.alive);
    if (!live.length) return t0;
    const ev = (window.ANIM_EV && ANIM_EV[au.rig] && ANIM_EV[au.rig].atk) || null;
    const dur = live[0].rig.dur('atk');
    const want = au.cmd ? 2.0 : 1.6; // 클립을 이 길이로 맞춰 빠르게 재생
    const speed = Math.max(1, dur / want) * sp;
    let hits = ev && ev.t.length ? ev.t.slice() : [dur * 0.42];
    if (hits.length > 4) hits = [hits[0], hits[Math.floor(hits.length / 2)], hits[hits.length - 1]];
    // 타격 이벤트 목록: (시각, 쏜 병사)
    const events = [];
    live.forEach((f, k) => {
      const st = t0 + (k ? Math.random() * 0.25 : 0) / sp;
      tl.push({ t: st, fn: () => { if (f.alive) f.rig.once('atk', speed); } });
      for (const h of hits) events.push({ t: st + h / speed, f });
    });
    events.sort((p, q) => p.t - q.t);
    // 쓰러뜨릴 대상: 뒤쪽부터가 아니라 무작위
    const victims = to.filter((f) => f.alive).sort(() => Math.random() - 0.5);
    const dCmd = du.cmd;
    let killed = 0;
    const per = events.length ? (hpNow[toSide] - finalHp) / events.length : 0;
    let shown = hpNow[toSide];
    events.forEach((e, idx) => {
      // 균등하게 kill 분배
      const shouldKill = !dCmd && Math.floor(((idx + 1) * nKill) / events.length) > killed;
      const victim = shouldKill ? victims[killed] : victims[Math.floor(Math.random() * victims.length)];
      if (shouldKill) killed++;
      tl.push({ t: e.t, fn: () => {
        if (!victim) return;
        const ranged = au.rng > 1 || au.kind === 'fly' && !au.cmd;
        hitFx(e.f, victim, ranged, au);
        if (shouldKill && victim.alive) die(victim);
        shown = Math.max(finalHp, shown - per);
        setHp(toSide, shown);
        if (dCmd && idx === events.length - 1 && finalHp <= 0 && victim.alive) die(victim);
      } });
    });
    const last = events.length ? events[events.length - 1].t : t0;
    return Math.max(last + 0.3 / sp, t0 + (dur / speed) * 0.9);
  }

  function die(f) {
    f.alive = false;
    f.dying = 1;
    if (f.rig.c.has('die')) f.rig.once('die', 1.6, true);
    tween(f, 'fade', 1, 0, T + 0.5, T + 1.3, (v) => f.rig.c.setOpacity(v));
  }

  function hitFx(src, dst, ranged, au) {
    const K = window.KIT;
    const p = dst.rig.g.position;
    const h = dst.u.cmd ? 1.4 : 0.8;
    if (ranged) {
      const s = src.rig.g.position;
      beam(s.x + (src.side === 'L' ? 0.4 : -0.4), s.y + h * 0.7, p.x, p.y + h * 0.6, au.side === 'p' ? 0x9fd8ff : 0xff9a7a);
    }
    spark(p.x + (Math.random() - 0.5) * 0.4, p.y + h * (0.4 + Math.random() * 0.5), au.kind);
    dst.rig.c.setTint(1.6, 1.3, 1.3);
    dst.tintT = T + 0.09;
    K.AU.play(au.def.sfx || 'gun', 0.7);
  }

  function spark(x, y, kind) {
    const K = window.KIT;
    const tex = K.tex(kind === 'arch' || kind === 'fly' ? 'fx_spark' : 'fx_firehit');
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

  const tweens = [];
  function tween(obj, key, a, b, t0, t1, set) { tweens.push({ obj, key, a, b, t0, t1, set }); }

  function finish() {
    if (!active) return;
    active = false;
    for (const f of actors) { scene.remove(f.rig.g); f.rig.dispose(); }
    for (const x of fxs) { scene.remove(x.m); x.m.material.dispose(); if (x.beam) x.m.geometry.dispose(); }
    actors = []; fxs = []; tl = []; tweens.length = 0;
    el().classList.add('hidden');
    const cb = done; done = null;
    if (cb) cb();
  }
  FIGHT.skip = finish;

  FIGHT.update = function (dt) {
    if (!active) return;
    T += dt;
    while (tl.length && tl[0].t <= T) { const e = tl.shift(); e.fn(); if (!active) return; }
    for (let i = tweens.length - 1; i >= 0; i--) {
      const w = tweens[i];
      if (T < w.t0) continue;
      const k = Math.min(1, (T - w.t0) / Math.max(1e-3, w.t1 - w.t0));
      const e = k * (2 - k);
      const v = w.a + (w.b - w.a) * e;
      if (w.set) w.set(v); else w.obj[w.key] = v;
      if (k >= 1) tweens.splice(i, 1);
    }
    for (const f of actors) { f.rig.update(dt); if (f.tintT && T >= f.tintT) { f.tintT = 0; f.rig.c.setTint(1, 1, 1); } }
    for (let i = fxs.length - 1; i >= 0; i--) {
      const x = fxs[i];
      x.t += dt;
      const k = x.t / x.life;
      if (k >= 1) { scene.remove(x.m); x.m.material.dispose(); if (x.beam) x.m.geometry.dispose(); fxs.splice(i, 1); continue; }
      x.m.material.opacity = 1 - k;
      if (x.grow) x.m.scale.setScalar(0.9 + k * x.grow);
    }
  };

  window.FIGHT = FIGHT;
})();
