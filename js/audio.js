// 효과음·배경음: HTMLAudio 복제 재생 (file:// 에서도 동작). 첫 터치 뒤부터 소리가 난다.
(function () {
  const cache = {};
  const AU = {
    on: true,
    vol: 0.55,
    bgmVol: 0.32,
    voiceVol: 0.77,
    blipOn: true,
    bgmEl: null,
    bgmName: '',
    last: {},
    away: false, // 창이 포커스를 잃었다: 모든 소리를 멈추고 새 소리도 내지 않는다
    live: new Set(), // 지금 울리는 효과음 (포커스를 잃으면 함께 끊는다)
    // rate: 재생 빠르기 (높낮이도 함께 바뀐다). 같은 소리가 거듭 날 때 조금씩 흔들어 단조롭지 않게
    play(name, vol = 1, rate = 1) {
      if (!this.on || this.away || !name) return;
      const now = performance.now();
      if (this.last[name] && now - this.last[name] < 60) return; // 같은 소리 겹침 방지
      this.last[name] = now;
      let base = cache[name];
      if (!base) { base = cache[name] = new Audio('assets/sfx/' + name + '.mp3'); base.preload = 'auto'; }
      const a = base.cloneNode();
      a.volume = Math.min(1, this.vol * vol);
      if (rate !== 1) { a.preservesPitch = false; a.playbackRate = rate; }
      this.live.add(a); a.onended = () => this.live.delete(a);
      a.play().catch(() => {});
      return a;
    },
    // 긴 원작 소리를 sec 초 뒤 짧게 줄여 끊는다
    cut(a, sec) {
      if (!a) return;
      setTimeout(() => { const v0 = a.volume, t0 = performance.now(); const f = () => { const k = (performance.now() - t0) / 300; if (k >= 1 || a.paused) { a.pause(); this.live.delete(a); return; } a.volume = v0 * (1 - k); requestAnimationFrame(f); }; f(); }, sec * 1000);
    },
    bgm(name) {
      if (this.bgmName === name && this.bgmEl) { if (this.on && !this.away && this.bgmEl.paused) this.bgmEl.play().catch(() => {}); return; }
      if (this.bgmEl) { this.bgmEl.pause(); this.bgmEl = null; }
      this.bgmName = name;
      if (!name) return;
      const el = new Audio('assets/bgm/' + name + '.mp3');
      el.loop = true; el.volume = this.bgmVol;
      this.bgmEl = el;
      if (this.on && !this.away) el.play().catch(() => {});
    },
    voice(name, vol = 1) {
      if (!this.on || this.away || !name) return;
      if (this.vEl) this.vEl.pause();
      this.vEl = new Audio('assets/voice/' + name + '.mp3');
      this.vEl.volume = Math.min(1, this.voiceVol * vol);
      this.vEl.play().catch(() => {});
    },
    // 글자 소리 (역전재판식 삑삑): 파일 없이 짧은 사각파를 만든다. freq = 화자마다 다른 높이
    blip(freq = 600, vol = 1) {
      if (!this.on || this.away || !this.blipOn) return;
      try {
        const ctx = this.actx || (this.actx = new (window.AudioContext || window.webkitAudioContext)());
        if (ctx.state === 'suspended') ctx.resume();
        const t = ctx.currentTime;
        const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(freq * (0.97 + Math.random() * 0.06), t);
        f.type = 'lowpass'; f.frequency.value = 2600;
        const v = 0.05 * this.vol * vol;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(v, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        o.connect(f); f.connect(g); g.connect(ctx.destination);
        o.start(t); o.stop(t + 0.06);
      } catch (e) { /* 소리 장치 없음 */ }
    },
    // 옵션의 소리 크기 (0~1): 배경음·효과음·음성
    setVolume(bgm, sfx, voice) {
      this.bgmVol = 0.45 * bgm; this.vol = 0.69 * sfx; this.voiceVol = Math.min(1, 0.86 * voice);
      if (this.bgmEl) this.bgmEl.volume = this.bgmVol;
    },
    setOn(v) {
      this.on = v;
      if (this.bgmEl) { if (v && !this.away) this.bgmEl.play().catch(() => {}); else this.bgmEl.pause(); }
    },
    // 창 포커스: 잃으면 배경음·음성·효과음을 다 멈추고, 돌아오면 배경음만 이어서 튼다
    setAway(v) {
      if (this.away === v) return;
      this.away = v;
      if (v) {
        if (this.bgmEl) this.bgmEl.pause();
        if (this.vEl) this.vEl.pause();
        for (const a of this.live) a.pause();
        this.live.clear();
        if (this.actx && this.actx.state === 'running') this.actx.suspend();
      } else {
        if (this.on && this.bgmEl) this.bgmEl.play().catch(() => {});
        if (this.actx && this.actx.state === 'suspended') this.actx.resume();
      }
    },
  };
  // ── 전투 소리 고르기 (원작 SFX/Common·Character·Enemy, tools/build_media.py) ──
  // 무기 갈래: 그 몸의 공격 소리로 나눈다
  const WEAPON = { rifle: 'gun', gun: 'gun', handgun: 'gun', mg: 'gun', cannon: 'heavy', missile: 'heavy', expM: 'heavy', expB: 'heavy',
    laserBig: 'laser', laser: 'laser', beam: 'laser', energy: 'laser', charge: 'laser', spray: 'laser', elec: 'elec', slash: 'sword', swing: 'phy' };
  const HIT = { gun: 'lo_hit_gun', heavy: 'lo_hit_heavy', laser: 'lo_hit_laser', elec: 'lo_hit_elec', sword: 'lo_hit_sword', phy: 'lo_hit_phy' };
  const MECH_HIT = { gun: 'lo_hit_gun_r', heavy: 'lo_hit_heavy_r', phy: 'lo_hit_phy_r' }; // 철충·기계 몸은 쇳소리
  // 원작에 있는 영웅·철충 고유 소리 (없는 것은 공용 소리로)
  const HERO_SFX = { constantia: 'death win skill2', griffon: 'death win skill2', johanna: 'death win skill1 skill2', lrl: 'death win skill1 skill2',
    pupphead: 'skill1 skill2', fallen: 'skill1 skill2', marie: 'death win skill1 skill2', labiata: 'death win skill1 skill2', scathy: 'win skill1 skill2',
    amy: 'death win skill1 skill2', coco: 'death win skill1 skill2' };
  const FOE_SFX = { stalker: 'death skill2', predator: 'death roar skill1 skill2', trickster: 'death skill1 skill2', harvester: 'death skill1 skill2',
    raider: 'death skill1', raiderx: 'death skill1', blackknight: 'death skill1 skill2', goltarion: 'skill1 skill2', underwatcher: 'death skill1 skill2',
    scout: 'skill1 skill2', heavyscout: 'skill1 skill2', legion: 'skill', legionsp: 'skill', centurion: 'skill2', chieftain: 'skill2', bigchick: 'skill1',
    sniper: 'skill2', chemical: 'skill1 skill2', detector: 'skill1 skill2' };
  const FOE_DIR = { raiderx: 'raider', heavyscout: 'scout', legionsp: 'legion', chieftain: 'centurion' };
  const MECH_HERO = new Set(['pupphead', 'fallen', 'coco']);
  // 그 몸이 기계인가 (철충 전부 + 기계 영웅)
  AU.mech = (u) => !!u && (u.side === 'e' || MECH_HERO.has(u.key));
  AU.weapon = (sfx) => WEAPON[sfx] || 'gun';
  // 맞는 소리: 무기 갈래 × 맞은 몸
  AU.hit = (sfx, mech, vol = 0.5, rate = 1) => { const w = AU.weapon(sfx); AU.play((mech && MECH_HIT[w]) || HIT[w], vol, rate); };
  // 영웅·철충 고유 소리 이름 (없으면 null)
  AU.unitSfx = (u, kind) => {
    if (!u) return null;
    if (u.side === 'p') return (HERO_SFX[u.key] || '').split(' ').includes(kind) ? 'h_' + u.key + '_' + kind : null;
    return (FOE_SFX[u.key] || '').split(' ').includes(kind) ? 'e_' + (FOE_DIR[u.key] || u.key) + '_' + kind : null;
  };
  AU.skillSfx = (u) => AU.unitSfx(u, 'skill2') || AU.unitSfx(u, 'skill1') || AU.unitSfx(u, 'skill');
  // 쓰러지는 소리: 영웅은 원작 고유 비명, 철충 우두머리는 고유 소리, 나머지는 몸에 맞는 쓰러짐
  AU.fall = (u, vol = 0.6) => {
    const own = (u.side === 'p' || u.boss || u.lead) && AU.unitSfx(u, 'death');
    if (own) { AU.play(own, vol); return; }
    if (!AU.mech(u)) { AU.play('lo_fall', vol, 0.95 + Math.random() * 0.1); return; }
    AU.play(u.def && u.def.big ? 'lo_fall_rb' : 'lo_fall_r', vol);
  };
  // 한 걸음 소리: 걷는 바이오로이드는 흙길, 기병은 달리기, 철충은 기계 발소리 (나는 몸은 null)
  AU.stepOf = (u) => (u.move === 'fly' ? null : AU.mech(u) ? (u.def && u.def.big ? 'lo_walk_rb' : 'lo_walk_r') : u.move === 'horse' ? 'lo_run' : 'lo_walk');

  const sync = () => AU.setAway(document.hidden || !document.hasFocus());
  addEventListener('blur', sync);
  addEventListener('focus', sync);
  document.addEventListener('visibilitychange', sync);
  window.AU = AU;
})();
