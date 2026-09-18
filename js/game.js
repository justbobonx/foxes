const ui = new Ui();
const canvas = ui.canvas;
const ctx = ui.ctx;

const sprites = SpriteBank.defaults(function () {
  draw();
});
const playChrome = new PlayChrome();
const planner = new Planner();
const TAP_MS = 280;
const HINT_CUT = [0.94, 0.93, 0.94, 0.95, 0.97, 0.99]; //hint 5 for a clean up

let n = Save.readSize();
let grid = null;
let cellSize = 32;
let originX = 0;
let originY = 0;
let tapTimer = 0;
let tapCell = null;
let playing = false;
let score = Save.readScore();
let clockElapsed = 0;
let clockStarted = 0;
let dragMode = null;
let dragCell = null;
let dragDirty = false;
let hintCount = 0;
let hintCut = 1;

function setLevel(size) {
  n = Save.clampSize(size);
  Save.writeSize(n);
  return n;
}

function crisp() {
  canvas.style.imageRendering = "pixelated";
}

function setSpriteFilter() {
  const inset = Math.max(1, Math.floor(cellSize * 0.06));
  const tile = cellSize - inset * 2;
  const dest = Math.max(1, tile - Math.max(0, Math.floor(tile * 0.06)) * 2);
  ctx.imageSmoothingEnabled = dest < TILE;
}

function clockReset() {
  clockElapsed = 0;
  clockStarted = Date.now();
}

function clockLoad(ms) {
  clockElapsed = ms > 0 ? ms | 0 : 0;
  clockStarted = Date.now();
}

function clockOff() {
  if (!clockStarted) return;
  clockElapsed += Date.now() - clockStarted;
  clockStarted = 0;
}

function clockNow() {
  if (!clockStarted) return clockElapsed;
  return clockElapsed + (Date.now() - clockStarted);
}

function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = function (n) {
    return (n < 10 ? "0" : "") + n;
  };
  if (h) return h + ":" + pad(m) + ":" + pad(s);
  return m + ":" + pad(s);
}

function resetHintScore() {
  hintCount = 0;
  hintCut = 1;
}

function chargeHint(level, extra) {
  const cut = HINT_CUT[level];
  if (!cut) return;
  hintCut *= cut;
  if (extra) hintCut *= extra;
  hintCount += 1;
}

function lockedFoxes(g) {
  if (!g) return 0;
  let n = 0;
  for (let r = 0; r < g.n; r++) {
    for (let c = 0; c < g.n; c++) {
      const cell = g.at(r, c);
      if (cell.spriteId === "o" && cell.locked) n++;
    }
  }
  return n;
}

function paintWin() {
  ui.paintWin(Math.round(hintCut * 100) + "%", formatClock(clockNow()), String(hintCount));
}

function layout() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w;
  canvas.height = h;
  crisp();
  const pad = ui.hudPad();
  const padTop = pad.top;
  const padBot = pad.bot;
  const gap = 8;
  const usableW = w;
  const usableH = h - padTop - padBot - gap * 2;
  const size = grid ? grid.n : n;
  cellSize = Math.floor(Math.min(usableW / size, usableH / size));
  if (cellSize < 16) cellSize = 16;
  const boardW = size * cellSize;
  const boardH = size * cellSize;
  originX = Math.floor((w - boardW) / 2);
  if (ui.winOpen()) originY = padTop + gap;
  else originY = padTop + gap + Math.floor((usableH - boardH) / 2);
  setSpriteFilter();
}

function hideWin() {
  ui.hideWin();
}

function hideMenu() {
  ui.hideMenu();
}

function showMenu() {
  if (!playing || ui.winOpen() || ui.planOpen()) return;
  ui.showMenu();
}

function isClearedGrid(g) {
  return !!(g && lockedFoxes(g) === g.n);
}

