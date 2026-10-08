// テトリス（1単位目）の純粋ロジック。DOM を使わない。
// 盤面は 10列×22行。上の2行（0・1行目）は隠し行。出現は可視の最上段（2行目）の直下から。
(function () {
  "use strict";

  var COLS = 10;
  var ROWS = 22;
  var HIDDEN = 2;
  var STEP_MS = 1000 / 60;      // 固定ステップ 60Hz
  var MAX_CATCHUP_MS = 250;     // 1回の更新で取り込む経過時間の上限
  var GRAVITY_CAP = 20;         // 落下の頭打ち（20G。レベル19以降はここで止まる）
  var LOCK_FRAMES = 30;         // 接地後 0.5 秒で固定
  var LOCK_RESET_MAX = 15;      // 接地中の猶予リセットは1ピース15回まで
  var DAS = 10;                 // 左右の自動連打の開始（フレーム）
  var ARR = 2;                  // 自動連打の間隔（フレーム）
  var SOFT_FRAMES = 2;          // ソフトドロップ: 2フレームに1行（仮）
  var EVENT_FRAMES = 60;        // 判定表示の残り（フレーム）
  var NEXT_COUNT = 5;
  var SPAWN_Y = 1;              // 出現の上端（隠し行の直下）
  var BASIC_SCORE = [0, 100, 300, 500, 800];   // 通常の消去（0〜4ライン）。× レベル
  // Tスピン（消去0〜3ライン）。ミニは0〜2ライン（ミニ3ラインは不可能）。× レベル
  var TSPIN_SCORE = { mini: [100, 200, 400], full: [400, 800, 1200, 1600] };
  var EVENT_TITLE = ["", "SINGLE", "DOUBLE", "TRIPLE", "TETRIS"];
  var TYPES = ["I", "O", "T", "S", "Z", "J", "L"];
  var ROT_NAME = ["0", "R", "2", "L"];

  // 状態0の形（n×n の箱。y は下向き正）。x は箱の左端の列。I と O は中央、他は左寄り
  var BASE = {
    I: { n: 4, x: 3, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
    O: { n: 2, x: 4, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
    T: { n: 3, x: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
    S: { n: 3, x: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
    Z: { n: 3, x: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
    J: { n: 3, x: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
    L: { n: 3, x: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] }
  };

  // SRS 壁蹴り（現物の値。(x, y) は x 右正・y 上正。キーは「from+to」）
  var KICK_JLSTZ = {
    "0R": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    "R0": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    "R2": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    "2R": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    "2L": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    "L2": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    "L0": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    "0L": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
  };
  var KICK_I = {
    "0R": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    "R0": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    "R2": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    "2R": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    "2L": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    "L2": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    "L0": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    "0L": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]
  };

  function rotCW(cells, n) {
    return cells.map(function (p) { return [n - 1 - p[1], p[0]]; });
  }

  // SHAPES[type][rot] = 箱の中の座標の一覧
  var SHAPES = {};
  TYPES.forEach(function (t) {
    var list = [BASE[t].cells];
    for (var r = 1; r < 4; r++) list.push(rotCW(list[r - 1], BASE[t].n));
    SHAPES[t] = list;
  });

  function emptyRow() {
    var row = [];
    for (var c = 0; c < COLS; c++) row.push(null);
    return row;
  }

  function emptyBoard() {
    var b = [];
    for (var r = 0; r < ROWS; r++) b.push(emptyRow());
    return b;
  }

  // シード付き乱数（mulberry32）。同じシードなら同じ列
  function mulberry32(seed) {
    var a = seed;
    return function () {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // 7-bag: 7種を1回ずつ並べた袋（Fisher-Yates）
  function drawBag(rng) {
    var bag = TYPES.slice();
    for (var i = bag.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = bag[i]; bag[i] = bag[j]; bag[j] = t;
    }
    return bag;
  }

  // 壁蹴りの候補を盤面座標（行は下向き正）で返す。O は蹴らない
  function kickOffsets(type, from, to) {
    var key = ROT_NAME[from] + ROT_NAME[to];
    var table = type === "O" ? null : type === "I" ? KICK_I : KICK_JLSTZ;
    var list = table ? table[key] : [[0, 0]];
    return list.map(function (k) { return [k[0], 0 - k[1]]; });
  }

  function cellsAt(type, rot, x, y) {
    return SHAPES[type][rot].map(function (p) { return [x + p[0], y + p[1]]; });
  }

  function fits(board, type, rot, x, y) {
    var cs = SHAPES[type][rot];
    for (var i = 0; i < cs.length; i++) {
      var cx = x + cs[i][0], cy = y + cs[i][1];
      if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS || board[cy][cx]) return false;
    }
    return true;
  }

  function dropY(board, p) {
    var y = p.y;
    while (fits(board, p.type, p.rot, p.x, y + 1)) y++;
    return y;
  }

  function spawnPiece(type) {
    return { type: type, rot: 0, x: BASE[type].x, y: SPAWN_Y };
  }

  function refill(s) {
    while (s.queue.length <= NEXT_COUNT) {
      var bag = drawBag(s.rng);
      for (var i = 0; i < bag.length; i++) s.queue.push(bag[i]);
    }
  }

  function takeNext(s) {
    var t = s.queue.shift();
    refill(s);
    return t;
  }

  // 出現できなければゲームオーバー
  function spawn(s, type) {
    s.cur = spawnPiece(type);
    s.low = s.cur.y;
    s.gravity = 0;
    s.lockTimer = 0;
    s.lockResets = 0;
    s.soft = 0;
    s.lastRot = false;
    s.lastKickBig = false;
    if (!fits(s.board, type, 0, s.cur.x, s.cur.y)) s.status = "over";
  }

  function createGame(seed) {
    var s = {
      seed: seed, rng: mulberry32(seed), board: emptyBoard(), queue: [],
      cur: null, hold: null, canHold: true,
      score: 0, lines: 0, level: 1, steps: 0, acc: 0, status: "playing",
      gravity: 0, lockTimer: 0, lockResets: 0, soft: 0, low: SPAWN_Y,
      lastRot: false, lastKickBig: false, b2b: false, combo: 0,
      dir: 0, das: 0, arr: 0, event: null
    };
    refill(s);
    spawn(s, takeNext(s));
    return s;
  }

  function tryMove(s, dx, dy) {
    var p = s.cur;
    if (!fits(s.board, p.type, p.rot, p.x + dx, p.y + dy)) return false;
    p.x += dx;
    p.y += dy;
    s.lastRot = false;   // 回転の後に動かしたら、もう回転による配置ではない（Tスピン判定用）
    return true;
  }

  function isGrounded(s) {
    var p = s.cur;
    return !fits(s.board, p.type, p.rot, p.x, p.y + 1);
  }

  // 最も深く到達した行（低い位置）を覚える
  function noteLow(s) {
    if (s.cur && s.cur.y > s.low) s.low = s.cur.y;
  }

  // 移動・回転が成功した後。接地中なら猶予をリセットする。
  // 回数は接地中と空中の両方を数える（15回まで。空中での浮かせ直しで猶予を稼げないようにする）
  function afterMove(s) {
    if (s.lockResets < LOCK_RESET_MAX) {
      s.lockResets++;
      s.lockTimer = 0;   // 接地していなくても戻す（動かして一瞬浮いても、すぐには固定されない）
    }
    noteLow(s);
  }

  function rotate(s, dir) {
    var p = s.cur;
    var to = (p.rot + dir + 4) % 4;
    var offs = kickOffsets(p.type, p.rot, to);
    for (var i = 0; i < offs.length; i++) {
      var ny = p.y + offs[i][1];
      // 猶予を使い切った後は、最も低い行より上へは動けない（浮かせ直しで固定を延ばさない）
      if (s.lockResets >= LOCK_RESET_MAX && ny < s.low) continue;
      if (fits(s.board, p.type, to, p.x + offs[i][0], ny)) {
        p.rot = to;
        p.x += offs[i][0];
        p.y = ny;
        s.lastRot = true;
        // 蹴りが (±1, ±2) なら、ミニのTスピンを通常扱いにする（SRS の5回目の蹴り）
        s.lastKickBig = Math.abs(offs[i][0]) * Math.abs(offs[i][1]) === 2;
        afterMove(s);
        return true;
      }
    }
    return false;
  }

  function clearLines(s) {
    var kept = s.board.filter(function (row) {
      return row.some(function (c) { return c === null; });
    });
    var n = ROWS - kept.length;
    while (kept.length < ROWS) kept.unshift(emptyRow());
    s.board = kept;
    return n;
  }

  // 落下速度（1フレームに落ちる行数 G）。Marathon の式: 1行の秒数 = (0.8 − 0.007(L−1))^(L−1)。20G で頭打ち
  function rowsPerFrame(level) {
    if (level >= 19) return GRAVITY_CAP;   // 式は19以降で底が負になり意味を失う。20Gで頭打ち
    var secPerRow = Math.pow(0.8 - 0.007 * (level - 1), level - 1);
    return Math.min(GRAVITY_CAP, 1 / (secPerRow * 60));
  }

  function applyGravity(s) {
    s.gravity += rowsPerFrame(s.level);
    while (s.gravity >= 1 - 1e-9) {
      if (!tryMove(s, 0, 1)) { s.gravity = 0; break; }
      s.gravity -= 1;
    }
  }

  function occupied(s, x, y) {
    if (x < 0 || x >= COLS || y >= ROWS) return true;
    return y >= 0 && s.board[y][x] !== null;
  }

  // Tスピン判定（3隅ルール）。最後の操作が回転で、T の中心の斜め4隅のうち3つ以上が埋まっている時だけ。
  // 前側2隅が埋まれば通常（full）。前側1隅・後ろ側2隅ならミニ（ただし大きな蹴りで full に昇格）。
  // T が壁や床の方を向いているなら、後ろ側は埋まっているものとして数える
  function tSpinKind(s) {
    var p = s.cur;
    if (p.type !== "T" || !s.lastRot) return null;
    var cx = p.x + 1, cy = p.y + 1;
    var pos = { tl: [cx - 1, cy - 1], tr: [cx + 1, cy - 1], bl: [cx - 1, cy + 1], br: [cx + 1, cy + 1] };
    var face = [["tl", "tr"], ["tr", "br"], ["bl", "br"], ["tl", "bl"]][p.rot];
    var back = [["bl", "br"], ["tl", "bl"], ["tl", "tr"], ["tr", "br"]][p.rot];
    // 突起の先のさらに先が盤の外（壁・床）なら、T は壁・床を向いている → 後ろ側を埋まりとみなす
    var dir = [[0, -1], [1, 0], [0, 1], [-1, 0]][p.rot];
    var beyondX = cx + 2 * dir[0], beyondY = cy + 2 * dir[1];
    var wall = beyondX < 0 || beyondX >= COLS || beyondY >= ROWS;
    var f = face.filter(function (k) { return occupied(s, pos[k][0], pos[k][1]); }).length;
    var b = wall ? 2 : back.filter(function (k) { return occupied(s, pos[k][0], pos[k][1]); }).length;
    if (f + b < 3) return null;
    if (f === 2) return "full";
    return s.lastKickBig ? "full" : "mini";
  }

  // 消去の得点（ガイドライン）。判定の前のレベルで計算する。B2B は難しい消去の連続で ×1.5、コンボは 50×連続数×レベル
  function scoreClear(s, n, tspin) {
    var L = s.level;
    // ミニの3ライン・Tスピンの4ラインは起きない想定。起きたら安全側（通常扱い・full扱い）に寄せる
    var kind = !tspin || n === 4 ? null : tspin === "mini" && n >= 3 ? "full" : tspin;
    var base = kind === "mini" ? TSPIN_SCORE.mini[n] : kind === "full" ? TSPIN_SCORE.full[n] : BASIC_SCORE[n];
    var difficult = n === 4 || (tspin !== null && n >= 1);
    var b2b = difficult && s.b2b;
    var pts = Math.floor(base * L * (b2b ? 1.5 : 1));
    var comboBonus = n > 0 ? 50 * s.combo * L : 0;   // 直前までの連続消去数（最初の消去は0）
    if (n > 0) {
      s.b2b = difficult;   // 通常の1〜3ライン消去は連続を切る。Tスピンのライン消去とテトリスは連続させる
      s.combo++;
    } else {
      s.combo = 0;          // 消去しない固定はコンボを切る（B2B は切らない）
    }
    return { pts: pts + comboBonus, b2b: b2b, combo: s.combo };
  }

  function eventTitle(tspin, n) {
    var t = tspin ? "T-SPIN" + (tspin === "mini" ? " MINI" : "") : "";
    if (!n) return t;
    return t ? t + " " + EVENT_TITLE[n] : EVENT_TITLE[n];
  }

  function lockPiece(s) {
    var p = s.cur;
    var tspin = tSpinKind(s);   // 置く前の盤面で判定する
    var cs = cellsAt(p.type, p.rot, p.x, p.y);
    cs.forEach(function (c) { s.board[c[1]][c[0]] = p.type; });
    // ロックアウト: 固定したピースが全部隠し行に入ったら終わり
    if (cs.every(function (c) { return c[1] < HIDDEN; })) { s.status = "over"; return; }
    var n = clearLines(s);
    var sc = scoreClear(s, n, tspin);
    s.score += sc.pts;
    s.lines += n;
    s.level = 1 + Math.floor(s.lines / 10);   // 10ラインごとに1レベル上がる（得点計算の後で更新する）
    if (n > 0 || tspin) {
      var sub = "+" + sc.pts;
      if (sc.b2b) sub += " ・ B2B";
      if (sc.combo >= 2) sub += " ・ " + sc.combo + " COMBO";
      s.event = { title: eventTitle(tspin, n), sub: sub, ttl: EVENT_FRAMES };
    }
    s.canHold = true;
    spawn(s, takeNext(s));
  }

  function hardDrop(s) {
    var p = s.cur;
    var y = dropY(s.board, p);
    s.score += 2 * (y - p.y);
    if (y !== p.y) s.lastRot = false;   // 落ちたら、回転の後の配置ではない
    p.y = y;
    lockPiece(s);
  }

  // HOLD は1回の落下（固定まで）に1回だけ
  function doHold(s) {
    if (!s.canHold) return;
    var out = s.cur.type;
    var next = s.hold === null ? takeNext(s) : s.hold;
    s.hold = out;
    s.canHold = false;
    spawn(s, next);
  }

  // 左右は DAS/ARR。押し始めに1マス、DAS 後に ARR 間隔で連打
  function sideMove(s, dx) {
    if (tryMove(s, dx, 0)) afterMove(s);
  }

  function horizontal(s, dir) {
    if (dir === 0) { s.dir = 0; s.das = 0; s.arr = 0; return; }
    if (dir !== s.dir) { s.dir = dir; s.das = 0; s.arr = 0; sideMove(s, dir); return; }
    s.das++;
    if (s.das < DAS) return;
    if (s.das === DAS) { sideMove(s, dir); return; }
    if (++s.arr >= ARR) { s.arr = 0; sideMove(s, dir); }
  }

  // 1フレーム分の進行（横移動→ソフトドロップ→重力→接地と固定）
  function frame(s, input) {
    var dir = 0;
    if (input.left !== input.right) dir = input.left ? -1 : 1;
    horizontal(s, dir);

    if (input.down) {
      s.soft++;
      if (s.soft >= SOFT_FRAMES) {
        s.soft = 0;
        if (tryMove(s, 0, 1)) s.score += 1;
      }
    } else {
      s.soft = 0;
    }

    applyGravity(s);
    noteLow(s);

    // 接地している間だけ数える。空中の間は止めるだけで戻さない（浮かせ直しで固定を延ばせないように、接地の累計で固定する）
    if (isGrounded(s)) {
      s.lockTimer++;
      if (s.lockTimer >= LOCK_FRAMES) lockPiece(s);
    }
  }

  // input: {left, right, down}（押下中）と {rotCW, rotCCW, hardDrop, hold, pause}（押した瞬間）
  // dtMs: 前回からの経過時間。上限 250ms。一時停止中と終了後は何もしない
  function step(s, input, dtMs) {
    input = input || {};
    if (s.status === "over") return s;
    if (input.pause) s.status = s.status === "playing" ? "paused" : "playing";
    if (s.status !== "playing") return s;

    if (input.rotCW) rotate(s, 1);
    if (input.rotCCW) rotate(s, -1);
    if (input.hold) doHold(s);
    if (s.status === "playing" && input.hardDrop) hardDrop(s);

    var dt = Math.min(Math.max(Number(dtMs) || 0, 0), MAX_CATCHUP_MS);
    s.acc += dt;
    while (s.acc >= STEP_MS - 1e-9 && s.status === "playing") {
      s.acc -= STEP_MS;
      s.steps++;
      if (s.event && --s.event.ttl <= 0) s.event = null;
      frame(s, input);
    }
    return s;
  }

  // 表示用の値。盤面（可視20行）・ゴースト・NEXT・HOLD・進行。描画はこれだけを読む
  function getView(s) {
    var rows = [];
    for (var r = HIDDEN; r < ROWS; r++) rows.push(s.board[r].slice());
    var ghost = [];
    // 終了後は、出現できなかったピースもゴーストも描かない
    var p = s.status === "over" ? null : s.cur;
    if (p) {
      cellsAt(p.type, p.rot, p.x, dropY(s.board, p)).forEach(function (c) {
        if (c[1] >= HIDDEN) ghost.push([c[1] - HIDDEN, c[0]]);
      });
      cellsAt(p.type, p.rot, p.x, p.y).forEach(function (c) {
        if (c[1] >= HIDDEN) rows[c[1] - HIDDEN][c[0]] = p.type;
      });
    }
    return {
      rows: rows,
      ghost: ghost,
      next: s.queue.slice(0, NEXT_COUNT),
      hold: s.hold,
      canHold: s.canHold,
      score: s.score,
      lines: s.lines,
      level: s.level,
      elapsedSec: Math.floor(s.steps / 60),
      status: s.status,
      event: s.event ? { title: s.event.title, sub: s.event.sub } : null
    };
  }

  var API = {
    COLS: COLS, ROWS: ROWS, HIDDEN: HIDDEN, NEXT_COUNT: NEXT_COUNT, TYPES: TYPES,
    STEP_MS: STEP_MS, MAX_CATCHUP_MS: MAX_CATCHUP_MS, GRAVITY_CAP: GRAVITY_CAP, rowsPerFrame: rowsPerFrame,
    LOCK_FRAMES: LOCK_FRAMES, LOCK_RESET_MAX: LOCK_RESET_MAX, DAS: DAS, ARR: ARR,
    BASIC_SCORE: BASIC_SCORE, TSPIN_SCORE: TSPIN_SCORE, KICKS: { JLSTZ: KICK_JLSTZ, I: KICK_I },
    createGame: createGame, step: step, getView: getView,
    mulberry32: mulberry32, drawBag: drawBag, kickOffsets: kickOffsets,
    spawnPiece: spawnPiece, cellsAt: cellsAt, fits: fits, dropY: dropY
  };

  if (typeof module !== "undefined" && module.exports) { module.exports = API; } else { window.TetrisCore = API; }
})();
