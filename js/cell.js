/** One board square. type is the kind. spriteId is hidden fox. guessId is the mark. */

const CELL_DELL_COLORS = [
  "#6b8f4e", // grass
  "#8d4d4a", // brick
  "#a67c56", // clay
  "#9a8444", // ochre
  "#5f6844", // khaki
  "#3d6a50", // pine
  "#3e7874", // teal
  "#a15d3f", // rust
  "#4e4a78", // indigo
  "#7a5284", // plum  
  "#a86a78", // rose
  "#6b5644", // umber
  "#75797d", // steel
  "#6d6896", // lilac
  "#5a6c96", // slate
];
  
const CELL_TYPES = {
  grass: {
    glyphColor: "#000000",
    tap: true,
    markO: "o",
  },
  water: {
    fill: "#001D66",
    edge: "#1B3E98",
    tap: false,
  },
  cave: {
    fill: "#242119",
    edge: "#777777",
    glyphColor: "#c8c8c8",
    tap: true,
    markO: "w",
  },
  bunny: {
    fill: "#205F16",
    edge: "#329B22",
    tap: false,
    stand: "b",
  },
  hawk: {
    fill: "#3a4a58",
    edge: "#3E9CCC",
    bandFrac: 0.04,
    tap: false,
    stand: "h",
  },
  tree: {
    fill: "#354E31",
    edge: "#92A85D",
    tap: false,
    stand: "t",
  },
};

const CHECK_LINE_W = 0.05;
const SHADOW_LINE_W = 0.05;
const EDGE_LINE_SCALE = 0.8;
const CELL_RADIUS = 0.19;
const CELL_RADIUS_MIN = 5;
const CELL_PAD = 0.06;

const CELL_SHADOW = "#0000004d";
const CELL_OFF_FILL = "#000000";
const WARN_EDGE = "#f5c518";
const WRONG_EDGE = "#e23b3b";
const LOCKED_EDGE = "#7dffa3";
const HINT_PRINT_EDGE = "#3e7cff";
const HINT_REASON_EDGE = "#3ee0e0";

function Cell(row, col) {
  this.row = row;
  this.col = col;
  this.dellId = 0;
  this.type = "grass";
  this.spriteId = null;
  this.guessId = null;
  this.wrong = false;
  this.warn = false;
  this.locked = false;
  this.flipStand = false;
  this.look = CELL_TYPES.grass;
  this.fill = null;
  this.round = [true, true, true, true];
  this.hintEdge = "";
}

Cell.types = CELL_TYPES;

Cell.prototype.is = function (name) {
  return this.type === name;
};

Cell.prototype.isHole = function () {
  return this.type !== "grass";
};

Cell.prototype.canTap = function () {
  if (this.locked) return false;
  return this.look.tap !== false;
};

Cell.prototype.setGuess = function (id) {
  if (this.locked) return;
  this.guessId = id || null;
  this.wrong = false;
  this.warn = false;
};

Cell.prototype.clearGuess = function () {
  if (this.locked) return;
  this.guessId = null;
  this.wrong = false;
  this.warn = false;
};

Cell.prototype.resetMarks = function () {
  this.guessId = null;
  this.wrong = false;
  this.warn = false;
  this.locked = false;
};

Cell.prototype.draw = function (ctx, sprites, x, y, s, revealWolf) {
  const look = this.look || CELL_TYPES[this.type] || CELL_TYPES.grass;
  const rad = Math.max(CELL_RADIUS_MIN, Math.floor(s * CELL_RADIUS));
  const max = s / 2;
  const corners = [
    Math.min(this.round[0] ? rad : 0, max),
    Math.min(this.round[1] ? rad : 0, max),
    Math.min(this.round[2] ? rad : 0, max),
    Math.min(this.round[3] ? rad : 0, max),
  ];
  const checkW = Math.max(2, Math.floor(s * CHECK_LINE_W));

  // The cell square with its rounded corners, inset px in from each side.
  function shape(inset, fill) {
    const side = s - inset * 2;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x + inset, y + inset, side, side, corners);
      if (fill) ctx.fill();
      else ctx.stroke();
      return;
    }
    if (fill) ctx.fillRect(x + inset, y + inset, side, side);
    else ctx.strokeRect(x + inset, y + inset, side, side);
  }

  function ring(color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    shape(1, false);
  }

  ctx.save();
  ctx.strokeStyle = CELL_SHADOW;
  ctx.lineWidth = Math.max(1, Math.floor(s * SHADOW_LINE_W));
  shape(0, false);

  ctx.fillStyle = this.fill || look.fill || CELL_DELL_COLORS[0];
  shape(0, true);

  if (look.edge) ring(look.edge, Math.max(1, Math.floor(checkW * EDGE_LINE_SCALE)));

  const pad = Math.max(0, Math.floor(s * CELL_PAD));
  const box = Math.max(1, s - pad * 2);
  const px = x + pad;
  const py = y + pad;
  if (look.stand) {
    const stand = sprites.get(look.stand);
    if (stand) {
      if (this.flipStand) {
        ctx.save();
        ctx.translate(px + box, py);
        ctx.scale(-1, 1);
        stand.draw(ctx, 0, 0, box);
        ctx.restore();
      } else {
        stand.draw(ctx, px, py, box);
      }
    }
  }
  if (this.is("cave") && (this.guessId === "o" || revealWolf)) {
    const sprite = sprites.get(look.markO || "w");
    if (sprite) sprite.draw(ctx, px, py, box);
  } else if (this.guessId === "o") {
    const sprite = sprites.get(look.markO || "o");
    if (sprite) sprite.draw(ctx, px, py, box);
  } else if (this.guessId === "x") {
    if (this.locked) {
      const print = sprites.get("p");
      if (print) print.draw(ctx, px, py, box);
      else sprites.get(this.is("cave") ? "xl" : "x").draw(ctx, px, py, box);
    } else {
      sprites.get(this.is("cave") ? "xl" : "x").draw(ctx, px, py, box);
    }
  }

  if (this.warn) ring(WARN_EDGE, checkW);
  else if (this.wrong) ring(WRONG_EDGE, checkW);
  else if (this.locked && this.guessId === "o") ring(LOCKED_EDGE, checkW);

  if (this.hintEdge) ring(this.hintEdge === "print" ? HINT_PRINT_EDGE : HINT_REASON_EDGE, checkW);
  ctx.restore();
};

Cell.samePatch = function (grid, cell, row, col) {
  if (row < 0 || col < 0 || row >= grid.rows || col >= grid.cols) return false;
  const other = grid.at(row, col);
  if (cell.type !== "grass") return other.type === cell.type;
  return other.type === "grass" && other.dellId === cell.dellId;
};

Cell.dressGrid = function (grid) {
  if (!grid) return;
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const cell = grid.at(r, c);
      const kind = cell.type || "grass";
      cell.look = CELL_TYPES[kind] || CELL_TYPES.grass;
      if (kind === "grass") {
        cell.fill = cell.dellId < 0 || cell.dellId > CELL_DELL_COLORS.length - 1 ? CELL_OFF_FILL : CELL_DELL_COLORS[cell.dellId];
      } else {
        cell.fill = cell.look.fill;
      }      
      cell.flipStand = !!(cell.is("hawk") && grid.hawk === "R");
      const up = Cell.samePatch(grid, cell, r - 1, c);
      const down = Cell.samePatch(grid, cell, r + 1, c);
      const left = Cell.samePatch(grid, cell, r, c - 1);
      const right = Cell.samePatch(grid, cell, r, c + 1);
      cell.round = [!(up || left), !(up || right), !(down || right), !(down || left)];
    }
  }
};
