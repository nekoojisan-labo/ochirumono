"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const C = require("../src/core.js");

const ROOT = path.join(__dirname, "..");
const DT = C.STEP_MS;

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function blank() {
  return Array.from({ length: C.ROWS }, () => Array(C.COLS).fill(null));
}

function asKeys(list) {
  return list.map((p) => p.join(",")).sort();
}

// SRS の遷移記号 → 回転番号（0・R=1・2・L=3）
const ROT_OF = { "0R": [0, 1], "R0": [1, 0], "R2": [1, 2], "2R": [2, 1], "2L": [2, 3], "L2": [3, 2], "L0": [3, 0], "0L": [0, 3] };

test("A1 壁蹴り表は現物の値と完全一致（盤面の行は y を符号反転して比較）", () => {
  const JLSTZ = {
    "0R": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    "R0": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    "R2": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    "2R": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    "2L": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    "L2": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    "L0": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    "0L": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
  };
  const I = {
    "0R": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    "R0": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    "R2": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    "2R": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    "2L": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    "L2": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    "L0": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    "0L": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]
  };
  assert.deepEqual(C.KICKS.JLSTZ, JLSTZ);
  assert.deepEqual(C.KICKS.I, I);
  // 変換: 表の y は上向き正、盤面の行は下向き正 → 比較時に y を反転（0 - y で -0 を作らない）
  const flipY = ([x, y]) => [x, 0 - y];
  for (const t of ["J", "L", "S", "T", "Z"]) {
    for (const key of Object.keys(ROT_OF)) {
      const [from, to] = ROT_OF[key];
      assert.deepEqual(C.kickOffsets(t, from, to), JLSTZ[key].map(flipY), `${t} ${key}`);
    }
  }
  for (const key of Object.keys(ROT_OF)) {
    const [from, to] = ROT_OF[key];
    assert.deepEqual(C.kickOffsets("I", from, to), I[key].map(flipY), `I ${key}`);
  }
  assert.deepEqual(C.kickOffsets("O", 0, 1), [[0, 0]]);
});

test("A2 7-bag: 1000袋の各袋は7種を1回ずつ含む", () => {
  const rng = C.mulberry32(20261008);
  for (let i = 0; i < 1000; i++) {
    const bag = C.drawBag(rng);
    assert.deepEqual([...bag].sort(), [...C.TYPES].sort());
  }
});

test("A2 ゲーム内の出現順も7個ずつ袋単位で揃う", () => {
  const s = C.createGame(777);
  const seq = [s.cur.type];
  for (let i = 0; i < 70; i++) {
    s.board = blank();
    C.step(s, { hardDrop: true }, 0);
    seq.push(s.cur.type);
  }
  for (let b = 0; b < 10; b++) {
    assert.deepEqual([...seq.slice(b * 7, b * 7 + 7)].sort(), [...C.TYPES].sort(), `袋 ${b}`);
  }
});

test("A3 移動・回転（CW/CCW）・ソフトドロップ・ハードドロップ", () => {
  const s = C.createGame(1);
  s.cur = C.spawnPiece("T");
  const x0 = s.cur.x;
  C.step(s, { left: true }, DT);
  assert.equal(s.cur.x, x0 - 1);
  for (let i = 0; i < 100; i++) C.step(s, { left: true }, DT);
  assert.equal(s.cur.x, 0, "左の壁で止まる");

  C.step(s, { rotCW: true }, 0);
  assert.equal(s.cur.rot, 1);
  C.step(s, { rotCCW: true }, 0);
  assert.equal(s.cur.rot, 0);

  const soft = C.createGame(2);
  soft.cur = C.spawnPiece("I");
  const y0 = soft.cur.y, sc0 = soft.score;
  for (let i = 0; i < 10; i++) C.step(soft, { down: true }, DT);
  assert.equal(soft.cur.y, y0 + 5);
  assert.equal(soft.score - sc0, 5, "ソフトドロップは1点/セル");

  const hard = C.createGame(3);
  hard.board = blank();
  hard.cur = C.spawnPiece("T");
  const sc3 = hard.score;
  C.step(hard, { hardDrop: true }, 0);
  assert.equal(hard.board[21][3], "T");
  assert.equal(hard.board[21][4], "T");
  assert.equal(hard.board[21][5], "T");
  assert.equal(hard.board[20][4], "T");
  assert.equal(hard.score - sc3, 2 * (20 - 1), "ハードドロップは2点/セル");
});

