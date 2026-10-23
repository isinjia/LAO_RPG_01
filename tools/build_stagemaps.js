// 작전 지도 만들기: node tools/build_stagemaps.js → js/stagemaps.js
// 작전마다 대본의 장소·사정에 맞는 지도 꼴(SPEC)을 골라, 크기·방향·지형 배치·아군 시작 자리·적 무리가 나오는 자리와 진형을 정한다.
// 지형 글자는 js/data.js 의 TERRAIN 그대로. 1-1·1-2(길잡이 작전)는 손으로 만든 지도를 그대로 둔다.
// 만든 뒤 검사: 모든 무리 자리·시작 칸에 걸어서 닿는지, 칸 수가 모자라지 않는지.
global.window = global;
require('../js/data.js');
const D = DATA;

// [지도 꼴, 가로, 세로, 방향(up: 아군 아래→적 위, down, right: 아군 왼쪽, left), 무리별 나오는 자리·진형]
// 자리: front 정면 / far 맨 끝 / left·right 옆 / rear 뒤(기습) / keep 요새 안 / ring 사방 / pincer 양옆 둘로 나눠
// 진형: line 횡대 / wedge 쐐기 / blob 덩어리 / scatter 흩어짐 / ring 우두머리 둘레
const SPEC = {
  '1-3': ['cliff', 13, 22, 'up', ['front:line', 'far:wedge']], // 밤의 해안 절벽길을 올라 등대로
  '1-4': ['pincer', 22, 12, 'up', ['front:scatter', 'pincer:blob']], // 신호가 나는 폐허 거리, 양옆 골목에서 습격
  '1-5': ['siege', 18, 17, 'up', ['front:line', 'left:wedge', 'keep:blob']], // 붙잡힌 기계들을 구하러 철충 진지로
  '1-6': ['encircle', 20, 20, 'up', ['front:line', 'pincer:blob', 'rear:wedge']], // 미끼가 되어 포위망 한가운데
  '1-7': ['corridor', 26, 11, 'right', ['front:line', 'far:wedge', 'rear:scatter']], // 해안 절벽길을 따라 요격 (제한 턴)
  '1-8': ['arena', 18, 16, 'up', ['keep:ring']], // 함정에 걸린 적 우두머리
  '2-1': ['maze', 20, 14, 'right', ['front:blob', 'left:line', 'far:wedge']], // 공단 지대 봉인된 창고들
  '2-2': ['diagonal', 20, 16, 'up', ['front:line', 'right:wedge', 'far:scatter']], // 수소 전지 저장고
  '2-3': ['river', 18, 20, 'up', ['front:scatter', 'left:wedge', 'right:wedge']], // 밤, 강 건너 식량 창고
  '2-4': ['pincer', 24, 12, 'right', ['front:line', 'pincer:wedge']], // 그리운 옛 집 골목
  '2-5': ['siege', 20, 18, 'up', ['front:line', 'left:blob', 'keep:wedge']], // 헤파이스 철공소
  '2-6': ['maze', 22, 16, 'up', ['front:scatter', 'right:blob', 'far:wedge']], // 철충화된 공장 안
  '2-7': ['encircle', 24, 20, 'up', ['front:line', 'left:wedge', 'right:wedge', 'pincer:scatter']], // 위급한 마리에게 달려가는 길
  '2-8': ['tunnel', 20, 22, 'up', ['front:scatter', 'keep:ring']], // 장군의 은신처 (지하)
  '3-1': ['field', 22, 14, 'right', ['front:scatter', 'far:wedge']], // 마리가 본 수상한 숲
  '3-2': ['river', 16, 20, 'up', ['front:line', 'left:blob', 'far:wedge']], // 실험장으로 가는 강가 폐허
  '3-3': ['maze', 22, 18, 'up', ['front:blob', 'right:scatter', 'far:wedge']], // 81번 실험장 깊은 곳
  '3-4': ['corridor', 26, 12, 'right', ['front:line', 'rear:scatter']], // 실험장 긴 복도 청소
  '3-5': ['diagonal', 20, 18, 'up', ['front:scatter', 'left:wedge', 'far:line']], // 또 다른 실험장
  '3-6': ['pass', 14, 24, 'down', ['front:wedge', 'front:line', 'far:blob']], // 고갯길 진지에서 증원을 막는다
  '3-7': ['encircle', 22, 20, 'up', ['front:scatter', 'pincer:wedge', 'rear:blob', 'far:line']], // 실험장으로 다시, 트릭스터와 조우
  '3-8': ['arena', 20, 18, 'up', ['keep:ring']], // 트릭스터 사냥
  '4-1': ['tunnel', 22, 16, 'right', ['front:scatter', 'left:blob', 'far:wedge']], // 숨겨진 굴 입구
  '4-2': ['canal', 24, 14, 'right', ['front:line', 'pincer:blob', 'far:wedge']], // 밤의 지하수로
  '4-3': ['maze', 20, 20, 'up', ['front:scatter', 'left:wedge', 'right:blob', 'far:line']], // 신호기를 세울 지하 시설
  '4-4': ['defend', 20, 20, 'up', ['front:line', 'left:wedge', 'right:wedge']], // 드론 기지를 지킨다
  '4-5': ['corridor', 28, 10, 'right', ['front:line', 'rear:scatter', 'far:wedge']], // 드론 수송로 청소
  '4-6': ['encircle', 24, 22, 'up', ['front:line', 'left:blob', 'right:blob', 'rear:wedge', 'far:scatter', 'pincer:wedge']], // 숨겨진 층계, 끝없는 습격
  '4-7': ['yard', 24, 16, 'right', ['front:scatter', 'left:wedge', 'far:line']], // 열차 차고
  '4-8': ['train', 30, 9, 'right', ['front:line', 'rear:ring']], // 달리는 열차 위
  '5-1': ['siege', 20, 16, 'up', ['front:line', 'right:wedge', 'keep:blob']], // 건너편 역사 시설 입구
  '5-2': ['maze', 18, 18, 'up', ['front:blob', 'left:scatter', 'right:wedge']], // 적이 된 로봇
  '5-3': ['servers', 22, 16, 'right', ['front:line', 'left:blob', 'far:wedge']], // 1번 서버 구역
  '5-4': ['servers', 18, 18, 'up', ['front:scatter', 'keep:ring']], // 또 다른 서버실의 트릭스터
  '5-5': ['pincer', 24, 14, 'up', ['front:line', 'pincer:wedge', 'rear:scatter', 'far:blob']], // 전문가와의 약속 장소
  '5-6': ['encircle', 22, 22, 'up', ['front:scatter', 'left:line', 'right:line', 'rear:wedge', 'pincer:blob']], // 스카디 구출
  '5-7': ['defend', 20, 18, 'up', ['front:line', 'pincer:wedge', 'rear:blob']], // 해킹하는 동안 서버실을 지킨다
  '5-8': ['arena', 20, 20, 'up', ['keep:ring']], // 심연의 감시자
  '6-1': ['maze', 20, 16, 'right', ['front:scatter', 'left:wedge', 'far:blob']], // 봉인된 연구실
  '6-2': ['diagonal', 22, 18, 'up', ['front:scatter', 'right:line', 'left:wedge', 'far:blob']], // 가상 현실 금고
  '6-3': ['tunnel', 20, 20, 'up', ['front:scatter', 'left:blob', 'right:wedge', 'pincer:line', 'far:wedge']], // 얼음 무덤 연구소
  '6-4': ['corridor', 26, 12, 'right', ['front:line', 'pincer:scatter', 'far:wedge']], // 라비아타의 추억 (가상)
  '6-5': ['river', 22, 16, 'right', ['front:scatter', 'left:wedge', 'right:blob', 'far:line']], // 에바의 기억 : 아미나
  '6-6': ['encircle', 22, 20, 'up', ['front:line', 'pincer:wedge', 'rear:scatter', 'far:blob']], // 에바의 기억 : 인간의 창조
  '6-7': ['siege', 22, 18, 'up', ['front:scatter', 'left:wedge', 'right:wedge', 'keep:blob']], // 라비아타의 은신처
  '6-8': ['arena', 22, 20, 'up', ['front:scatter', 'keep:ring']], // 김지석의 무덤
};

