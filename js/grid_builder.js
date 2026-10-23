/** Fills a Grid from a plan { size, features[] }. */

const MIN_DELL_SIZE = 2;
const DELL_SMALL_SIZE = 3;

const UNIQUE_TRIES = 250;
const WATER_TRIES = 50;
const PACK_TRIES = 8;
const FOX_PLACE_TRIES = 200;
const DELL_PAINT_TRIES = 20; //was 40
const SLICE_MS = 200;

const HAWK_LINE_MIN = 5; // open cells the hawk diagonal needs
const BUNNY_RING_MIN = 6; // open cells the bunny ring needs
const MEANDER_FWD = 0.5; // roll below this: river goes straight
const MEANDER_LEFT = 0.75; // roll below this: river bends left, else right
const TREE_BELL = 0.4; // scales the two-roll bell for tree band length
const TINY_DELLS_MIN = 1;
const TINY_DELLS_MAX = 2;
const SMALL_DELLS_BIG_N = 9; // n from which more small dells are kept
const SMALL_DELLS = 3;
const SMALL_DELLS_BIG = 4;
const CAVE_SIZE = [2, 3];
const POND_MIN_LEVEL = 7;
const POND_SHAPES = [
  [[2, 2], [2, 3], [3, 2]],         // sm pond -   4-6 area                 1 sm
  [[2, 4], [4, 2], [3, 3]],         // md pond -   8-9 area  (sm * 1.5/2)   2 sm
  [[2, 5], [5, 2], [3, 4], [4, 3]], // lg pond - 10-12 area  (sm * 2 / 3)   3 sm
  [[3, 5], [5, 3], [4, 4]],         // lake!   - 15-16 area  (sm * 3 / 4)   4 sm
];
// 4, 6, 6, 8, 8, 9, 10, 10, 12, 12, 15, 15, 16

const DELL_DIRS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

const RIVER_FLOW = {
  n: { dr: -1, dc: 0, far: "n" },
  s: { dr: 1, dc: 0, far: "s" },
  w: { dr: 0, dc: -1, far: "w" },
  e: { dr: 0, dc: 1, far: "e" },
};

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function GridBuilder(plan) {
  this.plan = Plan.copy(plan);
  this.grid = new Grid(this.plan.size, this.plan.size - Plan.treeCount(this.plan));
  this.grid.plan = this.plan;
}

// onSlice returning false cancels the build; it then resolves null.
GridBuilder.buildAsync = function (plan, onSlice) {
  const builder = new GridBuilder(plan);
  builder.startSearch();
  return new Promise(function (resolve) {
    function pump() {
      const result = builder.searchSlice(SLICE_MS);
      if (result === "yield") {
        if (onSlice && onSlice(builder) === false) {
          resolve(null);
          return;
        }
        setTimeout(pump, 0);
        return;
      }
      resolve(result === "done" ? builder.grid : null);
    }
    pump();
  });
};

GridBuilder.prototype.resetLand = function () {
  const g = this.grid;
  g.wolfRow = -1;
  g.wolfCol = -1;
  g.hawk = null;
  g.wolfShown = false;
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const cell = g.cells[r][c];
      cell.type = "grass";
      cell.dellId = -1;
      cell.spriteId = null;
      cell.resetMarks();
    }
  }
};