function persistBoard() {
  if (!playing || !grid) return;
  const data = grid.dump();
  data.elapsedMs = clockNow();
  data.won = ui.winOpen() || isClearedGrid(grid);
  data.hintCount = hintCount;
  data.hintCut = hintCut;
  Save.writeBoard(data);
}

function persistScore() {
  Save.writeScore(score);
}

function paintScore() {
  ui.paintScore({
    cleared: score.cleared,
    hintCut: hintCut,
    hintCount: hintCount,
    marked: grid ? grid.guessOCount() : 0,
    size: grid ? grid.n : n,
  });
}

function flagConflict(list) {
  if (!list || list.length < 2) return;
  for (let i = 0; i < list.length; i++) list[i].warn = true;
}

function markGuessConflicts(g) {
  const foxes = [];
  for (let r = 0; r < g.n; r++) {
    for (let c = 0; c < g.n; c++) {
      const cell = g.at(r, c);
      cell.warn = false;
      if (cell.is("grass") && cell.guessId === "o") foxes.push(cell);
    }
  }
  const rows = {};
  const cols = {};
  const dells = {};
  for (let i = 0; i < foxes.length; i++) {
    const cell = foxes[i];
    if (!rows[cell.row]) rows[cell.row] = [];
    if (!cols[cell.col]) cols[cell.col] = [];
    if (!dells[cell.dellId]) dells[cell.dellId] = [];
    rows[cell.row].push(cell);
    cols[cell.col].push(cell);
    dells[cell.dellId].push(cell);
  }
  for (const k in rows) flagConflict(rows[k]);
  for (const k in cols) flagConflict(cols[k]);
  for (const k in dells) flagConflict(dells[k]);
  for (let i = 0; i < foxes.length; i++) {
    for (let j = i + 1; j < foxes.length; j++) {
      const a = foxes[i];
      const b = foxes[j];
      if (Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col)) <= 1) {
        a.warn = true;
        b.warn = true;
      }
    }
  }
  let nWarn = 0;
  for (let i = 0; i < foxes.length; i++) if (foxes[i].warn) nWarn++;
  return nWarn;
}

function level2Forced(cell, foxes) {
  for (let i = 0; i < foxes.length; i++) {
    const fox = foxes[i];
    if (cell.row === fox.row) return true;
    if (cell.col === fox.col) return true;
    if (cell.dellId === fox.dellId) return true;
    if (Math.max(Math.abs(cell.row - fox.row), Math.abs(cell.col - fox.col)) <= 1) return true;
  }
  return false;
}

function showBoard(keepWin) {
  if (!keepWin) hideWin();
  hideMenu();
  setLevel(n);
  paintScore();
  layout();
  draw();
}

function showPlan() {
  ui.paintPlan(grid && grid.plan, n);
  ui.showPlan();
}

function hidePlan() {
  if (!ui.hidePlan()) return;
  if (playing && !clockStarted) clockStarted = Date.now();
}

function newBoard() {
  hideWin();
  hideMenu();
  setLevel(n);
  const plan = planner.roll(n);
  grid = GridBuilder.build(plan);
  Cell.dressGrid(grid);
  resetHintScore();
  clockElapsed = 0;
  clockStarted = 0;
  persistBoard();
  showBoard();
  showPlan();
}

function resetBoard() {
  if (!playing || !grid || ui.winOpen() || ui.planOpen()) return;
  hideWin();
  hideMenu();
  grid.wolfShown = false;
  for (let r = 0; r < grid.n; r++) {
    for (let c = 0; c < grid.n; c++) grid.at(r, c).resetMarks();
  }
  /* do not reset hints, its the same board, same hints */
  persistBoard();
  paintScore();
  layout();
  draw();
}

