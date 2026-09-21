/** Count legal O placements. Stops at `limit` (use 2 for uniqueness). */

function Solver(grid) {
  this.grid = grid;
  this.n = grid.n;
  this.dells = [];
  this.blocked = [];
  this.bunnyRing = {};
  this.needBunny = 0;
  this.hawkLine = {};
  this.needHawk = 0;
  const bunny = grid.findBunny && grid.findBunny();
  if (bunny) {
    this.needBunny = 2;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const r = bunny.row + dr;
        const c = bunny.col + dc;
        if (r < 0 || c < 0 || r >= this.n || c >= this.n) continue;
        this.bunnyRing[r + "," + c] = true;
      }
    }
  }
  if (grid.hawk) {
    this.needHawk = 1;
    for (let r = 1; r < this.n; r++) {
      const c = grid.hawk === "L" ? r : this.n - 1 - r;
      this.hawkLine[r + "," + c] = true;
    }
  }
  for (let r = 0; r < this.n; r++) {
    const row = [];
    const block = [];
    for (let c = 0; c < this.n; c++) {
      const cell = grid.at(r, c);
      row.push(cell.dellId);
      block.push(cell.isHole() || grid.nearWolf(r, c));
    }
    this.dells.push(row);
    this.blocked.push(block);
  }
}

Solver.prototype.count = function (limit) {
  const cap = limit || 2;
  const n = this.n;
  const dells = this.dells;
  const blocked = this.blocked;
  const bunnyRing = this.bunnyRing;
  const needBunny = this.needBunny;
  const hawkLine = this.hawkLine;
  const needHawk = this.needHawk;
  let found = 0;

  function walk(row, prevCol, usedCols, usedDells, ringHits, hawkHits) {
    if (found >= cap) return;
    if (ringHits > needBunny) return;
    if (hawkHits > needHawk) return;
    if (row === n) {
      if (ringHits === needBunny && hawkHits === needHawk) found++;
      return;
    }
    for (let col = 0; col < n; col++) {
      if (blocked[row][col]) continue;
      if (usedCols & (1 << col)) continue;
      if (prevCol >= 0 && Math.abs(col - prevCol) < 2) continue;
      const dell = dells[row][col];
      if (dell < 0 || usedDells & (1 << dell)) continue;
      const hit = bunnyRing[row + "," + col] ? 1 : 0;
      const hawk = hawkLine[row + "," + col] ? 1 : 0;
      walk(row + 1, col, usedCols | (1 << col), usedDells | (1 << dell), ringHits + hit, hawkHits + hawk);
      if (found >= cap) return;
    }
  }

  walk(0, -1, 0, 0, 0, 0);
  return found;
};
