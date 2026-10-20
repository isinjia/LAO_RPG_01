# 오르카 전기 (프로토타입)

라스트오리진 에셋과 **본작 메인 스토리**로 만든 **랑그릿사 모바일식 전술 시뮬레이션 RPG**. 빌드 과정 없는 HTML/CSS/JS이며,
지도와 전투 연출은 three.js(r128, `js/vendor`)로, 캐릭터는 5_LAO_Defence의 SD 리그 재생기(`js/sd.js`)로
원작 Unity 프리팹·클립을 그대로 재생합니다. 모바일 세로·가로, PC 모두 지원합니다.

현재 수록: **1지역 「지구의 마지막 인간」 1-1 ~ 1-8** (본작 대본·선택지·배경·컷 그림·적 편성 그대로).

## 실행

`게임 실행.bat` 더블클릭 (Python 3 필요) 또는

```
python tools/serve.py 8795
```
→ http://localhost:8795

## 게임 방식 (랑그릿사 모바일식)

랑그릿사 모바일의 전투 규칙을 뼈대로 하고 라스트오리진 캐릭터·스토리를 입혔다. 규칙 근거는 운영사 공식 전투 규칙 글, 일본 공략 위키(게임위드), 영어 팬 위키, 나무위키(영어 번역판).

- **부대 = 영웅 1 + 병사 10명**: 지도 위 한 칸에 한 부대. 공격받으면 병사가 먼저 쓰러지고, 병사가 전멸하면 영웅이 맞는다.
  영웅이 쓰러지면 부대 전체 퇴각. 병사는 남은 인원 수만큼만 공격한다.
- **병종 (랑그릿사 모바일)**: 보병·창병·기병·비병·궁병 (+승려·마물·수병·법사·암살자 자리).
  라스트오리진 배정 — 영웅: 콘스탄챠 궁병, 그리폰 비병, 요안나 창병, LRL 보병, 펍 헤드 기병, 폴른 궁병 /
  병사: 브라우니 보병, 노움 창병, 실피드 기병, 레프리콘 궁병, 하르페이아 비병 / 철충: 나이트 칙 보병, 런처 궁병, 실더 창병.
- **상성**: 보병 ▶ 창병 ▶ 기병 ▶ 보병 +30%, 궁병 ▶ 비병 +40%, 승려 ▶ 마물 +80%. 그 밖에는 상성 없음.
  병사는 병사 병종, 영웅은 영웅 병종으로 따진다. 피해 = 공격 x 상성 x 공/(공+방) x 1.1.
- **원거리**: 궁병은 사거리 2. 두 칸에서 쏘면 근접 부대는 반격하지 못한다. 원거리 병종이 붙어서 싸우면 피해 30%.
- **이동력**: 영웅과 병사 중 낮은 쪽. 지형 비용·방어는 랑그릿사 모바일 지형표 기준 (숲 +20%, 산 +10% 등, 비병은 지형 무시). 적과 맞닿아도 멈추지 않고, 적 칸만 지나갈 수 없다.
- **병사 배속**: 출격 전에 영웅마다 병사를 고른다. 고를 수 있는 병사는 영웅·전직 단계마다 다르다. 병사 능력치는 영웅 레벨과 영웅 공방의 25%로 오른다.
- **특기**: 재사용 대기 턴 방식 (예: 콘스탄챠 긴급 수리 3턴, LRL 싸이클롭스 빔 4턴).
- **적의 움직임 (낚기)**: 적은 아군이 자기 공격 범위에 들어와야 움직인다. 본작 스테이지의 웨이브는 정해진 턴(3턴·5턴)의 증원으로 옮겼고, 그 전에 적을 다 잡으면 승리. 1-8은 스토커 격파.
- **성장**: 전투가 끝나면 참가 영웅 전원이 같은 경험치를 받는다(패배 시 절반). 경험치 100마다 레벨업, Lv5·Lv10에서 전직 (전직 갈래는 다음 단계에서 랑그릿사식으로 바꿀 예정).
- **자동 전투**: 상단 「자동」. 진행 상황은 브라우저 저장소에 저장된다.

## 조작

| 입력 | 동작 |
|---|---|
| 누르기 / 클릭 | 선택 · 이동 · 공격 (빨간 범위의 적을 누르면 알맞은 칸으로 다가가 공격) |
| 끌기 / 두 손가락 / 휠 | 지도 이동 · 확대 |
| 오른쪽 클릭 · Esc · X | 취소 (아무것도 선택하지 않았을 때 Esc는 메뉴) |
| 방향키 + Enter | 커서 이동 · 결정 |
| E / D / Q | 턴 종료 / 적 위험 범위 / 자동 전투 |

## 구성

