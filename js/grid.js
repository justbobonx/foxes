/** N x N cells. One O per row and column. Types mark holes. */

const HOLE_DELL = -2;

function Grid(n) {
  this.n = n;
  this.plan = { n: n, ponds: 0, wolf: false, bunny: false };
  this.tries = 0;
  this.backs = 0;
  this.unique = false;
  this.wolfShown = false;
  this.wolfRow = -1;
  this.wolfCol = -1;
  this.cells = [];
  for (let r = 0; r < n; r++) {
    const row = [];
    for (let c = 0; c < n; c++) row.push(new Cell(r, c));
    this.cells.push(row);
  }
}

Grid.HOLE_DELL = HOLE_DELL;

Grid.prototype.at = function (row, col) {
  return this.cells[row][col];
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

Grid.prototype.findWolf = function () {
  if (this.wolfRow < 0) return null;
  return this.cells[this.wolfRow][this.wolfCol];
};

Grid.prototype.nearWolf = function (row, col) {
  if (this.wolfRow < 0) return false;
  return Math.max(Math.abs(row - this.wolfRow), Math.abs(col - this.wolfCol)) <= 1;
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

Grid.prototype.markWolfCheck = function (won) {
  const wolf = this.findWolf();
  this.wolfShown = !!(won && wolf);
  let right = false;
  let wrongs = 0;
  for (let r = 0; r < this.n; r++) {
    for (let c = 0; c < this.n; c++) {
      const cell = this.cells[r][c];
      if (!cell.is("cave")) continue;
      if (cell.guessId === "o") {
        if (this.isWolfAt(r, c)) {
          right = true;
          cell.wrong = false;
        } else {
          cell.wrong = true;
          wrongs++;
        }
      } else {
        cell.wrong = false;
      }
      if (!this.isWolfAt(r, c)) cell.locked = false;
    }
  }
  if (wolf) wolf.locked = !!(won && right && wrongs === 0);
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
  this.markWolfCheck(won);
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
    plan: this.plan,
    cells: cells,
  };
};

Grid.load = function (data) {
  if (!data || !data.n || !data.cells || data.cells.length !== data.n * data.n) return null;
  const grid = new Grid(data.n);
  grid.unique = !!data.unique;
  grid.wolfShown = !!data.wolfShown;
  grid.plan = data.plan || { n: data.n, ponds: 0, wolf: false, bunny: false };
  grid.wolfRow = typeof data.wolfRow === "number" ? data.wolfRow : -1;
  grid.wolfCol = typeof data.wolfCol === "number" ? data.wolfCol : -1;
  let i = 0;
  for (let r = 0; r < data.n; r++) {
    for (let c = 0; c < data.n; c++) {
      const src = data.cells[i++];
      const cell = grid.cells[r][c];
      cell.dellId = src.dellId;
      cell.spriteId = src.spriteId || null;
      cell.guessId = src.guessId === "w" ? "o" : src.guessId || null;
      cell.wrong = !!src.wrong;
      cell.locked = !!src.locked;
      const kind =
        src.type ||
        src.specialId ||
        (src.pond ? "pond" : src.cave || src.wolf ? "cave" : src.bunny ? "bunny" : "grass");
      cell.setType(kind);
      if (src.wolf) {
        grid.wolfRow = r;
        grid.wolfCol = c;
      }
      if (cell.isHole()) {
        cell.dellId = HOLE_DELL;
        cell.spriteId = null;
      }
    }
  }
  return grid;
};