// ── 땅 갈래별 지형 글자 ──
const PAL = {
  out: { cover: ['f', 'f', 'h', 's'], block: ['m', 'm', '#'], road: 'r', fort: 'c', water: 'w', village: 'v' },
  ind: { cover: ['f', 's', 'h'], block: ['#', 'm'], road: 'r', fort: 'c', water: 'w', village: 'c' },
};
const INDOOR = new Set(['lab', 'base', 'vr', 'tomb', 'factory', 'infect']);
const palOf = (land) => (INDOOR.has(land) ? PAL.ind : PAL.out);

// 씨앗 있는 난수 (작전마다 같은 지도)
function rng(seed) { let s = 0; for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ── 기본 지도 (아군 아래, 적 위) 만들기 ──
function canvas(w, h, fill) {
  const g = []; for (let y = 0; y < h; y++) g.push(Array(w).fill(fill));
  const C = {
    w, h, g,
    in: (x, y) => x >= 0 && y >= 0 && x < w && y < h,
    set(x, y, c) { if (C.in(x, y)) g[y][x] = c; },
    get: (x, y) => (C.in(x, y) ? g[y][x] : null),
    rect(x, y, rw, rh, c) { for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) C.set(xx, yy, c); },
    blob(cx, cy, r, c, R, keep) { for (let yy = Math.floor(cy - r); yy <= cy + r; yy++) for (let xx = Math.floor(cx - r); xx <= cx + r; xx++) { const d = Math.hypot(xx - cx, yy - cy) / r; if (d <= 1 && R() > d * 0.75 && !(keep && keep(xx, yy))) C.set(xx, yy, c); } },
    // 굽이 길: (x0,y0)→(x1,y1), 폭 wd
    path(x0, y0, x1, y1, c, wd, R, wig = 0.35) {
      let x = x0, y = y0, n = 0;
      while ((x !== x1 || y !== y1) && n++ < 400) {
        for (let k = 0; k < wd; k++) { C.set(x + (Math.abs(x1 - x0) >= Math.abs(y1 - y0) ? 0 : k), y + (Math.abs(x1 - x0) >= Math.abs(y1 - y0) ? k : 0), c); }
        const dx = Math.sign(x1 - x), dy = Math.sign(y1 - y);
        if (dx && dy) { if (R() < 0.5) x += dx; else y += dy; }
        else if (dx) { if (R() < wig && C.in(x, y + 1) && C.in(x, y - 1)) y += R() < 0.5 ? 1 : -1; else x += dx; }
        else { if (R() < wig && C.in(x + 1, y) && C.in(x - 1, y)) x += R() < 0.5 ? 1 : -1; else y += dy; }
      }
      for (let k = 0; k < wd; k++) C.set(x1 + (Math.abs(x1 - x0) >= Math.abs(y1 - y0) ? 0 : k), y1 + (Math.abs(x1 - x0) >= Math.abs(y1 - y0) ? k : 0), c);
    },
  };
  return C;
}
// 덮개(숲·언덕·폐허)를 군데군데. keep(x,y) 칸은 비워 둔다
function sprinkle(C, R, P, n, rmin, rmax, keep, chars) {
  for (let i = 0; i < n; i++) {
    const cx = 1 + R() * (C.w - 2), cy = 1 + R() * (C.h - 2), r = rmin + R() * (rmax - rmin);
    const c = (chars || P.cover)[Math.floor(R() * (chars || P.cover).length)];
    C.blob(cx, cy, r, c, R, (x, y) => keep(x, y) || C.get(x, y) !== '.');
  }
}