| 파일 | 내용 |
|---|---|
| `js/data.js` | 지형, 상성, 특기, 영웅 6명(콘스탄챠·그리폰·요안나·LRL·펍 헤드·폴른, 전직 3단계), 배속 병사, 철충, 스테이지 8개 |
| `js/rules.js` | 이동 범위·지배 영역, 영웅+병사 전투 계산, 특기, 경험치, 적 무리, 승패, 적 판단 — 화면과 무관 (node에서도 실행) |
| `js/game.js` | 지도 3D 판, 유닛 표시(영웅+병사 2명, 체력 막대 두 줄), 입력, 차례 진행, 대화(선택지), 화면들 |
| `js/battle.js` | 전투 연출: 영웅이 앞, 병사가 뒤. 타격 시점마다 병사가 먼저 쓰러짐 |
| `js/talk.js` | 원작 노벨 대화창: 배경 교차 전환, 인물 등장·퇴장 효과, 장소 자막, 화면 효과·덧붙임 효과(소리), AUTO / FAST / SKIP / HISTORY |
| `css/lo.css` | 원작 화면 모양: 대화, 작전 선택(3D 지역 지도), 출격 준비(편성 화면), 결과(MISSION COMPLETE), 불러오기·화면 전환·확인 창 |
| `js/story.js` | 본작 대본 (`tools/build_story.py`로 생성, 연출 값 포함) |
| `js/world.js` | 지역 지도 위 작전 지점 (`tools/build_world.py`로 생성) |
| `js/sd/*` | 변환된 리그 |
| `assets/story/` | 대화 배경·컷 그림·표정 얼굴 (원본 텍스처에서 변환) |

## 본작 스토리 추출

원본: `E:\LAO\1_Onestre_QA` — 대사 행은 `Assets/AssetBundleResource/Table/Table_DialogScript/DG_*.bin.bytes`
(DES-CBC 암호화 + .NET BinaryFormatter, `tools/nrbf.py`가 해석), 문장·스테이지·적 편성은 `Assets/LastOneTable/LoJson.js.bytes`.

1. `python tools/extract_story.py Ch01` → `tools/story_ch01.json`, 읽기용 `tools/story_ch01.txt` (처음 한 번 마스터 표 캐시 생성)
2. `python tools/build_story.py ch01` → `js/story.js`, `assets/story/*`, 초상화를 `js/assets.js`에 합침
3. 새 지역은 `js/data.js`의 `STAGES`에 지도·출격 인원·무리를 추가 (적 레벨은 `story_<ch>.txt`의 편성을 따른다)

## 원작 화면·소리 자원

- UI 조각: `python tools/extract_ui.py <아틀라스>` → `tools/ui_src`, 쓰는 것만 `python tools/copy_ui.py` → `assets/ui`
- 지역 지도: `python tools/unity_ref/setup_worldmap.py` → 유니티 `-executeMethod RefWorldMap.Run` (그래픽 켠 채로) → `python tools/build_world.py`
- 대화 전신 그림·컷 그림: `tools/unity_ref/setup_portrait.py` → `RefPortrait.Run` (컷 그림은 프리팹 안 좌우 반전을 되돌림)
- 배경음·효과음·타이틀 콜·인물 음성(합류·출격 선택·편성·작전 개시·최우수·퇴각)·글꼴: `python tools/build_media.py`

## 캐릭터 추가 (SD 리그)

변환 도구를 이 프로젝트로 옮겨 두었다 (`tools/build_sd.py`, `tools/unity_ref/`). `UNITS` / `ENEMIES`에 추가한 뒤:

```
python tools/unity_ref/setup.py <id> ...
cp tools/unity_ref/Mesh.cs tools/unity_ref/proj/Assets/Editor/RefMesh.cs
"C:/Program Files/Unity/Hub/Editor/6000.0.58f2/Editor/Unity.exe" -batchmode -nographics -quit -projectPath <절대경로>/tools/unity_ref/proj -executeMethod RefMesh.Run -logFile <절대경로>/tools/unity_ref/mesh.log
python tools/build_sd.py <id>
python tools/build_events.py
```

확인: `sdlab.html?ids=<id>` (깨진 부위 수 표시). 유니티 참조 프로젝트(`tools/unity_ref/proj`)는 저장소에 넣지 않는다.

## 시험

`node tools/sim.js`: 지도·배치 검사와 대표 전투 예상치.
창이 숨겨져 화면 갱신이 멈춘 상태에서도 시험할 수 있게, 게임 안의 모든 기다림은 화면 갱신 시계를 따른다.
콘솔에서 `GAME.run(초)`로 시간을 진행하고 `GAME.shot('이름')`으로 한 장 찍어 `tools/lab/out/`에 저장한 뒤
`python tools/shot.py 이름`으로 그림 파일을 얻는다.
