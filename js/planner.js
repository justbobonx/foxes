/** Picks what a board should contain. Grid.rebuild only builds the card. */

function Planner() {}

Planner.prototype.roll = function (n) {
  return {
    n: n,
    ponds: n >= POND_MIN_LEVEL && Math.random() < 0.5 ? 1 : 0,
    wolf: n >= 8 && Math.random() < 0.5,
    bunny: n >= 8 && Math.random() < 0.5,
  };
};