// 지도 꼴마다: 기본 방향(아군 아래)으로 그리고 자리(앵커)를 돌려준다. 자리 좌표는 기본 방향 기준
const ARCH = {
  field(C, R, P) {
    const S = [C.w >> 1, C.h - 2];
    C.path(S[0], C.h - 1, (C.w >> 1) + Math.round((R() - 0.5) * 4), 0, P.road, 1, R, 0.4);
    sprinkle(C, R, P, Math.round(C.w * C.h / 22), 1, 2.4, (x, y) => Math.hypot(x - S[0], y - S[1]) < 3);
    sprinkle(C, R, P, 2, 1, 1.8, (x, y) => Math.hypot(x - S[0], y - S[1]) < 4 || y > C.h * 0.7, P.block);
    if (P.village) C.rect((C.w >> 1) - 1, Math.round(C.h * 0.45), 2, 1, P.village);
    return { S, front: [C.w >> 1, Math.round(C.h * 0.3)], far: [C.w >> 1, 1], left: [2, Math.round(C.h * 0.35)], right: [C.w - 3, Math.round(C.h * 0.35)], rear: [2, C.h - 2], rear2: [C.w - 3, C.h - 2], keep: [C.w >> 1, 2] };
  },
  diagonal(C, R, P) {
    const S = [2, C.h - 3];
    C.path(1, C.h - 2, C.w - 2, 1, P.road, 2, R, 0.2);
    sprinkle(C, R, P, Math.round(C.w * C.h / 20), 1, 2.6, (x, y) => Math.hypot(x - S[0], y - S[1]) < 3.5 || Math.hypot(x - C.w + 3, y - 2) < 2.5);
    sprinkle(C, R, P, 3, 1.2, 2, (x, y) => Math.hypot(x - S[0], y - S[1]) < 5, P.block);
    C.rect(C.w - 5, 1, 3, 2, P.fort);
    return { S, front: [Math.round(C.w * 0.55), Math.round(C.h * 0.45)], far: [C.w - 3, 2], left: [Math.round(C.w * 0.3), 1], right: [C.w - 2, Math.round(C.h * 0.6)], rear: [Math.round(C.w * 0.5), C.h - 2], keep: [C.w - 4, 2] };
  },
  river(C, R, P) {
    const S = [C.w >> 1, C.h - 2], ry = Math.round(C.h * 0.48);
    let y = ry;
    for (let x = 0; x < C.w; x++) { C.set(x, y, P.water); C.set(x, y + 1, P.water); if (R() < 0.25) y = Math.max(ry - 1, Math.min(ry + 1, y + (R() < 0.5 ? -1 : 1))); }
    const nb = C.w > 18 ? 3 : 2;
    for (let b = 0; b < nb; b++) {
      const bx = Math.round((C.w / (nb + 1)) * (b + 1) + (R() - 0.5) * 2);
      for (let yy = ry - 2; yy <= ry + 3; yy++) if (C.get(bx, yy) === P.water) { C.set(bx, yy, '='); if (b === 1 && nb === 3) C.set(bx + 1, yy, C.get(bx + 1, yy) === P.water ? '=' : C.get(bx + 1, yy)); }
    }
    sprinkle(C, R, P, Math.round(C.w * C.h / 24), 1, 2.2, (x, y) => Math.hypot(x - S[0], y - S[1]) < 3 || Math.abs(y - ry) < 2.5);
    return { S, front: [C.w >> 1, ry - 3], far: [C.w >> 1, 1], left: [1, ry - 4], right: [C.w - 2, ry - 4], rear: [1, C.h - 2], keep: [C.w >> 1, 2] };
  },
  pincer(C, R, P) {
    const ry = Math.round(C.h * 0.62), S = [C.w >> 1, ry];
    C.rect(0, ry, C.w, 1, P.road); C.rect(0, ry + 1, C.w, 1, P.road);
    for (let x = 0; x < C.w; x++) { if (R() < 0.55) C.set(x, ry - 1, P.cover[Math.floor(R() * P.cover.length)]); if (R() < 0.5) C.set(x, ry + 2, P.cover[Math.floor(R() * P.cover.length)]); }
    sprinkle(C, R, P, Math.round(C.w * C.h / 18), 1, 2.4, (x, y) => Math.hypot(x - S[0], y - S[1]) < 3 || Math.abs(y - ry) < 1);
    sprinkle(C, R, P, 3, 1, 2, (x, y) => Math.abs(x - S[0]) < 4 || Math.abs(y - ry) < 2, P.block);
    for (let x = S[0] - 2; x <= S[0] + 2; x++) for (let y = ry - 1; y <= ry + 2; y++) if (C.get(x, y) !== P.road) C.set(x, y, '.');
    return { S, front: [C.w >> 1, 1], far: [C.w >> 1, 1], left: [1, ry], right: [C.w - 2, ry], rear: [C.w >> 1, C.h - 1], keep: [C.w >> 1, 1] };
  },
  siege(C, R, P) {
    const S = [C.w >> 1, C.h - 2];
    const fx = 3, fy = 1, fw = C.w - 6, fh = Math.round(C.h * 0.38);
    C.rect(fx, fy, fw, 1, '#'); C.rect(fx, fy + fh, fw, 1, '#'); C.rect(fx, fy, 1, fh + 1, '#'); C.rect(fx + fw - 1, fy, 1, fh + 1, '#');
    C.rect(fx + 1, fy + 1, fw - 2, fh - 1, '.');
    const g1 = fx + Math.round(fw * 0.25), g2 = fx + Math.round(fw * 0.72);
    C.rect(g1, fy + fh, 2, 1, P.road); C.rect(g2, fy + fh, 1, 1, P.road); C.rect(fx, fy + (fh >> 1), 1, 1, P.road);
    C.rect((C.w >> 1) - 1, fy + 1, 3, 2, P.fort);
    for (let i = 0; i < 4; i++) C.set(fx + 2 + Math.floor(R() * (fw - 4)), fy + 2 + Math.floor(R() * (fh - 3)), P.cover[Math.floor(R() * P.cover.length)]);
    C.path(S[0], C.h - 1, g1, fy + fh + 1, P.road, 1, R, 0.2);
    sprinkle(C, R, P, Math.round(C.w * C.h / 26), 1, 2, (x, y) => Math.hypot(x - S[0], y - S[1]) < 3 || y <= fy + fh + 1);
    return { S, front: [C.w >> 1, fy + fh + 2], far: [C.w >> 1, fy + 2], left: [1, fy + fh + 2], right: [C.w - 2, fy + fh + 2], rear: [1, C.h - 2], keep: [C.w >> 1, fy + 2] };
  },
  defend(C, R, P) {
    const cx = C.w >> 1, cy = Math.round(C.h * 0.55), r = 4, S = [cx, cy];
    C.rect(cx - r, cy - r, 2 * r + 1, 1, '#'); C.rect(cx - r, cy + r, 2 * r + 1, 1, '#'); C.rect(cx - r, cy - r, 1, 2 * r + 1, '#'); C.rect(cx + r, cy - r, 1, 2 * r + 1, '#');
    C.rect(cx - r + 1, cy - r + 1, 2 * r - 1, 2 * r - 1, '.'); C.rect(cx - 1, cy - 1, 3, 3, P.fort);
    C.rect(cx, cy - r, 1, 1, P.road); C.rect(cx - r, cy, 1, 1, P.road); C.rect(cx + r, cy, 1, 1, P.road); C.rect(cx, cy + r, 1, 1, P.road);
    sprinkle(C, R, P, Math.round(C.w * C.h / 20), 1, 2.4, (x, y) => Math.abs(x - cx) <= r + 1 && Math.abs(y - cy) <= r + 1);
    return { S, front: [cx, 1], far: [cx, 1], left: [1, cy], right: [C.w - 2, cy], rear: [cx, C.h - 2], keep: [cx, 1] };
  },
  encircle(C, R, P) {
    const S = [C.w >> 1, Math.round(C.h * 0.55)];
    C.path(0, S[1], C.w - 1, S[1], P.road, 1, R, 0.25); C.path(S[0], 0, S[0], C.h - 1, P.road, 1, R, 0.25);
    sprinkle(C, R, P, Math.round(C.w * C.h / 17), 1, 2.6, (x, y) => Math.hypot(x - S[0], y - S[1]) < 3.5);
    sprinkle(C, R, P, 4, 1, 2, (x, y) => Math.hypot(x - S[0], y - S[1]) < 6, P.block);
    return { S, front: [S[0], 1], far: [S[0], 1], left: [1, S[1]], right: [C.w - 2, S[1]], rear: [S[0], C.h - 2], keep: [S[0], 1] };
  },
  maze(C, R, P) {
    C.rect(0, 0, C.w, C.h, '#');
    const cols = C.w >= 20 ? 4 : 3, rows = C.h >= 16 ? 3 : 2, cw = Math.floor((C.w - 1) / cols), ch = Math.floor((C.h - 1) / rows);
    const cell = (i, j) => [1 + i * cw, 1 + j * ch];
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const [x, y] = cell(i, j); C.rect(x, y, cw - 1, ch - 1, '.');
      if (i < cols - 1) { const dy = y + 1 + Math.floor(R() * (ch - 3)); C.rect(x + cw - 1, dy, 1, 2, P.road); }
      if (j < rows - 1 && (R() < 0.75 || i === (cols >> 1))) { const dx = x + 1 + Math.floor(R() * (cw - 3)); C.rect(dx, y + ch - 1, 2, 1, P.road); }
      for (let k = 0; k < 2; k++) C.set(x + 1 + Math.floor(R() * (cw - 3)), y + 1 + Math.floor(R() * (ch - 3)), P.cover[Math.floor(R() * P.cover.length)]);
      if (R() < 0.4) C.set(x + Math.floor(R() * (cw - 1)), y, P.block[Math.floor(R() * P.block.length)]);
    }
    const [sx, sy] = cell(cols >> 1, rows - 1);
    C.rect(sx, C.h - 2, cw - 1, 1, '.');
    const S = [sx + ((cw - 1) >> 1), sy + ch - 3];
    C.rect(cell(cols - 1, 0)[0] + 1, 2, 2, 1, P.fort);
    return { S, front: [cell(cols >> 1, Math.max(0, rows - 2))[0] + 2, cell(0, Math.max(0, rows - 2))[1] + 1], far: [cell(cols >> 1, 0)[0] + 2, 2], left: [cell(0, rows - 1)[0] + 2, cell(0, rows - 1)[1] + 2], right: [cell(cols - 1, rows - 1)[0] + 2, cell(0, rows - 1)[1] + 2], rear: [cell(0, 0)[0] + 2, 2], keep: [cell(cols - 1, 0)[0] + 2, 2] };
  },
  servers(C, R, P) { // 서버실: 늘어선 서버 줄 사이 통로
    const S = [C.w >> 1, C.h - 2];
    for (let y = 2; y < C.h - 4; y += 3) {
      for (let x = 1; x < C.w - 1; x++) if ((x + y) % 7 !== 0 && x !== (C.w >> 1) && x !== (C.w >> 1) - 1) C.set(x, y, R() < 0.8 ? 'm' : 'f');
    }
    C.rect(0, 0, C.w, 1, '#'); C.rect(0, 0, 1, C.h, '#'); C.rect(C.w - 1, 0, 1, C.h, '#');
    C.rect((C.w >> 1) - 1, 1, 2, C.h - 1, P.road);
    C.rect((C.w >> 1) - 1, 1, 3, 2, P.fort);
    return { S, front: [C.w >> 1, Math.round(C.h * 0.4)], far: [C.w >> 1, 1], left: [2, Math.round(C.h * 0.45)], right: [C.w - 3, Math.round(C.h * 0.45)], rear: [2, C.h - 2], keep: [C.w >> 1, 2] };
  },
  corridor(C, R, P) { // 긴 길: 세 갈래 통로가 군데군데 이어진다
    const S = [C.w >> 1, C.h - 2], a = Math.round(C.w / 3), b = Math.round((C.w * 2) / 3);
    for (let y = 2; y < C.h - 3; y++) { if (y % 6 !== 0) { C.set(a, y, P.block[0]); C.set(b, y, P.block[0]); } }
    for (let y = 1; y < C.h - 1; y++) if (R() < 0.25) C.set(1 + Math.floor(R() * (C.w - 2)), y, P.cover[Math.floor(R() * P.cover.length)]);
    C.rect((C.w >> 1) - 1, 0, 2, C.h, P.road);
    for (let x = S[0] - 2; x <= S[0] + 2; x++) for (let y = C.h - 3; y < C.h; y++) C.set(x, y, C.get(x, y) === P.road ? P.road : '.');
    return { S, front: [C.w >> 1, Math.round(C.h * 0.45)], far: [C.w >> 1, 1], left: [1, Math.round(C.h * 0.5)], right: [C.w - 2, Math.round(C.h * 0.5)], rear: [1, C.h - 2], keep: [C.w >> 1, 1] };
  },
  tunnel(C, R, P) { // 굴: 바위 속을 굽이굽이 판 길과 동굴방
    C.rect(0, 0, C.w, C.h, P.block[0]);
    const S = [C.w >> 1, C.h - 2];
    const dig = (x0, y0, x1, y1) => { C.path(x0, y0, x1, y1, '.', 2, R, 0.45); };
    const rooms = [[S[0], C.h - 3, 3], [Math.round(C.w * 0.25), Math.round(C.h * 0.6), 2.6], [Math.round(C.w * 0.75), Math.round(C.h * 0.55), 2.6], [Math.round(C.w * 0.3), Math.round(C.h * 0.25), 2.4], [Math.round(C.w * 0.7), Math.round(C.h * 0.2), 2.6], [C.w >> 1, 3, 3]];
    rooms.forEach(([x, y, r]) => { for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r - 1; xx <= x + r + 1; xx++) if (Math.hypot((xx - x) * 0.8, yy - y) <= r) C.set(Math.round(xx), Math.round(yy), '.'); });
    dig(rooms[0][0], rooms[0][1], rooms[1][0], rooms[1][1]); dig(rooms[0][0], rooms[0][1], rooms[2][0], rooms[2][1]);
    dig(rooms[1][0], rooms[1][1], rooms[3][0], rooms[3][1]); dig(rooms[2][0], rooms[2][1], rooms[4][0], rooms[4][1]);
    dig(rooms[3][0], rooms[3][1], rooms[5][0], rooms[5][1]); dig(rooms[4][0], rooms[4][1], rooms[5][0], rooms[5][1]);
    dig(rooms[1][0], rooms[1][1], rooms[2][0], rooms[2][1]);
    for (let i = 0; i < Math.round(C.w * C.h / 30); i++) { const x = 1 + Math.floor(R() * (C.w - 2)), y = 1 + Math.floor(R() * (C.h - 2)); if (C.get(x, y) === '.' && Math.hypot(x - S[0], y - S[1]) > 3) C.set(x, y, P.cover[Math.floor(R() * P.cover.length)]); }
    return { S, front: rooms[1].slice(0, 2), far: [rooms[5][0], rooms[5][1] - 1], left: rooms[3].slice(0, 2), right: rooms[4].slice(0, 2), rear: rooms[2].slice(0, 2), keep: rooms[5].slice(0, 2) };
  },
  canal(C, R, P) { // 수로: 물길 여러 줄을 다리로 건넌다
    const S = [C.w >> 1, C.h - 2];
    for (let y = 3; y < C.h - 3; y += 5) {
      C.rect(0, y, C.w, 2, P.water);
      for (let k = 0; k < 2; k++) { const bx = 1 + Math.floor(R() * (C.w - 3)); C.rect(bx, y, 2, 2, '='); }
      C.rect((C.w >> 1) - 1 + (y % 2 ? 3 : -3), y, 1, 2, '=');
    }
    sprinkle(C, R, P, Math.round(C.w * C.h / 26), 1, 1.8, (x, y) => Math.hypot(x - S[0], y - S[1]) < 3 || C.get(x, y) !== '.');
    return { S, front: [C.w >> 1, Math.round(C.h * 0.5)], far: [C.w >> 1, 1], left: [1, Math.round(C.h * 0.3)], right: [C.w - 2, Math.round(C.h * 0.3)], rear: [1, C.h - 2], keep: [C.w >> 1, 1] };
  },
  yard(C, R, P) { // 차고: 나란한 선로(다리 칸)와 세워 둔 객차(막힘)
    const S = [C.w >> 1, C.h - 2];
    for (let x = 2; x < C.w - 2; x += 4) {
      C.rect(x, 1, 1, C.h - 3, '=');
      let y = 1 + Math.floor(R() * 3);
      while (y < C.h - 5) { const len = 3 + Math.floor(R() * 4); C.rect(x + 1, y, 2, len, P.block[0] === 'm' ? '#' : P.block[0]); y += len + 2 + Math.floor(R() * 3); }
    }
    C.rect(0, C.h - 3, C.w, 1, P.road);
    sprinkle(C, R, P, 6, 1, 1.5, (x, y) => Math.hypot(x - S[0], y - S[1]) < 3 || C.get(x, y) !== '.');
    return { S, front: [C.w >> 1, Math.round(C.h * 0.4)], far: [C.w >> 1, 1], left: [1, Math.round(C.h * 0.4)], right: [C.w - 2, Math.round(C.h * 0.4)], rear: [1, C.h - 2], keep: [C.w >> 1, 1] };
  },
  train(C, R, P) { // 달리는 열차 지붕: 객차 사이 연결부는 한두 칸만 이어진다
    C.rect(0, 0, C.w, C.h, '#'); // 열차 밖 (선로 아래로 떨어지는 곳)
    const x0 = 2, x1 = C.w - 3;
    for (let y = 0; y < C.h; y++) {
      const gap = y % 6 === 5;
      if (gap) { C.set(C.w >> 1, y, '='); if (R() < 0.5) C.set((C.w >> 1) - 1, y, '='); }
      else for (let x = x0; x <= x1; x++) C.set(x, y, R() < 0.08 ? 'f' : R() < 0.06 ? 'h' : '.');
    }
    const S = [C.w >> 1, C.h - 2];
    return { S, front: [C.w >> 1, Math.round(C.h * 0.4)], far: [C.w >> 1, 1], left: [x0, Math.round(C.h * 0.5)], right: [x1, Math.round(C.h * 0.5)], rear: [C.w >> 1, C.h - 1], keep: [C.w >> 1, 2] };
  },
  arena(C, R, P) { // 우두머리 결전장: 둥근 마당과 둘레의 기둥·엄폐물
    const cx = C.w >> 1, cy = Math.round(C.h * 0.42), r = Math.min(C.w, C.h) * 0.36, S = [cx, C.h - 2];
    for (let y = 0; y < C.h; y++) for (let x = 0; x < C.w; x++) { const d = Math.hypot((x - cx) / 1.1, y - cy); if (d > r + 1.6 && y < C.h - 4) C.set(x, y, d < r + 2.6 && R() < 0.4 ? P.cover[0] : P.block[0]); } // 둘레 한 겹만 엄폐물, 그 밖은 벽(지도 밖으로 깎인다)
    for (let a = 0; a < 8; a++) { const t = (a / 8) * Math.PI * 2; C.set(Math.round(cx + Math.cos(t) * r * 0.75 * 1.1), Math.round(cy + Math.sin(t) * r * 0.75), a % 2 ? P.block[0] : P.cover[1] || P.cover[0]); }
    C.rect(cx - 1, C.h - 5, 3, 5, '.');
    C.path(cx, C.h - 1, cx, Math.round(cy + r), P.road, 1, R, 0.1);
    return { S, front: [cx, Math.round(cy + r * 0.5)], far: [cx, Math.max(1, Math.round(cy - r * 0.6))], left: [Math.round(cx - r), cy], right: [Math.round(cx + r), cy], rear: [cx, C.h - 1], keep: [cx, cy - 1] };
  },
  cliff(C, R, P) { // 해안 절벽길: 한쪽은 바다, 한쪽은 바위산, 사이로 좁은 길이 굽이친다
    for (let y = 0; y < C.h; y++) {
      const sea = 2 + Math.round(Math.sin(y * 0.5) * 1.2 + R()), rock = C.w - 2 - Math.round(Math.cos(y * 0.4) * 1.3 + R());
      for (let x = 0; x < sea; x++) C.set(x, y, P.water);
      for (let x = rock; x < C.w; x++) C.set(x, y, 'm');
    }
    C.path(C.w >> 1, C.h - 1, C.w >> 1, 0, P.road, 1, R, 0.5);
    sprinkle(C, R, P, Math.round(C.w * C.h / 22), 0.8, 1.8, (x, y) => C.get(x, y) !== '.' || (y > C.h - 4));
    C.rect((C.w >> 1) - 1, 0, 3, 2, P.fort);
    const S = [C.w >> 1, C.h - 2];
    return { S, front: [C.w >> 1, Math.round(C.h * 0.55)], far: [C.w >> 1, 1], left: [3, Math.round(C.h * 0.4)], right: [C.w - 4, Math.round(C.h * 0.4)], rear: [C.w >> 1, C.h - 1], keep: [C.w >> 1, 1] };
  },
  pass(C, R, P) { // 고갯길: 양쪽 산 사이 좁았다 넓어지는 길
    for (let y = 0; y < C.h; y++) {
      const half = 2 + Math.round(Math.abs(Math.sin(y * 0.28)) * 3 + R());
      for (let x = 0; x < C.w; x++) if (Math.abs(x - (C.w >> 1)) > half) C.set(x, y, R() < 0.8 ? 'm' : 'h');
    }
    C.path(C.w >> 1, C.h - 1, C.w >> 1, 0, P.road, 1, R, 0.3);
    sprinkle(C, R, P, Math.round(C.w * C.h / 30), 0.8, 1.5, (x, y) => C.get(x, y) !== '.' || y > C.h - 5, ['f', 'h']);
    C.rect((C.w >> 1) - 2, C.h - 4, 5, 1, 's'); // 진지 앞 모래주머니
    const S = [C.w >> 1, C.h - 2];
    return { S, front: [C.w >> 1, Math.round(C.h * 0.45)], far: [C.w >> 1, 1], left: [3, Math.round(C.h * 0.3)], right: [C.w - 4, Math.round(C.h * 0.3)], rear: [C.w >> 1, C.h - 1], keep: [C.w >> 1, 1] };
  },
};

