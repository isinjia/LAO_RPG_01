// 자료 검사 + 전투 수치 확인: node tools/sim.js
globalThis.window = undefined;
require('../js/data.js'); require('../js/rules.js');
const { STAGES, HEROES, TROOPS } = DATA, R = RULES;
let bad = 0;
for (const st of STAGES) {
  const w = st.map[0].length;
  st.map.forEach((r, i) => { if (r.length !== w) { console.log(`스테이지 ${st.id} ${i}행 길이 ${r.length} != ${w}`); bad++; } });
  const G = R.newGame(st);
  const seen = new Set();
  const chk = (x, y, move, what) => {
    const k = x + ',' + y;
    if (!R.inB(G, x, y)) { console.log(`스테이지 ${st.id} ${what} 범위 밖 ${k}`); bad++; return; }
    if (seen.has(k)) { console.log(`스테이지 ${st.id} ${what} 겹침 ${k}`); bad++; }
    seen.add(k);
    if (R.terr(G, x, y).cost[move] >= 99) { console.log(`스테이지 ${st.id} ${what} 못 서는 칸 ${k} (${G.map[y][x]})`); bad++; }
  };
  st.starts.forEach(([x, y], i) => chk(x, y, HEROES[st.heroes[i]].move, st.heroes[i]));
  const all = [...st.enemies, ...st.events.flatMap((e) => e.reinforce || [])];
  for (const e of all) { chk(e.x, e.y, DATA.BOSSES[e.cmd].move, e.cmd); for (const [t, x, y] of e.troops) chk(x, y, TROOPS[t].move, t); }
  if (st.starts.length !== st.heroes.length) { console.log(`스테이지 ${st.id} 시작 칸 수 불일치`); bad++; }
}
console.log(bad ? `문제 ${bad}건` : '지도·배치 이상 없음');

// 대표 전투 예상치
const G = R.newGame(STAGES[0]);
const lab = R.makeHero(G, 'labiata', { lv: 1, exp: 0, tier: 0 }, 1, 1);
const leo = R.makeHero(G, 'leona', { lv: 1, exp: 0, tier: 0 }, 1, 3);
const b = R.makeTroop(G, 'brownie', lab, 2, 1);
const g = R.makeTroop(G, 'gnome', leo, 2, 3);
const boss = R.makeBoss(G, { cmd: 'bigchick', x: 6, y: 6, lv: 1, troops: [['chick', 3, 1], ['legion', 3, 3], ['predator', 6, 1]] });
const [ch, lg, pr] = boss.troops;
const show = (a, d, nm) => { const p = R.preview(G, a, d, a.x, a.y); console.log(nm.padEnd(22), '공격측 -' + p.aLoss.toFixed(1), ' 방어측 -' + p.dLoss.toFixed(1), p.counter ? '' : '(반격 없음)'); };
show(b, ch, '브라우니→나이트칙');
show(ch, b, '나이트칙→브라우니');
b.x = 3; b.y = 2; show(b, lg, '브라우니→레기온(상성우위)'); show(lg, b, '레기온→브라우니(열세)');
g.x = 5; g.y = 1; show(g, pr, '노움→프레데터(상성우위)');
show(pr, g, '프레데터→노움(열세)');
lab.x = 2; lab.y = 1; b.x=9; show(lab, ch, '라비아타→나이트칙');
show(ch, lab, '나이트칙→라비아타');
lab.x = 5; lab.y = 6; show(lab, boss, '라비아타→빅칙');
