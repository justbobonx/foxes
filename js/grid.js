/** N x N cells. One O per row and column. Types mark holes. Live board only. */

const HOLE_DELL = -2;

function Grid(n) {
  this.n = n;
  this.plan = { size: n, features: [] };
  this.unique = false;
  this.wolfShown = false;
  this.wolfRow = -1;
  this.wolfCol = -1;
  this.hawk = null;
  this.cells = [];
  for (let r = 0; r < n; r++) {
    const row = [];
    for (let c = 0; c < n; c++) row.push(new Cell(r, c));
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
      if (!f || !f.type) continue;
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
  }
  return { size: size | 0, features: features };
};

Grid.prototype.at = function (row, col) {
  return this.cells[row][col];
};

Grid.prototype.inBoard = function (r, c) {
  return r >= 0 && c >= 0 && r < this.n && c < this.n;
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
  if (!this.hawk) return false;
  const onDiag = this.hawk === "L" ? row === col : row + col === this.n - 1;
  if (!onDiag) return false;
  const hawkCol = this.hawk === "L" ? 0 : this.n - 1;
  return !(row === 0 && col === hawkCol);
};

Grid.prototype.findBunny = function () {
  for (let r = 0; r < this.n; r++) {
    for (let c = 0; c < this.n; c++) {
      if (this.cells[r][c].is("bunny")) return this.cells[r][c];
    }
  }
  return null;
};

Grid.prototype.foxSeatOk = function (row, col) {
  if (row < 0 || col < 0 || row >= this.n || col >= this.n) return false;
  if (this.isHole(row, col)) return false;
  if (this.nearWolf(row, col)) return false;
  return true;
};

Grid.prototype.setSprite = function (row, col, id) {
  this.cells[row][col].setSprite(id);
};

Grid.prototype.clearSprites = function () {
  for (let r = 0; r < this.n; r++) {
    for (let c = 0; c < this.n; c++) {
      this.cells[r][c].clearSprite();
      this.cells[r][c].clearGuess();
    }
  }
};

Grid.prototype.clearGuesses = function () {
  this.wolfShown = false;
  for (let r = 0; r < this.n; r++) {
    for (let c = 0; c < this.n; c++) this.cells[r][c].clearGuess();
  }
};

Grid.prototype.guessOCount = function () {
  let n = 0;
  for (let r = 0; r < this.n; r++) {
    for (let c = 0; c < this.n; c++) {
      const cell = this.cells[r][c];
      if (cell.guessId === "o" && cell.is("grass")) n++;
    }
  }
  return n;
};

Grid.prototype.checkGuesses = function () {
  let win = true;
  let found = 0;
  let rights = 0;
  let wrongs = 0;
  for (let r = 0; r < this.n; r++) {
    for (let c = 0; c < this.n; c++) {
      const cell = this.cells[r][c];
      if (!cell.is("grass")) continue;
      if (cell.warn) {
        win = false;
        continue;
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
    }
  }
  const won = win && found === this.n;

  const wolf = this.wolfRow < 0 ? null : this.cells[this.wolfRow][this.wolfCol];
  this.wolfShown = !!(won && wolf);
  let wolfRight = false;
  let wolfWrongs = 0;
  for (let r = 0; r < this.n; r++) {
    for (let c = 0; c < this.n; c++) {
      const cell = this.cells[r][c];
      if (!cell.is("cave")) continue;
      if (cell.guessId === "o") {
        if (this.isWolfAt(r, c)) {
          wolfRight = true;
          cell.wrong = false;
        } else {
          cell.wrong = true;
          wolfWrongs++;
        }
      } else {
        cell.wrong = false;
      }
      if (!this.isWolfAt(r, c)) cell.locked = false;
    }
  }
  if (wolf) wolf.locked = !!(won && wolfRight && wolfWrongs === 0);

  return { win: won, rights: rights, wrongs: wrongs };
};

Grid.prototype.dump = function () {
  const cells = [];
  for (let r = 0; r < this.n; r++) {
    for (let c = 0; c < this.n; c++) {
      const cell = this.cells[r][c];
      cells.push({
        dellId: cell.dellId,
        type: cell.type,
        spriteId: cell.spriteId,
        guessId: cell.guessId,
        wrong: !!cell.wrong,
        warn: !!cell.warn,
        locked: !!cell.locked,
      });
    }
  }
  return {
    n: this.n,
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
  if (!data || !data.n || !data.cells || data.cells.length !== data.n * data.n) return null;
  const grid = new Grid(data.n);
  grid.unique = !!data.unique;
  grid.wolfShown = !!data.wolfShown;
  grid.plan = Grid.normalizePlan(data.fieldPlan || data.plan, data.n);
  grid.wolfRow = typeof data.wolfRow === "number" ? data.wolfRow : -1;
  grid.wolfCol = typeof data.wolfCol === "number" ? data.wolfCol : -1;
  grid.hawk = data.hawk === "L" || data.hawk === "R" ? data.hawk : null;
  let i = 0;
  for (let r = 0; r < data.n; r++) {
    for (let c = 0; c < data.n; c++) {
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
