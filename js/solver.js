/** Count legal O placements. Stops at `limit` (use 2 for uniqueness). */

function Solver(grid) {
  this.grid = grid;
  this.n = grid.n;
  this.needBunny = 0;
  this.needHawk = 0;

  const n = this.n;
  const bunny = grid.findBunny && grid.findBunny();
  if (bunny) this.needBunny = 2;
  if (grid.hawk) this.needHawk = 1;

  const dells = [];
  const seatMask = [];
  const hawkMask = [];
  const bunnyMask = [];
  const dellMask = [];

  for (let r = 0; r < n; r++) {
    const dellRow = [];
    const dRow = [];
    let seats = 0;
    let hawk = 0;
    let ring = 0;
    for (let d = 0; d < n; d++) dRow.push(0);
    for (let c = 0; c < n; c++) {
      const cell = grid.at(r, c);
      const dell = cell.dellId;
      const blocked = cell.isHole() || grid.nearWolf(r, c);
      dellRow.push(dell);
      const onBunny = !!(bunny && Math.max(Math.abs(r - bunny.row), Math.abs(c - bunny.col)) === 1);
      const onHawk = !!(grid.hawk && grid.onHawkLine && grid.onHawkLine(r, c));
      if (blocked || dell < 0 || dell >= n) continue;
      const bit = 1 << c;
      seats |= bit;
      dRow[dell] |= bit;
      if (onHawk) hawk |= bit;
      if (onBunny) ring |= bit;
    }
    dells.push(dellRow);
    seatMask.push(seats);
    hawkMask.push(hawk);
    bunnyMask.push(ring);
    dellMask.push(dRow);
  }

  this.dells = dells;
  this.seatMask = seatMask;
  this.hawkMask = hawkMask;
  this.bunnyMask = bunnyMask;
  this.dellMask = dellMask;
}

Solver.prototype.count = function (limit) {
  const cap = limit || 2;
  const n = this.n;
  const dells = this.dells;
  const hawkMask = this.hawkMask;
  const bunnyMask = this.bunnyMask;
  const dellMask = this.dellMask;
  const needBunny = this.needBunny;
  const needHawk = this.needHawk;
  const allCols = n === 32 ? -1 : (1 << n) - 1;
  let found = 0;

  for (let r = 0; r < n; r++) {
    if (!this.seatMask[r]) return 0;
  }

  function walk(domain, usedRows, placed, ringHits, hawkHits) {
    if (found >= cap) return;
    if (ringHits > needBunny || hawkHits > needHawk) return;

    if (placed === n) {
      if (ringHits === needBunny && hawkHits === needHawk) found++;
      return;
    }

    let hawkLeft = 0;
    let ringLeft = 0;
    let best = -1;
    let bestN = 33;
    for (let r = 0; r < n; r++) {
      if (usedRows & (1 << r)) continue;
      const bits = domain[r];
      if (!bits) return;
      if (bits & hawkMask[r]) hawkLeft++;
      if (bits & bunnyMask[r]) ringLeft++;
      let cnt = 0;
      for (let x = bits; x; x &= x - 1) cnt++;
      if (cnt < bestN) {
        bestN = cnt;
        best = r;
      }
    }
    if (hawkHits + hawkLeft < needHawk) return;
    if (ringHits + ringLeft < needBunny) return;

    const rowBits = domain[best];
    const nextRows = usedRows | (1 << best);
    for (let col = 0; col < n; col++) {
      const bit = 1 << col;
      if (!(rowBits & bit)) continue;
      const dell = dells[best][col];
      const adj = (bit | (col ? bit >> 1 : 0) | (bit << 1)) & allCols;
      const child = domain.slice();
      child[best] = 0;
      let dead = false;
      for (let r = 0; r < n; r++) {
        if (r === best || (nextRows & (1 << r))) continue;
        let next = child[r];
        next &= ~bit;
        if (dell >= 0) next &= ~dellMask[r][dell];
        if (r === best - 1 || r === best + 1) next &= ~adj;
        child[r] = next;
        if (!next) {
          dead = true;
          break;
        }
      }
      if (dead) continue;
      walk(
        child,
        nextRows,
        placed + 1,
        ringHits + ((bunnyMask[best] & bit) ? 1 : 0),
        hawkHits + ((hawkMask[best] & bit) ? 1 : 0)
      );
      if (found >= cap) return;
    }
  }

  walk(this.seatMask.slice(), 0, 0, 0, 0);
  return found;
};
