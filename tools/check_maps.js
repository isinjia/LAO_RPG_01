// 작전 지도 검사: node tools/check_maps.js [작전 번호...]  (먼저 node tools/build_stagemaps.js)
// 줄 길이, 지형 글자, 시작 칸 8곳(걸을 수 있고 겹치지 않음), 무리 자리에 걸어서 닿는지, 무리가 다 놓이는지,
// 적이 놓인 칸 가운데 아군 쪽에서 걸어서 못 닿는 칸(공중병 빼고)이 있는지, 지도 그림을 찍어 본다.
global.window = global;
require('../js/data.js'); require('../js/stagemaps.js'); require('../js/rules.js');
const D = DATA, R = RULES;
const want = process.argv.slice(2);
let bad = 0;
const foot = (c) => D.TERRAIN[c] && D.TERRAIN[c].cost.foot < 99;
function reach(map, s) {
  const H = map.length, W = map[0].length, seen = new Set([s[0] + ',' + s[1]]), q = [s];
  while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen.has(nx + ',' + ny) || !foot(map[ny][nx])) continue; seen.add(nx + ',' + ny); q.push([nx, ny]); } }
  return seen;
}
for (const st of D.STAGES) {
  if (want.length && !want.includes(st.idx)) continue;
  const errs = [], m = st.map, W = m[0].length, H = m.length;
  m.forEach((r, i) => { if (r.length !== W) errs.push(`${i}행 길이 ${r.length}≠${W}`); [...r].forEach((c) => { if (!D.TERRAIN[c]) errs.push(`없는 지형 글자 '${c}' (${i}행)`); }); });
  if (errs.length) { console.log(st.idx, '✗', errs.slice(0, 4).join(' / ')); bad++; continue; }
  const keys = new Set();
  if (st.starts.length < 8) errs.push(`시작 칸 ${st.starts.length}곳 (8곳 필요)`);
  st.starts.forEach(([x, y], i) => { if (x < 0 || y < 0 || x >= W || y >= H || !foot(m[y][x])) errs.push(`시작 칸 ${i + 1} (${x},${y}) 못 섬`); if (keys.has(x + ',' + y)) errs.push(`시작 칸 겹침 ${x},${y}`); keys.add(x + ',' + y); });
  const rs = reach(m, st.starts[0]);
  st.starts.forEach(([x, y], i) => { if (!rs.has(x + ',' + y)) errs.push(`시작 칸 ${i + 1} 이어지지 않음`); });
  if (st.waves.some((w) => !w.at)) errs.push('무리 자리(at) 없음');
  st.waves.forEach((w, i) => [w.at, w.at2].filter(Boolean).forEach(([x, y]) => { if (!rs.has(x + ',' + y)) errs.push(`${i + 1}무리 자리 (${x},${y})에 걸어서 못 닿음`); }));
  // 실제로 놓아 보기
  const G = R.newGame(st);
  st.heroes.concat(['constantia', 'constantia', 'constantia', 'constantia', 'constantia', 'constantia', 'constantia', 'constantia']).slice(0, 8).forEach((id, i) => { const [x, y] = st.starts[i]; R.makeHero(G, id, { lv: 1, exp: 0, tier: 0 }, null, x, y); });
  let stuck = 0;
  st.waves.forEach((w, i) => {
    const list = R.spawnWave(G, i);
    if (list.length !== w.units.length) errs.push(`${i + 1}무리 ${list.length}/${w.units.length}기만 놓임`);
    list.forEach((u) => { if (u.move !== 'fly' && !rs.has(u.x + ',' + u.y)) stuck++; });
  });
  if (stuck) errs.push(`걸어서 아군에게 못 오는 적 ${stuck}기`);
  const room = rs.size, need = st.waves.reduce((s, w) => s + w.units.length, 0) + 8;
  const note = `${W}x${H} 걸을 칸 ${room} (적+아군 ${need})` + (room < need * 2 ? ' ⚠좁음' : '');
  console.log(st.idx, errs.length ? '✗ ' + errs.join(' / ') : '✓', note, st.tip ? '· ' + st.tip : '');
  if (errs.length) bad++;
  if (want.length) console.log(m.join('\n'));
}
console.log(bad ? `문제 ${bad}건` : '모두 이상 없음');
process.exitCode = bad ? 1 : 0;
