// 1장 전략 지도 (손으로 설계). tools/build_stagemaps.js 가 읽는다. 1-1·1-2 는 data.js 의 손 지도 그대로
// 글자: . 평지 r 도로 f 숲 h 언덕 m 산 w 물 = 다리 v 마을 c 기지 # 벽 s 폐허 x 지도 밖
// 산(m)은 지날 수 있는 거친 땅이라 길목을 막지 못한다. 막는 절벽·바위벽은 지도 밖(x)으로: cliff() 가 m 을 x 로 바꾼다
const cliff = (rows) => rows.map((r) => r.replace(/m/g, 'x'));
module.exports = {
  // 밤의 해안 절벽길을 올라 등대로. 절벽 길목 두 곳, 왼쪽 물가 샛길, 가운데 턱의 언덕
  '1-3': {
    tip: '절벽길 두 곳이 길목. 왼쪽 물가 샛길로 돌면 언덕의 런처를 옆에서 친다',
    map: cliff([
      'xxxxxmmmmmxxxx',
      'xxxxmmcccmmxxx',
      'xxxwm.ccc.mmxx',
      'xxwwh..r..hmxx',
      'xwww...r...mmx',
      'xwwm..rr..fmmx',
      'wwwmm.r..mmmmx',
      'wwwmmmr.mmmmmx',
      'wwwwmmrrmmmmxx',
      'wwww.mmr.mmmxx',
      'www...mr..hhmx',
      'www.f..r..hhmx',
      'ww..ff.r...hmx',
      'ww...f.rr...mx',
      'ww.s...mrm.fmx',
      'www..mmmrmmmmx',
      'wwww.mmmrrmmxx',
      'wwww..mm.r.mxx',
      'www.......r.mx',
      'ww.s...s..r..x',
      'ww.......rr..x',
      'xww.......r..x',
    ]),
    starts: [[6, 19], [5, 19], [7, 19], [6, 20], [5, 20], [7, 20], [4, 19], [8, 20]],
    waves: [
      { at: [10, 11], form: 'line', hold: true }, // 가운데 턱 언덕에 진을 친 런처
      { at: [7, 3], form: 'wedge' }, // 등대에서 절벽길로 쏟아져 내려온다
    ],
  },
  // 신호가 나는 폐허 광장. 드러난 큰길 vs 엄폐 많은 위·아래 골목, 골목 사이 틈은 좁다
  '1-4': {
    tip: '큰길은 빠르지만 광장의 런처에 다 보인다. 골목은 숨지만 증원이 숨어 있다',
    map: [
      'xxxx####xx####xxxxxx',
      'x....s##..##s.....#x',
      'x.ff.s....s....s..#x',
      '##.#####.####.###.#x',
      '...#xxx#.#xx#.#ss..x',
      'rrrrrrrrrrrrrrrrhcc.',
      'rrrrrrrrrrrrrrrrhcc.',
      '...#x#.#xx#.#x#ss..x',
      '##.###.####.####.##x',
      'x..s...s..f...s...#x',
      'x.ff..s....ss...f.#x',
      'xxxx##xx####xxxxxxxx',
    ],
    starts: [[1, 5], [0, 5], [1, 6], [0, 6], [2, 5], [2, 6], [1, 4], [1, 7]],
    waves: [
      { at: [17, 5], form: 'line', hold: true }, // 신호 나는 광장을 지킨다
      { at: [12, 1], at2: [12, 9], form: 'blob' }, // 위·아래 골목에서 협공
    ],
  },
  // 붙잡힌 기계들이 있는 곶의 철충 진지. 건너는 길은 외다리와 모래톱 둘뿐
  '1-5': {
    tip: '다리와 모래톱, 길목은 둘. 다리 앞 수비대를 사격으로 흔들고 건너라',
    map: [
      'xxxxxxwwwwwwwwwwwxxxxx',
      'xxxxwwwww.hhh.wwwwwxxx',
      'xxxwwww..cccc...wwwwxx',
      'xxwwww.f.cccc..f..wwwx',
      'xwwwww..h.rr.h.....wwx',
      'xwwww.f...r...f.s..wwx',
      'wwwww.....r.....s..www',
      'wwwwww.h..r...h....www',
      'wwwwwwwwww=wwwww.wwwww',
      'wwwwwwwwww=wwwww.wwwww',
      'www..s...rr....s..wwww',
      'ww...f...r.........www',
      'ww..ff..rr...ff.h..www',
      'ww.....rr.....f....wwx',
      'xww...rr...s.......wxx',
      'xxww..r.........wwwxxx',
    ],
    starts: [[5, 13], [6, 13], [4, 13], [5, 14], [4, 14], [6, 12], [3, 13], [7, 14]],
    waves: [
      { at: [10, 6], form: 'line', hold: true }, // 다리 건너편 수비대
      { at: [10, 3], form: 'wedge' }, // 진지 안에서 몰려나온다
      { at: [17, 11], at2: [13, 14], form: 'scatter' }, // 뒤쪽 해변 양쪽에서 기습
    ],
  },
  // 미끼가 되어 언덕으로 둘러싼 진지 한가운데. 북·동·남서 세 골짜기로 몰려온다
  '1-6': {
    tip: '언덕으로 둘러싼 진지에서 버틴다. 틈 네 곳을 막고 오는 쪽부터 끊어라',
    map: cliff([
      'xxxxxxxxmm.mmxxxxxxxx',
      'xxxxxxxmm...mmxxxxxxx',
      'xxxxxxmm..f..mmxxxxxx',
      'wwxxxmm...r...mmxxxxx',
      'wwwxmm.f..r..f..mmxxx',
      'wwwwm.....r.....mmmxx',
      'wwwwm..h..r..h....mmx',
      'wwwww...hhrhh.......m',
      'wwwww..h.....h..rrrrr',
      'wwwww..hr.c.rh.rr...m',
      'wwwww..h..c..h.....mm',
      'wwwww...hhrhh....mmmx',
      'wwwwm.....r.....mmxxx',
      'wwwmm..f..r..f.mmxxxx',
      'wwwm.....rr...mmxxxxx',
      'wwm.....rr...mmxxxxxx',
      'wwm..f.rr..mmxxxxxxxx',
      'ww....rr..mmxxxxxxxxx',
      'ww...rr..mmxxxxxxxxxx',
    ]),
    starts: [[10, 9], [9, 9], [11, 9], [10, 8], [10, 10], [9, 8], [11, 8], [9, 10]],
    waves: [
      { at: [10, 2], form: 'line' }, // 북쪽 골짜기
      { at: [18, 8], form: 'wedge' }, // 동쪽 길
      { at: [5, 17], at2: [19, 9], form: 'scatter' }, // 남서 비탈과 동쪽에서 동시에
    ],
  },
  // 해안 절벽길 요격. 가운데 바위 문(2칸)만이 동서를 잇는다. 서쪽 언덕은 사격 자리
  '1-7': {
    tip: '바위 문 하나가 유일한 길목. 문 앞을 막고 서쪽 언덕에서 쏴라 (제한 턴)',
    map: cliff([
      'xxxmmmmmmmmmmmmmmmmmmmmmxx',
      'xmm..hh..f.mmm..hh..f..mmx',
      'mm..h..f....mm...h..f....m',
      'm....h.......m.....h.....m',
      'm..........mmmm..........m',
      'rrrrrrrrrrrrrrrrrrrrrrrrrr',
      'rrrrrrrrrrrrrrrrrrrrrrrrrr',
      's....f....mmmmm....f.....s',
      'ww..s..f..wwmww..f...s..ww',
      'wwwwwwwwwwwwwwwwwwwwwwwwww',
    ]),
    starts: [[3, 5], [4, 5], [3, 6], [4, 6], [2, 5], [2, 6], [5, 5], [5, 6]],
    waves: [
      { at: [18, 5], form: 'line' }, // 문 동쪽에서 밀려온다
      { at: [21, 2], at2: [21, 8], form: 'wedge' }, // 동쪽 능선과 해변 둘로
      { at: [24, 5], form: 'wedge' }, // 엠퍼러 칙이 이끄는 본대
    ],
  },
  // 함정에 걸린 스토커. 바다 위 암초 요새로 가는 길은 외길 둑과 굽은 모래톱
  '1-8': {
    tip: '외길 둑은 스토커 사격 범위. 오른쪽 모래톱으로 돌아 들어가 협공',
    map: [
      'xwwwwwwwwwwwwwwwwx',
      'wwwwww.hcch.wwwwww',
      'wwwww..hcch..wwwww',
      'wwwww.f....f..wwww',
      'wwwwww..ss....wwww',
      'wwwwwww....ww.wwww',
      'wwwwwwwww=www..www',
      'wwwwwwwww=wwww..ww',
      'wwww.....r....w.ww',
      'www..f..rr..s....w',
      'ww..f...r....f..ww',
      'ww.....rr.......ww',
      'xww....r.....h..wx',
      'xxww...r.......wxx',
    ],
    starts: [[8, 11], [7, 11], [8, 12], [7, 12], [9, 11], [6, 11], [7, 13], [8, 10]],
    waves: [
      { at: [9, 2], form: 'ring' }, // 암초 요새 한가운데의 스토커
    ],
  },
};
