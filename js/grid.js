/** rows x cols cells. One O per row. Types mark holes. Live board only. */

const HOLE_DELL = -2;

function Grid(n, cols) {
  this.n = n;
  this.rows = n;
  this.cols = cols == null ? n : cols;
  this.plan = { size: n, features: [] };
  this.unique = false;
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

Grid.normalizePlan = function (plan, n) {
  const size = (plan && (plan.size || plan.n)) || n || 0;
  if (plan && Array.isArray(plan.features)) {
    const features = [];
    const list = plan.features;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      if (!f || !f.type || f.type === "water") continue;
      const item = { type: f.type };
      for (const k in f) {
        if (k === "type") continue;
        item[k] = f[k];
      }
      if (item.amount && !item.size) item.size = item.amount;
      features.push(item);
    }
    return { size: size | 0, features: features };
  }
  const features = [];
  if (plan) {
    if (Array.isArray(plan.ponds)) {
      for (let i = 0; i < plan.ponds.length; i++) {
        const sz = plan.ponds[i] | 0;
        if (sz) features.push({ type: "pond", size: sz });
      }
    } else if (plan.ponds) {
      features.push({ type: "pond", size: plan.ponds | 0 });
    }
    const river = plan.river | 0;
    if (river) features.push({ type: "river", size: river });
    if (plan.wolf) features.push({ type: "wolf" });
    if (plan.bunny) features.push({ type: "bunny" });
    if (plan.hawk) features.push({ type: "hawk" });
    if (plan.trees) features.push({ type: "trees", size: plan.trees | 0 || 1 });
  }
  return { size: size | 0, features: features };
};

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

Grid.prototype.isHole = function (row, col) {
  return this.cells[row][col].isHole();
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

Grid.prototype.findBunny = function () {
  return this.findType("bunny");
};

Grid.prototype.foxSeatOk = function (row, col) {
  if (!this.inBoard(row, col)) return false;
  if (this.isHole(row, col)) return false;
  if (this.nearWolf(row, col)) return false;
  return true;
};

Grid.prototype.setSprite = function (row, col, id) {
  this.cells[row][col].setSprite(id);
};

Grid.prototype.clearSprites = function () {
  this.each(function (cell) {
    cell.clearSprite();
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

Grid.prototype.markConflicts = function () {
  function scored(cell) {
    return !!(cell && (cell.locked || cell.wrong));
  }
  function flag(list) {
    if (!list || list.length < 2) return;
    for (let i = 0; i < list.length; i++) {
      if (scored(list[i])) continue;
      list[i].warn = true;
    }
  }
  const foxes = [];
  this.each(function (cell) {
    cell.warn = false;
    if (cell.is("grass") && cell.guessId === "o") foxes.push(cell);
  });
  const rows = {};
  const runs = {};
  const dells = {};
  for (let i = 0; i < foxes.length; i++) {
    const cell = foxes[i];
    const run = this.runKey(cell.row, cell.col);
    if (!rows[cell.row]) rows[cell.row] = [];
    if (run && !runs[run]) runs[run] = [];
    if (!dells[cell.dellId]) dells[cell.dellId] = [];
    rows[cell.row].push(cell);
    if (run) runs[run].push(cell);
    dells[cell.dellId].push(cell);
  }
  for (const k in rows) flag(rows[k]);
  for (const k in runs) flag(runs[k]);
  for (const k in dells) flag(dells[k]);
  if (this.hawk) {
    const line = [];
    for (let i = 0; i < foxes.length; i++) {
      if (this.onHawkLine(foxes[i].row, foxes[i].col)) line.push(foxes[i]);
    }
    flag(line);
  }
  for (let i = 0; i < foxes.length; i++) {
    for (let j = i + 1; j < foxes.length; j++) {
      const a = foxes[i];
      const b = foxes[j];
      if (Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col)) > 1) continue;
      if (!scored(a)) a.warn = true;
      if (!scored(b)) b.warn = true;
    }
  }
  let nWarn = 0;
  for (let i = 0; i < foxes.length; i++) if (foxes[i].warn) nWarn++;
  return nWarn;
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

Grid.prototype.checkGuesses = function () {
  let win = true;
  let found = 0;
  let rights = 0;
  let wrongs = 0;
  this.each(function (cell) {
    if (!cell.is("grass")) return;
    if (cell.warn) {
      win = false;
      return;
    }
    if (cell.guessId === "o") {
      if (cell.spriteId === "o") {
        found++;
        if (!cell.locked) rights++;
        cell.locked = true;
        cell.wrong = false;
      } else {
        cell.wrong = true;
        win = false;
        wrongs++;
      }
    } else {
      cell.wrong = false;
      if (cell.spriteId === "o") win = false;
    }
  });
  const won = win && found === this.n;

  const wolf = this.wolfRow < 0 ? null : this.cells[this.wolfRow][this.wolfCol];
  this.wolfShown = !!(won && wolf);
  let wolfRight = false;
  let wolfWrongs = 0;
  const self = this;
  this.each(function (cell, r, c) {
    if (!cell.is("cave")) return;
    if (cell.guessId === "o") {
      if (self.isWolfAt(r, c)) {
        wolfRight = true;
        cell.wrong = false;
      } else {
        cell.wrong = true;
        wolfWrongs++;
      }
    } else {
      cell.wrong = false;
    }
    if (!self.isWolfAt(r, c)) cell.locked = false;
  });
  if (wolf) wolf.locked = !!(won && wolfRight && wolfWrongs === 0);

  return { win: won, rights: rights, wrongs: wrongs };
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
    unique: this.unique,
    wolfShown: !!this.wolfShown,
    wolfRow: this.wolfRow,
    wolfCol: this.wolfCol,
    hawk: this.hawk || null,
    plan: Grid.normalizePlan(this.plan, this.n),
    cells: cells,
  };
};

Grid.load = function (data) {
  if (!data || !data.n || !data.cells) return null;
  const rows = data.n | 0;
  const cols = data.cols | 0 || rows;
  if (data.cells.length !== rows * cols) return null;
  const grid = new Grid(rows, cols);
  grid.unique = !!data.unique;
  grid.wolfShown = !!data.wolfShown;
  grid.plan = Grid.normalizePlan(data.fieldPlan || data.plan, data.n);
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
      var kind =
        src.type ||
        src.specialId ||
          (src.pond ? "water" : src.cave || src.wolf ? "cave" : src.bunny ? "bunny" : src.hawk ? "hawk" : "grass");
      if (kind === "pond") kind = "water";
      cell.setType(kind);
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