// ── 윤곽: 지도를 네모로 두지 않는다 (랑그릿사·파이어 엠블렘처럼 땅 모양이 곧 전장) ──
// 'x' = 지도 밖. 아군 시작 자리·무리 자리 둘레는 남긴다
const OUTLINE = {
  // 가장자리를 들쭉날쭉 깎는다 (sides: 위·아래·왼쪽·오른쪽 중 깎을 쪽)
  edges(C, R, keep, d, sides = 'tblr') {
    const prof = (n) => { const out = []; let v = R() * d; for (let i = 0; i < n; i++) { v = Math.max(0, Math.min(d, v + (R() - 0.5) * 1.6)); out.push(Math.round(v)); } return out; };
    const T = prof(C.w), B = prof(C.w), Lp = prof(C.h), Rp = prof(C.h);
    for (let y = 0; y < C.h; y++) for (let x = 0; x < C.w; x++) {
      if (keep(x, y)) continue;
      if ((sides.includes('t') && y < T[x]) || (sides.includes('b') && y >= C.h - B[x]) || (sides.includes('l') && x < Lp[y]) || (sides.includes('r') && x >= C.w - Rp[y])) C.set(x, y, 'x');
    }
  },
  // 모서리를 비스듬히(diag) 또는 네모(square)로 잘라 낸다. which: tl tr bl br
  corners(C, R, keep, size, which, diag = true) {
    for (const k of which) {
      const sx = k[1] === 'l' ? 1 : -1, sy = k[0] === 't' ? 1 : -1, ox = k[1] === 'l' ? 0 : C.w - 1, oy = k[0] === 't' ? 0 : C.h - 1;
      const sz = size + Math.round((R() - 0.5) * 2);
      for (let i = 0; i < sz + 2; i++) for (let j = 0; j < sz + 2; j++) {
        const x = ox + sx * i, y = oy + sy * j;
        if ((diag ? i + j < sz + (R() < 0.3 ? 1 : 0) : i < sz && j < sz) && !keep(x, y)) C.set(x, y, 'x');
      }
    }
  },
  // 사방이 막힘(벽·산·바위)뿐인 칸은 지도 밖으로: 굴·미로·고갯길이 땅 모양 그대로 지도가 된다
  hollow(C, keep, r = 2) {
    const walk = (c) => c && c !== 'x' && D.TERRAIN[c].cost.foot < 99 && c !== 'm';
    const kill = [];
    for (let y = 0; y < C.h; y++) for (let x = 0; x < C.w; x++) {
      const c = C.get(x, y);
      if (walk(c) || c === 'w' || c === '=' || keep(x, y)) continue;
      let near = false;
      for (let dy = -r; dy <= r && !near; dy++) for (let dx = -r; dx <= r; dx++) if (Math.abs(dx) + Math.abs(dy) <= r && walk(C.get(x + dx, y + dy))) { near = true; break; }
      if (!near) kill.push([x, y]);
    }
    // 가장자리에서 이어진 것만 (산 속 구멍처럼 안쪽에 홀로 뚫리지 않게)
    const cand = new Set(kill.map(([x, y]) => x + ',' + y)), seen = new Set(), q = [];
    for (const [x, y] of kill) if (x === 0 || y === 0 || x === C.w - 1 || y === C.h - 1) { seen.add(x + ',' + y); q.push([x, y]); }
    while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (x + dx) + ',' + (y + dy); if (cand.has(k) && !seen.has(k)) { seen.add(k); q.push([x + dx, y + dy]); } } }
    kill.filter(([x, y]) => seen.has(x + ',' + y)).forEach(([x, y]) => C.set(x, y, 'x'));
  },
};
// 지도 꼴마다 윤곽
const SHAPE = {
  field: (C, R, k) => { OUTLINE.edges(C, R, k, 2); OUTLINE.corners(C, R, k, Math.round(C.w * 0.3), [R() < 0.5 ? 'tl' : 'tr'], false); },
  diagonal: (C, R, k) => { OUTLINE.corners(C, R, k, Math.round(Math.min(C.w, C.h) * 0.5), ['tl', 'br']); OUTLINE.edges(C, R, k, 1); },
  river: (C, R, k) => { OUTLINE.edges(C, R, k, 3, 'lr'); OUTLINE.edges(C, R, k, 1, 'tb'); },
  pincer: (C, R, k) => { OUTLINE.corners(C, R, k, Math.round(C.h * 0.4), ['tl', 'tr'], false); OUTLINE.corners(C, R, k, Math.round(C.h * 0.22), ['bl', 'br']); OUTLINE.edges(C, R, k, 1); },
  siege: (C, R, k) => { OUTLINE.corners(C, R, k, Math.round(C.w * 0.28), ['bl', 'br']); OUTLINE.edges(C, R, k, 1, 'lrb'); },
  defend: (C, R, k) => { OUTLINE.corners(C, R, k, Math.round(Math.min(C.w, C.h) * 0.3), ['tl', 'tr', 'bl', 'br']); },
  encircle: (C, R, k) => { OUTLINE.corners(C, R, k, Math.round(Math.min(C.w, C.h) * 0.24), ['tl', 'tr', 'bl', 'br'], false); OUTLINE.edges(C, R, k, 1); },
  maze: (C, R, k) => OUTLINE.hollow(C, k, 1),
  servers: (C, R, k) => { OUTLINE.corners(C, R, k, 3, ['bl', 'br'], false); OUTLINE.hollow(C, k, 1); },
  corridor: (C, R, k) => { OUTLINE.edges(C, R, k, 3, 'lr'); },
  tunnel: (C, R, k) => OUTLINE.hollow(C, k, 1),
  canal: (C, R, k) => { OUTLINE.edges(C, R, k, 2, 'lr'); OUTLINE.corners(C, R, k, 3, ['tl', 'br']); },
  yard: (C, R, k) => { OUTLINE.corners(C, R, k, 4, ['tl', 'tr']); OUTLINE.edges(C, R, k, 1, 'lr'); },
  train: (C, R, k) => OUTLINE.hollow(C, k, 0),
  arena: (C, R, k) => OUTLINE.hollow(C, k, 1),
  cliff: (C, R, k) => OUTLINE.hollow(C, k, 2),
  pass: (C, R, k) => OUTLINE.hollow(C, k, 1),
};

