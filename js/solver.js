/** Count legal O placements. Stops at `limit` (use 2 for uniqueness). */

function Solver(grid) {
  this.grid = grid;
  this.n = grid.n;
  this.dells = [];
  this.seats = [];
  this.bunnyAt = [];
  this.hawkAt = [];
  this.needBunny = 0;
  this.needHawk = 0;

  const n = this.n;
  const bunny = grid.findBunny && grid.findBunny();
  if (bunny) this.needBunny = 2;
  if (grid.hawk) this.needHawk = 1;

  for (let r = 0; r < n; r++) {
    const dellRow = [];
    const seatRow = [];
    const bunnyRow = [];
    const hawkRow = [];
    for (let c = 0; c < n; c++) {
      const cell = grid.at(r, c);
      const dell = cell.dellId;
      const blocked = cell.isHole() || grid.nearWolf(r, c);
      dellRow.push(dell);
      const onBunny = !!(bunny && Math.max(Math.abs(r - bunny.row), Math.abs(c - bunny.col)) === 1);
      const onHawk = !!(grid.hawk && grid.onHawkLine && grid.onHawkLine(r, c));
      bunnyRow.push(onBunny ? 1 : 0);
      hawkRow.push(onHawk ? 1 : 0);
      if (!blocked && dell >= 0) seatRow.push(c);
    }
    this.dells.push(dellRow);
    this.seats.push(seatRow);
    this.bunnyAt.push(bunnyRow);
    this.hawkAt.push(hawkRow);
  }
}

Solver.prototype.count = function (limit) {
  const cap = limit || 2;
  const n = this.n;
  const dells = this.dells;
  const seats = this.seats;
  const bunnyAt = this.bunnyAt;
  const hawkAt = this.hawkAt;
  const needBunny = this.needBunny;
  const needHawk = this.needHawk;
  let found = 0;

  function alive(row, prevCol, usedCols, usedDells) {
    const list = seats[row];
    for (let i = 0; i < list.length; i++) {
      const col = list[i];
      if (usedCols & (1 << col)) continue;
      if (prevCol >= 0 && Math.abs(col - prevCol) < 2) continue;
      if (usedDells & (1 << dells[row][col])) continue;
      return true;
    }
    return false;
  }

  function walk(row, prevCol, usedCols, usedDells, ringHits, hawkHits) {
    if (found >= cap) return;
    if (ringHits > needBunny) return;
    if (hawkHits > needHawk) return;
    if (row === n) {
      if (ringHits === needBunny && hawkHits === needHawk) found++;
      return;
    }
    const list = seats[row];
    for (let i = 0; i < list.length; i++) {
      const col = list[i];
      if (usedCols & (1 << col)) continue;
      if (prevCol >= 0 && Math.abs(col - prevCol) < 2) continue;
      const dell = dells[row][col];
      if (usedDells & (1 << dell)) continue;
      const nextCols = usedCols | (1 << col);
      const nextDells = usedDells | (1 << dell);
      if (row + 1 < n && !alive(row + 1, col, nextCols, nextDells)) continue;
      walk(
        row + 1,
        col,
        nextCols,
        nextDells,
        ringHits + bunnyAt[row][col],
        hawkHits + hawkAt[row][col]
      );
      if (found >= cap) return;
    }
  }

  for (let r = 0; r < n; r++) {
    if (!seats[r].length) return 0;
  }
  walk(0, -1, 0, 0, 0, 0);
  return found;
};
