// 규칙: 유닛 수치, 이동 범위(지형·지배 영역), 지휘 범위, 병종 상성, 전투 계산, 특기, 경험치, 적 판단.
// 화면과 무관한 순수 계산이라 node에서도 돌아간다 (tools/sim.js).
(function (root) {
  const D = root.DATA;
  const { TERRAIN, BEATS, SKILLS, HEROES, TIER_LV, MAX_LV, TROOPS, BOSSES } = D;

  const R = {};
  let uid = 0;

  // ── 지도 ───────────────────────────────────────────────
  R.newGame = function (stage) {
    const map = stage.map.map((row) => row.split(''));
    return { stage, map, w: map[0].length, h: map.length, units: [], turn: 1, side: 'p', log: [], squads: {} };
  };
  R.inB = (G, x, y) => x >= 0 && y >= 0 && x < G.w && y < G.h;
  R.terr = (G, x, y) => TERRAIN[G.map[y][x]] || TERRAIN['.'];
  R.dist = (a, b, c, d) => Math.abs(a - c) + Math.abs(b - d);
  R.unitAt = (G, x, y) => G.units.find((u) => u.alive && u.x === x && u.y === y) || null;
  R.cost = (G, u, x, y) => R.terr(G, x, y).cost[u.move];
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  R.DIRS = DIRS;

  // ── 유닛 생성 ──────────────────────────────────────────
  // 영웅의 성장 상태(save.heroes[id] = {lv, exp, tier})를 받아 지휘관을 만든다
  R.makeHero = function (G, id, st, x, y) {
    const h = HEROES[id];
    const tier = h.tiers[st.tier];
    const u = {
      uid: ++uid, side: 'p', cmd: true, key: id, def: h, name: h.name, rig: h.rig, icon: h.icon,
      kind: h.kind, move: h.move, rng: h.rng, lv: st.lv, exp: st.exp, tier: st.tier, cls: tier.cls,
      x, y, hp: 10, mp: tier.mp, troops: [], alive: true, acted: false, buffs: [], lead: !!h.lead,
    };
    G.units.push(u);
    return u;
  };
  R.makeBoss = function (G, spec) {
    const b = BOSSES[spec.cmd];
    const u = {
      uid: ++uid, side: 'e', cmd: true, key: spec.cmd, def: b, name: spec.name || b.name, rig: b.rig, icon: b.icon,
      kind: b.kind, move: b.move, rng: b.rng, lv: spec.lv || 1, exp: 0, tier: 0, cls: '철충 지휘 개체',
      x: spec.x, y: spec.y, hp: 10, mp: b.mp, troops: [], alive: true, acted: false, buffs: [],
      ai: spec.ai || 'charge', range: spec.range || 6, home: [spec.x, spec.y], boss: !!spec.boss, squad: ++uid,
    };
    G.units.push(u);
    G.squads[u.squad] = { woke: u.ai === 'charge' };
    for (const [t, x, y] of spec.troops || []) R.makeTroop(G, t, u, x, y);
    return u;
  };
  R.makeTroop = function (G, type, cmdr, x, y) {
    const t = TROOPS[type];
    const u = {
      uid: ++uid, side: cmdr.side, cmd: false, key: type, def: t, name: t.name, rig: t.rig, icon: t.icon,
      kind: t.kind, move: t.move, rng: t.rng, lv: cmdr.lv, x, y, hp: 10, mp: 0, alive: true, acted: false, buffs: [],
      cmdr, ai: cmdr.ai, range: cmdr.range, home: [x, y], squad: cmdr.squad,
    };
    cmdr.troops.push(u);
    G.units.push(u);
    return u;
  };

  // 지휘관 주변 빈 칸에 용병 배치 (가까운 칸부터)
  R.freeAround = function (G, x, y, u, n) {
    const out = [];
    for (let r = 1; r <= 4 && out.length < n; r++) {
      const ring = [];
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dy) !== r) continue;
        const tx = x + dx, ty = y + dy;
        if (!R.inB(G, tx, ty) || R.unitAt(G, tx, ty) || R.terr(G, tx, ty).cost[u.move] >= 99) continue;
        if (out.some((p) => p[0] === tx && p[1] === ty)) continue;
        ring.push([tx, ty, Math.abs(dy) * 1.01 + (dy > 0 ? 0.3 : 0)]);
      }
      ring.sort((a, b) => a[2] - b[2]);
      for (const p of ring) if (out.length < n) out.push([p[0], p[1]]);
    }
    return out;
  };

  // ── 수치 ───────────────────────────────────────────────
  R.tierOf = (u) => (u.side === 'p' && u.cmd ? u.def.tiers[u.tier] : null);
  function baseStat(u, k) {
    if (u.cmd && u.side === 'p') {
      const t = u.def.tiers[u.tier];
      if (k === 'at' || k === 'df') return t[k] + u.def.grow[k] * (u.lv - TIER_LV[u.tier]);
      return t[k];
    }
    if (u.cmd) { // 적 지휘관: 레벨당 공방 +1
      const b = u.def;
      if (k === 'at' || k === 'df') return b[k] + (u.lv - 1);
      return b[k];
    }
    const t = u.def; // 용병: 지휘관 레벨에 따라 조금씩 강해진다
    if (k === 'at' || k === 'df') return t[k] + (u.cmdr.lv - 1) * (u.side === 'p' ? 0.4 : 0.6);
    return t[k];
  }
  R.baseStat = baseStat;
  R.buffSum = (u, k) => u.buffs.reduce((s, b) => s + (b[k] || 0), 0);
  // 지휘 범위 안의 용병인가
  R.inAura = (u, x = u.x, y = u.y) => !u.cmd && u.cmdr && u.cmdr.alive && R.dist(x, y, u.cmdr.x, u.cmdr.y) <= baseStat(u.cmdr, 'cmd');
  R.auraBonus = (u, k, x, y) => (R.inAura(u, x, y) ? baseStat(u.cmdr, k === 'at' ? 'ca' : 'cd') : 0);
  R.stat = (u, k, x = u.x, y = u.y) => {
    let v = baseStat(u, k) + R.buffSum(u, k);
    if (k === 'at' || k === 'df') v += R.auraBonus(u, k, x, y);
    return k === 'mov' ? Math.max(1, Math.round(v)) : v;
  };
  R.maxMp = (u) => (u.cmd ? baseStat(u, 'mp') : 0);
  R.skillsOf = (u) => (!u.cmd ? [] : u.side === 'p' ? u.def.tiers[u.tier].skills : u.def.skills);

  // ── 이동 범위 ──────────────────────────────────────────
  // 적 유닛 칸은 지나갈 수 없고, 적과 맞닿은 칸(지배 영역)에 들어가면 그 자리에서 멈춘다.
  // 아군 유닛 칸은 지나갈 수 있지만 멈출 수 없다.
  R.zoc = (G, u, x, y) => DIRS.some(([dx, dy]) => { const o = R.unitAt(G, x + dx, y + dy); return o && o.side !== u.side; });
  R.reach = function (G, u, movOverride) {
    const mov = movOverride != null ? movOverride : R.stat(u, 'mov');
    const best = new Map();
    const key = (x, y) => y * 64 + x;
    best.set(key(u.x, u.y), { x: u.x, y: u.y, c: 0, prev: null });
    const q = [[u.x, u.y, 0]];
    while (q.length) {
      q.sort((a, b) => a[2] - b[2]);
      const [x, y, c] = q.shift();
      if (c > best.get(key(x, y)).c) continue;
      if ((x !== u.x || y !== u.y) && R.zoc(G, u, x, y)) continue; // 지배 영역: 더 못 나아간다
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (!R.inB(G, nx, ny)) continue;
        const o = R.unitAt(G, nx, ny);
        if (o && o.side !== u.side) continue;
        const nc = c + R.cost(G, u, nx, ny);
        if (nc > mov) continue;
        const k = key(nx, ny), b = best.get(k);
        if (b && b.c <= nc) continue;
        best.set(k, { x: nx, y: ny, c: nc, prev: key(x, y) });
        q.push([nx, ny, nc]);
      }
    }
    // 아군이 서 있는 칸은 멈출 수 없다 (경로로만)
    for (const [k, v] of best) { const o = R.unitAt(G, v.x, v.y); v.stop = !o || o === u; }
    best.key = key;
    return best;
  };
  R.path = function (reach, x, y) {
    const out = [];
    let n = reach.get(reach.key(x, y));
    while (n) { out.unshift([n.x, n.y]); n = n.prev != null ? reach.get(n.prev) : null; }
    return out;
  };
  // 그 칸에서 공격할 수 있는 적
  R.targetsFrom = (G, u, x, y) => G.units.filter((o) => o.alive && o.side !== u.side && R.dist(x, y, o.x, o.y) >= 1 && R.dist(x, y, o.x, o.y) <= u.rng);

  // ── 전투 ───────────────────────────────────────────────
  R.typeRel = (a, b) => (BEATS[a] && BEATS[a].includes(b) ? 1 : BEATS[b] && BEATS[b].includes(a) ? -1 : 0);
  // 상성 우위면 공방 x1.25, 열세면 x0.85. 사격은 붙어서 싸우면 공격 x0.7.
  R.ADV = 1.25; R.DISADV = 0.85;
  function eff(u, o, ux, uy, d) {
    const rel = R.typeRel(u.kind, o.kind);
    const m = rel > 0 ? R.ADV : rel < 0 ? R.DISADV : 1;
    let A = R.stat(u, 'at', ux, uy) * m;
    if (u.kind === 'arch' && d === 1) A *= 0.7;
    let tdef = R.terr(G0(u), ux, uy).def;
    if (u.move === 'fly') tdef = 0;
    const Df = R.stat(u, 'df', ux, uy) * m * (1 + tdef);
    return { A, D: Df, rel };
  }
  // eff()가 지형을 보려면 지도가 필요하다: 전투 계산 중에만 잠깐 걸어 둔다
  let curG = null;
  const G0 = () => curG;
  const K = 0.8, ROUNDS = 3;
  R.hitP = (A, D, first) => Math.min(0.95, Math.max(0.05, 0.5 + (A - D) * 0.045 + (first ? 0.05 : 0)));
  // 공격자 a가 (ax, ay)에서 방어자 d를 공격. rnd가 없으면 기댓값(예상치)
  R.combat = function (G, a, d, ax = a.x, ay = a.y, rnd = null) {
    curG = G;
    const dist = R.dist(ax, ay, d.x, d.y);
    const ea = eff(a, d, ax, ay, dist), ed = eff(d, a, d.x, d.y, dist);
    const counter = dist <= d.rng;
    const pa = R.hitP(ea.A, ed.D, true), pd = counter ? R.hitP(ed.A, ea.D, false) * (d.kind === 'arch' && dist === 1 ? 0.6 : 1) : 0;
    let ha = a.hp, hd = d.hp;
    const rounds = [];
    for (let r = 0; r < ROUNDS && ha > 0 && hd > 0; r++) {
      let ka, kd;
      if (rnd) {
        ka = 0; kd = 0;
        const na = Math.ceil(ha), nd = Math.ceil(hd);
        for (let i = 0; i < na; i++) if (rnd() < pa * K) ka++;
        for (let i = 0; i < nd; i++) if (rnd() < pd * K) kd++;
      } else { ka = ha * pa * K; kd = hd * pd * K; }
      // 3라운드에 나눠 싸운다: 라운드마다 1/3씩
      if (rnd) { ka = Math.round(ka / ROUNDS + (rnd() - 0.5) * 0.9); kd = Math.round(kd / ROUNDS + (rnd() - 0.5) * 0.9); ka = Math.max(0, ka); kd = Math.max(0, kd); }
      else { ka /= ROUNDS; kd /= ROUNDS; }
      ka = Math.min(ka, hd); kd = Math.min(kd, ha);
      hd -= ka; ha -= kd;
      rounds.push({ toD: ka, toA: kd });
    }
    curG = null;
    return { aLoss: a.hp - ha, dLoss: d.hp - hd, aHp: ha, dHp: hd, counter, pa, pd, relA: ea.rel, rounds, dist };
  };
  // 예상치 표시용 (반올림)
  R.preview = function (G, a, d, ax, ay) {
    const e = R.combat(G, a, d, ax, ay);
    return { ...e, aLossR: Math.round(e.aLoss), dLossR: Math.round(e.dLoss) };
  };

  // ── 특기 ───────────────────────────────────────────────
  // 특기를 쓸 수 있는 목표 칸 목록
  R.skillTargets = function (G, u, sk) {
    const s = SKILLS[sk];
    const out = [];
    if (s.tgt === 'self') return [[u.x, u.y]];
    if (s.tgt === 'line') { for (const [dx, dy] of DIRS) if (R.inB(G, u.x + dx, u.y + dy)) out.push([u.x + dx, u.y + dy]); return out; }
    for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
      const dd = R.dist(u.x, u.y, x, y);
      if (dd > s.range || (s.tgt !== 'ally' && dd === 0 && s.tgt !== 'tile')) continue;
      const o = R.unitAt(G, x, y);
      if (s.tgt === 'enemy' && !(o && o.side !== u.side)) continue;
      if (s.tgt === 'ally' && !(o && o.side === u.side)) continue;
      out.push([x, y]);
    }
    return out;
  };
  // 목표 칸을 골랐을 때 효과가 미치는 칸
  R.skillArea = function (G, u, sk, tx, ty) {
    const s = SKILLS[sk];
    const out = [];
    const push = (x, y) => { if (R.inB(G, x, y)) out.push([x, y]); };
    if (s.radius) { for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) if (R.dist(u.x, u.y, x, y) <= s.radius) push(x, y); return out; }
    if (s.area === 'adj') { DIRS.forEach(([dx, dy]) => push(u.x + dx, u.y + dy)); return out; }
    if (s.tgt === 'line') {
      const dx = Math.sign(tx - u.x), dy = Math.sign(ty - u.y);
      for (let i = 1; i <= s.len; i++) push(u.x + dx * i, u.y + dy * i);
      return out;
    }
    if (s.area === 'sq') { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) push(tx + dx, ty + dy); return out; }
    if (s.area === 1) { push(tx, ty); DIRS.forEach(([dx, dy]) => push(tx + dx, ty + dy)); return out; }
    push(tx, ty);
    return out;
  };
  // 효과 대상 유닛과 각자의 결과
  R.skillEffect = function (G, u, sk, tx, ty, rnd) {
    const s = SKILLS[sk];
    curG = G;
    const area = R.skillArea(G, u, sk, tx, ty);
    const res = [];
    for (const [x, y] of area) {
      const o = R.unitAt(G, x, y);
      if (!o) continue;
      if (s.power && o.side !== u.side) {
        let tdef = o.move === 'fly' ? 0 : R.terr(G, o.x, o.y).def;
        // 특기 피해: 2 + (공격x위력 - 방어)/5, 최대 6. 지휘관은 x0.7
        const A = R.stat(u, 'at') * s.power, Df = R.stat(o, 'df') * (1 + tdef);
        let dmg = Math.max(1, Math.min(6, 2 + (A - Df) / 5)) * (o.cmd ? 0.7 : 1);
        dmg = rnd ? Math.round(dmg * (0.85 + rnd() * 0.3)) : dmg;
        res.push({ u: o, dmg: Math.min(o.hp, Math.max(1, dmg)) });
      } else if ((s.heal || s.buff) && o.side === u.side) {
        res.push({ u: o, heal: s.heal ? Math.min(10 - o.hp, s.heal) : 0, buff: s.buff || null });
      }
    }
    curG = null;
    return res;
  };

  // ── 경험치 ─────────────────────────────────────────────
  R.expFor = function (src, tgt, dmg, killed) {
    const hero = src.cmd ? src : src.cmdr;
    if (!hero || hero.side !== 'p') return 0;
    const lvK = Math.max(0.4, Math.min(2, 1 + (tgt.lv - hero.lv) * 0.15));
    let e = dmg * (tgt.cmd ? 8 : 4) * lvK;
    if (killed) e += tgt.cmd ? 35 * lvK : 8;
    return Math.round(e);
  };
  // 경험치를 더하고 오른 레벨 수를 돌려준다
  R.addExp = function (hero, e) {
    if (!hero || hero.side !== 'p' || !hero.cmd) return 0;
    let ups = 0;
    hero.exp += e;
    while (hero.exp >= 100 && hero.lv < MAX_LV) { hero.exp -= 100; hero.lv++; ups++; }
    if (hero.lv >= MAX_LV) hero.exp = Math.min(hero.exp, 99);
    return ups;
  };

  // ── 승패 ───────────────────────────────────────────────
  R.check = function (G) {
    const st = G.stage;
    const lead = G.units.find((u) => u.lead);
    if (lead && !lead.alive) return 'lose';
    if (!G.units.some((u) => u.alive && u.side === 'p' && u.cmd)) return 'lose';
    if (st.win === 'boss') { const b = G.units.find((u) => u.boss); if (b && !b.alive) return 'win'; }
    if (!G.units.some((u) => u.alive && u.side === 'e' && u.cmd) && !G.pendingReinforce) return 'win';
    return null;
  };

  // ── 적 판단 ────────────────────────────────────────────
  // 이동 방식별로 '아군까지 남은 거리' 지도를 만든다 (유닛은 무시, 지형만)
  R.distField = function (G, move, side) {
    const INF = 1e9, f = new Float32Array(G.w * G.h).fill(INF);
    const q = [];
    for (const o of G.units) if (o.alive && o.side !== side) { f[o.y * G.w + o.x] = 0; q.push([o.x, o.y, 0]); }
    while (q.length) {
      q.sort((a, b) => a[2] - b[2]);
      const [x, y, c] = q.shift();
      if (c > f[y * G.w + x]) continue;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (!R.inB(G, nx, ny)) continue;
        const k = TERRAIN[G.map[ny][nx]].cost[move];
        if (k >= 99) continue;
        const nc = c + k;
        if (nc < f[ny * G.w + nx]) { f[ny * G.w + nx] = nc; q.push([nx, ny, nc]); }
      }
    }
    return f;
  };
  // 다음 차례에 상대가 칠 수 있는 칸마다 상대 수 (지휘관이 위험한 칸을 피하는 데 쓴다)
  R.threatMap = function (G, side) {
    const m = new Uint8Array(G.w * G.h);
    for (const o of G.units) {
      if (!o.alive || o.side === side) continue;
      const seen = new Uint8Array(G.w * G.h);
      for (const t of R.reach(G, o).values()) {
        if (!t.stop) continue;
        for (let dy = -o.rng; dy <= o.rng; dy++) for (let dx = -o.rng; dx <= o.rng; dx++) {
          const d = Math.abs(dx) + Math.abs(dy), x = t.x + dx, y = t.y + dy;
          if (d < 1 || d > o.rng || !R.inB(G, x, y)) continue;
          seen[y * G.w + x] = 1;
        }
      }
      for (let i = 0; i < m.length; i++) m[i] += seen[i];
    }
    return m;
  };
  const value = (o) => (o.lead ? 2.4 : o.cmd ? 1.7 : 1);
  const caution = (u) => (u.lead ? 2.2 : u.cmd ? (u.hp < 6 ? 1.4 : 0.7) : 0);
  // 한 유닛의 할 일: { to:[x,y], act:'attack'|'skill'|'wait', target, skill, tx, ty }
  R.plan = function (G, u, fields) {
    const sq = G.squads[u.squad] || { woke: true };
    if (!sq.woke && u.ai === 'hold') {
      const near = G.units.some((o) => o.alive && o.side !== u.side && R.dist(o.x, o.y, u.x, u.y) <= u.range);
      if (near) sq.woke = true; else return { to: [u.x, u.y], act: 'wait' };
    }
    const reach = R.reach(G, u);
    const tiles = [...reach.values()].filter((t) => t.stop && (u.ai !== 'guard' || R.dist(t.x, t.y, u.home[0], u.home[1]) <= 2));
    const th = caution(u) ? (fields.threat || (fields.threat = R.threatMap(G, u.side))) : null;
    const risk = (x, y) => (th ? Math.max(0, th[y * G.w + x] - 1) * caution(u) : 0);
    let best = null;
    const consider = (sc, p) => { if (!best || sc > best.sc) best = { sc, ...p }; };
    // 공격
    for (const t of tiles) {
      const terrK = (u.move === 'fly' ? 0 : R.terr(G, t.x, t.y).def) * 4;
      const auraK = !u.cmd ? (R.inAura(u, t.x, t.y) ? 1.5 : -1.5) : 0;
      for (const o of R.targetsFrom(G, u, t.x, t.y)) {
        const e = R.combat(G, u, o, t.x, t.y);
        let sc = e.dLoss * value(o) - e.aLoss * value(u) * (u.cmd ? 1.1 : 0.6) + terrK + auraK - risk(t.x, t.y);
        if (e.dHp <= 0.5) sc += o.cmd ? 12 : 4;
        if (u.cmd && e.aHp < 3) sc -= 6; // 지휘관은 무리하지 않는다
        consider(sc, { to: [t.x, t.y], act: 'attack', target: o });
      }
    }
    // 특기 (제자리에서)
    if (u.cmd) for (const sk of R.skillsOf(u)) {
      const s = SKILLS[sk];
      if (u.mp < s.mp) continue;
      for (const [tx, ty] of R.skillTargets(G, u, sk)) {
        const eff2 = R.skillEffect(G, u, sk, tx, ty);
        let sc = 0;
        for (const r of eff2) {
          if (r.dmg) sc += r.dmg * value(r.u) + (r.dmg >= r.u.hp ? 3 : 0);
          if (r.heal) sc += r.heal * value(r.u) * 0.9;
          if (r.buff) sc += 0.8;
        }
        if (s.buff) { const foes = G.units.some((o) => o.alive && o.side !== u.side && R.dist(o.x, o.y, u.x, u.y) <= 6); if (!foes) sc = 0; }
        consider(sc - 1, { to: [u.x, u.y], act: 'skill', skill: sk, tx, ty });
      }
    }
    if (best && best.sc > (u.cmd ? 0.5 : -1.5)) return best;
    // 접근
    if (u.ai === 'guard') return { to: [u.x, u.y], act: 'wait' };
    const f = fields[u.move] || (fields[u.move] = R.distField(G, u.move, u.side));
    let mv = null;
    for (const t of tiles) {
      let sc = f[t.y * G.w + t.x];
      if (!u.cmd && u.cmdr && u.cmdr.alive && !R.inAura(u, t.x, t.y)) sc += 2.5;
      if (u.cmd && u.troops.some((o) => o.alive)) sc += Math.max(0, 2 - f[t.y * G.w + t.x]) * 2; // 지휘관은 용병 뒤에
      if (u.cmd && u.hp < 5) sc = -sc * 0.3; // 지친 지휘관은 물러난다
      sc -= (u.move === 'fly' ? 0 : R.terr(G, t.x, t.y).def) * 0.5;
      sc += risk(t.x, t.y) * 1.5;
      if (!mv || sc < mv.sc) mv = { sc, t };
    }
    return mv ? { to: [mv.t.x, mv.t.y], act: 'wait' } : { to: [u.x, u.y], act: 'wait' };
  };

  root.RULES = R;
})(typeof window !== 'undefined' ? window : globalThis);
