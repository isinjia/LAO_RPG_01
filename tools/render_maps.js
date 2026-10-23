// 지도 그림 뽑기: node tools/render_maps.js [작전...] → tools/maps_png/<작전>.ppm 대신 한 장짜리 HTML (tools/maps_view.html)
// 칸을 색으로 칠하고 아군 시작(파랑), 무리별 적(빨강 계열 + 무리 번호), 우두머리(노랑 테)를 얹어 지도 전체를 한눈에 본다.
global.window = global;
require('../js/data.js'); require('../js/stagemaps.js'); require('../js/rules.js');
const D = DATA, R = RULES, fs = require('fs');
const COL = { '.': '#7d8a5a', r: '#b9a77a', f: '#3e6b35', h: '#a08a4a', m: '#6e6258', w: '#2f6fa8', '=': '#9b6b3a', v: '#d9b25a', c: '#7a8fb0', '#': '#3a3a3a', s: '#8a7d6e', x: '#0d1117' };
const want = process.argv.slice(2);
const T = 16;
let html = `<!doctype html><meta charset="utf-8"><title>전투 지도 보기</title><style>body{background:#111;color:#ddd;font:13px sans-serif;margin:16px}
.st{display:inline-block;vertical-align:top;margin:0 14px 18px 0}.st h3{margin:2px 0;font-size:13px;color:#ffcc00}.st p{margin:2px 0 6px;max-width:${30 * T}px;color:#aaa}
.g{position:relative}.c{position:absolute;width:${T}px;height:${T}px}.u{position:absolute;width:${T - 2}px;height:${T - 2}px;border-radius:50%;font:bold 10px sans-serif;text-align:center;line-height:${T - 2}px;color:#fff}
.lg span{display:inline-block;width:12px;height:12px;margin:0 3px 0 10px;vertical-align:middle}</style>
<div class="lg">${Object.entries({ '.': '평지', r: '길', f: '숲', h: '언덕', m: '산', w: '물', '=': '다리', v: '마을', c: '기지', '#': '벽', s: '폐허', x: '지도 밖' }).map(([k, n]) => `<span style="background:${COL[k]}"></span>${n}`).join('')}
<span style="background:#2b8cff;border-radius:50%"></span>아군 시작 <span style="background:#d23;border-radius:50%"></span>1무리(숫자=무리) <span style="border:2px solid #ffcc00;border-radius:50%"></span>우두머리 · 테두리 굵음 = 자리 지킴</div>`;
for (const st of D.STAGES) {
  if (want.length && !want.includes(st.idx)) continue;
  const m = st.map, W = m[0].length, H = m.length;
  const G = R.newGame(st);
  st.starts.forEach(([x, y]) => R.makeHero(G, 'constantia', { lv: 1, exp: 0, tier: 0 }, null, x, y));
  let cells = '';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) cells += `<div class="c" style="left:${x * T}px;top:${y * T}px;background:${COL[m[y][x]] || '#f0f'}"></div>`;
  st.starts.forEach(([x, y]) => { cells += `<div class="u" style="left:${x * T + 1}px;top:${y * T + 1}px;background:#2b8cff">P</div>`; });
  const hue = ['#d23', '#e60', '#c3c', '#a06', '#f44', '#b52', '#d48'];
  st.waves.forEach((w, i) => {
    R.spawnWave(G, i).forEach((u) => {
      const hold = u.ai === 'guard';
      cells += `<div class="u" title="${u.name}" style="left:${u.x * T + 1}px;top:${u.y * T + 1}px;background:${hue[i % hue.length]};${u.boss ? 'box-shadow:0 0 0 2px #ffcc00;' : hold ? 'box-shadow:0 0 0 2px #fff;' : ''}">${i + 1}</div>`;
    });
  });
  const ws = st.waves.map((w, i) => `${i + 1}무리 ${w.turn || 1}턴 ${w.units.length}기`).join(' · ');
  html += `<div class="st"><h3>${st.idx} ${st.title} (${W}×${H})</h3><p>${ws}<br>${st.tip || ''}</p><div class="g" style="width:${W * T}px;height:${H * T}px">${cells}</div></div>`;
}
fs.writeFileSync(__dirname + '/maps_view.html', html);
console.log('tools/maps_view.html');