GridBuilder.prototype.walkRiver = function (r, c, flow) {
  const g = this.grid;
  function paint(rr, cc) {
    if (!g.inBoard(rr, cc)) return false;
    const cell = g.cells[rr][cc];
    if (cell.is("water")) return true;
    if (cell.isHole()) return false;
    cell.type = "water";
    g.markHole(cell);
    return true;
  }
  function onFar(rr, cc) {
    if (flow.far === "n") return rr === 0;
    if (flow.far === "s") return rr === g.rows - 1;
    if (flow.far === "w") return cc === 0;
    return cc === g.cols - 1;
  }
  function sideOk(rr, cc) {
    if (!g.inBoard(rr, cc)) return false;
    const br = rr - flow.dr;
    const bc = cc - flow.dc;
    if (!g.inBoard(br, bc)) return true;
    return !g.cells[br][bc].is("water");
  }

  if (!paint(r, c)) return false;
  if (onFar(r, c)) return true;
  let lastMeander = false;
  const cap = g.rows * g.cols;
  for (let i = 0; i < cap; i++) {
    const fwd = { r: r + flow.dr, c: c + flow.dc };
    let next = null;
    if (lastMeander) {
      next = g.inBoard(fwd.r, fwd.c) ? fwd : null;
    } else {
      const L = { r: r - flow.dc, c: c + flow.dr };
      const R = { r: r + flow.dc, c: c - flow.dr };
      const roll = Math.random();
      if (roll < MEANDER_FWD) {
        next = g.inBoard(fwd.r, fwd.c) ? fwd : null;
      } else if (roll < MEANDER_LEFT) {
        next = sideOk(L.r, L.c) ? L : g.inBoard(fwd.r, fwd.c) ? fwd : null;
      } else {
        next = sideOk(R.r, R.c) ? R : g.inBoard(fwd.r, fwd.c) ? fwd : null;
      }
    }
    if (!next) return false;
    lastMeander = next.r !== r + flow.dr || next.c !== c + flow.dc;
    r = next.r;
    c = next.c;
    if (!paint(r, c)) return false;
    if (onFar(r, c)) return true;
  }
  return false;
};

GridBuilder.prototype.fillWaterIslands = function () {
  const g = this.grid;
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      if (g.cells[r][c].isHole()) continue;
      let grass = false;
      for (let d = 0; d < DELL_DIRS.length; d++) {
        const nr = r + DELL_DIRS[d][0];
        const nc = c + DELL_DIRS[d][1];
        if (!g.inBoard(nr, nc)) continue;
        if (!g.cells[nr][nc].isHole()) {
          grass = true;
          break;
        }
      }
      if (grass) continue;
      const cell = g.cells[r][c];
      cell.type = "water";
      g.markHole(cell);
    }
  }
};

GridBuilder.prototype.placeWater = function () {
  const g = this.grid;
  const river = Plan.riverMode(this.plan);

  for (let t = 0; t < WATER_TRIES; t++) {
    for (let r = 0; r < g.n; r++) {
      for (let c = 0; c < g.cols; c++) {
        const cell = g.cells[r][c];
        if (cell.is("water")) {
          cell.type = "grass";
          cell.dellId = -1;
        }
      }
    }

    if (river === 2) {
      const starts = [];
      for (let c = 2; c <= g.cols - 3; c++) {
        starts.push({ r: 0, c: c, flow: RIVER_FLOW.s });
        starts.push({ r: g.n - 1, c: c, flow: RIVER_FLOW.n });
      }
      for (let r = 2; r <= g.n - 3; r++) {
        starts.push({ r: r, c: 0, flow: RIVER_FLOW.e });
        starts.push({ r: r, c: g.cols - 1, flow: RIVER_FLOW.w });
      }
      if (!starts.length) continue;
      const pick = starts[Math.floor(Math.random() * starts.length)];
      if (!this.walkRiver(pick.r, pick.c, pick.flow)) continue;
    }

    const jobs = Plan.pondSizes(this.plan);

    let pondsOk = true;
    for (let j = 0; j < jobs.length; j++) {
      const size = jobs[j];
      let available;
      if (size > 0 && size <= POND_SHAPES.length) available = POND_SHAPES[size - 1];
      else {
        const groupCount = Math.min(g.n - POND_MIN_LEVEL + 1, POND_SHAPES.length);
        available = groupCount < 1 ? [] : POND_SHAPES.slice(0, groupCount).flat();
      }
      if (!available.length) {
        pondsOk = false;
        break;
      }
      const shape = available[Math.floor(Math.random() * available.length)];
      const spots = [];
      for (let r = 0; r <= g.n - shape[0]; r++) {
        for (let c = 0; c <= g.cols - shape[1]; c++) {
          let fits = r >= 0 && c >= 0 && r + shape[0] <= g.n && c + shape[1] <= g.cols;
          if (fits) {
            for (let rr = r; rr < r + shape[0] && fits; rr++) {
              for (let cc = c; cc < c + shape[1]; cc++) {
                if (g.cells[rr][cc].isHole()) {
                  fits = false;
                  break;
                }
              }
            }
          }
          if (fits) spots.push({ r: r, c: c });
        }
      }
      if (!spots.length) {
        pondsOk = false;
        break;
      }
      const pick = spots[Math.floor(Math.random() * spots.length)];
      for (let r = pick.r; r < pick.r + shape[0]; r++) {
        for (let c = pick.c; c < pick.c + shape[1]; c++) {
          g.cells[r][c].type = "water";
          g.markHole(g.cells[r][c]);
        }
      }
    }
    if (!pondsOk) continue;

    if (river === 1) {
      const ponds = [];
      for (let r = 0; r < g.n; r++) {
        for (let c = 0; c < g.cols; c++) {
          if (g.cells[r][c].is("water")) ponds.push({ r: r, c: c });
        }
      }
      if (!ponds.length) continue;
      const pick = ponds[Math.floor(Math.random() * ponds.length)];
      const opts = [
        { dist: pick.r, flow: RIVER_FLOW.n },
        { dist: g.n - 1 - pick.r, flow: RIVER_FLOW.s },
        { dist: pick.c, flow: RIVER_FLOW.w },
        { dist: g.cols - 1 - pick.c, flow: RIVER_FLOW.e },
      ];
      let best = -1;
      const top = [];
      for (let i = 0; i < opts.length; i++) {
        if (opts[i].dist > best) {
          best = opts[i].dist;
          top.length = 0;
          top.push(opts[i].flow);
        } else if (opts[i].dist === best) {
          top.push(opts[i].flow);
        }
      }
      if (best <= 0 || !top.length) continue;
      const flow = top[Math.floor(Math.random() * top.length)];
      if (!this.walkRiver(pick.r, pick.c, flow)) continue;
    }

    this.fillWaterIslands();

    let linesOk = true;
    for (let r = 0; r < g.n && linesOk; r++) {
      let grass = false;
      for (let c = 0; c < g.cols; c++) {
        if (!g.cells[r][c].is("water")) {
          grass = true;
          break;
        }
      }
      if (!grass) linesOk = false;
    }
    for (let c = 0; c < g.cols && linesOk; c++) {
      let grass = false;
      for (let r = 0; r < g.n; r++) {
        if (!g.cells[r][c].is("water")) {
          grass = true;
          break;
        }
      }
      if (!grass) linesOk = false;
    }
    if (!linesOk) continue;
    return true;
  }
  return false;
};

