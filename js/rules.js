// 규칙 (랑그릿사 모바일식): 한 칸 = 영웅 + 배속 병사. 이동 범위(지형·지배 영역), 병종 상성, 전투 계산
// (병사가 먼저 맞고, 남은 피해가 영웅에게), 특기(재사용 대기), 경험치, 적 무리 순차 등장, 승패, 적 판단.
// 화면과 무관한 순수 계산이라 node에서도 돌아간다 (tools/sim.js).
(function (root) {
  const D = root.DATA;
  const { TERRAIN, KIND, REL, SKILLS, HEROES, TIER_LV, MAX_LV, TROOPS, ENEMIES } = D;

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
    const CL = (typeof window !== 'undefined' && window.CLASSES) || null; // 전직 (js/classes.js): 직업마다 병종·이동·사거리·병사·특기·모습
    const tier = CL ? CL.cur(id, st) : h.tiers[st.tier];
    const u = {
      uid: ++uid, side: 'p', key: id, def: h, name: h.name, rig: CL ? CL.rigOf(id, st) : h.rig, icon: CL ? CL.iconOf(id, st) : h.icon,
      kind: tier.kind || h.kind, move: tier.move || h.move, rng: tier.rng || h.rng, form: CL ? tier : null,
      lv: st.lv, exp: st.exp, tier: st.tier, br: st.br || 'A', cls: tier.cls, x, y, alive: true, acted: false, buffs: [], cd: {}, lead: !!h.lead,
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
  // 적 무리 i 를 지도에 내보낸다 (처음 무리 이후는 증원: 바로 움직인다)
  R.spawnWave = function (G, i) {
    const w = G.stage.waves[i];
    if (!w) return [];
    G.wave = Math.max(G.wave, i);
    const spots = R.freeAround(G, w.at[0], w.at[1], 'foot', w.units.length);
    const list = w.units.map(([t, lv], k) => spots[k] && R.makeEnemy(G, t, lv, spots[k][0], spots[k][1], { boss: w.boss === t, ai: w.boss === t ? 'guard' : 'charge' })).filter(Boolean);
    if (i > 0) list.forEach((u) => { u.awake = true; });
    return list;
  };
  // 이 턴에 나올 증원 무리 번호들
  R.wavesAt = (G, turn) => G.stage.waves.map((w, i) => (i > 0 && (w.turn || 0) === turn ? i : -1)).filter((i) => i >= 0);
  R.nextWaveTurn = (G) => { const w = G.stage.waves.find((w, i) => i > G.wave && (w.turn || 0) >= G.turn); return w ? w.turn : 0; };

  // ── 수치 ───────────────────────────────────────────────
  R.tierOf = (u) => (u.side === 'p' ? u.def.tiers[u.tier] : null);
  const buffK = (u, k) => 1 + u.buffs.reduce((s, b) => s + (b[k] || 0), 0);
  R.buffK = buffK;
  R.heroStat = function (u, k) {
    if (u.side === 'p') {
      const t = u.form || u.def.tiers[u.tier];
      if (k === 'mov') return t.mov;
      const m = (u.form && u.form.m[k]) || 1; // 전직한 직업의 병종 경향
      // 레벨 성장은 1레벨부터 이어서 세고, 전직 단계마다 6%씩 더 (전직해도 약해지지 않게)
      return u.def.tiers[0][k] * (1 + 0.07 * (u.lv - 1)) * (1 + 0.06 * u.tier) * m;
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
  // 이동력 = 영웅과 (살아 있는) 병사 중 낮은 쪽
  R.mov = (u) => {
    let m = R.heroStat(u, 'mov');
    if (R.troopAlive(u)) m = Math.min(m, u.troop.def.mov);
    if (m <= 0) return 0; // 붙박이 적(언더왓쳐 몸통 등)은 움직이지 않는다
    return Math.max(1, Math.round(m + u.buffs.reduce((s, b) => s + (b.mov || 0), 0) - (u.slow || 0)));
  };
  // 남은 병사 수 (10명 부대)
  R.SQUAD = 10;
  R.soldiers = (u, thp = u.troop ? u.troop.hp : 0) => (u.troop && thp > 0.5 ? Math.max(1, Math.ceil((thp / u.troop.hpMax) * R.SQUAD - 1e-6)) : 0);
  R.troopAlive = (u) => !!(u.troop && u.troop.hp > 0);
  R.total = (u) => u.hp + (u.troop ? u.troop.hp : 0);
  R.totalMax = (u) => u.hpMax + (u.troop ? u.troop.hpMax : 0);
  R.skillsOf = (u) => (u.side === 'p' ? (u.form || u.def.tiers[u.tier]).skills : u.def.skills || []);

  // ── 이동 범위 ──────────────────────────────────────────
  // 적 칸은 지나갈 수 없고, 아군 칸은 지나가기만 한다.
  // 지배 영역(랑그릿사): 적과 맞닿는 칸에 들어서면 거기서 멈춘다 (처음부터 맞닿아 있던 칸에서는 떠날 수 있다)
  R.zoc = (G, u, x, y) => G.units.some((o) => o.alive && o.side !== u.side && Math.abs(o.x - x) + Math.abs(o.y - y) === 1);
  R.reach = function (G, u, movOverride) {
    const mov = movOverride != null ? movOverride : R.mov(u);
    const noZoc = R.trait(u, 'noZoc') > 0;
    const best = new Map();
    const key = (x, y) => y * 64 + x;
    best.set(key(u.x, u.y), { x: u.x, y: u.y, c: 0, prev: null });
    const q = [[u.x, u.y, 0]];
    while (q.length) {
      q.sort((a, b) => a[2] - b[2]);
      const [x, y, c] = q.shift();
      if (c > best.get(key(x, y)).c) continue;
      if (c > 0 && !noZoc && R.zoc(G, u, x, y)) { best.get(key(x, y)).zoc = true; continue; } // 지배 영역에 들어선 칸에서는 더 못 간다
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

  // ── 재능 (랑그릿사 모바일의 영웅 고유 재능) ─────────────
  // HEROES[id].talent = { name, desc, ...효과 }. 효과 종류:
  //   aura: { r, at, df }  주변 r칸 아군(자신 제외) 공격·방어 보정
  //   first: 먼저 공격할 때 피해 +   guard: 공격받을 때(반격 포함 모든 방어) 받는 피해 -
  //   hpHigh: [비율, +] 영웅 체력이 비율 이상이면 피해 +   hpLow: [비율, +] 영웅 체력이 비율 이하면 피해 +
  //   chase: [비율, +] 상대 총체력이 비율 이하면 피해 +   far: 2칸 이상 떨어져 공격할 때 피해 +
  //   slowed: 이동 감소가 걸린 상대에게 피해 +   troopGuard: 병사가 받는 피해 -
  const BOSS_TALENT = { name: '지휘 개체 장갑', guard: 0.15, desc: '받는 피해 -15% (큰 철충의 기본 재능)' };
  R.talentOf = (u) => (u.def && (u.def.talent || (u.side === 'e' && u.def.big ? BOSS_TALENT : null))) || null;
  // 수동 특기 (랑그릿사의 패시브): 전직 단계에 따라 풀린다. 재능과 같은 효과 칸을 쓰고, 아래 효과가 더 있다
  //   counterUp: 반격 피해 +   rangeCounter: 사거리 밖에서 맞아도 반격   noZoc: 지배 영역 무시
  //   regen: 차례 시작 회복   troopUp: 병사 공격 +   antiBig: 큰 철충에게 피해 +
  R.passivesOf = (u) => (u.side === 'p' && u.def && u.def.passives ? u.def.passives.filter((p) => p.tier <= u.tier) : []);
  R.traits = (u) => { const t = R.talentOf(u); return t ? [t, ...R.passivesOf(u)] : R.passivesOf(u); };
  R.trait = (u, k) => R.traits(u).reduce((s, t) => s + (t[k] || 0), 0);
  R.auraK = function (G, u, k) {
    let v = 0;
    for (const o of G.units) {
      if (!o.alive || o === u || o.side !== u.side) continue;
      const t = R.talentOf(o);
      if (t && t.aura && t.aura[k] && R.dist(o.x, o.y, u.x, u.y) <= t.aura.r) v = Math.max(v, t.aura[k]);
    }
    return 1 + v;
  };
  // a가 d를 칠 때 재능 배율 (init: a가 먼저 공격한 쪽인지, front: 맞는 쪽이 병사인지, sa·sd: 그 순간 상태)
  R.talentK = function (G, a, d, init, dist, sa, sd, front) {
    let k = 1;
    for (const ta of a.def ? R.traits(a) : []) {
      if (ta.first && init) k *= 1 + ta.first;
      if (ta.hpHigh && sa.hp >= a.hpMax * ta.hpHigh[0]) k *= 1 + ta.hpHigh[1];
      if (ta.hpLow && sa.hp <= a.hpMax * ta.hpLow[0]) k *= 1 + ta.hpLow[1];
      if (ta.chase && sd.hp + sd.thp <= R.totalMax(d) * ta.chase[0]) k *= 1 + ta.chase[1];
      if (ta.far && dist >= 2) k *= 1 + ta.far;
      if (ta.slowed && (d.slow || d.slowNext)) k *= 1 + ta.slowed;
      if (ta.counterUp && !init) k *= 1 + ta.counterUp;
      if (ta.antiBig && d.def && d.def.big) k *= 1 + ta.antiBig;
    }
    for (const td of d.def ? R.traits(d) : []) {
      if (td.guard) k *= 1 - td.guard;
      if (td.troopGuard && front === 'T') k *= 1 - td.troopGuard;
    }
    return k;
  };

  // 이번 교전에서 효과를 내는 재능·수동 특기 이름들. side: 'a' 공격하는 쪽 효과 / 'd' 막는 쪽 효과
  R.activeTraits = function (a, d, init, dist, sa, sd, front) {
    const out = [];
    for (const t of R.traits(a)) {
      if ((t.first && init) || (t.hpHigh && sa.hp >= a.hpMax * t.hpHigh[0]) || (t.hpLow && sa.hp <= a.hpMax * t.hpLow[0]) ||
        (t.chase && sd.hp + sd.thp <= R.totalMax(d) * t.chase[0]) || (t.far && dist >= 2) || (t.slowed && (d.slow || d.slowNext)) ||
        (t.counterUp && !init) || (t.antiBig && d.def && d.def.big) || (t.troopUp && sa.thp > 0)) out.push(t.name);
    }
    return out;
  };
  R.guardTraits = (d, front) => R.traits(d).filter((t) => t.guard || (t.troopGuard && front === 'T')).map((t) => t.name);

  // ── 전투 ───────────────────────────────────────────────
  // 상성: REL[공격][방어] 만큼 유리(+30% 등), 반대로 불리하면 그만큼 나눈다. 원거리 병종이 붙어서 싸우면 30%만.
  R.relX = (a, b) => (REL[a] && REL[a][b]) || 0;
  R.typeRel = (a, b) => (R.relX(a, b) ? 1 : R.relX(b, a) ? -1 : 0);
  const relK = (a, b) => (R.relX(a, b) ? 1 + R.relX(a, b) : R.relX(b, a) ? 1 / (1 + R.relX(b, a)) : 1);
  R.relK = relK;
  R.MELEE_RANGED = 0.3;
  const isRanged = (k) => !!(KIND[k] && KIND[k].ranged);
  const terrDef = (G, u, x, y) => (u.move === 'fly' ? 0 : R.terr(G, x, y).def);
  // a(상태 sa)가 d(상태 sd)를 한 번 친다. 상태 = { hp, thp, x, y }. 반환: 병사·영웅 피해
  function strike(G, a, sa, d, sd, dist, k, rnd, init) {
    const front = d.troop && sd.thp > 0 ? 'T' : 'H';
    const dKind = front === 'T' ? d.troop.kind : d.kind;
    const dDef = R.def(d, front) * (1 + terrDef(G, d, sd.x, sd.y)) * R.auraK(G, d, 'df');
    const aAt = R.auraK(G, a, 'at');
    // 피해 = 공격 x 상성 x 공/(공+방) x 1.1 (방어가 높아도 0이 되지 않는다)
    const part = (A, kind) => A * relK(kind, dKind) * (A / (A + dDef)) * 1.1 * (isRanged(kind) && dist === 1 ? R.MELEE_RANGED : 1);
    let dmg = part(R.atk(a, 'H') * aAt, a.kind);
    if (a.troop && sa.thp > 0) dmg += part(R.atk(a, 'T') * aAt * (1 + R.trait(a, 'troopUp')), a.troop.kind) * (R.soldiers(a, sa.thp) / R.SQUAD); // 남은 병사 수만큼
    dmg *= k * R.talentK(G, a, d, init, dist, sa, sd, front) * (rnd ? 0.9 + rnd() * 0.2 : 1);
    const toT = front === 'T' ? Math.min(sd.thp, dmg) : 0;
    const toH = Math.min(sd.hp, dmg - toT); // 병사가 다 쓰러지면 남은 피해는 영웅에게
    return { toT, toH, rel: R.typeRel(a.troop && sa.thp > 0 ? a.troop.kind : a.kind, dKind) };
  }
  // 공격자 a가 (ax, ay)에서 방어자 d를 공격. rnd가 없으면 기댓값(예상치)
  // 랑그릿사식 동시 전투: 교전을 ROUNDS 번의 짧은 접전으로 나눠 양쪽이 동시에 친다.
  // 접전마다 그 순간 남은 병사 수로 공격력이 정해지므로, 싸우는 도중 병사가 줄면 그만큼 약해진다.
  R.ROUNDS = 6;
  R.combat = function (G, a, d, ax = a.x, ay = a.y, rnd = null) {
    const dist = R.dist(ax, ay, d.x, d.y);
    const sa = { hp: a.hp, thp: a.troop ? a.troop.hp : 0, x: ax, y: ay };
    const sd = { hp: d.hp, thp: d.troop ? d.troop.hp : 0, x: d.x, y: d.y };
    const counter = dist <= d.rng || (dist <= 3 && R.trait(d, 'rangeCounter') > 0); // 대응 포격: 멀리서 맞아도 반격
    const N = R.ROUNDS, rounds = [];
    let rel = 0;
    for (let i = 0; i < N && sa.hp > 0.5 && sd.hp > 0.5; i++) {
      const s1 = strike(G, a, sa, d, sd, dist, 1 / N, rnd, true);
      const s2 = counter ? strike(G, d, sd, a, sa, dist, 0.8 / N, rnd, false) : { toT: 0, toH: 0 };
      if (!i) rel = s1.rel;
      sd.thp -= s1.toT; sd.hp -= s1.toH; sa.thp -= s2.toT; sa.hp -= s2.toH; // 동시에
      rounds.push({ dT: s1.toT, dH: s1.toH, aT: s2.toT, aH: s2.toH });
    }
    const sum = (k) => rounds.reduce((s, x) => s + x[k], 0);
    const r = (v) => (rnd ? Math.round(v) : v);
    const dT = r(sum('dT')), dH = r(sum('dH')), aT = r(sum('aT')), aH = r(sum('aH'));
    return {
      dT, dH, aT, aH, counter, dist, rel, rounds,
      dDead: d.hp - dH <= 0.5, aDead: a.hp - aH <= 0.5,
    };
  };
  R.apply = function (u, toT, toH) {
    if (toT + toH > 0) u.awake = true; // 맞으면 깨어난다
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
        const A = R.atk(u, 'H') * s.power * R.auraK(G, u, 'at'), Df = R.def(o, front) * (1 + terrDef(G, o, o.x, o.y)) * R.auraK(G, o, 'df');
        const dmg = A * (A / (A + Df)) * 1.8 * R.talentK(G, u, o, true, R.dist(u.x, u.y, o.x, o.y), { hp: u.hp, thp: u.troop ? u.troop.hp : 0 }, { hp: o.hp, thp: o.troop ? o.troop.hp : 0 }, front) * (rnd ? 0.9 + rnd() * 0.2 : 1);
        const toT = front === 'T' ? Math.min(o.troop.hp, dmg) : 0;
        const toH = Math.min(o.hp, dmg - toT);
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
  // 전투가 끝나면 참가자 전원(쓰러진 영웅 포함)이 같은 양을 받는다. 패배하면 절반.
  R.stageExp = (stageIndex, win) => Math.round((90 + 12 * stageIndex) * (win ? 1 : 0.5));
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
    if (!G.units.some((u) => u.alive && u.side === 'e')) return 'win'; // 증원 전에 다 잡으면 그대로 승리
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
    if (u.side === 'e' && !u.awake) { // 낚기: 아군이 이 적의 공격 범위(이동+사거리)에 들어와야 깨어난다
      const hit = [...reach.values()].some((t) => t.stop && G.units.some((o) => o.alive && o.side !== u.side && R.dist(t.x, t.y, o.x, o.y) <= u.rng));
      if (!hit) return { to: [u.x, u.y], act: 'wait' };
      u.awake = true;
    }
    const tiles = [...reach.values()].filter((t) => t.stop && (u.ai !== 'guard' || R.dist(t.x, t.y, u.home[0], u.home[1]) <= 2));
    const th = caution(u) ? (fields.threat || (fields.threat = R.threatMap(G, u.side))) : null;
    // 받을 피해 예상: 다음 차례에 이 칸에 닿는 적들이 저마다 나를 친다고 치고 잃을 몫을 점수로 뺀다
    // (상성이 불리한 적일수록 크게 잡힌다). 우리 편 자동 진행은 그대로, 적은 덜 겁내게 0.4배
    const foes = G.units.filter((o) => o.alive && o.side !== u.side && (o.side === 'p' || o.awake || o.ai !== 'guard'));
    const myMax0 = R.totalMax(u), fear = u.side === 'p' ? 2 : 0.4, riskMemo = new Map();
    const myKind = R.troopAlive(u) ? u.troop.kind : u.kind;
    // advOnly: 상성으로 나를 이기는 적만 센다 (그냥 이동할 때). 아니면 닿는 적 모두 (공격·특기를 하러 설 칸)
    // only: 'asleep' 잠든 적만 / 'awake' 깨어 있는 적만 / 없으면 모두
    const asleep = (o) => o.side === 'e' && !o.awake;
    const relRisk = (x, y, advOnly, only) => {
      const k = y * G.w + x + (advOnly ? 1e6 : 0) + (only === 'asleep' ? 2e6 : only === 'awake' ? 4e6 : 0);
      if (riskMemo.has(k)) return riskMemo.get(k);
      const ox = u.x, oy = u.y; u.x = x; u.y = y;
      let n = 0, sum = 0;
      for (const o of foes) {
        if (R.dist(o.x, o.y, x, y) > R.mov(o) + o.rng) continue;
        if (advOnly && !R.relX(R.troopAlive(o) ? o.troop.kind : o.kind, myKind)) continue;
        if ((only === 'asleep' && !asleep(o)) || (only === 'awake' && asleep(o))) continue;
        // 적이 칠 자리: 이 칸에서 적 쪽으로 한 칸씩 걸어 나가 적 사거리만큼 떨어진 칸
        let ax = x, ay = y;
        while (R.dist(ax, ay, x, y) < Math.min(o.rng, R.dist(o.x, o.y, x, y))) { if (Math.abs(o.x - ax) >= Math.abs(o.y - ay)) ax += Math.sign(o.x - ax); else ay += Math.sign(o.y - ay); }
        const e = R.combat(G, o, u, ax, ay);
        sum += e.dT + e.dH;
        n += ((e.dT + e.dH * 1.6) / myMax0) * 10 * value(u) * fear;
      }
      if (sum >= R.total(u) * 0.5) n += 10 * value(u) * fear; // 여러 적이 몰려 치면 부대가 무너질 칸
      u.x = ox; u.y = oy;
      riskMemo.set(k, n);
      return n;
    };
    const risk = (x, y) => (th ? Math.max(0, th[y * G.w + x] - 1) * caution(u) : 0) + relRisk(x, y, false);
    // 이동 위험: 깨어 있는 적은 그대로, 잠든 적(다가가야 깨는 적)은 상한을 두어 언젠가는 다가가 끌어낸다
    const moveRisk = (x, y) => (th ? Math.max(0, th[y * G.w + x] - 1) * caution(u) * 1.5 : 0) + relRisk(x, y, true, 'awake') * 0.75 + Math.min(5, relRisk(x, y, true, 'asleep') * 0.75);
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
    // 특기: 제자리뿐 아니라 이동한 칸에서 쓰는 경우도 따진다 (특기가 닿을 만한 칸만 골라 계산을 줄인다)
    const ox = u.x, oy = u.y;
    for (const sk of R.skillsOf(u)) {
      if (!R.skillReady(u, sk)) continue;
      const s = SKILLS[sk];
      const reachR = (s.range || 0) + (s.len || 0) + (s.radius || 0) + 2;
      const spots = tiles.filter((t) => (t.x === ox && t.y === oy) || G.units.some((o) => o.alive && R.dist(o.x, o.y, t.x, t.y) <= reachR))
        .sort((a, b) => a.c - b.c).slice(0, 14);
      for (const t of spots) {
        u.x = t.x; u.y = t.y; // 그 칸에 섰다고 치고
        for (const [tx, ty] of R.skillTargets(G, u, sk)) {
          let sc = 0;
          for (const r of R.skillEffect(G, u, sk, tx, ty)) {
            if (r.toT != null) sc += ((r.toT + r.toH * 1.6) / R.totalMax(r.u)) * 10 * value(r.u) + (r.toH >= r.u.hp - 0.5 ? 6 : 0);
            if (r.hH != null) sc += ((r.hH * 1.6 + r.hT) / R.totalMax(r.u)) * 9 * value(r.u) + (r.buff ? 0.8 : 0);
          }
          if (s.buff && !G.units.some((o) => o.alive && o.side !== u.side && R.dist(o.x, o.y, t.x, t.y) <= 6)) sc = 0;
          if (sc <= 0) continue; // 아무 효과 없는 특기는 쓰지 않는다 (재사용 대기만 낭비)
          consider(sc - 0.5 - risk(t.x, t.y) - (t.x !== ox || t.y !== oy ? 0.2 : 0), { to: [t.x, t.y], act: 'skill', skill: sk, tx, ty });
        }
      }
      u.x = ox; u.y = oy;
    }
    if (best && best.sc > -1) return best;
    if (u.ai === 'guard') return { to: [u.x, u.y], act: 'wait' };
    const f = fields[u.move + u.side] || (fields[u.move + u.side] = R.distField(G, u.move, u.side));
    let mv = null;
    for (const t of tiles) {
      let sc = f[t.y * G.w + t.x];
      if (u.hp < u.hpMax * 0.35 && u.side === 'p') sc = -sc * 0.3;
      sc -= terrDef(G, u, t.x, t.y) * 0.5;
      sc += moveRisk(t.x, t.y);
      if (!mv || sc < mv.sc) mv = { sc, t };
    }
    return mv ? { to: [mv.t.x, mv.t.y], act: 'wait' } : { to: [u.x, u.y], act: 'wait' };
  };

  root.RULES = R;
})(typeof window !== 'undefined' ? window : globalThis);