// ── 방향 돌리기: 기본(아군 아래)을 작전 방향으로 ──
function orient(C, A, dir, flip) {
  const cw = C.w, ch = C.h;
  const T = {
    up: (x, y) => [x, y], down: (x, y) => [cw - 1 - x, ch - 1 - y],
    right: (x, y) => [ch - 1 - y, x], left: (x, y) => [y, cw - 1 - x],
  }[dir];
  const W = dir === 'up' || dir === 'down' ? cw : ch, H = dir === 'up' || dir === 'down' ? ch : cw;
  const F = (x, y) => { const [a, b] = T(x, y); return !flip ? [a, b] : dir === 'up' || dir === 'down' ? [W - 1 - a, b] : [a, H - 1 - b]; }; // 뒤집기는 옆 방향만
  const g = []; for (let y = 0; y < H; y++) g.push(Array(W).fill('.'));
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const [a, b] = F(x, y); g[b][a] = C.g[y][x]; }
  const out = {};
  for (const k in A) out[k] = F(A[k][0], A[k][1]);
  return { g, A: out, W, H };
}

// 걸어서 닿는 칸 (보행)
const FOOT = (c) => D.TERRAIN[c].cost.foot < 99;
function reach(g, s) {
  const H = g.length, W = g[0].length, seen = new Set([s[0] + ',' + s[1]]), q = [s];
  while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen.has(nx + ',' + ny) || !FOOT(g[ny][nx])) continue; seen.add(nx + ',' + ny); q.push([nx, ny]); } }
  return seen;
}
// 닿지 않는 자리는 시작 자리까지 평지 길을 판다
function connect(g, S, p) {
  let [x, y] = p;
  while (!(x === S[0] && y === S[1])) { if (!FOOT(g[y][x])) g[y][x] = '.'; if (x !== S[0] && (y === S[1] || Math.random() < 0.5)) x += Math.sign(S[0] - x); else y += Math.sign(S[1] - y); }
}
// 자리 근처에서 걸을 수 있는 칸
function nearFoot(g, p, avoid) {
  const H = g.length, W = g[0].length;
  for (let r = 0; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.abs(dx) + Math.abs(dy) !== r) continue; const x = p[0] + dx, y = p[1] + dy; if (x >= 0 && y >= 0 && x < W && y < H && FOOT(g[y][x]) && !(avoid && avoid.has(x + ',' + y))) return [x, y]; }
  return p;
}

