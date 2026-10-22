// 전직 나무 (랑그릿사식): 기본 직업 → Lv5에 두 갈래 중 하나 → Lv10에 그 갈래의 상위 직업.
// 직업마다 병종·이동 방식·이동력·사거리·배속 병사·특기가 통째로 바뀌고(보병이 기동병이 되는 식), 모습은 원작 스킨 하나
// (SD: js/sd/<영웅>_<스킨>, 일러스트: js/sd/p_<영웅>_<스킨>, 아이콘: IMG.c_<모델>_<스킨>). 'N' = 기본 모습
// save.heroes[id] = { lv, exp, tier, br }  (br: 'A' | 'B', tier 0이면 없음)
(function () {
  const D = window.DATA;
  // 병종별 기본 이동 방식·이동력·배속 병사, 능력치 경향 (직업 병종 경향 ÷ 원래 병종 경향을 곱한다)
  // 전자전병는 나이트 엔젤 전자전병, 침투병는 토모 검사 병사가 맨 앞 (그 병종 고유 병사)
  const KIND_FORM = {
    inf: { move: 'foot', mov: 3, troops: ['guard', 'shield', 'gunner'], m: { hp: 1.05, at: 1.05, df: 1.05 } },
    pike: { move: 'foot', mov: 3, troops: ['shield', 'guard', 'gunner'], m: { hp: 1.1, at: 0.95, df: 1.15 } },
    cav: { move: 'horse', mov: 5, troops: ['raider', 'guard', 'flyer'], m: { hp: 1.0, at: 1.1, df: 1.0 } },
    fly: { move: 'fly', mov: 5, troops: ['flyer', 'raider', 'gunner'], m: { hp: 0.95, at: 1.1, df: 0.95 } },
    arch: { move: 'foot', mov: 3, troops: ['gunner', 'guard', 'shield'], m: { hp: 0.95, at: 1.1, df: 0.95 } },
    mage: { move: 'foot', mov: 3, troops: ['hacker', 'gunner', 'flyer', 'guard'], m: { hp: 0.9, at: 1.18, df: 0.88 } },
    priest: { move: 'foot', mov: 3, troops: ['guard', 'shield', 'gunner'], m: { hp: 1.05, at: 0.95, df: 1.08 } },
    assassin: { move: 'foot', mov: 4, troops: ['blade', 'raider', 'flyer', 'gunner'], m: { hp: 0.92, at: 1.18, df: 0.9 } },
  };
  // [직업 이름, 스킨, 원작 스킨 이름, { kind 병종, rng 사거리, move·mov(병종 기본과 다를 때), add 더 배우는 특기, desc }]
  const TREE = {
    constantia: {
      A: [['오르카 호위대장', 'NS1', '전투수트 콘스탄챠', { kind: 'inf', rng: 1, mov: 4, add: ['cover'], desc: '총검을 들고 앞에 서는 보병. 사령관 곁을 지킨다' }],
        ['근위총병', 'NS3', '당신만을 기다리는 근위총병', { kind: 'arch', rng: 2, move: 'horse', mov: 5, add: ['cover'], desc: '말을 탄 근위 총병. 사격병이지만 기동병처럼 달린다' }]],
      B: [['정밀 사수', 'SS1', '안경을 벗은 콘스탄챠', { kind: 'arch', rng: 3, add: ['snipe'], desc: '사거리 3의 저격 사격병' }],
        ['사령관의 그림자', 'NS2', '나이트 드레스 콘스탄챠', { kind: 'assassin', rng: 2, add: ['snipe'], desc: '그림자처럼 움직이는 침투병' }]],
    },
    griffon: {
      A: [['강습 비행대장', 'SS1', '정찰용 그리폰', { kind: 'fly', rng: 1, mov: 6, desc: '이동 6의 강습 공중병' }],
        ['하늘의 그리폰', 'NS2', '프로젝트 오르카: 그리폰', { kind: 'fly', rng: 2, mov: 6, desc: '미사일로 사거리 2에서 치는 공중병' }]],
      B: [['의장 기동병', 'NS1', '예장복 그리폰', { kind: 'cav', rng: 1, desc: '땅에 내려 달리는 기동병. 보병에 강하다' }],
        ['오르카의 창', 'NS3', '벌써 5년', { kind: 'pike', rng: 1, mov: 4, desc: '기동병을 막아서는 중장병' }]],
    },
    johanna: {
      A: [['수호 기사', 'N', '기본', { kind: 'cav', rng: 1, desc: '말을 탄 기사. 보병을 짓밟는다' }],
        ['수호성인', 'NS1', '수호성인 요안나', { kind: 'priest', rng: 1, add: ['repair'], desc: '아군을 치료하는 의무병' }]],
      B: [['성기사', 'NS1', '수호성인 요안나', { kind: 'pike', rng: 1, desc: '방패를 굳힌 중장병' }],
        ['동방의 기사여왕', 'NS1', '수호성인 요안나', { kind: 'cav', rng: 1, mov: 6, desc: '이동 6의 기사여왕' }]],
    },
    lrl: {
      A: [['심연의 공주', 'NS1', '고스로리 LRL', { kind: 'mage', rng: 2, desc: '빔을 쏘는 전자전병. 사거리 2' }],
        ['싸이클롭스 프린세스', 'NS4', '빨간 모자 프린세스', { kind: 'mage', rng: 3, desc: '사거리 3의 전자전병' }]],
      B: [['등대지기 소녀', 'NS2', '교대 복귀자 보급품 1호', { kind: 'pike', rng: 1, desc: '단단한 중장병' }],
        ['꿈을 이룬 소녀', 'NS3', '꿈을 이룬 소녀', { kind: 'cav', rng: 1, desc: '달려드는 기동병' }]],
    },
    pupphead: {
      A: [['기동 순찰대', 'N', '기본', { kind: 'cav', rng: 1, mov: 6, desc: '이동 6의 순찰 기동병' }],
        ['특수기동대장', 'N', '기본', { kind: 'cav', rng: 1, mov: 6, add: ['command'], desc: '아군을 이끄는 기동대장' }]],
      B: [['교통 통제반', 'N', '기본', { kind: 'pike', rng: 1, desc: '길을 막는 중장병' }],
        ['방범 지휘차', 'N', '기본', { kind: 'arch', rng: 2, desc: '사거리 2로 사격하는 지휘차' }]],
    },
    fallen: {
      A: [['중포병', 'N', '기본', { kind: 'arch', rng: 3, mov: 2, desc: '사거리 3, 이동 2의 중포' }],
        ['요새 포대', 'RV', '개량형 폴른', { kind: 'arch', rng: 4, mov: 2, desc: '사거리 4의 요새 포대' }]],
      B: [['지원 포대', 'N', '기본', { kind: 'arch', rng: 2, mov: 4, desc: '이동 4의 기동 포대' }],
        ['대공 포대', 'RV', '개량형 폴른', { kind: 'arch', rng: 3, mov: 4, desc: '공중병을 떨어뜨리는 기동 포대' }]],
    },
    marie: {
      A: [['불굴의 군단장', 'NS3', '하계 전투복 마리', { kind: 'inf', rng: 1, desc: '앞장서는 보병 지휘관' }],
        ['블랙 리버의 장군', 'NS3', '하계 전투복 마리', { kind: 'cav', rng: 1, desc: '기동병을 이끄는 장군' }]],
      B: [['스틸라인 참모', 'NS1', '수줍은 고백', { kind: 'mage', rng: 2, desc: '위성을 유도하는 전자전병형 참모' }],
        ['위성 사령관', 'NS1', '수줍은 고백', { kind: 'mage', rng: 3, desc: '사거리 3의 위성 사령관' }]],
    },
    labiata: {
      A: [['바이오로이드의 맏언니', 'NS1', '한겨울의 만찬 라비아타', { kind: 'inf', rng: 1, mov: 4, desc: '이동 4의 보병' }],
        ['라비아타 프로토타입', 'SS1', '본 모습을 찾은 라비아타', { kind: 'cav', rng: 1, desc: '돌진하는 기동병' }]],
      B: [['휴가 중인 맏언니', 'NS3', '혼자만의 휴가', { kind: 'pike', rng: 1, desc: '든든한 중장병' }],
        ['눈 속에 피는 꽃', 'NS5', '눈 속에 피는 꽃', { kind: 'priest', rng: 1, add: ['repair'], desc: '치료하는 의무병' }]],
    },
    scathy: {
      A: [['사이버 워페어', 'NS1', '위험한 가족', { kind: 'mage', rng: 3, desc: '사거리 3의 해커' }],
        ['네트워크의 여왕', 'NS1', '위험한 가족', { kind: 'mage', rng: 3, mov: 4, desc: '이동 4, 사거리 3' }]],
      B: [['드레스 훅 해커', 'NS2', '드림위버 모던 컬렉션', { kind: 'assassin', rng: 2, desc: '파고드는 침투병' }],
        ['모던 컬렉션 해커', 'NS2', '드림위버 모던 컬렉션', { kind: 'assassin', rng: 2, mov: 5, desc: '이동 5의 침투병' }]],
    },
    amy: {
      A: [['그림자 첩보원', 'NS1', '전투복 에이미', { kind: 'assassin', rng: 2, desc: '숨어 쏘는 침투병' }],
        ['레이저 에이전트', 'NS1', '전투복 에이미', { kind: 'assassin', rng: 2, mov: 5, desc: '이동 5의 침투병' }]],
      B: [['파랑새 첩보원', 'NS2', '드림위버 웨딩 스페셜: 파랑새', { kind: 'cav', rng: 1, mov: 6, desc: '이동 6의 기동병' }],
        ['파랑새', 'NS2', '드림위버 웨딩 스페셜: 파랑새', { kind: 'fly', rng: 1, mov: 6, desc: '하늘을 나는 공중병' }]],
    },
    coco: {
      A: [['마리 부대 방패', 'N', '기본', { kind: 'pike', rng: 1, desc: '방패 중장병' }],
        ['불굴의 화이트 셸', 'NS1', '별의 수호자 스페이스 슈트', { kind: 'pike', rng: 1, mov: 4, desc: '이동 4의 중장 중장병' }]],
      B: [['별의 수호자', 'NS1', '별의 수호자 스페이스 슈트', { kind: 'fly', rng: 1, desc: '우주복으로 나는 공중병' }],
        ['스타 차일드', 'NS1', '별의 수호자 스페이스 슈트', { kind: 'fly', rng: 2, desc: '사거리 2의 공중병' }]],
    },
  };
  const STAND_BASE = { pupphead: 'PECS_PuppHead_N', fallen: 'AGS_Fallen_N' }; // 표정 그림이 없는 기계
  const modelOf = (id) => D.HEROES[id].face || STAND_BASE[id] || '';
  const uniq = (a) => [...new Set(a)];

  // 영웅 id, 단계, 갈래 -> 직업 { tier, br, cls, skin, skinName, kind, move, rng, mov, troops, skills, m, desc }
  function node(id, tier, br) {
    const h = D.HEROES[id], t = h.tiers[tier || 0];
    const base = { tier: tier || 0, br: tier ? br || 'A' : '', cls: t.cls, skin: 'N', skinName: '기본', kind: h.kind, move: h.move, rng: h.rng, mov: t.mov,
      troops: t.troops, skills: t.skills, m: { hp: 1, at: 1, df: 1 }, desc: '' };
    const row = tier && TREE[id] && TREE[id][br || 'A'] && TREE[id][br || 'A'][tier - 1];
    if (!row) return base;
    const [cls, skin, skinName, f] = row;
    const KF = KIND_FORM[f.kind], K0 = KIND_FORM[h.kind] || KF;
    // 병사: 그 병종이 데리는 병사 두 종류, 상위 직업은 하나 더
    const troops = KF.troops.slice(0, tier + 1).filter((k) => D.TROOPS[k]);
    return Object.assign(base, {
      cls, skin, skinName, kind: f.kind, move: f.move || KF.move, rng: f.rng, mov: f.mov || KF.mov,
      troops: troops.length ? troops : t.troops, skills: uniq(t.skills.concat(f.add || [])).filter((k) => D.SKILLS[k]),
      m: { hp: KF.m.hp / K0.m.hp, at: KF.m.at / K0.m.at, df: KF.m.df / K0.m.df }, desc: f.desc || '',
    });
  }
  const cur = (id, s) => node(id, s.tier, s.br);
  // 그 단계·갈래의 능력치: rules.js R.heroStat 과 같은 식 (1레벨부터 이어지는 성장 × 전직 단계마다 6% × 직업 병종 경향)
  function stats(id, s, tier = s.tier, br = s.br) {
    const h = D.HEROES[id], n = node(id, tier, br), t0 = h.tiers[0], k = (1 + 0.07 * (s.lv - 1)) * (1 + 0.06 * (tier || 0));
    return { t: n, cls: n.cls, hp: Math.round(t0.hp * k * n.m.hp), at: Math.round(t0.at * k * n.m.at), df: Math.round(t0.df * k * n.m.df), mov: n.mov, rng: n.rng, kind: n.kind };
  }
  // 다음 전직 후보: 기본 → 갈래 A·B 첫 직업, 1단계 → 같은 갈래의 2단계
  function options(id, s) {
    if (s.tier >= 2) return [];
    if (s.tier === 0) return ['A', 'B'].map((br) => node(id, 1, br));
    return [node(id, 2, s.br || 'A')];
  }
  const canChange = (id, s) => s.tier < 2 && s.lv >= D.TIER_LV[s.tier + 1];
  // 그림 이름들
  const rigOf = (id, s) => { const n = cur(id, s); return n.skin === 'N' ? D.HEROES[id].rig : D.HEROES[id].rig + '_' + n.skin; };
  const iconOf = (id, s) => { const n = cur(id, s), ic = D.HEROES[id].icon; return n.skin === 'N' ? ic : ic.replace(/_N$/, '_' + n.skin); };
  // 원작이 스파인·중첩 프리팹이라 일러스트를 못 만든 스킨: 일러스트는 기본 모습 (SD는 스킨)
  const NO_ART = new Set(['3P_Labiata_NS3', 'BR_Scathy_NS2', 'PECS_CoCoWhiteShell_NS1']);
  // 일러스트(움직이는 일러스트 캔버스의 data-stand): 기본 모습이면 null (화면이 원래 쓰던 표정 그림)
  const standOfNode = (id, n) => { if (n.skin === 'N' || n.skin === 'RV') return null; const m = modelOf(id).replace(/_N$/, '_' + n.skin); return NO_ART.has(m) ? null : m; };
  const standOf = (id, s) => standOfNode(id, cur(id, s));
  // 일러스트 리그 목록 (js/portrait.js 가 그림 이름 -> 리그를 찾을 때)
  const PORTRAITS = {};
  for (const id in TREE) for (const br of ['A', 'B']) for (const [, skin] of TREE[id][br]) {
    if (skin === 'N' || skin === 'RV' || !D.HEROES[id]) continue;
    const m = modelOf(id).replace(/_N$/, '_' + skin);
    if (!NO_ART.has(m)) PORTRAITS[m] = 'p_' + id + '_' + skin;
  }

  window.CLASSES = { TREE, KIND_FORM, node, cur, stats, options, canChange, rigOf, iconOf, standOf, standOfNode, PORTRAITS };
})();
