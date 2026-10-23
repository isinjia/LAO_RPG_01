// 사령관 (원작 밈 모습: 하얀 몸, 둥근 머리, 얼굴에 「사」). 라켓몬스터(6_LAO_Laket_Monster/js/commander.js)의 그리기를 그대로 옮겼다.
// CMDR.draw(g, X, Y, dir, anim): 48px 칸 왼쪽 위 (X, Y)에 발이 Y+45 오도록. dir: 'up'|'down'|'left'|'right', anim: 걷는 박자(0이면 서 있음)
(function () {
const CMD_COL = { body: '#f8f4f7', shade: '#ddd2e2', line: '#4a2a38', ink: '#3a1626', cheek: '#f2c6cf' };

function cmdShape(g, fn, lw = 2) {
  g.beginPath(); fn(g);
  g.fillStyle = CMD_COL.body; g.fill();
  g.lineWidth = lw; g.strokeStyle = CMD_COL.line; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke();
}
// 원형 머리 + 얼굴. view: 'front' | 'back' | 'left' | 'right'
function cmdHead(g, cx, cy, r, view, lw = 2, mood = 'normal') {
  // 머리
  cmdShape(g, c => c.arc(cx, cy, r, 0, Math.PI * 2), lw);
  // 음영
  g.save(); g.beginPath(); g.arc(cx, cy, r - lw / 2, 0, Math.PI * 2); g.clip();
  g.fillStyle = CMD_COL.shade; g.beginPath(); g.arc(cx + r * 0.35, cy + r * 0.35, r, 0, Math.PI * 2); g.globalAlpha = 0.45; g.fill(); g.globalAlpha = 1;
  g.restore();
  if (view === 'back') return;
  const side = view === 'left' ? -1 : view === 'right' ? 1 : 0;
  // 귀 (옆모습)
  if (side) {
    cmdShape(g, c => c.ellipse(cx - side * r * 0.62, cy + r * 0.1, r * 0.2, r * 0.27, 0, 0, Math.PI * 2), lw * 0.8);
  }
  const fx = cx + side * r * 0.32;
  // 눈썹 (ㅅ자로 찌푸린)
  g.strokeStyle = CMD_COL.ink; g.lineWidth = Math.max(1.2, r * 0.12); g.lineCap = 'round';
  const ey = cy - r * 0.6, ew = r * 0.22;
  g.beginPath();
  g.moveTo(fx - ew * 1.6, ey - r * 0.08); g.lineTo(fx - ew * 0.45, ey + r * 0.06);
  g.moveTo(fx + ew * 1.6, ey - r * 0.08); g.lineTo(fx + ew * 0.45, ey + r * 0.06);
  if (side) { g.moveTo(fx - ew * 1.6, ey - r * 0.08); }
  g.stroke();
  // "사"
  g.fillStyle = CMD_COL.ink;
  g.font = `900 ${Math.round(r * 0.95)}px 'Black Han Sans','Noto Sans KR','Malgun Gothic',sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('사', fx, cy + r * 0.28);
  // 땀방울
  if (mood === 'sweat') {
    g.fillStyle = '#9fd6ff'; g.strokeStyle = CMD_COL.line; g.lineWidth = 1;
    const sx = fx + r * 0.55, sy = cy + r * 0.45;
    g.beginPath(); g.moveTo(sx, sy - r * 0.2); g.quadraticCurveTo(sx + r * 0.12, sy, sx, sy + r * 0.08); g.quadraticCurveTo(sx - r * 0.12, sy, sx, sy - r * 0.2); g.fill(); g.stroke();
  }
}

// ---- 필드 스프라이트 (타일 48px) ----
function drawCommander(X, Y, dir, anim, running) {
  const g = window.__cmdCtx, cx = X + 24, foot = Y + 45;
  const step = Math.sin(anim * Math.PI);
  const bob = anim ? Math.abs(step) * 2.5 : 0;
  const side = dir === 'left' || dir === 'right';
  const flip = dir === 'left' ? -1 : 1;
  g.save();
  // 그림자
  g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.ellipse(cx, foot - 2, 13, 4.5, 0, 0, Math.PI * 2); g.fill();
  // 다리
  if (side) {
    for (const s of [1, -1]) {
      g.save(); g.translate(cx, foot - 15); g.rotate(s * step * 0.45);
      cmdShape(g, c => { c.roundRect ? c.roundRect(-3.5, 0, 7, 14, 3.5) : c.rect(-3.5, 0, 7, 14); }, 1.6);
      g.restore();
    }
  } else {
    const l = Math.max(0, step) * 3, r = Math.max(0, -step) * 3;
    cmdShape(g, c => { c.roundRect ? c.roundRect(cx - 8, foot - 15 + l, 7, 14 - l, 3.5) : c.rect(cx - 8, foot - 15 + l, 7, 14 - l); }, 1.6);
    cmdShape(g, c => { c.roundRect ? c.roundRect(cx + 1, foot - 15 + r, 7, 14 - r, 3.5) : c.rect(cx + 1, foot - 15 + r, 7, 14 - r); }, 1.6);
  }
  g.translate(0, -bob);
  // 팔 (뒤쪽)
  const aw = (side ? step * 5 : step * 2.5);
  if (!side) {
    cmdShape(g, c => { c.roundRect ? c.roundRect(cx - 15, foot - 31 + aw, 6, 15, 3) : c.rect(cx - 15, foot - 31 + aw, 6, 15); }, 1.6);
    cmdShape(g, c => { c.roundRect ? c.roundRect(cx + 9, foot - 31 - aw, 6, 15, 3) : c.rect(cx + 9, foot - 31 - aw, 6, 15); }, 1.6);
  }
  // 몸통 (둥근 사다리꼴)
  cmdShape(g, c => {
    c.moveTo(cx - 9, foot - 33); c.quadraticCurveTo(cx, foot - 36, cx + 9, foot - 33);
    c.quadraticCurveTo(cx + 12, foot - 22, cx + 11, foot - 13); c.quadraticCurveTo(cx, foot - 10, cx - 11, foot - 13);
    c.quadraticCurveTo(cx - 12, foot - 22, cx - 9, foot - 33); c.closePath();
  }, 1.8);
  // 몸 음영
  g.save(); g.globalAlpha = 0.5; g.fillStyle = CMD_COL.shade; g.beginPath(); g.moveTo(cx + 3, foot - 32); g.quadraticCurveTo(cx + 11, foot - 22, cx + 10, foot - 14); g.quadraticCurveTo(cx + 5, foot - 12, cx + 2, foot - 13); g.closePath(); g.fill(); g.restore();
  // 옆모습 팔 (앞쪽)
  if (side) {
    g.save(); g.translate(cx - flip * 1.5, foot - 31); g.rotate(-flip * step * 0.55);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 12);
    g.lineCap = 'round'; g.strokeStyle = CMD_COL.line; g.lineWidth = 6.2; g.stroke();
    g.strokeStyle = CMD_COL.body; g.lineWidth = 3.6; g.stroke();
    g.restore();
  }
  // 머리 (원형)
  const view = dir === 'up' ? 'back' : dir === 'down' ? 'front' : dir;
  cmdHead(g, cx, foot - 44, 11.5, view, 1.8);
  g.restore();
}

  window.CMDR = { draw(g, X, Y, dir, anim) { window.__cmdCtx = g; drawCommander(X, Y, dir, anim || 0, false); window.__cmdCtx = null; } };
})();
