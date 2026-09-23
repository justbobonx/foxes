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
  this.btnGiveUp = document.getElementById("btn-give-up");
  this.btnCheck = document.getElementById("btn-check");
  this.btnStart = document.getElementById("btn-start");
  this.btnHelp = document.getElementById("btn-help");
  this.elStart = document.getElementById("start-screen");
  this.elMenu = document.getElementById("menu-screen");
  this.elWin = document.getElementById("win-screen");
  this.btnWinNew = document.getElementById("btn-win-new");
  this.elPlan = document.getElementById("plan-screen");
  this.elPlanRow = document.getElementById("plan-row");
  this.btnPlanBack = document.getElementById("btn-plan-back");
  this.elStory = document.getElementById("story-screen");
  this.elStorySlot = document.getElementById("story-slot");
  this.elFind = document.getElementById("find-screen");
  this.elFindFoxes = document.getElementById("find-foxes");
  this.onPlanPick = null;
  this.onStoryContinue = null;
}

Ui.UNKNOWN_ICON = "images/unknown.png";

Ui.prototype.winOpen = function () {
  return !!(this.elWin && !this.elWin.hidden);
};

Ui.prototype.planOpen = function () {
  return !!(this.elPlan && !this.elPlan.hidden);
};

Ui.prototype.storyOpen = function () {
  return !!(this.elStory && !this.elStory.hidden);
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

Ui.prototype.showStory = function () {
  if (this.elStory) this.elStory.hidden = false;
};

Ui.prototype.hideStory = function () {
  if (!this.elStory || this.elStory.hidden) return false;
  this.elStory.hidden = true;
  return true;
};

Ui.prototype.findOpen = function () {
  return !!(this.elFind && !this.elFind.hidden);
};

Ui.prototype.showFind = function () {
  if (this.elFind) this.elFind.hidden = false;
};

Ui.prototype.hideFind = function () {
  if (this.elFind) this.elFind.hidden = true;
  if (this.elFindFoxes) this.elFindFoxes.innerHTML = "";
};

Ui.prototype.setFindFoxes = function (count) {
  if (!this.elFindFoxes) return;
  const want = count | 0;
  let have = this.elFindFoxes.childNodes.length;
  while (have < want) {
    const img = document.createElement("img");
    img.src = "images/fox.png";
    img.width = 40;
    img.height = 40;
    img.alt = "";
    this.elFindFoxes.appendChild(img);
    have++;
  }
};

Ui.prototype.hudPad = function () {
  function barHeight(el, fallback) {
    if (!el) return fallback;
    const h = Math.ceil(el.getBoundingClientRect().height);
    return h > 0 ? h : fallback;
  }
  return {
    top: Math.max(52, barHeight(this.elHud, 52)),
    bot: Math.max(56, barHeight(this.elHudBottom, 56)),
  };
};

Ui.prototype.paintWin = function (scoreText, timeText, hintsText) {
  if (this.elWinScore) this.elWinScore.textContent = scoreText;
  if (this.elWinTime) this.elWinTime.textContent = timeText;
  if (this.elWinHints) this.elWinHints.textContent = hintsText;
};

Ui.prototype.paintScore = function (view) {
  if (this.elStars) this.elStars.textContent = "\u2605 " + view.cleared;
  if (this.elScore) {
    const pct = Math.round(view.hintCut * 100) + "%";
    if (view.hintCount > 0) {
      this.elScore.innerHTML = pct + '  <span class="bad">(H: ' + view.hintCount + ")</span>";
    } else {
      this.elScore.textContent = pct;
    }
  }
  if (this.elOs) this.elOs.textContent = view.marked + "/" + view.size;
  if (this.btnCheck) this.btnCheck.textContent = view.marked >= view.size ? "CHECK" : "HINT";
};

Ui.prototype.paintExtraRow = function (el, features, forest) {
  el.innerHTML = "";
  for (let i = 0; i < features.length; i++) {
    const type = features[i].type;
    const state = forest.stateOf(type);
    const spec = Forest.CATALOG[type];
    const img = document.createElement("img");
    img.src = state === "seen" && spec && spec.icon ? spec.icon : Ui.UNKNOWN_ICON;
    img.width = 32;
    img.height = 32;
    img.alt = "";
    el.appendChild(img);
  }
  el.hidden = !el.childNodes.length;
};

Ui.prototype.makeCard = function (card, forest, index) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "plan-card" + (card.locked ? " locked" : "") + (card.plan.features.length ? "" : " no-extras");
  btn.setAttribute("data-index", String(index));

  const title = document.createElement("div");
  title.className = "plan-title";
  title.textContent = card.title || card.kind;
  btn.appendChild(title);

  const size = document.createElement("div");
  size.className = "plan-size";
  const img = document.createElement("img");
  img.src = "images/sizes.png";
  img.width = 32;
  img.height = 32;
  img.alt = "";
  const n = document.createElement("span");
  n.textContent = String(card.plan.size);
  size.appendChild(img);
  size.appendChild(n);
  btn.appendChild(size);

  const extras = document.createElement("div");
  extras.className = "plan-extras";
  const rowA = document.createElement("div");
  rowA.className = "plan-extra-row";
  const rowB = document.createElement("div");
  rowB.className = "plan-extra-row";
  const list = card.plan.features || [];
  const count = list.length;
  let split;
  if (count <= 2) split = [count, 0];
  else if (count === 3) split = [2, 1];
  else if (count === 4) split = [2, 2];
  else if (count === 5) split = [3, 2];
  else split = [Math.ceil(count / 2), Math.floor(count / 2)];
  this.paintExtraRow(rowA, list.slice(0, split[0]), forest);
  this.paintExtraRow(rowB, list.slice(split[0]), forest);
  extras.appendChild(rowA);
  extras.appendChild(rowB);
  btn.appendChild(extras);

  const foot = document.createElement("span");
  foot.className = "plan-select";
  if (card.locked) {
    const target = card.costTarget > 0 ? card.costTarget : forest.needStars();
    if (!target) {
      foot.textContent = "locked";
    } else {
      const star = document.createElement("span");
      star.className = "plan-cost-star";
      star.textContent = "\u2605";
      const cost = document.createElement("span");
      cost.className = "plan-cost-n";
      cost.textContent = String(target) + " [" + String(forest.stars) + "]";
      foot.appendChild(star);
      foot.appendChild(cost);
    }
  } else {
    foot.textContent = "SELECT";
  }
  btn.appendChild(foot);

  const self = this;
  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    if (card.locked || !self.onPlanPick) return;
    self.onPlanPick(card, index);
  });
  return btn;
};

