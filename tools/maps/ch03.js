// 3장 전략 지도 (손으로 설계). tools/build_stagemaps.js 가 읽는다. 지도 생각은 tools/maps 아래 설계 메모 대신 각 작전 tip 과 아래 주석
module.exports = {
 "3-1": {
  "tip": "언덕 위 포대를 숲 샛길로 감싸고, 풀밭으로 오는 기동 철충은 숲 가장자리에서 받는다",
  "map": [
   "xxxx....fffsss........",
   "xxxx....fffsss........",
   "xxxx....fffsss........",
   "xx..ffff.......rrrrrr.",
   "xx..ffff.hhhhh.r......",
   "ffffffff.hmmmh.r......",
   "ff.......hmmmh.r...ff.",
   "ff.fffff.hhhhh.r...ff.",
   "ff.fffff.ff..f.r......",
   "ff.fffff.ff....rff....",
   "f...ffff.......rff...x",
   "f...ffff.......r.....x",
   "f...rrrrrrrrrrrrrrrxxx",
   "f...ffff...........xxx",
   "ffffffff...........xxx"
  ],
  "starts": [
   [
    1,
    11
   ],
   [
    2,
    11
   ],
   [
    3,
    11
   ],
   [
    1,
    12
   ],
   [
    2,
    12
   ],
   [
    3,
    12
   ],
   [
    2,
    13
   ],
   [
    3,
    13
   ]
  ],
  "waves": [
   {
    "at": [
     11,
     7
    ],
    "form": "line",
    "hold": true
   },
   {
    "at": [
     19,
     2
    ],
    "form": "wedge"
   }
  ]
 },
 "3-2": {
  "tip": "큰 다리는 건너편 둔덕의 사격을 받는다. 끊긴 다리로 한 부대를 돌려 담 안을 치자",
  "map": [
   "xxxxxxxxxxxxxxxxxx",
   "xxx.....cc....xxxx",
   "........cc.....fff",
   "....###rr#####.fff",
   "fff.#...rr...#.fff",
   "fff.#sssrrsss#.fff",
   "fff.#sssrrsss#....",
   "fff..hhhrrhhh.....",
   "fff...............",
   "ww=wwww===wwwwwxxx",
   "ww=wwww===wwwwwxxx",
   "ff......rr......r.",
   "ff...ss.rr.ss...r.",
   ".....ss.rr.ssff.r.",
   "........rr...ff.r.",
   "........rr......r.",
   "........rrrrrrrrr.",
   "xxx.....rr........",
   "xxx.....rr.......x",
   "xxx.....rr.......x"
  ],
  "starts": [
   [
    7,
    17
   ],
   [
    8,
    17
   ],
   [
    9,
    17
   ],
   [
    10,
    17
   ],
   [
    7,
    18
   ],
   [
    8,
    18
   ],
   [
    9,
    18
   ],
   [
    10,
    18
   ]
  ],
  "waves": [
   {
    "at": [
     9,
     6
    ],
    "form": "line",
    "hold": true
   },
   {
    "at": [
     9,
     2
    ],
    "form": "blob"
   },
   {
    "at": [
     16,
     12
    ],
    "form": "wedge"
   }
  ]
 },
 "3-3": {
  "tip": "방은 좁은 문으로만 이어진다. 문 앞을 먼저 잡고, 왼쪽 저장실 뒷문을 잊지 말 것",
  "map": [
   "xxxxxxxxxxxxxxxxxxxxxxxx",
   "x.......#########......x",
   "x.ff....#########......x",
   "x.......rrrrr####..mm..x",
   "x.......rrrrr####......x",
   "x....mm.#.......#......x",
   "x.......#.f....m#......x",
   "x.......#..ccc..rr#rr##x",
   "x##rr####..ccc..rr#rr##x",
   "x##rr####m.ccc..#......x",
   "x##rr####.....f.#......x",
   "x.......#.......#.f....x",
   "x.......r###rr###.f..f.x",
   "x.......rrrrrrrrr....f.x",
   "x.......#########......x",
   "xxxxxxxxxxxxxxxxxxxxxxxx"
  ],
  "starts": [
   [
    2,
    12
   ],
   [
    3,
    12
   ],
   [
    4,
    12
   ],
   [
    5,
    12
   ],
   [
    2,
    13
   ],
   [
    3,
    13
   ],
   [
    4,
    13
   ],
   [
    5,
    13
   ]
  ],
  "waves": [
   {
    "at": [
     12,
     8
    ],
    "form": "blob",
    "hold": true
   },
   {
    "at": [
     20,
     3
    ],
    "form": "wedge"
   },
   {
    "at": [
     4,
     3
    ],
    "form": "scatter"
   }
  ]
 },
 "3-4": {
  "tip": "방화문 틈 2칸이 길목. 문 하나를 잡고 버티며 위쪽 환기 통로를 경계하자",
  "map": [
   "xxxxxxxxxxxxxxxxxrrxxxxxxxxxxx",
   "#################rr###########",
   "....ff..#...m..#..ff..#...ccc.",
   "........#......#......#...ccc.",
   ".rrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
   ".rrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
   "........#......#......#.......",
   "........#..ff..#...m..#..ff...",
   "##############################",
   "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
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
     12,
     4
    ],
    "form": "line"
   },
   {
    "at": [
     27,
     5
    ],
    "at2": [
     17,
     1
    ],
    "form": "wedge"
   }
  ]
 },
 "3-5": {
  "tip": "기동 철충이 고리 복도 양쪽으로 돌아온다. 입구 기둥 사이에서 받고 코어 정문으로",
  "map": [
   "xxxxxxxxxxxxxxxxxxxx",
   "xx................xx",
   "xx................xx",
   "x...m...cccc...m...x",
   "x........cc........x",
   "x.....########.....x",
   "x.....########.....x",
   "x..f..########..f..x",
   "x..f..########..f..x",
   "x..f..########..f..x",
   "x.....########.....x",
   "x.....########.....x",
   "x..................x",
   "x...m...f..f...m...x",
   "xx................xx",
   "xx................xx",
   "xxxxxxxxrrrrxxxxxxxx",
   "xxxxxxxx....xxxxxxxx"
  ],
  "starts": [
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
   ]
  ],
  "waves": [
   {
    "at": [
     10,
     2
    ],
    "form": "line"
   },
   {
    "at": [
     2,
     6
    ],
    "at2": [
     17,
     6
    ],
    "form": "wedge"
   },
   {
    "at": [
     10,
     3
    ],
    "form": "blob",
    "hold": true
   }
  ]
 },
 "3-6": {
  "tip": "진지에 붙어 고갯길 목을 막는다. 양옆 염소길·벼랑길로 오르는 적을 놓치지 말 것",
  "map": [
   "xxxxxxxxxxxxxxxx",
   "xxm.h......h.mxx",
   "xxm..cccccc..mxx",
   "xxm..cccccc..mmx",
   "xmm............x",
   "xm..sssrrsss.m.x",
   "x..mmm.rr.mmmm.x",
   "x.mmmm.rr.mmmm.x",
   "x.mmmm.rr.mmmm.x",
   "x.mmmm.rr.mmmm.x",
   "x.mmmf.....mmm.x",
   "x.mmmf....hmmm.x",
   "x.mmm......mmm.x",
   "x.mm........mm.x",
   "x.mm......f.mm.x",
   "x.mm.h....f.m..x",
   "x.mm........m.mx",
   "x.mmmm....mmm.mx",
   "x.mmmm....mmm.mx",
   "x...mm....mmm.mx",
   "xmm...........mx",
   "xxm..........mmx",
   "xxm..........mxx",
   "xxxxxxxxxxxxxxxx"
  ],
  "starts": [
   [
    5,
    2
   ],
   [
    6,
    2
   ],
   [
    7,
    2
   ],
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
    7,
    3
   ],
   [
    8,
    3
   ]
  ],
  "waves": [
   {
    "at": [
     7,
     21
    ],
    "form": "line"
   },
   {
    "at": [
     1,
     17
    ],
    "form": "blob"
   },
   {
    "at": [
     8,
     20
    ],
    "at2": [
     14,
     13
    ],
    "form": "wedge"
   }
  ]
 },
 "3-7": {
  "tip": "구역 수비대를 치는 사이 숲 셋에서 증원이 온다. 담과 문을 방패로 쓰자",
  "map": [
   "xxxffffffffrrfffffffffxx",
   "xxxffffffffrrf.....fffxx",
   "xxxffffffffrrf.....fffff",
   "fffffffffffrrf........ff",
   "fffffffffffrrffffff...ff",
   "ffffff#####rr#####f...ff",
   "ffffff#..........#f...ff",
   "fff...#..........#ffffff",
   "fff...#..ssssss..#ffffff",
   "......#..ssccss..rrrrrrr",
   "fff...#..ssssss..rrrrrrr",
   "fff...#..........#ffffff",
   "fff...#..........#ffffff",
   "ffffff#####rr#####fhhhff",
   "ffhhhhfffffrrffffffhhhff",
   "ffhhhhff........fffhhhff",
   "ffhhhhff........ffffffff",
   "ffffffff........fffffxxx",
   "xxffffff........fffffxxx",
   "xxfffffffffrrffffffffxxx"
  ],
  "starts": [
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
    14,
    16
   ],
   [
    11,
    17
   ],
   [
    12,
    17
   ]
  ],
  "waves": [
   {
    "at": [
     12,
     10
    ],
    "form": "blob",
    "hold": true
   },
   {
    "at": [
     3,
     9
    ],
    "form": "wedge"
   },
   {
    "at": [
     21,
     4
    ],
    "form": "scatter"
   },
   {
    "at": [
     12,
     2
    ],
    "form": "wedge"
   }
  ]
 },
 "3-8": {
  "tip": "가운데 큰길은 빠르지만 트릭스터 앞에 그대로 드러난다. 숲길로 호위를 갈라 놓자",
  "map": [
   "xxxxxxxxxxxxxxxxxxxx",
   "xxfff...hmmh...fffxx",
   "xxfff...hhhh...fffxx",
   "xxfff..........fffxx",
   "fffff..........fffff",
   "fff..............fff",
   "fff..fmffrrffmf..fff",
   "fff..fmffrrffmf..fff",
   "fff..fmffrrffmf..fff",
   "fff..fmffrrffmf..fff",
   "fff..fmffrrffmf..fff",
   "fff..fmffrrffmf..fff",
   "fff......rr......fff",
   "xxx......rr......xxx",
   "xxxf.....rr.....fxxx",
   "xxxffffffrrffffffxxx"
  ],
  "starts": [
   [
    6,
    13
   ],
   [
    7,
    13
   ],
   [
    8,
    13
   ],
   [
    11,
    13
   ],
   [
    12,
    13
   ],
   [
    13,
    13
   ],
   [
    9,
    14
   ],
   [
    10,
    14
   ]
  ],
  "waves": [
   {
    "at": [
     10,
     2
    ],
    "form": "ring"
   }
  ]
 }
};
