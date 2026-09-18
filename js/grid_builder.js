/** Fills a Grid from a planner card. */

const MIN_DELL_SIZE = 2;
const DELL_TARGET = 3;
const DELL_PAINT_TRIES = 40;
const PLACE_TRIES = 200;
const UNIQUE_TRIES = 250;
const CAVE_SIZE = [2,3];
const POND_MIN_LEVEL = 7;
const POND_SHAPES = [
  [ [2, 2], [2, 3], [3, 2] ],
  [ [3, 3], [2, 4], [4, 2] ],
  [ [2, 5], [5,2], [3, 4], [4, 3] ],
];


const DELL_DIRS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

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

Grid.prototype.clearPonds = function () {
  for (let r = 0; r < this.n; r++) {
    for (let c = 0; c < this.n; c++) {
      const cell = this.cells[r][c];
      if (cell.is("pond")) {
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

Grid.prototype.tryPlaceOnePond = function () {
  const groupCount = Math.min( this.n - POND_MIN_LEVEL + 1, POND_SHAPES.length)
  const available = POND_SHAPES.slice(0, groupCount).flat();
  const shape = available[Math.floor(Math.random() * available.length)];
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
      this.cells[r][c].setType("pond");
      this.markHole(this.cells[r][c]);
    }
  }
  return true;
};

Grid.prototype.placePonds = function () {
  this.clearPonds();
  const want = this.plan && this.plan.ponds ? this.plan.ponds : 0;
  for (let i = 0; i < want; i++) {
    if (!this.tryPlaceOnePond()) return false;
  }
  return true;
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
  const want = CAVE_SIZE[0] + Math.floor(Math.random() * (1+CAVE_SIZE[1]-CAVE_SIZE[0]));
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

Grid.prototype.placeBunny = function () {
  this.clearBunny();
  if (!this.plan || !this.plan.bunny) return true;
  const last = this.n - 1;
  const spots = [];
  for (let r = 0; r < this.n; r++) {
    for (let c = 0; c < this.n; c++) {
      if ((r === 0 || r === last) && (c === 0 || c === last)) continue;
      if (this.cells[r][c].isHole()) continue;
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

Grid.prototype.placeOs = function () {
  for (let t = 0; t < PLACE_TRIES; t++) {
    if (this.tryPlaceOs()) return true;
  }
  return false;
};

Grid.prototype.tryPlaceOs = function () {
  this.clearSprites();
  const rows = [];
  const cols = [];
  for (let i = 0; i < this.n; i++) {
    rows.push(i);
    cols.push(i);
  }
  const bunny = this.findBunny();
  if (bunny) {
    const pairs = this.bunnyPairs(bunny.row, bunny.col);
    if (!pairs.length) return false;
    const pair = pairs[Math.floor(Math.random() * pairs.length)];
    for (let i = 0; i < pair.length; i++) {
      const seat = pair[i];
      this.cells[seat.r][seat.c].setSprite("o");
      const ri = rows.indexOf(seat.r);
      const ci = cols.indexOf(seat.c);
      if (ri < 0 || ci < 0) return false;
      rows.splice(ri, 1);
      cols.splice(ci, 1);
    }
  }
  while (rows.length) {
    const opts = [];
    for (let i = 0; i < rows.length; i++) {
      for (let j = 0; j < cols.length; j++) {
        if (this.isHole(rows[i], cols[j])) continue;
        if (this.nearWolf(rows[i], cols[j])) continue;
        if (!this.hasNearbyO(rows[i], cols[j])) {
          opts.push({ i: i, j: j });
        }
      }
    }
    if (!opts.length) return false;
    const pick = opts[Math.floor(Math.random() * opts.length)];
    const row = rows.splice(pick.i, 1)[0];
    const col = cols.splice(pick.j, 1)[0];
    this.cells[row][col].setSprite("o");
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
  if (!seeds.length) return false;

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
    if (this.cells[s.r][s.c].isHole()) continue;
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

  function unclaimed() {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (self.cells[r][c].dellId === -1) return true;
      }
    }
    return false;
  }

  while (unclaimed()) {
    const opts = nextOpts();
    if (!opts.length) return false;
    shuffleInPlace(opts);
    let placed = false;
    for (let i = 0; i < opts.length; i++) {
      const e = opts[i];
      if (this.cells[e.r][e.c].dellId !== -1) continue;
      this.cells[e.r][e.c].dellId = e.id;
      if (new Solver(this).count(2) === 1) {
        sizes[e.id]++;
        frontier.push({ r: e.r, c: e.c, id: e.id });
        placed = true;
        break;
      }
      this.cells[e.r][e.c].dellId = -1;
      this.backs++;
    }
    if (!placed) return false;
  }

  for (let i = 0; i < sizes.length; i++) {
    if (sizes[i] && sizes[i] < floor) return false;
  }
  return new Solver(this).count(2) === 1;
};

Grid.prototype.rebuild = function (plan) {
  this.plan = plan || this.plan || { n: this.n, ponds: 0, wolf: false, bunny: false };
  this.unique = false;
  this.wolfShown = false;
  this.tries = 0;
  this.backs = 0;
  for (let t = 0; t < UNIQUE_TRIES; t++) {
    this.tries++;
    if (!this.placePonds()) continue;
    if (!this.placeCave()) continue;
    if (!this.placeBunny()) continue;
    this.placeOs();
    this.paintDells();
    if (new Solver(this).count(2) === 1) {
      this.unique = true;
      this.clearGuesses();
      return true;
    }
  }
  return false;
};
