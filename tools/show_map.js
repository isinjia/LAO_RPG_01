// 지도 그림 + 배치 보기: node tools/show_map.js 2-5 [3-1 ...]  (먼저 node tools/build_stagemaps.js)
// 지형 글자 위에 아군 시작 칸 P, 무리마다 나오는 적 자리(1·2·3… = 몇 번째 무리, B = 우두머리, 대문자 H = 자리를 지키는 수비대가 있는 무리 표시는 범례에)
global.window = global;
require('../js/data.js'); require('../js/stagemaps.js'); require('../js/rules.js');
const D = DATA, R = RULES;
const LEG = '. 평지  r 길  f 숲·장비  h 언덕·단차  m 산·설비(느림)  w 물  = 다리  v 마을  c 기지  # 벽  s 폐허  x 지도 밖  P 아군 시작  1~9 무리 번호  B 우두머리';
for (const idx of process.argv.slice(2)) {
  const st = D.STAGES.find((s) => s.idx === idx);
  if (!st) { console.log(idx, '없음'); continue; }
  const g = st.map.map((r) => [...r]);
  st.starts.forEach(([x, y]) => { g[y][x] = 'P'; });
  const G = R.newGame(st);
  st.starts.forEach(([x, y]) => R.makeHero(G, 'constantia', { lv: 1, exp: 0, tier: 0 }, null, x, y));
  const lines = [];
  st.waves.forEach((w, i) => {
    const list = R.spawnWave(G, i);
    list.forEach((u) => { g[u.y][u.x] = u.boss ? 'B' : String(i + 1); });
    const kinds = {};
    list.forEach((u) => { const k = `${u.name}(${D.KIND[u.kind].name}${u.rng > 1 ? '·사거리' + u.rng : ''}${u.move === 'fly' ? '·비행' : u.move === 'horse' ? '·기마' : ''})`; kinds[k] = (kinds[k] || 0) + 1; });
    const T = (u) => D.TERRAIN[st.map[u.y][u.x]].name;
    const warn = list.filter((u) => (u.move === 'horse' && 'fhm'.includes(st.map[u.y][u.x]))).map((u) => `${u.name}@${u.x},${u.y}(${T(u)})`);
    lines.push(`  ${i + 1}무리 ${w.turn || 1}턴 ${w.form || ''}${w.hold ? ' 수비대(자리 지킴)' : ''} at${JSON.stringify(w.at)}${w.at2 ? ' at2' + JSON.stringify(w.at2) : ''}: ` + Object.entries(kinds).map(([k, n]) => k + '×' + n).join(', '));
    lines.push(`    순서(spots 순): ` + w.units.map(([t], k) => { const u = list.find((v) => v.key === t && !v.__seen && (v.__seen = 1)); return `${k}:${D.ENEMIES[t].name}${u ? '@' + u.x + ',' + u.y + ' ' + T(u) : ''}`; }).join(' · ') + (warn.length ? `  ⚠기마가 느린 칸: ${warn.join(', ')}` : ''));
  });
  console.log(`\n■ ${st.idx} ${st.title} (${st.land}${st.night ? ', 밤' : ''}) ${g[0].length}x${g.length} 승리:${st.goal}${st.turnLimit ? ' 제한' + st.turnLimit + '턴' : ''}`);
  if (st.tip) console.log('  작전 요지:', st.tip);
  console.log(g.map((r) => '  ' + r.join('')).join('\n'));
  console.log(lines.join('\n'));
}
console.log('\n범례:', LEG);
