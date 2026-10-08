const ui = new Ui();
const canvas = ui.canvas;
const ctx = ui.ctx;

const sprites = SpriteBank.defaults(function () {
  draw();
});
const playChrome = new PlayChrome();
const planner = new Planner();
const TAP_MS = 350;
const LONG_MS = 500;
const FIND_WAIT_MS = 500;
const FIND_FOX_MS = 1000;
const FIND_FOX_MAX = 60;
const CHECK_CUT = 0.96;
const CHECK_HIT = 0.98;
const HINT_CUT = [0, .99, 0.94, 0.95, 0.97, 0.98, 0.99]; // 2-5 prints, 6 clean up

const forest = Forest.load();
let n = forest.location.size;
let grid = null;
let cellSize = 32;
let originX = 0;
let originY = 0;
let tapTimer = 0;
let tapCell = null;
let holdTimer = 0;
let playing = false;
let clockElapsed = 0;
let clockStarted = 0;
let dragMode = null;
let dragCell = null;
let dragPointer = -1;
let dragDirty = false;
let hintCount = 0;
let hintCut = 1;
let loadedPlan = Plan.fromQuery(window.location.search);
if (loadedPlan && ui.btnStart) ui.btnStart.textContent = "Play URL Plan";
let playingTest = false;
let buildGen = 0;
let building = false;
let hintId = "";
let keepBoard = false;
let wonPending = false;

function clearTestPlan() {
  loadedPlan = null;
  playingTest = false;
  if (ui.btnStart) ui.btnStart.textContent = "Into the Fields";
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
  const rows = grid ? grid.rows : n;
  const cols = grid ? grid.cols : n;
  cellSize = Math.floor(Math.min(usableW / cols, usableH / rows));
  if (cellSize < 16) cellSize = 16;
  const boardW = cols * cellSize;
  const boardH = rows * cellSize;
  originX = Math.floor((w - boardW) / 2);
  if (ui.winOpen()) originY = padTop + gap;
  else originY = padTop + gap + Math.floor((usableH - boardH) / 2);  
}

function showMenu() {
  if (!playing || ui.winOpen() || ui.planOpen() || ui.storyOpen() || ui.findOpen()) return;
  ui.showMenu();
}

