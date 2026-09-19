const ui = new Ui();
const canvas = ui.canvas;
const ctx = ui.ctx;

const sprites = SpriteBank.defaults(function () {
  draw();
});
const playChrome = new PlayChrome();
const planner = new Planner();
const TAP_MS = 350;
const CHECK_CUT = 0.96;
const CHECK_HIT = 0.98;
const HINT_CUT = [0, 0, 0.94, 0.95, 0.97, 0.98, 0.99]; // 2-5 prints, 6 clean up

const forest = Forest.load();
let n = forest.location.size;
let grid = null;
let cellSize = 32;
let originX = 0;
let originY = 0;
let tapTimer = 0;
let tapCell = null;
let playing = false;
let clockElapsed = 0;
let clockStarted = 0;
let dragMode = null;
let dragCell = null;
let dragDirty = false;
let hintCount = 0;
let hintCut = 1;
let loadedPlan = parsePlanQuery();
if (loadedPlan && ui.btnStart) ui.btnStart.textContent = "Play URL Plan";
let playingTest = false;

function parsePlanQuery() {
  let raw = "";
  try {
    raw = new URLSearchParams(window.location.search).get("plan") || "";
  } catch (err) {
    return null;
  }
  raw = raw.trim();
  if (!raw) return null;
  if (raw.charAt(0) === "{") {
    try {
      return normalizeTestPlan(JSON.parse(raw));
    } catch (err) {
      return null;
    }
  }
  return parsePlanShort(raw);
}

function parsePlanShort(raw) {
  const parts = raw.split(",");
  const size = parseInt(parts[0], 10);
  if (!size) return null;
  const features = [];
  let hasRiver = false;
  for (let i = 1; i < parts.length; i++) {
    const bit = parts[i].trim();
    if (!bit) continue;
    const kv = bit.split(":");
    const type = kv[0].trim();
    const sz = kv.length > 1 ? parseInt(kv[1], 10) : 0;
    if (type === "pond") {
      const pond = sz >= 1 && sz <= 4 ? sz : 1;
      features.push({ type: "pond", size: pond });
    } else if (type === "river") {
      if (hasRiver) continue;
      hasRiver = true;
      features.push({ type: "river", size: sz === 1 ? 1 : 2 });
    } else if (type === "wolf" || type === "bunny") {
      features.push({ type: type });
    }
  }
  return Forest.copyPlan({ size: size, features: features });
}

function normalizeTestPlan(src) {
  if (!src || typeof src !== "object") return null;
  const features = [];
  const list = Array.isArray(src.features) ? src.features : [];
  let hasRiver = false;
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    if (!f || !f.type) continue;
    if (f.type === "pond") {
      const sz = f.size | 0 || f.amount | 0 || 1;
      features.push({ type: "pond", size: sz < 1 ? 1 : sz > 4 ? 4 : sz });
    } else if (f.type === "river") {
      if (hasRiver) continue;
      hasRiver = true;
      const sz = f.size | 0;
      features.push({ type: "river", size: sz === 1 ? 1 : 2 });
    } else if (f.type === "wolf" || f.type === "bunny") {
      features.push({ type: f.type });
    }
  }
  return Forest.copyPlan({ size: src.size || src.n, features: features });
}

function clearTestPlan() {
  loadedPlan = null;
  playingTest = false;
  if (ui.btnStart) ui.btnStart.textContent = "Adventure";
}

function setLevel(size) {
  n = Save.clampSize(size);
  return n;
}

