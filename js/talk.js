// 대화(원작 노벨 화면): 배경 교차 전환, 인물 등장·퇴장 효과, 장소 자막, 화면 효과(흔들림·암전·번쩍임),
// 덧붙임 효과(폭발·눈 뜨기·옷 스침 소리), 글자 찍기, AUTO / FAST / SKIP / HISTORY.
// 시간은 게임 루프가 부르는 TALK.update(dt) 로만 흐른다 (창이 숨어도 시험 훅으로 진행 가능).
(function () {
  const $ = (id) => document.getElementById(id);
  const root = $('talk'), bgEl = $('talkBg');
  const box = root.querySelector('.tbox'), nameEl = root.querySelector('.tname'), textEl = root.querySelector('.ttext');
  const choicesEl = root.querySelector('.tchoices'), placeEl = root.querySelector('.tplace'), logEl = root.querySelector('.tlog');
  const stage = bgEl.querySelector('.tstage'), cgEl = bgEl.querySelector('.tcg'), fxEl = bgEl.querySelector('.tfx');
  const layers = [...bgEl.querySelectorAll('.tbg')];
  let front = 0;

  // 내부 시계
  let now = 0;
  const timers = [];
  const tw = (ms) => new Promise((r) => timers.push({ t: now + ms / 1000, r }));
  const tweens = [];
  const tween = (dur, fn) => new Promise((r) => tweens.push({ t: 0, dur: Math.max(0.001, dur), fn, r }));

  let nodes = null, cur = null, done = null, prevScr = 6, busy = false, autoOn = false, fastOn = false, gen = 0;
  let flags = new Set(); // 지나간 장면의 표시(flag): IF 갈래로 들어갔는지 등을 게임에 알린다
  let typing = null; // {full, n}
  let autoWait = 0, log = [];
  // 글자 소리 높이: 해설은 낮게, 인물은 이름마다 정해진 높이
  let lastBlip = 0;
  const blipFreq = (who) => {
    if (!who) return 330;
    // 주요 인물은 성격에 맞춰 직접 (그리폰 높고 빠르게, 펍 헤드는 낮은 기계음)
    const fixed = [['그리폰', 780], ['콘스탄챠', 640], ['요안나', 540], ['LRL', 880], ['펍 헤드', 420], ['폴른', 470]];
    for (const [k, f] of fixed) if (who.includes(k)) return f;
    let h = 0;
    for (const ch of who) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return 560 + (h % 7) * 50;
  };
  const IMGPRE = {};

  function preload(list) {
    if (window.PORTRAIT) PORTRAIT.preload(list);
    for (const n of list) {
      const urls = [];
      if (n.bg) urls.push(`assets/story/bg/${n.bg}.webp`);
      if (n.cg) urls.push(`assets/story/cg/${n.cg}.webp`);
      for (const c of n.cast || []) urls.push(`assets/story/stand/${c[1]}.webp`);
      for (const u of urls) if (!IMGPRE[u]) { const im = new Image(); im.src = u; IMGPRE[u] = im; }
    }
  }

  function play(list) {
    return new Promise((res) => {
      if (!list || !list.length) { res(); return; }
      gen++;
      nodes = new Map(list.map((n) => [n.id, n]));
      done = res; log = []; prevScr = 6; autoWait = 0; typing = null; busy = false; flags = new Set();
      preload(list);
      root.classList.remove('hidden'); bgEl.classList.remove('hidden');
      root.classList.remove('nobox', 'logon');
      bgEl.classList.toggle('see', !!list[0].see); // 마을 위 대화: 뒤 화면이 보이게
      // 이름도 지운다: 앞 대화의 마지막 배경과 같은 배경으로 시작해도 다시 깔리게 (함교→함교가 검게 남던 문제)
      layers.forEach((l) => { l.style.backgroundImage = ''; l.style.opacity = 0; l.dataset.k = ''; });
      stage.querySelectorAll('.stand').forEach((im) => window.PORTRAIT && PORTRAIT.detach(im));
      stage.innerHTML = ''; cgEl.removeAttribute('src'); cgEl.dataset.k = '';
      fxEl.className = 'tfx'; fxEl.style.opacity = 0;
      placeEl.classList.remove('on');
      choicesEl.innerHTML = '';
      setBtn();
      show(list[0]);
    });
  }

  function setBtn() {
    root.querySelector('[data-k="auto"]').classList.toggle('on', autoOn);
    root.querySelector('[data-k="fast"]').classList.toggle('on', fastOn);
  }

  // 배경: 두 장을 겹쳐 교차 전환
  async function setBg(name) {
    const url = name ? `url(assets/story/bg/${name}.webp)` : '';
    if (layers[front].dataset.k === (name || '')) return;
    const back = 1 - front;
    layers[back].style.backgroundImage = url; layers[back].dataset.k = name || '';
    layers[back].style.zIndex = 1; layers[front].style.zIndex = 0;
    const a = layers[back], b = layers[front];
    front = back;
    await tween(fastOn ? 0.1 : 0.45, (k) => { a.style.opacity = k; if (k >= 1) b.style.opacity = 0; });
  }

  // 인물: 위치별 img. app/off 효과 번호는 원작 Char_AppearEffect / Char_OffEffect
  const APP = { 1: 'ap-l', 2: 'ap-r', 3: 'ap-hop', 4: 'ap-zoom', 5: 'ap-up', fade: 'ap-fade' };
  const OFF = { 1: 'off-l', 2: 'off-r', 5: 'off-fade' };
  function setCast(n) {
    const want = new Map((n.cast || []).map(([p, s, d]) => [p, [s, d]]));
    const lit = (n.cast || []).some((c) => c[2] === 1);
    stage.querySelectorAll('.stand').forEach((im) => {
      const p = im.dataset.p;
      if (want.has(p) && !im.classList.contains('leaving')) return;
      if (im.classList.contains('leaving')) return;
      const cls = OFF[(n.off || {})[p]] || 'off-fade';
      im.classList.add('leaving', cls);
      tw(450).then(() => { if (window.PORTRAIT) PORTRAIT.detach(im); im.remove(); });
    });
    for (const [p, [s, d]] of want) {
      // 움직이는 일러스트가 있는 인물은 <canvas>, 없으면(컷 그림 등) 정지 그림 <img>
      const live = !!(window.PORTRAIT && PORTRAIT.rigOf(s));
      let im = stage.querySelector(`.stand[data-p="${p}"]:not(.leaving)`);
      if (im && (im.tagName === 'CANVAS') !== live) { if (window.PORTRAIT) PORTRAIT.detach(im); im.remove(); im = null; }
      const fresh = !im;
      if (fresh) { im = document.createElement(live ? 'canvas' : 'img'); im.className = 'stand'; im.dataset.p = p; stage.appendChild(im); }
      if (im.dataset.s !== s) {
        if (!live) im.src = `assets/story/stand/${s}.webp`;
        else if (fresh || !im._portrait || PORTRAIT.rigOf(im.dataset.s) !== PORTRAIT.rigOf(s)) { PORTRAIT.detach(im); PORTRAIT.attach(im, s); }
        else PORTRAIT.change(im, s);
        im.dataset.s = s;
      }
      im.classList.toggle('cut', s.includes('_Dialog0'));
      im.classList.toggle('dim', lit && d !== 1);
      const eff = (n.app || {})[p] || ((n.fade || {})[p] ? 'fade' : fresh ? 'fade' : 0);
      if (eff && APP[eff]) {
        for (const c of Object.values(APP)) im.classList.remove(c);
        void im.offsetWidth;
        im.classList.add(APP[eff]);
      }
    }
  }

  // 화면 효과
  function shake(power = 14, dur = 0.5) {
    return tween(dur, (k) => {
      const a = power * (1 - k);
      bgEl.style.transform = k >= 1 ? '' : `translate(${(Math.random() - 0.5) * 2 * a}px, ${(Math.random() - 0.5) * 2 * a}px)`;
    });
  }
  function flash(color = '#fff', dur = 0.5, peak = 1) {
    fxEl.className = 'tfx'; fxEl.style.background = color;
    return tween(dur, (k) => { fxEl.style.opacity = peak * (1 - k); });
  }
  function toBlack(on, dur = 0.45) {
    fxEl.className = 'tfx'; fxEl.style.background = '#000';
    const a = +fxEl.style.opacity || 0, b = on ? 1 : 0;
    return tween(fastOn ? Math.min(dur, 0.12) : dur, (k) => { fxEl.style.opacity = a + (b - a) * k; });
  }
  async function eyes() { // 원작 Prefeb_OpenEyes: 감은 눈이 천천히 뜨인다
    fxEl.style.opacity = 0;
    bgEl.classList.add('blur');
    const lids = document.createElement('div'); lids.className = 'tlids'; bgEl.appendChild(lids);
    await tween(0.5, (k) => lids.style.setProperty('--o', 0.12 * k));
    await tween(0.5, (k) => lids.style.setProperty('--o', 0.12 * (1 - k)));
    await tw(250);
    await tween(1.6, (k) => lids.style.setProperty('--o', 0.5 * (1 - Math.pow(1 - k, 2))));
    bgEl.classList.remove('blur');
    await tw(300);
    lids.remove();
  }
  const FX = {
    Prefab_BangNShaking_01: async () => { AU.play('lo_d_explosion3', 0.9); flash('#fff', 0.35, 0.7); await shake(22, 0.8); },
    Prefab_BangNShaking_02: async () => { AU.play('lo_d_explosion3', 0.9); flash('#fff', 0.35, 0.7); await shake(26, 1.0); },
    Prefab_BangNShaking_03: async () => { AU.play('lo_d_explosion3', 0.9); await shake(30, 1.2); },
    Prefab_Explosion_01: async () => { AU.play('lo_d_explosion1', 0.9); flash('#ffd9a0', 0.4, 0.8); await shake(16, 0.5); },
    Prefab_GunFire_01: async () => { AU.play('lo_d_gunfire', 0.8); await flash('#fff', 0.15, 0.4); },
    Prefeb_OpenEyes: eyes,
    Prefeb_FadeOutandRustle: async () => { AU.play('lo_d_rustle', 0.9); await toBlack(true, 1.0); await tw(500); },
    Prefeb_InjectionSound: async () => { AU.play('lo_d_inject', 0.8); await flash('#cfe8ff', 0.4, 0.25); },
    Prefeb_MetalHowling: async () => { AU.play('lo_d_metal', 0.9); await shake(8, 0.6); },
    Prefab_Sound: async () => { AU.bgm('lo_boss3'); }, // 원작: 대화 도중 06 BGM_Battle_Boss_03 으로 바꿔 튼다
    Prefab_Explosion_02: async () => { AU.play('lo_d_explosion2', 0.9); flash('#ffd9a0', 0.35, 0.6); await shake(14, 0.4); },
    Prefab_GunFire_02: async () => { AU.play('lo_d_gunfire2', 0.8); await flash('#fff', 0.12, 0.3); },
    Prefab_FootStep_01: async () => { AU.play('lo_d_foot', 0.8); },
    Prefab_Alarm_01: async () => { AU.cut(AU.play('lo_d_alarm', 0.7), 3); },
    Prefab_Break_01: async () => { AU.play('lo_d_break', 0.9); await shake(10, 0.4); },
    Prefab_DoorOpen_01: async () => { AU.play('lo_d_door', 0.7); },
    DoorKnock_01: async () => { AU.play('lo_d_knock', 0.8); },
  };

  // 장소 자막: 원작 lblBGDesc(크게) + lblBGname(작게)를 화면 가운데에
  async function place(p) {
    placeEl.querySelector('.pd').textContent = p[1] || '';
    placeEl.querySelector('.pn').textContent = p[0] || '';
    root.classList.add('nobox');
    placeEl.classList.add('on');
    AU.play('lo_trans_out', 0.35);
    await tw(fastOn ? 300 : 1900);
    placeEl.classList.remove('on');
    await tw(fastOn ? 100 : 350);
  }

  async function show(n) {
    const g = gen;
    cur = n; busy = true; typing = null; autoWait = 0;
    if (n.flag) flags.add(n.flag);
    choicesEl.innerHTML = '';
    root.classList.remove('ready');
    // 앞 줄이 암전(화면 효과 2)으로 끝났으면 검게 덮은 채로 장면을 바꾼다
    const dip = prevScr === 2;
    prevScr = n.scr || 6;
    if (dip) { root.classList.add('nobox'); await toBlack(true, 0.5); if (g !== gen) return; }
    if (n.bgm) AU.bgm(n.bgm);
    const bgP = setBg(n.bg || '');
    if (n.cg) { if (cgEl.dataset.k !== n.cg) { cgEl.src = `assets/story/cg/${n.cg}.webp`; cgEl.dataset.k = n.cg; } } else { cgEl.removeAttribute('src'); cgEl.dataset.k = ''; }
    bgEl.classList.toggle('cg', !!n.cg);
    setCast(n);
    if (dip) { await bgP; await toBlack(false, 0.5); if (g !== gen) return; }
    else if (fxEl.style.opacity > 0 && !n.fx) { await toBlack(false, 0.4); if (g !== gen) return; }
    if (n.place && n.place.length) { await bgP; await place(n.place); if (g !== gen) return; }
    if (n.scr === 1) shake(12, 0.5);
    if (n.scr === 3) flash('#fff', 0.5);
    const empty = !n.t && !(n.ch && n.ch.length);
    if (n.fx && FX[n.fx]) {
      const p = FX[n.fx]();
      if (empty) { root.classList.add('nobox'); await p; if (g !== gen) return; }
    }
    if (empty) { await bgP; await tw(fastOn ? 30 : 180); if (g !== gen) return; busy = false; go(n.next); return; }
    root.classList.remove('nobox');
    root.classList.toggle('nar', !n.who);
    nameEl.textContent = n.who || '';
    box.dataset.p = n.spk === 'L' || n.spk === 'R' ? n.spk : 'C';
    textEl.textContent = '';
    typing = { full: n.t || '', n: 0 };
    log.push([n.who || '', n.t || '']);
    busy = false;
  }

  function finishTyping() {
    if (!typing) return;
    typing.n = typing.full.length;
    textEl.textContent = typing.full;
    typing = null;
    afterTyped();
  }
  function afterTyped() {
    const n = cur;
    root.classList.add('ready');
    if (n.ch && n.ch.length) {
      for (const [text, next] of n.ch) {
        const b = document.createElement('button');
        b.textContent = text;
        b.onclick = (e) => { e.stopPropagation(); AU.play('lo_click', 0.6); choicesEl.innerHTML = ''; go(next); };
        choicesEl.appendChild(b);
      }
    } else autoWait = fastOn ? 0.12 : 1.1 + Math.min(2.5, (n.t || '').length * 0.035);
  }

  function go(id) {
    const n = id != null && nodes && nodes.get(id);
    if (n) show(n); else end();
  }
  function next() {
    if (!cur || busy || root.classList.contains('logon') || root.classList.contains('asking')) return;
    if (typing) { finishTyping(); return; }
    if (cur.ch && cur.ch.length) return;
    go(cur.next);
  }
  function end() {
    gen++;
    const cb = done;
    if (window.WIPE) WIPE.keep(); // 다음 화면이 이 대화 화면을 선을 따라 덮을 수 있게 지금 모습을 떠 둔다
    nodes = null; cur = null; done = null; typing = null; busy = false;
    bgEl.style.transform = '';
    root.classList.add('hidden'); bgEl.classList.add('hidden');
    stage.querySelectorAll('.stand').forEach((im) => window.PORTRAIT && PORTRAIT.detach(im));
    stage.innerHTML = '';
    root.classList.remove('logon', 'asking');
    const r = { flags: [...flags] };
    if (cb) cb(r);
  }
  // 건너뛰기: 사령관의 결정 선택지(must)가 앞에 있으면 거기서 멈춘다. 지나치는 장면의 표시도 모은다
  function skip() {
    if (!cur) return;
    const nx = (n) => { const id = n.next != null ? n.next : n.ch && n.ch.length ? n.ch[0][1] : null; return id != null && nodes.get(id); }; // 원래 선택지는 첫 갈래로
    let n = cur.must ? null : nx(cur);
    for (let i = 0; n && i < 2000; i++) {
      if (n.must) { choicesEl.innerHTML = ''; show(n); return; }
      if (n.flag) flags.add(n.flag);
      n = nx(n);
    }
    if (cur.must && cur.ch && cur.ch.length) return; // 결정은 직접 골라야 한다
    end();
  }

  function update(dt) {
    now += dt;
    if (window.PORTRAIT) PORTRAIT.update(dt);
    for (let i = timers.length - 1; i >= 0; i--) if (timers[i].t <= now) { const r = timers[i].r; timers.splice(i, 1); r(); }
    for (let i = tweens.length - 1; i >= 0; i--) {
      const a = tweens[i];
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      a.fn(k);
      if (k >= 1) { tweens.splice(i, 1); a.r(); }
    }
    if (!cur) return;
    if (typing) {
      const cps = fastOn ? 400 : TALK.speed || 42; // 옵션의 글자 속도
      const before = Math.floor(typing.n);
      typing.n = Math.min(typing.full.length, typing.n + dt * cps);
      const shown = Math.floor(typing.n);
      textEl.textContent = typing.full.slice(0, shown);
      // 글자 소리: 두 글자마다 한 번, 띄어쓰기·문장부호는 건너뛴다 (빠르게 넘길 때는 소리 없음)
      if (!fastOn) for (let i = before; i < shown; i++) {
        if (i % 2 || !/[0-9A-Za-zㄱ-힣]/.test(typing.full[i])) continue;
        if (now - lastBlip < 0.045) continue;
        lastBlip = now;
        AU.blip(blipFreq(cur.who), 1);
      }
      if (typing.n >= typing.full.length) { typing = null; afterTyped(); }
    } else if ((autoOn || fastOn) && autoWait > 0 && !busy && !root.classList.contains('logon') && !root.classList.contains('asking')) {
      autoWait -= dt;
      if (autoWait <= 0) { autoWait = 0; go(cur.next); }
    }
  }

  function openLog() {
    const list = logEl.querySelector('.tloglist');
    list.innerHTML = log.map(([w, t]) => `<div class="li ${w ? '' : 'nar'}"><b>${w}</b><p>${t.replace(/[<&]/g, (c) => ({ '<': '&lt;', '&': '&amp;' })[c])}</p></div>`).join('');
    root.classList.add('logon');
    list.scrollTop = list.scrollHeight;
  }
  function askSkip() {
    root.classList.add('asking');
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]');
    if (b) {
      e.stopPropagation();
      const k = b.dataset.k;
      AU.play('lo_click', 0.6);
      if (k === 'auto') { autoOn = !autoOn; fastOn = false; setBtn(); if (!typing && cur && !busy && !(cur.ch && cur.ch.length)) autoWait = 0.6; }
      else if (k === 'fast') { fastOn = !fastOn; setBtn(); if (!typing && cur && !busy && !(cur.ch && cur.ch.length)) autoWait = 0.1; }
      else if (k === 'log') openLog();
      else if (k === 'skip') askSkip();
      else if (k === 'skipY') { root.classList.remove('asking'); skip(); }
      else if (k === 'skipN') root.classList.remove('asking');
      return;
    }
    if (root.classList.contains('logon')) { root.classList.remove('logon'); return; }
    if (e.target.closest('.tchoices') || e.target.closest('.task')) return;
    next();
  });

  window.TALK = { play, preload, update, next, skip, askSkip, get active() { return !!cur; }, get busy() { return busy; } };
})();