const out = {};
let bad = 0;
// 손으로 설계한 전략 지도 (tools/maps/chNN.js). 있으면 자동 지도 대신 쓴다
const HAND = {};
for (const f of require('fs').readdirSync(__dirname + '/maps').filter((f) => /^ch\d+\.js$/.test(f))) Object.assign(HAND, require('./maps/' + f));
for (const st of D.STAGES) {
  if (HAND[st.idx]) { const h = HAND[st.idx]; out[st.idx] = { map: h.map, starts: h.starts, waves: h.waves, tip: h.tip }; continue; }
  const sp = SPEC[st.idx];
  if (!sp) continue;
  const [arch, W, H, dir, waveSpec] = sp;
  const R = rng(st.idx + arch);
  const cw = dir === 'up' || dir === 'down' ? W : H, ch = dir === 'up' || dir === 'down' ? H : W;
  const C = canvas(cw, ch, '.');
  const P = Object.assign({}, palOf(st.land));
  if (['lab', 'vr', 'tomb', 'factory', 'infect'].includes(st.land)) P.water = '#'; // 물이 없는 실내: 물길 자리는 벽
  const A0 = ARCH[arch](C, R, P);
  const pins = Object.values(A0);
  const keep = (x, y) => pins.some(([px, py]) => Math.abs(px - x) + Math.abs(py - y) <= 2);
  if (SHAPE[arch]) SHAPE[arch](C, R, keep);
  const flip = R() < 0.5;
  let { g, A } = orient(C, A0, dir, flip);
  const S = nearFoot(g, A.S);
  // 아군 시작 칸 8곳: 시작 자리 둘레의 걸을 수 있는 칸 (가까운 순)
  const starts = [];
  for (let r = 0; r < 5 && starts.length < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.abs(dx) + Math.abs(dy) !== r || starts.length >= 8) continue;
    const x = S[0] + dx, y = S[1] + dy;
    if (x >= 0 && y >= 0 && x < g[0].length && y < g.length) { if (!FOOT(g[y][x])) g[y][x] = '.'; starts.push([x, y]); }
  }
  // 무리 자리: 진형 이름 → 자리. 처음 무리는 아군과 너무 붙지 않게
  const taken = new Set(starts.map(([x, y]) => x + ',' + y));
  const waves = st.waves.map((w, i) => {
    const [where, form] = (waveSpec[i] || waveSpec[waveSpec.length - 1]).split(':');
    const isBoss = w.boss;
    let key = where === 'pincer' ? 'left' : where === 'ring' ? 'front' : where;
    if (isBoss && st.win === 'boss') key = 'keep';
    const at = nearFoot(g, A[key] || A.front, taken);
    const res = { at, form: isBoss && st.win === 'boss' ? 'ring' : form };
    if (where === 'pincer') res.at2 = nearFoot(g, A.right, taken);
    if (where === 'rear' && A.rear2) res.at2 = nearFoot(g, A.rear2, taken);
    return res;
  });
  // 닿지 않는 자리 이어 주기
  for (let k = 0; k < 3; k++) {
    const rs = reach(g, S);
    const miss = waves.flatMap((w) => [w.at, w.at2].filter(Boolean)).filter(([x, y]) => !rs.has(x + ',' + y));
    if (!miss.length) break;
    miss.forEach((p) => connect(g, S, p));
  }
  // 아군 쪽과 끊긴 땅 조각은 지도 밖으로 (거기 나온 적이 갇히지 않게). 물·다리는 그대로
  { const rs0 = reach(g, S); for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) { const c = g[y][x]; if (c !== 'x' && c !== 'w' && c !== '=' && FOOT(c) && !rs0.has(x + ',' + y)) g[y][x] = 'x'; } }
  const rs = reach(g, S);
  const miss = waves.flatMap((w) => [w.at, w.at2].filter(Boolean)).filter(([x, y]) => !rs.has(x + ',' + y));
  if (miss.length) { console.log(st.idx, '닿지 않는 무리 자리', JSON.stringify(miss)); bad++; }
  const room = [...rs].length;
  const need = st.waves.reduce((s, w) => s + w.units.length, 0) + 8;
  if (room < need * 2.2) { console.log(st.idx, '걸을 칸이 좁음', room, '필요', need); }
  out[st.idx] = { map: g.map((r) => r.join('')), starts, waves };
}

const fs = require('fs');
const body = `// tools/build_stagemaps.js 로 만듦 (손으로 고치지 말 것). 작전마다 지도 꼴·크기·방향과 적 무리가 나오는 자리·진형
// at: 무리 자리, at2: 둘로 나뉘어 나오는 무리의 둘째 자리, form: line 횡대 · wedge 쐐기 · blob 덩어리 · scatter 흩어짐 · ring 우두머리 둘레
(function () {
  const M = ${JSON.stringify(out)};
  for (const st of (typeof window !== 'undefined' ? window : globalThis).DATA.STAGES) {
    const m = M[st.idx];
    if (!m) continue;
    st.map = m.map; st.starts = m.starts; if (m.tip) st.tip = m.tip;
    st.waves.forEach((w, i) => Object.assign(w, m.waves[i]));
  }
})();
`;
fs.writeFileSync(__dirname + '/../js/stagemaps.js', body);
console.log('작전', Object.keys(out).length, '문제', bad);
for (const k of process.argv.slice(2)) { console.log(k, out[k].map[0].length + 'x' + out[k].map.length); console.log(out[k].map.join('\n')); }
