/** Fills a Grid from a plan { size, features[] }. */

const MIN_DELL_SIZE = 2;
const DELL_TARGET = 3;
const DELL_PAINT_TRIES = 40;
const PLACE_TRIES = 200;
const PACK_TRIES = 8;
const UNIQUE_TRIES = 250;
const WATER_TRIES = 50;
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
  const spec = Grid.normalizePlan(plan, plan && (plan.size || plan.n));
  this.plan = spec;
  const z = Plan.treeCount(spec);
  this.grid = new Grid(spec.size, spec.size - z);
  this.grid.plan = spec;
}

GridBuilder.SLICE_MS = 90;

GridBuilder.build = function (plan) {
  const builder = new GridBuilder(plan);
  builder.run();
  return builder.grid;
};

GridBuilder.buildAsync = function (plan, onSlice) {
  const builder = new GridBuilder(plan);
  builder.startSearch();
  return new Promise(function (resolve) {
    function pump() {
      const result = builder.searchSlice(GridBuilder.SLICE_MS);
      if (result === "yield") {
        if (onSlice) onSlice();
        setTimeout(pump, 0);
        return;
      }
      resolve(builder.grid);
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
  g.unique = false;
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const cell = g.cells[r][c];
      cell.setType("grass");
      cell.dellId = -1;
      cell.clearSprite();
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
    cell.setType("water");
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
      if (roll < 0.5) {
        next = g.inBoard(fwd.r, fwd.c) ? fwd : null;
      } else if (roll < 0.75) {
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
      cell.setType("water");
      g.markHole(cell);
    }
  }
};

GridBuilder.prototype.placeWater = function () {
  const g = this.grid;
  const river = Plan.riverMode(this.plan);
  const n = g.n;
  const cols = g.cols;

  for (let t = 0; t < WATER_TRIES; t++) {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = g.cells[r][c];
        if (cell.is("water")) {
          cell.setType("grass");
          cell.dellId = -1;
        }
      }
    }

    if (river === 2) {
      const starts = [];
      for (let c = 2; c <= cols - 3; c++) {
        starts.push({ r: 0, c: c, flow: RIVER_FLOW.s });
        starts.push({ r: n - 1, c: c, flow: RIVER_FLOW.n });
      }
      for (let r = 2; r <= n - 3; r++) {
        starts.push({ r: r, c: 0, flow: RIVER_FLOW.e });
        starts.push({ r: r, c: cols - 1, flow: RIVER_FLOW.w });
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
        const groupCount = Math.min(n - POND_MIN_LEVEL + 1, POND_SHAPES.length);
        available = groupCount < 1 ? [] : POND_SHAPES.slice(0, groupCount).flat();
      }
      if (!available.length) {
        pondsOk = false;
        break;
      }
      const shape = available[Math.floor(Math.random() * available.length)];
      const h = shape[0];
      const w = shape[1];
      const spots = [];
      for (let r = 0; r <= n - h; r++) {
        for (let c = 0; c <= cols - w; c++) {
          let fits = r >= 0 && c >= 0 && r + h <= n && c + w <= cols;
          if (fits) {
            for (let rr = r; rr < r + h && fits; rr++) {
              for (let cc = c; cc < c + w; cc++) {
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
      for (let r = pick.r; r < pick.r + h; r++) {
        for (let c = pick.c; c < pick.c + w; c++) {
          g.cells[r][c].setType("water");
          g.markHole(g.cells[r][c]);
        }
      }
    }
    if (!pondsOk) continue;

    if (river === 1) {
      const ponds = [];
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < cols; c++) {
          if (g.cells[r][c].is("water")) ponds.push({ r: r, c: c });
        }
      }
      if (!ponds.length) continue;
      const pick = ponds[Math.floor(Math.random() * ponds.length)];
      const opts = [
        { dist: pick.r, flow: RIVER_FLOW.n },
        { dist: n - 1 - pick.r, flow: RIVER_FLOW.s },
        { dist: pick.c, flow: RIVER_FLOW.w },
        { dist: cols - 1 - pick.c, flow: RIVER_FLOW.e },
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
    for (let r = 0; r < n && linesOk; r++) {
      let grass = false;
      for (let c = 0; c < cols; c++) {
        if (!g.cells[r][c].is("water")) {
          grass = true;
          break;
        }
      }
      if (!grass) linesOk = false;
    }
    for (let c = 0; c < cols && linesOk; c++) {
      let grass = false;
      for (let r = 0; r < n; r++) {
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
        cell.setType("grass");
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
  seedCell.setType("cave");
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
    cell.setType("cave");
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

GridBuilder.prototype.bunnySeats = function (row, col) {
  const g = this.grid;
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      if (g.foxSeatOk(row + dr, col + dc)) out.push({ r: row + dr, c: col + dc });
    }
  }
  return out;
};

GridBuilder.prototype.bunnyPairs = function (row, col) {
  const seats = this.bunnySeats(row, col);
  const out = [];
  for (let i = 0; i < seats.length; i++) {
    for (let j = i + 1; j < seats.length; j++) {
      const a = seats[i];
      const b = seats[j];
      if (a.r === b.r || a.c === b.c) continue;
      if (Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c)) < 2) continue;
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
        cell.setType("grass");
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
    if (open < 5) continue;
    const cell = g.cells[0][col];
    cell.setType("hawk");
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
        cell.setType("grass");
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
      if (this.bunnySeats(r, c).length < 6) continue;
      if (!this.bunnyPairs(r, c).length) continue;
      spots.push({ r: r, c: c });
    }
  }
  if (!spots.length) return false;
  const pick = spots[Math.floor(Math.random() * spots.length)];
  const cell = g.cells[pick.r][pick.c];
  cell.setType("bunny");
  g.markHole(cell);
  return true;
};

GridBuilder.prototype.hasNearbyO = function (row, col) {
  const g = this.grid;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) continue;
      if (g.cells[r][c].spriteId === "o") return true;
    }
  }
  return false;
};

GridBuilder.prototype.grassMasses = function () {
  const g = this.grid;
  const n = g.n;
  const cols = g.cols;
  const seen = [];
  for (let r = 0; r < n; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) row.push(false);
    seen.push(row);
  }
  const masses = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < cols; c++) {
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

GridBuilder.prototype.massMap = function (masses) {
  const g = this.grid;
  const n = g.n;
  const cols = g.cols;
  const map = [];
  for (let r = 0; r < n; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) row.push(-1);
    map.push(row);
  }
  for (let i = 0; i < masses.length; i++) {
    const cells = masses[i].cells;
    for (let k = 0; k < cells.length; k++) map[cells[k].r][cells[k].c] = i;
  }
  return map;
};

GridBuilder.prototype.placeOs = function () {
  const g = this.grid;
  const masses = this.grassMasses();
  const n = g.n;
  const cols = g.cols;
  if (!masses.length || masses.length > n) {
    g.clearSprites();
    return false;
  }
  for (let i = 0; i < masses.length; i++) {
    if (masses[i].size < MIN_DELL_SIZE) {
      g.clearSprites();
      return false;
    }
  }
  const massId = this.massMap(masses);
  for (let t = 0; t < PLACE_TRIES; t++) {
    if (this.tryPlaceOs(masses, massId)) return true;
  }
  g.clearSprites();
  return false;
};

GridBuilder.prototype.tryPlaceOs = function (masses, massId) {
  const g = this.grid;
  g.clearSprites();
  const n = g.n;
  const cols = g.cols;
  if (!masses) masses = this.grassMasses();
  if (!masses.length || masses.length > n) return false;
  if (!massId) massId = this.massMap(masses);
  const room = [];
  const hits = [];
  let cap = 0;
  for (let i = 0; i < masses.length; i++) {
    if (masses[i].size < MIN_DELL_SIZE) return false;
    room[i] = Math.floor(masses[i].size / MIN_DELL_SIZE);
    hits[i] = 0;
    cap += room[i];
  }
  if (cap < n) return false;

  const freeRow = [];
  const runUsed = [];
  let rowsLeft = n;
  for (let r = 0; r < n; r++) freeRow[r] = true;
  for (let c = 0; c < cols; c++) runUsed[c] = 0;

  const self = this;
  let hawkPlanted = false;
  function takeSeat(r, c) {
    const mid = massId[r][c];
    const run = g.runOf(r, c);
    if (mid < 0 || !room[mid]) return false;
    if (run < 0) return false;
    if (!freeRow[r]) return false;
    if (runUsed[c] & (1 << run)) return false;
    if (!g.foxSeatOk(r, c)) return false;
    if (self.hasNearbyO(r, c)) return false;
    if (hawkPlanted && g.onHawkLine(r, c)) return false;
    g.cells[r][c].setSprite("o");
    freeRow[r] = false;
    runUsed[c] |= 1 << run;
    rowsLeft--;
    room[mid]--;
    hits[mid]++;
    return true;
  }

  if (g.hawk) {
    const seats = [];
    const use = g.hawk;
    for (let r = 1; r < n; r++) {
      const c = use === "L" ? r : n - 1 - r;
      if (g.foxSeatOk(r, c)) seats.push({ r: r, c: c });
    }
    shuffleInPlace(seats);
    for (let i = 0; i < seats.length; i++) {
      if (takeSeat(seats[i].r, seats[i].c)) {
        hawkPlanted = true;
        break;
      }
    }
    if (!hawkPlanted) return false;
  }

  const bunny = g.findBunny();
  if (bunny) {
    const pairs = this.bunnyPairs(bunny.row, bunny.col);
    if (!pairs.length) return false;
    shuffleInPlace(pairs);
    let planted = false;
    for (let i = 0; i < pairs.length; i++) {
      const a = pairs[i][0];
      const b = pairs[i][1];
      const ma = massId[a.r][a.c];
      const mb = massId[b.r][b.c];
      if (ma < 0 || mb < 0) continue;
      if (ma === mb && room[ma] < 2) continue;
      if (ma !== mb && (!room[ma] || !room[mb])) continue;
      if (!takeSeat(a.r, a.c)) continue;
      if (!takeSeat(b.r, b.c)) {
        g.cells[a.r][a.c].clearSprite();
        const mid = massId[a.r][a.c];
        room[mid]++;
        hits[mid]--;
        freeRow[a.r] = true;
        runUsed[a.c] &= ~(1 << g.runOf(a.r, a.c));
        rowsLeft++;
        continue;
      }
      planted = true;
      break;
    }
    if (!planted) return false;
  }

  const order = [];
  for (let i = 0; i < masses.length; i++) order.push(i);
  order.sort(function (a, b) {
    return masses[a].size - masses[b].size;
  });

  for (let i = 0; i < order.length; i++) {
    const mid = order[i];
    if (hits[mid]) continue;
    const opts = [];
    const cells = masses[mid].cells;
    for (let k = 0; k < cells.length; k++) {
      const r = cells[k].r;
      const c = cells[k].c;
      const run = g.runOf(r, c);
      if (!freeRow[r] || run < 0 || (runUsed[c] & (1 << run))) continue;
      if (!g.foxSeatOk(r, c)) continue;
      if (this.hasNearbyO(r, c)) continue;
      opts.push({ r: r, c: c });
    }
    if (!opts.length) return false;
    const pick = opts[Math.floor(Math.random() * opts.length)];
    if (!takeSeat(pick.r, pick.c)) return false;
  }

  for (let c = 0; c < cols; c++) {
    const span = g.treeSpan(c);
    if (!span) continue;
    for (let run = 0; run <= 1; run++) {
      if (runUsed[c] & (1 << run)) continue;
      const opts = [];
      for (let r = 0; r < n; r++) {
        if (!freeRow[r]) continue;
        if (g.runOf(r, c) !== run) continue;
        if (!g.foxSeatOk(r, c)) continue;
        if (this.hasNearbyO(r, c)) continue;
        const mid = massId[r][c];
        if (mid < 0 || !room[mid]) continue;
        opts.push({ r: r, c: c });
      }
      if (!opts.length) return false;
      const pick = opts[Math.floor(Math.random() * opts.length)];
      if (!takeSeat(pick.r, pick.c)) return false;
    }
  }

  while (rowsLeft) {
    const opts = [];
    for (let r = 0; r < n; r++) {
      if (!freeRow[r]) continue;
      for (let c = 0; c < cols; c++) {
        const run = g.runOf(r, c);
        if (run < 0 || (runUsed[c] & (1 << run))) continue;
        const mid = massId[r][c];
        if (mid < 0 || !room[mid]) continue;
        if (!g.foxSeatOk(r, c)) continue;
        if (this.hasNearbyO(r, c)) continue;
        opts.push({ r: r, c: c });
      }
    }
    if (!opts.length) return false;
    const pick = opts[Math.floor(Math.random() * opts.length)];
    if (!takeSeat(pick.r, pick.c)) return false;
  }
  return true;
};

GridBuilder.prototype.placeTrees = function () {
  const g = this.grid;
  const z = Plan.treeCount(this.plan);
  if (z < 1) return true;
  if (g.cols !== g.n - z) return false;
  const n = g.n;
  const cols = g.cols;
  if (n < 6 || cols < 1) return false;

  function paintSide(side, width) {
    if (!width) return true;
    const minLo = 2;
    const maxHi = n - 3;
    if (maxHi < minLo) return false;
    const maxLen = maxHi - minLo + 1;
    const len = 1 + Math.floor(Math.random() * maxLen);
    let lo = minLo + Math.floor(Math.random() * (maxLen - len + 1));
    let hi = lo + len - 1;
    for (let i = 0; i < width; i++) {
      const col = side === "L" ? i : cols - 1 - i;
      if (col < 0 || col >= cols) return false;
      for (let r = lo; r <= hi; r++) {
        const cell = g.cells[r][col];
        if (cell.isHole()) return false;
        cell.setType("tree");
        g.markHole(cell);
      }
      if (i + 1 >= width) continue;
      const curLen = hi - lo + 1;
      const newLen = 1 + Math.floor(Math.random() * curLen);
      const shift = Math.floor(Math.random() * (curLen - newLen + 1));
      lo = lo + shift;
      hi = lo + newLen - 1;
    }
    return true;
  }

  const parts = [];
  for (let left = 0; left <= z; left++) parts.push([left, z - left]);
  shuffleInPlace(parts);
  for (let p = 0; p < parts.length; p++) {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = g.cells[r][c];
        if (cell.is("tree")) {
          cell.setType("grass");
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
  if (!this.placeHawk()) return false;
  if (!this.placeCave()) return false;
  if (!this.placeBunny()) return false;
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

GridBuilder.prototype.paintDells = function () {
  for (let t = 0; t < DELL_PAINT_TRIES; t++) {
    if (this.tryPaintDells()) return true;
  }
  return false;
};

GridBuilder.prototype.startSearch = function () {
  const g = this.grid;
  g.plan = this.plan;
  g.unique = false;
  g.wolfShown = false;
  this.searchT = 0;
  this.searchP = 0;
  this.searchD = 0;
  this.searchLand = false;
};

GridBuilder.prototype.tryPaintDells = function () {
  const g = this.grid;
  const n = g.n;
  const cols = g.cols;
  const floor = Math.min(MIN_DELL_SIZE, n);
  const target = Math.min(DELL_TARGET, n);
  const tinyQuota = Math.random() < 0.5 ? 2 : 1;

  const seeds = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = g.cells[r][c];
      if (cell.spriteId === "o" && !cell.isHole()) seeds.push({ r: r, c: c });
    }
  }
  if (seeds.length !== n) return false;

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < cols; c++) {
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
        if (nr < 0 || nc < 0 || nr >= n || nc >= cols) continue;
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
    if (countSize(target, false) > tinyQuota) {
      return edgesFrom(function (id, sz) {
        return sz < target;
      });
    }
    if (!reserved) {
      reserved = true;
      const twos = [];
      const threes = [];
      for (let i = 0; i < sizes.length; i++) {
        if (sizes[i] === floor) twos.push(i);
        if (sizes[i] === target) threes.push(i);
      }
      shuffleInPlace(twos);
      shuffleInPlace(threes);
      const keep2 = Math.min(tinyQuota, twos.length);
      for (let i = 0; i < keep2; i++) reserved2[twos[i]] = true;
      const keep3 = Math.max(0, 3 - keep2);
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
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < cols; c++) {
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

GridBuilder.prototype.run = function () {
  this.startSearch();
  while (true) {
    const result = this.searchSlice(1e9);
    if (result !== "yield") return result === "done";
  }
};

GridBuilder.prototype.searchSlice = function (budgetMs) {
  const g = this.grid;
  const end = Date.now() + (budgetMs > 0 ? budgetMs : 90);
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
      if (this.searchD === 0 && !this.placeOs()) break;
      while (this.searchD < DELL_PAINT_TRIES) {
        if (this.tryPaintDells()) {
          g.unique = true;
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
