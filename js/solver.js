/**
  Count legal O placements. Stops at `limit` (use 2 for uniqueness).
  The player does not know which cave spot holds the wolf, so every cave spot is tried as the wolf
  and each wolf spot with its fox layout counts as its own solution. Unique means the foxes and the wolf are both forced.
  Foxes always taunt the wolf: at least one fox sits next to a cave spot that is not the wolf's.
 */

function Solver(grid) {
  this.grid = grid;
  this.n = grid.n;
  this.cols = grid.cols;
  this.dells = [];
  this.seats = [];
  this.runs = [];
  this.bunnyAt = [];
  this.hawkAt = [];
  this.needBunny = 0;
  this.needHawk = 0;
  this.dens = [];

  const n = this.n;
  const cols = this.cols;
  const bunny = grid.findType("bunny");
  if (bunny) this.needBunny = 2;
  if (grid.hawk) this.needHawk = 1;

  for (let r = 0; r < n; r++) {
    const dellRow = [];
    const seatRow = [];
    const runRow = [];
    const bunnyRow = [];
    const hawkRow = [];
    for (let c = 0; c < cols; c++) {
      const cell = grid.at(r, c);
      const dell = cell.dellId;
      const blocked = cell.isHole();
      const run = blocked ? -1 : grid.runOf(r, c);
      dellRow.push(dell);
      runRow.push(run);
      const onBunny = !!(bunny && Math.max(Math.abs(r - bunny.row), Math.abs(c - bunny.col)) === 1);
      const onHawk = !!(grid.hawk && grid.onHawkLine && grid.onHawkLine(r, c));
      bunnyRow.push(onBunny ? 1 : 0);
      hawkRow.push(onHawk ? 1 : 0);
      if (!blocked && dell >= 0 && run >= 0) seatRow.push(c);
    }
    this.dells.push(dellRow);
    this.seats.push(seatRow);
    this.runs.push(runRow);
    this.bunnyAt.push(bunnyRow);
    this.hawkAt.push(hawkRow);
  }

  // With no wolf on the board there is a single pass with no wolf spot.
  if (grid.wolfRow >= 0) {
    const caves = grid.caveCells();
    for (let i = 0; i < caves.length; i++) this.dens.push({ row: caves[i].row, col: caves[i].col });
  } else {
    this.dens.push(null);
  }
}

Solver.prototype.count = function (limit) {
  const cap = limit || 2;
  const n = this.n;
  const dells = this.dells;
  const seats = this.seats;
  const runs = this.runs;
  const bunnyAt = this.bunnyAt;
  const hawkAt = this.hawkAt;
  const needBunny = this.needBunny;
  const needHawk = this.needHawk;
  let found = 0;
  let den = null;
  let taunt = null; // per wolf spot, which seats touch an empty cave spot

  function runBit(col, run) {
    return 1 << (col * 2 + run);
  }

  function alive(row, prevCol, usedRuns, usedDells) {
    const list = seats[row];
    for (let i = 0; i < list.length; i++) {
      const col = list[i];
      if (den && Math.abs(row - den.row) <= 1 && Math.abs(col - den.col) <= 1) continue;
      const run = runs[row][col];
      if (usedRuns & runBit(col, run)) continue;
      if (prevCol >= 0 && Math.abs(col - prevCol) < 2) continue;
      if (usedDells & (1 << dells[row][col])) continue;
      return true;
    }
    return false;
  }

  function walk(row, prevCol, usedRuns, usedDells, ringHits, hawkHits, taunted) {
    if (found >= cap) return;
    if (ringHits > needBunny) return;
    if (hawkHits > needHawk) return;
    if (row === n) {
      if (ringHits === needBunny && hawkHits === needHawk && (!den || taunted)) found++;
      return;
    }
    const list = seats[row];
    for (let i = 0; i < list.length; i++) {
      const col = list[i];
      if (den && Math.abs(row - den.row) <= 1 && Math.abs(col - den.col) <= 1) continue;
      const run = runs[row][col];
      if (usedRuns & runBit(col, run)) continue;
      if (prevCol >= 0 && Math.abs(col - prevCol) < 2) continue;
      const dell = dells[row][col];
      if (usedDells & (1 << dell)) continue;
      const nextRuns = usedRuns | runBit(col, run);
      const nextDells = usedDells | (1 << dell);
      if (row + 1 < n && !alive(row + 1, col, nextRuns, nextDells)) continue;
      walk(
        row + 1,
        col,
        nextRuns,
        nextDells,
        ringHits + bunnyAt[row][col],
        hawkHits + hawkAt[row][col],
        taunted || !!(den && taunt[row][col])
      );
      if (found >= cap) return;
    }
  }

  for (let r = 0; r < n; r++) {
    if (!seats[r].length) return 0;
  }
  for (let i = 0; i < this.dens.length && found < cap; i++) {
    den = this.dens[i];
    if (den) {
      taunt = [];
      for (let r = 0; r < n; r++) {
        const row = [];
        for (let c = 0; c < this.cols; c++) {
          let near = false;
          for (let k = 0; k < this.dens.length; k++) {
            const cave = this.dens[k];
            if (cave === den) continue;
            if (Math.abs(r - cave.row) <= 1 && Math.abs(c - cave.col) <= 1) near = true;
          }
          row.push(near);
        }
        taunt.push(row);
      }
    }
    walk(0, -1, 0, 0, 0, 0, false);
  }
  return found;
};
