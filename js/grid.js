/** rows x cols cells. One O per row. Types mark holes. Live board only. */

const HOLE_DELL = -2;

function Grid(n, cols) {
  this.n = n;
  this.rows = n;
  this.cols = cols == null ? n : cols;
  this.plan = { size: n, features: [] };
  this.wolfShown = false;
  this.wolfRow = -1;
  this.wolfCol = -1;
  this.hawk = null;
  this.cells = [];
  for (let r = 0; r < this.rows; r++) {
    const row = [];
    for (let c = 0; c < this.cols; c++) row.push(new Cell(r, c));
    this.cells.push(row);
  }
}

Grid.HOLE_DELL = HOLE_DELL;

Grid.prototype.at = function (row, col) {
  return this.cells[row][col];
};

Grid.prototype.inBoard = function (r, c) {
  return r >= 0 && c >= 0 && r < this.rows && c < this.cols;
};

Grid.prototype.each = function (fn) {
  for (let r = 0; r < this.rows; r++) {
    for (let c = 0; c < this.cols; c++) {
      if (fn(this.cells[r][c], r, c) === false) return;
    }
  }
};

Grid.prototype.findType = function (name) {
  let found = null;
  this.each(function (cell) {
    if (cell.is(name)) {
      found = cell;
      return false;
    }
  });
  return found;
};

Grid.prototype.markHole = function (cell) {
  cell.dellId = HOLE_DELL;
  cell.spriteId = null;
};

Grid.prototype.isWolfAt = function (row, col) {
  return this.wolfRow === row && this.wolfCol === col;
};

Grid.prototype.nearWolf = function (row, col) {
  if (this.wolfRow < 0) return false;
  return Math.max(Math.abs(row - this.wolfRow), Math.abs(col - this.wolfCol)) <= 1;
};

Grid.prototype.onHawkLine = function (row, col) {
  if (!this.hawk || this.rows !== this.cols) return false;
  const onDiag = this.hawk === "L" ? row === col : row + col === this.n - 1;
  if (!onDiag) return false;
  const hawkCol = this.hawk === "L" ? 0 : this.cols - 1;
  return !(row === 0 && col === hawkCol);
};

Grid.prototype.treeSpan = function (col) {
  let lo = -1;
  let hi = -1;
  for (let r = 0; r < this.rows; r++) {
    if (!this.cells[r][col] || !this.cells[r][col].is("tree")) continue;
    if (lo < 0) lo = r;
    hi = r;
  }
  if (lo < 0) return null;
  return { lo: lo, hi: hi };
};

Grid.prototype.runOf = function (row, col) {
  if (!this.inBoard(row, col)) return -1;
  if (this.cells[row][col].isHole()) return -1;
  const span = this.treeSpan(col);
  if (!span) return 0;
  if (row < span.lo) return 0;
  if (row > span.hi) return 1;
  return -1;
};

Grid.prototype.runKey = function (row, col) {
  const run = this.runOf(row, col);
  if (run < 0) return "";
  return col + ":" + run;
};

// Open (non-hole) cells of the 8-way ring around row, col.
Grid.prototype.openRing = function (row, col) {
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      if (!this.inBoard(row + dr, col + dc)) continue;
      const cell = this.cells[row + dr][col + dc];
      if (!cell.isHole()) out.push(cell);
    }
  }
  return out;
};

Grid.prototype.caveCells = function () {
  const out = [];
  this.each(function (cell) {
    if (cell.is("cave")) out.push(cell);
  });
  return out;
};

Grid.prototype.foxSeatOk = function (row, col) {
  if (!this.inBoard(row, col)) return false;
  if (this.cells[row][col].isHole()) return false;
  if (this.nearWolf(row, col)) return false;
  return true;
};

Grid.prototype.clearSprites = function () {
  this.each(function (cell) {
    cell.spriteId = null;
    cell.clearGuess();
  });
};

Grid.prototype.clearGuesses = function () {
  this.wolfShown = false;
  this.each(function (cell) {
    cell.clearGuess();
  });
};

Grid.prototype.resetMarks = function () {
  this.wolfShown = false;
  this.each(function (cell) {
    cell.resetMarks();
  });
};

