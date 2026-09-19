/** Local hint painter. 2/3 paint missed Xs. 4 leaks a small group from the key. */

function Hint(grid) {
  this.grid = grid;
}

Hint.prototype.shuffle = function (arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
};

Hint.prototype.isEmptyGrass = function (cell) {
  return !!(cell && cell.is("grass") && !cell.guessId && !cell.locked);
};

Hint.prototype.isFoundFox = function (cell) {
  return !!(cell && cell.is("grass") && cell.locked && cell.guessId === "o");
};

Hint.prototype.applyPrints = function (cells) {
  let n = 0;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (!this.isEmptyGrass(cell)) continue;
    cell.setGuess("x");
    cell.locked = true;
    n++;
  }
  return n;
};

Hint.prototype.foundFoxes = function () {
  const out = [];
  const g = this.grid;
  for (let r = 0; r < g.n; r++) {
    for (let c = 0; c < g.n; c++) {
      const cell = g.at(r, c);
      if (this.isFoundFox(cell)) out.push(cell);
    }
  }
  return out;
};

Hint.prototype.rowTargets = function (fox) {
  const out = [];
  for (let c = 0; c < this.grid.n; c++) {
    if (c === fox.col) continue;
    const cell = this.grid.at(fox.row, c);
    if (this.isEmptyGrass(cell)) out.push(cell);
  }
  return out;
};

Hint.prototype.colTargets = function (fox) {
  const out = [];
  for (let r = 0; r < this.grid.n; r++) {
    if (r === fox.row) continue;
    const cell = this.grid.at(r, fox.col);
    if (this.isEmptyGrass(cell)) out.push(cell);
  }
  return out;
};

Hint.prototype.dellTargets = function (fox) {
  const out = [];
  const g = this.grid;
  for (let r = 0; r < g.n; r++) {
    for (let c = 0; c < g.n; c++) {
      if (r === fox.row && c === fox.col) continue;
      const cell = g.at(r, c);
      if (cell.dellId !== fox.dellId) continue;
      if (this.isEmptyGrass(cell)) out.push(cell);
    }
  }
  return out;
};

Hint.prototype.ringTargets = function (fox) {
  const out = [];
  const g = this.grid;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const r = fox.row + dr;
      const c = fox.col + dc;
      if (r < 0 || c < 0 || r >= g.n || c >= g.n) continue;
      const cell = g.at(r, c);
      if (this.isEmptyGrass(cell)) out.push(cell);
    }
  }
  return out;
};

Hint.prototype.level2Targets = function (rule, fox) {
  if (rule === "row") return this.rowTargets(fox);
  if (rule === "col") return this.colTargets(fox);
  if (rule === "dell") return this.dellTargets(fox);
  return this.ringTargets(fox);
};

Hint.prototype.tryLevel2 = function () {
  const foxes = this.foundFoxes();
  if (!foxes.length) return 0;
  const rules = this.shuffle(["row", "col", "ring", "dell"]);
  this.shuffle(foxes);
  for (let i = 0; i < rules.length; i++) {
    for (let f = 0; f < foxes.length; f++) {
      const targets = this.level2Targets(rules[i], foxes[f]);
      if (targets.length) return this.applyPrints(targets);
    }
  }
  return 0;
};

Hint.prototype.dellMap = function () {
  const map = {};
  const g = this.grid;
  for (let r = 0; r < g.n; r++) {
    for (let c = 0; c < g.n; c++) {
      const cell = g.at(r, c);
      if (!cell.is("grass") || cell.dellId < 0) continue;
      if (!map[cell.dellId]) map[cell.dellId] = [];
      map[cell.dellId].push(cell);
    }
  }
  return map;
};

Hint.prototype.lineSet = function (cells, axis) {
  const seen = {};
  const lines = [];
  for (let i = 0; i < cells.length; i++) {
    const v = axis === "row" ? cells[i].row : cells[i].col;
    if (seen[v]) continue;
    seen[v] = true;
    lines.push(v);
  }
  return lines;
};

Hint.prototype.stripTargets = function (cells) {
  if (!cells.length) return [];
  const id = cells[0].dellId;
  const rows = this.lineSet(cells, "row");
  const cols = this.lineSet(cells, "col");
  const out = [];
  const g = this.grid;
  if (rows.length === 1) {
    const r = rows[0];
    for (let c = 0; c < g.n; c++) {
      const cell = g.at(r, c);
      if (cell.dellId === id) continue;
      if (this.isEmptyGrass(cell)) out.push(cell);
    }
    return out;
  }
  if (cols.length === 1) {
    const c = cols[0];
    for (let r = 0; r < g.n; r++) {
      const cell = g.at(r, c);
      if (cell.dellId === id) continue;
      if (this.isEmptyGrass(cell)) out.push(cell);
    }
  }
  return out;
};

Hint.prototype.containedIn = function (cells, axis, a, b) {
  for (let i = 0; i < cells.length; i++) {
    const v = axis === "row" ? cells[i].row : cells[i].col;
    if (v !== a && v !== b) return false;
  }
  return cells.length > 0;
};

Hint.prototype.twoLineTargets = function (axis, a, b, keep) {
  const g = this.grid;
  const out = [];
  for (let i = 0; i < g.n; i++) {
    for (let k = 0; k < 2; k++) {
      const line = k === 0 ? a : b;
      const cell = axis === "row" ? g.at(line, i) : g.at(i, line);
      if (!this.isEmptyGrass(cell)) continue;
      if (keep[cell.dellId]) continue;
      out.push(cell);
    }
  }
  return out;
};

Hint.prototype.isStripDell = function (cells) {
  if (!cells.length) return false;
  return this.lineSet(cells, "row").length === 1 || this.lineSet(cells, "col").length === 1;
};

