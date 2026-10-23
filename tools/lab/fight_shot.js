// 전투 장면 시험 도우미 (브라우저 콘솔·자동 시험에서 붙여 쓴다)
// await FSHOT.start({ stage: '2-5', hero: 'constantia', tier: 1, enemy: 0 }) → 전투 장면을 열고 시간을 멈춘다
// await FSHOT.at(1.2) → 전투 시작 뒤 1.2초 장면까지 진행 (되돌리기는 안 됨)
window.FSHOT = {
  t: 0,
  async start(o = {}) {
    for (let i = 0; i < 60 && !window.GAME; i++) await new Promise((r) => setTimeout(r, 250));
    const S = GAME.save;
    S.tutSeen = true; S.opts.fight = true;
    if (o.hero) S.heroes[o.hero] = Object.assign(S.heroes[o.hero] || {}, { lv: o.lv || 20, exp: 0, tier: o.tier || 0, br: o.br || 'A' });
    GAME.launch(DATA.STAGES.findIndex((s) => s.idx === (o.stage || '2-5')));
    for (let i = 0; i < 80 && !(GAME.mode === 'map' && GAME.G); i++) await new Promise((r) => setTimeout(r, 250));
    await new Promise((r) => setTimeout(r, 1200));
    const G = GAME.G;
    const a = G.units.find((u) => u.side === 'p' && (!o.hero || u.key === o.hero)) || G.units.find((u) => u.side === 'p');
    const es = G.units.filter((u) => u.side === 'e' && u.alive);
    const e = o.ranged ? es.find((u) => u.rng >= 2) || es[0] : typeof o.enemy === 'string' ? es.find((u) => u.key === o.enemy) || es[0] : es[o.enemy || 0];
    const range = o.range || 1;
    a.x = e.x - range; a.y = e.y;
    const setT = (x, y, c) => { if (typeof G.map[y] === 'string') G.map[y] = G.map[y].slice(0, x) + c + G.map[y].slice(x + 1); else G.map[y][x] = c; };
    if (o.tileA) setT(a.x, a.y, o.tileA); // 지형 바꿔 보기 (배경 시험)
    if (o.tileE) setT(e.x, e.y, o.tileE);
    document.querySelectorAll('#modal,#deployBar,#talk,#talkBg').forEach((x) => x.classList.add('hidden'));
    if (o.weak && e.troop) e.troop.hp = Math.min(e.troop.hp, e.troop.hpMax * 0.25); // 결판 장면 시험
    if (o.enemyFirst) GAME.attack(e, a); else GAME.attack(a, e);
    this.t = 0;
    await new Promise((r) => setTimeout(r, 200));
    return [a.name, e.name, GAME.mode];
  },
  // 필름 띠: t0 부터 dt 간격으로 n 장을 찍어 한 장에 늘어놓는다 (전투 장면 3D만, 글자판 제외). 화면 위에 덮어 보여 준다
  async strip(t0, dt, n, cols = 3, crop = [0.1, 0.2, 0.8, 0.5]) { // crop: 장면에서 잘라 볼 곳 [왼, 위, 폭, 높이] (비율)
    await this.at(t0);
    const cv = document.querySelector('canvas'), w = 520, sx = crop[0] * cv.width, sy = crop[1] * cv.height, sw = crop[2] * cv.width, shh = crop[3] * cv.height, h = Math.round(w * shh / sw);
    const rows = Math.ceil(n / cols), sh = document.createElement('canvas');
    sh.width = w * cols; sh.height = h * rows;
    const g = sh.getContext('2d');
    g.font = 'bold 18px sans-serif'; g.fillStyle = '#ff0';
    for (let i = 0; i < n; i++) {
      if (i) { GAME.step(dt); this.t += dt; } else GAME.step(0.001);
      g.drawImage(cv, sx, sy, sw, shh, (i % cols) * w, Math.floor(i / cols) * h, w, h);
      g.fillText(this.t.toFixed(2) + 's', (i % cols) * w + 6, Math.floor(i / cols) * h + 22);
    }
    if (this.saveAs) { await fetch('/tools/lab/out/' + this.saveAs + '.json', { method: 'PUT', body: JSON.stringify({ d: sh.toDataURL('image/jpeg', 0.85) }) }); this.saveAs = null; return this.t; } // 파일로 (tools/lab/out)
    let im = document.getElementById('fshotStrip');
    if (!im) { im = document.createElement('img'); im.id = 'fshotStrip'; im.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;object-fit:contain;background:#000;z-index:99999'; document.body.appendChild(im); }
    im.src = sh.toDataURL('image/jpeg', 0.8);
    im.style.display = '';
    return this.t;
  },
  // 실제 속도 녹화: 창이 보이는 상태에서 전투를 그대로 돌리며 every 초마다 한 장. 끝나면 sheet(from, n, cols) 로 늘어놓는다
  async record(o = {}, every = 0.18) {
    const R = (this.rec = { frames: [], last: 0, t0: 0 });
    const orig = FIGHT.render;
    FIGHT.render = function (r) {
      orig.call(this, r);
      const now = performance.now();
      if (!R.t0) R.t0 = now;
      if (now - R.last >= every * 1000 && R.frames.length < 60) { R.last = now; const c = document.createElement('canvas'); c.width = 640; c.height = 360; c.getContext('2d').drawImage(r.domElement, 0, 0, 640, 360); R.frames.push([((now - R.t0) / 1000).toFixed(2), c]); }
    };
    await this.start(o);
    for (let i = 0; i < 100 && GAME.mode !== 'fight'; i++) await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 300 && GAME.mode === 'fight'; i++) await new Promise((r) => setTimeout(r, 50));
    FIGHT.render = orig;
    return [R.frames.length, ((performance.now() - R.t0) / 1000).toFixed(2)];
  },
  sheet(from, n, cols = 3) {
    const F = this.rec.frames.slice(from, from + n), w = 640, h = 360, sh = document.createElement('canvas');
    sh.width = w * cols; sh.height = h * Math.ceil(F.length / cols);
    const g = sh.getContext('2d'); g.font = 'bold 26px sans-serif'; g.fillStyle = '#ff0';
    F.forEach(([t, c], i) => { g.drawImage(c, (i % cols) * w, Math.floor(i / cols) * h); g.fillText(t + 's', (i % cols) * w + 6, Math.floor(i / cols) * h + 28); });
    let im = document.getElementById('fshotStrip');
    if (!im) { im = document.createElement('img'); im.id = 'fshotStrip'; im.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;object-fit:contain;background:#000;z-index:99999'; document.body.appendChild(im); }
    im.src = sh.toDataURL('image/jpeg', 0.85); im.style.display = '';
    return F.map((f) => f[0]).join(' ');
  },
  hide() { const im = document.getElementById('fshotStrip'); if (im) im.style.display = 'none'; },
  async at(t) {
    if (t > this.t) await GAME.run(t - this.t);
    this.t = t;
    return GAME.mode;
  },
};