test("A3 ライン消去 1〜4 ライン（I縦で右端の穴を埋める）", () => {
  for (const n of [1, 2, 3, 4]) {
    const s = C.createGame(50 + n);
    s.board = blank();
    for (let r = C.ROWS - n; r < C.ROWS; r++) for (let c = 0; c < 9; c++) s.board[r][c] = "Z";
    s.cur = { type: "I", rot: 1, x: 7, y: 1 };
    const sc = s.score;
    C.step(s, { hardDrop: true }, 0);
    assert.equal(s.lines, n);
    assert.equal(s.score - sc, C.BASIC_SCORE[n] + 2 * 17, `${n}ライン`);
    assert.equal(s.board.filter((row) => row.every((c) => c !== null)).length, 0);
  }
});

test("A3 壁蹴り: I の 0→R で右が塞がれていたら左へ2マス蹴って回る", () => {
  const s = C.createGame(6);
  s.board = blank();
  s.board[4][5] = "Z";
  s.cur = { type: "I", rot: 0, x: 3, y: 2 };
  C.step(s, { rotCW: true }, 0);
  assert.deepEqual([s.cur.rot, s.cur.x, s.cur.y], [1, 1, 2]);
});

test("A4 HOLD は1回の落下に1回だけ。入れ替えが正しい", () => {
  const s = C.createGame(31);
  const a = s.cur.type;
  const b = s.queue[0];
  C.step(s, { hold: true }, 0);
  assert.equal(s.hold, a);
  assert.equal(s.cur.type, b);
  assert.equal(s.canHold, false);

  C.step(s, { hold: true }, 0);
  assert.equal(s.hold, a, "2回目は無効");
  assert.equal(s.cur.type, b, "2回目は無効");

  const c = s.queue[0];
  C.step(s, { hardDrop: true }, 0);
  assert.equal(s.canHold, true, "固定後は再び使える");
  assert.equal(s.cur.type, c);

  C.step(s, { hold: true }, 0);
  assert.equal(s.cur.type, a, "保持していた a が出る");
  assert.equal(s.hold, c);
});

test("A5 NEXT は常に5個で、袋の順と一致する", () => {
  const seed = 99;
  const s = C.createGame(seed);
  const rng = C.mulberry32(seed);
  const seq = [...C.drawBag(rng), ...C.drawBag(rng), ...C.drawBag(rng), ...C.drawBag(rng)];
  for (let k = 0; k < 20; k++) {
    const v = C.getView(s);
    assert.equal(s.cur.type, seq[k], `出現 ${k}`);
    assert.equal(v.next.length, 5);
    assert.deepEqual(v.next, seq.slice(k + 1, k + 6), `NEXT ${k}`);
    s.board = blank();
    C.step(s, { hardDrop: true }, 0);
  }
});

test("A6 ゴーストは落下先と一致する（複数の盤面で検査）", () => {
  let checked = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = C.createGame(seed);
    const rng = C.mulberry32(seed * 7919);
    for (let r = 12; r < C.ROWS; r++) for (let c = 0; c < C.COLS; c++) if (rng() < 0.35) s.board[r][c] = "Z";
    const type = C.TYPES[seed % 7];
    const rot = seed % 4;
    const x = C.spawnPiece(type).x;
    s.cur = { type, rot, x, y: 1 };
    if (!C.fits(s.board, type, rot, x, 1)) continue;

    let y = 1;
    while (C.fits(s.board, type, rot, x, y + 1)) y++;
    const expected = C.cellsAt(type, rot, x, y)
      .filter((p) => p[1] >= C.HIDDEN)
      .map((p) => [p[1] - C.HIDDEN, p[0]]);
    assert.deepEqual(asKeys(C.getView(s).ghost), asKeys(expected), `盤面 ${seed}`);
    checked++;

    C.step(s, { hardDrop: true }, 0);
    if (s.lines === 0) {
      for (const p of C.cellsAt(type, rot, x, y)) assert.equal(s.board[p[1]][p[0]], type, `固定 ${seed}`);
    }
  }
  assert.ok(checked >= 30, `検査数 ${checked}`);
});

