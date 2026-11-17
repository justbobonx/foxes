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
const LAYOUT_GAP = 8;
const CELL_MIN = 16;
const CELL_INSET = 0.06;
const HAWK_BAND_ALPHA = 0.8;
const HAWK_BAND_EDGE_W = 0.5;
const HAWK_BAND_FILL_W = 0.4;
const BOARD_BG = "#111111";
const FIND_FAIL_TEXT = "plan could not be built, sorry, tap to go back";
const URL_FIELD_TEXT = "Play URL Field";
const SHARE_URL = "https://terminalcore.com/foxes/?field=";
// Forest stars needed before Quick Play shows on the title.
const QUICK_PLAY_STARS = 5;
// Quick Play offers one plain field for each size in this range.
const QUICK_SIZE_MIN = 6;
const QUICK_SIZE_MAX = 8;
// Share of the gap to each quick win that the average time and score move.
const QUICK_AVG_RATE = 0.2;

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
let dragType = null;
let hintCount = 0;
let hintCut = 1;
// A field link wins over a plan link. A field that does not decode is dropped from the address as if never sent.
const fieldQuery = new URLSearchParams(window.location.search).get("field") || "";
let loadedField = fieldQuery && Share.decode(fieldQuery) ? fieldQuery : "";
if (fieldQuery && !loadedField) dropQuery("field");
let loadedPlan = loadedField ? null : Plan.fromQuery(window.location.search);
if ((loadedField || loadedPlan) && ui.elStartUrlRow) ui.elStartUrlRow.hidden = false;
if (loadedField && ui.btnStartUrl) ui.btnStartUrl.textContent = URL_FIELD_TEXT;
let playingTest = false;
let quickMode = false;
const quickStats = Save.readQuick() || {};
let buildGen = 0;
let building = false;
let hintId = "";
let keepBoard = false;
let wonPending = false;

// Takes one parameter out of the address bar without a reload.
function dropQuery(name) {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(name)) return;
  url.searchParams.delete(name);
  history.replaceState(null, "", url);
}

// The title X: drops the URL plan or field for good, its board, its button row, and the link so a reload stays in the fields.
function clearTestPlan() {
  loadedPlan = null;
  loadedField = "";
  playingTest = false;
  Save.clearBoard(SAVE_TEST_BOARD);
  if (ui.elStartUrlRow) ui.elStartUrlRow.hidden = true;
  dropQuery("field");
  dropQuery("plan");
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

function chargeHint(level) {
  const cut = HINT_CUT[level];
  if (!cut) return;
  hintCut *= cut;
  hintCount += 1;
}

function paintWin() {
  ui.paintWin(Math.round(hintCut * 100) + "%", Ui.clockText(clockNow()), String(hintCount));
}

// One size's quick record; a size never won gets a fresh empty one.
function quickRecord(size) {
  if (quickStats[size] && quickStats[size].wins > 0) return quickStats[size];
  return { wins: 0, bestMs: 0, avgMs: 0, avgScore: 0 };
}

// Quick Play stays off the title until the forest has enough stars.
function gateQuickPlay() {
  if (ui.btnStartQuick) ui.btnStartQuick.hidden = forest.stars < QUICK_PLAY_STARS;
}

function layout() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w;
  canvas.height = h;
  canvas.style.imageRendering = "pixelated";
  const pad = ui.hudPad();
  const usableH = h - pad.top - pad.bot - LAYOUT_GAP * 2;
  const rows = grid ? grid.rows : n;
  const cols = grid ? grid.cols : n;
  cellSize = Math.floor(Math.min(w / cols, usableH / rows));
  if (cellSize < CELL_MIN) cellSize = CELL_MIN;
  const boardW = cols * cellSize;
  const boardH = rows * cellSize;
  originX = Math.floor((w - boardW) / 2);
  if (ui.winOpen()) originY = pad.top + LAYOUT_GAP;
  else originY = pad.top + LAYOUT_GAP + Math.floor((usableH - boardH) / 2);
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
  if (playingTest) {
    data.urlPlan = JSON.stringify(loadedPlan);
    data.urlField = loadedField;
  }
  Save.writeBoard(data, playingTest ? SAVE_TEST_BOARD : quickMode ? SAVE_QUICK_BOARD : SAVE_BOARD);
}

