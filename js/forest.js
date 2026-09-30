/** Persistent run state. Game owns the instance. */

function Forest(data) {
  const fresh = Forest.blank();
  if (!data || typeof data !== "object") {
    Object.assign(this, fresh);
    return;
  }
  this.stars = data.stars | 0;
  this.maxN = Planner.clampSize(data.maxN || SIZE_MIN);
  this.curUnlockInd = data.curUnlockInd | 0;
  if (this.curUnlockInd < 0) this.curUnlockInd = 0;
  if (this.curUnlockInd > UNLOCK_CHART.length) this.curUnlockInd = UNLOCK_CHART.length;
  this.lastClaimStars = data.lastClaimStars | 0;

  const state = Forest.blankState();
  const src = data.featureState;
  if (src && typeof src === "object") {
    for (const type in state) {
      const v = src[type];
      if (v === "unlocked" || v === "seen" || v === "locked") state[type] = v;
    }
  }
  for (let i = 0; i < this.curUnlockInd && i < UNLOCK_CHART.length; i++) {
    const parsed = Planner.parseUnlock(UNLOCK_CHART[i].unlock);
    if (!parsed || parsed.kind !== "feature") continue;
    if (state[parsed.type] === "locked") state[parsed.type] = "unlocked";
  }
  this.featureState = state;
  this.featureScore = Forest.copyScores(data.featureScore);
  this.sizeAvg = data.sizeAvg != null ? +data.sizeAvg : (data.location && data.location.size) || SIZE_MIN;
  this.sizeCount = data.sizeCount | 0;
  if (this.sizeCount < 1) this.sizeCount = 1;
  if (!(this.sizeAvg >= SIZE_MIN)) this.sizeAvg = SIZE_MIN;
  this.location = Plan.copy(data.location || fresh.location);
  this.lastPlan = Plan.copy(data.lastPlan || this.location);
  this.offers = Forest.copyOffers(data.offers);
  this.shownStories = Forest.copyShown(data.shownStories);
}

Forest.blankState = function () {
  const out = {};
  for (const type in FEATURE_CATALOG) out[type] = "locked";
  return out;
};

Forest.blankScores = function () {
  const out = {};
  for (const type in FEATURE_CATALOG) out[type] = 0;
  return out;
};

Forest.copyScores = function (src) {
  const out = Forest.blankScores();
  if (!src || typeof src !== "object") return out;
  for (const type in out) {
    let v = +src[type];
    if (!v) v = 0;
    if (v > SCORE_CAP) v = SCORE_CAP;
    if (v < -SCORE_CAP) v = -SCORE_CAP;
    out[type] = v;
  }
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

Forest.copyOffers = function (src) {
  if (!Array.isArray(src) || !src.length) return null;
  const out = [];
  for (let i = 0; i < src.length; i++) {
    const card = src[i];
    if (!card || !card.plan) continue;
    out.push({
      kind: card.kind,
      title: card.title,
      plan: Plan.copy(card.plan),
      locked: !!card.locked,
      costTarget: card.costTarget | 0,
    });
  }
  return out.length ? out : null;
};

Forest.blank = function () {
  const loc = Plan.blank();
  return {
    stars: 0,
    maxN: Save.SIZE_MIN || SIZE_MIN,
    curUnlockInd: 0,
    lastClaimStars: 0,
    featureState: Forest.blankState(),
    featureScore: Forest.blankScores(),
    sizeAvg: SIZE_MIN,
    sizeCount: 1,
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
    featureScore: Forest.copyScores(this.featureScore),
    sizeAvg: this.sizeAvg,
    sizeCount: this.sizeCount | 0,
    location: Plan.copy(this.location),
    lastPlan: Plan.copy(this.lastPlan),
    offers: this.offers,
    shownStories: Forest.copyShown(this.shownStories),
  };
};

Forest.prototype.stateOf = function (type) {
  return this.featureState[type] || "locked";
};

Forest.prototype.scoreOf = function (type) {
  if (!this.featureScore) return 0;
  return this.featureScore[type] || 0;
};

Forest.prototype.addScore = function (type, delta) {
  if (!FEATURE_CATALOG[type]) return;
  if (!this.featureScore) this.featureScore = Forest.blankScores();
  let v = (this.featureScore[type] || 0) + delta;
  if (v > SCORE_CAP) v = SCORE_CAP;
  if (v < -SCORE_CAP) v = -SCORE_CAP;
  this.featureScore[type] = v;
};

Forest.prototype.noteSize = function (n) {
  n = Planner.clampSize(n);
  this.sizeCount = (this.sizeCount | 0) + 1;
  if (this.sizeCount <= 1) {
    this.sizeAvg = n;
    this.sizeCount = 1;
    return;
  }
  this.sizeAvg += (n - this.sizeAvg) / this.sizeCount;
};

Forest.prototype.notePick = function (chosen) {
  const plan = chosen && chosen.plan;
  const picked = {};
  const feats = plan && plan.features ? plan.features : [];
  for (let i = 0; i < feats.length; i++) {
    const t = feats[i] && feats[i].type;
    if (!t || t === "water" || !FEATURE_CATALOG[t]) continue;
    picked[t] = true;
  }
  const rejected = {};
  const list = this.offers || [];
  for (let i = 0; i < list.length; i++) {
    const card = list[i];
    if (!card || card === chosen) continue;
    const other = card.plan && card.plan.features ? card.plan.features : [];
    for (let j = 0; j < other.length; j++) {
      const t = other[j] && other[j].type;
      if (!t || picked[t] || !FEATURE_CATALOG[t]) continue;
      rejected[t] = true;
    }
  }
  for (const t in picked) this.addScore(t, 1);
  for (const t in rejected) this.addScore(t, -0.5);
  if (plan) this.noteSize(plan.size);
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
  if (this.curUnlockInd >= UNLOCK_CHART.length) return null;
  return UNLOCK_CHART[this.curUnlockInd];
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
  for (let i = 0; i < plan.features.length; i++) {
    const type = plan.features[i].type;
    if (this.stateOf(type) === "unlocked") this.featureState[type] = "seen";
  }
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
      if (parsed.n > this.maxN) this.maxN = Planner.clampSize(parsed.n);
    } else if (parsed && this.featureState[parsed.type] === "locked") {
      this.featureState[parsed.type] = "unlocked";
    }
  }
  this.markSeen(plan);
};

Forest.load = function () {
  return new Forest(Save.readForest());
};
