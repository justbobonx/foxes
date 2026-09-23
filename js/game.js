const ui = new Ui();
const canvas = ui.canvas;
const ctx = ui.ctx;

const sprites = SpriteBank.defaults(function () {
  draw();
});
const playChrome = new PlayChrome();
const planner = new Planner();
const TAP_MS = 350;
const FIND_WAIT_MS = 500;
const FIND_FOX_MS = 1000;
const FIND_FOX_MAX = 20;
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
let loadedPlan = Planner.fromQuery(window.location.search);
if (loadedPlan && ui.btnStart) ui.btnStart.textContent = "Play URL Plan";
let playingTest = false;
let buildGen = 0;
let building = false;

function clearTestPlan() {
  loadedPlan = null;
  playingTest = false;
  if (ui.btnStart) ui.btnStart.textContent = "Into the Fields";
}

function setLevel(size) {
  n = Save.clampSize(size);
  return n;
}

function persistForest() {
  Save.writeForest(forest.dump());
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

function chargeHint(level, extra) {
  const cut = HINT_CUT[level];
  if (!cut) return;
  hintCut *= cut;
  if (extra) hintCut *= extra;
  hintCount += 1;
}

function paintWin() {
  const ms = clockNow();
  const total = Math.max(0, Math.floor(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = function (n) {
    return (n < 10 ? "0" : "") + n;
  };
  const clock = h ? h + ":" + pad(m) + ":" + pad(s) : m + ":" + pad(s);
  ui.paintWin(Math.round(hintCut * 100) + "%", clock, String(hintCount));
}

function layout() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w;
  canvas.height = h;
  canvas.style.imageRendering = "pixelated";
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
  const inset = Math.max(1, Math.floor(cellSize * 0.06));
  const tile = cellSize - inset * 2;
  const dest = Math.max(1, tile - Math.max(0, Math.floor(tile * 0.06)) * 2);
  ctx.imageSmoothingEnabled = dest < TILE;
}

function showMenu() {
  if (!playing || ui.winOpen() || ui.planOpen() || ui.storyOpen() || ui.findOpen()) return;
  ui.showMenu();
}

function persistBoard(force) {
  if (!grid) return;
  if (!force && (!playing || ui.planOpen() || ui.storyOpen() || ui.findOpen())) return;
  const data = grid.dump();
  data.elapsedMs = clockNow();
  data.won = ui.winOpen() || grid.isCleared();
  data.hintCount = hintCount;
  data.hintCut = hintCut;
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

function showBoard(keepWin) {
  if (!keepWin) ui.hideWin();
  ui.hideMenu();
  ui.hidePlan();
  ui.hideStory();
  ui.hideFind();
  setLevel(n);
  paintScore();
  layout();
  draw();
}

function showOffers(cards) {
  ui.hideMenu();
  ui.paintPlans(cards, forest);
  persistForest();
  ui.showPlan();
}

function openTravel() {
  showOffers(planner.travel(forest));
}

function startField(plan, isTest) {
  ui.hideWin();
  ui.hideMenu();
  ui.hideStory();
  ui.hideStart();
  ui.hideFind();
  ui.hidePlan();
  playingTest = !!isTest;
  n = setLevel(plan.size);
  building = true;
  const gen = ++buildGen;
  const started = Date.now();
  let foxes = 0;
  function tickFind() {
    if (gen !== buildGen) return;
    const elapsed = Date.now() - started;
    if (elapsed < FIND_WAIT_MS) return;
    if (!ui.findOpen()) ui.showFind();
    const want = Math.min(FIND_FOX_MAX, 1 + Math.floor((elapsed - FIND_WAIT_MS) / FIND_FOX_MS));
    if (want > foxes) {
      foxes = want;
      ui.setFindFoxes(foxes);
    }
  }
  GridBuilder.buildAsync(plan, tickFind).then(function (built) {
    if (gen !== buildGen) return;
    building = false;
    ui.hideFind();
    grid = built;
    Cell.dressGrid(grid);
    hintCount = 0;
    hintCut = 1;
    clockElapsed = 0;
    clockStarted = Date.now();
    forest.offers = null;
    persistForest();
    persistBoard(true);
    showBoard();
  });
}

function presentStory(pages, done) {
  const list = pages || [];
  let i = 0;
  function step() {
    if (i >= list.length) {
      ui.hideStory();
      if (done) done();
      return;
    }
    ui.paintStory(list[i++]);
    ui.showStory();
  }
  ui.onStoryContinue = step;
  step();
}

function playCard(card) {
  if (!card || card.locked || building) return;
  const id = forest.planStory(card.plan);
  const pages = Story.pages(id);
  function go() {
    forest.enter(card.plan);
    persistForest();
    startField(card.plan, false);
  }
  if (!pages.length) {
    go();
    return;
  }
  forest.markStory(id);
  persistForest();
  ui.hidePlan();
  presentStory(pages, go);
}

function resetBoard() {
  if (!playing || !grid || ui.winOpen() || ui.planOpen() || ui.storyOpen() || ui.findOpen()) return;
  ui.hideWin();
  ui.hideMenu();
  grid.resetMarks();
  persistBoard();
  paintScore();
  layout();
  draw();
}

function clearMarks() {
  if (!playing || !grid || ui.winOpen() || ui.planOpen() || ui.storyOpen() || ui.findOpen()) return;
  ui.hideMenu();
  grid.clearLooseMarks();
  chargeHint(6);
  persistBoard();
  paintScore();
  draw();
}

function currentFieldPlan() {
  if (grid && grid.plan) return grid.plan;
  return forest.location;
}

function finishBoardAction(persist) {
  if (persist) persistBoard();
  paintScore();
  layout();
  draw();
}

function onCheckHint() {
  if (!playing || !grid || ui.menuOpen() || ui.winOpen() || ui.planOpen() || ui.storyOpen() || ui.findOpen()) return;
  const before = {};
  grid.each(function (cell, r, c) {
    before[r + "," + c] = { warn: !!cell.warn, wrong: !!cell.wrong };
  });
  const warns = grid.markConflicts();
  const checkMode = grid.guessOCount() >= grid.n;
  const result = grid.checkGuesses();
  if (warns || result.wrongs > 0) {
    let fresh = 0;
    grid.each(function (cell, r, c) {
      const prev = before[r + "," + c] || {};
      if (cell.warn && !prev.warn) fresh++;
      if (cell.wrong && !prev.wrong) fresh++;
    });
    if (fresh) {
      hintCut *= CHECK_CUT * Math.pow(CHECK_HIT, Math.max(1, fresh));
      hintCount += 1;
    }
    finishBoardAction(true);
    return;
  }
  if (result.win) {
    if (!playingTest) {
      forest.win(currentFieldPlan());
      persistForest();
    }
    clockOff();
    paintWin();
    ui.showWin();
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

function restoreBoard() {
  const data = Save.readBoard();
  if (!data || data.testPlan) return false;
  const loaded = Grid.load(data);
  if (!loaded) {
    Save.clearBoard();
    return false;
  }
  const rawPlan = data.fieldPlan || data.plan || loaded.plan;
  const plan = Forest.copyPlan(rawPlan);
  Cell.dressGrid(loaded);
  grid = loaded;
  forest.location = plan;
  forest.lastPlan = Forest.copyPlan(plan);
  forest.offers = null;
  persistForest();
  n = Save.clampSize(grid.n);
  clockElapsed = data.elapsedMs > 0 ? data.elapsedMs | 0 : 0;
  clockStarted = Date.now();
  hintCount = data.hintCount | 0;
  hintCut = data.hintCut > 0 ? data.hintCut : 1;
  playingTest = false;
  const won = !!(data.won || loaded.isCleared());
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
  if (!playing || !grid || ui.winOpen() || ui.planOpen() || ui.storyOpen() || ui.findOpen()) return;
  ui.hideMenu();
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
  ui.hideWin();
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

function stashPlay() {
  persistBoard(true);
  persistForest();
  clockOff();
}

function showTitle() {
  buildGen++;
  building = false;
  if (playing || grid) stashPlay();
  playing = false;
  ui.hideWin();
  ui.hideMenu();
  ui.hidePlan();
  ui.hideStory();
  ui.hideFind();
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
    if (grid && !playingTest) {
      showBoard();
      return;
    }
    if (!forest.sawStory("start")) {
      forest.markStory("start");
      persistForest();
      presentStory(Story.pages("start"), openTravel);
    } else {
      openTravel();
    }
  });
}

function showHelp() {
  presentStory(Story.pages("start"));
}

function onPlanBack() {
  persistForest();
  ui.hidePlan();
  showTitle();
}

function drawHawkBand() {
  if (!grid || !grid.hawk) return;
  const spec = Cell.types.hawk;
  const inset = Math.max(1, Math.floor(cellSize * 0.06));
  const s = cellSize - inset * 2;
  const pts = [];
  for (let r = 0; r < grid.n; r++) {
    const c = grid.hawk === "L" ? r : grid.n - 1 - r;
    pts.push({
      x: originX + c * cellSize + inset + s / 2,
      y: originY + r * cellSize + inset + s / 2,
    });
  }
  ctx.save();
  ctx.strokeStyle = spec.edge;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = Math.max(4, Math.floor(cellSize * (spec.bandFrac || 0.2)));
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.restore();
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!grid) return;
  drawHawkBand();
  const inset = Math.max(1, Math.floor(cellSize * 0.06));
  const s = cellSize - inset * 2;
  grid.each(function (cell, r, c) {
    const x = originX + c * cellSize + inset;
    const y = originY + r * cellSize + inset;
    const reveal = grid.wolfShown && grid.isWolfAt(r, c);
    cell.draw(ctx, sprites, x, y, s, reveal);
  });
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

function applyStroke(hit, mode) {
  const cell = grid.at(hit.row, hit.col);
  if (!cell.canTap()) return;
  if (cell.guessId === "o") return;
  if (mode === "x") {
    if (cell.guessId) return;
    cell.setGuess("x");
  } else if (mode === "clear") {
    if (cell.guessId !== "x") return;
    cell.setGuess(null);
  } else {
    return;
  }
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
  if (!playing || !grid || ui.winOpen() || ui.menuOpen() || ui.planOpen() || ui.storyOpen() || ui.findOpen()) return;
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
  help: showHelp,
  planPick: playCard,
  planBack: onPlanBack,
  menu: function () {
    if (!playing || ui.planOpen() || ui.storyOpen() || ui.findOpen()) return;
    if (ui.menuOpen()) ui.hideMenu();
    else showMenu();
  },
  reset: resetBoard,
  clear: clearMarks,
  giveUp: giveUpField,
  winNew: onWinOk,
  check: onCheckHint,
  menuBackdrop: function (e) {
    if (e.target === ui.elMenu) ui.hideMenu();
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

window.addEventListener("pagehide", function () {
  stashPlay();
});

setLevel(n);
persistForest();
paintScore();
layout();
draw();
