// 게임 자료: 지형, 병종, 영웅(지휘관)과 전직, 용병, 철충, 특기, 스테이지(지도·배치·이벤트·대사)
(function () {
  // ── 지형 ────────────────────────────────────────────────
  // cost: 이동 방식별 이동력 소모 (99 = 못 들어감), def: 방어 보정(비행은 무시), heal: 차례 시작 회복
  const TERRAIN = {
    '.': { name: '평원', cost: { foot: 1, horse: 1, fly: 1 }, def: 0, bg: 'plain' },
    'r': { name: '도로', cost: { foot: 1, horse: 1, fly: 1 }, def: 0, bg: 'ruins' },
    'f': { name: '숲', cost: { foot: 2, horse: 3, fly: 1 }, def: 0.2, bg: 'forest' },
    'h': { name: '언덕', cost: { foot: 2, horse: 2, fly: 1 }, def: 0.15, bg: 'plain' },
    'm': { name: '산', cost: { foot: 3, horse: 99, fly: 1 }, def: 0.3, bg: 'mountain' },
    'w': { name: '강', cost: { foot: 99, horse: 99, fly: 1 }, def: -0.1, bg: 'bridge' },
    '=': { name: '다리', cost: { foot: 1, horse: 1, fly: 1 }, def: -0.05, bg: 'bridge' },
    'v': { name: '마을', cost: { foot: 1, horse: 1, fly: 1 }, def: 0.1, heal: 3, bg: 'town' },
    'c': { name: '요새', cost: { foot: 1, horse: 1, fly: 1 }, def: 0.3, heal: 3, bg: 'fort' },
    '#': { name: '성벽', cost: { foot: 99, horse: 99, fly: 1 }, def: 0.4, bg: 'fort' },
    's': { name: '폐허', cost: { foot: 1, horse: 2, fly: 1 }, def: 0.1, bg: 'ruins' },
  };

  // ── 병종 상성 (랑그릿사식) ─────────────────────────────
  // 경장 ▶ 중장 ▶ 기동 ▶ 경장, 비행은 지상 근접에 강하고 사격에 약하다. 사격은 근접전에 약하다.
  const KIND = {
    inf: { name: '경장', color: '#7fd0ff', icon: '⚔' },
    pike: { name: '중장', color: '#ffd36e', icon: '⛨' },
    cav: { name: '기동', color: '#ff8a7a', icon: '➶' },
    fly: { name: '비행', color: '#c8a2ff', icon: '✈' },
    arch: { name: '사격', color: '#9dffa8', icon: '◎' },
  };
  const BEATS = { inf: ['pike'], pike: ['cav'], cav: ['inf', 'arch'], fly: ['inf', 'pike', 'cav'], arch: ['fly'] };

  // ── 특기 (지휘관 전용, 지도 위에서 바로 발동) ──────────
  // tgt: self(자신 중심) | ally | enemy | tile, area: 0 단일 / 1 십자 / 'sq' 3x3 / 'adj' 인접 전체 / 'line' 직선
  const SKILLS = {
    rally: { name: '돌격 명령', mp: 2, tgt: 'self', radius: 2, buff: { at: 4 }, fx: 'buff', sfx: 'charge', desc: '주변 2칸 아군 공격 +4 (적 차례가 끝날 때까지)' },
    sweep: { name: '백화요란', mp: 3, tgt: 'self', area: 'adj', power: 1.05, fx: 'slash', sfx: 'swing', desc: '인접한 적 전체를 강타 (반격 없음)' },
    guard: { name: '방어 명령', mp: 2, tgt: 'self', radius: 2, buff: { df: 5 }, fx: 'shield', sfx: 'energy', desc: '주변 2칸 아군 방어 +5 (적 차례가 끝날 때까지)' },
    laser: { name: '관통 레이저', mp: 3, tgt: 'line', len: 4, power: 0.95, fx: 'laser', sfx: 'laserBig', desc: '한 방향 직선 4칸의 적 모두 공격' },
    heal: { name: '수복', mp: 2, tgt: 'ally', range: 3, heal: 4, fx: 'heal', sfx: 'energy', desc: '사거리 3 아군 하나 병력 +4' },
    healall: { name: '긴급 수복', mp: 4, tgt: 'self', radius: 2, heal: 3, fx: 'heal', sfx: 'energy', desc: '주변 2칸 아군 전원 병력 +3' },
    snipe: { name: '데저트 스톰', mp: 3, tgt: 'enemy', range: 3, area: 0, power: 1.3, fx: 'shot', sfx: 'rifle', desc: '사거리 3 적 하나에 고속 연계 사격' },
    haste: { name: '질풍', mp: 3, tgt: 'self', radius: 2, buff: { mov: 2 }, fx: 'buff', sfx: 'charge', desc: '주변 2칸 아군 다음 차례 이동력 +2' },
    fire: { name: '화염 폭격', mp: 3, tgt: 'tile', range: 4, area: 1, power: 0.8, fx: 'fire', sfx: 'expM', desc: '사거리 4, 십자 5칸에 화염 피해' },
    wolf: { name: '핏빛 효후', mp: 5, tgt: 'tile', range: 4, area: 'sq', power: 1.0, fx: 'fire', sfx: 'expB', desc: '사거리 4, 3x3 범위에 늑대 화염 폭격' },
    thunder: { name: '뇌정벽력', mp: 4, tgt: 'tile', range: 3, area: 1, power: 1.0, fx: 'bolt', sfx: 'elec', desc: '사거리 3, 십자 5칸에 낙뢰' },
    storm: { name: '전방위 포격', mp: 5, tgt: 'tile', range: 5, area: 'sq', power: 0.9, fx: 'fire', sfx: 'expB', desc: '사거리 5, 3x3 범위 포격' },
    charge: { name: '흑기사의 돌격', mp: 3, tgt: 'enemy', range: 2, area: 0, power: 1.4, fx: 'slash', sfx: 'slash', desc: '사거리 2 적 하나에 돌격 일격' },
  };

  // ── 영웅 (아군 지휘관) ──────────────────────────────────
  // tiers: 전직 단계 (Lv1 / Lv5 / Lv10). 수치는 그 단계의 Lv1 기준, grow는 레벨당 성장.
  // cmd: 지휘 범위, ca/cd: 지휘 범위 안 용병의 공격/방어 보정, slots: 데리고 갈 용병 수
  const HEROES = {
    labiata: {
      name: '라비아타', full: '라비아타 프로토타입', rig: 'labiata', icon: 'c_3P_Labiata_N', face: '3P_Labiata_N', sfx: 'swing',
      kind: 'inf', move: 'foot', rng: 1, grow: { at: 1.4, df: 1.0 }, lead: true, sizeK: 1.45,
      tiers: [
        { cls: '선봉 지휘관', at: 24, df: 19, mov: 5, cmd: 2, ca: 2, cd: 1, mp: 4, slots: 2, troops: ['brownie', 'gnome'], skills: ['rally'] },
        { cls: '돌격 대장', at: 27, df: 21, mov: 5, cmd: 2, ca: 3, cd: 2, mp: 6, slots: 3, troops: ['brownie', 'gnome', 'leprechaun'], skills: ['rally', 'sweep'] },
        { cls: '오르카의 선봉', at: 31, df: 24, mov: 6, cmd: 3, ca: 4, cd: 3, mp: 8, slots: 4, troops: ['brownie', 'gnome', 'leprechaun', 'sylphid'], skills: ['rally', 'sweep'] },
      ],
      bio: '오르카 저항군 최초의 바이오로이드이자 모두의 언니. 경장 지휘관. 쓰러지면 패배합니다.',
    },
    leona: {
      name: '레오나', full: '철혈의 레오나', rig: 'leona', icon: 'c_BR_Leona_N', face: 'BR_Leona_N', sfx: 'laserBig',
      kind: 'pike', move: 'foot', rng: 1, grow: { at: 1.1, df: 1.4 },
      tiers: [
        { cls: '방어 지휘관', at: 22, df: 24, mov: 4, cmd: 2, ca: 1, cd: 3, mp: 4, slots: 2, troops: ['gnome', 'brownie'], skills: ['guard'] },
        { cls: '철혈 대장', at: 25, df: 27, mov: 4, cmd: 2, ca: 2, cd: 4, mp: 6, slots: 3, troops: ['gnome', 'brownie', 'leprechaun'], skills: ['guard', 'laser'] },
        { cls: '철혈의 군주', at: 28, df: 31, mov: 5, cmd: 3, ca: 2, cd: 5, mp: 8, slots: 4, troops: ['gnome', 'brownie', 'leprechaun'], skills: ['guard', 'laser'] },
      ],
      bio: '철혈의 연대를 이끄는 지휘관. 단단한 중장 부대로 기동 부대를 막아냅니다.',
    },
    daphne: {
      name: '다프네', full: '다프네', rig: 'daphne', icon: 'c_3P_Daphne_N', face: '3P_Daphne_N', sfx: 'laser',
      kind: 'inf', move: 'foot', rng: 1, grow: { at: 0.9, df: 1.0 },
      tiers: [
        { cls: '수복 담당', at: 18, df: 17, mov: 4, cmd: 2, ca: 1, cd: 2, mp: 6, slots: 2, troops: ['brownie', 'leprechaun'], skills: ['heal'] },
        { cls: '의무 대장', at: 20, df: 19, mov: 5, cmd: 2, ca: 1, cd: 3, mp: 9, slots: 2, troops: ['brownie', 'leprechaun', 'gnome'], skills: ['heal', 'healall'] },
        { cls: '생명의 수호자', at: 22, df: 22, mov: 5, cmd: 3, ca: 2, cd: 3, mp: 12, slots: 3, troops: ['brownie', 'leprechaun', 'gnome'], skills: ['heal', 'healall'] },
      ],
      bio: '부상병을 돌보는 수복 담당. 전투력은 약하지만 회복 특기로 전선을 지탱합니다.',
    },
    khan: {
      name: '칸', full: '신속의 칸', rig: 'khan', icon: 'c_BR_Khan_N', face: 'BR_Khan_N', sfx: 'rifle',
      kind: 'cav', move: 'horse', rng: 1, grow: { at: 1.5, df: 0.9 },
      tiers: [
        { cls: '기동 지휘관', at: 26, df: 17, mov: 7, cmd: 2, ca: 2, cd: 1, mp: 4, slots: 2, troops: ['sylphid', 'brownie'], skills: ['snipe'] },
        { cls: '사막의 질풍', at: 30, df: 19, mov: 7, cmd: 2, ca: 3, cd: 1, mp: 6, slots: 3, troops: ['sylphid', 'brownie'], skills: ['snipe', 'haste'] },
        { cls: '신속의 칸', at: 34, df: 21, mov: 8, cmd: 3, ca: 4, cd: 2, mp: 8, slots: 3, troops: ['sylphid', 'brownie', 'harpy'], skills: ['snipe', 'haste'] },
      ],
      bio: '둠 브링어의 기동 지휘관. 빠른 발로 적진을 가르지만 중장 부대에는 약합니다.',
    },
    brunhild: {
      name: '브륀힐드', full: '브륀힐드', rig: 'brunhild', icon: 'c_BR_Brunhild_N', face: 'BR_Brunhild_N', sfx: 'expM',
      kind: 'arch', move: 'foot', rng: 2, grow: { at: 1.5, df: 0.8 },
      tiers: [
        { cls: '포격 지휘관', at: 25, df: 15, mov: 4, cmd: 2, ca: 2, cd: 1, mp: 6, slots: 2, troops: ['leprechaun', 'gnome'], skills: ['fire'] },
        { cls: '화염 대장', at: 29, df: 17, mov: 4, cmd: 2, ca: 3, cd: 1, mp: 9, slots: 3, troops: ['leprechaun', 'gnome', 'harpy'], skills: ['fire', 'wolf'] },
        { cls: '핏빛 늑대', at: 33, df: 19, mov: 5, cmd: 3, ca: 3, cd: 2, mp: 12, slots: 3, troops: ['leprechaun', 'gnome', 'harpy'], skills: ['fire', 'wolf'] },
      ],
      bio: '둠 브링어의 화력 담당. 사거리 2의 사격과 범위 화염 특기를 씁니다.',
    },
    fafnir: {
      name: '파프니르', full: '파프니르', rig: 'fafnir', icon: 'c_BR_Fafnir_N', face: 'BR_Fafnir_N', sfx: 'elec',
      kind: 'fly', move: 'fly', rng: 1, grow: { at: 1.4, df: 1.0 },
      tiers: [
        { cls: '비행 지휘관', at: 26, df: 18, mov: 6, cmd: 2, ca: 2, cd: 2, mp: 6, slots: 2, troops: ['harpy', 'sylphid'], skills: ['thunder'] },
        { cls: '뇌룡', at: 29, df: 20, mov: 6, cmd: 2, ca: 3, cd: 2, mp: 8, slots: 3, troops: ['harpy', 'sylphid'], skills: ['thunder'] },
        { cls: '뇌정의 용', at: 33, df: 23, mov: 7, cmd: 3, ca: 3, cd: 3, mp: 10, slots: 3, troops: ['harpy', 'sylphid', 'leprechaun'], skills: ['thunder', 'storm'] },
      ],
      bio: '하늘을 나는 용 바이오로이드. 지형을 무시하고 날아다니지만 사격에 약합니다.',
    },
  };
  const TIER_LV = [1, 5, 10];
  const MAX_LV = 15;

  // ── 용병 (아군) / 철충 병사 (적) ───────────────────────
  const TROOPS = {
    brownie: { name: '브라우니', rig: 'brownie', icon: 'c_BR_Brownie_N', kind: 'inf', move: 'foot', rng: 1, at: 17, df: 11, mov: 4, cost: 50, sfx: 'rifle' },
    gnome: { name: '노움', rig: 'gnome', icon: 'c_BR_Gnome_N', kind: 'pike', move: 'foot', rng: 1, at: 15, df: 16, mov: 3, cost: 70, sfx: 'cannon' },
    leprechaun: { name: '레프리콘', rig: 'leprechaun', icon: 'c_BR_Leprechaun_N', kind: 'arch', move: 'foot', rng: 2, at: 16, df: 9, mov: 4, cost: 70, sfx: 'mg' },
    sylphid: { name: '실피드', rig: 'sylphid', icon: 'c_BR_Sylphid_N', kind: 'cav', move: 'horse', rng: 1, at: 20, df: 11, mov: 6, cost: 90, sfx: 'gun' },
    harpy: { name: '하르페이아', rig: 'harpy', icon: 'c_BR_Harpy_N', kind: 'fly', move: 'fly', rng: 1, at: 18, df: 11, mov: 6, cost: 110, sfx: 'missile' },
    // 철충
    chick: { name: '나이트 칙', rig: 'e_NightChick_N', icon: 'e_NightChick_N', kind: 'inf', move: 'foot', rng: 1, at: 15, df: 10, mov: 4, sfx: 'gun', enemy: true },
    legion: { name: '레기온', rig: 'e_Legion_N', icon: 'e_Legion_N', kind: 'pike', move: 'foot', rng: 1, at: 14, df: 15, mov: 3, sfx: 'cannon', enemy: true },
    predator: { name: '프레데터', rig: 'e_Predator_N', icon: 'e_Predator_N', kind: 'cav', move: 'horse', rng: 1, at: 19, df: 10, mov: 6, sfx: 'slash', enemy: true },
    drone: { name: '드론', rig: 'e_Drone_N', icon: 'e_Drone_N', kind: 'fly', move: 'fly', rng: 1, at: 16, df: 9, mov: 6, sfx: 'laser', enemy: true },
    phalanx: { name: '팔랑기테스', rig: 'e_Phalangites_N', icon: 'e_Phalangites_N', kind: 'arch', move: 'foot', rng: 2, at: 16, df: 11, mov: 3, sfx: 'cannon', enemy: true },
  };

  // ── 적 지휘관 ──────────────────────────────────────────
  const BOSSES = {
    bigchick: { name: '빅 칙', rig: 'e_BigChick_N', icon: 'e_BigChick_N', kind: 'inf', move: 'foot', rng: 1, at: 21, df: 15, mov: 4, cmd: 2, ca: 1, cd: 1, mp: 0, skills: [], sfx: 'cannon' },
    blackknight: { mapH: 1.12, name: '블랙 나이트', rig: 'e_BlackKnight_N', icon: 'e_BlackKnight_N', kind: 'cav', move: 'horse', rng: 1, at: 28, df: 21, mov: 6, cmd: 2, ca: 2, cd: 2, mp: 6, skills: ['charge'], sfx: 'slash' },
    goltarion: { mapH: 1.3, name: '골타리온', rig: 'e_Goltarion_N', icon: 'e_Goltarion_N', face: 'AGS_Goltarion_N', kind: 'pike', move: 'foot', rng: 1, at: 25, df: 28, mov: 3, cmd: 3, ca: 2, cd: 3, mp: 6, skills: ['guard'], sfx: 'cannon' },
    executioner: { mapH: 1.18, name: '엑스큐셔너', rig: 'e_Executioner_EW', icon: 'e_Executioner_EW', kind: 'inf', move: 'foot', rng: 1, at: 30, df: 22, mov: 5, cmd: 2, ca: 3, cd: 1, mp: 6, skills: ['sweep'], sfx: 'slash' },
    emperor: { mapH: 1.22, name: '엠페러 칙', rig: 'e_EmperorChick_N', icon: 'e_EmperorChick_N', kind: 'pike', move: 'foot', rng: 1, at: 24, df: 24, mov: 3, cmd: 3, ca: 2, cd: 2, mp: 8, skills: ['healall'], sfx: 'cannon' },
    ironprince: { mapH: 1.28, name: '철의 왕자', rig: 'e_IronPrince_N', icon: 'e_IronPrince_N', kind: 'fly', move: 'fly', rng: 1, at: 33, df: 27, mov: 5, cmd: 3, ca: 3, cd: 3, mp: 12, skills: ['thunder', 'storm'], sfx: 'laserBig' },
  };

  // ── 스테이지 ───────────────────────────────────────────
  // map: 지형 문자열(위→아래), starts: 영웅 시작 칸, enemies: 적 부대(지휘관 + 용병), events: 차례 이벤트
  // ai: charge(바로 진격) | hold(아군이 range 칸 안에 오면 진격) | guard(시작 칸 근처만 지킴)
  // 대사 한 줄: [화자, 표정, 문장]  화자: 영웅 키 / 'nar'(해설) / 적 지휘관 키
  const STAGES = [
    {
      id: 1, title: '첫 출격', bg: 'camp', bgm: 'battle',
      goal: '적 지휘관 전멸', lose: '라비아타 퇴각', win: 'all',
      heroes: ['labiata', 'leona', 'daphne'], reward: 450,
      map: [
        'mmhh....ff..mm',
        'mh....r...f.hm',
        'h....rr.....fh',
        '..ff.r..v.....',
        '.fff.r....ff..',
        '..f..rrrrrr...',
        '.....v....r.f.',
        '..h.......r.ff',
        '.hh..ff...r...',
        '.....ff..rr..h',
        '..v.....rr..hh',
        '.......rr...hm',
      ],
      starts: [[3, 9], [5, 10], [2, 11]],
      enemies: [
        { cmd: 'bigchick', x: 10, y: 2, lv: 1, ai: 'hold', range: 6, troops: [['chick', 9, 2], ['chick', 11, 3], ['chick', 10, 3]] },
        { cmd: 'bigchick', x: 12, y: 7, lv: 1, ai: 'hold', range: 5, troops: [['chick', 11, 7], ['legion', 12, 8]] },
      ],
      intro: [
        ['nar', '', '철충에게 빼앗긴 땅, 오르카 저항군의 첫 번째 반격이 시작된다.'],
        ['labiata', 'Smile', '사령관님, 부대 편성을 마쳤어요. 오늘은 제가 선봉을 맡을게요.'],
        ['leona', 'Idle', '앞쪽 마을 근처에 철충 부대가 진을 쳤다. 지휘관 개체를 쓰러뜨리면 부하들도 무너진다.'],
        ['daphne', 'idle', '다친 아이는 제가 고칠게요. 용병은 지휘관 곁에 붙어 있어야 힘을 낼 수 있다는 것도 잊지 마세요.'],
        ['labiata', 'Expressionless', '경장은 중장에, 중장은 기동에, 기동은 경장에 강해요. 상성을 잘 보고 붙어 주세요.'],
      ],
      outro: [
        ['labiata', 'BigSmile', '첫 승리예요, 사령관님! 다들 수고했어요.'],
        ['leona', 'Smile', '저 강 너머에서 기동형 철충의 움직임이 보고됐다. 쉬고 바로 움직이지.'],
      ],
      events: [],
    },
    {
      id: 2, title: '강 건너의 흑기사', bg: 'cliff', bgm: 'battle2',
      goal: '블랙 나이트 격파', lose: '라비아타 퇴각', win: 'boss', boss: 'blackknight',
      heroes: ['labiata', 'leona', 'daphne', 'khan'], reward: 650,
      map: [
        'ffhh....ww..hhmm',
        'f.......ww....hm',
        '..ff....ww..ff.h',
        '........==......',
        '.r......ww..v...',
        '.rrrr...ww......',
        '....r...ww..rrr.',
        '.v..rrrr==rrr...',
        '....f...ww...ff.',
        '..fff...ww..fff.',
        '.ffh....ww....hh',
        'hhmm....ww...hmm',
      ],
      starts: [[2, 6], [3, 8], [1, 9], [4, 4]],
      enemies: [
        { cmd: 'blackknight', x: 13, y: 5, lv: 3, ai: 'hold', range: 7, boss: true, troops: [['predator', 12, 5], ['predator', 13, 6], ['predator', 14, 4]] },
        { cmd: 'bigchick', x: 11, y: 9, lv: 2, ai: 'charge', troops: [['chick', 10, 9], ['legion', 11, 10], ['chick', 12, 9]] },
        { cmd: 'bigchick', x: 11, y: 1, lv: 2, ai: 'hold', range: 6, troops: [['drone', 10, 1], ['drone', 11, 2]] },
      ],
      intro: [
        ['khan', 'Idle', '둠 브링어 소속 칸이다. 오늘부터 사령관의 지휘를 받는다.'],
        ['khan', 'Smile', '저 건너편 흑기사는 내 몫으로 남겨 둬. 빠른 놈끼리 겨뤄 보고 싶으니까.'],
        ['leona', 'Idle', '블랙 나이트의 부하는 프레데터, 기동형이다. 노움 같은 중장 용병으로 막는 게 정석이다.'],
        ['labiata', 'Smile', '다리 두 곳이 길목이에요. 드론은 강 위로도 날아오니 사격 용병을 곁에 두세요.'],
      ],
      outro: [
        ['khan', 'Smile', '흑기사도 별거 없군. 다음은 어디지, 사령관?'],
        ['labiata', 'Expressionless', '북쪽 산악 요새에 AGS 골타리온이 버티고 있대요. 성벽이 두꺼운 곳이에요.'],
      ],
      events: [
        { turn: 3, side: 'p', talk: [['khan', 'Anger', '지원군이다! 오른쪽 숲에서 프레데터가 온다!']], reinforce: [{ cmd: 'bigchick', x: 15, y: 9, lv: 2, ai: 'charge', troops: [['predator', 15, 8], ['predator', 14, 10]] }] },
      ],
      bossTalk: [['blackknight', '', '……침입자. 배제한다.'], ['khan', 'Anger', '말 많은 놈보다 낫네. 간다!']],
    },
    {
      id: 3, title: '골타리온 요새', bg: 'camp', bgm: 'battle',
      goal: '골타리온 격파', lose: '라비아타 퇴각 / 15턴 초과', win: 'boss', boss: 'goltarion', turnLimit: 15,
      heroes: ['labiata', 'leona', 'daphne', 'khan', 'brunhild'], reward: 850,
      map: [
        'mmm#cccc#mmmmm',
        'mm.#cccc#..hmm',
        'm..##c.##...hm',
        'm.....r.....hm',
        'h..ff.r.ff...h',
        '...ff.r.ff....',
        '......r.......',
        '..hh..r...hh..',
        '..hh..rr..h...',
        '.......r......',
        '.ff....r...ff.',
        '.fff...r..fff.',
        '..f....r...f..',
        'mm.....r....mm',
      ],
      starts: [[6, 12], [8, 12], [5, 13], [9, 11], [7, 13]],
      enemies: [
        { cmd: 'goltarion', x: 6, y: 0, lv: 4, ai: 'guard', boss: true, troops: [['legion', 5, 1], ['legion', 6, 1], ['phalanx', 4, 0], ['phalanx', 7, 0]] },
        { cmd: 'bigchick', x: 6, y: 5, lv: 3, ai: 'hold', range: 5, troops: [['legion', 5, 5], ['phalanx', 7, 4], ['chick', 6, 6]] },
        { cmd: 'blackknight', x: 11, y: 4, lv: 3, ai: 'hold', range: 5, name: '블랙 나이트 Mk.2', troops: [['predator', 11, 5], ['predator', 12, 4]] },
        { cmd: 'bigchick', x: 2, y: 4, lv: 3, ai: 'hold', range: 5, troops: [['drone', 1, 4], ['drone', 2, 3], ['chick', 3, 5]] },
      ],
      intro: [
        ['brunhild', 'Idle', '브륀힐드, 합류한다. 성벽 뒤에 숨은 놈들은 내 불꽃으로 끌어내지.'],
        ['labiata', 'Smile', '브륀힐드는 두 칸 떨어진 곳에서도 공격할 수 있어요. 근접 부대는 반격하지 못해요.'],
        ['leona', 'Idle', '요새 칸은 방어 보정이 크다. 성문은 가운데 한 칸뿐이니 서두르지 말고 포위해라.'],
        ['daphne', 'Worry', '15턴 안에 함락하지 못하면 철충 본대가 돌아온대요……'],
      ],
      outro: [
        ['brunhild', 'Smile', '요새도 불타면 그저 돌무더기지.'],
        ['labiata', 'Sad', '사령관님, 숲 쪽에서 이상한 신호가 잡혀요. 처형자라 불리는 개체가 움직였대요.'],
      ],
      events: [],
      bossTalk: [['goltarion', 'Idle', '이 요새는 넘겨줄 수 없다. 돌아가라, 오르카.'], ['leona', 'Idle', '두꺼운 장갑끼리 겨뤄 보자.']],
    },
    {
      id: 4, title: '밤숲의 처형자', bg: 'night', bgm: 'battle2',
      goal: '엑스큐셔너 격파', lose: '라비아타 퇴각', win: 'boss', boss: 'executioner',
      heroes: ['labiata', 'leona', 'daphne', 'khan', 'brunhild', 'fafnir'], reward: 1050, night: true,
      map: [
        'fffff..ffff..fff',
        'ff.ff...ff....ff',
        'f..f..h...fff..f',
        'f.....hh..ff....',
        '..fff......v..ff',
        '.ffff..ff.....ff',
        '..ff..ffff..h...',
        '......ff....hh..',
        '.ww.......ff....',
        'www==www..fff..f',
        '.ww..ww....f..ff',
        '..f..........fff',
        '.ff..v...ff..fff',
        'fff.....ffff.fff',
      ],
      starts: [[3, 11], [5, 12], [2, 12], [6, 11], [4, 13], [7, 12]],
      enemies: [
        { cmd: 'executioner', x: 12, y: 1, lv: 5, ai: 'hold', range: 6, boss: true, troops: [['chick', 11, 1], ['predator', 13, 2], ['chick', 12, 2], ['legion', 11, 2]] },
        { cmd: 'bigchick', x: 8, y: 6, lv: 4, ai: 'charge', troops: [['chick', 7, 6], ['chick', 9, 6], ['phalanx', 8, 5]] },
        { cmd: 'blackknight', x: 13, y: 7, lv: 4, ai: 'charge', name: '블랙 나이트 Mk.3', troops: [['predator', 13, 6], ['predator', 14, 7]] },
      ],
      intro: [
        ['fafnir', 'BigSmile', '파프니르 등장! 하늘은 내 거야. 숲이든 강이든 상관없지!'],
        ['labiata', 'Expressionless', '밤숲은 시야가 좋지 않아요. 3턴쯤 뒤로 매복이 올 수 있으니 진형을 흩트리지 마세요.'],
        ['brunhild', 'Idle', '파프니르, 사격형 철충은 조심해. 날개 달린 녀석에겐 치명적이니까.'],
      ],
      outro: [
        ['fafnir', 'Smile', '처형자라더니 처형당한 건 그쪽이었네!'],
        ['labiata', 'Anger', '……사령관님. 철의 왕자가 직접 나섰다는 보고예요. 불타는 성채에서 기다리고 있대요.'],
      ],
      events: [
        { turn: 3, side: 'p', talk: [['daphne', 'Surprised', '뒤쪽이에요! 아래 숲에서 철충이 나타났어요!']], reinforce: [{ cmd: 'bigchick', x: 13, y: 12, lv: 4, ai: 'charge', troops: [['chick', 12, 12], ['drone', 14, 11], ['predator', 13, 13]] }] },
        { turn: 5, side: 'p', talk: [['khan', 'Anger', '북서쪽에도 지원군이다. 드론 무리야!']], reinforce: [{ cmd: 'bigchick', x: 1, y: 1, lv: 4, ai: 'charge', troops: [['drone', 2, 1], ['drone', 1, 2]] }] },
      ],
      bossTalk: [['executioner', '', '처형 대상 확인. 집행을 개시한다.'], ['labiata', 'Anger', '당신에게 넘겨줄 사람은 아무도 없어요!']],
    },
    {
      id: 5, title: '철의 왕자', bg: 'fire', bgm: 'boss',
      goal: '철의 왕자 격파', lose: '라비아타 퇴각', win: 'boss', boss: 'ironprince',
      heroes: ['labiata', 'leona', 'daphne', 'khan', 'brunhild', 'fafnir'], reward: 1300,
      map: [
        'mm##cccccc##mm',
        'm.#cccccccc#.m',
        'm.##cc..cc##.m',
        '.....s..s.....',
        '.ss..rrrr..ss.',
        '.s...r..r...s.',
        '..hh.r..r.hh..',
        '..h..rrrr..h..',
        '.....r..r.....',
        'ww==wwr.ww==ww',
        '.....rr.......',
        '..ff..r...ff..',
        '.fff..r...fff.',
        '..f...r....f..',
        'mm....r.....mm',
      ],
      starts: [[6, 13], [8, 13], [5, 14], [9, 12], [7, 14], [4, 12]],
      enemies: [
        { cmd: 'ironprince', x: 6, y: 0, lv: 7, ai: 'guard', boss: true, troops: [['drone', 5, 1], ['drone', 8, 1], ['phalanx', 4, 1], ['legion', 7, 1]] },
        { cmd: 'emperor', x: 9, y: 4, lv: 6, ai: 'hold', range: 5, troops: [['legion', 8, 4], ['chick', 10, 4], ['phalanx', 9, 3], ['chick', 10, 5]] },
        { cmd: 'blackknight', x: 3, y: 4, lv: 6, ai: 'hold', range: 6, name: '블랙 나이트 Mk.4', troops: [['predator', 2, 4], ['predator', 3, 5], ['predator', 4, 3]] },
        { cmd: 'executioner', x: 7, y: 7, lv: 6, ai: 'charge', name: '엑스큐셔너 Mk.2', troops: [['chick', 6, 7], ['chick', 8, 7], ['legion', 7, 8]] },
      ],
      intro: [
        ['nar', '', '불타는 성채. 철충을 이끄는 지휘 개체, 철의 왕자가 모습을 드러냈다.'],
        ['labiata', 'Anger', '여기서 끝내요. 모두, 사령관님의 지시를 따라 주세요!'],
        ['leona', 'Idle', '앞의 세 부대를 먼저 걷어내고 성채로 올라간다. 무리하지 마라.'],
        ['fafnir', 'Anger', '저 왕자, 하늘을 나는 녀석이야. 사격 용병이 꼭 필요해!'],
        ['brunhild', 'Smile', '불꽃으로 왕좌를 녹여 주지.'],
      ],
      outro: [
        ['labiata', 'BigSmile', '이겼어요, 사령관님……! 정말로 이겼어요!'],
        ['daphne', 'BigSmile', '다친 아이들 모두 돌아왔어요. 이제 집으로 가요.'],
        ['nar', '', '철의 왕자를 쓰러뜨린 오르카 저항군. 그러나 철충과의 싸움은 아직 끝나지 않았다.'],
      ],
      events: [
        { turn: 4, side: 'p', talk: [['nar', '', '성채 양옆에서 철충 지원군이 내려온다!']], reinforce: [{ cmd: 'bigchick', x: 1, y: 3, lv: 6, ai: 'charge', troops: [['drone', 0, 3], ['chick', 1, 4]] }, { cmd: 'bigchick', x: 12, y: 3, lv: 6, ai: 'charge', troops: [['drone', 13, 3], ['chick', 12, 4]] }] },
      ],
      bossTalk: [['ironprince', '', '하찮은 인형들이 여기까지 오다니. 직접 부숴 주마.'], ['labiata', 'Anger', '우리는 인형이 아니에요. 오르카예요!']],
    },
  ];

  (typeof window !== 'undefined' ? window : globalThis).DATA = { TERRAIN, KIND, BEATS, SKILLS, HEROES, TIER_LV, MAX_LV, TROOPS, BOSSES, STAGES };
})();
