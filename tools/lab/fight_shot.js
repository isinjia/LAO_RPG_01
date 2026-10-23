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
    if (o.enemyFirst) GAME.attack(e, a); else GAME.attack(a, e);
    this.t = 0;
    await new Promise((r) => setTimeout(r, 200));
    return [a.name, e.name, GAME.mode];
  },
  async at(t) {
    if (t > this.t) await GAME.run(t - this.t);
    this.t = t;
    return GAME.mode;
  },
};