function persistBoard(force) {
  if (!grid || !keepBoard) return;
  if (!force && (!playing || ui.planOpen() || ui.storyOpen() || ui.findOpen())) return;
  const data = grid.dump();
  data.elapsedMs = clockNow();
  data.won = wonPending || ui.winOpen() || grid.isCleared();
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
  n = plan.size;
  building = true;
  const gen = ++buildGen;
  const started = Date.now();
  let foxes = 0;
  function tickFind(builder) {
    if (gen !== buildGen) return;
    const elapsed = Date.now() - started;
    if (elapsed < FIND_WAIT_MS) return;
    if (!ui.findOpen()) ui.showFind();
    const want = Math.min(FIND_FOX_MAX, 1 + Math.floor((elapsed - FIND_WAIT_MS) / FIND_FOX_MS));
    if (want > foxes) {
      foxes = want;
      ui.setFindFoxes(foxes);
    }
    if (builder && builder.searchPath) ui.setFindPath(builder.searchPath());
  }
  GridBuilder.buildAsync(plan, tickFind).then(function (built) {
    if (gen !== buildGen) return;
    building = false;
    if (!built) {
      if (!ui.findOpen()) ui.showFind();
      ui.setFindPath("no go");
      return;
    }    
    ui.hideFind();
    grid = built;
    Cell.dressGrid(grid);
    hintCount = 0;
    hintCut = 1;
    clockElapsed = 0;
    clockStarted = Date.now();
    wonPending = false;
    keepBoard = true;
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
  forest.notePick(card);
  persistForest();
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
  clearHintLight();
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
  clearHintLight();
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

function clearHintLight() {
  hintId = "";
  ui.hideWhy();
  if (!grid) return;
  grid.each(function (cell) {
    cell.hintEdge = "";
  });
}

function holdHint(result) {
  clearHintLight();
  if (!result || !result.id || result.win) return;
  hintId = result.id;
  const reason = result.reason || [];
  const prints = result.prints || [];
  for (let i = 0; i < reason.length; i++) reason[i].hintEdge = "reason";
  for (let i = 0; i < prints.length; i++) prints[i].hintEdge = "print";
  ui.showWhy();
}

function maybeHintStory(id) {
  if (!id || forest.sawStory(id)) return;
  const pages = Story.pages(id);
  if (!pages.length) return;
  forest.markStory(id);
  persistForest();
  presentStory(pages);
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
  const result = new Hint(grid).apply();
  if (result.win) {
    clearHintLight();
    if (!playingTest) {
      forest.win(currentFieldPlan());
      persistForest();
    }
    clockOff();
    wonPending = true;
    paintWin();
    ui.showWin();
    finishBoardAction(true);
    return;
  }
  if (result.warns || result.wrongs > 0) {
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
    holdHint(result);
    finishBoardAction(true);
    maybeHintStory(result.id);
    return;
  }
  if (result.level) chargeHint(result.level);
  if (result.id) holdHint(result);
  else if (result.rights) clearHintLight();
  finishBoardAction(true);
  maybeHintStory(result.id);
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
  const plan = Plan.copy(rawPlan);
  Cell.dressGrid(loaded);
  grid = loaded;
  forest.location = plan;
  forest.lastPlan = Plan.copy(plan);
  forest.offers = null;
  persistForest();
  n = grid.n;
  clockElapsed = data.elapsedMs > 0 ? data.elapsedMs | 0 : 0;
  clockStarted = Date.now();
  hintCount = data.hintCount | 0;
  hintCut = data.hintCut > 0 ? data.hintCut : 1;
  playingTest = false;
  keepBoard = true;
  const won = !!(data.won || loaded.isCleared());
  wonPending = won;
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
  clearHintLight();
  if (!playing || !grid || ui.winOpen() || ui.planOpen() || ui.storyOpen() || ui.findOpen()) return;
  ui.hideMenu();
  clockOff();
  const here = currentFieldPlan();
  forest.location = Plan.copy(here);
  forest.lastPlan = Plan.copy(here);
  keepBoard = false;
  wonPending = false;
  Save.clearBoard();
  forest.offers = null;
  persistForest();
  const wasTest = playingTest;
  clearTestPlan();
  if (wasTest) {
    showTitle();
    return;
  }
  showOffers(planner.travel(forest, forest.lastPlan));
}

function onWinOk() {
  ui.hideWin();
  keepBoard = false;
  wonPending = false;
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
  if (keepBoard) persistBoard(true);
  persistForest();
  clockOff();
}

function showTitle() {
  clearHintLight();
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
  ui.hideFind();
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
    if (forest.offers && forest.offers.length) {
      showOffers(planner.travel(forest));
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
  keepBoard = false;
  wonPending = false;
  Save.clearBoard();
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
  if (grid.rows !== grid.cols) return;
  for (let r = 0; r < grid.rows; r++) {
    const c = grid.hawk === "L" ? r : grid.cols - 1 - r;
    pts.push({
      x: originX + c * cellSize + inset + s / 2,
      y: originY + r * cellSize + inset + s / 2,
    });
  }
  ctx.save();
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  ctx.globalAlpha = .8;
  ctx.strokeStyle = spec.edge;
  ctx.lineWidth = Math.floor(cellSize * .5);    
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = spec.fill;
  ctx.lineWidth = Math.floor(cellSize * .40);  
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
  const inset = Math.max(2, Math.floor(cellSize * 0.06));
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
  if (row < 0 || col < 0 || row >= grid.rows || col >= grid.cols) return null;
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
  const id = e ? e.pointerId : dragPointer;
  if (id >= 0 && canvas.hasPointerCapture && canvas.hasPointerCapture(id)) {
    canvas.releasePointerCapture(id);
  }
  if (dragDirty) persistBoard();
  dragMode = null;
  dragCell = null;
  dragPointer = -1;
  dragDirty = false;
}

function onBoardDown(e) {
  if (!playing || !grid || ui.winOpen() || ui.menuOpen() || ui.planOpen() || ui.storyOpen() || ui.findOpen()) return;
  const hit = cellAtEvent(e);
  if (hintId) {
    clearHintLight();
    draw();
  }
  if (!hit) return;
  e.preventDefault();
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = 0;
  }
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
  const wasFox = cell.guessId === "o";
  dragCell = hit;
  dragPointer = e.pointerId;
  dragDirty = false;
  if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
  if (wasFox) {
    cell.setGuess(null);
    dragMode = "clear";
    dragDirty = true;
    paintScore();
    draw();
  } else {
    dragMode = cell.guessId === "x" ? "clear" : "x";
    applyStroke(hit, dragMode);
    const start = hit;
    holdTimer = setTimeout(function () {
      holdTimer = 0;
      if (!dragMode || !sameCell(start, dragCell)) return;
      applyDouble(start);
      if (tapTimer) {
        clearTimeout(tapTimer);
        tapTimer = 0;
        tapCell = null;
      }
      endDrag(null);
    }, LONG_MS);
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
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = 0;
  }
  let blocked = grid.at(hit.row, hit.col).is("tree");
  if (!blocked) {
    let r0 = dragCell.row;
    let c0 = dragCell.col;
    const r1 = hit.row;
    const c1 = hit.col;
    const adr = Math.abs(r1 - r0);
    const adc = Math.abs(c1 - c0);
    const sr = r0 < r1 ? 1 : -1;
    const sc = c0 < c1 ? 1 : -1;
    let err = adr - adc;
    while (!blocked && (r0 !== r1 || c0 !== c1)) {
      const e2 = err * 2;
      if (e2 > -adc) {
        err -= adc;
        r0 += sr;
      }
      if (e2 < adr) {
        err += adr;
        c0 += sc;
      }
      if (grid.at(r0, c0).is("tree")) blocked = true;
    }
  }
  if (blocked) {
    if (tapTimer) {
      clearTimeout(tapTimer);
      tapTimer = 0;
      tapCell = null;
    }
    endDrag(e);
    return;
  }
  if (tapTimer) {
    clearTimeout(tapTimer);
    tapTimer = 0;
    tapCell = null;
  }
  dragCell = hit;
  applyStroke(hit, dragMode);
}

function onBoardUp(e) {
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = 0;
  }
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
  why: function () {
    if (!hintId || ui.storyOpen()) return;
    presentStory(Story.pages(hintId));
  },
  menuBackdrop: function (e) {
    if (e.target === ui.elMenu) ui.hideMenu();
  },
});

ui.elFind.addEventListener("pointerdown", function (e) {
  if (!ui.findOpen() || building) return;
  e.preventDefault();
  showTitle();
});

canvas.addEventListener("pointerdown", onBoardDown);
canvas.addEventListener("pointermove", onBoardMove);
canvas.addEventListener("pointerup", onBoardUp);
canvas.addEventListener("pointercancel", onBoardUp);
canvas.addEventListener("contextmenu", function (e) {
  e.preventDefault();
});

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

persistForest();
paintScore();
layout();
draw();
