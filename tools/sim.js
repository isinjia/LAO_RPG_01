// 자료 검사 + 전투 수치 확인: node tools/sim.js
require('../js/data.js'); require('../js/stagemaps.js'); require('../js/rules.js');
const { STAGES, HEROES, ENEMIES } = DATA, R = RULES;
let bad = 0;
for (const st of STAGES) {
  const w = st.map[0].length;
  st.map.forEach((r, i) => { if (r.length !== w) { console.log(`${st.idx} ${i}행 길이 ${r.length} != ${w}`); bad++; } });
  const G = R.newGame(st);
  st.starts.forEach(([x, y], i) => {
    const id = st.heroes[i] || 'constantia'; // 8곳까지: 남는 칸은 걷는 영웅 기준으로 검사
    if (!R.inB(G, x, y) || R.terr(G, x, y).cost.foot >= 99 || R.unitAt(G, x, y)) { console.log(`${st.idx} ${i + 1}번 시작 칸 문제 ${x},${y}`); bad++; }
    R.makeHero(G, id, { lv: 1, exp: 0, tier: 0 }, null, x, y);
  });
  if (st.starts.length < Math.max(8, st.heroes.length)) { console.log(`${st.idx} 시작 칸 ${st.starts.length}곳 (8곳 필요)`); bad++; }
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
  const dl = R.soldiers(d) - R.soldiers(d, d.troop ? d.troop.hp - p.dT : 0), al = R.soldiers(a) - R.soldiers(a, a.troop ? a.troop.hp - p.aT : 0);
  console.log(nm.padEnd(28), `거리 ${p.dist} · 방어측 병사-${dl}명 영웅-${f(p.dH)} | 공격측 병사-${al}명 영웅-${f(p.aH)}`, p.counter ? '' : '(반격 없음: 사거리 밖)');
};
const H = (id, lv, troop, x, y) => R.makeHero(G, id, { lv, exp: 0, tier: lv >= 10 ? 2 : lv >= 5 ? 1 : 0 }, troop, x, y);
const con = H('constantia', 1, 'gunner', 0, 0), gri = H('griffon', 1, 'flyer', 0, 2), joh = H('johanna', 1, 'shield', 0, 4), lrl = H('lrl', 1, 'guard', 0, 6), pup = H('pupphead', 1, 'raider', 0, 8);
const ch = R.makeEnemy(G, 'chick', 2, 1, 2), la = R.makeEnemy(G, 'launcher', 1, 2, 0), sh = R.makeEnemy(G, 'shielder', 2, 1, 4), ch2 = R.makeEnemy(G, 'chick', 2, 1, 6), la2 = R.makeEnemy(G, 'launcher', 2, 1, 8);
console.log('이동력: 콘스탄챠', R.mov(con), '그리폰', R.mov(gri), '펍 헤드(기동병)', R.mov(pup), '/ 펍 헤드에 소총병 배속하면', (pup.troop = { ...pup.troop, def: DATA.TROOPS.guard }, R.mov(pup)));
pup.troop.def = DATA.TROOPS.raider;
show(con, la, '콘스탄챠(사격병)→런처 2칸');
show(gri, ch, '그리폰(공중병)→나이트칙');
show(la, gri, '런처→그리폰 (사격병▶공중병)');
show(joh, sh, '요안나(중장병)→실더(중장병)');
show(lrl, ch2, 'LRL(소총병)→나이트칙(소총병)');
show(pup, la2, '펍헤드(기동병)→런처 (붙어서)');
show(la2, pup, '런처→펍헤드 (런처가 붙어서)');
lrl.x = 1; lrl.y = 5; // 실더 바로 옆에서
show(lrl, sh, 'LRL(소총병)→실더 (소총병▶중장병)');
