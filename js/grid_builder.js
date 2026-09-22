/** Fills a Grid from a planner card. */

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

function GridBuilder() {}

GridBuilder.build = function (plan) {
  const grid = new Grid(plan.n);
  grid.rebuild(plan);
  return grid;
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

function riverLeft(flow) {
  return { dr: -flow.dc, dc: flow.dr };
}

function riverRight(flow) {
  return { dr: flow.dc, dc: -flow.dr };
}

Grid.prototype.clearPonds = function () {
  for (let r = 0; r < this.n; r++) {
    for (let c = 0; c < this.n; c++) {
      const cell = this.cells[r][c];
      if (cell.is("water")) {
        cell.setType("grass");
        cell.dellId = -1;
      }
    }
  }
};

Grid.prototype.pondFits = function (r0, c0, h, w) {
  if (r0 < 0 || c0 < 0 || r0 + h > this.n || c0 + w > this.n) return false;
  for (let r = r0; r < r0 + h; r++) {
    for (let c = c0; c < c0 + w; c++) {
      if (this.cells[r][c].isHole()) return false;
    }
  }
  return true;
};

Grid.prototype.pondShapePool = function (size) {
  if (size > 0 && size <= POND_SHAPES.length) return POND_SHAPES[size - 1];
  const groupCount = Math.min(this.n - POND_MIN_LEVEL + 1, POND_SHAPES.length);
  if (groupCount < 1) return [];
  return POND_SHAPES.slice(0, groupCount).flat();
};

Grid.prototype.tryPlacePondShape = function (shape) {
  const h = shape[0];
  const w = shape[1];
  const spots = [];
  for (let r = 0; r <= this.n - h; r++) {
    for (let c = 0; c <= this.n - w; c++) {
      if (this.pondFits(r, c, h, w)) spots.push({ r: r, c: c });
    }
  }
  if (!spots.length) return false;
  const pick = spots[Math.floor(Math.random() * spots.length)];
  for (let r = pick.r; r < pick.r + h; r++) {
    for (let c = pick.c; c < pick.c + w; c++) {
      this.cells[r][c].setType("water");
      this.markHole(this.cells[r][c]);
    }
  }
  return true;
};

Grid.prototype.tryPlaceOnePond = function (size) {
  const available = this.pondShapePool(size || 0);
  if (!available.length) return false;
  const shape = available[Math.floor(Math.random() * available.length)];
  return this.tryPlacePondShape(shape);
};

Grid.prototype.pondJobs = function () {
  const plan = this.plan || {};
  const src = plan.ponds;
  const out = [];
  if (Array.isArray(src)) {
    for (let i = 0; i < src.length; i++) {
      const sz = src[i] | 0;
      if (sz >= 1 && sz <= POND_SHAPES.length) out.push(sz);
    }
    return out;
  }
  const want = src | 0;
  for (let i = 0; i < want; i++) out.push(0);
  return out;
};

Grid.prototype.placePonds = function () {
  const jobs = this.pondJobs();
  for (let i = 0; i < jobs.length; i++) {
    if (!this.tryPlaceOnePond(jobs[i])) return false;
  }
  return true;
};

Grid.prototype.riverSize = function () {
  return (this.plan && this.plan.river) | 0;
};

Grid.prototype.inBoard = function (r, c) {
  return r >= 0 && c >= 0 && r < this.n && c < this.n;
};

Grid.prototype.isWaterAt = function (r, c) {
  if (!this.inBoard(r, c)) return false;
  return this.cells[r][c].is("water");
};

Grid.prototype.onRiverFar = function (r, c, flow) {
  if (flow.far === "n") return r === 0;
  if (flow.far === "s") return r === this.n - 1;
  if (flow.far === "w") return c === 0;
  return c === this.n - 1;
};

Grid.prototype.paintRiverCell = function (r, c) {
  if (!this.inBoard(r, c)) return false;
  const cell = this.cells[r][c];
  if (cell.is("water")) return true;
  if (cell.isHole()) return false;
  cell.setType("water");
  this.markHole(cell);
  return true;
};

Grid.prototype.sideOk = function (r, c, flow) {
  if (!this.inBoard(r, c)) return false;
  return !this.isWaterAt(r - flow.dr, c - flow.dc);
};

Grid.prototype.riverStep = function (r, c, flow, mustForward) {
  const fwd = { r: r + flow.dr, c: c + flow.dc };
  if (mustForward) return this.inBoard(fwd.r, fwd.c) ? fwd : null;
  const left = riverLeft(flow);
  const right = riverRight(flow);
  const L = { r: r + left.dr, c: c + left.dc };
  const R = { r: r + right.dr, c: c + right.dc };
  const roll = Math.random();
  if (roll < 0.5) return this.inBoard(fwd.r, fwd.c) ? fwd : null;
  if (roll < 0.75) {
    if (this.sideOk(L.r, L.c, flow)) return L;
    return this.inBoard(fwd.r, fwd.c) ? fwd : null;
  }
  if (this.sideOk(R.r, R.c, flow)) return R;
  return this.inBoard(fwd.r, fwd.c) ? fwd : null;
};

Grid.prototype.walkRiver = function (r, c, flow) {
  if (!this.paintRiverCell(r, c)) return false;
  if (this.onRiverFar(r, c, flow)) return true;
  let lastMeander = false;
  const cap = this.n * this.n;
  for (let i = 0; i < cap; i++) {
    const next = this.riverStep(r, c, flow, lastMeander);
    if (!next) return false;
    lastMeander = next.r !== r + flow.dr || next.c !== c + flow.dc;
    r = next.r;
    c = next.c;
    if (!this.paintRiverCell(r, c)) return false;
    if (this.onRiverFar(r, c, flow)) return true;
  }
  return false;
};

Grid.prototype.fullRiverStarts = function () {
  const n = this.n;
  const lo = 2;
  const hi = n - 3;
  const out = [];
  if (hi < lo) return out;
  for (let i = lo; i <= hi; i++) {
    out.push({ r: 0, c: i, flow: RIVER_FLOW.s });
    out.push({ r: n - 1, c: i, flow: RIVER_FLOW.n });
    out.push({ r: i, c: 0, flow: RIVER_FLOW.e });
    out.push({ r: i, c: n - 1, flow: RIVER_FLOW.w });
  }
  return out;
};

Grid.prototype.placeFullRiver = function () {
  const starts = this.fullRiverStarts();
  if (!starts.length) return false;
  const pick = starts[Math.floor(Math.random() * starts.length)];
  return this.walkRiver(pick.r, pick.c, pick.flow);
};

Grid.prototype.pondCells = function () {
  const out = [];
  for (let r = 0; r < this.n; r++) {
    for (let c = 0; c < this.n; c++) {
      if (this.cells[r][c].is("water")) out.push({ r: r, c: c });
    }
  }
  return out;
};

Grid.prototype.halfRiverFlow = function (r, c) {
  const n = this.n;
  const opts = [
    { dist: r, flow: RIVER_FLOW.n },
    { dist: n - 1 - r, flow: RIVER_FLOW.s },
    { dist: c, flow: RIVER_FLOW.w },
    { dist: n - 1 - c, flow: RIVER_FLOW.e },
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
  if (best <= 0 || !top.length) return null;
  return top[Math.floor(Math.random() * top.length)];
};

Grid.prototype.placeHalfRiver = function () {
  const ponds = this.pondCells();
  if (!ponds.length) return false;
  const pick = ponds[Math.floor(Math.random() * ponds.length)];
  const flow = this.halfRiverFlow(pick.r, pick.c);
  if (!flow) return false;
  return this.walkRiver(pick.r, pick.c, flow);
};

Grid.prototype.fillWaterIslands = function () {
  for (let r = 0; r < this.n; r++) {
    for (let c = 0; c < this.n; c++) {
      if (this.cells[r][c].isHole()) continue;
      let grass = false;
      for (let d = 0; d < DELL_DIRS.length; d++) {
        const nr = r + DELL_DIRS[d][0];
        const nc = c + DELL_DIRS[d][1];
        if (!this.inBoard(nr, nc)) continue;
        if (!this.cells[nr][nc].isHole()) {
          grass = true;
          break;
        }
      }
      if (grass) continue;
      const cell = this.cells[r][c];
      cell.setType("water");
      this.markHole(cell);
    }
  }
};

Grid.prototype.waterLinesOk = function () {
  const n = this.n;
  for (let r = 0; r < n; r++) {
    let grass = false;
    for (let c = 0; c < n; c++) {
      if (!this.cells[r][c].is("water")) {
        grass = true;
        break;
      }
    }
    if (!grass) return false;
  }
  for (let c = 0; c < n; c++) {
    let grass = false;
    for (let r = 0; r < n; r++) {
      if (!this.cells[r][c].is("water")) {
        grass = true;
        break;
      }
    }
    if (!grass) return false;
  }
  return true;
};

Grid.prototype.placeWater = function () {
  const river = this.riverSize();
  for (let t = 0; t < WATER_TRIES; t++) {
    this.clearPonds();
    if (river === 2 && !this.placeFullRiver()) continue;
    if (!this.placePonds()) continue;
    if (river === 1 && !this.placeHalfRiver()) continue;
    this.fillWaterIslands();
    if (!this.waterLinesOk()) continue;
    return true;
  }
  return false;
};

Grid.prototype.clearCaves = function () {
  this.wolfRow = -1;
  this.wolfCol = -1;
  for (let r = 0; r < this.n; r++) {
    for (let c = 0; c < this.n; c++) {
      const cell = this.cells[r][c];
      if (cell.is("cave")) {
        cell.setType("grass");
        cell.dellId = -1;
      }
    }
  }
};

Grid.prototype.caveGrowOpts = function (body) {
  const seen = {};
  const out = [];
  for (let i = 0; i < body.length; i++) {
    for (let d = 0; d < DELL_DIRS.length; d++) {
      const nr = body[i].r + DELL_DIRS[d][0];
      const nc = body[i].c + DELL_DIRS[d][1];
      if (nr < 0 || nc < 0 || nr >= this.n || nc >= this.n) continue;
      const key = nr + "," + nc;
      if (seen[key]) continue;
      if (this.cells[nr][nc].isHole()) continue;
      seen[key] = true;
      out.push({ r: nr, c: nc });
    }
  }
  return out;
};

Grid.prototype.placeCave = function () {
  this.clearCaves();
  if (!this.plan || !this.plan.wolf) return true;
  const seeds = [];
  for (let r = 2; r < this.n - 2; r++) {
    for (let c = 2; c < this.n - 2; c++) {
      if (!this.cells[r][c].isHole()) seeds.push({ r: r, c: c });
    }
  }
  if (!seeds.length) return false;
  const start = seeds[Math.floor(Math.random() * seeds.length)];
  const want = CAVE_SIZE[0] + Math.floor(Math.random() * (1 + CAVE_SIZE[1] - CAVE_SIZE[0]));
  const body = [start];
  const seedCell = this.cells[start.r][start.c];
  seedCell.setType("cave");
  this.markHole(seedCell);
  while (body.length < want) {
    const opts = this.caveGrowOpts(body);
    if (!opts.length) break;
    const pick = opts[Math.floor(Math.random() * opts.length)];
    const cell = this.cells[pick.r][pick.c];
    cell.setType("cave");
    this.markHole(cell);
    body.push(pick);
  }
  if (body.length < 2) {
    this.clearCaves();
    return false;
  }
  const wolfAt = body[Math.floor(Math.random() * body.length)];
  this.wolfRow = wolfAt.r;
  this.wolfCol = wolfAt.c;
  return true;
};

Grid.prototype.clearBunny = function () {
  for (let r = 0; r < this.n; r++) {
    for (let c = 0; c < this.n; c++) {
      const cell = this.cells[r][c];
      if (cell.is("bunny")) {
        cell.setType("grass");
        cell.dellId = -1;
      }
    }
  }
};

Grid.prototype.bunnySeats = function (row, col) {
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      if (this.foxSeatOk(row + dr, col + dc)) out.push({ r: row + dr, c: col + dc });
    }
  }
  return out;
};

