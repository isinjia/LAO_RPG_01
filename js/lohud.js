// 원작 라스트오리진 전투 화면의 연출 조각: 원작 피해 숫자 글꼴, 차례 배너, 작전 개시, 특기 컷인, 반격·MISS 같은 글자 그림.
// 지도 전투(game.js)와 전투 장면(battle.js)이 함께 쓴다. 모양은 css/battle_lo.css.
(function () {
  const H = {};
  const layer = () => document.getElementById('lofx');

  // ── 원작 피해 숫자 (js/dmgfont.js) ──
  // kind: base(적에게 준 피해·노랑) | cri(강한 일격·빨강) | me(아군이 받은 피해·주황) | heal(회복·초록)
  // px: 글자 높이(px). 앞에 붙는 기호(+)는 글자 그림이 없어 글자로 덧붙인다
  H.num = function (n, kind = 'base', px = 40, sign = '') {
    const F = window.DMGFONT && DMGFONT[kind];
    const e = document.createElement('div');
    e.className = 'dnum ' + kind;
    const v = String(Math.max(0, Math.round(n)));
    if (!F) { e.textContent = sign + v; return e; }
    const s = px / F.h;
    if (sign) { const b = document.createElement('b'); b.textContent = sign; b.style.fontSize = px * 0.7 + 'px'; e.appendChild(b); }
    for (let i = 0; i < v.length; i++) {
      const d = +v[i], sp = document.createElement('i');
      sp.style.cssText = `width:${F.cw * s}px;height:${F.h * s}px;background-image:url(${F.src});background-size:${F.cw * 10 * s}px ${F.h * s}px;` +
        `background-position:${-d * F.cw * s}px 0;margin-left:${i ? 0 : -F.ox * s}px;margin-right:${(F.adv[d] - F.cw) * s}px`;
      e.appendChild(sp);
    }
    return e;
  };
  // 화면 (x, y)에 떠올랐다 사라지는 숫자·글자 그림. parent 기본은 전체 화면 층
  H.float = function (el, x, y, cls = '', parent = null, life = 1100) {
    const w = document.createElement('div');
    w.className = 'lofloat ' + cls;
    w.style.left = x + 'px'; w.style.top = y + 'px';
    w.appendChild(el);
    (parent || layer()).appendChild(w);
    setTimeout(() => w.remove(), life);
    return w;
  };
  // 원작 글자 그림 (반격·MISS·대기·방어막 등)
  const WORD = { counter: 'UI_Image_Counter', miss: 'UI_Battle_Miss', wait: 'UI_Image_Wait', shield: 'UI_Image_Shield', broke: 'UI_Image_Broke', caution: 'UI_Battle_Caution_text_1' };
  H.word = function (k, h = 34) {
    const im = document.createElement('img');
    im.className = 'loword';
    im.src = 'assets/ui/' + WORD[k] + '.png';
    im.style.height = h + 'px';
    return im;
  };

  // ── 배너 ──
  let bTimer = 0;
  H.speedOf = () => 1; // 게임 배속 (game.js 가 바꿔 끼운다). 배너 길이를 배속만큼 줄인다
  function show(html, cls, ms, overlay) {
    const el = layer();
    const b = document.createElement('div');
    b.className = 'lobanner ' + cls;
    b.innerHTML = html;
    if (overlay) { // 특기 컷인은 다른 배너를 지우지 않고 위에 겹친다
      const sp = Math.max(1, H.speedOf()), real = ms / sp;
      b.style.setProperty('--d', Math.max(0.3, (real - 260) / 1000) + 's');
      el.appendChild(b);
      setTimeout(() => b.remove(), real);
      return b;
    }
    el.querySelectorAll('.lobanner:not(.cutin)').forEach((o) => o.remove());
    const sp = Math.max(1, H.speedOf()), real = ms / sp;
    b.style.setProperty('--d', Math.max(0.3, (real - 260) / 1000) + 's'); // 사라지기 시작하는 때
    b.style.setProperty('--sp', sp);
    el.appendChild(b);
    clearTimeout(bTimer);
    bTimer = setTimeout(() => b.remove(), real);
    return b;
  }
  // 차례 시작: 원작 전투의 노랑(아군)·빨강(적) 사선 띠가 화면을 가로지른다
  H.phase = function (side, turn, sub, speed = 1) {
    const p = side === 'p';
    return show(`<div class="lb-band"></div><div class="lb-line"></div>
      <div class="lb-in"><small>TURN ${String(turn).padStart(2, '0')}</small><b>${p ? 'PLAYER PHASE' : 'ENEMY PHASE'}</b><span>${p ? '아군 차례' : '적 차례'}${sub ? ' · ' + sub : ''}</span></div>`,
    'phase ' + (p ? 'p' : 'e'), 1600);
  };
  // 작전 개시: 원작 MISSION START 글자 그림
  H.start = function (title, goal) {
    return show(`<div class="lb-band"></div><div class="lb-line"></div>
      <div class="lb-in"><img src="assets/ui/UI_Battle_text_missionstart.png" alt="MISSION START"><span>${title}</span><em>${goal}</em></div>`, 'start', 2100);
  };
  // 증원·경고: 원작 CAUTION 띠
  H.caution = function (text, sub) {
    return show(`<div class="lb-band"></div><div class="lb-grid"></div>
      <div class="lb-in"><img src="assets/ui/UI_Battle_Caution_text_1.png" alt="CAUTION"><b>${text}</b>${sub ? `<span>${sub}</span>` : ''}</div>`, 'caution', 1700);
  };
  // 작전 결과: 원작 MISSION COMPLETE 글자 / 실패는 빨간 띠
  H.result = function (win, sub) {
    return show(`<div class="lb-band"></div><div class="lb-line"></div>
      <div class="lb-in">${win ? '<img src="assets/ui/UI_Battle_Main_missionclear_label_2.png" alt="MISSION COMPLETE">' : '<b>MISSION FAILED</b>'}<span>${win ? '작전 성공' : '작전 실패'} · ${sub}</span></div>`,
    'result ' + (win ? 'win' : 'e'), 2000);
  };
  // 특기 컷인: 인물 그림이 사선 띠 안으로 미끄러져 들어오고 특기 이름이 박힌다
  H.cutin = function (u, skillName, speed = 1) {
    const stand = window.FIGHT && FIGHT.STAND && u.side === 'p' && FIGHT.STAND[u.key];
    const pic = stand ? `<img class="lc-stand" src="assets/story/stand/${stand}.webp" alt="">` : `<img class="lc-icon" src="${(window.IMG && IMG[u.icon]) || ''}" alt="">`;
    const b = show(`<div class="lc-band">${pic}</div><div class="lc-flash"></div>
      <div class="lc-txt"><small>${u.side === 'p' ? 'ACTIVE SKILL' : 'ENEMY SKILL'}</small><b>${skillName}</b><span>${u.name}</span></div>`,
    'cutin ' + (u.side === 'p' ? 'p' : 'e'), 1300, true);
    return b;
  };

  // 화면 번쩍임 (큰 특기)
  H.flash = function (color = 'rgba(255,255,255,.5)', ms = 260) {
    const f = document.createElement('div');
    f.className = 'loflash';
    f.style.background = color;
    f.style.animationDuration = ms + 'ms';
    layer().appendChild(f);
    setTimeout(() => f.remove(), ms + 50);
  };

  // ── 지도 위 표지 (TARGET) ──
  let mark = null;
  H.target = function (x, y, side = 'r') {
    if (!mark) { mark = document.createElement('div'); mark.className = 'lotarget'; layer().appendChild(mark); }
    if (x == null) { mark.classList.add('hidden'); return; }
    mark.className = 'lotarget ' + side;
    mark.innerHTML = `<img src="assets/ui/UI_Battle_Main_Field_Frame_selectText_${side}.png" alt="TARGET">`;
    mark.style.left = x + 'px'; mark.style.top = y + 'px';
  };

  window.LOHUD = H;
})();
