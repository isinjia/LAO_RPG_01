// 효과음·배경음: HTMLAudio 복제 재생 (file:// 에서도 동작). 첫 터치 뒤부터 소리가 난다.
(function () {
  const cache = {};
  const AU = {
    on: true,
    vol: 0.55,
    bgmVol: 0.32,
    bgmEl: null,
    bgmName: '',
    last: {},
    play(name, vol = 1) {
      if (!this.on || !name) return;
      const now = performance.now();
      if (this.last[name] && now - this.last[name] < 60) return; // 같은 소리 겹침 방지
      this.last[name] = now;
      let base = cache[name];
      if (!base) { base = cache[name] = new Audio('assets/sfx/' + name + '.mp3'); base.preload = 'auto'; }
      const a = base.cloneNode();
      a.volume = Math.min(1, this.vol * vol);
      a.play().catch(() => {});
    },
    bgm(name) {
      if (this.bgmName === name && this.bgmEl) { if (this.on && this.bgmEl.paused) this.bgmEl.play().catch(() => {}); return; }
      if (this.bgmEl) { this.bgmEl.pause(); this.bgmEl = null; }
      this.bgmName = name;
      if (!name) return;
      const el = new Audio('assets/bgm/' + name + '.mp3');
      el.loop = true; el.volume = this.bgmVol;
      this.bgmEl = el;
      if (this.on) el.play().catch(() => {});
    },
    voice(name, vol = 1) {
      if (!this.on || !name) return;
      if (this.vEl) this.vEl.pause();
      this.vEl = new Audio('assets/voice/' + name + '.mp3');
      this.vEl.volume = Math.min(1, this.vol * 1.4 * vol);
      this.vEl.play().catch(() => {});
    },
    setOn(v) {
      this.on = v;
      if (this.bgmEl) { if (v) this.bgmEl.play().catch(() => {}); else this.bgmEl.pause(); }
    },
  };
  window.AU = AU;
})();