Grid.prototype.guessOCount = function () {
  let n = 0;
  this.each(function (cell) {
    if (cell.guessId === "o" && cell.is("grass")) n++;
  });
  return n;
};

Grid.prototype.isCleared = function () {
  let locked = 0;
  this.each(function (cell) {
    if (cell.spriteId === "o" && cell.locked) locked++;
  });
  return locked === this.n;
};

Grid.prototype.clearLooseMarks = function () {
  const foxes = [];
  this.each(function (cell) {
    if (!cell.is("grass") || cell.guessId !== "o") return;
    if (cell.wrong || cell.warn) {
      if (cell.locked) {
        cell.wrong = false;
        cell.warn = false;
        foxes.push(cell);
      } else {
        cell.setGuess(null);
      }
      return;
    }
    foxes.push(cell);
  });
  const g = this;
  this.each(function (cell) {
    if (!cell.is("grass") || cell.guessId !== "x") return;
    if (cell.locked) return;
    let forced = false;
    for (let i = 0; i < foxes.length; i++) {
      const fox = foxes[i];
      if (cell.row === fox.row || cell.dellId === fox.dellId) {
        forced = true;
        break;
      }
      if (g.runKey(cell.row, cell.col) && g.runKey(cell.row, cell.col) === g.runKey(fox.row, fox.col)) {
        forced = true;
        break;
      }
      if (Math.max(Math.abs(cell.row - fox.row), Math.abs(cell.col - fox.col)) <= 1) {
        forced = true;
        break;
      }
      if (g.hawk && g.onHawkLine(fox.row, fox.col) && g.onHawkLine(cell.row, cell.col)) {
        forced = true;
        break;
      }
    }
    if (!forced) cell.setGuess(null);
  });
};

Grid.prototype.dump = function () {
  const cells = [];
  this.each(function (cell) {
    cells.push({
      dellId: cell.dellId,
      type: cell.type,
      spriteId: cell.spriteId,
      guessId: cell.guessId,
      wrong: !!cell.wrong,
      warn: !!cell.warn,
      locked: !!cell.locked,
    });
  });
  return {
    n: this.n,
    cols: this.cols,
    wolfShown: !!this.wolfShown,
    wolfRow: this.wolfRow,
    wolfCol: this.wolfCol,
    hawk: this.hawk || null,
    plan: Plan.copy(this.plan, this.n),
    cells: cells,
  };
};

Grid.load = function (data) {
  if (!data || !data.n || !data.cells) return null;
  const rows = data.n | 0;
  const cols = data.cols | 0 || rows;
  if (data.cells.length !== rows * cols) return null;
  const grid = new Grid(rows, cols);
  grid.wolfShown = !!data.wolfShown;
  grid.plan = Plan.copy(data.fieldPlan || data.plan, data.n);
  grid.wolfRow = typeof data.wolfRow === "number" ? data.wolfRow : -1;
  grid.wolfCol = typeof data.wolfCol === "number" ? data.wolfCol : -1;
  grid.hawk = data.hawk === "L" || data.hawk === "R" ? data.hawk : null;
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const src = data.cells[i++];
      const cell = grid.cells[r][c];
      cell.dellId = src.dellId;
      cell.spriteId = src.spriteId || null;
      cell.guessId = src.guessId === "w" ? "o" : src.guessId || null;
      cell.wrong = !!src.wrong;
      cell.warn = !!src.warn;
      cell.locked = !!src.locked;
      let kind =
        src.type ||
        src.specialId ||
          (src.pond ? "water" : src.cave || src.wolf ? "cave" : src.bunny ? "bunny" : src.hawk ? "hawk" : "grass");
      if (kind === "pond") kind = "water";
      cell.type = kind;
      if (src.wolf) {
        grid.wolfRow = r;
        grid.wolfCol = c;
      }
      if (cell.is("hawk") && !grid.hawk) {
        grid.hawk = c === 0 ? "L" : "R";
      }
      if (cell.isHole()) {
        cell.dellId = HOLE_DELL;
        cell.spriteId = null;
      }
    }
  }
  return grid;
};