Grid.prototype.bunnyPairs = function (row, col) {
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

Grid.prototype.clearHawk = function () {
  this.hawk = null;
  for (let r = 0; r < this.n; r++) {
    for (let c = 0; c < this.n; c++) {
      const cell = this.cells[r][c];
      if (cell.is("hawk")) {
        cell.setType("grass");
        cell.dellId = -1;
      }
    }
  }
};

Grid.prototype.hawkOpenSeats = function (side) {
  const out = [];
  if (!side) return out;
  for (let r = 1; r < this.n; r++) {
    const c = side === "L" ? r : this.n - 1 - r;
    if (!this.inBoard(r, c)) continue;
    if (this.cells[r][c].isHole()) continue;
    out.push({ r: r, c: c });
  }
  return out;
};

Grid.prototype.hawkLineSeats = function (side) {
  const out = [];
  const use = side || this.hawk;
  if (!use) return out;
  for (let r = 1; r < this.n; r++) {
    const c = use === "L" ? r : this.n - 1 - r;
    if (this.foxSeatOk(r, c)) out.push({ r: r, c: c });
  }
  return out;
};

Grid.prototype.placeHawk = function () {
  this.clearHawk();
  if (!this.plan || !this.plan.hawk) return true;
  const sides = shuffleInPlace(["L", "R"].slice());
  for (let i = 0; i < sides.length; i++) {
    const side = sides[i];
    const col = side === "L" ? 0 : this.n - 1;
    if (this.cells[0][col].isHole()) continue;
    if (this.hawkOpenSeats(side).length < 5) continue;
    const cell = this.cells[0][col];
    cell.setType("hawk");
    this.markHole(cell);
    this.hawk = side;
    return true;
  }
  return false;
};

Grid.prototype.placeBunny = function () {
  this.clearBunny();
  if (!this.plan || !this.plan.bunny) return true;
  const last = this.n - 1;
  const spots = [];
  for (let r = 0; r < this.n; r++) {
    for (let c = 0; c < this.n; c++) {
      if (r === 0 || r === last || c === 0 || c === last) continue;
      if (this.cells[r][c].isHole()) continue;
      if (this.bunnySeats(r, c).length < 6) continue;
      if (!this.bunnyPairs(r, c).length) continue;
      spots.push({ r: r, c: c });
    }
  }
  if (!spots.length) return false;
  const pick = spots[Math.floor(Math.random() * spots.length)];
  const cell = this.cells[pick.r][pick.c];
  cell.setType("bunny");
  this.markHole(cell);
  return true;
};

Grid.prototype.hasNearbyO = function (row, col) {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || c < 0 || r >= this.n || c >= this.n) continue;
      if (this.cells[r][c].spriteId === "o") return true;
    }
  }
  return false;
};