test("A7 放置: 接地後0.5秒（30フレーム）で必ず固定", () => {
  const s = C.createGame(5);
  s.cur = { type: "O", rot: 0, x: 4, y: 20 };
  s.lockTimer = 0;
  for (let f = 1; f <= 29; f++) {
    C.step(s, {}, DT);
    assert.equal(s.board[21][4], null, `${f}フレーム目でまだ固定されない`);
  }
  C.step(s, {}, DT);
  assert.equal(s.board[21][4], "O", "30フレーム目で固定");
});

test("A8 居座り: 接地中の移動で猶予が延びるのは15回まで。その後は固定", () => {
  const s = C.createGame(5);
  s.cur = { type: "O", rot: 0, x: 4, y: 20 };
  s.lockTimer = 0;
  s.lockResets = 0;
  let lockedAt = -1;
  for (let f = 1; f <= 200; f++) {
    C.step(s, f % 2 ? { left: true } : { right: true }, DT);
    if (s.board[21][4] !== null || s.board[21][5] !== null) {
      lockedAt = f;
      break;
    }
  }
  // 1〜15フレーム目の移動はそれぞれ猶予をリセット。最後のリセット（15回目）の後 30フレームで固定
  assert.equal(lockedAt, 15 + 29);
});

test("A9 入力なしでゲームオーバーまで150秒以内（計器・本人確定 2026-10-08）", (t) => {
  const seconds = [];
  for (let seed = 1; seed <= 500; seed++) {
    const s = C.createGame(seed);
    let n = 0;
    while (s.status !== "over" && n < 60 * 600) {
      C.step(s, {}, DT);
      n++;
    }
    seconds.push(n / 60);
  }
  const sorted = [...seconds].sort((a, b) => a - b);
  t.diagnostic(
    `放置のゲームオーバー時間（秒, 500シード）: 最小 ${sorted[0].toFixed(1)} / 中央 ${sorted[250].toFixed(1)} / 最大 ${sorted[499].toFixed(1)}`
  );
  assert.ok(sorted[499] <= 150, `最大 ${sorted[499].toFixed(1)} 秒（150秒以内が基準）`);
});

test("A10 リスタートで盤面・スコア・レベルが初期化される", () => {
  const s = C.createGame(3);
  for (let i = 0; i < 5; i++) {
    s.board = blank();
    C.step(s, { hardDrop: true }, 0);
  }
  assert.ok(s.score > 0);
  const r = C.createGame(4);
  assert.equal(r.score, 0);
  assert.equal(r.lines, 0);
  assert.equal(r.level, 1);
  assert.equal(r.hold, null);
  assert.equal(r.status, "playing");
  assert.ok(r.board.every((row) => row.every((c) => c === null)));
});

test("A10 保存しない: core と画面に localStorage / sessionStorage / cookie / IndexedDB の参照が無い", () => {
  const pattern = /localStorage|sessionStorage|document\.cookie|indexedDB/;
  assert.equal(pattern.test(read("src/core.js")), false);
  assert.equal(pattern.test(read("index.html")), false);
});

test("A11 一時停止（P）中は落下も時間も止まる", () => {
  const s = C.createGame(9);
  C.step(s, { pause: true }, 0);
  assert.equal(s.status, "paused");
  const snap = JSON.stringify(s);
  for (let i = 0; i < 600; i++) {
    C.step(s, { left: true, down: true, rotCW: true, hold: true, hardDrop: true }, 1000);
  }
  assert.equal(JSON.stringify(s), snap, "停止中は状態が変わらない");
  C.step(s, { pause: true }, 0);
  assert.equal(s.status, "playing");
  C.step(s, {}, DT);
  assert.equal(s.steps, 1);
});

