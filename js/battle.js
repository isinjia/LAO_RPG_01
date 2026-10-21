// 전투 연출 (랑그릿사 모바일식): 영웅은 뒤(바깥쪽), 배속 병사는 영웅 앞(적 쪽)에 늘어선다.
// 양쪽이 동시에 싸운다: RULES.combat 의 접전(rounds)마다 두 부대가 함께 공격하고, 그 접전의 피해가 동시에 들어간다.
// 근접은 두 부대가 함께 돌진해 맞붙고, 원거리(2칸 이상)는 화면을 둘로 나눠 탄이 가운데 경계를 넘어 오간다.
// 쓰러진 병사는 맞은 반대쪽 위로 튕겨 올라 빙글 돌며 떨어지다 사라진다. 아군은 항상 왼쪽, 적은 오른쪽.
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
  // 랑그릿사 모바일처럼: 영웅은 맨 뒤(바깥쪽), 병사 무리는 영웅 앞(적 쪽)에 3줄
  const heroX = (dir) => dir * (VW / 2 - Math.min(1.3, VW * 0.12));
  function soldierSlots(n, side) {
    const dir = side === 'L' ? -1 : 1;
    const front = 0.9, back = VW / 2 - Math.min(1.3, VW * 0.12) - 1.1;
    const span = Math.min(0.95, Math.max(0.5, (back - front) / 3.2));
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
    if (u.troop) { tb.style.visibility = ''; tb.querySelector('i').style.width = Math.max(0, (thp / u.troop.hpMax) * 100) + '%'; tb.querySelector('b').textContent = `병사 ${RULES.soldiers(u, thp)}명`; }
    else tb.style.visibility = 'hidden';
    hb.querySelector('i').style.width = Math.max(0, (hp / u.hpMax) * 100) + '%';
    hb.querySelector('b').textContent = '영웅 ' + Math.max(0, Math.round(hp));
  }

  // a: 공격자, d: 방어자, res: RULES.combat 결과, opt: { bg, speed }
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
      split = res.dist > 1; // 떨어져서 쏘는 원거리 공격
      ui.classList.toggle('split', split);
      const off = split ? GAP : 0;
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
        const hx = heroX(dir) + dir * off, hy = GROUND + 0.05;
        hero.g.position.set(hx + dir * 7, hy, 0);
        hero.order = 140;
        scene.add(hero.g);
        hero.loop('move');
        list.push({ rig: hero, side, x: hx, y: hy, u, hero: true, alive: true });
        soldierSlots(figN(u, st[u.uid].thp), side).forEach(([x0, y, row], i) => {
          const x = x0 + dir * off;
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

      // 등장
      const enter = 0.55 / sp;
      for (const f of actors) tween(f.rig.g.position, 'x', f.rig.g.position.x, f.x, 0, enter);
      tl.push({ t: enter, fn: () => actors.forEach((f) => f.rig.loop('idle')) });
      let t0 = enter + 0.15 / sp;
      // 근접: 공격하는 쪽은 크게, 반격하는 쪽도 맞받아 함께 돌진한다 (원거리 병종은 제자리)
      if (!split) {
        const charge = (list, side, far) => {
          const adv = far * (side === 'L' ? 1 : -1);
          list.forEach((f) => {
            if (!f.hero && isRanged(f, f.u)) return;
            tl.push({ t: t0, fn: () => f.rig.loop('move', 1.4) });
            tween(f.rig.g.position, 'x', f.x, f.x + adv, t0, t0 + 0.45 / sp);
            f.x += adv;
          });
        };
        charge(att, attSide, Math.min(2.0, VW * 0.11));
        if (res.counter) charge(def, defSide, Math.min(1.0, VW * 0.06));
        t0 += 0.5 / sp;
      }
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
        tl.push({ t: tr, fn: () => {
          for (const f of s.from) {
            if (!f.alive) continue;
            const dur = f.rig.dur('atk');
            const speed = Math.max(1, dur / (f.hero ? 1.6 : 1.1)) * sp * (0.9 + Math.random() * 0.25);
            if (Math.random() < (f.hero ? 1 : 0.75)) f.rig.once('atk', speed);
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
          if (dH > 0 || !pool.length) pool.push(heroF);
          pool.forEach((v, k) => hitFx(s.from.find((f) => f.alive) || s.from[0], v, s.au, far, k === 0));
          const keep = figN(s.du, S.thp);
          while (s.to.filter((f) => !f.hero && f.alive).length > keep) die(s.to.filter((f) => !f.hero && f.alive).sort((p, q) => Math.abs(p.x) - Math.abs(q.x))[0]);
          setBars(s.toSide, s.du, S.thp, S.hp);
          if (S.hp <= 0.5 && heroF.alive) die(heroF);
        } });
        end = Math.max(end, hitT + (far ? TRAVEL / sp : 0) + 0.35 / sp);
      }
    });
    return end;
  }

  const isRanged = (src, au) => { const kind = src.hero ? au.kind : au.troop && au.troop.kind; return au.rng > 1 || kind === 'arch'; };

  // 쓰러질 때 (랑그릿사식): 맞은 반대쪽 위로 튕겨 올라 빙글 돌며 떨어지다 사라진다
  function die(f) {
    if (!f || !f.alive) return;
    f.alive = false;
    const away = f.side === 'L' ? -1 : 1, k = f.hero ? 0.6 : 1;
    f.fly = { vx: away * (2.4 + Math.random() * 2.6) * k, vy: (5 + Math.random() * 2.5) * k, w: -away * (6 + Math.random() * 6) * k, t: 0 };
    f.rig.c.speed = 0.25; // 자세는 맞은 순간에서 거의 멈춘다
    f.rig.c.mesh.renderOrder += 60; // 날아가는 동안 다른 병사 앞에
  }

  // 분할 화면을 건너는 탄: 쏜 쪽 화면 끝으로 사라졌다가 맞는 쪽 화면에서 날아든다
  function bolt(src, to, au) {
    const tex = window.KIT.tex('fx_spark');
    const s = src.rig.g.position, dir = src.side === 'L' ? 1 : -1;
    const targets = to.filter((f) => f.alive);
    const d = (targets[Math.floor(Math.random() * targets.length)] || to[0]).rig.g.position;
    const col = au.side === 'p' ? 0x9fd8ff : 0xff9a7a;
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: col, transparent: true, depthTest: false, blending: THREE.AdditiveBlending }));
    m.renderOrder = 520;
    m.scale.set(0.6, 0.6, 1);
    const x0 = s.x + dir * 0.4, y0 = s.y + (src.hero ? 1.2 : 0.7), x1 = d.x + (Math.random() - 0.5) * 0.4, y1 = d.y + 0.5 + Math.random() * 0.4;
    m.position.set(x0, y0, 1);
    scene.add(m);
    fxs.push({ m, t: 0, life: TRAVEL * (0.9 + Math.random() * 0.2), path: [x0, y0, x1, y1] });
  }

  // 맞는 효과: 번쩍임 + 불꽃. 붙어서 쏘는 원거리는 빛줄기. 소리는 접전마다 한 번(snd)
  function hitFx(src, dst, au, far, snd) {
    const K = window.KIT;
    if (!dst || !dst.alive) return;
    const p = dst.rig.g.position;
    const h = dst.hero ? 1.3 : 0.7;
    const ranged = isRanged(src, au);
    if (ranged && !far && src.alive) {
      const s = src.rig.g.position;
      beam(s.x + (src.side === 'L' ? 0.4 : -0.4), s.y + (src.hero ? 1.2 : 0.7), p.x, p.y + h * 0.6, au.side === 'p' ? 0x9fd8ff : 0xff9a7a);
    }
    spark(p.x + (Math.random() - 0.5) * 0.4, p.y + h * (0.4 + Math.random() * 0.5), ranged);
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

  function finish() {
    if (!active) return;
    active = false;
    for (const f of actors) { scene.remove(f.rig.g); f.rig.dispose(); }
    for (const x of fxs) { scene.remove(x.m); x.m.material.dispose(); if (x.beam) x.m.geometry.dispose(); }
    actors = []; fxs = []; tl = []; tweens.length = 0;
    split = false;
    el().classList.remove('split');
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
    for (const f of actors) {
      f.rig.update(dt);
      if (f.flashT != null) { const k = (T - f.flashT) / 0.18; f.rig.c.setFlash(k >= 1 ? 0 : k < 0.3 ? 1 : (1 - k) / 0.7); if (k >= 1) f.flashT = null; }
      if (f.fly) { // 튕겨 날아가 떨어지기
        const q = f.fly, g = f.rig.g;
        q.t += dt; q.vy -= 18 * dt;
        g.position.x += q.vx * dt; g.position.y += q.vy * dt; g.rotation.z += q.w * dt;
        f.rig.c.setOpacity(Math.max(0, Math.min(1, (1.1 - q.t) / 0.45)));
        if (q.t > 1.15) { g.visible = false; f.fly = null; }
      }
    }
    for (let i = fxs.length - 1; i >= 0; i--) {
      const x = fxs[i];
      x.t += dt;
      const k = x.t / x.life;
      if (k >= 1) { scene.remove(x.m); x.m.material.dispose(); if (x.beam) x.m.geometry.dispose(); fxs.splice(i, 1); continue; }
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
