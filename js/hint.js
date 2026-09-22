/**
  Local hint painter, gives missed Xs (hint level 2-5, 0-1 are O validty checks elsewhere)
    2 paints 1 missed rule forced logic.
    3 paints 1 missed intersectional logic.
    4 leaks a small group of thruth Xs from the key, always leaves at least 2.
    5 no more 2-4, so paints final truth Xs of an area giving away an O.
 */

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

Hint.prototype.tryLevel2 = function () {
  const g = this.grid;
  const foxes = [];
  for (let r = 0; r < g.n; r++) {
    for (let c = 0; c < g.n; c++) {
      const cell = g.at(r, c);
      if (this.isFoundFox(cell)) foxes.push(cell);
    }
  }
  if (!foxes.length) return 0;

  const rules = this.shuffle(["row", "col", "ring", "dell", "hawk"]);
  this.shuffle(foxes);

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    for (let f = 0; f < foxes.length; f++) {
      const fox = foxes[f];
      const targets = [];
      if (rule === "row") {
        for (let c = 0; c < g.n; c++) {
          if (c === fox.col) continue;
          const cell = g.at(fox.row, c);
          if (this.isEmptyGrass(cell)) targets.push(cell);
        }
      } else if (rule === "col") {
        for (let r = 0; r < g.n; r++) {
          if (r === fox.row) continue;
          const cell = g.at(r, fox.col);
          if (this.isEmptyGrass(cell)) targets.push(cell);
        }
      } else if (rule === "dell") {
        for (let r = 0; r < g.n; r++) {
          for (let c = 0; c < g.n; c++) {
            if (r === fox.row && c === fox.col) continue;
            const cell = g.at(r, c);
            if (cell.dellId !== fox.dellId) continue;
            if (this.isEmptyGrass(cell)) targets.push(cell);
          }
        }
      } else if (rule === "hawk") {
        if (g.hawk && g.onHawkLine(fox.row, fox.col)) {
          for (let r = 0; r < g.n; r++) {
            for (let c = 0; c < g.n; c++) {
              if (r === fox.row && c === fox.col) continue;
              if (!g.onHawkLine(r, c)) continue;
              const cell = g.at(r, c);
              if (this.isEmptyGrass(cell)) targets.push(cell);
            }
          }
        }
      } else {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const r = fox.row + dr;
            const c = fox.col + dc;
            if (r < 0 || c < 0 || r >= g.n || c >= g.n) continue;
            const cell = g.at(r, c);
            if (this.isEmptyGrass(cell)) targets.push(cell);
          }
        }
      }
      if (targets.length) return this.applyPrints(targets);
    }
  }
  return 0;
};

Hint.prototype.tryLevel3 = function () {
  const g = this.grid;
  const dells = this.dellMap();
  const batches = [];

  function lineSet(cells, axis) {
    const seen = {};
    const lines = [];
    for (let i = 0; i < cells.length; i++) {
      const v = axis === "row" ? cells[i].row : cells[i].col;
      if (seen[v]) continue;
      seen[v] = true;
      lines.push(v);
    }
    return lines;
  }

  function isStrip(cells) {
    if (!cells.length) return false;
    return lineSet(cells, "row").length === 1 || lineSet(cells, "col").length === 1;
  }

  for (const id in dells) {
    const cells = dells[id];
    if (!cells.length) continue;
    const rows = lineSet(cells, "row");
    const cols = lineSet(cells, "col");
    const out = [];
    if (rows.length === 1) {
      const r = rows[0];
      for (let c = 0; c < g.n; c++) {
        const cell = g.at(r, c);
        if (cell.dellId === cells[0].dellId) continue;
        if (this.isEmptyGrass(cell)) out.push(cell);
      }
    } else if (cols.length === 1) {
      const c = cols[0];
      for (let r = 0; r < g.n; r++) {
        const cell = g.at(r, c);
        if (cell.dellId === cells[0].dellId) continue;
        if (this.isEmptyGrass(cell)) out.push(cell);
      }
    }
    if (out.length) batches.push(out);
  }

  const ids = [];
  for (const id in dells) ids.push(+id);
  const axes = ["row", "col"];
  for (let ax = 0; ax < axes.length; ax++) {
    const axis = axes[ax];
    for (let a = 0; a < g.n - 1; a++) {
      const b = a + 1;
      const contained = [];
      for (let i = 0; i < ids.length; i++) {
        const cells = dells[ids[i]];
        let ok = cells.length > 0;
        for (let k = 0; k < cells.length && ok; k++) {
          const v = axis === "row" ? cells[k].row : cells[k].col;
          if (v !== a && v !== b) ok = false;
        }
        if (ok) contained.push(ids[i]);
      }
      if (contained.length !== 2) continue;
      if (isStrip(dells[contained[0]]) && isStrip(dells[contained[1]])) continue;
      const keep = {};
      keep[contained[0]] = true;
      keep[contained[1]] = true;
      const targets = [];
      for (let i = 0; i < g.n; i++) {
        for (let k = 0; k < 2; k++) {
          const line = k === 0 ? a : b;
          const cell = axis === "row" ? g.at(line, i) : g.at(i, line);
          if (!this.isEmptyGrass(cell)) continue;
          if (keep[cell.dellId]) continue;
          targets.push(cell);
        }
      }
      if (targets.length) batches.push(targets);
    }
  }

  for (const id in dells) {
    const cells = dells[id];
    const seats = [];
    let dead = false;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (this.isFoundFox(cell)) {
        dead = true;
        break;
      }
      if (cell.locked && cell.guessId === "x") continue;
      if (cell.guessId === "o") continue;
      seats.push(cell);
    }
    if (dead || seats.length < 2 || seats.length > 3) continue;
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
    if (out.length) batches.push(out);
  }

  if (!batches.length) return 0;
  this.shuffle(batches);
  return this.applyPrints(batches[0]);
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
    if (want < 2 || hintable.length < 2) continue;

    const pool = hintable.slice();
    this.shuffle(pool);
    let group = [];
    for (let s = 0; s < pool.length && group.length < 2; s++) {
      group = [pool[s]];
      const seen = {};
      seen[pool[s].row + "," + pool[s].col] = true;
      const edge = [pool[s]];
      while (group.length < want && edge.length) {
        const cur = edge.shift();
        const nbs = [];
        for (let i = 0; i < pool.length; i++) {
          if (Math.abs(cur.row - pool[i].row) + Math.abs(cur.col - pool[i].col) === 1) {
            nbs.push(pool[i]);
          }
        }
        this.shuffle(nbs);
        for (let i = 0; i < nbs.length; i++) {
          const k = nbs[i].row + "," + nbs[i].col;
          if (seen[k]) continue;
          seen[k] = true;
          group.push(nbs[i]);
          edge.push(nbs[i]);
          if (group.length >= want) break;
        }
      }
      if (group.length < 2) group = [];
    }
    if (group.length < 2) continue;
    ranks.push({
      size: cells.length,
      unknown: empty.length,
      group: group.slice(0, Math.min(want, group.length)),
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
