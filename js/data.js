// 게임 자료: 지형, 병종 상성, 특기, 영웅(전직 3단계)과 배속 병사, 철충, 스테이지(본작 1지역 1-1 ~ 1-8)
// 랑그릿사 모바일 방식: 지도 위 한 칸 = 영웅 1명 + 배속 병사 부대. 공격받으면 병사가 먼저 깎이고, 병사가 전멸하면 영웅이 맞는다.
(function () {
  // ── 지형 ────────────────────────────────────────────────
  // cost: 이동 방식별 이동력 소모 (99 = 못 들어감), def: 방어 보정(비행은 무시), heal: 차례 시작 회복(최대 체력 비율)
  // 랑그릿사 모바일 지형표 기준 (보행 foot / 기마 horse / 비행 fly). 99 = 못 들어감. def = 방어 보정(비병은 지형 영향 없음)
  const TERRAIN = {
    '.': { name: '평지', cost: { foot: 1, horse: 1, fly: 1 }, def: 0, bg: 'plain' },
    'r': { name: '도로', cost: { foot: 1, horse: 1, fly: 1 }, def: 0, bg: 'ruins' },
    'f': { name: '숲', cost: { foot: 1, horse: 3, fly: 1 }, def: 0.2, bg: 'forest' },
    'h': { name: '언덕', cost: { foot: 2, horse: 3, fly: 1 }, def: 0.1, bg: 'plain' },
    'm': { name: '산', cost: { foot: 2, horse: 3, fly: 1 }, def: 0.1, bg: 'mountain' },
    'w': { name: '바다', cost: { foot: 99, horse: 99, fly: 1 }, def: 0, bg: 'bridge' },
    '=': { name: '다리', cost: { foot: 1, horse: 1, fly: 1 }, def: 0, bg: 'bridge' },
    'v': { name: '마을', cost: { foot: 1, horse: 1, fly: 1 }, def: 0.05, bg: 'town' },
    'c': { name: '기지', cost: { foot: 1, horse: 1, fly: 1 }, def: 0.1, bg: 'fort' },
    '#': { name: '잔해 벽', cost: { foot: 99, horse: 99, fly: 1 }, def: 0.05, bg: 'fort' },
    's': { name: '폐허', cost: { foot: 1, horse: 2, fly: 1 }, def: 0.05, bg: 'ruins' },
  };

  // ── 병종 (랑그릿사 모바일) ───────────────────────────
  // 상성은 병사 병종 기준(영웅끼리는 영웅 병종). REL[공격][방어] = 유리 배율 (+30% 등). 반대 방향은 그만큼 불리.
  const KIND = {
    inf: { name: '보병', color: '#7fd0ff' },
    pike: { name: '창병', color: '#ffd36e' },
    cav: { name: '기병', color: '#ff8a7a' },
    fly: { name: '비병', color: '#c8a2ff' },
    arch: { name: '궁병', color: '#9dffa8', ranged: true },
    priest: { name: '승려', color: '#fff3a8' },
    demon: { name: '마물', color: '#d07aff' },
    water: { name: '수병', color: '#6fd8ff' },
    mage: { name: '법사', color: '#ff9ad5', ranged: true },
    assassin: { name: '암살자', color: '#b0b0c8', ranged: true },
  };
  const REL = { inf: { pike: 0.3 }, pike: { cav: 0.3 }, cav: { inf: 0.3 }, arch: { fly: 0.4 }, priest: { demon: 0.8 } };

  // ── 특기 (재사용 대기 턴 cd) ───────────────────────────
  // tgt: self(자신 중심) | ally | enemy | tile | line, area: 0 단일 / 1 십자 / 'sq' 3x3 / 'adj' 인접 전체
  const SKILLS = {
    repair: { name: '긴급 수리', cd: 3, tgt: 'ally', range: 3, heal: 0.3, fx: 'heal', sfx: 'energy', desc: '사거리 3 아군 하나의 영웅·병사 체력 30% 회복' },
    cover: { name: '엄호 사격', cd: 3, tgt: 'self', radius: 2, buff: { df: 0.2 }, fx: 'shield', sfx: 'energy', desc: '주변 2칸 아군 방어 +20% (적 차례가 끝날 때까지)' },
    missile: { name: '정밀 미사일', cd: 3, tgt: 'tile', range: 3, area: 1, power: 0.9, fx: 'fire', sfx: 'missile', desc: '사거리 3, 십자 5칸에 미사일 공격' },
    jet: { name: '제트 강습', cd: 3, tgt: 'enemy', range: 2, area: 0, power: 1.4, fx: 'slash', sfx: 'expM', desc: '사거리 2 적 하나에 강습 (반격 없음)' },
    oath: { name: '기사의 맹세', cd: 3, tgt: 'self', radius: 1, buff: { df: 0.35 }, fx: 'shield', sfx: 'energy', desc: '자신과 주변 1칸 아군 방어 +35%' },
    judgment: { name: '사제여왕의 심판', cd: 3, tgt: 'enemy', range: 1, area: 0, power: 1.6, fx: 'slash', sfx: 'slash', desc: '인접한 적 하나에 강한 일격 (반격 없음)' },
    beam: { name: '싸이클롭스 빔', cd: 4, tgt: 'line', len: 4, power: 1.0, fx: 'laser', sfx: 'laserBig', desc: '한 방향 직선 4칸의 적 모두 공격' },
    abyss: { name: '심연의 일격', cd: 3, tgt: 'self', area: 'adj', power: 1.1, fx: 'slash', sfx: 'swing', desc: '인접한 적 전체를 강타' },
    siren: { name: '경찰 출동', cd: 3, tgt: 'self', radius: 2, buff: { at: 0.2 }, fx: 'buff', sfx: 'charge', desc: '주변 2칸 아군 공격 +20% (적 차례가 끝날 때까지)' },
    arrest: { name: '현행범 체포', cd: 3, tgt: 'enemy', range: 1, area: 0, power: 1.0, slow: 2, fx: 'shot', sfx: 'gun', desc: '인접한 적 하나를 공격하고 다음 차례 이동 -2' },
    barrage: { name: '집중 포격', cd: 4, tgt: 'tile', range: 4, area: 'sq', power: 0.8, fx: 'fire', sfx: 'expB', desc: '사거리 4, 3x3 범위 포격' },
    // 철충
    shell: { name: '포격', cd: 3, tgt: 'tile', range: 3, area: 1, power: 0.8, fx: 'fire', sfx: 'cannon', desc: '사거리 3 십자 범위 포격' },
    snipe: { name: '저격', cd: 2, tgt: 'enemy', range: 5, area: 0, power: 1.5, fx: 'shot', sfx: 'laserBig', desc: '사거리 5 적 하나 저격' },
  };

  // ── 배속 병사 ───────────────────────────────────────────
  // 영웅마다 고를 수 있는 병사가 정해져 있다. 병사 능력치는 영웅 레벨과 영웅 능력치(공방의 25%)로 오른다.
  // 병사 10명이 한 부대. hp = 부대 전체 체력, mov = 병종 이동력
  const TROOPS = {
    guard: { name: '브라우니 보병', short: '보병', rig: 'brownie', icon: 'c_BR_Brownie_N', kind: 'inf', hp: 70, at: 16, df: 11, mov: 3, sfx: 'rifle' },
    shield: { name: '노움 창병', short: '창병', rig: 'gnome', icon: 'c_BR_Gnome_N', kind: 'pike', hp: 76, at: 15, df: 13, mov: 3, sfx: 'cannon' },
    raider: { name: '실피드 기병', short: '기병', rig: 'sylphid', icon: 'c_BR_Sylphid_N', kind: 'cav', hp: 76, at: 20, df: 12, mov: 5, sfx: 'gun' },
    gunner: { name: '레프리콘 궁병', short: '궁병', rig: 'leprechaun', icon: 'c_BR_Leprechaun_N', kind: 'arch', hp: 62, at: 18, df: 8, mov: 3, sfx: 'mg' },
    flyer: { name: '하르페이아 비병', short: '비병', rig: 'harpy', icon: 'c_BR_Harpy_N', kind: 'fly', hp: 70, at: 20, df: 10, mov: 5, sfx: 'missile' },
    // 철충 병사
    e_chick: { name: '나이트 칙 무리', short: '나이트 칙', rig: 'e_NightChick_N', icon: 'e_NightChick_N', kind: 'inf', hp: 52, at: 12, df: 8, mov: 3, sfx: 'gun' },
    e_launcher: { name: '나이트 칙 런처 무리', short: '런처', rig: 'e_NightChickM_N', icon: 'e_NightChickM_N', kind: 'arch', hp: 44, at: 13, df: 6, mov: 3, sfx: 'cannon' },
    e_shielder: { name: '나이트 칙 실더 무리', short: '실더', rig: 'e_NightChickS_N', icon: 'e_NightChickS_N', kind: 'pike', hp: 64, at: 10, df: 13, mov: 3, sfx: 'gun' },
  };

  // ── 영웅 (본작 1지역 출격 인원) ─────────────────────────
  // tiers: 전직 단계 (Lv1 / Lv5 / Lv10). 수치는 그 단계의 기준, 레벨마다 7%씩 오른다.
  const HEROES = {
    constantia: {
      name: '콘스탄챠', full: '콘스탄챠 S2', rig: 'constantia', icon: 'c_3P_ConstantiaS2_N', face: '3P_ConstantiaS2_N', sfx: 'rifle',
      kind: 'arch', move: 'foot', rng: 2, lead: true, // 궁병
      tiers: [
        { cls: '가정경비 바이오로이드', hp: 92, at: 21, df: 14, mov: 3, troops: ['gunner', 'guard'], skills: ['repair'] },
        { cls: '오르카 호위대장', hp: 106, at: 24, df: 16, mov: 3, troops: ['gunner', 'guard', 'shield'], skills: ['repair', 'cover'] },
        { cls: '사령관의 그림자', hp: 122, at: 28, df: 19, mov: 3, troops: ['gunner', 'guard', 'shield', 'flyer'], skills: ['repair', 'cover'] },
      ],
      bio: '가정경비용 바이오로이드. 마지막 인간을 찾아낸 오르카의 맏언니 역할. 쓰러지면 패배합니다.',
    },
    griffon: {
      name: '그리폰', full: 'P/A-00 그리폰', rig: 'griffon', icon: 'c_BR_PA00EL_N', face: 'BR_PA00EL_N', sfx: 'missile',
      kind: 'fly', move: 'fly', rng: 1, sizeK: 1.15, // 제트 팩으로 날아다니는 비병
      tiers: [
        { cls: '기동공격 바이오로이드', hp: 80, at: 25, df: 11, mov: 5, troops: ['flyer', 'raider'], skills: ['missile'] },
        { cls: '강습 비행대장', hp: 92, at: 29, df: 13, mov: 5, troops: ['flyer', 'raider'], skills: ['missile', 'jet'] },
        { cls: '하늘의 그리폰', hp: 106, at: 33, df: 15, mov: 5, troops: ['flyer', 'raider', 'gunner'], skills: ['missile', 'jet'] },
      ],
      bio: '기동공격용 바이오로이드. 비병이라 지형을 무시하고 날아다니지만 궁병에 약합니다.',
    },
    johanna: {
      name: '요안나', full: '프레스터 요안나', rig: 'johanna', icon: 'c_DS_Johanna_N', face: 'DS_Johanna_N', sfx: 'slash',
      kind: 'pike', move: 'foot', rng: 1,
      tiers: [
        { cls: '사제여왕', hp: 115, at: 21, df: 21, mov: 3, troops: ['shield', 'guard'], skills: ['oath'] },
        { cls: '수호 기사', hp: 133, at: 24, df: 24, mov: 3, troops: ['shield', 'guard', 'raider'], skills: ['oath', 'judgment'] },
        { cls: '동방의 기사여왕', hp: 152, at: 27, df: 28, mov: 3, troops: ['shield', 'guard', 'raider'], skills: ['oath', 'judgment'] },
      ],
      bio: '엔터테인먼트용으로 만들어진 기사 바이오로이드. 두꺼운 방어로 기동형 적을 막아냅니다.',
    },
    lrl: {
      name: 'LRL', full: 'LRL', rig: 'lrl', icon: 'c_PECS_LRL_N', face: 'PECS_LRL_N', sfx: 'swing',
      kind: 'inf', move: 'foot', rng: 1,
      tiers: [
        { cls: '등대 근무 바이오로이드', hp: 101, at: 28, df: 15, mov: 3, troops: ['guard', 'shield'], skills: ['beam'] },
        { cls: '심연의 공주', hp: 115, at: 32, df: 17, mov: 3, troops: ['guard', 'shield', 'raider'], skills: ['beam', 'abyss'] },
        { cls: '싸이클롭스 프린세스', hp: 131, at: 37, df: 19, mov: 3, troops: ['guard', 'shield', 'raider'], skills: ['beam', 'abyss'] },
      ],
      bio: '등대 근무용 바이오로이드. 스스로를 싸이클롭스 프린세스라 부르는 강력한 경장 공격수.',
    },
    pupphead: {
      name: '펍 헤드', full: 'SD-3M 펍 헤드', rig: 'pupphead', icon: 'c_PECS_PuppHead_N', face: '', sfx: 'gun',
      kind: 'cav', move: 'horse', rng: 1,
      tiers: [
        { cls: '경찰·헌병 로봇', hp: 87, at: 20, df: 15, mov: 5, troops: ['raider', 'guard'], skills: ['siren'] },
        { cls: '기동 순찰대', hp: 101, at: 23, df: 17, mov: 5, troops: ['raider', 'guard'], skills: ['siren', 'arrest'] },
        { cls: '특수기동대장', hp: 115, at: 27, df: 20, mov: 5, troops: ['raider', 'guard', 'flyer'], skills: ['siren', 'arrest'] },
      ],
      bio: '구조 신호를 보낸 AGS 경찰 로봇. 빠른 발로 적진을 흔들고 아군의 공격을 북돋습니다.',
    },
    fallen: {
      name: '폴른', full: 'CT2199W 폴른', rig: 'fallen', icon: 'c_AGS_Fallen_N', face: '', sfx: 'cannon',
      kind: 'arch', move: 'foot', rng: 2,
      tiers: [
        { cls: '지원 포격 AGS', hp: 97, at: 27, df: 13, mov: 3, troops: ['gunner', 'shield'], skills: ['barrage'] },
        { cls: '중포병', hp: 110, at: 31, df: 15, mov: 3, troops: ['gunner', 'shield'], skills: ['barrage'] },
        { cls: '요새 포대', hp: 126, at: 36, df: 18, mov: 3, troops: ['gunner', 'shield', 'guard'], skills: ['barrage'] },
      ],
      bio: '언어 모듈이 고장 난 AGS 포격 로봇. 사거리 2의 포격과 넓은 범위 포격 특기를 씁니다.',
    },
  };
  const TIER_LV = [1, 5, 10];
  const MAX_LV = 20;

  // ── 철충 (영웅 자리에 서는 개체 + 거느린 병사) ─────────
  const ENEMIES = {
    chick: { name: '나이트 칙', rig: 'e_NightChick_N', icon: 'e_NightChick_N', kind: 'inf', move: 'foot', rng: 1, hp: 44, at: 13, df: 8, mov: 3, troop: 'e_chick', sfx: 'gun' },
    launcher: { name: '나이트 칙 런처', rig: 'e_NightChickM_N', icon: 'e_NightChickM_N', kind: 'arch', move: 'foot', rng: 2, hp: 38, at: 14, df: 6, mov: 3, troop: 'e_launcher', sfx: 'cannon' },
    shielder: { name: '나이트 칙 실더', rig: 'e_NightChickS_N', icon: 'e_NightChickS_N', kind: 'pike', move: 'foot', rng: 1, hp: 58, at: 10, df: 16, mov: 3, troop: 'e_shielder', sfx: 'gun' },
    bigchick: { name: '빅 칙', rig: 'e_BigChick_N', icon: 'e_BigChick_N', kind: 'pike', move: 'foot', rng: 1, hp: 130, at: 19, df: 18, mov: 3, troop: 'e_chick', skills: ['shell'], big: true, sfx: 'cannon' },
    stalker: { name: '스토커', rig: 'e_Stalker_B0108', icon: 'e_Stalker_B0108', kind: 'arch', move: 'foot', rng: 3, hp: 210, at: 26, df: 17, mov: 3, troop: null, skills: ['snipe'], big: true, sfx: 'laserBig' },
  };

  // ── 스테이지: 본작 1지역 「지구의 마지막 인간」 ─────────
  // waves: 적 무리. turn = 나타나는 턴(1 = 처음부터, 그 뒤는 적 차례에 증원). 증원 전에 적을 다 잡으면 승리
  // 적 레벨은 본작 스테이지 편성 그대로.
  const C = (t, lv) => [t, lv];
  const STAGES = [
    {
      id: 1, idx: '1-1', title: '비상 상황', bgm: 'battle', goal: '철충 전멸', lose: '콘스탄챠 퇴각', win: 'all',
      heroes: ['constantia', 'griffon'],
      map: [
        '##ss..s..sss',
        '#s....rr..s#',
        's..s..r...ss',
        '...ss.r.s..s',
        '.r.rrrrrrr..',
        '.rr..s.r....',
        's..s..sr..s.',
        'ss....sr.ss#',
        '#ss..s.r..s#',
        '##s...sss###',
      ],
      starts: [[1, 5], [2, 3]],
      waves: [{ turn: 1, at: [9, 4], units: [C('launcher', 1), C('launcher', 2), C('launcher', 1), C('launcher', 1)] }],
    },
    {
      id: 2, idx: '1-2', title: '등대로!', bgm: 'battle', goal: '철충 전멸', lose: '콘스탄챠 퇴각', win: 'all',
      heroes: ['constantia', 'griffon', 'johanna'],
      map: [
        '...ff..r.www',
        '..fff..r.www',
        '.f.....r..ww',
        '.......rr.ww',
        '..hh....r.ww',
        '..hh....r..w',
        '.....s..r..w',
        '....ss..rr.w',
        '..f......r.w',
        '.fff.....r.w',
        '..f......r..',
        '.........r..',
      ],
      starts: [[8, 11], [10, 10], [9, 10]],
      waves: [{ turn: 1, at: [7, 2], units: [C('chick', 2), C('launcher', 2), C('chick', 2), C('chick', 2), C('launcher', 2)] }],
    },
    {
      id: 3, idx: '1-3', title: '등대 아래 비밀기지', bgm: 'battle2', night: true, goal: '철충 전멸', lose: '콘스탄챠 퇴각', win: 'all',
      heroes: ['constantia', 'griffon', 'johanna'],
      map: [
        'mm....cc..mm',
        'm....cccc..m',
        'm.....cc...m',
        '...ff..r...h',
        '..fff..r..hh',
        '.......r....',
        '.hh....rr...',
        '.h......r...',
        '....ff..r.ff',
        '...fff..r.f.',
        'm.......r...',
        'mm.s.s..r..m',
        'mmss#s..r.mm',
        'mmm#s#s.r.mm',
      ],
      starts: [[8, 12], [7, 13], [9, 13]],
      waves: [
        { turn: 1, at: [7, 6], units: [C('chick', 3), C('chick', 3), C('launcher', 3), C('launcher', 3)] },
        { turn: 3, at: [6, 1], units: [C('launcher', 3), C('shielder', 2), C('chick', 3), C('chick', 3), C('launcher', 3)] },
      ],
    },
    {
      id: 4, idx: '1-4', title: '구조 신호', bgm: 'battle', goal: '철충 전멸', lose: '콘스탄챠 퇴각', win: 'all',
      heroes: ['constantia', 'griffon', 'johanna', 'lrl'],
      map: [
        'ss..ss...rr..s',
        's....s..rr...s',
        '..##....r..##.',
        '..##..s.r..##.',
        '.......rr.....',
        '.s..rrrr...s..',
        '....r....ss...',
        '.ss.r.##......',
        '....r.##..s...',
        '..rrr.....ss..',
        '..r.....s.....',
        '..r...........',
      ],
      starts: [[2, 11], [3, 10], [1, 10], [3, 11]],
      waves: [
        { turn: 1, at: [9, 7], units: [C('chick', 4), C('launcher', 6), C('chick', 4), C('chick', 4)] },
        { turn: 3, at: [8, 2], units: [C('shielder', 4), C('bigchick', 4), C('chick', 4)] },
      ],
    },
    {
      id: 5, idx: '1-5', title: '동맹의 조건', bgm: 'battle2', goal: '철충 전멸', lose: '콘스탄챠 퇴각', win: 'all',
      heroes: ['constantia', 'griffon', 'johanna', 'lrl', 'pupphead'],
      map: [
        'ff..ff...ss.ff',
        'f....f..s#s..f',
        '..ff....s.s...',
        '.fff..h....hh.',
        '......hh.....f',
        '..r.......ff..',
        '..rrrr....ff..',
        '.....rr.......',
        '.hh...r..ff...',
        '.h....r..fff..',
        '....ff.r......',
        '...fff.r...hh.',
        'f......r....h.',
        'ff.....r.....f',
      ],
      starts: [[7, 13], [6, 12], [8, 12], [5, 13], [9, 13]],
      waves: [
        { turn: 1, at: [7, 7], units: [C('shielder', 5), C('launcher', 7), C('shielder', 5), C('chick', 6), C('chick', 6)] },
        { turn: 3, at: [3, 3], units: [C('shielder', 6), C('chick', 6), C('launcher', 6), C('shielder', 6), C('chick', 6)] },
        { turn: 5, at: [10, 2], units: [C('shielder', 3), C('launcher', 7), C('shielder', 4), C('chick', 6), C('shielder', 3), C('launcher', 7)] },
      ],
    },
    {
      id: 6, idx: '1-6', title: '미끼', bgm: 'battle', goal: '철충 전멸', lose: '콘스탄챠 퇴각', win: 'all',
      heroes: ['constantia', 'griffon', 'johanna', 'lrl', 'pupphead', 'fallen'],
      map: [
        'wwwwww..wwwwww',
        'www.......wwww',
        'ww..ss.....www',
        'w...s#s..h..ww',
        'w..........hww',
        'ww...ff.....ww',
        'www..fff...www',
        'wwww...r..wwww',
        'wwwwww=wwwwwww',
        'wwwwww=wwwwwww',
        'www...r....www',
        'ww...rr..ff.ww',
        'w....r...fff.w',
        'w....r.......w',
      ],
      starts: [[5, 13], [6, 12], [4, 12], [7, 13], [3, 13], [6, 11]],
      // 섬의 미끼 부대 → 섬 안쪽 → 다리 건너 뒤쪽에서 포위 (본작: 미끼에 걸려 포위당함)
      waves: [
        { turn: 1, at: [6, 4], units: [C('shielder', 6), C('chick', 7), C('shielder', 6), C('shielder', 6), C('chick', 7)] },
        { turn: 3, at: [8, 1], units: [C('chick', 8), C('shielder', 6), C('chick', 7), C('chick', 7)] },
        { turn: 5, at: [9, 12], units: [C('shielder', 8), C('chick', 8), C('launcher', 7), C('launcher', 8), C('shielder', 8), C('chick', 8)] },
      ],
    },
    {
      id: 7, idx: '1-7', title: '교살 밧줄', bgm: 'battle2', goal: '철충 전멸', lose: '콘스탄챠 퇴각 / 18턴 초과', win: 'all', turnLimit: 18,
      heroes: ['constantia', 'griffon', 'johanna', 'lrl', 'pupphead', 'fallen'],
      map: [
        's..ss....h..ss',
        '.....rr..hh...',
        '.ss..r........',
        '.....r..ss..f.',
        '..rrrr.....fff',
        '..r.....h...f.',
        '..r..s..hh....',
        '..r..ss.......',
        '..rr.....ss...',
        'w..rrrrr......',
        'ww...ccr...www',
        'wwww.cc.wwwwww',
      ],
      starts: [[5, 10], [6, 10], [5, 11], [6, 11], [4, 9], [7, 9]],
      waves: [
        { turn: 1, at: [10, 6], units: [C('chick', 7), C('launcher', 8), C('shielder', 8), C('launcher', 8), C('chick', 7), C('launcher', 8)] },
        { turn: 3, at: [3, 2], units: [C('shielder', 8), C('launcher', 8), C('shielder', 8), C('launcher', 9), C('launcher', 8), C('launcher', 8)] },
        { turn: 5, at: [11, 1], units: [C('launcher', 10), C('shielder', 10), C('launcher', 10), C('chick', 11), C('launcher', 10)] },
      ],
    },
    {
      id: 8, idx: '1-8', title: '위험한 미끼', bgm: 'boss', goal: '스토커 격파', lose: '콘스탄챠 퇴각', win: 'boss',
      heroes: ['constantia', 'griffon', 'johanna', 'lrl', 'pupphead', 'fallen'],
      map: [
        'wwwwwwwwww..ww',
        'wwwwwwww....hw',
        'wwwwww...hh..w',
        'wwww....hh...w',
        'ww....ff.....w',
        'w....fff..s..w',
        '....ff...ss...',
        '..........s...',
        '.ff..rr.......',
        'fff..r...ff...',
        '.f...r..fff...',
        '.....r........',
      ],
      starts: [[2, 11], [3, 10], [1, 10], [4, 11], [0, 11], [3, 11]],
      waves: [{ turn: 1, at: [11, 1], boss: 'stalker', units: [C('stalker', 13), C('chick', 12), C('shielder', 13), C('launcher', 12)] }],
    },
  ];

  (typeof window !== 'undefined' ? window : globalThis).DATA = { TERRAIN, KIND, REL, SKILLS, HEROES, TIER_LV, MAX_LV, TROOPS, ENEMIES, STAGES };
})();