Ui.prototype.paintPlans = function (cards, forest) {
  if (!this.elPlanRow) return;
  this.elPlanRow.innerHTML = "";
  for (let i = 0; i < cards.length; i++) {
    this.elPlanRow.appendChild(this.makeCard(cards[i], forest, i));
  }
};

Ui.prototype.paintStory = function (page) {
  if (!this.elStorySlot || !page) return;
  this.elStorySlot.innerHTML = "";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "story-card";

  if (page.image) {
    const img = document.createElement("img");
    img.className = "story-art";
    img.src = page.image;
    img.width = page.sizex || 64;
    img.height = page.sizey || 64;
    img.alt = "";
    btn.appendChild(img);
  }

  if (page.text) {
    const body = document.createElement("div");
    body.className = "story-text";
    body.textContent = page.text;
    btn.appendChild(body);
  }

  const foot = document.createElement("span");
  foot.className = "story-continue";
  foot.textContent = "TAP TO CONTINUE";
  btn.appendChild(foot);

  const self = this;
  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    if (self.onStoryContinue) self.onStoryContinue();
  });
  this.elStorySlot.appendChild(btn);
};

Ui.prototype.bind = function (handlers) {
  const on = function (el, ev, fn) {
    if (el && fn) el.addEventListener(ev, fn);
  };
  this.onPlanPick = handlers.planPick || null;
  this.onStoryContinue = handlers.storyContinue || null;
  on(this.btnStart, "click", handlers.start);
  on(this.btnHelp, "click", handlers.help);
  on(this.btnPlanBack, "click", function (e) {
    e.stopPropagation();
    if (handlers.planBack) handlers.planBack();
  });
  on(this.btnMenu, "click", handlers.menu);
  on(this.btnReset, "click", handlers.reset);
  on(this.btnClear, "click", handlers.clear);
  on(this.btnGiveUp, "click", handlers.giveUp);
  on(this.btnWinNew, "click", handlers.winNew);
  on(this.btnCheck, "click", handlers.check);
  on(this.elMenu, "click", handlers.menuBackdrop);
};
