/**
  Local hint painter, missed Xs only (hint level 2-5; 0-1 are O checks elsewhere).
    2 forced from a found fox: {row, col, ring, dell}, then {bunny, hawk, wolf}.
    3 intersection: one-line, then halo, then two-line; then {bunny, hawk}.
    4 leak: cut one fox-free row/run off a live dell, leave at least 2 unknowns.
    5 giveaway: last truth Xs of a dell, leaving the O.
  Col-shaped lines are runs (tree split). Prints only land on blank unlocked grass.
 */

/* 
Hint Tree (worded for the player)
-----------

notes, dells are ranges to player.

L0: Two guessed foxes conflict (row, run, range, ring, or extra). Mark both yellow.
L1: Check guessed foxes. Correct marked green and locked, incorrect marked red.

L2: pool 1, fox sight rules (any order)
L2.1.1: Mark off the rest of the row of a found fox.
L2.1.2: Mark off the rest of the run of a found fox.
L2.1.3: Mark off the rest of the ring spots of a found fox.
L2.1.4: Mark off the rest of the range of a found fox.

L2: pool 2 (any order)
L2.2.5: Both foxes next to the bunny found. Mark off the rest.
L2.2.6: Found the fox on the hawk line. Mark off the rest of the line.
L2.2.7: Adjacent to every cave cell. Mark it off.

L3: rule intersections (in order)
L3.1: one-line (row or run) (any order)
L3.1.a: One range's open spots all sit on one row or run. Mark off other opens on that line.
L3.1.b: One row or run holds opens from exactly one range. Mark off that range off the line.

L3.2: Halo. A cell conflicts with every remaining seat of a 2-4 seat range (row, run, touch, or hawk). Mark it off.

L3.3: two-line (rows or runs) (any order)
L3.3.a: Two adjacent lines hold all the opens of exactly two ranges. Mark off other opens on those lines.
L3.3.b: Two adjacent lines hold opens from exactly two ranges. Mark off those ranges off the pair.

L3: pool 2 (any order)
L3.4: Exactly two ranges still have a seat on the bunny ring. Mark off their off-ring opens.
L3.5: Exactly one range still has a seat on the hawk line. Mark off its off-line opens.

L4: No more logic can be deduced, Give one fox-free row or run out of a range with no guessed fox.
L5: Nothing left but to give a fox away. Mark off the last unknown spots in a range.
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
    if (cell.spriteId === "o") continue;
    cell.setGuess("x");
    cell.locked = true;
    n++;
  }
  return n;
};

Hint.prototype.dellMap = function () {
  const map = {};
  const g = this.grid;
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const cell = g.at(r, c);
      if (!cell.is("grass") || cell.dellId < 0) continue;
      if (!map[cell.dellId]) map[cell.dellId] = [];
      map[cell.dellId].push(cell);
    }
  }
  return map;
};

Hint.prototype.dellSeats = function (cells) {
  const seats = [];
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (this.isFoundFox(cell)) return null;
    if (cell.locked && cell.guessId === "x") continue;
    if (cell.guessId === "o") continue;
    seats.push(cell);
  }
  return seats;
};

Hint.prototype.conflicts = function (a, b) {
  if (a.row === b.row) return true;
  const ra = this.grid.runKey(a.row, a.col);
  const rb = this.grid.runKey(b.row, b.col);
  if (ra && rb && ra === rb) return true;
  if (Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col)) <= 1) return true;
  const g = this.grid;
  if (g.hawk && g.onHawkLine(a.row, a.col) && g.onHawkLine(b.row, b.col)) return true;
  return false;
};

Hint.prototype.bunnyRing = function () {
  const g = this.grid;
  const bunny = g.findBunny && g.findBunny();
  if (!bunny) return [];
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const r = bunny.row + dr;
      const c = bunny.col + dc;
      if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) continue;
      out.push(g.at(r, c));
    }
  }
  return out;
};

Hint.prototype.caveCells = function () {
  const g = this.grid;
  const out = [];
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const cell = g.at(r, c);
      if (cell.is("cave")) out.push(cell);
    }
  }
  return out;
};

Hint.prototype.boardRuns = function () {
  const g = this.grid;
  const seen = {};
  const list = [];
  for (let c = 0; c < g.cols; c++) {
    for (let r = 0; r < g.rows; r++) {
      const key = g.runKey(r, c);
      if (!key || seen[key]) continue;
      seen[key] = true;
      const bits = key.split(":");
      list.push({ key: key, col: +bits[0], run: +bits[1] });
    }
  }
  return list;
};

Hint.prototype.tryLevel2 = function () {
  const g = this.grid;
  const foxes = [];
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const cell = g.at(r, c);
      if (this.isFoundFox(cell)) foxes.push(cell);
    }
  }

  const self = this;
  function paintRow(fox) {
    const targets = [];
    for (let c = 0; c < g.cols; c++) {
      if (c === fox.col) continue;
      const cell = g.at(fox.row, c);
      if (self.isEmptyGrass(cell)) targets.push(cell);
    }
    return targets;
  }
  function paintRun(fox) {
    const foxRun = g.runKey(fox.row, fox.col);
    const targets = [];
    if (!foxRun) return targets;
    for (let r = 0; r < g.rows; r++) {
      if (r === fox.row) continue;
      if (g.runKey(r, fox.col) !== foxRun) continue;
      const cell = g.at(r, fox.col);
      if (self.isEmptyGrass(cell)) targets.push(cell);
    }
    return targets;
  }
  function paintRing(fox) {
    const targets = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const r = fox.row + dr;
        const c = fox.col + dc;
        if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) continue;
        const cell = g.at(r, c);
        if (self.isEmptyGrass(cell)) targets.push(cell);
      }
    }
    return targets;
  }
  function paintDell(fox) {
    const targets = [];
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        if (r === fox.row && c === fox.col) continue;
        const cell = g.at(r, c);
        if (cell.dellId !== fox.dellId) continue;
        if (self.isEmptyGrass(cell)) targets.push(cell);
      }
    }
    return targets;
  }
  function paintHawk() {
    const targets = [];
    for (let f = 0; f < foxes.length; f++) {
      const fox = foxes[f];
      if (!g.hawk || !g.onHawkLine(fox.row, fox.col)) continue;
      for (let r = 0; r < g.rows; r++) {
        for (let c = 0; c < g.cols; c++) {
          if (r === fox.row && c === fox.col) continue;
          if (!g.onHawkLine(r, c)) continue;
          const cell = g.at(r, c);
          if (self.isEmptyGrass(cell)) targets.push(cell);
        }
      }
      if (targets.length) return targets;
    }
    return targets;
  }
  function paintBunny() {
    const ring = self.bunnyRing();
    if (!ring.length) return [];
    let found = 0;
    for (let i = 0; i < ring.length; i++) {
      if (self.isFoundFox(ring[i])) found++;
    }
    if (found !== 2) return [];
    const targets = [];
    for (let i = 0; i < ring.length; i++) {
      if (self.isEmptyGrass(ring[i])) targets.push(ring[i]);
    }
    return targets;
  }
  function paintWolf() {
    const cave = self.caveCells();
    if (cave.length < 2) return [];
    const targets = [];
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        const cell = g.at(r, c);
        if (!self.isEmptyGrass(cell)) continue;
        let all = true;
        for (let i = 0; i < cave.length; i++) {
          if (Math.max(Math.abs(r - cave[i].row), Math.abs(c - cave[i].col)) > 1) {
            all = false;
            break;
          }
        }
        if (all) targets.push(cell);
      }
    }
    return targets;
  }

  if (foxes.length) {
    const rules = this.shuffle(["row", "col", "ring", "dell"]);
    this.shuffle(foxes);
    for (let i = 0; i < rules.length; i++) {
      for (let f = 0; f < foxes.length; f++) {
        const fox = foxes[f];
        let targets;
        if (rules[i] === "row") targets = paintRow(fox);
        else if (rules[i] === "col") targets = paintRun(fox);
        else if (rules[i] === "ring") targets = paintRing(fox);
        else targets = paintDell(fox);
        if (targets.length) return this.applyPrints(targets);
      }
    }
  }

  const extras = this.shuffle(["bunny", "hawk", "wolf"]);
  for (let i = 0; i < extras.length; i++) {
    let targets;
    if (extras[i] === "bunny") targets = paintBunny();
    else if (extras[i] === "hawk") targets = paintHawk();
    else targets = paintWolf();
    if (targets.length) return this.applyPrints(targets);
  }
  return 0;
};

Hint.prototype.tryLevel3 = function () {
  const g = this.grid;
  const dells = this.dellMap();
  const ids = [];
  const seatsOf = {};
  for (const id in dells) {
    const seats = this.dellSeats(dells[id]);
    if (!seats || !seats.length) continue;
    ids.push(+id);
    seatsOf[id] = seats;
  }

  function onRows(cell, a, b) {
    return cell.row === a || cell.row === b;
  }

  function onRuns(cell, ka, kb) {
    const key = g.runKey(cell.row, cell.col);
    return !!(key && (key === ka || key === kb));
  }

  const opensOf = {};
  for (const id in dells) {
    const cells = dells[id];
    const opens = [];
    for (let i = 0; i < cells.length; i++) {
      if (this.isEmptyGrass(cells[i])) opens.push(cells[i]);
    }
    if (opens.length) opensOf[id] = opens;
  }

  const ones = [];
  const halos = [];
  const twos = [];
  const self = this;

  function oneLine(onLine, eachOnLine) {
    const closed = [];
    const touching = [];
    for (const id in opensOf) {
      const opens = opensOf[id];
      let any = false;
      let all = true;
      for (let k = 0; k < opens.length; k++) {
        if (onLine(opens[k])) any = true;
        else all = false;
      }
      if (any) touching.push(+id);
      if (any && all) closed.push(+id);
    }
    if (closed.length === 1) {
      const keep = closed[0];
      const out = [];
      eachOnLine(function (cell) {
        if (!self.isEmptyGrass(cell)) return;
        if (cell.dellId === keep) return;
        out.push(cell);
      });
      if (out.length) ones.push(out);
    }
    if (touching.length === 1) {
      const out = [];
      const opens = opensOf[touching[0]];
      for (let k = 0; k < opens.length; k++) {
        if (!onLine(opens[k])) out.push(opens[k]);
      }
      if (out.length) ones.push(out);
    }
  }

  for (let r = 0; r < g.rows; r++) {
    oneLine(
      function (cell) {
        return cell.row === r;
      },
      function (fn) {
        for (let c = 0; c < g.cols; c++) fn(g.at(r, c));
      }
    );
  }

  const runs = this.boardRuns();
  for (let i = 0; i < runs.length; i++) {
    const key = runs[i].key;
    oneLine(
      function (cell) {
        return g.runKey(cell.row, cell.col) === key;
      },
      function (fn) {
        const col = runs[i].col;
        for (let r = 0; r < g.rows; r++) {
          if (g.runKey(r, col) === key) fn(g.at(r, col));
        }
      }
    );
  }

  function twoLine(onLine, eachOnPair) {
    const closed = [];
    const touching = [];
    for (const id in opensOf) {
      const opens = opensOf[id];
      let any = false;
      let all = true;
      for (let k = 0; k < opens.length; k++) {
        if (onLine(opens[k])) any = true;
        else all = false;
      }
      if (any) touching.push(+id);
      if (any && all) closed.push(+id);
    }
    if (closed.length === 2) {
      const keep = {};
      keep[closed[0]] = true;
      keep[closed[1]] = true;
      const out = [];
      eachOnPair(function (cell) {
        if (!self.isEmptyGrass(cell)) return;
        if (keep[cell.dellId]) return;
        out.push(cell);
      });
      if (out.length) twos.push(out);
    }
    if (touching.length === 2) {
      const out = [];
      for (let n = 0; n < 2; n++) {
        const opens = opensOf[touching[n]];
        for (let k = 0; k < opens.length; k++) {
          if (!onLine(opens[k])) out.push(opens[k]);
        }
      }
      if (out.length) twos.push(out);
    }
  }

  for (let a = 0; a < g.rows - 1; a++) {
    const b = a + 1;
    twoLine(
      function (cell) {
        return onRows(cell, a, b);
      },
      function (fn) {
        for (let r = a; r <= b; r++) {
          for (let c = 0; c < g.cols; c++) fn(g.at(r, c));
        }
      }
    );
  }

  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      if (runs[i].run !== runs[j].run) continue;
      if (Math.abs(runs[i].col - runs[j].col) !== 1) continue;
      const ka = runs[i].key;
      const kb = runs[j].key;
      twoLine(
        function (cell) {
          return onRuns(cell, ka, kb);
        },
        function (fn) {
          for (let r = 0; r < g.rows; r++) {
            for (let c = 0; c < g.cols; c++) {
              const cell = g.at(r, c);
              if (onRuns(cell, ka, kb)) fn(cell);
            }
          }
        }
      );
    }
  }

  for (let i = 0; i < ids.length; i++) {
    const seats = seatsOf[ids[i]];
    if (seats.length < 2 || seats.length > 4) continue;
    const mine = {};
    for (let k = 0; k < seats.length; k++) mine[seats[k].row + "," + seats[k].col] = true;
    const out = [];
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        if (mine[r + "," + c]) continue;
        const cell = g.at(r, c);
        if (!this.isEmptyGrass(cell)) continue;
        let all = true;
        for (let k = 0; k < seats.length; k++) {
          if (!this.conflicts(cell, seats[k])) {
            all = false;
            break;
          }
        }
        if (all) out.push(cell);
      }
    }
    if (out.length) halos.push(out);
  }

  if (ones.length) {
    this.shuffle(ones);
    return this.applyPrints(ones[0]);
  }
  if (halos.length) {
    this.shuffle(halos);
    return this.applyPrints(halos[0]);
  }
  if (twos.length) {
    this.shuffle(twos);
    return this.applyPrints(twos[0]);
  }

  const extras = this.shuffle(["bunny", "hawk"]);
  for (let e = 0; e < extras.length; e++) {
    const targets = [];
    if (extras[e] === "bunny") {
      const ring = this.bunnyRing();
      if (ring.length) {
        const onRing = {};
        let found = 0;
        const foundDells = {};
        for (let i = 0; i < ring.length; i++) {
          const cell = ring[i];
          onRing[cell.row + "," + cell.col] = true;
          if (this.isFoundFox(cell)) {
            found++;
            foundDells[cell.dellId] = true;
          }
        }
        const touching = [];
        for (const id in seatsOf) {
          const seats = seatsOf[id];
          let any = false;
          for (let i = 0; i < seats.length; i++) {
            if (onRing[seats[i].row + "," + seats[i].col]) {
              any = true;
              break;
            }
          }
          if (any) touching.push(+id);
        }
        let pick = [];
        if (found === 2) {
          for (const id in foundDells) pick.push(+id);
        } else if (touching.length === 2) {
          pick = touching;
        } else if (found === 1 && touching.length === 1) {
          pick = touching;
        }
        for (let i = 0; i < pick.length; i++) {
          const cells = dells[pick[i]];
          if (!cells) continue;
          for (let k = 0; k < cells.length; k++) {
            const cell = cells[k];
            if (onRing[cell.row + "," + cell.col]) continue;
            if (this.isEmptyGrass(cell)) targets.push(cell);
          }
        }
      }
    } else if (g.hawk) {
      const touching = [];
      let foundDell = -1;
      for (const id in seatsOf) {
        const seats = seatsOf[id];
        let any = false;
        for (let i = 0; i < seats.length; i++) {
          if (g.onHawkLine(seats[i].row, seats[i].col)) {
            any = true;
            break;
          }
        }
        if (any) touching.push(+id);
      }
      for (let r = 0; r < g.rows; r++) {
        for (let c = 0; c < g.cols; c++) {
          if (!g.onHawkLine(r, c)) continue;
          const cell = g.at(r, c);
          if (this.isFoundFox(cell)) foundDell = cell.dellId;
        }
      }
      const pick = foundDell >= 0 ? foundDell : touching.length === 1 ? touching[0] : -1;
      if (pick >= 0 && dells[pick]) {
        const cells = dells[pick];
        for (let i = 0; i < cells.length; i++) {
          const cell = cells[i];
          if (g.onHawkLine(cell.row, cell.col)) continue;
          if (this.isEmptyGrass(cell)) targets.push(cell);
        }
      }
    }
    if (targets.length) return this.applyPrints(targets);
  }
  return 0;
};

Hint.prototype.tryLevel4 = function () {
  const g = this.grid;
  const dells = this.dellMap();
  let best = null;

  for (const id in dells) {
    const cells = dells[id];
    const empty = [];
    let fox = null;
    let guessed = false;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (cell.guessId === "o") guessed = true;
      if (cell.spriteId === "o") fox = cell;
      if (this.isEmptyGrass(cell)) empty.push(cell);
    }
    if (guessed || !fox || empty.length < 3) continue;

    const lines = [];
    const seen = {};
    for (let i = 0; i < empty.length; i++) {
      const cell = empty[i];
      const rowKey = "r:" + cell.row;
      if (!seen[rowKey]) {
        seen[rowKey] = true;
        lines.push({ kind: "row", id: cell.row });
      }
      const run = g.runKey(cell.row, cell.col);
      if (run) {
        const runKey = "n:" + run;
        if (!seen[runKey]) {
          seen[runKey] = true;
          lines.push({ kind: "run", id: run });
        }
      }
    }

    const foxRun = g.runKey(fox.row, fox.col);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.kind === "row" && line.id === fox.row) continue;
      if (line.kind === "run" && line.id === foxRun) continue;
      const group = [];
      for (let k = 0; k < empty.length; k++) {
        const cell = empty[k];
        if (line.kind === "row") {
          if (cell.row === line.id) group.push(cell);
        } else if (g.runKey(cell.row, cell.col) === line.id) {
          group.push(cell);
        }
      }
      if (group.length < 1) continue;
      if (empty.length - group.length < 2) continue;
      if (!best || group.length > best.length) best = group;
    }
  }

  if (!best) return 0;
  return this.applyPrints(best);
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
