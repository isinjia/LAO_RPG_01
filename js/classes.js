// 전직 나무 (랑그릿사식): 기본 직업 → Lv5에 두 갈래(A 공격형 / B 수비형) 중 하나 → Lv10에 그 갈래의 상위 직업.
// 직업마다 원작 스킨 하나(SD: js/sd/<영웅>_<스킨>, 일러스트: js/sd/p_<영웅>_<스킨>, 아이콘: IMG.c_<모델>_<스킨>). 'N' = 기본 모습
// save.heroes[id] = { lv, exp, tier, br }  (br: 'A' | 'B', tier 0이면 없음)
(function () {
  const D = window.DATA;
  // [직업 이름, 스킨, 원작 스킨 이름]
  const TREE = {
    constantia: { A: [['오르카 호위대장', 'NS1', '전투수트 콘스탄챠'], ['근위총병', 'NS3', '당신만을 기다리는 근위총병']],
      B: [['정밀 사수', 'SS1', '안경을 벗은 콘스탄챠'], ['사령관의 그림자', 'NS2', '나이트 드레스 콘스탄챠']] },
    griffon: { A: [['강습 비행대장', 'SS1', '정찰용 그리폰'], ['하늘의 그리폰', 'NS2', '프로젝트 오르카: 그리폰']],
      B: [['의장 비행대', 'NS1', '예장복 그리폰'], ['오르카의 날개', 'NS3', '벌써 5년']] },
    johanna: { A: [['수호 기사', 'N', '기본'], ['수호성인', 'NS1', '수호성인 요안나']],
      B: [['성기사', 'NS1', '수호성인 요안나'], ['동방의 기사여왕', 'NS1', '수호성인 요안나']] },
    lrl: { A: [['심연의 공주', 'NS1', '고스로리 LRL'], ['싸이클롭스 프린세스', 'NS4', '빨간 모자 프린세스']],
      B: [['등대지기 소녀', 'NS2', '교대 복귀자 보급품 1호'], ['꿈을 이룬 소녀', 'NS3', '꿈을 이룬 소녀']] },
    pupphead: { A: [['기동 순찰대', 'N', '기본'], ['특수기동대장', 'N', '기본']],
      B: [['교통 통제반', 'N', '기본'], ['방범 지휘차', 'N', '기본']] },
    fallen: { A: [['중포병', 'N', '기본'], ['요새 포대', 'RV', '개량형 폴른']],
      B: [['지원 포대', 'N', '기본'], ['방공 포대', 'RV', '개량형 폴른']] },
    marie: { A: [['불굴의 군단장', 'NS3', '하계 전투복 마리'], ['블랙 리버의 장군', 'NS3', '하계 전투복 마리']],
      B: [['스틸라인 참모', 'NS1', '수줍은 고백'], ['스틸라인 사령관', 'NS1', '수줍은 고백']] },
    labiata: { A: [['바이오로이드의 맏언니', 'NS1', '한겨울의 만찬 라비아타'], ['라비아타 프로토타입', 'SS1', '본 모습을 찾은 라비아타']],
      B: [['휴가 중인 맏언니', 'NS3', '혼자만의 휴가'], ['눈 속에 피는 꽃', 'NS5', '눈 속에 피는 꽃']] },
    scathy: { A: [['사이버 워페어', 'NS1', '위험한 가족'], ['네트워크의 여왕', 'NS1', '위험한 가족']],
      B: [['드레스 훅 해커', 'NS2', '드림위버 모던 컬렉션'], ['모던 컬렉션 해커', 'NS2', '드림위버 모던 컬렉션']] },
    amy: { A: [['그림자 첩보원', 'NS1', '전투복 에이미'], ['레이저 에이전트', 'NS1', '전투복 에이미']],
      B: [['파랑새 첩보원', 'NS2', '드림위버 웨딩 스페셜: 파랑새'], ['웨딩 에이전트', 'NS2', '드림위버 웨딩 스페셜: 파랑새']] },
    coco: { A: [['마리 부대 방패', 'N', '기본'], ['불굴의 화이트 셸', 'NS1', '별의 수호자 스페이스 슈트']],
      B: [['별의 수호자', 'NS1', '별의 수호자 스페이스 슈트'], ['스타 차일드', 'NS1', '별의 수호자 스페이스 슈트']] },
  };
  // 갈래별 능력치 경향 (그 단계 기본 수치에 곱함)
  const K = { A: { hp: 1, at: 1.08, df: 0.96 }, B: { hp: 1.08, at: 0.96, df: 1.08 } };
  const BR_NAME = { A: '공격형', B: '수비형' };
  const STAND_BASE = { pupphead: 'PECS_PuppHead_N', fallen: 'AGS_Fallen_N' }; // 표정 그림이 없는 기계
  const modelOf = (id) => D.HEROES[id].face || (STAND_BASE[id] || '').replace(/_N$/, '_N');

  // 영웅 id, 단계, 갈래 -> 직업 마디 { tier, br, cls, skin, skinName }
  function node(id, tier, br) {
    const h = D.HEROES[id];
    if (!tier) return { tier: 0, br: '', cls: h.tiers[0].cls, skin: 'N', skinName: '기본' };
    const t = TREE[id] && TREE[id][br || 'A'];
    if (!t) return { tier, br: br || 'A', cls: h.tiers[tier].cls, skin: 'N', skinName: '기본' };
    const [cls, skin, skinName] = t[tier - 1];
    return { tier, br: br || 'A', cls, skin, skinName };
  }
  const cur = (id, s) => node(id, s.tier, s.br);
  // 그 단계·갈래의 능력치 (레벨마다 7%)
  function stats(id, s, tier = s.tier, br = s.br) {
    // rules.js R.heroStat 과 같은 식: 1레벨부터 이어지는 성장 × 전직 단계마다 6% × 갈래 경향
    const h = D.HEROES[id], t = h.tiers[tier], t0 = h.tiers[0], k = (1 + 0.07 * (s.lv - 1)) * (1 + 0.06 * tier), m = tier ? K[br || 'A'] : { hp: 1, at: 1, df: 1 };
    return { t, cls: node(id, tier, br).cls, hp: Math.round(t0.hp * k * m.hp), at: Math.round(t0.at * k * m.at), df: Math.round(t0.df * k * m.df), mov: t.mov };
  }
  // 다음 전직 후보: 기본 → A1·B1, 1단계 → 같은 갈래의 2단계
  function options(id, s) {
    if (s.tier >= 2) return [];
    if (s.tier === 0) return ['A', 'B'].map((br) => node(id, 1, br));
    return [node(id, 2, s.br || 'A')];
  }
  const canChange = (id, s) => s.tier < 2 && s.lv >= D.TIER_LV[s.tier + 1];
  // 그림 이름들
  const rigOf = (id, s) => { const n = cur(id, s); return n.skin === 'N' ? D.HEROES[id].rig : D.HEROES[id].rig + '_' + n.skin; };
  const iconOf = (id, s) => { const n = cur(id, s), ic = D.HEROES[id].icon; return n.skin === 'N' ? ic : ic.replace(/_N$/, '_' + n.skin); };
  // 일러스트(움직이는 일러스트 캔버스의 data-stand): 기본 모습이면 null (화면이 원래 쓰던 표정 그림)
  // 원작이 스파인·중첩 프리팹이라 일러스트를 못 만든 스킨: 일러스트는 기본 모습 (SD는 스킨)
  const NO_ART = new Set(['3P_Labiata_NS3', 'BR_Scathy_NS2', 'PECS_CoCoWhiteShell_NS1']);
  const standOfNode = (id, n) => { if (n.skin === 'N' || n.skin === 'RV') return null; const m = modelOf(id).replace(/_N$/, '_' + n.skin); return NO_ART.has(m) ? null : m; };
  const standOf = (id, s) => standOfNode(id, cur(id, s));
  // 일러스트 리그 목록 (js/portrait.js 가 그림 이름 -> 리그를 찾을 때)
  const PORTRAITS = {};
  for (const id in TREE) for (const br of ['A', 'B']) for (const [, skin] of TREE[id][br]) {
    if (skin === 'N' || skin === 'RV' || !D.HEROES[id]) continue;
    const m = modelOf(id).replace(/_N$/, '_' + skin);
    if (!NO_ART.has(m)) PORTRAITS[m] = 'p_' + id + '_' + skin;
  }

  window.CLASSES = { TREE, K, BR_NAME, node, cur, stats, options, canChange, rigOf, iconOf, standOf, standOfNode, PORTRAITS };
})();