Grid.prototype.grassMasses = function () {
  const n = this.n;
  const seen = [];
  for (let r = 0; r < n; r++) {
    const row = [];
    for (let c = 0; c < n; c++) row.push(false);
    seen.push(row);
  }
  const masses = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (seen[r][c] || this.cells[r][c].isHole()) continue;
      const cells = [];
      const q = [{ r: r, c: c }];
      seen[r][c] = true;
      while (q.length) {
        const cur = q.pop();
        cells.push(cur);
        for (let d = 0; d < DELL_DIRS.length; d++) {
          const nr = cur.r + DELL_DIRS[d][0];
          const nc = cur.c + DELL_DIRS[d][1];
          if (!this.inBoard(nr, nc) || seen[nr][nc]) continue;
          if (this.cells[nr][nc].isHole()) continue;
          seen[nr][nc] = true;
          q.push({ r: nr, c: nc });
        }
      }
      masses.push({ cells: cells, size: cells.length });
    }
  }
  return masses;
};

Grid.prototype.massMap = function (masses) {
  const n = this.n;
  const map = [];
  for (let r = 0; r < n; r++) {
    const row = [];
    for (let c = 0; c < n; c++) row.push(-1);
    map.push(row);
  }
  for (let i = 0; i < masses.length; i++) {
    const cells = masses[i].cells;
    for (let k = 0; k < cells.length; k++) map[cells[k].r][cells[k].c] = i;
  }
  return map;
};