GridBuilder.prototype.clearCaves = function () {
  const g = this.grid;
  g.wolfRow = -1;
  g.wolfCol = -1;
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const cell = g.cells[r][c];
      if (cell.is("cave")) {
        cell.type = "grass";
        cell.dellId = -1;
      }
    }
  }
};

GridBuilder.prototype.placeCave = function () {
  const g = this.grid;
  this.clearCaves();
  if (!Plan.has(this.plan, "wolf")) return true;
  const seeds = [];
  for (let r = 2; r < g.rows - 2; r++) {
    for (let c = 2; c < g.cols - 2; c++) {
      if (!g.cells[r][c].isHole()) seeds.push({ r: r, c: c });
    }
  }
  if (!seeds.length) return false;
  const start = seeds[Math.floor(Math.random() * seeds.length)];
  const want = CAVE_SIZE[0] + Math.floor(Math.random() * (1 + CAVE_SIZE[1] - CAVE_SIZE[0]));
  const body = [start];
  const seedCell = g.cells[start.r][start.c];
  seedCell.type = "cave";
  g.markHole(seedCell);
  while (body.length < want) {
    const seen = {};
    const opts = [];
    for (let i = 0; i < body.length; i++) {
      for (let d = 0; d < DELL_DIRS.length; d++) {
        const nr = body[i].r + DELL_DIRS[d][0];
        const nc = body[i].c + DELL_DIRS[d][1];
        if (nr < 0 || nc < 0 || nr >= g.rows || nc >= g.cols) continue;
        const key = nr + "," + nc;
        if (seen[key]) continue;
        if (g.cells[nr][nc].isHole()) continue;
        seen[key] = true;
        opts.push({ r: nr, c: nc });
      }
    }
    if (!opts.length) break;
    const pick = opts[Math.floor(Math.random() * opts.length)];
    const cell = g.cells[pick.r][pick.c];
    cell.type = "cave";
    g.markHole(cell);
    body.push(pick);
  }
  if (body.length < 2) {
    this.clearCaves();
    return false;
  }
  const wolfAt = body[Math.floor(Math.random() * body.length)];
  g.wolfRow = wolfAt.r;
  g.wolfCol = wolfAt.c;
  return true;
};

