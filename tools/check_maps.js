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
  const spread = [];
  st.waves.forEach((w, i) => {
    const list = R.spawnWave(G, i);
    if (i === 0) list.forEach((u) => { u.wave0 = true; });
    if (i > 0 && !w.spots) { const far = list.filter((u) => Math.abs(u.x - w.at[0]) + Math.abs(u.y - w.at[1]) > 6 && !(w.at2 && Math.abs(u.x - w.at2[0]) + Math.abs(u.y - w.at2[1]) <= 6)).length; if (far) spread.push(`${i + 1}무리 ${far}기`); }
    if (list.length !== w.units.length) errs.push(`${i + 1}무리 ${list.length}/${w.units.length}기만 놓임`);
    list.forEach((u) => { if (u.move !== 'fly' && !rs.has(u.x + ',' + u.y)) stuck++; });
  });
  if (stuck) errs.push(`걸어서 아군에게 못 오는 적 ${stuck}기`);
  { let lone = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (foot(m[y][x]) && m[y][x] !== '=' && !rs.has(x + ',' + y)) lone++; // 걸어서 못 닿는 땅 (막힌 빈 칸·떨어진 섬)
    if (lone) errs.push(`걸어서 못 닿는 땅 ${lone}칸`); }
  // 평가에서 되풀이된 감점 (설계 검사)
  const isW = (x, y) => x >= 0 && y >= 0 && x < W && y < H && foot(m[y][x]);
  const nb = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => isW(x + dx, y + dy)).length;
  const special = new Set(st.starts.map(([x, y]) => x + ',' + y));
  G.units.filter((u) => u.side === 'e').forEach((u) => special.add(u.x + ',' + u.y));
  // ① 한 칸짜리 돌출: 이웃이 하나뿐인 칸의 그 이웃이 넓은 길(이웃 3 이상) — 쓸모없는 혹
  const nubs = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isW(x, y) && !special.has(x + ',' + y) && nb(x, y) === 1) {
    const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => isW(x + dx, y + dy));
    if (nb(x + dx, y + dy) >= 3) nubs.push(`${x},${y}`);
  }
  if (nubs.length > 1) errs.push(`한 칸 돌출 ${nubs.length}곳 (${nubs.slice(0, 6).join(' ')})`);
  // ② 빈 평지: 5×5 안에 평지·길뿐이고 아군·적도 없는 칸이 걸을 칸의 8% 넘음
  const plainC = (c) => c === '.' || c === 'r';
  let empty = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!isW(x, y)) continue;
    let ok = true;
    for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H || !plainC(m[ny][nx]) || special.has(nx + ',' + ny)) { ok = false; break; } }
    if (ok) empty++;
  }
  if (empty > rs.size * 0.08) errs.push(`빈 평지 ${empty}칸 (걸을 칸의 ${Math.round((empty / rs.size) * 100)}%)`);
  // ③ 첫 무리와 시작 칸 거리 (사거리 3 이상은 6칸, 그 밖 5칸)
  const md = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  const w0 = G.units.filter((u) => u.side === 'e' && u.wave0);
  w0.forEach((u) => { const d = Math.min(...st.starts.map((p) => md(p, [u.x, u.y]))); if (d < (u.rng >= 3 ? 6 : 5)) errs.push(`첫 무리 ${u.name}(${u.x},${u.y})가 시작 칸에서 ${d}칸`); });
  // ④ 증원이 입구에서 길게 늘어짐 (자리에서 6칸 넘게 떨어진 적)
  if (spread.length) errs.push(`증원이 늘어져 나옴: ${spread.join(', ')}`);

  // 모양: 걸을 수 있는 땅이 둘레 네모를 얼마나 채우나 (높을수록 네모). 0.72 넘으면 경고
  const xs = [...rs].map((k) => +k.split(',')[0]), ys = [...rs].map((k) => +k.split(',')[1]);
  const box = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
  const fill = rs.size / box;
  if (fill > 0.72) errs.push(`네모에 가까움 (채움 ${Math.round(fill * 100)}%)`);
  const voidK = m.join('').split('').filter((c) => c === 'x').length / (W * H); // 바깥 윤곽: 지도 밖 칸이 18% 안 되면 테두리가 네모
  if (voidK < 0.18) errs.push(`윤곽이 네모 (지도 밖 ${Math.round(voidK * 100)}%)`);
  // 증원(2번째 무리부터)은 지도 가장자리 입구(지도 밖·끝에 닿은 칸 근처)에서 들어와야 자연스럽다
  const edge = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H || m[ny][nx] === 'x' || m[ny][nx] === '#' || m[ny][nx] === 'w') return true; } return false; };
  st.waves.forEach((w, i) => { if (i > 0 && !w.boss && ![w.at, w.at2].filter(Boolean).every(([x, y]) => edge(x, y))) errs.push(`${i + 1}무리 증원 자리가 입구가 아닌 한복판`); });
  const room = rs.size, need = st.waves.reduce((s, w) => s + w.units.length, 0) + 8;
  const note = `${W}x${H} 채움 ${Math.round(fill * 100)}% 걸을 칸 ${room} (적+아군 ${need})` + (room < need * 2 ? ' ⚠좁음' : '');
  console.log(st.idx, errs.length ? '✗ ' + errs.join(' / ') : '✓', note, st.tip ? '· ' + st.tip : '');
  if (errs.length) bad++;
  if (want.length) console.log(m.join('\n'));
}
console.log(bad ? `문제 ${bad}건` : '모두 이상 없음');
process.exitCode = bad ? 1 : 0;