test("A17 30秒分の経過時間を1回で与えても、進むのは250msまで", () => {
  const s = C.createGame(4);
  C.step(s, {}, 30000);
  assert.ok(s.steps <= 15, `steps=${s.steps}`);
  for (let i = 0; i < 10; i++) C.step(s, {}, 30000);
  assert.ok(s.steps <= 165, `11回の更新で ${s.steps} フレーム（上限 165）`);
});

test("A18 表示（盤面・NEXT・HOLD・スコア）が内部状態と一致する", () => {
  const s = C.createGame(21);
  C.step(s, { hold: true }, 0);
  C.step(s, { hardDrop: true }, 0);
  C.step(s, { left: true, rotCW: true }, 5 * DT);
  s.board[21][0] = "Z";
  const v = C.getView(s);
  assert.equal(v.score, s.score);
  assert.equal(v.lines, s.lines);
  assert.equal(v.hold, s.hold);
  assert.deepEqual(v.next, s.queue.slice(0, 5));
  const exp = s.board.slice(C.HIDDEN).map((row) => row.slice());
  C.cellsAt(s.cur.type, s.cur.rot, s.cur.x, s.cur.y).forEach(([x, y]) => {
    if (y >= C.HIDDEN) exp[y - C.HIDDEN][x] = s.cur.type;
  });
  assert.deepEqual(v.rows, exp);
});

test("A19 左右同時押しは両方無効。片方を離すと残った側だけ動く", () => {
  const s = C.createGame(8);
  s.cur = C.spawnPiece("T");
  const x0 = s.cur.x;
  for (let i = 0; i < 120; i++) C.step(s, { left: true, right: true }, DT);
  assert.equal(s.cur.x, x0);
  C.step(s, { left: true, right: false }, DT);
  assert.equal(s.cur.x, x0 - 1);
});

test("出現位置: I と O は中央、J/L/T/S/Z は列3〜5（左寄り）", () => {
  const cols = (t) => C.cellsAt(t, 0, C.spawnPiece(t).x, 1).map((p) => p[0]);
  assert.deepEqual([...new Set(cols("I"))].sort((a, b) => a - b), [3, 4, 5, 6]);
  assert.deepEqual([...new Set(cols("O"))].sort((a, b) => a - b), [4, 5]);
  for (const t of ["J", "L", "T", "S", "Z"]) {
    assert.ok(Math.min(...cols(t)) >= 3 && Math.max(...cols(t)) <= 5, t);
  }
});

test("ゲームオーバー: 新しいピースが出現できない時に終わる", () => {
  const s = C.createGame(2);
  s.board = blank();
  for (let c = 3; c <= 6; c++) s.board[2][c] = "Z";
  s.cur = { type: "O", rot: 0, x: 0, y: 20 };
  C.step(s, { hardDrop: true }, 0);
  assert.equal(s.status, "over");
  const frozen = JSON.stringify(s);
  C.step(s, { pause: true, hardDrop: true }, 1000);
  assert.equal(JSON.stringify(s), frozen, "終了後は何も変わらない");
});

test("画面: ライト固定・外部依存なし・[hidden]打ち消し・hex直書きなし・モック用ボタン無し", () => {
  const html = read("index.html");
  assert.equal(/prefers-color-scheme/.test(html), false, "ダーク用の指定を書かない");
  assert.equal(/https?:\/\//.test(html), false, "外部の CDN・フォント・スクリプトを使わない");
  assert.ok(html.includes("[hidden]{display:none!important}"));
  const outsideRoot = html.replace(/:root\{[\s\S]*?\}/, "");
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(outsideRoot), false, "本文に hex を直書きしない");
  assert.equal(html.includes("data-set"), false, "モック用の切り替えを残さない");
});

// 盤面のセル数（固定・消去で変わる）
function cellCount(board) {
  return board.reduce((n, row) => n + row.filter((c) => c !== null).length, 0);
}