GridBuilder.prototype.bunnyPairs = function (row, col) {
  const seats = this.grid.openRing(row, col);
  const out = [];
  for (let i = 0; i < seats.length; i++) {
    for (let j = i + 1; j < seats.length; j++) {
      const a = seats[i];
      const b = seats[j];
      if (a.row === b.row || a.col === b.col) continue;
      if (Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col)) < 2) continue;
      out.push([a, b]);
    }
  }
  return out;
};

GridBuilder.prototype.placeHawk = function () {
  const g = this.grid;
  g.hawk = null;
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const cell = g.cells[r][c];
      if (cell.is("hawk")) {
        cell.type = "grass";
        cell.dellId = -1;
      }
    }
  }
  if (!Plan.has(this.plan, "hawk") || Plan.has(this.plan, "trees") || g.rows !== g.cols) return true;
  const sides = shuffleInPlace(["L", "R"].slice());
  for (let i = 0; i < sides.length; i++) {
    const side = sides[i];
    const col = side === "L" ? 0 : g.cols - 1;
    if (g.cells[0][col].isHole()) continue;
    let open = 0;
    for (let r = 1; r < g.rows; r++) {
      const c = side === "L" ? r : g.cols - 1 - r;
      if (!g.inBoard(r, c)) continue;
      if (g.cells[r][c].isHole()) continue;
      open++;
    }
    if (open < HAWK_LINE_MIN) continue;
    const cell = g.cells[0][col];
    cell.type = "hawk";
    g.markHole(cell);
    g.hawk = side;
    return true;
  }
  return false;
};

GridBuilder.prototype.placeBunny = function () {
  const g = this.grid;
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const cell = g.cells[r][c];
      if (cell.is("bunny")) {
        cell.type = "grass";
        cell.dellId = -1;
      }
    }
  }
  if (!Plan.has(this.plan, "bunny")) return true;
  const lastR = g.rows - 1;
  const lastC = g.cols - 1;
  const spots = [];
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      if (r === 0 || r === lastR || c === 0 || c === lastC) continue;
      if (g.cells[r][c].isHole()) continue;
      if (g.openRing(r, c).length < BUNNY_RING_MIN) continue;
      if (!this.bunnyPairs(r, c).length) continue;
      spots.push({ r: r, c: c });
    }
  }
  if (!spots.length) return false;
  const pick = spots[Math.floor(Math.random() * spots.length)];
  const cell = g.cells[pick.r][pick.c];
  cell.type = "bunny";
  g.markHole(cell);
  return true;
};

GridBuilder.prototype.grassMasses = function () {
  const g = this.grid;
  const seen = [];
  for (let r = 0; r < g.n; r++) {
    const row = [];
    for (let c = 0; c < g.cols; c++) row.push(false);
    seen.push(row);
  }
  const masses = [];
  for (let r = 0; r < g.n; r++) {
    for (let c = 0; c < g.cols; c++) {
      if (seen[r][c] || g.cells[r][c].isHole()) continue;
      const cells = [];
      const q = [{ r: r, c: c }];
      seen[r][c] = true;
      while (q.length) {
        const cur = q.pop();
        cells.push(cur);
        for (let d = 0; d < DELL_DIRS.length; d++) {
          const nr = cur.r + DELL_DIRS[d][0];
          const nc = cur.c + DELL_DIRS[d][1];
          if (!g.inBoard(nr, nc) || seen[nr][nc]) continue;
          if (g.cells[nr][nc].isHole()) continue;
          seen[nr][nc] = true;
          q.push({ r: nr, c: nc });
        }
      }
      masses.push({ cells: cells, size: cells.length });
    }
  }
  return masses;
};

