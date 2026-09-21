/** Persistent run state. Planner only reads this. Game owns the instance. */

const FEATURE_CATALOG = {
  water: { minN: 7, p: 0.7 },
  pond: { minN: 7, p: 0, icon: "images/pond.png", defaults: { size: 1 } },
  river: { minN: 8, p: 0, icon: "images/stream.png" },
  wolf: { minN: 8, p: 0.3, icon: "images/wolf.png" },
  bunny: { minN: 8, p: 0.3, icon: "images/bunny.png" },
};

const UNLOCK_CHART = [
  { unlock: "size-7", plus: 3, story: "" },
  { unlock: "water", plus: 3, story: "first_pond" },
  { unlock: "size-8", plus: 3, story: "" },
  { unlock: "river", plus: 3, story: "first_river" },
  { unlock: "wolf", plus: 5, story: "first_wolf" },
  { unlock: "size-9", plus: 3, story: "" },
  { unlock: "bunny", plus: 3, story: "first_bunny" },
  { unlock: "size-10", plus: 5, story: "" },
];

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
  if (this.curUnlockInd > UNLOCK_CHART.length) this.curUnlockInd = UNLOCK_CHART.length;
  this.lastClaimStars = data.lastClaimStars | 0;
  this.featureState = Forest.normalizeState(data.featureState);
  this.location = Forest.copyPlan(data.location || fresh.location);
  this.lastPlan = Forest.copyPlan(data.lastPlan || this.location);
  this.offers = Array.isArray(data.offers) ? data.offers : null;
  this.shownStories = Forest.copyShown(data.shownStories);
}

Forest.CATALOG = FEATURE_CATALOG;
Forest.CHART = UNLOCK_CHART;

Forest.blankPlan = function () {
  return { size: Save.SIZE_MIN, features: [] };
};

Forest.blankState = function () {
  const out = {};
  for (const type in FEATURE_CATALOG) out[type] = "locked";
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

Forest.normalizeState = function (src) {
  const out = Forest.blankState();
  if (!src || typeof src !== "object") return out;
  for (const type in out) {
    const v = src[type];
    if (v === "unlocked" || v === "seen" || v === "locked") out[type] = v;
  }
  if (out.water === "locked" && (src.pond === "seen" || src.pond === "unlocked")) {
    out.water = src.pond;
  }
  return out;
};

Forest.copyFeature = function (f) {
  const out = { type: f.type };
  for (const k in f) {
    if (k === "type") continue;
    out[k] = f[k];
  }
  if (out.amount && !out.size) out.size = out.amount;
  return out;
};

Forest.copyPlan = function (plan) {
  if (!plan) return Forest.blankPlan();
  const size = Save.clampSize(plan.size || plan.n || Save.SIZE_MIN);
  const src = Array.isArray(plan.features) ? plan.features : [];
  const features = [];
  for (let i = 0; i < src.length; i++) {
    if (src[i] && src[i].type) features.push(Forest.copyFeature(src[i]));
  }
  return { size: size, features: features };
};

Forest.featureKey = function (plan) {
  const list = plan && plan.features ? plan.features.slice() : [];
  list.sort(function (a, b) {
    if (a.type < b.type) return -1;
    if (a.type > b.type) return 1;
    return (a.size || a.amount || 0) - (b.size || b.amount || 0);
  });
  const parts = [];
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    let bit = f.type;
    const n = f.size || f.amount;
    if (n) bit += ":" + n;
    parts.push(bit);
  }
  return (plan ? plan.size : 0) + "|" + parts.join(",");
};

Forest.parseUnlock = function (name) {
  if (!name) return null;
  if (name.indexOf("size-") === 0) {
    return { kind: "size", n: parseInt(name.slice(5), 10) };
  }
  if (FEATURE_CATALOG[name]) return { kind: "feature", type: name };
  return null;
};

Forest.hasFeature = function (plan, type) {
  if (!plan || !plan.features) return false;
  for (let i = 0; i < plan.features.length; i++) {
    if (plan.features[i].type === type) return true;
  }
  return false;
};

Forest.hasWater = function (plan) {
  return Forest.hasFeature(plan, "pond") || Forest.hasFeature(plan, "river");
};