function persistForest() {
  Save.writeForest(forest.dump());
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

function chargeCheck(infractions) {
  const hits = Math.max(1, infractions | 0);
  hintCut *= CHECK_CUT * Math.pow(CHECK_HIT, hits);
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

function isScoredFox(cell) {
  return !!(cell && (cell.locked || cell.wrong));
}

function snapshotMarks(g) {
  const out = {};
  for (let r = 0; r < g.n; r++) {
    for (let c = 0; c < g.n; c++) {
      const cell = g.at(r, c);
      out[r + "," + c] = { warn: !!cell.warn, wrong: !!cell.wrong };
    }
  }
  return out;
}

function countNewBadMarks(g, before) {
  let n = 0;
  for (let r = 0; r < g.n; r++) {
    for (let c = 0; c < g.n; c++) {
      const cell = g.at(r, c);
      const prev = before[r + "," + c] || {};
      if (cell.warn && !prev.warn) n++;
      if (cell.wrong && !prev.wrong) n++;
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
  if (!playing || !grid || ui.planOpen()) return;
  const data = grid.dump();
  data.elapsedMs = clockNow();
  data.won = ui.winOpen() || isClearedGrid(grid);
  data.hintCount = hintCount;
  data.hintCut = hintCut;
  data.fieldPlan = grid.fieldPlan || Planner.fromBuilder(grid.plan);
  data.testPlan = !!playingTest;
  Save.writeBoard(data);
}

function paintScore() {
  ui.paintScore({
    cleared: forest.stars,
    hintCut: hintCut,
    hintCount: hintCount,
    marked: grid ? grid.guessOCount() : 0,
    size: grid ? grid.n : n,
  });
}

function flagConflict(list) {
  if (!list || list.length < 2) return;
  for (let i = 0; i < list.length; i++) {
    if (isScoredFox(list[i])) continue;
    list[i].warn = true;
  }
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
      if (Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col)) > 1) continue;
      if (!isScoredFox(a)) a.warn = true;
      if (!isScoredFox(b)) b.warn = true;
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

function showOffers(cards) {
  hideMenu();
  ui.paintPlans(cards, forest);
  persistForest();
  ui.showPlan();
}

function openTravel() {
  showOffers(planner.travel(forest));
}

function hidePlan() {
  return ui.hidePlan();
}

function startField(plan, isTest) {
  hideWin();
  hideMenu();
  ui.hideStart();
  playingTest = !!isTest;
  n = setLevel(plan.size);
  const built = Planner.toBuilder(plan);
  grid = GridBuilder.build(built);
  grid.fieldPlan = Forest.copyPlan(plan);
  Cell.dressGrid(grid);
  resetHintScore();
  clockElapsed = 0;
  clockStarted = Date.now();
  persistBoard();
  hidePlan();
  showBoard();
}

function playCard(card) {
  if (!card || card.locked) return;
  forest.enter(card.plan);
  persistForest();
  startField(card.plan, false);
}

function resetBoard() {
  if (!playing || !grid || ui.winOpen() || ui.planOpen()) return;
  hideWin();
  hideMenu();
  grid.wolfShown = false;
  for (let r = 0; r < grid.n; r++) {
    for (let c = 0; c < grid.n; c++) grid.at(r, c).resetMarks();
  }
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
  chargeHint(6);
  persistBoard();
  paintScore();
  draw();
}

function currentFieldPlan() {
  if (grid && grid.fieldPlan) return grid.fieldPlan;
  if (grid && grid.plan) return Planner.fromBuilder(grid.plan);
  return forest.location;
}

function applyWin(result) {
  if (!result || !result.win) return;
  if (!playingTest) {
    forest.win(currentFieldPlan());
    persistForest();
  }
  clockOff();
  paintWin();
  ui.showWin();
}

function finishBoardAction(persist) {
  if (persist) persistBoard();
  paintScore();
  layout();
  draw();
}

function onCheckHint() {
  if (!playing || !grid || ui.menuOpen() || ui.winOpen() || ui.planOpen()) return;
  const before = snapshotMarks(grid);
  const warns = markGuessConflicts(grid);
  const checkMode = grid.guessOCount() >= grid.n;
  const result = grid.checkGuesses();
  if (warns || result.wrongs > 0) {
    const fresh = countNewBadMarks(grid, before);
    if (fresh) chargeCheck(fresh);
    finishBoardAction(true);
    return;
  }
  if (result.win) {
    applyWin(result);
    finishBoardAction(true);
    return;
  }
  if (checkMode) {
    finishBoardAction(true);
    return;
  }
  const level = new Hint(grid).apply();
  if (level) chargeHint(level);
  finishBoardAction(true);
}

function planFitsForest(plan) {
  if (!plan || plan.size > forest.maxN) return false;
  const list = plan.features || [];
  for (let i = 0; i < list.length; i++) {
    if (!list[i] || !list[i].type) return false;
    if (forest.stateOf(list[i].type) === "locked") return false;
  }
  return true;
}

function restoreBoard() {
  const data = Save.readBoard();
  const plan = data && data.fieldPlan ? Forest.copyPlan(data.fieldPlan) : null;
  if (!data || data.testPlan || !plan || plan.size !== (data.n | 0) || !planFitsForest(plan)) {
    Save.clearBoard();
    return false;
  }
  const loaded = Grid.load(data);
  if (!loaded) {
    Save.clearBoard();
    return false;
  }
  Cell.dressGrid(loaded);
  grid = loaded;
  grid.fieldPlan = plan;
  forest.location = Forest.copyPlan(plan);
  forest.lastPlan = Forest.copyPlan(plan);
  persistForest();
  n = Save.clampSize(grid.n);
  clockLoad(data.elapsedMs || 0);
  hintCount = data.hintCount | 0;
  hintCut = data.hintCut > 0 ? data.hintCut : 1;
  playingTest = false;
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

function giveUpField() {
  if (!playing || !grid || ui.winOpen() || ui.planOpen()) return;
  hideMenu();
  clockOff();
  const here = currentFieldPlan();
  forest.location = Forest.copyPlan(here);
  forest.lastPlan = Forest.copyPlan(here);
  Save.clearBoard();
  forest.offers = null;
  persistForest();
  const wasTest = playingTest;
  clearTestPlan();
  if (wasTest) {
    showTitle();
    return;
  }
  showOffers(planner.giveUp(forest));
}

function onWinOk() {
  hideWin();
  Save.clearBoard();
  forest.offers = null;
  persistForest();
  paintScore();
  const wasTest = playingTest;
  clearTestPlan();
  if (wasTest) {
    showTitle();
    return;
  }
  openTravel();
}

function showTitle() {
  if (playing) {
    persistBoard();
    persistForest();
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
    if (loadedPlan) {
      startField(loadedPlan, true);
      return;
    }
    if (restoreBoard()) {
      layout();
      draw();
      return;
    }
    openTravel();
  });
}

function onPlanBack() {
  persistForest();
  hidePlan();
  showTitle();
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
  planPick: playCard,
  planBack: onPlanBack,
  menu: function () {
    if (!playing || ui.planOpen()) return;
    if (ui.menuOpen()) hideMenu();
    else showMenu();
  },
  reset: resetBoard,
  clear: clearMarks,
  giveUp: giveUpField,
  winNew: onWinOk,
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
persistForest();
paintScore();
layout();
draw();