GridBuilder.prototype.placeFoxes = function () {
  const g = this.grid;
  const masses = this.grassMasses();
  if (!masses.length || masses.length > g.n) {
    g.clearSprites();
    return false;
  }
  for (let i = 0; i < masses.length; i++) {
    if (masses[i].size < MIN_DELL_SIZE) {
      g.clearSprites();
      return false;
    }
  }
  const massId = [];
  for (let r = 0; r < g.n; r++) {
    const row = [];
    for (let c = 0; c < g.cols; c++) row.push(-1);
    massId.push(row);
  }
  for (let i = 0; i < masses.length; i++) {
    for (let k = 0; k < masses[i].cells.length; k++) massId[masses[i].cells[k].r][masses[i].cells[k].c] = i;
  }
  for (let t = 0; t < FOX_PLACE_TRIES; t++) {
    if (this.tryPlaceFoxes(masses, massId)) return true;
  }
  g.clearSprites();
  return false;
};

GridBuilder.prototype.tryPlaceFoxes = function (masses, massId) {
  const g = this.grid;
  g.clearSprites();

  const room = [];
  const hits = [];
  let cap = 0;
  for (let i = 0; i < masses.length; i++) {
    if (masses[i].size < MIN_DELL_SIZE) return false;
    room[i] = Math.floor(masses[i].size / MIN_DELL_SIZE);
    hits[i] = 0;
    cap += room[i];
  }
  if (cap < g.n) return false;

  const stillOk = [];
  let stillN = 0;
  for (let r = 0; r < g.n; r++) {
    const row = [];
    for (let c = 0; c < g.cols; c++) {
      const ok = g.foxSeatOk(r, c) && g.runOf(r, c) >= 0;
      row.push(ok);
      if (ok) stillN++;
    }
    stillOk.push(row);
  }

  let rowsLeft = g.n;
  const runUsed = [];
  for (let c = 0; c < g.cols; c++) runUsed[c] = 0;

  function dropSeat(r, c) {
    if (r < 0 || c < 0 || r >= g.n || c >= g.cols) return;
    if (!stillOk[r][c]) return;
    stillOk[r][c] = false;
    stillN--;
  }

  function punchFox(r, c) {
    const run = g.runOf(r, c);
    for (let cc = 0; cc < g.cols; cc++) dropSeat(r, cc);
    if (run >= 0) {
      for (let rr = 0; rr < g.n; rr++) {
        if (g.runOf(rr, c) === run) dropSeat(rr, c);
      }
      runUsed[c] |= 1 << run;
    }
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) dropSeat(r + dr, c + dc);
    }
    const mid = massId[r][c];
    if (mid >= 0) {
      room[mid]--;
      hits[mid]++;
      if (!room[mid]) {
        const cells = masses[mid].cells;
        for (let k = 0; k < cells.length; k++) dropSeat(cells[k].r, cells[k].c);
      }
    }
  }

  function punchHawkLine() {
    if (!g.hawk) return;
    for (let r = 0; r < g.n; r++) {
      for (let c = 0; c < g.cols; c++) {
        if (g.onHawkLine(r, c)) dropSeat(r, c);
      }
    }
  }

  function placeFox(r, c) {
    if (!stillOk[r][c]) return false;
    const onHawk = !!(g.hawk && g.onHawkLine(r, c));
    g.cells[r][c].spriteId = "o";
    punchFox(r, c);
    if (onHawk) punchHawkLine();
    rowsLeft--;
    return true;
  }

  function pickFrom(list) {
    if (!list.length) return false;
    const pick = list[Math.floor(Math.random() * list.length)];
    return placeFox(pick.r, pick.c);
  }

  function seatsWhere(ok) {
    const out = [];
    for (let r = 0; r < g.n; r++) {
      for (let c = 0; c < g.cols; c++) {
        if (!stillOk[r][c]) continue;
        if (ok && !ok(r, c)) continue;
        out.push({ r: r, c: c });
      }
    }
    return out;
  }

  // Board starts empty, so the wolf ring always takes the first fox.
  if (g.wolfRow >= 0) {
    const cave = g.caveCells();
    const ring = seatsWhere(function (r, c) {
      for (let i = 0; i < cave.length; i++) {
        if (Math.max(Math.abs(r - cave[i].row), Math.abs(c - cave[i].col)) === 1) return true;
      }
      return false;
    });
    if (!pickFrom(ring)) return false;
  }

  const bunny = g.findType("bunny");
  if (bunny) {
    const open = g.openRing(bunny.row, bunny.col);
    if (open.length < BUNNY_RING_MIN) return false;
    const onRing = [];
    for (let i = 0; i < open.length; i++) {
      if (open[i].spriteId === "o") onRing.push(open[i]);
    }
    if (onRing.length > 2) return false;
    while (onRing.length < 2) {
      const ring = seatsWhere(function (r, c) {
        return Math.max(Math.abs(r - bunny.row), Math.abs(c - bunny.col)) === 1;
      });
      if (!pickFrom(ring)) return false;
      onRing.length = 0;
      for (let i = 0; i < open.length; i++) {
        if (open[i].spriteId === "o") onRing.push(open[i]);
      }
    }
    if (onRing.length !== 2) return false;
  }

  if (g.hawk) {
    const open = [];
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        if (g.onHawkLine(r, c) && !g.cells[r][c].isHole()) open.push(g.cells[r][c]);
      }
    }
    if (open.length < HAWK_LINE_MIN) return false;
    const onLine = [];
    for (let i = 0; i < open.length; i++) {
      if (open[i].spriteId === "o") onLine.push(open[i]);
    }
    if (onLine.length > 1) return false;
    if (onLine.length === 1) {
      punchHawkLine();
    } else {
      const line = seatsWhere(function (r, c) {
        return g.onHawkLine(r, c);
      });
      if (!pickFrom(line)) return false;
    }
    let found = 0;
    for (let i = 0; i < open.length; i++) {
      if (open[i].spriteId === "o") found++;
    }
    if (found !== 1) return false;
  }

  const order = [];
  for (let i = 0; i < masses.length; i++) order.push(i);
  order.sort(function (a, b) {
    return masses[a].size - masses[b].size;
  });
  for (let i = 0; i < order.length; i++) {
    const mid = order[i];
    if (hits[mid]) continue;
    const opts = seatsWhere(function (r, c) {
      return massId[r][c] === mid;
    });
    if (!pickFrom(opts)) return false;
  }

  for (let c = 0; c < g.cols; c++) {
    const span = g.treeSpan(c);
    if (!span) continue;
    for (let run = 0; run <= 1; run++) {
      if (runUsed[c] & (1 << run)) continue;
      const opts = seatsWhere(function (r, cc) {
        return cc === c && g.runOf(r, cc) === run;
      });
      if (!pickFrom(opts)) return false;
    }
  }

  while (rowsLeft) {
    const opts = seatsWhere(null);
    if (!pickFrom(opts)) return false;
  }
  return true;
};

