/**
  HINT button pass.
    0 clash: guessed foxes that share a row, run, dell, ring, or hawk line. Two guessed wolves. Yellow. Already scored stays put.
    1 check: lock a correct fox or wolf, paint a miss red. Win is N locked foxes and no wolf miss.
    2 found leftovers: {row, run, ring, dell}, then {bunny, hawk, wolf}.
    3 basics in order: one-line, halo, two-line, three-line; then extras {bunny, hawk, cave}.
    4 leak: cut one fox-free row/run off a live dell, leave at least 2 unknowns.
    5 giveaway: last truth Xs of a dell, leaving the O.
  Col-shaped lines are runs. Prints land on blank unlocked grass, and on blank caves when a rule names them.
  apply() returns { level, id, win, warns, wrongs, rights, reason, prints }.
  id is a StoryPages key, or "". Green locks and a win leave id empty.
  reason and prints are empty on a clash or a miss. Those rings already show.
  Prints do not run if 0 or 1 fired.
 */

/*
Hint Tree (worded for the player)
-----------
notes:
- dells are ranges to player.
- a/b pairs are the line intersection subtypes.
   a: ranges sit fully on the line, mark the other opens there.
   b: the line holds opens from exactly those ranges, mark those ranges off the line.

L0: Two guessed foxes conflict (row, run, range, ring, or extra). Mark both yellow.
L0: Two guessed wolves. Mark both yellow.

L1: Check guessed foxes. Correct marked green and locked, incorrect marked red.
L1: Check guessed wolves. Correct cave marked green and locked, incorrect marked red.

L2: Fox found leftovers
L2.1: Basics, sight rules (any order)
L2.1.1: Mark off the rest of the row of a found fox.
L2.1.2: Mark off the rest of the run of a found fox.
L2.1.3: Mark off the rest of the ring of a found fox, grass and cave spots.
L2.1.4: Mark off the rest of the range of a found fox.

L2.2: Extras (any order)
L2.2.5: Both foxes found next to the bunny. Mark off any other open cells on the bunny ring.
L2.2.6: Found the fox on the hawk line. Mark off any other open cells on the hawk diagonal.
L2.2.7: Found the wolf. Mark X on the other caves, and mark off the grass in its 8-way neighborhood.

L3: rule intersections (in order)
L3.1 Basics
L3.1.1: one-line (row or run) (any order)
L3.1.1.a: One range's open spots all sit on one row or run. Mark off other opens on that line.
L3.1.1.b: One row or run holds opens from exactly one range. Mark off that range off the line.
L3.1.2: Halo. A cell conflicts with every remaining seat of a 2-4 seat range (row, run, touch, or hawk). Mark it off.
L3.1.3: two-line (rows or runs) (any order)
L3.1.3.a: Two adjacent lines hold all the opens of exactly two ranges. Mark off other opens on those lines.
L3.1.3.b: Two adjacent lines hold opens from exactly two ranges. Mark off those ranges off the pair.
L3.1.4: three-line (rows or runs) (any order)
L3.1.4.a: Three adjacent lines hold all the opens of exactly three ranges. Mark off other opens on those lines.
L3.1.4.b: Three adjacent lines hold opens from exactly three ranges. Mark off those ranges off the triple.

L3.2 Extras (any order)
L3.2.1: bunny ring (any order)
L3.2.1.a: Two ranges have all their open spots on the bunny ring. Mark off other opens on the ring.
L3.2.1.b: Fewer than two foxes found, and the ring holds opens from exactly two ranges. Mark off those ranges off the ring.
L3.2.2: hawk diagonal (any order)
L3.2.2.a: One range has all its open spots on the hawk diagonal. Mark off other opens on the diagonal.
L3.2.2.b: No fox found on the diagonal, and it holds opens from exactly one range. Mark off that range off the diagonal.
L3.2.3: Any spot that touches all cave cells can be marked off.

L4: No more logic can be deduced. Give one fox-free row or run out of a range with no guessed fox.
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

Hint.prototype.isEmptyCave = function (cell) {
  return !!(cell && cell.is("cave") && !cell.guessId && !cell.locked);
};

Hint.prototype.isFoundFox = function (cell) {
  return !!(cell && cell.is("grass") && cell.locked && cell.guessId === "o");
};

Hint.prototype.isFoundWolf = function (cell) {
  return !!(
    cell &&
    cell.is("cave") &&
    cell.locked &&
    cell.guessId === "o" &&
    this.grid.isWolfAt(cell.row, cell.col)
  );
};

Hint.prototype.applyPrints = function (cells) {
  const painted = [];
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const cave = this.isEmptyCave(cell);
    if (!cave && !this.isEmptyGrass(cell)) continue;
    if (!cave && cell.spriteId === "o") continue;
    cell.setGuess("x");
    cell.locked = true;
    painted.push(cell);
  }
  return painted;
};

Hint.prototype.pack = function (id, reason, prints) {
  return { id: id, reason: reason || [], prints: this.applyPrints(prints || []) };
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
  if (a.dellId >= 0 && a.dellId === b.dellId) return true;
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
  let wolf = null;
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const cell = g.at(r, c);
      if (this.isFoundFox(cell)) foxes.push(cell);
      if (this.isFoundWolf(cell)) wolf = cell;
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
        if (self.isEmptyGrass(cell) || self.isEmptyCave(cell)) targets.push(cell);
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
    if (!wolf) return [];
    const targets = [];
    const caves = self.caveCells();
    for (let i = 0; i < caves.length; i++) {
      const cell = caves[i];
      if (cell.row === wolf.row && cell.col === wolf.col) continue;
      if (self.isEmptyCave(cell)) targets.push(cell);
    }
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const r = wolf.row + dr;
        const c = wolf.col + dc;
        if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) continue;
        const cell = g.at(r, c);
        if (self.isEmptyGrass(cell)) targets.push(cell);
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
        if (targets.length) {
          const id = rules[i] === "row" ? "L2.1.1" : rules[i] === "col" ? "L2.1.2" : rules[i] === "ring" ? "L2.1.3" : "L2.1.4";
          return this.pack(id, [fox], targets);
        }
      }
    }
  }

  const extras = this.shuffle(["bunny", "hawk", "wolf"]);
  for (let i = 0; i < extras.length; i++) {
    let targets;
    let reason = [];
    let id = "";
    if (extras[i] === "bunny") {
      targets = paintBunny();
      id = "L2.2.5";
      const ring = this.bunnyRing();
      for (let k = 0; k < ring.length; k++) if (this.isFoundFox(ring[k])) reason.push(ring[k]);
    } else if (extras[i] === "hawk") {
      targets = paintHawk();
      id = "L2.2.6";
      for (let f = 0; f < foxes.length; f++) {
        if (g.hawk && g.onHawkLine(foxes[f].row, foxes[f].col)) reason.push(foxes[f]);
      }
    } else {
      targets = paintWolf();
      id = "L2.2.7";
      if (wolf) reason = [wolf];
    }
    if (targets.length) return this.pack(id, reason, targets);
  }
  return null;
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

  function onRows(cell, rows) {
    for (let i = 0; i < rows.length; i++) if (cell.row === rows[i]) return true;
    return false;
  }

  function onRuns(cell, keys) {
    const key = g.runKey(cell.row, cell.col);
    if (!key) return false;
    for (let i = 0; i < keys.length; i++) if (key === keys[i]) return true;
    return false;
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
  const threes = [];
  const self = this;

  function lineHit(need, onLine, eachOnLine, bucket) {
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
    const idA = need === 1 ? "L3.1.1.a" : need === 2 ? "L3.1.3.a" : "L3.1.4.a";
    const idB = need === 1 ? "L3.1.1.b" : need === 2 ? "L3.1.3.b" : "L3.1.4.b";
    if (closed.length === need) {
      const keep = {};
      for (let i = 0; i < closed.length; i++) keep[closed[i]] = true;
      const prints = [];
      const reason = [];
      eachOnLine(function (cell) {
        if (!self.isEmptyGrass(cell)) return;
        if (keep[cell.dellId]) reason.push(cell);
        else prints.push(cell);
      });
      if (prints.length) bucket.push({ id: idA, reason: reason, prints: prints });
    }
    if (touching.length === need) {
      const prints = [];
      const reason = [];
      for (let n = 0; n < touching.length; n++) {
        const opens = opensOf[touching[n]];
        for (let k = 0; k < opens.length; k++) {
          if (onLine(opens[k])) reason.push(opens[k]);
          else prints.push(opens[k]);
        }
      }
      if (prints.length) bucket.push({ id: idB, reason: reason, prints: prints });
    }
  }

  for (let r = 0; r < g.rows; r++) {
    lineHit(
      1,
      function (cell) {
        return cell.row === r;
      },
      function (fn) {
        for (let c = 0; c < g.cols; c++) fn(g.at(r, c));
      },
      ones
    );
  }

  const runs = this.boardRuns();
  for (let i = 0; i < runs.length; i++) {
    const key = runs[i].key;
    lineHit(
      1,
      function (cell) {
        return g.runKey(cell.row, cell.col) === key;
      },
      function (fn) {
        const col = runs[i].col;
        for (let r = 0; r < g.rows; r++) {
          if (g.runKey(r, col) === key) fn(g.at(r, col));
        }
      },
      ones
    );
  }

  for (let a = 0; a < g.rows - 1; a++) {
    const rows = [a, a + 1];
    lineHit(
      2,
      function (cell) {
        return onRows(cell, rows);
      },
      function (fn) {
        for (let r = a; r <= a + 1; r++) {
          for (let c = 0; c < g.cols; c++) fn(g.at(r, c));
        }
      },
      twos
    );
  }

  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      if (runs[i].run !== runs[j].run) continue;
      if (Math.abs(runs[i].col - runs[j].col) !== 1) continue;
      const keys = [runs[i].key, runs[j].key];
      lineHit(
        2,
        function (cell) {
          return onRuns(cell, keys);
        },
        function (fn) {
          for (let r = 0; r < g.rows; r++) {
            for (let c = 0; c < g.cols; c++) {
              const cell = g.at(r, c);
              if (onRuns(cell, keys)) fn(cell);
            }
          }
        },
        twos
      );
    }
  }

  for (let a = 0; a < g.rows - 2; a++) {
    const rows = [a, a + 1, a + 2];
    lineHit(
      3,
      function (cell) {
        return onRows(cell, rows);
      },
      function (fn) {
        for (let r = a; r <= a + 2; r++) {
          for (let c = 0; c < g.cols; c++) fn(g.at(r, c));
        }
      },
      threes
    );
  }

  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      for (let k = j + 1; k < runs.length; k++) {
        if (runs[i].run !== runs[j].run || runs[j].run !== runs[k].run) continue;
        const cols = [runs[i].col, runs[j].col, runs[k].col].sort(function (x, y) {
          return x - y;
        });
        if (cols[1] !== cols[0] + 1 || cols[2] !== cols[1] + 1) continue;
        const keys = [runs[i].key, runs[j].key, runs[k].key];
        lineHit(
          3,
          function (cell) {
            return onRuns(cell, keys);
          },
          function (fn) {
            for (let r = 0; r < g.rows; r++) {
              for (let c = 0; c < g.cols; c++) {
                const cell = g.at(r, c);
                if (onRuns(cell, keys)) fn(cell);
              }
            }
          },
          threes
        );
      }
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
    if (out.length) halos.push({ id: "L3.1.2", reason: seats.slice(), prints: out });
  }

  function take(bucket) {
    if (!bucket.length) return null;
    self.shuffle(bucket);
    const hit = bucket[0];
    return self.pack(hit.id, hit.reason, hit.prints);
  }
  const basic = take(ones) || take(halos) || take(twos) || take(threes);
  if (basic) return basic;

  function splitOpens(onLine) {
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
    return { closed: closed, touching: touching };
  }

  function bunnyTargets() {
    const ring = self.bunnyRing();
    if (!ring.length) return null;
    const onRing = {};
    let found = 0;
    for (let i = 0; i < ring.length; i++) {
      const cell = ring[i];
      onRing[cell.row + "," + cell.col] = true;
      if (self.isFoundFox(cell)) found++;
    }
    const hit = splitOpens(function (cell) {
      return !!onRing[cell.row + "," + cell.col];
    });
    const kinds = self.shuffle(["a", "b"]);
    for (let n = 0; n < kinds.length; n++) {
      const prints = [];
      const reason = [];
      let id = "";
      if (kinds[n] === "a" && hit.closed.length === 2) {
        id = "L3.2.1.a";
        const keep = {};
        keep[hit.closed[0]] = true;
        keep[hit.closed[1]] = true;
        for (let i = 0; i < hit.closed.length; i++) {
          const opens = opensOf[hit.closed[i]];
          for (let k = 0; k < opens.length; k++) reason.push(opens[k]);
        }
        for (let i = 0; i < ring.length; i++) {
          const cell = ring[i];
          if (!self.isEmptyGrass(cell)) continue;
          if (keep[cell.dellId]) continue;
          prints.push(cell);
        }
      } else if (kinds[n] === "b" && found < 2 && hit.touching.length === 2 - found) {
        id = "L3.2.1.b";
        for (let i = 0; i < hit.touching.length; i++) {
          const opens = opensOf[hit.touching[i]];
          for (let k = 0; k < opens.length; k++) {
            if (onRing[opens[k].row + "," + opens[k].col]) reason.push(opens[k]);
            else prints.push(opens[k]);
          }
        }
      }
      if (prints.length) return { id: id, reason: reason, prints: prints };
    }
    return null;
  }

  function hawkTargets() {
    if (!g.hawk) return null;
    let found = 0;
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        if (!g.onHawkLine(r, c)) continue;
        if (self.isFoundFox(g.at(r, c))) found++;
      }
    }
    const hit = splitOpens(function (cell) {
      return g.onHawkLine(cell.row, cell.col);
    });
    const kinds = self.shuffle(["a", "b"]);
    for (let n = 0; n < kinds.length; n++) {
      const prints = [];
      const reason = [];
      let id = "";
      if (kinds[n] === "a" && hit.closed.length === 1) {
        id = "L3.2.2.a";
        const keep = hit.closed[0];
        const opens = opensOf[keep] || [];
        for (let k = 0; k < opens.length; k++) reason.push(opens[k]);
        for (let r = 0; r < g.rows; r++) {
          for (let c = 0; c < g.cols; c++) {
            if (!g.onHawkLine(r, c)) continue;
            const cell = g.at(r, c);
            if (!self.isEmptyGrass(cell)) continue;
            if (cell.dellId === keep) continue;
            prints.push(cell);
          }
        }
      } else if (kinds[n] === "b" && found === 0 && hit.touching.length === 1) {
        id = "L3.2.2.b";
        const opens = opensOf[hit.touching[0]];
        for (let k = 0; k < opens.length; k++) {
          if (g.onHawkLine(opens[k].row, opens[k].col)) reason.push(opens[k]);
          else prints.push(opens[k]);
        }
      }
      if (prints.length) return { id: id, reason: reason, prints: prints };
    }
    return null;
  }

  function caveTargets() {
    const cave = self.caveCells();
    if (cave.length < 2) return null;
    const out = [];
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
        if (all) out.push(cell);
      }
    }
    if (!out.length) return null;
    return { id: "L3.2.3", reason: cave, prints: out };
  }

  const extras = this.shuffle(["bunny", "hawk", "cave"]);
  for (let e = 0; e < extras.length; e++) {
    let hit = null;
    if (extras[e] === "bunny") hit = bunnyTargets();
    else if (extras[e] === "hawk") hit = hawkTargets();
    else hit = caveTargets();
    if (hit) return this.pack(hit.id, hit.reason, hit.prints);
  }
  return null;
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
      if (!best || group.length > best.length) {
        const reason = [];
        if (fox) reason.push(fox);
        for (let k = 0; k < empty.length; k++) {
          if (group.indexOf(empty[k]) >= 0) continue;
          reason.push(empty[k]);
        }
        best = { reason: reason, prints: group };
      }
    }
  }

  if (!best) return null;
  return this.pack("L4", best.reason, best.prints);
};

Hint.prototype.tryLevel5 = function () {
  const dells = this.dellMap();
  const batches = [];
  for (const id in dells) {
    const cells = dells[id];
    const xs = [];
    let fox = null;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (cell.spriteId === "o" && !this.isFoundFox(cell)) fox = cell;
      if (this.isEmptyGrass(cell) && cell.spriteId !== "o") xs.push(cell);
    }
    if (fox && xs.length) batches.push({ reason: [fox], prints: xs });
  }
  if (!batches.length) return null;
  this.shuffle(batches);
  return this.pack("L5", batches[0].reason, batches[0].prints);
};

Hint.prototype.tryLevel0 = function () {
  const g = this.grid;
  const foxes = [];
  const wolves = [];
  g.each(function (cell) {
    cell.warn = false;
    if (cell.is("grass") && cell.guessId === "o") foxes.push(cell);
    if (cell.is("cave") && cell.guessId === "o") wolves.push(cell);
  });
  function scored(cell) {
    return !!(cell.locked || cell.wrong);
  }
  for (let i = 0; i < foxes.length; i++) {
    for (let j = i + 1; j < foxes.length; j++) {
      if (!this.conflicts(foxes[i], foxes[j])) continue;
      if (!scored(foxes[i])) foxes[i].warn = true;
      if (!scored(foxes[j])) foxes[j].warn = true;
    }
  }
  let wolfWarn = 0;
  if (wolves.length >= 2) {
    for (let i = 0; i < wolves.length; i++) {
      if (scored(wolves[i])) continue;
      wolves[i].warn = true;
      wolfWarn++;
    }
  }
  let foxWarn = 0;
  for (let i = 0; i < foxes.length; i++) if (foxes[i].warn) foxWarn++;
  const warns = foxWarn + wolfWarn;
  if (!warns) return null;
  return { warns: warns, id: foxWarn ? "L0" : "L0.wolf" };
};

Hint.prototype.tryLevel1 = function () {
  const g = this.grid;
  let win = true;
  let found = 0;
  let rights = 0;
  let wrongs = 0;
  g.each(function (cell) {
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
  let wolfWrongs = 0;
  g.each(function (cell, r, c) {
    if (!cell.is("cave")) return;
    if (cell.warn) {
      win = false;
      return;
    }
    if (cell.guessId === "o") {
      if (g.isWolfAt(r, c)) {
        if (!cell.locked) rights++;
        cell.locked = true;
        cell.wrong = false;
      } else {
        cell.wrong = true;
        win = false;
        wolfWrongs++;
      }
    } else {
      cell.wrong = false;
    }
  });
  const bad = wrongs + wolfWrongs;
  const won = win && found === g.n && wolfWrongs === 0;
  g.wolfShown = !!(won && g.wolfRow >= 0);
  let id = "";
  if (bad) id = wrongs ? "L1" : "L1.wolf";
  return { win: won, rights: rights, wrongs: bad, id: id };
};

Hint.prototype.blank = function (level, extra) {
  const src = extra || {};
  return {
    level: level,
    id: src.id || "",
    win: !!src.win,
    warns: src.warns || 0,
    wrongs: src.wrongs || 0,
    rights: src.rights || 0,
    reason: src.reason || [],
    prints: src.prints || [],
  };
};

Hint.prototype.apply = function () {
  const clash = this.tryLevel0();
  const check = this.tryLevel1();
  if ((clash && clash.warns) || check.wrongs) {
    return this.blank(check.wrongs ? 1 : 0, {
      id: check.wrongs ? check.id : clash.id,
      warns: clash ? clash.warns : 0,
      wrongs: check.wrongs,
      rights: check.rights,
    });
  }
  if (check.win) return this.blank(1, { win: true, rights: check.rights });
  if (this.grid.guessOCount() >= this.grid.n) return this.blank(0, { rights: check.rights });
  const hit = this.tryLevel2() || this.tryLevel3() || this.tryLevel4() || this.tryLevel5();
  if (!hit) return this.blank(0);
  const level = hit.id.indexOf("L2") === 0 ? 2 : hit.id.indexOf("L3") === 0 ? 3 : hit.id === "L4" ? 4 : 5;
  return this.blank(level, hit);
};