Forest.blank = function () {
  const loc = Forest.blankPlan();
  return {
    stars: 0,
    maxN: Save.SIZE_MIN,
    curUnlockInd: 0,
    lastClaimStars: 0,
    featureState: Forest.blankState(),
    location: loc,
    lastPlan: Forest.copyPlan(loc),
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
    location: Forest.copyPlan(this.location),
    lastPlan: Forest.copyPlan(this.lastPlan),
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

Forest.prototype.waterKnown = function () {
  const water = this.stateOf("water");
  return water === "unlocked" || water === "seen";
};

Forest.prototype.iconState = function (type) {
  const state = this.stateOf(type);
  if (state === "seen") return state;
  if ((type === "pond" || type === "river") && this.waterKnown()) {
    return this.stateOf("water") === "seen" ? "seen" : state;
  }
  return state;
};

Forest.prototype.planHasUnknown = function (plan) {
  const list = plan && plan.features ? plan.features : [];
  for (let i = 0; i < list.length; i++) {
    if (!list[i] || !list[i].type) continue;
    if (this.iconState(list[i].type) !== "seen") return true;
  }
  return false;
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
  if (!plan || !this.planHasUnknown(plan)) return "";
  if (!this.matchesNext(plan)) return "";
  if (this.sawStory(item.story)) return "";
  return item.story;
};

Forest.prototype.nextItem = function () {
  if (this.curUnlockInd >= UNLOCK_CHART.length) return null;
  return UNLOCK_CHART[this.curUnlockInd];
};

Forest.prototype.needStars = function () {
  const item = this.nextItem();
  if (!item) return 0;
  return this.lastClaimStars + item.plus;
};

Forest.prototype.costLeft = function () {
  const item = this.nextItem();
  if (!item) return 0;
  const left = this.needStars() - this.stars;
  return left > 0 ? left : 0;
};

Forest.prototype.canAfford = function () {
  return !!this.nextItem() && this.stars >= this.needStars();
};

Forest.prototype.canPut = function (type, n) {
  const spec = FEATURE_CATALOG[type];
  if (!spec) return false;
  if (n < spec.minN) return false;
  if (type === "pond") return this.waterKnown();
  if (type === "river") {
    if (this.stateOf("river") !== "locked") return true;
    return this.waterKnown();
  }
  return this.stateOf(type) !== "locked";
};

Forest.prototype.allowsFeature = function (type, n) {
  if (!type) return false;
  n = n | 0;
  if (this.canPut(type, n)) return true;
  const item = this.nextItem();
  const parsed = item ? Forest.parseUnlock(item.unlock) : null;
  if (!parsed || parsed.kind !== "feature") return false;
  if (parsed.type === type) {
    return n >= specMin(type);
  }
  if (parsed.type === "water" && (type === "pond" || type === "river")) {
    return n >= specMin(type);
  }
  return false;
};

function specMin(type) {
  const spec = FEATURE_CATALOG[type];
  return spec ? spec.minN : Save.SIZE_MIN;
}

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
  const next = Forest.copyPlan(plan);
  this.location = next;
  this.lastPlan = Forest.copyPlan(next);
  this.markSeen(next);
  this.offers = null;
};

Forest.prototype.matchesNext = function (plan) {
  const item = this.nextItem();
  if (!item || !plan) return false;
  const parsed = Forest.parseUnlock(item.unlock);
  if (!parsed) return false;
  if (parsed.kind === "size") return plan.size >= parsed.n;
  if (parsed.type === "water") return Forest.hasWater(plan);
  return Forest.hasFeature(plan, parsed.type);
};

Forest.prototype.claim = function (item) {
  const parsed = Forest.parseUnlock(item.unlock);
  this.lastClaimStars = this.stars;
  this.curUnlockInd += 1;
  if (!parsed) return;
  if (parsed.kind === "size") {
    if (parsed.n > this.maxN) this.maxN = Save.clampSize(parsed.n);
    return;
  }
  if (this.featureState[parsed.type] === "locked") this.featureState[parsed.type] = "unlocked";
};

Forest.prototype.win = function (plan) {
  this.stars += 1;
  if (this.matchesNext(plan) && this.canAfford()) this.claim(this.nextItem());
  this.markSeen(plan);
};

Forest.load = function () {
  return new Forest(Save.readForest());
};