GridBuilder.prototype.placeTrees = function () {
  const g = this.grid;
  const z = Plan.treeCount(this.plan);
  if (z < 1) return true;
  if (g.cols !== g.n - z) return false;
  if (g.n < 6 || g.cols < 1) return false;

  function paintSide(side, width) {
    if (!width) return true;
    const minLo = 2;
    const maxHi = g.n - 3;
    if (maxHi < minLo) return false;
    const maxLen = maxHi - minLo + 1;
    const maxBand = g.n - 5;
    const minBand = width;
    if (minBand < 1 || maxBand < minBand || maxBand > maxLen) return false;
    const bell = (Math.random() + Math.random()) * TREE_BELL;
    const len = minBand + Math.floor(bell * (maxBand - minBand + 1));
    let lo = minLo + Math.floor(Math.random() * (maxLen - len + 1));
    let hi = lo + len - 1;
    for (let i = 0; i < width; i++) {
      const col = side === "L" ? i : g.cols - 1 - i;
      if (col < 0 || col >= g.cols) return false;
      for (let r = lo; r <= hi; r++) {
        const cell = g.cells[r][col];
        if (cell.isHole()) return false;
        cell.type = "tree";
        g.markHole(cell);
      }
      if (i + 1 >= width) continue;
      const lastLen = hi - lo + 1;
      const rem = width - i - 1;
      const minLen = rem <= 1 ? 1 : 2;
      const dropMax = Math.ceil((lastLen - 1) / rem);
      let aggLen = lastLen - dropMax;
      if (aggLen < minLen) aggLen = minLen;
      const hiLen = lastLen - 1;
      if (hiLen < minLen) continue;
      const nextLen = aggLen + Math.floor(Math.random() * Math.max(1, hiLen - aggLen));
      const nlo = lo + Math.floor(Math.random() * (lastLen - nextLen + 1));
      lo = nlo;
      hi = nlo + nextLen - 1;
    }
    return true;
  }

  const parts = [];
  for (let left = 0; left <= z; left++) parts.push([left, z - left]);
  shuffleInPlace(parts);
  for (let p = 0; p < parts.length; p++) {
    for (let r = 0; r < g.n; r++) {
      for (let c = 0; c < g.cols; c++) {
        const cell = g.cells[r][c];
        if (cell.is("tree")) {
          cell.type = "grass";
          cell.dellId = -1;
        }
      }
    }
    if (paintSide("L", parts[p][0]) && paintSide("R", parts[p][1])) return true;
  }
  return false;
};

