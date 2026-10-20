// 규칙 (랑그릿사 모바일식): 한 칸 = 영웅 + 배속 병사. 이동 범위(지형·지배 영역), 병종 상성, 전투 계산
// (병사가 먼저 맞고, 남은 피해가 영웅에게), 특기(재사용 대기), 경험치, 적 무리 순차 등장, 승패, 적 판단.
// 화면과 무관한 순수 계산이라 node에서도 돌아간다 (tools/sim.js).
(function (root) {
  const D = root.DATA;
  const { TERRAIN, BEATS, SKILLS, HEROES, TIER_LV, MAX_LV, TROOPS, ENEMIES } = D;

  const R = {};
  let uid = 0;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  R.DIRS = DIRS;

  // ── 지도 ───────────────────────────────────────────────
  R.newGame = function (stage) {
    const map = stage.map.map((row) => row.split(''));
    return { stage, map, w: map[0].length, h: map.length, units: [], turn: 1, side: 'p', wave: 0 };
  };
  R.inB = (G, x, y) => x >= 0 && y >= 0 && x < G.w && y < G.h;
  R.terr = (G, x, y) => TERRAIN[G.map[y][x]] || TERRAIN['.'];
  R.dist = (a, b, c, d) => Math.abs(a - c) + Math.abs(b - d);
  R.unitAt = (G, x, y) => G.units.find((u) => u.alive && u.x === x && u.y === y) || null;
  R.cost = (G, u, x, y) => R.terr(G, x, y).cost[u.move];

  // ── 유닛 생성 ──────────────────────────────────────────
  function troopOf(key) {
    if (!key) return null;
    const t = TROOPS[key];
    return { key, def: t, name: t.name, rig: t.rig, icon: t.icon, kind: t.kind, hp: 0, hpMax: 0 };
  }
  // 영웅: st = save.heroes[id] = {lv, exp, tier}, troopKey = 배속 병사
  R.makeHero = function (G, id, st, troopKey, x, y) {
    const h = HEROES[id];
    const tier = h.tiers[st.tier];
    const u = {
      uid: ++uid, side: 'p', key: id, def: h, name: h.name, rig: h.rig, icon: h.icon, kind: h.kind, move: h.move, rng: h.rng,
      lv: st.lv, exp: st.exp, tier: st.tier, cls: tier.cls, x, y, alive: true, acted: false, buffs: [], cd: {}, lead: !!h.lead,
      troop: troopOf(troopKey && tier.troops.includes(troopKey) ? troopKey : tier.troops[0]),
    };
    fill(u);
    G.units.push(u);
    return u;
  };
  R.makeEnemy = function (G, type, lv, x, y, opt = {}) {
    const e = ENEMIES[type];
    const u = {
      uid: ++uid, side: 'e', key: type, def: e, name: e.name, rig: e.rig, icon: e.icon, kind: e.kind, move: e.move, rng: e.rng,
      lv, exp: 0, tier: 0, cls: e.big ? '철충 지휘 개체' : '철충', x, y, alive: true, acted: false, buffs: [], cd: {},
      troop: troopOf(e.troop), ai: opt.ai || 'charge', home: [x, y], boss: !!opt.boss,
    };
    fill(u);
    G.units.push(u);
    return u;
  };
  function fill(u) {
    u.hpMax = Math.round(R.heroStat(u, 'hp'));
    u.hp = u.hpMax;
    if (u.troop) { u.troop.hpMax = Math.round(R.troopStat(u, 'hp')); u.troop.hp = u.troop.hpMax; }
  }

  // 주변 빈 칸 (가까운 칸부터, 기준 칸 포함)
  R.freeAround = function (G, x, y, move, n) {
    const out = [];
    for (let r = 0; r <= 5 && out.length < n; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dy) !== r || out.length >= n) continue;
        const tx = x + dx, ty = y + dy;
        if (!R.inB(G, tx, ty) || R.unitAt(G, tx, ty) || R.terr(G, tx, ty).cost[move] >= 99) continue;
        if (out.some((p) => p[0] === tx && p[1] === ty)) continue;
        out.push([tx, ty]);
      }
    }
    return out;
  };
  // 적 무리 i 를 지도에 내보낸다
  R.spawnWave = function (G, i) {
    const w = G.stage.waves[i];
    if (!w) return [];
    G.wave = i;
    const spots = R.freeAround(G, w.at[0], w.at[1], 'foot', w.units.length);
    return w.units.map(([t, lv], k) => spots[k] && R.makeEnemy(G, t, lv, spots[k][0], spots[k][1], { boss: w.boss === t, ai: w.boss === t ? 'guard' : 'charge' })).filter(Boolean);
  };

  // ── 수치 ───────────────────────────────────────────────
  R.tierOf = (u) => (u.side === 'p' ? u.def.tiers[u.tier] : null);
  const buffK = (u, k) => 1 + u.buffs.reduce((s, b) => s + (b[k] || 0), 0);
  R.buffK = buffK;
  R.heroStat = function (u, k) {
    if (u.side === 'p') {
      const t = u.def.tiers[u.tier];
      if (k === 'mov') return t.mov;
      return t[k] * (1 + 0.07 * (u.lv - TIER_LV[u.tier]));
    }
    if (k === 'mov') return u.def.mov;
    return u.def[k] * (1 + 0.07 * (u.lv - 1));
  };
  // 병사: 기본 x 레벨 성장 + 영웅 공방의 25%
  R.troopStat = function (u, k) {
    const t = u.troop.def;
    const v = t[k] * (1 + 0.06 * (u.lv - 1));
    return k === 'hp' ? v : v + R.heroStat(u, k) * 0.25;
  };
  R.atk = (u, part) => (part === 'T' ? R.troopStat(u, 'at') : R.heroStat(u, 'at')) * buffK(u, 'at');
  R.def = (u, part) => (part === 'T' ? R.troopStat(u, 'df') : R.heroStat(u, 'df')) * buffK(u, 'df');
  R.mov = (u) => Math.max(1, Math.round(R.heroStat(u, 'mov') + u.buffs.reduce((s, b) => s + (b.mov || 0), 0) - (u.slow || 0)));
  R.troopAlive = (u) => !!(u.troop && u.troop.hp > 0);
  R.total = (u) => u.hp + (u.troop ? u.troop.hp : 0);
  R.totalMax = (u) => u.hpMax + (u.troop ? u.troop.hpMax : 0);
  R.skillsOf = (u) => (u.side === 'p' ? u.def.tiers[u.tier].skills : u.def.skills || []);

  // ── 이동 범위 ──────────────────────────────────────────
  // 적 유닛 칸은 지나갈 수 없고, 적과 맞닿은 칸(지배 영역)에 들어가면 그 자리에서 멈춘다. 아군 칸은 지나가기만.
  R.zoc = (G, u, x, y) => DIRS.some(([dx, dy]) => { const o = R.unitAt(G, x + dx, y + dy); return o && o.side !== u.side; });
  R.reach = function (G, u, movOverride) {
    const mov = movOverride != null ? movOverride : R.mov(u);
    const best = new Map();
    const key = (x, y) => y * 64 + x;
    best.set(key(u.x, u.y), { x: u.x, y: u.y, c: 0, prev: null });
    const q = [[u.x, u.y, 0]];
    while (q.length) {
      q.sort((a, b) => a[2] - b[2]);
      const [x, y, c] = q.shift();
      if (c > best.get(key(x, y)).c) continue;
      if ((x !== u.x || y !== u.y) && R.zoc(G, u, x, y)) continue;
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
    for (const v of best.values()) { const o = R.unitAt(G, v.x, v.y); v.stop = !o || o === u; }
    best.key = key;
    return best;
  };
  R.path = function (reach, x, y) {
    const out = [];
    let n = reach.get(reach.key(x, y));
    while (n) { out.unshift([n.x, n.y]); n = n.prev != null ? reach.get(n.prev) : null; }
    return out;
  };
  R.targetsFrom = (G, u, x, y) => G.units.filter((o) => o.alive && o.side !== u.side && R.dist(x, y, o.x, o.y) >= 1 && R.dist(x, y, o.x, o.y) <= u.rng);

  // ── 전투 ───────────────────────────────────────────────
  R.ADV = 1.3; R.DISADV = 0.75;
  R.typeRel = (a, b) => (BEATS[a] && BEATS[a].includes(b) ? 1 : BEATS[b] && BEATS[b].includes(a) ? -1 : 0);
  const relK = (a, b) => { const r = R.typeRel(a, b); return r > 0 ? R.ADV : r < 0 ? R.DISADV : 1; };
  const terrDef = (G, u, x, y) => (u.move === 'fly' ? 0 : R.terr(G, x, y).def);
  // a(상태 sa)가 d(상태 sd)를 한 번 친다. 상태 = { hp, thp, x, y }. 반환: 병사·영웅 피해
  function strike(G, a, sa, d, sd, dist, k, rnd) {
    const front = d.troop && sd.thp > 0 ? 'T' : 'H';
    const dKind = front === 'T' ? d.troop.kind : d.kind;
    const dDef = R.def(d, front) * (1 + terrDef(G, d, sd.x, sd.y));
    // 피해 = 공격 x 상성 x 공/(공+방) x 1.5 (방어가 높아도 0이 되지 않는다)
    const part = (A, kind) => A * relK(kind, dKind) * (A / (A + dDef)) * 1.5 * (kind === 'arch' && dist === 1 ? 0.7 : 1);
    let dmg = part(R.atk(a, 'H'), a.kind);
    if (a.troop && sa.thp > 0) dmg += part(R.atk(a, 'T'), a.troop.kind) * (0.4 + 0.6 * sa.thp / a.troop.hpMax);
    dmg *= k * (rnd ? 0.9 + rnd() * 0.2 : 1);
    const toT = front === 'T' ? Math.min(sd.thp, dmg) : 0;
    const toH = Math.min(sd.hp, (dmg - toT) * (front === 'T' ? 0.8 : 1));
    return { toT, toH, rel: R.typeRel(a.troop && sa.thp > 0 ? a.troop.kind : a.kind, dKind) };
  }
  // 공격자 a가 (ax, ay)에서 방어자 d를 공격. rnd가 없으면 기댓값(예상치)
  R.combat = function (G, a, d, ax = a.x, ay = a.y, rnd = null) {
    const dist = R.dist(ax, ay, d.x, d.y);
    const sa = { hp: a.hp, thp: a.troop ? a.troop.hp : 0, x: ax, y: ay };
    const sd = { hp: d.hp, thp: d.troop ? d.troop.hp : 0, x: d.x, y: d.y };
    const r = (v) => (rnd ? Math.round(v) : v);
    const s1 = strike(G, a, sa, d, sd, dist, 1, rnd);
    s1.toT = r(s1.toT); s1.toH = r(s1.toH);
    sd.thp -= s1.toT; sd.hp -= s1.toH;
    let s2 = { toT: 0, toH: 0, rel: 0 };
    const counter = dist <= d.rng && sd.hp > 0.5;
    if (counter) { s2 = strike(G, d, sd, a, sa, dist, 0.8, rnd); s2.toT = r(s2.toT); s2.toH = r(s2.toH); }
    return {
      dT: s1.toT, dH: s1.toH, aT: s2.toT, aH: s2.toH, counter, dist, rel: s1.rel,
      dDead: d.hp - s1.toH <= 0.5, aDead: a.hp - s2.toH <= 0.5,
    };
  };
  R.apply = function (u, toT, toH) {
    if (u.troop) u.troop.hp = Math.max(0, u.troop.hp - toT);
    u.hp = Math.max(0, u.hp - toH);
  };

  // ── 특기 ───────────────────────────────────────────────
  R.skillReady = (u, sk) => !(u.cd[sk] > 0);
  R.skillTargets = function (G, u, sk) {
    const s = SKILLS[sk];
    const out = [];
    if (s.tgt === 'self') return [[u.x, u.y]];
    if (s.tgt === 'line') { for (const [dx, dy] of DIRS) if (R.inB(G, u.x + dx, u.y + dy)) out.push([u.x + dx, u.y + dy]); return out; }
    for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
      const dd = R.dist(u.x, u.y, x, y);
      if (dd > s.range || (s.tgt === 'enemy' && dd === 0)) continue;
      const o = R.unitAt(G, x, y);
      if (s.tgt === 'enemy' && !(o && o.side !== u.side)) continue;
      if (s.tgt === 'ally' && !(o && o.side === u.side)) continue;
      out.push([x, y]);
    }
    return out;
  };
  R.skillArea = function (G, u, sk, tx, ty) {
    const s = SKILLS[sk];
    const out = [];
    const push = (x, y) => { if (R.inB(G, x, y)) out.push([x, y]); };
    if (s.radius != null) { for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) if (R.dist(u.x, u.y, x, y) <= s.radius) push(x, y); return out; }
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
  // 효과 대상과 결과: 피해 {u, toT, toH} / 회복·강화 {u, hT, hH, buff}
  R.skillEffect = function (G, u, sk, tx, ty, rnd) {
    const s = SKILLS[sk];
    const res = [];
    for (const [x, y] of R.skillArea(G, u, sk, tx, ty)) {
      const o = R.unitAt(G, x, y);
      if (!o) continue;
      if (s.power && o.side !== u.side) {
        const front = R.troopAlive(o) ? 'T' : 'H';
        const A = R.atk(u, 'H') * s.power, Df = R.def(o, front) * (1 + terrDef(G, o, o.x, o.y));
        const dmg = A * (A / (A + Df)) * 1.8 * (rnd ? 0.9 + rnd() * 0.2 : 1);
        const toT = front === 'T' ? Math.min(o.troop.hp, dmg) : 0;
        const toH = Math.min(o.hp, (dmg - toT) * (front === 'T' ? 0.8 : 1));
        res.push({ u: o, toT: rnd ? Math.round(toT) : toT, toH: rnd ? Math.round(toH) : toH });
      } else if ((s.heal || s.buff) && o.side === u.side) {
        const hH = s.heal ? Math.min(o.hpMax - o.hp, Math.round(o.hpMax * s.heal)) : 0;
        const hT = s.heal && o.troop ? Math.min(o.troop.hpMax - o.troop.hp, Math.round(o.troop.hpMax * s.heal)) : 0;
        res.push({ u: o, hH, hT, buff: s.buff || null });
      }
    }
    return res;
  };

  // ── 경험치 ─────────────────────────────────────────────
  R.expFor = function (src, tgt, dmg, killed) {
    if (src.side !== 'p') return 0;
    const lvK = Math.max(0.4, Math.min(2.5, 1 + (tgt.lv - src.lv) * 0.12));
    let e = (dmg / R.totalMax(tgt)) * 48 * lvK;
    if (killed) e += (tgt.boss ? 70 : tgt.def.big ? 36 : 16) * lvK;
    return Math.round(e);
  };
  R.addExp = function (u, e) {
    if (!u || u.side !== 'p') return 0;
    let ups = 0;
    u.exp += e;
    while (u.exp >= 100 && u.lv < MAX_LV) { u.exp -= 100; u.lv++; ups++; }
    if (u.lv >= MAX_LV) u.exp = Math.min(u.exp, 99);
    return ups;
  };

  // ── 승패 ───────────────────────────────────────────────
  R.check = function (G) {
    const lead = G.units.find((u) => u.lead);
    if (lead && !lead.alive) return 'lose';
    if (!G.units.some((u) => u.alive && u.side === 'p')) return 'lose';
    if (G.stage.win === 'boss') { const b = G.units.find((u) => u.boss); if (b && !b.alive) return 'win'; }
    if (!G.units.some((u) => u.alive && u.side === 'e') && G.wave >= G.stage.waves.length - 1) return 'win';
    return null;
  };

  // ── 적 판단 ────────────────────────────────────────────
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
        if (c + k < f[ny * G.w + nx]) { f[ny * G.w + nx] = c + k; q.push([nx, ny, c + k]); }
      }
    }
    return f;
  };
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
  const value = (o) => (o.lead ? 2.4 : o.boss ? 2 : 1);
  const caution = (u) => (u.lead ? 2.2 : u.boss ? 1.2 : u.side === 'p' && u.hp < u.hpMax * 0.5 ? 1.2 : 0);
  // 한 유닛의 할 일: { to:[x,y], act:'attack'|'skill'|'wait', target, skill, tx, ty }
  R.plan = function (G, u, fields) {
    const reach = R.reach(G, u);
    const tiles = [...reach.values()].filter((t) => t.stop && (u.ai !== 'guard' || R.dist(t.x, t.y, u.home[0], u.home[1]) <= 2));
    const th = caution(u) ? (fields.threat || (fields.threat = R.threatMap(G, u.side))) : null;
    const risk = (x, y) => (th ? Math.max(0, th[y * G.w + x] - 1) * caution(u) : 0);
    const myMax = R.totalMax(u);
    let best = null;
    const consider = (sc, p) => { if (!best || sc > best.sc) best = { sc, ...p }; };
    for (const t of tiles) {
      const terrK = terrDef(G, u, t.x, t.y) * 3;
      for (const o of R.targetsFrom(G, u, t.x, t.y)) {
        const e = R.combat(G, u, o, t.x, t.y);
        let sc = ((e.dT + e.dH * 1.6) / R.totalMax(o)) * 10 * value(o) - ((e.aT + e.aH * 1.6) / myMax) * 10 * value(u) * 0.7 + terrK - risk(t.x, t.y);
        if (e.dDead) sc += 6 * value(o);
        if (e.aDead) sc -= 12 * value(u);
        consider(sc, { to: [t.x, t.y], act: 'attack', target: o });
      }
    }
    for (const sk of R.skillsOf(u)) {
      if (!R.skillReady(u, sk)) continue;
      const s = SKILLS[sk];
      for (const [tx, ty] of R.skillTargets(G, u, sk)) {
        let sc = 0;
        for (const r of R.skillEffect(G, u, sk, tx, ty)) {
          if (r.toT != null) sc += ((r.toT + r.toH * 1.6) / R.totalMax(r.u)) * 10 * value(r.u) + (r.toH >= r.u.hp - 0.5 ? 6 : 0);
          if (r.hH != null) sc += ((r.hH * 1.6 + r.hT) / R.totalMax(r.u)) * 9 * value(r.u) + (r.buff ? 0.8 : 0);
        }
        if (s.buff && !G.units.some((o) => o.alive && o.side !== u.side && R.dist(o.x, o.y, u.x, u.y) <= 6)) sc = 0;
        consider(sc - 0.5 - risk(u.x, u.y), { to: [u.x, u.y], act: 'skill', skill: sk, tx, ty });
      }
    }
    if (best && best.sc > -1) return best;
    if (u.ai === 'guard') return { to: [u.x, u.y], act: 'wait' };
    const f = fields[u.move + u.side] || (fields[u.move + u.side] = R.distField(G, u.move, u.side));
    let mv = null;
    for (const t of tiles) {
      let sc = f[t.y * G.w + t.x];
      if (u.hp < u.hpMax * 0.35 && u.side === 'p') sc = -sc * 0.3;
      sc -= terrDef(G, u, t.x, t.y) * 0.5;
      sc += risk(t.x, t.y) * 1.5;
      if (!mv || sc < mv.sc) mv = { sc, t };
    }
    return mv ? { to: [mv.t.x, mv.t.y], act: 'wait' } : { to: [u.x, u.y], act: 'wait' };
  };

  root.RULES = R;
})(typeof window !== 'undefined' ? window : globalThis);
