// 양쪽 자동 대전으로 본편 난이도 확인: node tools/autobattle.js [반복 횟수] [시작 작전 번호] [끝 작전 번호]
// 1-1 부터 차례로: 합류한 영웅 중 대본 필수 인원 + 레벨 높은 순으로 최대 8명 출전, 이기면 경험치를 받고 다음 작전.
// 진 작전은 (게임처럼) 절반 경험치를 받고 다시 한다. 받은 부품은 출전 영웅이 쓰는 병사 훈련에 바로 쓴다 (NODRILL=1 이면 훈련 없이). 작전마다 승률·평균 턴·살아남은 영웅 수를 찍는다.
global.window = global;
require('../js/data.js'); require('../js/stagemaps.js'); require('../js/rules.js'); require('../js/classes.js');
for (const f of ['story', 'story_ch02', 'story_ch03', 'story_ch04', 'story_ch05', 'story_ch06']) require('../js/' + f + '.js');
const D = DATA, R = RULES, CL = CLASSES;
if (process.env.DIFF) R.diff = process.env.DIFF; // 난이도: easy · normal · hard
const RUNS = +process.argv[2] || 3, FROM = +process.argv[3] || 1, TO = +process.argv[4] || D.STAGES.length;
const MAX_SORTIE = 8;

function battle(st, party, save, drill = {}) {
  const G = R.newGame(st);
  G.drill = drill;
  party.forEach((id, i) => {
    let p = st.starts[i];
    for (let k = 0; !p && k < st.starts.length; k++) p = R.freeAround(G, st.starts[k][0], st.starts[k][1], CL.cur(id, save[id]).move, 1)[0];
    R.makeHero(G, id, save[id], null, p[0], p[1]);
  });
  R.spawnWave(G, 0);
  const phase = (side) => {
    G.side = side;
    for (const u of G.units) {
      if (!u.alive) continue;
      u.buffs = u.buffs.filter((b) => !(b.side === side && b.until <= G.turn));
      if (u.side !== side) continue;
      u.acted = false;
      for (const k in u.cd) if (u.cd[k] > 0) u.cd[k]--;
      u.slow = u.slowNext || 0; u.slowNext = 0;
    }
    R.phaseHeal(G, side); // 지형·재생·지휘관 곁 병사 보충 (게임과 같은 규칙)
    if (side === 'e') for (const i of R.wavesAt(G, G.turn)) R.spawnWave(G, i);
    const fields = {}, left = G.units.filter((u) => u.alive && u.side === side);
    while (left.length) {
      let pick = 0, plan = null, best = -Infinity;
      left.forEach((o, i) => {
        if (!o.alive) return;
        const p = R.plan(G, o, fields);
        const sc = p.act === 'wait' ? -1e9 - i : p.sc + (p.act === 'attack' && p.target && R.combat(G, o, p.target, p.to[0], p.to[1]).dDead ? 5 : 0);
        if (sc > best) { best = sc; pick = i; plan = p; }
      });
      const u = left.splice(pick, 1)[0];
      if (!u.alive || !plan) continue;
      u.acted = true;
      if (plan.act === 'wait' && plan.to[0] === u.x && plan.to[1] === u.y) { if (R.canRefit(u)) R.refit(u); continue; } // 제자리 정비
      u.x = plan.to[0]; u.y = plan.to[1];
      if (plan.act === 'attack' && plan.target.alive && R.dist(u.x, u.y, plan.target.x, plan.target.y) <= u.rng) {
        const d = plan.target, res = R.combat(G, u, d, u.x, u.y, Math.random);
        R.apply(d, res.dT, res.dH); R.apply(u, res.aT, res.aH);
        if (d.hp <= 0) { d.alive = false; d.hp = 0; }
        if (u.hp <= 0) { u.alive = false; u.hp = 0; }
      } else if (plan.act === 'skill') {
        const s = D.SKILLS[plan.skill];
        u.cd[plan.skill] = s.cd + 1;
        for (const r of R.skillEffect(G, u, plan.skill, plan.tx, plan.ty, Math.random)) {
          if (r.toT != null) { R.apply(r.u, r.toT, r.toH); if (s.slow) r.u.slowNext = s.slow; if (r.u.hp <= 0) { r.u.alive = false; r.u.hp = 0; } }
          else {
            if (r.hH || r.hT) { r.u.hp += r.hH; if (r.u.troop) r.u.troop.hp += r.hT; }
            if (r.buff) { r.u.buffs = r.u.buffs.filter((b) => !Object.keys(s.buff).some((k) => b[k])); r.u.buffs.push({ ...s.buff, until: G.turn + 1, side: u.side }); }
          }
        }
      }
      fields.threat = null;
      let c = R.check(G);
      if (c === 'wave') { R.spawnWave(G, R.pendingWave(G)); c = null; }
      if (c) return c;
    }
    return null;
  };
  for (G.turn = 1; G.turn <= 40; G.turn++) {
    if (st.turnLimit && G.turn > st.turnLimit) return { win: false, turn: G.turn, G };
    let c = phase('p'); if (c) return { win: c === 'win', turn: G.turn, G };
    c = phase('e'); if (c) return { win: c === 'win', turn: G.turn, G };
  }
  return { win: false, turn: 41, G };
}