GridBuilder.prototype.treeRunsOk = function () {
  const g = this.grid;
  for (let c = 0; c < g.cols; c++) {
    const span = g.treeSpan(c);
    if (!span) continue;
    let up = 0;
    let down = 0;
    for (let r = 0; r < g.rows; r++) {
      if (!g.foxSeatOk(r, c)) continue;
      const run = g.runOf(r, c);
      if (run === 0) up++;
      if (run === 1) down++;
    }
    if (up < 2 || down < 2) return false;
  }
  return true;
};

GridBuilder.prototype.prepLand = function () {
  const g = this.grid;
  if (!this.placeTrees()) return false;
  if (!this.placeWater()) return false;
  if (!this.placeCave()) return false;
  if (!this.placeBunny()) return false;
  if (!this.placeHawk()) return false;
  this.fillWaterIslands();
  if (!this.treeRunsOk()) return false;
  const masses = this.grassMasses();
  if (!masses.length || masses.length > g.n) return false;
  let cap = 0;
  for (let i = 0; i < masses.length; i++) {
    if (masses[i].size < MIN_DELL_SIZE) return false;
    cap += Math.floor(masses[i].size / MIN_DELL_SIZE);
  }
  return cap >= g.n;
};

GridBuilder.prototype.startSearch = function () {
  const g = this.grid;
  g.plan = this.plan;
  g.wolfShown = false;
  this.searchT = 0;
  this.searchP = 0;
  this.searchD = 0;
  this.searchLand = false;
};

