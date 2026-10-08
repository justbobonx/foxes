/** One board square. type is the kind. spriteId is hidden fox. guessId is the mark. */

// const CELL_DELL_COLORS = [
  // "#6b8f4e",  //this one is the default grass
  // "#7a4e4e",  "#5a6b7e",  "#8a6b3f",  "#5c6a5c",
  // "#a08a4a",  "#3f6b6b",  "#545c64",  "#6b5a3f",
  // "#8b6196",  "#946f7b",  "#4e7a6b",  "#917d75",
  // "#6b6b5a",  "#5a7a5a" ]

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

Cell.prototype.draw = function (ctx, sprites, x, y, s, revealWolf) {
  const look = this.look || CELL_TYPES[this.type] || CELL_TYPES.grass;
  const rad = Math.max(5, Math.floor(s * 0.19));
  const max = s / 2;
  const corners = [
    Math.min(this.round[0] ? rad : 0, max),
    Math.min(this.round[1] ? rad : 0, max),
    Math.min(this.round[2] ? rad : 0, max),
    Math.min(this.round[3] ? rad : 0, max),
  ];

  function paint(fill) {
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, s, s, corners);
      if (fill) ctx.fill();
      else ctx.stroke();
      return;
    }
    if (fill) ctx.fillRect(x, y, s, s);
    else ctx.strokeRect(x, y, s, s);
  }

  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = Math.max(1, Math.floor(s * 0.05));
  paint(false);
  
  ctx.fillStyle = this.fill || look.fill || "#6b8f4e";
  paint(true);
  
  if (look.edge) {
    ctx.strokeStyle = look.edge;
    const checkW = Math.max(2, Math.floor(s * CHECK_LINE_W));    
    ctx.lineWidth = Math.max(1, Math.floor(checkW * 0.80));
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x + 1, y + 1, s - 2, s - 2, corners);
      ctx.stroke();
    } else {
      ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
    }
  }

  const pad = Math.max(0, Math.floor(s * 0.06));
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

  if (this.warn) {
    ctx.strokeStyle = "#f5c518";
    ctx.lineWidth = Math.max(2, Math.floor(s * CHECK_LINE_W));
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x + 1, y + 1, s - 2, s - 2, corners);
      ctx.stroke();
    } else {
      ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
    }
  } else if (this.wrong) {
    ctx.strokeStyle = "#e23b3b";
    ctx.lineWidth = Math.max(2, Math.floor(s * CHECK_LINE_W));
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x + 1, y + 1, s - 2, s - 2, corners);
      ctx.stroke();
    } else {
      ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
    }
  } else if (this.locked && this.guessId === "o") {
    ctx.strokeStyle = "#7dffa3";
    ctx.lineWidth = Math.max(2, Math.floor(s * CHECK_LINE_W));
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x + 1, y + 1, s - 2, s - 2, corners);
      ctx.stroke();
    } else {
      ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
    }
  }

  if (this.hintEdge) {
    ctx.strokeStyle = this.hintEdge === "print" ? "#3e7cff" : "#3ee0e0";
    ctx.lineWidth = Math.max(2, Math.floor(s * CHECK_LINE_W));
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x + 1, y + 1, s - 2, s - 2, corners);
      ctx.stroke();
    } else {
      ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
    }
  }
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
        const id = cell.dellId;
        cell.fill = id < 0 || id > CELL_DELL_COLORS.length - 1 ? "#000000" : CELL_DELL_COLORS[id];
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