function clearMarks() {
  if (!playing || !grid || ui.winOpen() || ui.planOpen()) return;
  hideMenu();
  const foxes = [];
  for (let r = 0; r < grid.n; r++) {
    for (let c = 0; c < grid.n; c++) {
      const cell = grid.at(r, c);
      if (!cell.is("grass") || cell.guessId !== "o") continue;
      if (cell.wrong || cell.warn) {
        if (cell.locked) {
          cell.wrong = false;
          cell.warn = false;
          foxes.push(cell);
        } else {
          cell.setGuess(null);
        }
        continue;
      }
      foxes.push(cell);
    }
  }
  for (let r = 0; r < grid.n; r++) {
    for (let c = 0; c < grid.n; c++) {
      const cell = grid.at(r, c);
      if (!cell.is("grass") || cell.guessId !== "x") continue;
      if (cell.locked) continue;
      if (!level2Forced(cell, foxes)) cell.setGuess(null);
    }
  }
  chargeHint(5);
  persistBoard();
  paintScore();
  draw();
}

function applyCheckStep() {
  const result = grid.checkGuesses();
  if (result.win) {
    score.cleared += 1;
    clockOff();
    paintWin();
    ui.showWin();
  }
  persistScore();
  return result;
}

function finishBoardAction(persist) {
  if (persist) persistBoard();
  paintScore();
  layout();
  draw();
}

function onCheckHint() {
  if (!playing || !grid || ui.menuOpen() || ui.winOpen() || ui.planOpen()) return;
  const warns = markGuessConflicts(grid);
  const checkMode = grid.guessOCount() >= grid.n;
  const result = applyCheckStep();
  if (warns) {
    chargeHint(0, Math.pow(0.98, warns));
    finishBoardAction(true);
    return;
  }
  if (result.win) {
    finishBoardAction(true);
    return;
  }
  if (checkMode || result.wrongs > 0) {
    if (result.wrongs > 0) chargeHint(1);
    finishBoardAction(true);
    return;
  }
  const level = new Hint(grid).apply();
  if (level) chargeHint(level);
  finishBoardAction(true);
}

function restoreBoard() {
  const data = Save.readBoard();
  if (!data) return false;
  const loaded = Grid.load(data);
  if (!loaded) return false;
  Cell.dressGrid(loaded);
  grid = loaded;
  n = Save.clampSize(grid.n);
  Save.writeSize(n);
  clockLoad(data.elapsedMs || 0);
  hintCount = data.hintCount | 0;
  hintCut = data.hintCut > 0 ? data.hintCut : 1;
  const won = !!(data.won || isClearedGrid(loaded));
  if (won) {
    clockOff();
    paintWin();
    ui.showWin();
    showBoard(true);
    return true;
  }
  showBoard();
  return true;
}

function showTitle() {
  if (playing) {
    persistBoard();
    clockOff();
  }
  playing = false;
  hideWin();
  hideMenu();
  hidePlan();
  playChrome.leave();
  ui.showStart();
}

function beginPlay() {
  playing = true;
  playChrome.enter().then(function () {
    ui.hideStart();
    if (!restoreBoard()) newBoard();
    else {
      layout();
      draw();
    }
  });
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!grid) return;
  const inset = Math.max(1, Math.floor(cellSize * 0.06));
  const s = cellSize - inset * 2;
  for (let r = 0; r < grid.n; r++) {
    for (let c = 0; c < grid.n; c++) {
      const x = originX + c * cellSize + inset;
      const y = originY + r * cellSize + inset;
      const reveal = grid.wolfShown && grid.isWolfAt(r, c);
      grid.at(r, c).draw(ctx, sprites, x, y, s, reveal);
    }
  }
}

function cellAtEvent(e) {
  if (!grid) return null;
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) * canvas.width) / rect.width;
  const y = ((e.clientY - rect.top) * canvas.height) / rect.height;
  const col = Math.floor((x - originX) / cellSize);
  const row = Math.floor((y - originY) / cellSize);
  if (row < 0 || col < 0 || row >= grid.n || col >= grid.n) return null;
  return { row: row, col: col };
}

