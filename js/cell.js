/** One board square. type is the kind. spriteId is hidden fox. guessId is the mark. */

const CELL_DELL_COLORS = [
  // "#6b8f4e",  this one is the default grass
  "#8a6b3f",
  "#4e7a6b",
  "#a08a4a",
  //"#6a5a7a", light purp
  "#7a4e4e",
  //"#4e6a8a",  too much like water
  //"#7a7a4e",  too much like other brown / oranges
  //"#5a7a5a",  too much like grass
  //"#8a5a6a", too pink??
  "#4e5a4e",
  "#6b5a3f",
  "#3f6b6b",
  //"#8a7a6b", too light cream
  "#5a4e6b",
  //"#6b6b5a", more tan
  "#4a6b4e",
  "#7a5a4e",
  "#4e5a6b",
  "#5a6b4e",
];

const CELL_TYPES = {
  grass: {
    glyphColor: "#2a2118",
    tap: true,
    markO: "o",
  },
  pond: {
    fill: "#0E2F5D",
    edge: "#226CD3",
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
    fill: "#44571E",
    edge: "#A4C85B",
    tap: false,
    stand: "b",
  },
};

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
  this.look = CELL_TYPES.grass;
  this.fill = null;
  this.round = [true, true, true, true];
}

Cell.types = CELL_TYPES;

Cell.prototype.is = function (name) {
  return this.type === name;
};

Cell.prototype.isHole = function () {
  return this.type !== "grass";
};

Cell.prototype.setType = function (name) {
  this.type = name || "grass";
};

Cell.prototype.canTap = function () {
  if (this.locked) return false;
  return this.look ? this.look.tap !== false : this.type === "grass" || this.type === "cave";
};

Cell.prototype.setSprite = function (id) {
  this.spriteId = id || null;
};

Cell.prototype.clearSprite = function () {
  this.spriteId = null;
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

Cell.prototype.capRadii = function (ctx, w, h, rad) {
  const max = Math.min(w, h) / 2;
  if (typeof rad === "number") return Math.min(Math.max(0, rad), max);
  const out = [];
  for (let i = 0; i < 4; i++) out.push(Math.min(Math.max(0, rad[i] || 0), max));
  return out;
};

Cell.prototype.fillRound = function (ctx, x, y, w, h, rad) {
  const r = this.capRadii(ctx, w, h, rad);
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    return;
  }
  ctx.fillRect(x, y, w, h);
};

Cell.prototype.strokeRound = function (ctx, x, y, w, h, rad) {
  const r = this.capRadii(ctx, w, h, rad);
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.stroke();
    return;
  }
  ctx.strokeRect(x, y, w, h);
};

Cell.prototype.drawMark = function (ctx, sprites, x, y, s, revealWolf) {
  const look = this.look || CELL_TYPES[this.type] || CELL_TYPES.grass;
  const pad = Math.max(0, Math.floor(s * 0.06));
  const box = Math.max(1, s - pad * 2);
  const px = x + pad;
  const py = y + pad;
  if (look.stand) {
    const stand = sprites.get(look.stand);
    if (stand) stand.draw(ctx, px, py, box);
  }
  if (this.is("cave") && (this.guessId === "o" || revealWolf)) {
    const sprite = sprites.get(look.markO || "w");
    if (sprite) sprite.draw(ctx, px, py, box);
    return;
  }
  if (this.guessId === "o") {
    const sprite = sprites.get(look.markO || "o");
    if (sprite) sprite.draw(ctx, px, py, box);
    return;
  }
  if (this.guessId === "x") {
    if (this.locked) {
      const print = sprites.get("p");
      if (print) {
        print.draw(ctx, px, py, box);
        return;
      }    
    }
    const xg = sprites.get( this.is("cave") ? "xl" : "x");
    xg.draw(ctx, px, py, box);
    // const g = sprites.get("x");
    // if (!g) return;
    // ctx.fillStyle = look.glyphColor || g.color || "#2a2118";
    // ctx.font = "bold " + Math.floor(box * (g.scale || 0.42)) + "px ui-sans-serif, sans-serif";
    // ctx.textAlign = "center";
    // ctx.textBaseline = "middle";
    // ctx.fillText(g.glyph || "X", px + box / 2, py + box / 2 + 1);
  }
};

Cell.prototype.draw = function (ctx, sprites, x, y, s, revealWolf) {
  const look = this.look || CELL_TYPES[this.type] || CELL_TYPES.grass;
  const rad = Math.max(4, Math.floor(s * 0.17));
  const corners = [
    this.round[0] ? rad : 0,
    this.round[1] ? rad : 0,
    this.round[2] ? rad : 0,
    this.round[3] ? rad : 0,
  ];
  ctx.fillStyle = this.fill || look.fill || "#6b8f4e";
  this.fillRound(ctx, x, y, s, s, corners);
  if (look.edge) {
    const checkW = Math.max(2, Math.floor(s * 0.07));
    ctx.strokeStyle = look.edge;
    ctx.lineWidth = Math.max(1, Math.floor(checkW * (look.edgeFrac || 0.60)));
    this.strokeRound(ctx, x + 1, y + 1, s - 2, s - 2, corners);
  }
  this.drawMark(ctx, sprites, x, y, s, revealWolf);
  if (this.warn) {
    ctx.strokeStyle = "#f5c518";
    ctx.lineWidth = Math.max(2, Math.floor(s * 0.05));
    this.strokeRound(ctx, x + 1, y + 1, s - 2, s - 2, corners);
  } else if (this.wrong) {
    ctx.strokeStyle = "#e23b3b";
    ctx.lineWidth = Math.max(2, Math.floor(s * 0.05));
    this.strokeRound(ctx, x + 1, y + 1, s - 2, s - 2, corners);
  } else if (this.locked && this.guessId === "o") {
    ctx.strokeStyle = "#7dffa3";
    ctx.lineWidth = Math.max(2, Math.floor(s * 0.05));
    this.strokeRound(ctx, x + 1, y + 1, s - 2, s - 2, corners);
  }
};

Cell.dellFill = function (dellId) {
  return CELL_DELL_COLORS[((dellId % CELL_DELL_COLORS.length) + CELL_DELL_COLORS.length) % CELL_DELL_COLORS.length];
};

Cell.samePatch = function (grid, cell, row, col) {
  if (row < 0 || col < 0 || row >= grid.n || col >= grid.n) return false;
  const other = grid.at(row, col);
  if (cell.type !== "grass") return other.type === cell.type;
  return other.type === "grass" && other.dellId === cell.dellId;
};

Cell.dressGrid = function (grid) {
  if (!grid) return;
  for (let r = 0; r < grid.n; r++) {
    for (let c = 0; c < grid.n; c++) {
      const cell = grid.at(r, c);
      const kind = cell.type || "grass";
      cell.look = CELL_TYPES[kind] || CELL_TYPES.grass;
      cell.fill = kind === "grass" ? Cell.dellFill(cell.dellId) : cell.look.fill;
      const up = Cell.samePatch(grid, cell, r - 1, c);
      const down = Cell.samePatch(grid, cell, r + 1, c);
      const left = Cell.samePatch(grid, cell, r, c - 1);
      const right = Cell.samePatch(grid, cell, r, c + 1);
      cell.round = [!(up || left), !(up || right), !(down || right), !(down || left)];
    }
  }
};