Grid.prototype.landMassesOk = function () {
  const masses = this.grassMasses();
  if (!masses.length) return false;
  if (masses.length > this.n) return false;
  let cap = 0;
  for (let i = 0; i < masses.length; i++) {
    if (masses[i].size < MIN_DELL_SIZE) return false;
    cap += Math.floor(masses[i].size / MIN_DELL_SIZE);
  }
  return cap >= this.n;
};

Grid.prototype.placeOs = function () {
  const masses = this.grassMasses();
  const n = this.n;
  if (!masses.length || masses.length > n) {
    this.clearSprites();
    return false;
  }
  for (let i = 0; i < masses.length; i++) {
    if (masses[i].size < MIN_DELL_SIZE) {
      this.clearSprites();
      return false;
    }
  }
  const massId = this.massMap(masses);
  for (let t = 0; t < PLACE_TRIES; t++) {
    if (this.tryPlaceOs(masses, massId)) return true;
  }
  this.clearSprites();
  return false;
};

Grid.prototype.tryPlaceOs = function (masses, massId) {
  this.clearSprites();
  const n = this.n;
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
  const freeCol = [];
  let rowsLeft = n;
  for (let i = 0; i < n; i++) {
    freeRow[i] = true;
    freeCol[i] = true;
  }

  const self = this;
  let hawkPlanted = false;
  function takeSeat(r, c) {
    const mid = massId[r][c];
    if (mid < 0 || !room[mid]) return false;
    if (!freeRow[r] || !freeCol[c]) return false;
    if (!self.foxSeatOk(r, c)) return false;
    if (self.hasNearbyO(r, c)) return false;
    if (hawkPlanted && self.onHawkLine(r, c)) return false;
    self.cells[r][c].setSprite("o");
    freeRow[r] = false;
    freeCol[c] = false;
    rowsLeft--;
    room[mid]--;
    hits[mid]++;
    return true;
  }

  if (this.hawk) {
    const seats = this.hawkLineSeats(this.hawk);
    shuffleInPlace(seats);
    for (let i = 0; i < seats.length; i++) {
      if (takeSeat(seats[i].r, seats[i].c)) {
        hawkPlanted = true;
        break;
      }
    }
    if (!hawkPlanted) return false;
  }

  const bunny = this.findBunny();
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
        this.cells[a.r][a.c].clearSprite();
        const mid = massId[a.r][a.c];
        room[mid]++;
        hits[mid]--;
        freeRow[a.r] = true;
        freeCol[a.c] = true;
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
      if (!freeRow[r] || !freeCol[c]) continue;
      if (!this.foxSeatOk(r, c)) continue;
      if (this.hasNearbyO(r, c)) continue;
      opts.push({ r: r, c: c });
    }
    if (!opts.length) return false;
    const pick = opts[Math.floor(Math.random() * opts.length)];
    if (!takeSeat(pick.r, pick.c)) return false;
  }

  while (rowsLeft) {
    const opts = [];
    for (let r = 0; r < n; r++) {
      if (!freeRow[r]) continue;
      for (let c = 0; c < n; c++) {
        if (!freeCol[c]) continue;
        const mid = massId[r][c];
        if (mid < 0 || !room[mid]) continue;
        if (!this.foxSeatOk(r, c)) continue;
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

Grid.prototype.freeNeighbors = function (row, col) {
  const out = [];
  for (let d = 0; d < DELL_DIRS.length; d++) {
    const nr = row + DELL_DIRS[d][0];
    const nc = col + DELL_DIRS[d][1];
    if (nr < 0 || nc < 0 || nr >= this.n || nc >= this.n) continue;
    if (this.cells[nr][nc].dellId !== -1) continue;
    out.push({ r: nr, c: nc });
  }
  return out;
};

Grid.prototype.resetDellIds = function () {
  for (let r = 0; r < this.n; r++) {
    for (let c = 0; c < this.n; c++) {
      const cell = this.cells[r][c];
      cell.dellId = cell.isHole() ? HOLE_DELL : -1;
    }
  }
};

Grid.prototype.foxSeeds = function () {
  const out = [];
  for (let r = 0; r < this.n; r++) {
    for (let c = 0; c < this.n; c++) {
      const cell = this.cells[r][c];
      if (cell.spriteId === "o" && !cell.isHole()) out.push({ r: r, c: c });
    }
  }
  return out;
};

Grid.prototype.hasUnclaimedGrass = function () {
  for (let r = 0; r < this.n; r++) {
    for (let c = 0; c < this.n; c++) {
      if (this.cells[r][c].dellId === -1) return true;
    }
  }
  return false;
};

Grid.prototype.prepLand = function () {
  if (!this.placeWater()) return false;
  if (!this.placeHawk()) return false;
  if (!this.placeCave()) return false;
  if (!this.placeBunny()) return false;
  this.fillWaterIslands();
  return this.landMassesOk();
};

Grid.prototype.paintDells = function () {
  for (let t = 0; t < DELL_PAINT_TRIES; t++) {
    if (this.tryPaintDells()) return true;
  }
  return false;
};

Grid.prototype.tryPaintDells = function () {
  const n = this.n;
  const floor = Math.min(MIN_DELL_SIZE, n);
  const target = Math.min(DELL_TARGET, n);
  const tinyQuota = Math.random() < 0.5 ? 2 : 1;
  const seeds = this.foxSeeds();
  if (seeds.length !== n) return false;

  this.resetDellIds();

  const sizes = [];
  const frontier = [];
  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i];
    this.cells[s.r][s.c].dellId = i;
    sizes[i] = 1;
    frontier.push({ r: s.r, c: s.c, id: i });
  }

  const self = this;
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

  function lockReserved() {
    if (reserved) return;
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

  function edgesFrom(allow) {
    const out = [];
    for (let i = 0; i < frontier.length; i++) {
      const f = frontier[i];
      if (!allow(f.id, sizes[f.id] || 0)) continue;
      const open = self.freeNeighbors(f.r, f.c);
      for (let k = 0; k < open.length; k++) {
        out.push({ r: open[k].r, c: open[k].c, id: f.id });
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
    lockReserved();
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

  while (this.hasUnclaimedGrass()) {
    const opts = nextOpts();
    if (!opts.length) return false;
    shuffleInPlace(opts);
    let placed = false;
    for (let i = 0; i < opts.length; i++) {
      const e = opts[i];
      if (this.cells[e.r][e.c].dellId !== -1) continue;
      this.cells[e.r][e.c].dellId = e.id;
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
  return new Solver(this).count(2) === 1;
};

Grid.prototype.rebuild = function (plan) {
  this.plan = plan || this.plan || { n: this.n, ponds: 0, river: 0, wolf: false, bunny: false, hawk: false };
  this.unique = false;
  this.wolfShown = false;
  this.tries = 0;
  this.backs = 0;
  for (let t = 0; t < UNIQUE_TRIES; t++) {
    this.tries++;
    if (!this.prepLand()) continue;
    for (let p = 0; p < PACK_TRIES; p++) {
      if (!this.placeOs()) break;
      if (!this.paintDells()) continue;
      this.unique = true;
      this.clearGuesses();
      return true;
    }
  }
  return false;
};
