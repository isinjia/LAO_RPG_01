// 4장 전략 지도 (손으로 설계). tools/build_stagemaps.js 가 읽는다. 지도 생각은 tools/maps 아래 설계 메모 대신 각 작전 tip 과 아래 주석
module.exports = {
 "4-1": {
  "tip": "양쪽 턱의 저격수가 골짜기를 노린다. 비탈로 턱을 먼저 잡고 굴 입구로",
  "map": [
   "xxxxxxxxxxxxxxxxxxxx",
   "xxxxxxxxm..mxxxxxxxx",
   "xxxmmmmmm..mmmmmmxxx",
   "xxxmhhhmmrrmmhhhmxxx",
   "xxxmffh..rr..hffmxxx",
   "xxxmffh..rr..hffmxxx",
   "xxxmhhh..rr..hhhmxxx",
   "xxxmhh...rr.fhhhmxxx",
   "xxxmhh...rr.fhhhmxxx",
   "xxxmhhh..rr..hhhmxxx",
   "xxxmhhhf.rr..hhhmxxx",
   "xxmmhhhf.rr..hhhmmxx",
   "xxmffff..rr......mxx",
   "xxmffff..rr......mxx",
   "xxmmmm...........mxx",
   "xxxxxm........mmmmxx",
   "xxxxxm........mxxxxx",
   "xxxxxxxxxxxxxxxxxxxx"
  ],
  "starts": [
   [
    7,
    15
   ],
   [
    8,
    15
   ],
   [
    9,
    15
   ],
   [
    10,
    15
   ],
   [
    11,
    15
   ],
   [
    12,
    15
   ],
   [
    9,
    16
   ],
   [
    10,
    16
   ]
  ],
  "waves": [
   {
    "at": [
     10,
     7
    ],
    "form": "scatter"
   },
   {
    "at": [
     10,
     3
    ],
    "form": "line"
   },
   {
    "at": [
     5,
     5
    ],
    "at2": [
     15,
     5
    ],
    "form": "blob",
    "hold": true
   }
  ]
 },
 "4-2": {
  "tip": "물길을 건널 곳은 좁은 다리뿐. 다리 끝을 잡고 하나씩 건너자",
  "map": [
   "xxxxxxxxxxxxxxxxxxxxxxxxxx",
   "xx......sss......ff...ccc.",
   "xx......sss......ff...ccc.",
   "wwwwww=wwwwwwww=wwwwww=www",
   "rrrrrrrrrrrrrrrrrrrrrrrrrr",
   "x..ff.......m.......ff...x",
   "x...........m............x",
   "wwwwwwwwww=wwwwwww=wwwwwww",
   "......ff........m...ss....",
   "......ff........m.........",
   "wwww=wwwwwwwww=wwwwwwww=ww",
   ".........sss......ff....xx",
   ".........sss............xx",
   "xxxxxxxxxxxxxxxxxxxxxxxxxx"
  ],
  "starts": [
   [
    1,
    8
   ],
   [
    2,
    8
   ],
   [
    3,
    8
   ],
   [
    1,
    9
   ],
   [
    2,
    9
   ],
   [
    3,
    9
   ],
   [
    4,
    8
   ],
   [
    4,
    9
   ]
  ],
  "waves": [
   {
    "at": [
     12,
     5
    ],
    "form": "scatter"
   },
   {
    "at": [
     22,
     4
    ],
    "form": "line",
    "hold": true
   },
   {
    "at": [
     19,
     11
    ],
    "form": "wedge"
   }
  ]
 },
 "4-3": {
  "tip": "신호기 단의 방패 무리는 버틴다. 넓은 홀을 휘젓는 말벌·기동 철충은 복도 입구에서 끊자",
  "map": [
   "xxxxxxxxxxrrxxxxxxxxxx",
   "xxxxxxxxxxrrxxxxxxxxxx",
   "xxxxxxxxxxrrxxxxxxxxxx",
   "xxx#######rr#######xxx",
   "xxx#..ff..........#xxx",
   "xxx#.m..........m.#xxx",
   "x..#....hhhhhh....#..x",
   "x..#.....cccc.....#..x",
   "r..r.....cccc.....r..r",
   "r..r.....cccc.....r..r",
   "x..#....hhhhhh....#..x",
   "x..#.m..........m.#..x",
   "xxx#..........ff..#xxx",
   "xxx#######rr#######xxx",
   "xxxxxxxxxxrrxxxxxxxxxx",
   "xxxxxxxxxxrrxxxxxxxxxx",
   "xxxxxxx........xxxxxxx",
   "xxxxxxx........xxxxxxx",
   "xxxxxxx........xxxxxxx",
   "xxxxxxxxxxrrxxxxxxxxxx"
  ],
  "starts": [
   [
    8,
    16
   ],
   [
    9,
    16
   ],
   [
    10,
    16
   ],
   [
    11,
    16
   ],
   [
    12,
    16
   ],
   [
    13,
    16
   ],
   [
    10,
    17
   ],
   [
    11,
    17
   ]
  ],
  "waves": [
   {
    "at": [
     10,
     4
    ],
    "form": "scatter"
   },
   {
    "at": [
     11,
     8
    ],
    "form": "ring",
    "hold": true
   },
   {
    "at": [
     20,
     9
    ],
    "form": "blob"
   },
   {
    "at": [
     10,
     1
    ],
    "at2": [
     1,
     9
    ],
    "form": "wedge"
   }
  ]
 },
 "4-4": {
  "tip": "기지 문은 셋. 문을 하나씩 막아 기동 철충을 끊고, 격납고에서 회복하며 버티자",
  "map": [
   "xxxxxxxxxxxxxxxxxxxxxx",
   "x.........rr.........x",
   "x.fff.....rr.....sss.x",
   "x.fff.....rr.....sss.x",
   "x.........rr.........x",
   "x....#####rr#####....x",
   "x....#..........#....x",
   "x....#.m......m.#....x",
   "x....#..........#....x",
   "x....#...ffff...#....x",
   "xrrrrr..........rrrrrx",
   "xrrrrr..........rrrrrx",
   "x....#..........#....x",
   "x....#..cccccc..#....x",
   "x....#..cccccc..#....x",
   "x....#..cccccc..#....x",
   "x....############....x",
   "x.hhh............fff.x",
   "x.hhh..mmmmmmmm..fff.x",
   "x.hhh..mmmmmmmm..fff.x",
   "x....................x",
   "xxxxxxxxxxxxxxxxxxxxxx"
  ],
  "starts": [
   [
    8,
    9
   ],
   [
    9,
    10
   ],
   [
    10,
    10
   ],
   [
    11,
    10
   ],
   [
    12,
    10
   ],
   [
    13,
    9
   ],
   [
    10,
    11
   ],
   [
    11,
    11
   ]
  ],
  "waves": [
   {
    "at": [
     10,
     2
    ],
    "form": "wedge"
   },
   {
    "at": [
     2,
     10
    ],
    "at2": [
     19,
     10
    ],
    "form": "wedge"
   },
   {
    "at": [
     10,
     2
    ],
    "at2": [
     18,
     18
    ],
    "form": "scatter"
   }
  ]
 },
 "4-5": {
  "tip": "굽이진 굴의 목과 벽 턱의 저격수를 차례로. 시작 굴방 옆굴의 기습을 대비할 것",
  "map": [
   "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
   "x#....#######xxxxxxxxxxxx#####",
   "x#....##hhhh#######xxxxxx#...#",
   "x###rr##hhhhrrrrrr########.cc#",
   "xxx#rr####rrrrrrrrr##......cc#",
   "####rr####rr##hhhrr##..f.....#",
   "#......###rr##hhhrr##........#",
   "#.f...rrrrrr##r##rrrrr####...#",
   "#.....rrrrr##...##rrrr#xx#####",
   "#......######...#######xxxxxxx",
   "########xxxx#####xxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  ],
  "starts": [
   [
    2,
    7
   ],
   [
    3,
    7
   ],
   [
    4,
    7
   ],
   [
    5,
    7
   ],
   [
    2,
    8
   ],
   [
    3,
    8
   ],
   [
    4,
    8
   ],
   [
    5,
    8
   ]
  ],
  "waves": [
   {
    "at": [
     13,
     4
    ],
    "form": "line"
   },
   {
    "at": [
     19,
     7
    ],
    "form": "blob",
    "hold": true
   },
   {
    "at": [
     3,
     2
    ],
    "form": "wedge"
   }
  ]
 },
 "4-6": {
  "tip": "층계 위에서 버티는 수비전. 계단 목을 막고, 양옆 승강 통로로 오르는 적을 끊자",
  "map": [
   "xxxxxxxxxxxxxxxxxxxxxxxx",
   "xxxxxx.cccccccccc.xxxxxx",
   "xxxxxx.cccccccccc.xxxxxx",
   "xxxxxx.cccccccccc.xxxxxx",
   "xxxxxx.cccccccccc.xxxxxx",
   "xxxxxxxxxxxrrxxxxxxxxxxx",
   "xxxxhhhhhhhhhhhhhhhhxxxx",
   "xxxxhhhhhhffffhhhhhhxxxx",
   "xxxxhhhhhhhhhhhhhhhhxxxx",
   "xxxxxrrxxxxxxxxxxrrxxxxx",
   "xxxxxrrxxxxxxxxxxrrxxxxx",
   "rr....................rr",
   "rr......m......m......rr",
   "rr....................rr",
   "xxxxxxxxxxxrrxxxxxxxxxxx",
   "xxxxxxxxxxxrrxxxxxxxxxxx",
   "xxxxhhhhhhhhhhhhhhhhxxxx",
   "xxxxhhhhffhhhhffhhhhxxxx",
   "xxxxhhhhhhhhhhhhhhhhxxxx",
   "xxxxxrrxxxxxxxxxxrrxxxxx",
   "xx....................xx",
   "xx.mm..............mm.xx",
   "xx....................xx",
   "xxxxxxxxxxxxxxxxxxxxxxxx"
  ],
  "starts": [
   [
    8,
    2
   ],
   [
    9,
    2
   ],
   [
    10,
    2
   ],
   [
    11,
    2
   ],
   [
    12,
    2
   ],
   [
    13,
    2
   ],
   [
    14,
    2
   ],
   [
    15,
    2
   ]
  ],
  "waves": [
   {
    "at": [
     12,
     12
    ],
    "form": "line"
   },
   {
    "at": [
     12,
     21
    ],
    "form": "scatter"
   },
   {
    "at": [
     1,
     12
    ],
    "form": "wedge"
   },
   {
    "at": [
     22,
     12
    ],
    "form": "wedge"
   },
   {
    "at": [
     6,
     21
    ],
    "at2": [
     18,
     21
    ],
    "form": "blob"
   },
   {
    "at": [
     12,
     17
    ],
    "form": "line"
   }
  ]
 },
 "4-7": {
  "tip": "객차 사이 건널목이 길목. 선로 위로 길게 드러나지 말고 객차 그늘로 끊어 가자",
  "map": [
   "xxxxxxxxxxxxxxxxxxxxxxxxxx",
   "sr........................",
   "sr.######....#####..###...",
   "sr.######====#####==###...",
   "sr......................mm",
   "sr....#####....#######..mm",
   "cr.===#####====#######=.mm",
   "cr........................",
   "cr.###....######...####...",
   "cr.###====######===####.ff",
   "sr......................ff",
   "sr...#######....####......",
   "sr.==#######====####===...",
   "sr........................",
   "sr........................",
   "xxxxxxxxxxxxxxxxxxxxxxxxxx"
  ],
  "starts": [
   [
    2,
    5
   ],
   [
    2,
    6
   ],
   [
    2,
    7
   ],
   [
    2,
    8
   ],
   [
    3,
    6
   ],
   [
    3,
    7
   ],
   [
    2,
    9
   ],
   [
    2,
    10
   ]
  ],
  "waves": [
   {
    "at": [
     12,
     7
    ],
    "form": "scatter"
   },
   {
    "at": [
     24,
     3
    ],
    "form": "wedge"
   },
   {
    "at": [
     24,
     12
    ],
    "at2": [
     12,
     1
    ],
    "form": "wedge"
   }
  ]
 },
 "4-8": {
  "tip": "객차 연결부가 길목. 칸마다 끊어 나아가며 기관차 칸의 광폭화 레이더를 노린다",
  "map": [
   "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
   "xxxxxxxxx...xxxxxxxxxx..xxxxxxxx",
   ".h....x.h....x.h....x.h...x.h.m.",
   "......=......x......=.....x.ccm.",
   "......=......=......=.....=.ccm.",
   "......x......x......x.....x.ccm.",
   "....f.x....f.x....f.x...f.x...m.",
   "xxxxxxxxxxxxxxxx...xxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  ],
  "starts": [
   [
    1,
    3
   ],
   [
    2,
    3
   ],
   [
    3,
    3
   ],
   [
    1,
    4
   ],
   [
    2,
    4
   ],
   [
    3,
    4
   ],
   [
    1,
    5
   ],
   [
    2,
    5
   ]
  ],
  "waves": [
   {
    "at": [
     16,
     4
    ],
    "form": "scatter"
   },
   {
    "at": [
     28,
     4
    ],
    "form": "ring"
   }
  ]
 }
};
