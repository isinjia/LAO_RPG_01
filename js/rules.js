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
    R.ch = stage.ch || 1; R.win = stage.win; // 어려움의 사수 작전은 적이 지킬 칸으로 몰려들어 배율을 덜어 준다 (winAdj)
    R.chK = R.CH_K[R.ch - 1] || R.CH_K[R.CH_K.length - 1]; // 장마다 적 능력치 배율 (아래). 보통·어려움은 1장(chAdj), 사수 작전(winAdj)을 조금 덜어 준다
    return { stage, map, w: map[0].length, h: map.length, units: [], turn: 1, side: 'p', wave: 0, drill: {} }; // drill: 병사 훈련 단계 (save.drill)
  };
  R.inB = (G, x, y) => x >= 0 && y >= 0 && x < G.w && y < G.h;
  R.terr = (G, x, y) => TERRAIN[G.map[y][x]] || TERRAIN['.'];
  R.dist = (a, b, c, d) => Math.abs(a - c) + Math.abs(b - d);
  R.unitAt = (G, x, y) => G.units.find((u) => u.alive && u.x === x && u.y === y) || null;
  R.cost = (G, u, x, y) => R.terr(G, x, y).cost[u.move];

  // ── 유닛 생성 ──────────────────────────────────────────
  function troopOf(key, drill = 0) {
    if (!key) return null;
    const t = TROOPS[key];
    return { key, def: t, name: t.name, rig: t.rig, icon: t.icon, kind: t.kind, hp: 0, hpMax: 0, drill };
  }
  // 영웅: st = save.heroes[id] = {lv, exp, tier}, troopKey = 배속 병사
  R.makeHero = function (G, id, st, troopKey, x, y) {
    const h = HEROES[id];
    const CL = (typeof window !== 'undefined' && window.CLASSES) || null; // 전직 (js/classes.js): 직업마다 병종·이동·사거리·병사·특기·모습
    const tier = CL ? CL.cur(id, st) : h.tiers[st.tier];
    const u = {
      uid: ++uid, side: 'p', key: id, def: h, name: h.name, rig: CL ? CL.rigOf(id, st) : h.rig, icon: CL ? CL.iconOf(id, st) : h.icon,
      kind: tier.kind || h.kind, move: tier.move || h.move, rng: tier.rng || h.rng, form: CL ? tier : null,
      lv: st.lv, exp: st.exp, tier: st.tier, br: st.br || 'A', perk: st.lv >= R.PERK_LV ? st.perk || null : null, perk2: st.lv >= R.PERK2_LV && st.perk2 !== st.perk ? st.perk2 || null : null, cls: tier.cls, x, y, alive: true, acted: false, buffs: [], cd: {}, lead: !!h.lead,
      troop: null,
    };
    const tk = troopKey && tier.troops.includes(troopKey) ? troopKey : tier.troops[0];
    u.troop = troopOf(tk, (G.drill && G.drill[tk]) || 0);
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
    if (!w || (G.spawned && G.spawned.has(i))) return [];
    (G.spawned || (G.spawned = new Set())).add(i);
    G.wave = Math.max(G.wave, i);
    const spots = w.form ? R.formSpots(G, w) : R.freeAround(G, w.at[0], w.at[1], 'foot', w.units.length);
    const list = w.units.map(([t, lv], k) => spots[k] && R.makeEnemy(G, t, lv, spots[k][0], spots[k][1], { boss: w.boss === t, ai: w.boss === t || w.hold || (w.holdK && w.holdK.includes(k)) ? 'guard' : 'charge' })).filter(Boolean);
    if (i > 0 || w.awake) list.forEach((u) => { u.awake = true; }); // awake: 처음부터 진격하는 첫 무리 (아군이 지키는 수비전)
    // 무리의 지휘관 (랑그릿사처럼 부대는 지휘관 둘레로 함께 움직인다): 우두머리, 없으면 진격하는 적 중 큰 몸·높은 레벨·튼튼한 순
    const free = list.filter((u) => u.ai !== 'guard');
    const cmd = list.find((u) => u.boss) || (free.length ? free : list).slice().sort((a, b) => (b.def.big ? 1 : 0) - (a.def.big ? 1 : 0) || b.lv - a.lv || b.hpMax - a.hpMax)[0];
    list.forEach((u) => { u.wave = i; u.cmd = cmd; u.bornT = G.turn || 1; });
    return list;
  };
  // 무리 진형 (js/stagemaps.js 의 form): 아군 쪽을 앞으로 보고 line 횡대 · wedge 쐐기 · scatter 흩어짐 · ring 우두머리 둘레 · blob 덩어리.
  // at2 가 있으면 무리를 둘로 나눠 양쪽에서 (협공·기습). 자리가 막혔으면 가장 가까운 빈칸
  R.formSpots = function (G, w) {
    const n = w.units.length, taken = new Set(), out = [];
    const ps = G.units.filter((u) => u.side === 'p' && u.alive);
    const tx = ps.length ? ps.reduce((s, u) => s + u.x, 0) / ps.length : G.w / 2, ty = ps.length ? ps.reduce((s, u) => s + u.y, 0) / ps.length : G.h - 1;
    const free = (x, y) => R.inB(G, x, y) && !R.unitAt(G, x, y) && R.terr(G, x, y).cost.foot < 99 && !taken.has(x + ',' + y);
    const near = (x, y) => {
      x = Math.round(x); y = Math.round(y);
      for (let r = 0; r <= G.w + G.h; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { // 막혔으면 점점 넓혀 가장 가까운 빈칸
        if (Math.abs(dx) + Math.abs(dy) !== r) continue;
        if (free(x + dx, y + dy)) return [x + dx, y + dy];
      }
      return null;
    };
    // 병종에 맞게 다듬기: 사거리 2 이상은 2칸 안의 빈 언덕·폐허로 올라서고, 기마는 숲·언덕·산을 피해 가까운 평지로
    const fit = (t, p) => {
      if (!p) return p;
      const e = ENEMIES[t], c = (x, y) => G.map[y][x];
      const good = e.rng > 1 ? (x, y) => 'hs'.includes(c(x, y)) : e.move === 'horse' ? (x, y) => !'fhm'.includes(c(x, y)) : null;
      if (!good || good(p[0], p[1])) return p;
      let best = null;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const x = p[0] + dx, y = p[1] + dy, d = Math.abs(dx) + Math.abs(dy);
        if (d && d <= 2 && free(x, y) && good(x, y) && (!best || d < best[2])) best = [x, y, d];
      }
      return best ? [best[0], best[1]] : p;
    };
    if (w.spots) { // 한 기씩 정한 자리 (사격병은 언덕, 기동병은 평지처럼 병종마다 손으로 고른 칸). 막혔으면 가장 가까운 빈칸
      w.units.forEach(([t], k) => { const sp = w.spots[k] || w.at, p = fit(t, near(sp[0], sp[1])); if (p) { taken.add(p[0] + ',' + p[1]); out[k] = p; } });
      return out;
    }
    const split = w.at2 ? Math.ceil(n / 2) : n;
    const groups = w.at2 ? [[w.at, 0, split], [w.at2, split, n]] : [[w.at, 0, n]];
    const bossK = w.boss ? w.units.findIndex(([t]) => t === w.boss) : -1;
    for (const [at, a, b] of groups) {
      let fx = tx - at[0], fy = ty - at[1];
      const L = Math.hypot(fx, fy) || 1; fx /= L; fy /= L; // 아군 쪽
      const lx = -fy, ly = fx; // 옆
      const m = b - a, offs = [];
      for (let i = 0; i < m; i++) {
        let f = 0, l = 0;
        if (w.form === 'line') { const row = Math.floor(i / 5), j = i % 5; l = (j % 2 ? 1 : -1) * Math.ceil(j / 2) * 1.6; f = -row * 1.5; }
        else if (w.form === 'wedge') { const row = Math.ceil(Math.sqrt(i + 0.25) - 0.5), k = i - row * row; l = (k - row) * 1.2; f = -row * 1.3; }
        else if (w.form === 'scatter') { const t = i * 2.4, r = 1.6 + Math.sqrt(i) * 1.3; f = Math.cos(t) * r; l = Math.sin(t) * r; }
        else if (w.form === 'ring') { if (i === 0) { f = 0; l = 0; } else { const t = ((i - 1) / Math.max(1, m - 1)) * Math.PI * 2; f = Math.cos(t) * 1.8; l = Math.sin(t) * 1.8; } }
        else { const t = i * 2.4, r = Math.sqrt(i) * 0.9; f = Math.cos(t) * r; l = Math.sin(t) * r; }
        offs.push([at[0] + fx * f + lx * l, at[1] + fy * f + ly * l]);
      }
      const order = [...Array(m).keys()].map((i) => a + i);
      if (w.form === 'ring' && bossK >= a && bossK < b) { order.splice(order.indexOf(bossK), 1); order.unshift(bossK); } // 우두머리가 가운데
      order.forEach((k, i) => { const p = fit(w.units[k][0], near(offs[i][0], offs[i][1])); if (p) { taken.add(p[0] + ',' + p[1]); out[k] = p; } });
    }
    return out;
  };
  // 이 턴에 나올 증원 무리 번호들
  const spawned = (G, i) => !!(G.spawned && G.spawned.has(i));
  R.wavesAt = (G, turn) => G.stage.waves.map((w, i) => (i > 0 && !spawned(G, i) && (w.turn || 0) === turn ? i : -1)).filter((i) => i >= 0);
  R.nextWaveTurn = (G) => { const w = G.stage.waves.find((w, i) => i > 0 && !spawned(G, i) && (w.turn || 0) >= G.turn); return w ? w.turn : 0; };
  // 아직 나오지 않은 다음 증원 무리 번호 (없으면 -1)
  R.pendingWave = (G) => G.stage.waves.findIndex((w, i) => i > 0 && !spawned(G, i));

  // ── 수치 ───────────────────────────────────────────────
  R.tierOf = (u) => (u.side === 'p' ? u.def.tiers[u.tier] : null);
  const buffK = (u, k) => 1 + u.buffs.reduce((s, b) => s + (b[k] || 0), 0);
  R.buffK = buffK;
  // 난이도: 적 능력치(이동 제외) 배율. 작전을 시작할 때 옵션에서 정한다 (game.js)
  // ai: 적 판단의 대담함 — fear 다음 차례에 맞을 걱정, bar 공격을 그만두는 문턱(밑지는 정도), wake 나온 뒤 스스로 진격하기까지의 차례, kill 격파 노리기
  R.DIFF = {
    easy: { k: 0.85, bonusTurns: 2, name: '쉬움', ai: { fear: 0.4, bar: -1.5, wake: 2, kill: 0, lead: 1.3, focus: 0 } },
    normal: { k: 1.11, bonusTurns: 1, chAdj: { 1: 0.93 }, name: '보통', winAdj: { defend: 0.95 }, ai: { fear: 0.1, bar: -4, wake: 1, kill: 2, lead: 1.6, focus: 0.5 } }, // 보통도 쓰러뜨릴 수 있는 영웅은 노린다 (아군을 잃을 긴장)
    hard: { k: 1.2, name: '어려움', troopCap: 0.9, heal: 0.6, bonusTurns: 0, chAdj: { 1: 0.9 }, winAdj: { defend: 0.92 }, ai: { fear: 0.05, bar: -6, wake: 0, kill: 6, lead: 2.8, focus: 3.5 } }, // focus: 이미 다친 영웅을 몰아 치는 협공 // lead: 적이 아군 지휘관을 노리는 무게
  };
  R.aiOf = () => (R.DIFF[R.diff] || R.DIFF.normal).ai;
  R.healK = () => ((R.DIFF[R.diff] || R.DIFF.normal).heal || 1); // 아군 정비·지휘관 곁 보충 배율 (어려움은 줄어든다)
  // 장마다 적 능력치 배율: 뒤로 갈수록 아군은 전직·병사 훈련이 쌓여 레벨보다 빨리 강해진다 (자동 대전에서 1장이 가장 어렵고 뒤는 쉬웠다)
  R.CH_K = [0.95, 1, 1.03, 1.05, 1.07, 1.08]; // 4장부터는 Lv40 둘째 각성만큼 조금 더
  R.chK = 1;
  R.diff = 'normal';
  // 실제 배율 = 난이도 x 장 배율 x (어려움만) 장 보정 x 작전 종류 보정. 작전 하나하나를 깎지 않고 규칙으로 덜어 준다
  const diffK = (k = R.diff) => { const D0 = R.DIFF[k] || R.DIFF.normal; return D0.k * R.chK * ((D0.chAdj && D0.chAdj[R.ch]) || 1) * ((D0.winAdj && D0.winAdj[R.win]) || 1); };
  R.diffK = diffK; // 지금 작전의 실제 적 능력치 배율 (옵션 창이 그대로 보여 준다)
  // 각성 (Lv20부터 영웅마다 하나 고른다): 영웅과 그 병사의 능력치를 한쪽으로 기울인다. 출격 밖에서 언제든 바꿀 수 있다
  R.PERK_LV = 20;
  R.PERKS = {
    at: { name: '공세 각성', desc: '영웅·병사 공격 +15%', k: { at: 0.15 } },
    df: { name: '수비 각성', desc: '영웅·병사 방어 +25%', k: { df: 0.25 } },
    hp: { name: '생존 각성', desc: '영웅·병사 체력 +18%', k: { hp: 0.18 } },
    mv: { name: '기동 각성', desc: '영웅·병사 이동 +1', k: { mov: 1 } },
  };
  // 작전 전술: 출격 준비에서 작전마다 하나 고른다. 처음 몇 턴만 아군 전원(영웅·병사)에 걸린다
  R.TACTICS = {
    none: { name: '전술 없음', desc: '아무 효과 없음', hint: '대가 없이 그대로' },
    rush: { name: '돌격 명령', desc: '처음 3턴 공격 +22%, 방어 -15%', hint: '첫 충돌에서 적을 빨리 줄일 때', buff: { at: 0.22, df: -0.15 }, turns: 3 },
    wall: { name: '방어 진형', desc: '처음 4턴 방어 +25% (버티기·사수 작전은 작전 내내 방어 +18%·공격 +10%)', hint: '먼저 맞아 주며 버틸 때', buff: { df: 0.25 }, holdBuff: { df: 0.18, at: 0.1 }, turns: 4, holdTurns: 99 },
    swift: { name: '신속 전개', desc: '처음 3턴 이동 +1, 방어 -5%', hint: '먼 목표·「턴 안에 승리」를 노릴 때', buff: { mov: 1, df: -0.05 }, turns: 3 },
  };
  const holdStage = (st) => st && (st.win === 'survive' || st.win === 'defend');
  R.tacTurns = (key, st) => { const t = R.TACTICS[key]; return t ? (holdStage(st) && t.holdTurns) || t.turns || 0 : 0; };
  // 작전에 맞는 추천: 버티기·사수 → 방어 진형, 도달·탈출 → 신속 전개, 그 밖 → 돌격 명령
  R.tacFor = (st) => (holdStage(st) ? 'wall' : st && (st.win === 'reach' || st.win === 'escape') ? 'swift' : 'rush');
  // 그 작전에서 실제로 걸리는 수치로 쓴 설명 (추천이면 좋은 효과 ×1.3을 계산해 넣는다)
  R.tacText = (key, st) => {
    const t = R.TACTICS[key]; if (!t || !t.buff) return t ? t.desc : '';
    const hold = holdStage(st), x = key === R.tacFor(st) ? 1.3 : 1, b = (hold && t.holdBuff) || t.buff, n = R.tacTurns(key, st);
    const NM = { at: '공격', df: '방어', mov: '이동' };
    const fx = Object.entries(b).map(([k, v]) => k === 'mov' ? `이동 +${v}` : `${NM[k]} ${v > 0 ? '+' : ''}${Math.round((v > 0 ? v * x : v / x ** 1.5) * 100)}%`).join(', ');
    const costN = x > 1 && n < 99 && Object.values(b).some((v) => v < 0) ? Math.max(1, n - 1) : 0;
    return `${n >= 99 ? '작전 내내' : `처음 ${n}턴`} ${fx}${costN ? ` (약화는 처음 ${costN}턴만)` : ''}`;
  };
  R.applyTactic = (G, key) => {
    const t = R.TACTICS[key]; G.tactic = t && t.buff ? key : 'none';
    if (!t || !t.buff) return;
    G.tacUntil = R.tacTurns(key, G.stage);
    const b0 = (holdStage(G.stage) && t.holdBuff) || t.buff; // 방어 진형은 버티는 작전에서 반격으로 적을 줄이게 공격도 조금
    // 작전에 맞는 전술(추천)을 고르면 좋은 효과 1.3배, 대가는 아래에서 덜어 준다
    G.tacX = key === R.tacFor(G.stage) ? 1.3 : 1;
    // 추천이면 대가는 2/3로 덜어 준다 (돌격 명령 방어 -15% → -10%)
    const b = Object.fromEntries(Object.entries(b0).map(([k, v]) => [k, k === 'mov' ? v : Math.round((v > 0 ? v * G.tacX : v / G.tacX ** 1.5) * 1000) / 1000]));
    // 좋은 효과와 대가를 따로 건다: 추천이면 대가는 한 턴 일찍 끝난다 (돌격 명령 방어 감소는 첫 2턴만)
    const good = Object.fromEntries(Object.entries(b).filter(([, v]) => v > 0)), bad = Object.fromEntries(Object.entries(b).filter(([, v]) => v < 0));
    G.tacCostUntil = Object.keys(bad).length ? (G.tacX > 1 ? Math.max(1, G.tacUntil - 1) : G.tacUntil) : 0;
    for (const u of G.units) if (u.side === 'p') {
      u.buffs.push({ ...good, until: 1 + G.tacUntil, side: 'p', tac: 1 });
      if (G.tacCostUntil) u.buffs.push({ ...bad, until: 1 + G.tacCostUntil, side: 'p', tac: 1 });
    }
  };
  R.PERK2_LV = 40; // 두 번째 각성 (첫째와 다른 것)
  const perkK = (u, k) => (u.side !== 'p' ? 0 : [u.perk, u.perk2].reduce((n, p) => n + ((p && R.PERKS[p] && R.PERKS[p].k[k]) || 0), 0));
  R.heroStat = function (u, k, noPerk) {
    if (u.side === 'p') {
      const t = u.form || u.def.tiers[u.tier];
      if (k === 'mov') return t.mov + perkK(u, 'mov');
      const m = (u.form && u.form.m[k]) || 1; // 전직한 직업의 병종 경향
      // 레벨 성장은 1레벨부터 이어서 세고, 전직 단계마다 6%씩 더 (전직해도 약해지지 않게)
      return u.def.tiers[0][k] * (1 + 0.07 * (u.lv - 1)) * (1 + 0.06 * u.tier) * m * (noPerk ? 1 : 1 + perkK(u, k));
    }
    if (k === 'mov') return u.def.mov;
    return u.def[k] * (1 + 0.07 * (u.lv - 1)) * diffK();
  };
  // 병사: (기본 x 레벨 성장 + 영웅 공방의 25%) x 병사 훈련 (랑그릿사 모바일 병사 훈련처럼 병종마다 단계가 오르면 능력치 +)
  R.troopStat = function (u, k) {
    const t = u.troop.def;
    const v = t[k] * (1 + 0.06 * (u.lv - 1));
    return (k === 'hp' ? v * (u.side === 'e' ? diffK() : 1) : v + R.heroStat(u, k, true) * 0.25) * (1 + R.DRILL_K * (u.troop.drill || 0)) * (1 + perkK(u, k)); // 각성은 병사에 한 번만
  };
  R.atk = (u, part) => (part === 'T' ? R.troopStat(u, 'at') : R.heroStat(u, 'at')) * buffK(u, 'at');
  R.def = (u, part) => (part === 'T' ? R.troopStat(u, 'df') : R.heroStat(u, 'df')) * buffK(u, 'df');
  // 이동력 = 영웅과 (살아 있는) 병사 중 낮은 쪽
  R.mov = (u) => {
    let m = R.heroStat(u, 'mov');
    if (R.troopAlive(u)) m = Math.min(m, u.troop.def.mov + perkK(u, 'mov')); // 기동 각성은 병사 발도 +1
    if (m <= 0) return 0; // 붙박이 적(언더왓쳐 몸통 등)은 움직이지 않는다
    return Math.max(1, Math.round(m + u.buffs.reduce((s, b) => s + (b.mov || 0), 0) - (u.slow || 0)));
  };
  // 남은 병사 수 (10명 부대)
  R.SQUAD = 10;
  R.soldiers = (u, thp = u.troop ? u.troop.hp : 0) => (u.troop && thp > 0.5 ? Math.max(1, Math.ceil((thp / u.troop.hpMax) * R.SQUAD - 1e-6)) : 0);
  R.troopAlive = (u) => !!(u.troop && u.troop.hp > 0);

  // ── 병사 보충·훈련 ─────────────────────────────────────
  // 랑그릿사 모바일처럼 병사는 사지 않는다: 출격할 때마다 10명 가득, 전투가 끝나면 다시 가득.
  // 대신 전투 보상 '부품'으로 병종마다 병사 훈련 단계를 올리고(능력치 +), 전투 중에는 고전 랑그릿사처럼
  //  · 지휘 범위: 아군 차례 시작에 지휘관(콘스탄챠) 2칸 안의 아군은 병사 1명 보충
  //  · 정비: 움직이지 않은 영웅이 이번 행동을 쉬면 병사 3명 보충 + 영웅 체력 10% (고전작의 치료 명령)
  //  · 마을·기지 칸: 차례 시작에 영웅·병사 회복 (기지는 병사를 더 보충)
  R.DRILL_K = 0.08; R.DRILL_MAX = 5; // 한 단계 +8% (최대 +40%): 무엇을 훈련할지 고르는 맛이 나게
  // 추가 목표 (본편 작전): 정한 턴 안에 승리 · 영웅 퇴각 없이 승리. 하나마다 부품 +25%
  R.bonusOf = (st) => {
    const last = Math.max(1, ...st.waves.map((w) => w.turn || 1));
    const timed = st.win !== 'survive' && st.win !== 'defend';
    const foes = st.waves.reduce((n, w) => n + w.units.length, 0);
    const dT = (R.DIFF[R.diff] && R.DIFF[R.diff].bonusTurns) || 0; // 난이도마다 추가 목표 턴 여유 (쉬움 +2, 보통 +1)
    return { turns: timed ? Math.max(6, last + 6 + dT) : 0, kills: timed ? 0 : Math.ceil(foes * 0.6) }; // 버티기·사수: 버티면서 적의 60% 이상 격파
  };
  R.TROOP_CAP = 0.7; // 한 교전에 잃는 병사 체력의 상한 (최대의 70%)
  R.DRILL_COST = [120, 320, 640, 1100, 1700]; // lv → lv+1 에 드는 부품 (한 병종 최대 3880). 본편 부품(기본 약 1만 600, 추가 목표를 다 이루면 1만 6천)으로 병종 셋~넷을 끝까지, 나머지는 중간까지
  R.drillCost = (lv) => R.DRILL_COST[Math.min(lv, R.DRILL_COST.length - 1)];
  R.parts = (stageIndex, win, kind) => Math.round((44 + 7.5 * stageIndex) * (win ? 1 : 0.3) * (kind === 'repeat' ? 0.6 : kind === 'side' ? 1.2 : 1));
  R.CMD_RANGE = 2; R.CMD_SUPPLY = 0.1;
  R.REFIT_T = 0.3; R.REFIT_H = 0.1;
  R.canRefit = (u) => u.side === 'p' && (u.hp < u.hpMax || !!(u.troop && u.troop.hp < u.troop.hpMax));
  // 정비: 회복량 {hH, hT} 을 돌려주고 바로 적용
  R.refit = function (u) {
    const hH = Math.min(u.hpMax - u.hp, Math.round(u.hpMax * R.REFIT_H));
    const hT = u.troop ? Math.min(u.troop.hpMax - u.troop.hp, Math.round(u.troop.hpMax * R.REFIT_T * R.healK())) : 0;
    u.hp += hH; if (u.troop) u.troop.hp += hT;
    return { hH, hT };
  };
  // 차례 시작 회복·보충 (지형 + 수동 특기 재생 + 지휘 범위). 적용하고 [{u, hH, hT, cmd}] 를 돌려준다
  R.phaseHeal = function (G, side) {
    const out = [];
    const lead = side === 'p' ? G.units.find((o) => o.alive && o.side === 'p' && o.lead) : null;
    for (const u of G.units) {
      if (!u.alive || u.side !== side) continue;
      const tr = R.terr(G, u.x, u.y), h = (tr.heal || 0) + R.trait(u, 'regen');
      const cmd = !!(lead && lead !== u && R.dist(lead.x, lead.y, u.x, u.y) <= R.CMD_RANGE && u.troop && u.troop.hp > 0);
      const t = h + (tr.supply || 0) + (cmd ? R.CMD_SUPPLY * R.healK() : 0);
      const hH = Math.min(u.hpMax - u.hp, Math.round(u.hpMax * h));
      // 다 쓰러진 병사는 지휘 범위로는 돌아오지 않는다 (마을·기지·특기·정비로만)
      const hT = u.troop ? Math.min(u.troop.hpMax - u.troop.hp, Math.round(u.troop.hpMax * t)) : 0;
      if (hH + hT <= 0) continue;
      u.hp += hH; if (u.troop) u.troop.hp += hT;
      out.push({ u, hH, hT, cmd });
    }
    return out;
  };
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
    // 한 번의 교전으로 아군 부대가 통째로 무너지지 않게: 병사는 한 교전에 최대 병사 체력의 70%까지만 잃고, 그동안은 영웅에게 넘치지 않는다
    const capK = (R.DIFF[R.diff] && R.DIFF[R.diff].troopCap) || R.TROOP_CAP;
    const floorOf = (u, st) => (u.side === 'p' && u.troop && st.thp > 0 ? Math.max(0, st.thp - u.troop.hpMax * capK) : 0); // 아군 부대만 (상성이 불리해도 한 번에 무너지지 않게)
    const floorA = floorOf(a, sa), floorD = floorOf(d, sd);
    const cap = (s, st, floor) => { if (floor > 0 && st.thp - s.toT < floor) { const over = s.toT - Math.max(0, st.thp - floor); s.toT -= over; s.toH = (s.toH || 0) + over * 0.4; } return s; }; // 넘친 피해의 40%는 영웅이 받는다
    let rel = 0;
    for (let i = 0; i < N && sa.hp > 0.5 && sd.hp > 0.5; i++) {
      const s1 = cap(strike(G, a, sa, d, sd, dist, 1 / N, rnd, true), sd, floorD);
      const s2 = counter ? cap(strike(G, d, sd, a, sa, dist, 0.8 / N, rnd, false), sa, floorA) : { toT: 0, toH: 0 };
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
  // 그 작전 적 평균 레벨보다 높은 영웅은 레벨 차이만큼 덜 받는다 (원작 적 레벨을 앞질러 너무 쉬워지지 않게)
  R.foeLv = (stage) => { const l = stage.waves.flatMap((w) => w.units.map((u) => u[1])); return l.length ? l.reduce((a, b) => a + b, 0) / l.length : 1; };
  R.expFor = (lv, foeLv, gain) => Math.round(gain * Math.max(0.1, Math.min(1, 1 - (lv - foeLv - 1) * 0.25)));
  R.addExp = function (u, e) {
    if (!u || u.side !== 'p') return 0;
    let ups = 0;
    u.exp += e;
    while (u.exp >= 100 && u.lv < MAX_LV) { u.exp -= 100; u.lv++; ups++; }
    if (u.lv >= MAX_LV) u.exp = Math.min(u.exp, 99);
    return ups;
  };

  // ── 승패 ───────────────────────────────────────────────
  // 작전 목표 칸 (도달·탈출·사수): stage.target
  R.onTarget = (G, x, y) => !!(G.stage.target && G.stage.target.some(([a, b]) => a === x && b === y));
  // 승패: win = all(전멸) · boss(우두머리) · reach(목표 칸 도달) · escape(모두 탈출) · survive(턴 버티기) · defend(버티되 지킬 칸 사수)
  R.check = function (G) {
    const lead = G.units.find((u) => u.lead), w = G.stage.win;
    if (lead && !lead.alive && !lead.escaped) return 'lose';
    if (!G.units.some((u) => (u.alive || u.escaped) && u.side === 'p')) return 'lose';
    if (w === 'defend' && G.units.some((u) => u.alive && u.side === 'e' && R.onTarget(G, u.x, u.y))) { G.loseWhy = '지킬 곳에 철충이 들어왔습니다'; return 'lose'; }
    if (w === 'boss') { const b = G.units.find((u) => u.boss); if (b && !b.alive) return 'win'; }
    if (w === 'reach' && G.units.some((u) => u.alive && u.side === 'p' && R.onTarget(G, u.x, u.y))) return 'win';
    if (w === 'escape') { const ps = G.units.filter((u) => u.side === 'p'); if (ps.some((u) => u.escaped) && ps.every((u) => u.escaped || !u.alive)) return 'win'; }
    // 지도 위 적을 다 잡았는데 아직 나오지 않은 증원이 있으면 그 무리를 바로 부른다 (늘린 증원을 건너뛰고 이기지 않게)
    if (!G.units.some((u) => u.alive && u.side === 'e')) return R.pendingWave(G) >= 0 ? 'wave' : 'win';
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
  // 목표 칸까지의 거리 (도달·탈출 작전의 아군 자동 진행)
  R.distFieldTo = function (G, move, pts) {
    const INF = 1e9, f = new Float32Array(G.w * G.h).fill(INF), q = [];
    for (const [x, y] of pts) { f[y * G.w + x] = 0; q.push([x, y, 0]); }
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
  let foeTurn = false; // 지금 판단하는 쪽이 적인가 (아군 지휘관을 노리는 무게는 난이도마다, 아군 자동 진행은 지휘관을 늘 아낀다)
  const value = (o) => (o.lead ? (foeTurn ? R.aiOf().lead : 2.4) : o.boss ? 2 : 1);
  const caution = (u) => (u.lead ? 2.2 : u.boss ? 1.2 : u.side === 'p' && u.hp < u.hpMax * 0.5 ? 1.2 : 0);
  // 한 유닛의 할 일: { to:[x,y], act:'attack'|'skill'|'wait', target, skill, tx, ty }
  R.plan = function (G, u, fields) {
    const reach = R.reach(G, u);
    const foeAI = u.side === 'e';
    foeTurn = foeAI;
    if (foeAI && !u.awake) { // 깨어나기: 무리 중 하나라도 아군과 가까워지거나(이동+사거리+2) 나온 지 한 차례가 지나면 무리 전체가 함께 진격한다
      const mates = G.units.filter((o) => o.alive && o.side === 'e' && (o === u || (o.wave != null && o.wave === u.wave)));
      const close = mates.some((m) => m.awake || G.units.some((o) => o.alive && o.side === 'p' && R.dist(o.x, o.y, m.x, m.y) <= R.mov(m) + m.rng + 2));
      if (!close && (G.turn || 1) - (u.bornT || 1) < R.aiOf().wake) return { to: [u.x, u.y], act: 'wait' };
      mates.forEach((m) => { m.awake = true; });
    }
    const tiles = [...reach.values()].filter((t) => t.stop && (u.ai !== 'guard' || R.dist(t.x, t.y, u.home[0], u.home[1]) <= 2));
    const th = caution(u) ? (fields.threat || (fields.threat = R.threatMap(G, u.side))) : null;
    // 작전 목표 (아군 자동): 사수 작전은 지킬 칸에 올라서서 막고, 도달·탈출 작전은 목표 칸으로 다가간다
    const W0 = G.stage.win, tgts = u.side === 'p' && G.stage.target ? G.stage.target : null;
    const guardOpen = tgts && W0 === 'defend' ? tgts.filter(([x, y]) => { const o = R.unitAt(G, x, y); return !o || o === u; }) : [];
    const objK = (x, y) => (guardOpen.some(([a, b]) => a === x && b === y) ? 8 : 0) - (tgts && W0 === 'defend' ? Math.max(0, Math.min(...tgts.map(([a, b]) => R.dist(a, b, x, y))) - 3) * 1.2 : 0); // 사수 작전: 지킬 칸에서 멀리 나가 싸우지 않는다 (막던 영웅이 쓰러져도 곧 메우게)
    // 받을 피해 예상: 다음 차례에 이 칸에 닿는 적들이 저마다 나를 친다고 치고 잃을 몫을 점수로 뺀다
    // (상성이 불리한 적일수록 크게 잡힌다). 우리 편 자동 진행은 그대로, 적은 덜 겁내게 0.4배
    const foes = G.units.filter((o) => o.alive && o.side !== u.side && (o.side === 'p' || o.awake || o.ai !== 'guard'));
    const myMax0 = R.totalMax(u), fear = u.side === 'p' ? 2 : R.aiOf().fear, riskMemo = new Map(); // 적은 맞을 걱정을 거의 하지 않는다 (적극적으로)
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
    // 사수 작전: 빈 지킬 칸에 가장 가까운 아군이 그 칸을 막아선다 (그 자리에서 칠 수 있으면 친다)
    for (const [gx, gy] of guardOpen) {
      if (!tiles.some((t) => t.x === gx && t.y === gy)) continue;
      const mine = R.dist(u.x, u.y, gx, gy), mates = G.units.filter((o) => o !== u && o.alive && o.side === u.side && !o.lead);
      if (u.lead && mates.length) continue; // 지휘관은 막아서지 않는다 (쓰러지면 진다)
      if (mates.some((o) => !o.acted && R.dist(o.x, o.y, gx, gy) < mine)) continue;
      const tg = R.targetsFrom(G, u, gx, gy).map((o) => ({ o, e: R.combat(G, u, o, gx, gy) })).sort((p, q) => q.e.dT + q.e.dH - (p.e.dT + p.e.dH))[0];
      return tg ? { to: [gx, gy], act: 'attack', target: tg.o, sc: 50 } : { to: [gx, gy], act: 'wait', sc: 50 };
    }
    for (const t of tiles) {
      const terrK = terrDef(G, u, t.x, t.y) * 3 + objK(t.x, t.y);
      for (const o of R.targetsFrom(G, u, t.x, t.y)) {
        const e = R.combat(G, u, o, t.x, t.y);
        let sc = ((e.dT + e.dH * 1.6) / R.totalMax(o)) * 10 * value(o) - ((e.aT + e.aH * 1.6) / myMax) * 10 * value(u) * (foeAI ? 0.4 : 0.7) + terrK - risk(t.x, t.y);
        // 적: 상성으로 이기는 상대를 먼저, 쓰러뜨릴 수 있는 상대(kill)와 많이 다친 영웅(focus, 협공)에 무게를 더한다 (난이도마다 R.DIFF.ai)
        if (foeAI) sc += (e.rel > 0 ? 3 : e.rel < 0 ? -1.5 : 0) + (e.dDead ? R.aiOf().kill : 0) + R.aiOf().focus * (1 - R.total(o) / R.totalMax(o))
          + (u.rng > 1 && R.dist(t.x, t.y, o.x, o.y) === 1 ? -3 : 0); // 원거리 적은 붙지 않고 사거리에서 쏜다
        // 아군 자동: 우두머리 작전은 우두머리를(반격이 아파도), 도달·탈출 작전은 목표 칸을 막고 선 적을 친다
        else if (W0 === 'boss' && o.boss) sc += 6;
        else if (tgts && (W0 === 'reach' || W0 === 'escape') && tgts.some(([x, y]) => x === o.x && y === o.y)) sc += 6;
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
    if (best && best.sc > (foeAI ? R.aiOf().bar : -1)) return best; // 적은 크게 밑지는 싸움이 아니면 친다
    { const g = guardOpen.find(([x, y]) => tiles.some((t) => t.x === x && t.y === y)); if (g) return { to: [g[0], g[1]], act: 'wait', sc: 0 }; } // 지킬 칸이 비었으면 올라선다
    if (tgts && (W0 === 'reach' || W0 === 'escape' || W0 === 'defend')) { // 도달 작전: 목표 칸으로 / 사수 작전: 빈 지킬 칸으로 돌아간다 (위험한 칸은 피하면서)
      const pts = W0 === 'defend' && guardOpen.length ? guardOpen : tgts, key = 'to' + u.move + (W0 === 'defend' ? pts.join('|') : '');
      const ft = fields[key] || (fields[key] = R.distFieldTo(G, u.move, pts));
      let mv = null;
      for (const t of tiles) { const sc = ft[t.y * G.w + t.x] + moveRisk(t.x, t.y) * 0.5 - terrDef(G, u, t.x, t.y) * 0.5; if (!mv || sc < mv.sc) mv = { sc, t }; }
      if (mv) return { to: [mv.t.x, mv.t.y], act: 'wait' };
    }
    if (u.ai === 'guard') return { to: [u.x, u.y], act: 'wait' };
    const f = fields[u.move + u.side] || (fields[u.move + u.side] = R.distField(G, u.move, u.side));
    const lead = foeAI && u.cmd && u.cmd !== u && u.cmd.alive ? u.cmd : null; // 따라갈 지휘관 (지휘관이 쓰러지면 저마다 진격)
    // 크게 다친 적(30% 아래)은 칠 만한 상대가 없으면 지휘관 곁(없으면 뒤)으로 물러나 숨을 고른다
    const hurt = foeAI && !u.boss && R.total(u) < R.totalMax(u) * 0.3;
    if (hurt) {
      let mv = null;
      for (const t of tiles) { const sc = (lead ? R.dist(t.x, t.y, lead.x, lead.y) * 1.5 : 0) - f[t.y * G.w + t.x] * 0.8 + moveRisk(t.x, t.y) * 0.6 - terrDef(G, u, t.x, t.y) * 2; if (!mv || sc < mv.sc) mv = { sc, t }; }
      if (mv) return { to: [mv.t.x, mv.t.y], act: 'wait' };
    }
    let mv = null;
    for (const t of tiles) {
      let sc = f[t.y * G.w + t.x];
      if (u.hp < u.hpMax * 0.35 && u.side === 'p') sc = -sc * 0.3;
      sc -= terrDef(G, u, t.x, t.y) * 0.5;
      sc += moveRisk(t.x, t.y) * (foeAI ? 0.4 : 1);
      if (lead) sc += Math.max(0, R.dist(t.x, t.y, lead.x, lead.y) - (lead.ai === 'guard' ? 4 : 2)) * 2.5; // 지휘관 둘레(2칸, 버티는 우두머리면 4칸)에서 벗어나지 않게
      if (foeAI && u.rng > 1 && foes.some((o) => R.dist(o.x, o.y, t.x, t.y) === 1)) sc += 4; // 원거리 적은 그냥 움직일 때도 아군 바로 옆에는 서지 않는다
      if (!mv || sc < mv.sc) mv = { sc, t };
    }
    return mv ? { to: [mv.t.x, mv.t.y], act: 'wait' } : { to: [u.x, u.y], act: 'wait' };
  };

  root.RULES = R;
})(typeof window !== 'undefined' ? window : globalThis);