function paintScore() {
  ui.paintScore({
    cleared: quickMode ? quickRecord(grid ? grid.n : n).wins : forest.stars,
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

// The quick cards: one plain field for each size, each showing that size's record.
function showQuick() {
  quickMode = true;
  const cards = [];
  // Only sizes the forest has already opened up.
  for (let size = QUICK_SIZE_MIN; size <= Math.min(QUICK_SIZE_MAX, forest.maxN); size++) {
    cards.push({ plan: { size: size, features: [] }, stats: quickRecord(size) });
  }
  ui.hideMenu();
  ui.paintPlans(cards, forest);
  ui.showPlan();
}

// slot: the board save this field belongs to, which also says which mode it is played in.
function startField(plan, slot) {
  keepBoard = false;
  ui.hideWin();
  ui.hideMenu();
  ui.hideStory();
  ui.hideStart();
  ui.hideFind();
  ui.hidePlan();
  playingTest = slot === SAVE_TEST_BOARD;
  quickMode = slot === SAVE_QUICK_BOARD;
  n = plan.size;
  building = true;
  const gen = ++buildGen;
  const started = Date.now();
  let foxes = 0;
  function tickFind(builder) {
    if (gen !== buildGen) return false;
    const elapsed = Date.now() - started;
    if (elapsed < FIND_WAIT_MS) return true;
    if (!ui.findOpen()) ui.showFind();
    const want = Math.min(FIND_FOX_MAX, 1 + Math.floor((elapsed - FIND_WAIT_MS) / FIND_FOX_MS));
    if (want > foxes) {
      foxes = want;
      ui.setFindFoxes(foxes);
    }
    if (builder && builder.searchPath) ui.setFindPath(builder.searchPath());
    return true;
  }
  GridBuilder.buildAsync(plan, tickFind).then(function (built) {
    if (gen !== buildGen) return;
    building = false;
    if (!built) {
      if (!ui.findOpen()) ui.showFind();
      ui.setFindPath(FIND_FAIL_TEXT);
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
    if (slot === SAVE_BOARD) {
      forest.offers = null;
      persistForest();
    }
    persistBoard(true);
    showBoard();
  });
}

// A story only counts as read once Continue is pressed on its last page, so leaving partway replays it.
function presentStory(pages, done, id) {
  const list = pages || [];
  let i = 0;
  function step() {
    if (i >= list.length) {
      ui.hideStory();
      if (id) {
        forest.markStory(id);
        persistForest();
      }
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
  // Quick cards go straight to the field: no stories, and the forest never hears about it.
  if (quickMode) {
    startField(card.plan, SAVE_QUICK_BOARD);
    return;
  }
  forest.notePick(card);
  persistForest();
  const id = forest.planStory(card.plan);
  const pages = Story.pages(id);
  function go() {
    forest.enter(card.plan);
    persistForest();
    startField(card.plan, SAVE_BOARD);
  }
  if (!pages.length) {
    go();
    return;
  }
  ui.hidePlan();
  presentStory(pages, go, id);
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

// Quick play keeps the screen clear, so no hint stories there.
function maybeHintStory(id) {
  if (quickMode || !id || forest.sawStory(id)) return;
  const pages = Story.pages(id);
  if (!pages.length) return;
  presentStory(pages, null, id);
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
    clockOff();
    if (quickMode) {
      // Each win pulls the averages part way toward it, the first win sets them outright.
      // Best time only counts a win with no hints at all.
      const rec = quickRecord(grid.n);
      rec.avgMs = rec.wins ? rec.avgMs + (clockElapsed - rec.avgMs) * QUICK_AVG_RATE : clockElapsed;
      rec.avgScore = rec.wins ? rec.avgScore + (hintCut - rec.avgScore) * QUICK_AVG_RATE : hintCut;
      if (!hintCount && (!rec.bestMs || clockElapsed < rec.bestMs)) rec.bestMs = clockElapsed;
      rec.wins += 1;
      quickStats[grid.n] = rec;
      Save.writeQuick(quickStats);
    } else if (!playingTest) {
      forest.win(currentFieldPlan());
      persistForest();
    }
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

// slot: which board save to resume. The URL plan or field board only resumes if it came from the same link.
function restoreBoard(slot) {
  const data = Save.readBoard(slot);
  if (!data) return false;
  if (slot === SAVE_TEST_BOARD && (data.urlPlan !== JSON.stringify(loadedPlan) || (data.urlField || "") !== loadedField)) {
    Save.clearBoard(SAVE_TEST_BOARD);
    return false;
  }
  return resumeBoard(data, slot);
}

// Puts a saved-board shaped data on screen: a resumed save, or a field fresh from a link.
function resumeBoard(data, slot) {
  const loaded = Grid.load(data);
  if (!loaded) {
    Save.clearBoard(slot);
    return false;
  }
  Cell.dressGrid(loaded);
  grid = loaded;
  if (slot === SAVE_BOARD) {
    const plan = Plan.copy(data.fieldPlan || data.plan || loaded.plan);
    forest.location = plan;
    forest.lastPlan = Plan.copy(plan);
    forest.offers = null;
    persistForest();
  }
  n = grid.n;
  clockElapsed = data.elapsedMs > 0 ? data.elapsedMs | 0 : 0;
  clockStarted = Date.now();
  hintCount = data.hintCount | 0;
  hintCut = data.hintCut > 0 ? data.hintCut : 1;
  playingTest = slot === SAVE_TEST_BOARD;
  quickMode = slot === SAVE_QUICK_BOARD;
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
  keepBoard = false;
  wonPending = false;
  if (playingTest) {
    Save.clearBoard(SAVE_TEST_BOARD);
    playingTest = false;
    showTitle();
    return;
  }
  if (quickMode) {
    Save.clearBoard(SAVE_QUICK_BOARD);
    showQuick();
    return;
  }
  const here = currentFieldPlan();
  forest.location = Plan.copy(here);
  forest.lastPlan = Plan.copy(here);
  Save.clearBoard(SAVE_BOARD);
  forest.offers = null;
  persistForest();
  showOffers(planner.travel(forest, forest.lastPlan));
}

function onWinOk() {
  ui.hideWin();
  keepBoard = false;
  wonPending = false;
  if (playingTest) {
    Save.clearBoard(SAVE_TEST_BOARD);
    playingTest = false;
    paintScore();
    showTitle();
    return;
  }
  if (quickMode) {
    Save.clearBoard(SAVE_QUICK_BOARD);
    paintScore();
    showQuick();
    return;
  }
  Save.clearBoard(SAVE_BOARD);
  forest.offers = null;
  persistForest();
  paintScore();
  openTravel();
}

// Copies a link to this board. empty: every mark, clock and hint wiped, for the win screen.
// A board with no marks or locks, which is what reset leaves, also goes out with a fresh clock and hints.
function shareBoard(empty, button) {
  if (!grid || !navigator.clipboard) return;
  const data = grid.dump();
  let blank = true;
  for (let i = 0; i < data.cells.length; i++) {
    const cell = data.cells[i];
    if (cell.guessId || cell.locked) blank = false;
    if (!empty) continue;
    cell.guessId = null;
    cell.locked = false;
    cell.wrong = false;
    cell.warn = false;
  }
  if (empty) data.wolfShown = false;
  const fresh = empty || blank;
  data.elapsedMs = fresh ? 0 : clockNow();
  data.hintCount = fresh ? 0 : hintCount;
  data.hintCut = fresh ? 1 : hintCut;
  navigator.clipboard.writeText(SHARE_URL + Share.encode(data)).then(function () {
    ui.flashCopied(button);
  }, function () {});
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
  gateQuickPlay();
  ui.showStart();
}

// fromUrl: the Play URL Plan or Field button. The URL plan or field stays until its X is hit.
function beginPlay(fromUrl) {
  playing = true;
  // A board left over from another mode is already in its own save, so it must not be saved again under this one.
  quickMode = false;
  keepBoard = false;
  paintScore();
  playChrome.enter().then(function () {
    ui.hideStart();
    if (fromUrl) {
      if (restoreBoard(SAVE_TEST_BOARD)) {
        layout();
        draw();
        return;
      }
      if (loadedField) {
        if (resumeBoard(Share.decode(loadedField), SAVE_TEST_BOARD)) {
          persistBoard(true);
          layout();
          draw();
        } else {
          showTitle();
        }
        return;
      }
      startField(loadedPlan, SAVE_TEST_BOARD);
      return;
    }
    if (restoreBoard(SAVE_BOARD)) {
      layout();
      draw();
      return;
    }
    if (forest.offers && forest.offers.length) {
      showOffers(planner.travel(forest));
      return;
    }
    if (!forest.sawStory("start")) {
      presentStory(Story.pages("start"), openTravel, "start");
    } else {
      openTravel();
    }
  });
}

// Quick Play: resumes the quick board in progress, a won one included, or else shows the quick cards.
function beginQuick() {
  playing = true;
  keepBoard = false;
  playChrome.enter().then(function () {
    ui.hideStart();
    if (restoreBoard(SAVE_QUICK_BOARD)) {
      layout();
      draw();
      return;
    }
    showQuick();
  });
}

function showHelp() {
  presentStory(Story.pages("start"));
}

// The quick cards only show with no quick board saved, so backing out of them leaves every save alone.
function onPlanBack() {
  keepBoard = false;
  wonPending = false;
  if (!quickMode) Save.clearBoard(SAVE_BOARD);
  persistForest();
  ui.hidePlan();
  showTitle();
}

function drawHawkBand() {
  if (!grid || !grid.hawk) return;
  const inset = Math.max(1, Math.floor(cellSize * CELL_INSET));
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
  ctx.globalAlpha = HAWK_BAND_ALPHA;
  ctx.strokeStyle = CELL_TYPES.hawk.edge;
  ctx.lineWidth = Math.floor(cellSize * HAWK_BAND_EDGE_W);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = CELL_TYPES.hawk.fill;
  ctx.lineWidth = Math.floor(cellSize * HAWK_BAND_FILL_W);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  
  ctx.restore();
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = BOARD_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!grid) return;
  drawHawkBand();
  const inset = Math.max(2, Math.floor(cellSize * CELL_INSET));
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
  if (dragType && cell.type !== dragType) return;
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
  dragType = null;
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
  dragType = cell.type;
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
  start: function () {
    beginPlay(false);
  },
  startUrl: function () {
    beginPlay(true);
  },
  quick: beginQuick,
  clearUrl: clearTestPlan,
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
  share: function () {
    shareBoard(false, ui.btnShare);
  },
  winNew: onWinOk,
  winShare: function () {
    shareBoard(true, ui.btnWinShare);
  },
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
  if (!ui.findOpen()) return;
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
gateQuickPlay();
paintScore();
layout();
draw();