test("I6 居座りの抜け道: 回転・移動を絶え間なく続けても、30秒以内に必ず固定される", () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = C.createGame(seed);
    const fill = C.mulberry32(seed * 131);
    s.board = blank();
    for (let r = 10; r < C.ROWS; r++) for (let c = 0; c < C.COLS; c++) if (fill() < 0.4) s.board[r][c] = "Z";
    const before = cellCount(s.board);
    const ctl = C.mulberry32(seed * 977);
    let locked = false;
    for (let f = 0; f < 60 * 30 && !locked; f++) {
      const r = ctl();
      const input = r < 0.35 ? { rotCW: true } : r < 0.5 ? { rotCCW: true } : r < 0.75 ? { left: true } : { right: true };
      C.step(s, input, DT);
      locked = s.status === "over" || cellCount(s.board) !== before;
    }
    assert.ok(locked, `シード ${seed}: 30秒続けても固定されない`);
  }
});

test("I6 居座り（段差で左右を交互に入れ続ける）: 30秒以内に固定される", () => {
  const s = C.createGame(31);
  s.board = blank();
  for (let c = 0; c <= 3; c++) s.board[6][c] = "Z";   // 左4列だけ埋まった段差。O は右へ出ると浮く
  s.cur = { type: "O", rot: 0, x: 3, y: 4 };
  s.lastRot = false;
  const before = cellCount(s.board);
  let locked = false;
  for (let f = 0; f < 60 * 30 && !locked; f++) {
    C.step(s, f % 2 ? { left: true } : { right: true }, DT);
    locked = s.status === "over" || cellCount(s.board) !== before;
  }
  assert.ok(locked, "交互入力でも30秒以内に固定される");
});

test("A16 壁・床を向いたTは後ろ側を埋まりとみなす（床・右壁とも ミニ 100点）", () => {
  const floor = C.createGame(40);
  floor.board = blank();
  floor.board[21][3] = "Z";   // 前側の左隅だけ埋まっている
  floor.cur = { type: "T", rot: 2, x: 3, y: 19 };   // 下向き。突起が床に当たる
  floor.lastRot = true;
  const f0 = floor.score;
  C.step(floor, { hardDrop: true }, 0);
  assert.equal(floor.score - f0, 100, "床");
  assert.equal(C.getView(floor).event.title, "T-SPIN MINI");

  const wall = C.createGame(41);
  wall.board = blank();
  wall.board[19][9] = "Z";   // 前側の右上だけ埋まっている
  wall.cur = { type: "T", rot: 1, x: 7, y: 19 };   // 右向き。突起が右の壁に当たる
  wall.lastRot = true;
  const w0 = wall.score;
  C.step(wall, { hardDrop: true }, 0);
  assert.equal(wall.score - w0, 100, "右の壁");
});

test("ロックアウト: 固定したピースが全部隠し行に入ったらゲームオーバー", () => {
  const s = C.createGame(1);
  s.board = blank();
  s.board[2][4] = "Z";
  s.board[2][5] = "Z";
  s.cur = { type: "O", rot: 0, x: 4, y: 0 };
  C.step(s, { hardDrop: true }, 0);
  assert.equal(s.status, "over");
  assert.equal(s.board[0][4], "O");
  assert.equal(s.board[1][5], "O");
});

test("ゲームオーバー後は、出現に失敗したピースもゴーストも描かない", () => {
  const s = C.createGame(2);
  s.board = blank();
  for (let c = 3; c <= 6; c++) s.board[2][c] = "Z";
  s.cur = { type: "O", rot: 0, x: 0, y: 20 };
  C.step(s, { hardDrop: true }, 0);
  assert.equal(s.status, "over");
  const v = C.getView(s);
  assert.deepEqual(v.ghost, []);
  assert.deepEqual(v.rows, s.board.slice(C.HIDDEN));
});

// ---- 2単位目: 速度上昇・Tスピン・B2B・コンボ ----

