/** HUD, overlays, and DOM wiring. Game keeps board state. */

function Ui() {
  this.canvas = document.getElementById("board");
  this.ctx = this.canvas.getContext("2d");
  this.elOs = document.getElementById("os-count");
  this.elStars = document.getElementById("score-stars");
  this.elScore = document.getElementById("score-level");
  this.elHud = document.getElementById("hud");
  this.elHudBottom = document.getElementById("hud-bottom");
  this.elWinScore = document.getElementById("win-score");
  this.elWinTime = document.getElementById("win-time");
  this.elWinHints = document.getElementById("win-hints");
  this.btnMenu = document.getElementById("btn-menu");
  this.btnReset = document.getElementById("btn-reset");
  this.btnClear = document.getElementById("btn-clear");
  this.btnNewMinus = document.getElementById("btn-new-minus");
  this.btnNew = document.getElementById("btn-new");
  this.btnNewPlus = document.getElementById("btn-new-plus");
  this.btnCheck = document.getElementById("btn-check");
  this.btnStart = document.getElementById("btn-start");
  this.elStart = document.getElementById("start-screen");
  this.elMenu = document.getElementById("menu-screen");
  this.elWin = document.getElementById("win-screen");
  this.btnWinNew = document.getElementById("btn-win-new");
  this.elPlan = document.getElementById("plan-screen");
  this.elPlanCard = document.getElementById("plan-card");
  this.elPlanN = document.getElementById("plan-n");
  this.elPlanA = document.getElementById("plan-extra-a");
  this.elPlanB = document.getElementById("plan-extra-b");
}

Ui.EXTRA_ICON = {
  pond: "images/pond.png",
  wolf: "images/wolf.png",
  bunny: "images/bunny.png",
};

Ui.prototype.winOpen = function () {
  return !!(this.elWin && !this.elWin.hidden);
};

Ui.prototype.planOpen = function () {
  return !!(this.elPlan && !this.elPlan.hidden);
};

Ui.prototype.menuOpen = function () {
  return !!(this.elMenu && !this.elMenu.hidden);
};

Ui.prototype.hideWin = function () {
  if (this.elWin) this.elWin.hidden = true;
};

Ui.prototype.showWin = function () {
  if (this.elWin) this.elWin.hidden = false;
};

Ui.prototype.hideMenu = function () {
  if (this.elMenu) this.elMenu.hidden = true;
};

Ui.prototype.showMenu = function () {
  if (this.elMenu) this.elMenu.hidden = false;
};

Ui.prototype.hideStart = function () {
  if (this.elStart) this.elStart.hidden = true;
};

Ui.prototype.showStart = function () {
  if (this.elStart) this.elStart.hidden = false;
};

Ui.prototype.showPlan = function () {
  if (this.elPlan) this.elPlan.hidden = false;
};

Ui.prototype.hidePlan = function () {
  if (!this.elPlan || this.elPlan.hidden) return false;
  this.elPlan.hidden = true;
  return true;
};

Ui.prototype.barHeight = function (el, fallback) {
  if (!el) return fallback;
  const h = Math.ceil(el.getBoundingClientRect().height);
  return h > 0 ? h : fallback;
};

Ui.prototype.hudPad = function () {
  return {
    top: Math.max(52, this.barHeight(this.elHud, 52)),
    bot: Math.max(56, this.barHeight(this.elHudBottom, 56)),
  };
};

Ui.prototype.paintWin = function (scoreText, timeText, hintsText) {
  if (this.elWinScore) this.elWinScore.textContent = scoreText;
  if (this.elWinTime) this.elWinTime.textContent = timeText;
  if (this.elWinHints) this.elWinHints.textContent = hintsText;
};

Ui.prototype.paintCheckLabel = function (marked, size) {
  if (!this.btnCheck) return;
  this.btnCheck.textContent = marked >= size ? "CHECK" : "HINT";
};

Ui.prototype.paintScore = function (view) {
  if (this.elStars) this.elStars.textContent = "\u2605 " + view.cleared;
  if (this.elScore) {
    const pct = Math.round(view.hintCut * 100) + "%";
    if (view.hintCount > 0) {
      this.elScore.innerHTML = pct + "  <span class=\"bad\">(H: " + view.hintCount + ")</span>";
    } else {
      this.elScore.textContent = pct;
    }
  }
  if (this.elOs) this.elOs.textContent = view.marked + "/" + view.size;
  this.paintCheckLabel(view.marked, view.size);
};

Ui.prototype.planExtras = function (plan) {
  if (!plan) return [];
  if (plan.extras && plan.extras.length) {
    return plan.extras.map(function (extra) {
      return extra && extra.type ? extra.type : extra;
    });
  }
  const list = [];
  const ponds = plan.ponds | 0;
  for (let i = 0; i < ponds; i++) list.push("pond");
  if (plan.wolf) list.push("wolf");
  if (plan.bunny) list.push("bunny");
  return list;
};

Ui.prototype.extraSplit = function (count) {
  if (count <= 2) return [count, 0];
  if (count === 3) return [2, 1];
  if (count === 4) return [2, 2];
  if (count === 5) return [3, 2];
  return [Math.ceil(count / 2), Math.floor(count / 2)];
};

Ui.prototype.paintExtraRow = function (el, types) {
  if (!el) return;
  el.innerHTML = "";
  for (let i = 0; i < types.length; i++) {
    const src = Ui.EXTRA_ICON[types[i]];
    if (!src) continue;
    const img = document.createElement("img");
    img.src = src;
    img.width = 26;
    img.height = 26;
    img.alt = "";
    el.appendChild(img);
  }
};

Ui.prototype.paintPlan = function (plan, fallbackN) {
  const extras = this.planExtras(plan);
  const split = this.extraSplit(extras.length);
  if (this.elPlanN) this.elPlanN.textContent = String(plan && plan.n ? plan.n : fallbackN);
  this.paintExtraRow(this.elPlanA, extras.slice(0, split[0]));
  this.paintExtraRow(this.elPlanB, extras.slice(split[0]));
};

Ui.prototype.bind = function (handlers) {
  const on = function (el, ev, fn) {
    if (el && fn) el.addEventListener(ev, fn);
  };
  on(this.btnStart, "click", handlers.start);
  on(this.elPlan, "click", handlers.planDismiss);
  on(this.btnMenu, "click", handlers.menu);
  on(this.btnReset, "click", handlers.reset);
  on(this.btnClear, "click", handlers.clear);
  on(this.btnNewMinus, "click", handlers.newMinus);
  on(this.btnNew, "click", handlers.newBoard);
  on(this.btnNewPlus, "click", handlers.newPlus);
  on(this.btnWinNew, "click", handlers.winNew);
  on(this.btnCheck, "click", handlers.check);
  on(this.elMenu, "click", handlers.menuBackdrop);
};
