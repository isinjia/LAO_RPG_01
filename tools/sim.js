// 자료 검사 + 전투 수치 확인: node tools/sim.js
require('../js/data.js'); require('../js/rules.js');
const { STAGES, HEROES, ENEMIES } = DATA, R = RULES;
let bad = 0;
for (const st of STAGES) {
  const w = st.map[0].length;
  st.map.forEach((r, i) => { if (r.length !== w) { console.log(`${st.idx} ${i}행 길이 ${r.length} != ${w}`); bad++; } });
  const G = R.newGame(st);
  st.starts.forEach(([x, y], i) => {
    const id = st.heroes[i];
    if (!R.inB(G, x, y) || R.terr(G, x, y).cost[HEROES[id].move] >= 99 || R.unitAt(G, x, y)) { console.log(`${st.idx} ${id} 시작 칸 문제 ${x},${y}`); bad++; }
    R.makeHero(G, id, { lv: 1, exp: 0, tier: 0 }, null, x, y);
  });
  if (st.starts.length !== st.heroes.length) { console.log(`${st.idx} 시작 칸 수 불일치`); bad++; }
  st.waves.forEach((wv, i) => {
    const n = R.spawnWave(G, i).length;
    if (n !== wv.units.length) { console.log(`${st.idx} ${i + 1}무리 배치 ${n}/${wv.units.length}`); bad++; }
    G.units.filter((u) => u.side === 'e').forEach((u) => { u.alive = false; });
  });
}
console.log(bad ? `문제 ${bad}건` : '지도·배치 이상 없음');

const G = R.newGame(STAGES[0]);
const show = (a, d, nm) => {
  const p = R.combat(G, a, d, a.x, a.y);
  const f = (v) => v.toFixed(0).padStart(3);
  console.log(nm.padEnd(26), `방어측 병사-${f(p.dT)} 영웅-${f(p.dH)} | 공격측 병사-${f(p.aT)} 영웅-${f(p.aH)}`, p.counter ? '' : '(반격 없음)');
};
const H = (id, lv, troop, x, y) => R.makeHero(G, id, { lv, exp: 0, tier: lv >= 10 ? 2 : lv >= 5 ? 1 : 0 }, troop, x, y);
const con = H('constantia', 1, 'gunner', 0, 0), gri = H('griffon', 1, 'flyer', 0, 2), joh = H('johanna', 1, 'shield', 0, 4);
const ch = R.makeEnemy(G, 'chick', 2, 1, 2), la = R.makeEnemy(G, 'launcher', 1, 2, 0), sh = R.makeEnemy(G, 'shielder', 2, 1, 4);
console.log('콘스탄챠 Lv1 체력', con.hpMax, '병사', con.troop.hpMax, '/ 나이트칙 Lv2', ch.hpMax, ch.troop.hpMax, '/ 런처 Lv1', la.hpMax, la.troop.hpMax);
show(con, la, '콘스탄챠→런처 (2칸)');
show(la, con, '런처→콘스탄챠 (2칸)');
show(gri, ch, '그리폰(비행대)→나이트칙');
show(ch, gri, '나이트칙→그리폰');
show(joh, sh, '요안나(중장)→실더');
const lrl = H('lrl', 8, 'guard', 5, 5), st13 = R.makeEnemy(G, 'stalker', 13, 6, 5), c12 = R.makeEnemy(G, 'chick', 12, 5, 6);
show(lrl, st13, 'LRL Lv8→스토커 Lv13');
show(lrl, c12, 'LRL Lv8→나이트칙 Lv12');
show(c12, lrl, '나이트칙 Lv12→LRL Lv8');