GridBuilder.prototype.tryPaintDells = function () {
  const g = this.grid;
  const floor = Math.min(MIN_DELL_SIZE, g.n);
  const tinyQuota = Math.floor(Math.random() * (TINY_DELLS_MAX - TINY_DELLS_MIN + 1)) + TINY_DELLS_MIN;
  const smallsNeeded = g.n >= SMALL_DELLS_BIG_N ? SMALL_DELLS_BIG : SMALL_DELLS;

  const seeds = [];
  for (let r = 0; r < g.n; r++) {
    for (let c = 0; c < g.cols; c++) {
      const cell = g.cells[r][c];
      if (cell.spriteId === "o" && !cell.isHole()) seeds.push({ r: r, c: c });
    }
  }
  if (seeds.length !== g.n) return false;

  for (let r = 0; r < g.n; r++) {
    for (let c = 0; c < g.cols; c++) {
      const cell = g.cells[r][c];
      cell.dellId = cell.isHole() ? Grid.HOLE_DELL : -1;
    }
  }

  const sizes = [];
  const frontier = [];
  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i];
    g.cells[s.r][s.c].dellId = i;
    sizes[i] = 1;
    frontier.push({ r: s.r, c: s.c, id: i });
  }

  const reserved2 = {};
  const reserved3 = {};
  let reserved = false;

  function countSize(cap, exact) {
    let count = 0;
    for (let i = 0; i < sizes.length; i++) {
      if (!sizes[i]) continue;
      if (exact && sizes[i] === cap) count++;
      else if (!exact && sizes[i] < cap) count++;
    }
    return count;
  }

  function edgesFrom(allow) {
    const out = [];
    for (let i = 0; i < frontier.length; i++) {
      const f = frontier[i];
      if (!allow(f.id, sizes[f.id] || 0)) continue;
      for (let d = 0; d < DELL_DIRS.length; d++) {
        const nr = f.r + DELL_DIRS[d][0];
        const nc = f.c + DELL_DIRS[d][1];
        if (nr < 0 || nc < 0 || nr >= g.n || nc >= g.cols) continue;
        if (g.cells[nr][nc].dellId !== -1) continue;
        out.push({ r: nr, c: nc, id: f.id });
      }
    }
    return out;
  }

  function nextOpts() {
    if (countSize(floor, false)) {
      return edgesFrom(function (id, sz) {
        return sz < floor;
      });
    }
    if (countSize(DELL_SMALL_SIZE, false) > tinyQuota) {
      return edgesFrom(function (id, sz) {
        return sz < DELL_SMALL_SIZE;
      });
    }
    if (!reserved) {
      reserved = true;
      const twos = [];
      const threes = [];
      for (let i = 0; i < sizes.length; i++) {
        if (sizes[i] === floor) twos.push(i);
        if (sizes[i] === DELL_SMALL_SIZE) threes.push(i);
      }
      shuffleInPlace(twos);
      shuffleInPlace(threes);
      const keep2 = Math.min(tinyQuota, twos.length);
      for (let i = 0; i < keep2; i++) reserved2[twos[i]] = true;
      const keep3 = Math.max(0, smallsNeeded - keep2);
      for (let i = 0; i < threes.length && i < keep3; i++) reserved3[threes[i]] = true;
    }
    const rest = edgesFrom(function (id, sz) {
      return !reserved2[id] && !reserved3[id];
    });
    if (rest.length) return rest;
    const grow3 = edgesFrom(function (id) {
      return !!reserved3[id];
    });
    if (grow3.length) return grow3;
    return edgesFrom(function (id) {
      return !!reserved2[id];
    });
  }

  function hasUnclaimed() {
    for (let r = 0; r < g.n; r++) {
      for (let c = 0; c < g.cols; c++) {
        if (g.cells[r][c].dellId === -1) return true;
      }
    }
    return false;
  }

  while (hasUnclaimed()) {
    const opts = nextOpts();
    if (!opts.length) return false;
    shuffleInPlace(opts);
    let placed = false;
    for (let i = 0; i < opts.length; i++) {
      const e = opts[i];
      if (g.cells[e.r][e.c].dellId !== -1) continue;
      g.cells[e.r][e.c].dellId = e.id;
      sizes[e.id]++;
      frontier.push({ r: e.r, c: e.c, id: e.id });
      placed = true;
      break;
    }
    if (!placed) return false;
  }

  for (let i = 0; i < sizes.length; i++) {
    if (sizes[i] && sizes[i] < floor) return false;
  }
  return new Solver(g).count(2) === 1;
};

GridBuilder.prototype.searchSlice = function (budgetMs) {
  const g = this.grid;
  const end = Date.now() + (budgetMs > 0 ? budgetMs : SLICE_MS);
  while (this.searchT < UNIQUE_TRIES) {
    if (!this.searchLand) {
      this.resetLand();
      this.searchP = 0;
      this.searchD = 0;
      if (!this.prepLand()) {
        this.searchT++;
        if (Date.now() >= end) return "yield";
        continue;
      }
      this.searchLand = true;
    }
    while (this.searchP < PACK_TRIES) {
      if (this.searchD === 0 && !this.placeFoxes()) break;
      while (this.searchD < DELL_PAINT_TRIES) {
        if (this.tryPaintDells()) {
          g.clearGuesses();
          return "done";
        }
        this.searchD++;
        if (Date.now() >= end) return "yield";
      }
      this.searchP++;
      this.searchD = 0;
      if (Date.now() >= end) return "yield";
    }
    this.searchLand = false;
    this.searchT++;
    if (Date.now() >= end) return "yield";
  }
  return "fail";
};

GridBuilder.prototype.searchPath = function () {
  const land = "L:" + (this.searchT + 1);
  if (!this.searchLand) return land;
  const foxes = "F:" + (this.searchP + 1);
  if (this.searchD === 0) return land + " " + foxes;
  return land + " " + foxes + " D:" + (this.searchD + 1);
};