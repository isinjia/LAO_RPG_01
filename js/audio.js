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
    play(name, vol = 1) {
      if (!this.on || this.away || !name) return;
      const now = performance.now();
      if (this.last[name] && now - this.last[name] < 60) return; // 같은 소리 겹침 방지
      this.last[name] = now;
      let base = cache[name];
      if (!base) { base = cache[name] = new Audio('assets/sfx/' + name + '.mp3'); base.preload = 'auto'; }
      const a = base.cloneNode();
      a.volume = Math.min(1, this.vol * vol);
      this.live.add(a); a.onended = () => this.live.delete(a);
      a.play().catch(() => {});
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
  const sync = () => AU.setAway(document.hidden || !document.hasFocus());
  addEventListener('blur', sync);
  addEventListener('focus', sync);
  document.addEventListener('visibilitychange', sync);
  window.AU = AU;
})();
