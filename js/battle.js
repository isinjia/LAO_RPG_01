// 전투 연출 (랑그릿사 모바일식): 영웅이 앞에 크게, 배속 병사가 뒤에 늘어선다.
// 병사 수는 남은 병사 체력에 비례(최대 6). 원작 공격 클립의 타격 시점마다 병사가 먼저 쓰러지고, 병사가 없으면 영웅이 맞는다.
// 아군은 항상 왼쪽(오른쪽을 봄), 적은 오른쪽(왼쪽을 봄).
(function () {
  const FIGHT = {};
  let scene, cam, bgMesh, bgMat;
  let VW = 16, VH = 9;
  const GROUND = -1.6;
  let actors = [], fxs = [], tl = [], T = 0, done = null, active = false;
  const tweens = [];
  const el = () => document.getElementById('fight');
  const MAXF = 9;

  FIGHT.init = function () {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101826);
    cam = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, -50, 50);
    bgMat = new THREE.MeshBasicMaterial({ color: 0x223044, depthTest: false, depthWrite: false });
    bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bgMat);
    bgMesh.renderOrder = -10;
    scene.add(bgMesh);
    el().addEventListener('pointerdown', () => { if (active) finish(); });
  };
  FIGHT.resize = function (w, h) {
    const a = w / h;
    if (a < 1) { VW = 9.4; VH = VW / a; } else { VH = Math.max(8.4, 12.5 / a); VW = VH * a; }
    const cy = a < 1 ? 1.2 : 0.6;
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

  const figN = (u, thp) => (u.troop && thp > 0.5 ? Math.max(1, Math.ceil((thp / u.troop.hpMax) * MAXF)) : 0);
  // 랑그릿사 모바일처럼: 영웅은 맨 뒤(바깥쪽), 병사 무리는 영웅 앞(적 쪽)에 3줄 x 3열
  const heroX = (dir) => dir * (VW / 2 - Math.min(1.3, VW * 0.12));
  function soldierSlots(n, side) {
    const dir = side === 'L' ? -1 : 1;
    const front = 0.9, back = VW / 2 - Math.min(1.3, VW * 0.12) - 1.1;
    const span = Math.min(1.0, Math.max(0.55, (back - front) / 2.4));
    const out = [];
    for (let i = 0; i < n; i++) {
      const row = i % 3, col = Math.floor(i / 3); // 앞 열부터 채운다
      out.push([dir * (front + col * span + (row === 1 ? span * 0.45 : 0)), GROUND - 0.3 + row * 0.45, row]);
    }
    return out;
  }

  function setBars(cls, u, thp, hp) {
    const s = el().querySelector('.fside.' + cls);
    const tb = s.querySelector('.fhp.t'), hb = s.querySelector('.fhp.h');
    if (u.troop) { tb.style.visibility = ''; tb.querySelector('i').style.width = Math.max(0, (thp / u.troop.hpMax) * 100) + '%'; tb.querySelector('b').textContent = '병사 ' + Math.max(0, Math.round(thp)); }
    else tb.style.visibility = 'hidden';
    hb.querySelector('i').style.width = Math.max(0, (hp / u.hpMax) * 100) + '%';
    hb.querySelector('b').textContent = '영웅 ' + Math.max(0, Math.round(hp));
  }

  // a: 공격자, d: 방어자, res: RULES.combat 결과(정수), opt: { bg, speed }
  FIGHT.play = function (a, d, res, opt) {
    const K = window.KIT;
    return new Promise((resolve) => {
      done = resolve;
      active = true;
      T = 0; tl = []; actors = []; fxs = []; tweens.length = 0;
      const sp = opt.speed || 1;
      bgMat.map = null; bgMat.color.set(0x223044); bgMat.needsUpdate = true;
      K.loadTex('assets/bg/' + opt.bg + '.webp').then((t) => { if (!t) return; bgMat.map = t; bgMat.color.set(0xffffff); bgMat.needsUpdate = true; fitBg(); });
      const L = a.side === 'p' ? a : d, Rr = L === a ? d : a;
      const ui = el();
      ui.classList.remove('hidden');
      const st = { [a.uid]: { thp: a.troop ? a.troop.hp : 0, hp: a.hp }, [d.uid]: { thp: d.troop ? d.troop.hp : 0, hp: d.hp } };
      const setSide = (cls, u) => {
        const s = ui.querySelector('.fside.' + cls);
        s.querySelector('.fimg').src = (window.IMG && IMG[u.icon]) || '';
        s.querySelector('.fname').textContent = u.name + (u.troop ? ' · ' + u.troop.def.short : '');
        s.querySelector('.fstat').textContent = `${DATA.KIND[u.troop && st[u.uid].thp > 0 ? u.troop.kind : u.kind].name} · Lv${u.lv}`;
        setBars(cls, u, st[u.uid].thp, st[u.uid].hp);
      };
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
        const hx = heroX(dir), hy = GROUND + 0.05;
        hero.g.position.set(hx + dir * 7, hy, 0);
        hero.order = 140;
        scene.add(hero.g);
        hero.loop('move');
        list.push({ rig: hero, side, x: hx, y: hy, u, hero: true, alive: true });
        soldierSlots(figN(u, st[u.uid].thp), side).forEach(([x, y, row], i) => {
          const r = new K.Rig(u.troop.rig, 1.5, native);
          r.face(f);
          r.g.position.set(x + dir * 7, y, 0);
          r.order = 100 + (3 - row) * 20 + i;
          scene.add(r.g);
          r.loop('move');
          r.c.time = Math.random();
          list.push({ rig: r, side, x, y, u, hero: false, alive: true });
        });
        actors.push(...list);
        return list;
      };
      const LA = mk(L, 'L'), RA = mk(Rr, 'R');
      const att = a === L ? LA : RA, def = a === L ? RA : LA;
      const attSide = a === L ? 'L' : 'R', defSide = attSide === 'L' ? 'R' : 'L';

      const enter = 0.55 / sp;
      for (const f of actors) tween(f.rig.g.position, 'x', f.rig.g.position.x, f.x, 0, enter);
      tl.push({ t: enter, fn: () => actors.forEach((f) => f.rig.loop('idle')) });
      const melee = res.dist === 1 && a.kind !== 'arch';
      let t0 = enter + 0.15 / sp;
      if (melee) {
        const adv = Math.min(2.0, VW * 0.11) * (attSide === 'L' ? 1 : -1);
        tl.push({ t: t0, fn: () => att.forEach((f) => f.rig.loop('move', 1.4)) });
        for (const f of att) tween(f.rig.g.position, 'x', f.x, f.x + adv, t0, t0 + 0.45 / sp);
        t0 += 0.5 / sp;
      }
      const endA = schedule(att, def, defSide, a, d, res.dT, res.dH, t0, sp, st);
      let endD = t0;
      if (res.counter) endD = schedule(def, att, attSide, d, a, res.aT, res.aH, Math.max(endA - 0.3 / sp, t0 + 0.6 / sp), sp, st);
      tl.push({ t: Math.max(endA, endD) + 0.7 / sp, fn: () => finish() });
      tl.sort((p, q) => p.t - q.t);
    });
  };

  // from 쪽이 to 쪽을 친다. 병사 피해 dT, 영웅 피해 dH 를 타격 시점마다 나눠 반영. 반환: 끝나는 시각
  function schedule(from, to, toSide, au, du, dT, dH, t0, sp, st) {
    const live = from.filter((f) => f.alive);
    if (!live.length) return t0;
    const events = [];
    let end = t0;
    live.forEach((f, k) => {
      const id = f.rig.c.tpl.id;
      const ev = (window.ANIM_EV && ANIM_EV[id] && ANIM_EV[id].atk) || null;
      const dur = f.rig.dur('atk');
      const speed = Math.max(1, dur / (f.hero ? 2.0 : 1.6)) * sp;
      let hits = ev && ev.t.length ? ev.t.slice() : [dur * 0.42];
      if (hits.length > 3) hits = [hits[0], hits[Math.floor(hits.length / 2)], hits[hits.length - 1]];
      if (!f.hero) hits = [hits[0]];
      const s0 = t0 + (k ? Math.random() * 0.25 : 0) / sp;
      tl.push({ t: s0, fn: () => { if (f.alive) f.rig.once('atk', speed); } });
      for (const h of hits) events.push({ t: s0 + h / speed, f });
      end = Math.max(end, s0 + (dur / speed) * 0.9);
    });
    events.sort((p, q) => p.t - q.t);
    const s = st[du.uid];
    const soldiers = to.filter((f) => !f.hero && f.alive).sort(() => Math.random() - 0.5);
    const heroF = to.find((f) => f.hero);
    const n = events.length;
    let base = null;
    events.forEach((e, i) => {
      tl.push({ t: e.t, fn: () => {
        if (!base) base = { thp: s.thp, hp: s.hp }; // 반격은 앞 공격이 끝난 뒤의 체력에서 시작
        const k = (i + 1) / n;
        const thp = base.thp - dT * k, hp = base.hp - dH * k;
        const keep = figN(du, thp);
        const aliveS = soldiers.filter((f) => f.alive);
        let victim = aliveS.length ? aliveS[Math.floor(Math.random() * aliveS.length)] : heroF;
        if (dH > 0 && k > 0.5) victim = heroF;
        hitFx(e.f, victim, au);
        while (soldiers.filter((f) => f.alive).length > keep) die(soldiers.find((f) => f.alive));
        setBars(toSide, du, thp, hp);
        if (i === n - 1) { s.thp = thp; s.hp = hp; if (hp <= 0.5 && heroF.alive) die(heroF); }
      } });
    });
    return Math.max(n ? events[n - 1].t + 0.3 / sp : t0, end);
  }

  function die(f) {
    if (!f || !f.alive) return;
    f.alive = false;
    if (f.rig.c.has('die')) f.rig.once('die', 1.6, true);
    tween(f, 'fade', 1, 0, T + 0.5, T + 1.3, (v) => f.rig.c.setOpacity(v));
  }

  function hitFx(src, dst, au) {
    const K = window.KIT;
    if (!dst) return;
    const p = dst.rig.g.position;
    const h = dst.hero ? 1.3 : 0.7;
    const kind = src.hero ? au.kind : au.troop && au.troop.kind;
    const ranged = au.rng > 1 || kind === 'arch';
    if (ranged) {
      const s = src.rig.g.position;
      beam(s.x + (src.side === 'L' ? 0.4 : -0.4), s.y + (src.hero ? 1.2 : 0.7), p.x, p.y + h * 0.6, au.side === 'p' ? 0x9fd8ff : 0xff9a7a);
    }
    spark(p.x + (Math.random() - 0.5) * 0.4, p.y + h * (0.4 + Math.random() * 0.5), ranged);
    dst.rig.c.setTint(1.6, 1.3, 1.3);
    dst.tintT = T + 0.09;
    K.AU.play(src.hero ? au.def.sfx : (au.troop ? au.troop.def.sfx : au.def.sfx), 0.6);
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
      const v = w.a + (w.b - w.a) * k * (2 - k);
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