test("A15 落下速度: レベル1は60フレームで1行。レベルが上がるほど速く、20Gで頭打ち", () => {
  assert.ok(Math.abs(C.rowsPerFrame(1) - 1 / 60) < 1e-12);
  for (let L = 1; L < 30; L++) {
    assert.ok(C.rowsPerFrame(L + 1) >= C.rowsPerFrame(L) - 1e-12, `レベル ${L} → ${L + 1} で遅くならない`);
  }
  assert.equal(C.rowsPerFrame(19), C.GRAVITY_CAP, "レベル19で20Gに届く");
  assert.equal(C.rowsPerFrame(25), C.GRAVITY_CAP, "20Gを超えない");
});

test("A15 レベル10では1行が4フレーム前後で落ちる（実際のゲーム更新で計測）", () => {
  const s = C.createGame(12);
  s.board = blank();
  s.cur = { type: "I", rot: 0, x: 3, y: 2 };
  s.level = 10;
  let frames = 0;
  while (s.cur.y === 2 && frames < 100) {
    C.step(s, {}, DT);
    frames++;
  }
  assert.ok(frames >= 3 && frames <= 5, `${frames} フレーム`);
});

test("A15 レベルは10ラインごとに上がる", () => {
  const s = C.createGame(4);
  s.board = blank();
  for (let c = 0; c < 9; c++) s.board[21][c] = "Z";
  s.lines = 9;
  s.cur = { type: "I", rot: 1, x: 7, y: 18 };
  C.step(s, { hardDrop: true }, 0);
  assert.equal(s.lines, 10);
  assert.equal(s.level, 2);
});

test("A16 点数表（Tスピン・基本）はガイドラインの値どおり", () => {
  assert.deepEqual(C.TSPIN_SCORE, { mini: [100, 200, 400], full: [400, 800, 1200, 1600] });
  assert.deepEqual(C.BASIC_SCORE, [0, 100, 300, 500, 800]);
});

// T（rot 2 = 下向き）を中心 (4,10) に置く。前側の隅は (3,11)(5,11)、後ろ側は (3,9)(5,9)
function tDownAt() {
  return { type: "T", rot: 2, x: 3, y: 9 };
}

test("A16 Tスピン（ノーライン・通常）: 前側2隅＋後ろ側1隅で 400×レベル", () => {
  const s = C.createGame(20);
  s.board = blank();
  s.board[11][3] = "Z";
  s.board[11][5] = "Z";
  s.board[9][3] = "Z";
  s.board[12][4] = "Z";
  s.cur = tDownAt();
  s.lastRot = true;
  const sc0 = s.score;
  C.step(s, { hardDrop: true }, 0);
  assert.equal(s.score - sc0, 400);
  assert.equal(C.getView(s).event.title, "T-SPIN");
});

test("A16 Tスピン・ミニ: 前側1隅＋後ろ側2隅で 100×レベル。大きな蹴りなら通常扱い（400）", () => {
  const build = () => {
    const s = C.createGame(21);
    s.board = blank();
    s.board[11][3] = "Z";
    s.board[9][3] = "Z";
    s.board[9][5] = "Z";
    s.board[12][4] = "Z";
    s.cur = tDownAt();
    s.lastRot = true;
    return s;
  };
  const mini = build();
  const sc0 = mini.score;
  C.step(mini, { hardDrop: true }, 0);
  assert.equal(mini.score - sc0, 100);
  assert.equal(C.getView(mini).event.title, "T-SPIN MINI");

  const big = build();
  big.lastKickBig = true;
  const sc1 = big.score;
  C.step(big, { hardDrop: true }, 0);
  assert.equal(big.score - sc1, 400, "(±1,±2) の蹴りで最後に回したら通常扱い");
});

test("A16 Tスピン・2ライン: 10×2の穴を埋めると 1200×レベル", () => {
  const s = C.createGame(22);
  s.board = blank();
  for (const c of [0, 1, 2, 6, 7, 8, 9]) s.board[10][c] = "Z";
  for (const c of [0, 1, 2, 3, 5, 6, 7, 8, 9]) s.board[11][c] = "Z";
  s.board[12][4] = "Z";
  s.board[9][3] = "Z";   // 後ろ側の隅を1つ（3隅ルールの最低条件）
  s.cur = tDownAt();
  s.lastRot = true;
  const sc0 = s.score;
  C.step(s, { hardDrop: true }, 0);
  assert.equal(s.lines, 2);
  assert.equal(s.score - sc0, 1200);
  assert.equal(C.getView(s).event.title, "T-SPIN DOUBLE");
});