const speaks = (st, id) => {
  const S = STORY[st.idx], lines = S ? [...(S.start || []), ...(S.mid || []), ...(S.end || [])] : [];
  return lines.some((l) => (l.who || '').includes(D.HEROES[id].name));
};
// 한 작전만: ONLY=6-7 LV=84 node tools/autobattle.js 10 → 마지막 지역 8명(최종 전직)으로 10번
if (process.env.ONLY) {
  const st = D.STAGES.find((s) => s.idx === process.env.ONLY), lv = +process.env.LV || 50;
  const party = [...new Set([...st.heroes, ...Object.keys(D.HEROES)])].slice(0, MAX_SORTIE);
  const save = {};
  for (const id in D.HEROES) save[id] = { lv, exp: 0, tier: lv >= 10 ? 2 : lv >= 5 ? 1 : 0, br: id.length % 2 ? 'A' : 'B' };
  let win = 0, turn = 0;
  const left = {};
  for (let i = 0; i < RUNS; i++) {
    const r = battle(st, party, save);
    if (r.win) { win++; turn += r.turn; } else r.G.units.filter((u) => u.side === 'e' && u.alive).forEach((u) => { left[u.key] = (left[u.key] || 0) + 1; });
  }
  console.log(st.idx, `Lv.${lv}`, `승 ${win}/${RUNS}`, win ? `평균 ${(turn / win).toFixed(1)}턴` : '', '진 판에 남은 적', JSON.stringify(left));
  process.exit(0);
}
const stat = {};
for (let run = 0; run < RUNS; run++) {
  const save = {}, joined = new Set(), drill = {};
  let parts = 0;
  for (const id in D.HEROES) save[id] = { lv: 1, exp: 0, tier: 0, br: 'A' };
  for (let si = 0; si < TO; si++) {
    const st = D.STAGES[si];
    st.heroes.forEach((id) => {
      if (joined.has(id)) return;
      if (joined.size) { const a = [...joined].reduce((s, k) => s + save[k].lv, 0) / joined.size; save[id].lv = Math.max(save[id].lv, Math.round(a) - 1); }
      joined.add(id);
    });
    // 전직: 레벨이 되면 갈래를 번갈아 고른다
    for (const id of joined) while (CL.canChange(id, save[id])) { save[id].tier++; if (save[id].tier === 1) save[id].br = (id.length % 2) ? 'A' : 'B'; }
    const lock = st.heroes.filter((id) => id === 'constantia' || speaks(st, id));
    const party = [...lock, ...[...joined].filter((id) => !lock.includes(id)).sort((a, b) => save[b].lv - save[a].lv)].slice(0, MAX_SORTIE);
    const play = si + 1 >= FROM;
    let tries = 0, res;
    do {
      res = battle(st, party, save, drill);
      tries++;
      parts += R.parts(st.id - 1, res.win, st.kind);
      // 훈련: 출전 영웅들이 쓰는 병사 중 단계가 낮은 것부터
      const used = [...new Set(party.map((id) => CL.cur(id, save[id]).troops[0]))];
      for (;;) {
        if (process.env.NODRILL) break;
        const k = used.filter((t) => (drill[t] || 0) < R.DRILL_MAX).sort((a, b) => (drill[a] || 0) - (drill[b] || 0))[0];
        if (!k || parts < R.drillCost(drill[k] || 0)) break;
        parts -= R.drillCost(drill[k] || 0); drill[k] = (drill[k] || 0) + 1;
      }
      const gain = R.stageExp(st.id - 1, res.win);
      for (const id of party) { const u = { side: 'p', lv: save[id].lv, exp: save[id].exp }; R.addExp(u, R.expFor(u.lv, R.foeLv(st), gain)); save[id].lv = u.lv; save[id].exp = u.exp; }
      if (play) {
        const s = stat[st.idx] || (stat[st.idx] = { n: 0, win: 0, turn: 0, alive: 0, lv: 0, party: 0, foes: 0, slow: 0, left: 0 });
        s.n++; if (!res.win && res.turn > 40) s.slow++; if (!res.win) s.left += res.G.units.filter((u) => u.side === 'e' && u.alive).length; if (res.win) { s.win++; s.turn += res.turn; s.alive += res.G.units.filter((u) => u.side === 'p' && u.alive).length; }
        s.lv += party.reduce((a, id) => a + save[id].lv, 0) / party.length; s.party = party.length; s.foes = st.waves.reduce((a, w) => a + w.units.length, 0);
      }
    } while (!res.win && tries < 4);
  }
  if (run === 0) console.log('훈련 단계', JSON.stringify(drill), '남은 부품', parts);
}
console.log('작전  지도    출전 적  승률  평균턴 생존 평균Lv 시간초과 진때남은적');
for (const st of D.STAGES) {
  const s = stat[st.idx]; if (!s) continue;
  console.log(st.idx.padEnd(5), `${st.map[0].length}x${st.map.length}`.padEnd(7), String(s.party).padStart(3), String(s.foes).padStart(3),
    `${Math.round((s.win / s.n) * 100)}%`.padStart(5), (s.win ? (s.turn / s.win).toFixed(1) : '-').padStart(6), (s.win ? (s.alive / s.win).toFixed(1) : '-').padStart(5), (s.lv / s.n).toFixed(1).padStart(6), String(s.slow).padStart(5), (s.n > s.win ? (s.left / (s.n - s.win)).toFixed(1) : '-').padStart(6));
}