function sameCell(a, b) {
  return a && b && a.row === b.row && a.col === b.col;
}

function strokeCell(hit, mode) {
  const cell = grid.at(hit.row, hit.col);
  if (!cell.canTap()) return false;
  if (cell.guessId === "o") return false;
  if (mode === "x") {
    if (cell.guessId) return false;
    cell.setGuess("x");
    return true;
  }
  if (mode === "clear") {
    if (cell.guessId !== "x") return false;
    cell.setGuess(null);
    return true;
  }
  return false;
}

function applyStroke(hit, mode) {
  if (!strokeCell(hit, mode)) return;
  dragDirty = true;
  paintScore();
  draw();
}

function applyDouble(hit) {
  const cell = grid.at(hit.row, hit.col);
  if (!cell.canTap()) return;
  cell.setGuess("o");
  paintScore();
  persistBoard();
  draw();
}

function endDrag(e) {
  if (e && canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId)) {
    canvas.releasePointerCapture(e.pointerId);
  }
  if (dragDirty) persistBoard();
  dragMode = null;
  dragCell = null;
  dragDirty = false;
}

function onBoardDown(e) {
  if (!playing || !grid || ui.winOpen() || ui.menuOpen() || ui.planOpen()) return;
  const hit = cellAtEvent(e);
  if (!hit) return;
  e.preventDefault();
  if (tapTimer && sameCell(tapCell, hit)) {
    clearTimeout(tapTimer);
    tapTimer = 0;
    tapCell = null;
    dragMode = null;
    applyDouble(hit);
    return;
  }
  const cell = grid.at(hit.row, hit.col);
  if (!cell.canTap()) return;
  dragCell = hit;
  dragDirty = false;
  if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
  if (cell.guessId === "o") {
    cell.setGuess(null);
    dragMode = "clear";
    dragDirty = true;
    paintScore();
    draw();
  } else {
    dragMode = cell.guessId === "x" ? "clear" : "x";
    applyStroke(hit, dragMode);
  }
  if (tapTimer) clearTimeout(tapTimer);
  tapCell = hit;
  tapTimer = setTimeout(function () {
    tapTimer = 0;
    tapCell = null;
  }, TAP_MS);
}

function onBoardMove(e) {
  if (!dragMode) return;
  const hit = cellAtEvent(e);
  if (!hit || sameCell(hit, dragCell)) return;
  if (tapTimer) {
    clearTimeout(tapTimer);
    tapTimer = 0;
    tapCell = null;
  }
  dragCell = hit;
  applyStroke(hit, dragMode);
}

function onBoardUp(e) {
  if (!dragMode) return;
  endDrag(e);
}

function onViewport() {
  layout();
  draw();
}

ui.bind({
  start: beginPlay,
  planDismiss: hidePlan,
  menu: function () {
    if (!playing) return;
    if (ui.menuOpen()) hideMenu();
    else showMenu();
  },
  reset: resetBoard,
  clear: clearMarks,
  newMinus: function () {
    if (!playing) return;
    setLevel(n - 1);
    newBoard();
  },
  newBoard: function () {
    if (!playing) return;
    newBoard();
  },
  newPlus: function () {
    if (!playing) return;
    setLevel(n + 1);
    newBoard();
  },
  winNew: function () {
    if (!playing) return;
    newBoard();
  },
  check: onCheckHint,
  menuBackdrop: function (e) {
    if (e.target === ui.elMenu) hideMenu();
  },
});

canvas.addEventListener("pointerdown", onBoardDown);
canvas.addEventListener("pointermove", onBoardMove);
canvas.addEventListener("pointerup", onBoardUp);
canvas.addEventListener("pointercancel", onBoardUp);

window.addEventListener("resize", onViewport);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", onViewport);
}

document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "hidden") showTitle();
});

window.addEventListener("pagehide", showTitle);

setLevel(n);
paintScore();
layout();
draw();