test("A16 Tスピンは回転の後の配置だけ。動かした後は数えない", () => {
  const s = C.createGame(23);
  s.board = blank();
  s.board[11][3] = "Z";
  s.board[11][5] = "Z";
  s.board[9][3] = "Z";
  s.board[12][4] = "Z";
  s.cur = tDownAt();
  s.lastRot = false;
  const sc0 = s.score;
  C.step(s, { hardDrop: true }, 0);
  assert.equal(s.score - sc0, 0, "回転を最後にしていないので Tスピンではない");
});

function tetrisSetup(s) {
  s.board = blank();
  for (let r = 18; r < C.ROWS; r++) for (let c = 0; c < 9; c++) s.board[r][c] = "Z";
  s.cur = { type: "I", rot: 1, x: 7, y: 18 };
  s.lastRot = false;
}

test("A16 B2B: テトリスの連続は 1.5 倍。2回目の連続消去にはコンボ 50×1×レベルを足す", () => {
  const s = C.createGame(24);
  tetrisSetup(s);
  const sc0 = s.score;
  C.step(s, { hardDrop: true }, 0);
  assert.equal(s.score - sc0, 800, "最初のテトリスは 800×レベル（B2B なし）");
  assert.equal(s.b2b, true);

  tetrisSetup(s);
  const sc1 = s.score;
  C.step(s, { hardDrop: true }, 0);
  assert.equal(s.score - sc1, 800 * 1.5 + 50, "2回目: B2B 1.5倍＋コンボ 50");
  assert.equal(C.getView(s).event.sub, `+1250 ・ B2B ・ 2 COMBO`);
});

test("A16 承認例2（レベル3・B2B中のテトリス連続）は 3750点（コンボ込み。本人確定 2026-10-08）", () => {
  const s = C.createGame(27);
  s.lines = 20;
  s.level = 3;
  tetrisSetup(s);
  C.step(s, { hardDrop: true }, 0);
  assert.equal(s.score, 2400, "1回目: 800×3");
  tetrisSetup(s);
  const sc1 = s.score;
  C.step(s, { hardDrop: true }, 0);
  assert.equal(s.score - sc1, 3750, "2回目: 800×3×1.5＋コンボ 50×1×3");
});

test("A16 通常の1ライン消去は B2B を切り、コンボを加える。消去しない固定はコンボを切る", () => {
  const s = C.createGame(25);
  tetrisSetup(s);
  C.step(s, { hardDrop: true }, 0);
  tetrisSetup(s);
  C.step(s, { hardDrop: true }, 0);
  assert.equal(s.combo, 2);

  s.board = blank();
  for (let c = 0; c < 9; c++) s.board[21][c] = "Z";
  s.cur = { type: "I", rot: 1, x: 7, y: 18 };
  s.lastRot = false;
  const sc0 = s.score;
  C.step(s, { hardDrop: true }, 0);
  assert.equal(s.score - sc0, 100 + 50 * 2, "単発の1ラインは 100＋コンボ（連続数2×50）");
  assert.equal(s.b2b, false, "通常の消去で B2B は切れる");

  s.board = blank();
  s.cur = { type: "O", rot: 0, x: 0, y: 0 };
  C.step(s, { hardDrop: true }, 0);
  assert.equal(s.combo, 0, "消去しない固定でコンボは切れる");
});

test("I14 得点は判定の前のレベルで計算し、そのあとレベルを上げる", () => {
  const s = C.createGame(26);
  s.lines = 9;
  s.level = 1;
  tetrisSetup(s);
  const sc0 = s.score;
  C.step(s, { hardDrop: true }, 0);
  assert.equal(s.score - sc0, 800, "レベル1の時点の得点（レベル2では1600になってしまう）");
  assert.equal(s.level, 2);
});
