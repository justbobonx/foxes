/** Persistent run state. Game owns the instance. */

function Forest(data) {
  const fresh = Forest.blank();
  if (!data || typeof data !== "object") {
    Object.assign(this, fresh);
    return;
  }
  this.stars = data.stars | 0;
  this.maxN = Save.clampSize(data.maxN || Save.SIZE_MIN);
  this.curUnlockInd = data.curUnlockInd | 0;
  if (this.curUnlockInd < 0) this.curUnlockInd = 0;
  if (this.curUnlockInd > Planner.CHART.length) this.curUnlockInd = Planner.CHART.length;
  this.lastClaimStars = data.lastClaimStars | 0;

  const state = Forest.blankState();
  const src = data.featureState;
  if (src && typeof src === "object") {
    for (const type in state) {
      const v = src[type];
      if (v === "unlocked" || v === "seen" || v === "locked") state[type] = v;
    }
    if (state.water === "locked" && (src.pond === "seen" || src.pond === "unlocked")) {
      state.water = src.pond;
    }
  }
  this.featureState = state;
  this.location = Plan.copy(data.location || fresh.location);
  this.lastPlan = Plan.copy(data.lastPlan || this.location);
  this.offers = Array.isArray(data.offers) ? data.offers : null;
  this.shownStories = Forest.copyShown(data.shownStories);
}

Forest.blankState = function () {
  const out = {};
  for (const type in Planner.CATALOG) out[type] = "locked";
  return out;
};

Forest.copyShown = function (src) {
  const out = {};
  if (!src || typeof src !== "object") return out;
  for (const k in src) {
    if (src[k]) out[k] = true;
  }
  return out;
};

Forest.blank = function () {
  const loc = Plan.blank();
  return {
    stars: 0,
    maxN: Save.SIZE_MIN,
    curUnlockInd: 0,
    lastClaimStars: 0,
    featureState: Forest.blankState(),
    location: loc,
    lastPlan: Plan.copy(loc),
    offers: null,
    shownStories: {},
  };
};

Forest.prototype.dump = function () {
  return {
    stars: this.stars | 0,
    maxN: this.maxN,
    curUnlockInd: this.curUnlockInd,
    lastClaimStars: this.lastClaimStars,
    featureState: this.featureState,
    location: Plan.copy(this.location),
    lastPlan: Plan.copy(this.lastPlan),
    offers: this.offers,
    shownStories: Forest.copyShown(this.shownStories),
  };
};

Forest.prototype.stateOf = function (type) {
  if (type === "pond") {
    const pond = this.featureState.pond || "locked";
    const water = this.featureState.water || "locked";
    if (pond === "seen" || water === "seen") return "seen";
    if (pond === "unlocked" || water === "unlocked") return "unlocked";
    return "locked";
  }
  return this.featureState[type] || "locked";
};

Forest.prototype.sawStory = function (id) {
  return !!(id && this.shownStories[id]);
};

Forest.prototype.markStory = function (id) {
  if (id) this.shownStories[id] = true;
};

Forest.prototype.planStory = function (plan) {
  const item = this.nextItem();
  if (!item || !item.story) return "";
  if (!plan) return "";
  const parsed = Planner.parseUnlock(item.unlock);
  if (parsed && parsed.kind === "feature") {
    const list = plan.features || [];
    let unknown = false;
    for (let i = 0; i < list.length; i++) {
      if (!list[i] || !list[i].type) continue;
      if (this.stateOf(list[i].type) !== "seen") {
        unknown = true;
        break;
      }
    }
    if (!unknown) return "";
  }
  if (!this.matchesNext(plan)) return "";
  if (this.sawStory(item.story)) return "";
  return item.story;
};

Forest.prototype.nextItem = function () {
  if (this.curUnlockInd >= Planner.CHART.length) return null;
  return Planner.CHART[this.curUnlockInd];
};

Forest.prototype.needStars = function () {
  const item = this.nextItem();
  if (!item) return 0;
  return this.lastClaimStars + item.plus;
};

Forest.prototype.canAfford = function () {
  return !!this.nextItem() && this.stars >= this.needStars();
};

Forest.prototype.markSeen = function (plan) {
  if (!plan || !plan.features) return;
  let waterHit = false;
  for (let i = 0; i < plan.features.length; i++) {
    const type = plan.features[i].type;
    if (type === "pond" || type === "river") waterHit = true;
    if (this.stateOf(type) === "unlocked") this.featureState[type] = "seen";
  }
  if (waterHit && this.stateOf("water") === "unlocked") this.featureState.water = "seen";
};

Forest.prototype.enter = function (plan) {
  const next = Plan.copy(plan);
  this.location = next;
  this.lastPlan = Plan.copy(next);
  this.markSeen(next);
  this.offers = null;
};

Forest.prototype.matchesNext = function (plan) {
  const item = this.nextItem();
  if (!item || !plan) return false;
  const parsed = Planner.parseUnlock(item.unlock);
  if (!parsed) return false;
  if (parsed.kind === "size") return plan.size >= parsed.n;
  if (parsed.type === "water") {
    return Plan.has(plan, "pond") || Plan.has(plan, "river");
  }
  return Plan.has(plan, parsed.type);
};

Forest.prototype.win = function (plan) {
  this.stars += 1;
  if (this.matchesNext(plan) && this.canAfford()) {
    const item = this.nextItem();
    const parsed = Planner.parseUnlock(item.unlock);
    this.lastClaimStars = this.stars;
    this.curUnlockInd += 1;
    if (parsed && parsed.kind === "size") {
      if (parsed.n > this.maxN) this.maxN = Save.clampSize(parsed.n);
    } else if (parsed && this.featureState[parsed.type] === "locked") {
      this.featureState[parsed.type] = "unlocked";
    }
  }
  this.markSeen(plan);
};

Forest.load = function () {
  return new Forest(Save.readForest());
};