Hint.prototype.twoLineBatches = function (dells) {
  const ids = [];
  for (const id in dells) ids.push(+id);
  const batches = [];
  const n = this.grid.n;
  const axes = ["row", "col"];
  for (let ax = 0; ax < axes.length; ax++) {
    const axis = axes[ax];
    for (let a = 0; a < n - 1; a++) {
      const b = a + 1;
      const contained = [];
      for (let i = 0; i < ids.length; i++) {
        if (this.containedIn(dells[ids[i]], axis, a, b)) contained.push(ids[i]);
      }
      if (contained.length !== 2) continue;
      if (this.isStripDell(dells[contained[0]]) && this.isStripDell(dells[contained[1]])) continue;
      const keep = {};
      keep[contained[0]] = true;
      keep[contained[1]] = true;
      const targets = this.twoLineTargets(axis, a, b, keep);
      if (targets.length) batches.push(targets);
    }
  }
  return batches;
};

Hint.prototype.haloTargets = function (seats) {
  if (seats.length < 2 || seats.length > 3) return [];
  const g = this.grid;
  const mine = {};
  for (let i = 0; i < seats.length; i++) mine[seats[i].row + "," + seats[i].col] = true;
  const out = [];
  for (let r = 0; r < g.n; r++) {
    for (let c = 0; c < g.n; c++) {
      if (mine[r + "," + c]) continue;
      const cell = g.at(r, c);
      if (!this.isEmptyGrass(cell)) continue;
      let all = true;
      for (let i = 0; i < seats.length; i++) {
        if (Math.max(Math.abs(r - seats[i].row), Math.abs(c - seats[i].col)) > 1) {
          all = false;
          break;
        }
      }
      if (all) out.push(cell);
    }
  }
  return out;
};

Hint.prototype.haloFromDell = function (cells) {
  const seats = [];
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (this.isFoundFox(cell)) return [];
    if (cell.locked && cell.guessId === "x") continue;
    if (cell.guessId === "o") continue;
    seats.push(cell);
  }
  if (seats.length < 2 || seats.length > 3) return [];
  return this.haloTargets(seats);
};

Hint.prototype.tryLevel3 = function () {
  const dells = this.dellMap();
  const batches = [];
  for (const id in dells) {
    const strip = this.stripTargets(dells[id]);
    if (strip.length) batches.push(strip);
  }
  const two = this.twoLineBatches(dells);
  for (let i = 0; i < two.length; i++) batches.push(two[i]);
  for (const id in dells) {
    const halo = this.haloFromDell(dells[id]);
    if (halo.length) batches.push(halo);
  }
  if (!batches.length) return 0;
  this.shuffle(batches);
  return this.applyPrints(batches[0]);
};

Hint.prototype.cellKey = function (cell) {
  return cell.row + "," + cell.col;
};

Hint.prototype.orthoTouch = function (a, b) {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
};

Hint.prototype.growGroup = function (hintable, want) {
  if (hintable.length < 2 || want < 2) return [];
  const pool = hintable.slice();
  this.shuffle(pool);
  for (let s = 0; s < pool.length; s++) {
    const group = [pool[s]];
    const seen = {};
    seen[this.cellKey(pool[s])] = true;
    const edge = [pool[s]];
    while (group.length < want && edge.length) {
      const cur = edge.shift();
      const nbs = [];
      for (let i = 0; i < pool.length; i++) {
        if (this.orthoTouch(cur, pool[i])) nbs.push(pool[i]);
      }
      this.shuffle(nbs);
      for (let i = 0; i < nbs.length; i++) {
        const k = this.cellKey(nbs[i]);
        if (seen[k]) continue;
        seen[k] = true;
        group.push(nbs[i]);
        edge.push(nbs[i]);
        if (group.length >= want) break;
      }
    }
    if (group.length >= 2) return group.slice(0, Math.min(want, group.length));
  }
  return [];
};

Hint.prototype.tryLevel4 = function () {
  const dells = this.dellMap();
  const ranks = [];
  for (const id in dells) {
    const cells = dells[id];
    const empty = [];
    const hintable = [];
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (!this.isEmptyGrass(cell)) continue;
      empty.push(cell);
      if (cell.spriteId !== "o") hintable.push(cell);
    }
    const keep = empty.length - 2;
    if (keep < 1) continue;
    const want = Math.min(3, hintable.length, keep);
    if (want < 2) continue;
    const group = this.growGroup(hintable, want);
    if (group.length < 2) continue;
    ranks.push({
      size: cells.length,
      unknown: empty.length,
      group: group,
    });
  }
  ranks.sort(function (a, b) {
    if (a.size !== b.size) return a.size - b.size;
    return a.unknown - b.unknown;
  });
  if (!ranks.length) return 0;
  return this.applyPrints(ranks[0].group);
};

Hint.prototype.tryLevel5 = function () {
  const dells = this.dellMap();
  const batches = [];
  for (const id in dells) {
    const cells = dells[id];
    const xs = [];
    let foxOpen = false;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (cell.spriteId === "o" && !this.isFoundFox(cell)) foxOpen = true;
      if (this.isEmptyGrass(cell) && cell.spriteId !== "o") xs.push(cell);
    }
    if (foxOpen && xs.length) batches.push(xs);
  }
  if (!batches.length) return 0;
  this.shuffle(batches);
  return this.applyPrints(batches[0]);
};

Hint.prototype.apply = function () {
  if (this.tryLevel2()) return 2;
  if (this.tryLevel3()) return 3;
  if (this.tryLevel4()) return 4;
  if (this.tryLevel5()) return 5;
  return 0;
};
