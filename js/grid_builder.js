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

Grid.prototype.inBoard = function (r, c) {
  return r >= 0 && c >= 0 && r < this.n && c < this.n;
};

Grid.prototype.walkRiver = function (r, c, flow) {
  const self = this;
  function paint(rr, cc) {
    if (!self.inBoard(rr, cc)) return false;
    const cell = self.cells[rr][cc];
    if (cell.is("water")) return true;
    if (cell.isHole()) return false;
    cell.setType("water");
    self.markHole(cell);
    return true;
  }
  function onFar(rr, cc) {
    if (flow.far === "n") return rr === 0;
    if (flow.far === "s") return rr === self.n - 1;
    if (flow.far === "w") return cc === 0;
    return cc === self.n - 1;
  }
  function sideOk(rr, cc) {
    if (!self.inBoard(rr, cc)) return false;
    const br = rr - flow.dr;
    const bc = cc - flow.dc;
    if (!self.inBoard(br, bc)) return true;
    return !self.cells[br][bc].is("water");
  }

  if (!paint(r, c)) return false;
  if (onFar(r, c)) return true;
  let lastMeander = false;
  const cap = this.n * this.n;
  for (let i = 0; i < cap; i++) {
    const fwd = { r: r + flow.dr, c: c + flow.dc };
    let next = null;
    if (lastMeander) {
      next = this.inBoard(fwd.r, fwd.c) ? fwd : null;
    } else {
      const L = { r: r - flow.dc, c: c + flow.dr };
      const R = { r: r + flow.dc, c: c - flow.dr };
      const roll = Math.random();
      if (roll < 0.5) {
        next = this.inBoard(fwd.r, fwd.c) ? fwd : null;
      } else if (roll < 0.75) {
        next = sideOk(L.r, L.c) ? L : this.inBoard(fwd.r, fwd.c) ? fwd : null;
      } else {
        next = sideOk(R.r, R.c) ? R : this.inBoard(fwd.r, fwd.c) ? fwd : null;
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

Grid.prototype.placeWater = function () {
  const river = (this.plan && this.plan.river) | 0;
  const n = this.n;

  for (let t = 0; t < WATER_TRIES; t++) {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const cell = this.cells[r][c];
        if (cell.is("water")) {
          cell.setType("grass");
          cell.dellId = -1;
        }
      }
    }

    if (river === 2) {
      const lo = 2;
      const hi = n - 3;
      const starts = [];
      if (hi >= lo) {
        for (let i = lo; i <= hi; i++) {
          starts.push({ r: 0, c: i, flow: RIVER_FLOW.s });
          starts.push({ r: n - 1, c: i, flow: RIVER_FLOW.n });
          starts.push({ r: i, c: 0, flow: RIVER_FLOW.e });
          starts.push({ r: i, c: n - 1, flow: RIVER_FLOW.w });
        }
      }
      if (!starts.length) continue;
      const pick = starts[Math.floor(Math.random() * starts.length)];
      if (!this.walkRiver(pick.r, pick.c, pick.flow)) continue;
    }

    const jobs = [];
    const src = (this.plan || {}).ponds;
    if (Array.isArray(src)) {
      for (let i = 0; i < src.length; i++) {
        const sz = src[i] | 0;
        if (sz >= 1 && sz <= POND_SHAPES.length) jobs.push(sz);
      }
    } else {
      const want = src | 0;
      for (let i = 0; i < want; i++) jobs.push(0);
    }

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
        for (let c = 0; c <= n - w; c++) {
          let fits = r >= 0 && c >= 0 && r + h <= n && c + w <= n;
          if (fits) {
            for (let rr = r; rr < r + h && fits; rr++) {
              for (let cc = c; cc < c + w; cc++) {
                if (this.cells[rr][cc].isHole()) {
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
          this.cells[r][c].setType("water");
          this.markHole(this.cells[r][c]);
        }
      }
    }
    if (!pondsOk) continue;

    if (river === 1) {
      const ponds = [];
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (this.cells[r][c].is("water")) ponds.push({ r: r, c: c });
        }
      }
      if (!ponds.length) continue;
      const pick = ponds[Math.floor(Math.random() * ponds.length)];
      const opts = [
        { dist: pick.r, flow: RIVER_FLOW.n },
        { dist: n - 1 - pick.r, flow: RIVER_FLOW.s },
        { dist: pick.c, flow: RIVER_FLOW.w },
        { dist: n - 1 - pick.c, flow: RIVER_FLOW.e },
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
      for (let c = 0; c < n; c++) {
        if (!this.cells[r][c].is("water")) {
          grass = true;
          break;
        }
      }
      if (!grass) linesOk = false;
    }
    for (let c = 0; c < n && linesOk; c++) {
      let grass = false;
      for (let r = 0; r < n; r++) {
        if (!this.cells[r][c].is("water")) {
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
    const seen = {};
    const opts = [];
    for (let i = 0; i < body.length; i++) {
      for (let d = 0; d < DELL_DIRS.length; d++) {
        const nr = body[i].r + DELL_DIRS[d][0];
        const nc = body[i].c + DELL_DIRS[d][1];
        if (nr < 0 || nc < 0 || nr >= this.n || nc >= this.n) continue;
        const key = nr + "," + nc;
        if (seen[key]) continue;
        if (this.cells[nr][nc].isHole()) continue;
        seen[key] = true;
        opts.push({ r: nr, c: nc });
      }
    }
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

Grid.prototype.placeHawk = function () {
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
  if (!this.plan || !this.plan.hawk) return true;
  const sides = shuffleInPlace(["L", "R"].slice());
  for (let i = 0; i < sides.length; i++) {
    const side = sides[i];
    const col = side === "L" ? 0 : this.n - 1;
    if (this.cells[0][col].isHole()) continue;
    let open = 0;
    for (let r = 1; r < this.n; r++) {
      const c = side === "L" ? r : this.n - 1 - r;
      if (!this.inBoard(r, c)) continue;
      if (this.cells[r][c].isHole()) continue;
      open++;
    }
    if (open < 5) continue;
    const cell = this.cells[0][col];
    cell.setType("hawk");
    this.markHole(cell);
    this.hawk = side;
    return true;
  }
  return false;
};

Grid.prototype.placeBunny = function () {
  for (let r = 0; r < this.n; r++) {
    for (let c = 0; c < this.n; c++) {
      const cell = this.cells[r][c];
      if (cell.is("bunny")) {
        cell.setType("grass");
        cell.dellId = -1;
      }
    }
  }
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
    const seats = [];
    const use = this.hawk;
    for (let r = 1; r < n; r++) {
      const c = use === "L" ? r : n - 1 - r;
      if (this.foxSeatOk(r, c)) seats.push({ r: r, c: c });
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

Grid.prototype.prepLand = function () {
  if (!this.placeWater()) return false;
  if (!this.placeHawk()) return false;
  if (!this.placeCave()) return false;
  if (!this.placeBunny()) return false;
  this.fillWaterIslands();
  const masses = this.grassMasses();
  if (!masses.length || masses.length > this.n) return false;
  let cap = 0;
  for (let i = 0; i < masses.length; i++) {
    if (masses[i].size < MIN_DELL_SIZE) return false;
    cap += Math.floor(masses[i].size / MIN_DELL_SIZE);
  }
  return cap >= this.n;
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

  const seeds = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const cell = this.cells[r][c];
      if (cell.spriteId === "o" && !cell.isHole()) seeds.push({ r: r, c: c });
    }
  }
  if (seeds.length !== n) return false;

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const cell = this.cells[r][c];
      cell.dellId = cell.isHole() ? HOLE_DELL : -1;
    }
  }

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

  function edgesFrom(allow) {
    const out = [];
    for (let i = 0; i < frontier.length; i++) {
      const f = frontier[i];
      if (!allow(f.id, sizes[f.id] || 0)) continue;
      for (let d = 0; d < DELL_DIRS.length; d++) {
        const nr = f.r + DELL_DIRS[d][0];
        const nc = f.c + DELL_DIRS[d][1];
        if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
        if (self.cells[nr][nc].dellId !== -1) continue;
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
      for (let c = 0; c < n; c++) {
        if (self.cells[r][c].dellId === -1) return true;
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
