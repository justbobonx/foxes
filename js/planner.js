/** Content tables and card offers. Reads forest. Does not build a field. */

const SIZE_MIN = 6;
const SIZE_MAX = 14;
const SCORE_CAP = 20;
const WIDTH_MAX = 11;
const WATER_CAP = 6;

const FEATURE_CATALOG = {
  pond: { minN: 7, p: 0.7, icon: "images/pond.png", defaults: { size: 1 } },
  river: { minN: 8, p: 0.7, icon: "images/stream.png" },
  wolf: { minN: 8, p: 0.3, icon: "images/wolf.png" },
  bunny: { minN: 8, p: 0.3, icon: "images/bunny.png" },
  hawk: { minN: 8, p: 0.3, icon: "images/hawk.png" },
  trees: { minN: 8, p: 0.6, icon: "images/trees.png", defaults: { size: 1 } },
};

// Columns are n - trees. Past 11 the board does not generate, so trees are forced.
// Pack is still owed when trees sit on that floor. A tree above the floor, an extra,
// or two water-units each cancel one point. Water-unit = pond size or river size.
const TREE_FLOOR = { 12: 1, 13: 2, 14: 3 };
const PACK_AT_FLOOR = { 9: 2, 10: 3, 11: 4, 12: 4, 13: 4, 14: 4 };

const UNLOCK_CHART = [
  { unlock: "size-7", plus: 3, story: "first_7" },
  { unlock: "pond", plus: 3, story: "first_pond" },
  { unlock: "size-8", plus: 3, story: "" },
  { unlock: "river", plus: 3, story: "first_river" },
  { unlock: "bunny", plus: 3, story: "first_bunny" },
  { unlock: "size-9", plus: 3, story: "" },
  { unlock: "wolf", plus: 3, story: "first_wolf" },
  { unlock: "size-10", plus: 3, story: "" },
  { unlock: "hawk", plus: 3, story: "first_hawk" },
  { unlock: "trees", plus: 3, story: "first_trees" },
  { unlock: "size-11", plus: 3, story: "" },
  { unlock: "size-12", plus: 3, story: "" },
  { unlock: "size-13", plus: 3, story: "" },
  { unlock: "size-14", plus: 3, story: "" },
];

const CARD_TITLES = {
  chill: ["lighter", "quieter"],
  stay: ["hang around"],
  deeper: ["deeper...", "further..."],
};

function Planner() {}

Planner.clampSize = function (n) {
  n = n | 0;
  if (n < SIZE_MIN) return SIZE_MIN;
  if (n > SIZE_MAX) return SIZE_MAX;
  return n;
};

Planner.parseUnlock = function (name) {
  if (!name) return null;
  if (name.indexOf("size-") === 0) {
    return { kind: "size", n: parseInt(name.slice(5), 10) };
  }
  if (FEATURE_CATALOG[name]) return { kind: "feature", type: name };
  return null;
};

Planner.canPut = function (forest, type, n) {
  const spec = FEATURE_CATALOG[type];
  if (!spec) return false;
  if (n < spec.minN) return false;
  return forest.stateOf(type) !== "locked";
};

Planner.featureP = function (forest, type) {
  const spec = FEATURE_CATALOG[type];
  if (!spec || spec.p == null) return 0;
  return spec.p + forest.scoreOf(type) / 100;
};

Planner.featureItem = function (type, size) {
  const spec = FEATURE_CATALOG[type];
  const item = { type: type };
  if (spec && spec.defaults) {
    for (const k in spec.defaults) item[k] = spec.defaults[k];
  }
  if (size) item.size = size;
  return item;
};

Planner.waterParts = function (forest, n, trees, minAmount) {
  let amount = n - FEATURE_CATALOG.pond.minN + 1 - (trees | 0);
  if ((minAmount | 0) > amount) amount = minAmount | 0;
  if (amount > WATER_CAP) amount = WATER_CAP;
  if (amount < 1) return [];
  const parts = [];
  function addPonds(left) {
    while (left > 0) {
      const take = 1 + Math.floor(Math.random() * Math.min(left, 4));
      parts.push(Planner.featureItem("pond", take));
      left -= take;
    }
  }
  const riverOk = Planner.canPut(forest, "river", n) && amount >= 2;
  const pondP = Planner.featureP(forest, "pond");
  const riverP = Planner.featureP(forest, "river");
  const riverW = pondP + riverP > 0 ? riverP / (pondP + riverP) : 0.5;
  if (riverOk && Math.random() < riverW) {
    if (Math.random() < riverW) {
      parts.push(Planner.featureItem("river", 2));
      addPonds(amount - 2);
    } else {
      addPonds(amount - 1);
      parts.push(Planner.featureItem("river", 1));
    }
  } else {
    addPonds(amount);
  }
  return parts;
};

Planner.rollFeatures = function (forest, n) {
  const out = [];
  const floor = TREE_FLOOR[n] || 0;
  let trees = 0;
  const treesOk = Planner.canPut(forest, "trees", n);
  if (treesOk && Math.random() < Planner.featureP(forest, "trees")) {
    const max = Math.max(0, n + 1 - FEATURE_CATALOG.trees.minN);
    if (max > 0) trees = Math.ceil(max * (0.45 + 0.55 * Math.random()));
  }
  if (treesOk && trees < floor) trees = floor;
  if (trees > 0) out.push(Planner.featureItem("trees", trees));
  for (const type in FEATURE_CATALOG) {
    if (type === "pond" || type === "river" || type === "trees") continue;
    if (type === "hawk" && trees) continue;
    if (!Planner.canPut(forest, type, n)) continue;
    if (Math.random() < Planner.featureP(forest, type)) out.push(Planner.featureItem(type));
  }
  let extraN = 0;
  for (let i = 0; i < out.length; i++) {
    const t = out[i].type;
    if (t === "wolf" || t === "bunny" || t === "hawk") extraN++;
  }
  const gap = (PACK_AT_FLOOR[n] || 0) - (extraN + Math.max(0, trees - floor));
  const minWater = gap > 0 ? gap * 2 : 0;
  if (Planner.canPut(forest, "pond", n)) {
    let pWater = Planner.featureP(forest, "pond");
    if (Planner.canPut(forest, "river", n)) {
      pWater = (pWater + Planner.featureP(forest, "river")) / 2;
    }
    if (minWater > 0 || Math.random() < pWater) {
      const parts = Planner.waterParts(forest, n, trees, minWater);
      for (let i = 0; i < parts.length; i++) out.push(parts[i]);
    }
  }
  return Planner.cover(forest, n, out);
};

// Raises trees, water, and extras up to the floors. Does not remove a roll.
Planner.cover = function (forest, n, features) {
  const out = features ? features.slice() : [];
  const floor = TREE_FLOOR[n] || 0;
  const need = PACK_AT_FLOOR[n] || 0;

  if (floor > 0 && Planner.canPut(forest, "trees", n)) {
    let idx = -1;
    for (let i = 0; i < out.length; i++) {
      if (out[i].type === "trees") {
        idx = i;
        break;
      }
    }
    if (idx < 0) out.push(Planner.featureItem("trees", floor));
    else if ((out[idx].size | 0) < floor) out[idx].size = floor;
  }

  let trees = 0;
  for (let i = 0; i < out.length; i++) {
    if (out[i].type === "trees") trees = out[i].size | 0 || 1;
  }
  if (trees) {
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i].type === "hawk") out.splice(i, 1);
    }
  }

  function waterUnits() {
    let u = 0;
    for (let i = 0; i < out.length; i++) {
      const f = out[i];
      if (f.type === "pond" || f.type === "river") u += f.size | 0 || 1;
    }
    return u;
  }
  function extraN() {
    let e = 0;
    for (let i = 0; i < out.length; i++) {
      const t = out[i].type;
      if (t === "wolf" || t === "bunny" || t === "hawk") e++;
    }
    return e;
  }
  function points() {
    return extraN() + Math.floor(waterUnits() / 2) + Math.max(0, trees - floor);
  }

  let units = waterUnits();
  while (points() < need && units < WATER_CAP && Planner.canPut(forest, "pond", n)) {
    const room = WATER_CAP - units;
    const take = 1 + Math.floor(Math.random() * Math.min(room, 4));
    out.push(Planner.featureItem("pond", take));
    units += take;
  }
  if (points() < need && !Planner.canPut(forest, "pond", n) && Planner.canPut(forest, "river", n)) {
    let hasRiver = false;
    for (let i = 0; i < out.length; i++) {
      if (out[i].type === "river") hasRiver = true;
    }
    if (!hasRiver) out.push(Planner.featureItem("river", 2));
  }

  const kinds = shuffleInPlace(["wolf", "bunny", "hawk"]);
  while (points() < need) {
    if (extraN() >= 1 && need - points() < 2) break;
    let pick = "";
    for (let i = 0; i < kinds.length; i++) {
      const type = kinds[i];
      if (type === "hawk" && trees) continue;
      if (!Planner.canPut(forest, type, n)) continue;
      let has = false;
      for (let k = 0; k < out.length; k++) {
        if (out[k].type === type) has = true;
      }
      if (has) continue;
      pick = type;
      break;
    }
    if (!pick) break;
    out.push(Planner.featureItem(pick));
  }
  return out;
};

Planner.getCard = function (kind, plan, locked, costTarget) {
  const list = CARD_TITLES[kind] || [kind];
  return {
    kind: kind,
    title: list[Math.floor(Math.random() * list.length)],
    plan: Plan.copy(plan),
    locked: !!locked,
    costTarget: costTarget | 0,
  };
};

Planner.refreshLocked = function (cards, forest) {
  const target = forest.needStars();
  for (let i = 0; i < cards.length; i++) {
    if (!cards[i] || !cards[i].locked) continue;
    cards[i].costTarget = target;
  }
  return cards;
};

Planner.prototype.travel = function (forest, avoid) {
  if (!avoid && forest.offers && forest.offers.length) {
    return Planner.refreshLocked(forest.offers, forest);
  }

  const locN = Planner.clampSize(forest.location.size);
  const avg = forest.sizeAvg != null ? forest.sizeAvg : locN;
  const pool = [];
  const wobble = Math.sin((forest.sizeCount | 0) * 12.9898) * 0.35;
  if (locN >= avg + wobble) pool.push(locN - 2);
  pool.push(locN - 1, locN, locN + 1);
  if (locN <= avg + wobble) pool.push(locN + 2);
  for (let i = 0; i < pool.length; i++) {
    let s = pool[i];
    if (s < SIZE_MIN) s = SIZE_MIN;
    if (s > forest.maxN) s = forest.maxN;
    pool[i] = s;
  }
  shuffleInPlace(pool);
  const sizes = pool.length <= 3 ? pool : pool.slice(0, 3);
  sizes.sort(function (a, b) {
    return a - b;
  });
  const open = [];
  for (let i = 0; i < sizes.length; i++) {
    if (sizes[i] > WIDTH_MAX && !Planner.canPut(forest, "trees", sizes[i])) continue;
    open.push(sizes[i]);
  }
  const cardSizes = open.length ? open : sizes;

  const item = forest.nextItem();
  const parsed = item ? Planner.parseUnlock(item.unlock) : null;
  const lockedNext = !!(item && !forest.canAfford());
  const costTarget = item ? forest.needStars() : 0;
  const avoidKey = avoid ? Plan.key(avoid) : "";
  const kinds = ["chill", "stay", "deeper"];

  function forceFeature(features, type) {
    const out = features.slice();
    if (type === "river") {
      for (let i = 0; i < out.length; i++) {
        if (out[i].type === "river") return out;
      }
      let hasPond = false;
      for (let i = 0; i < out.length; i++) {
        if (out[i].type === "pond") hasPond = true;
      }
      out.push(Planner.featureItem("river", hasPond ? 1 : 2));
      return out;
    }
    for (let i = 0; i < out.length; i++) {
      if (out[i].type === type) return out;
    }
    if (type === "trees") {
      out.push(Planner.featureItem("trees", 1));
      for (let i = out.length - 1; i >= 0; i--) {
        if (out[i].type === "hawk") out.splice(i, 1);
      }
      return out;
    }
    if (type === "hawk") {
      for (let i = 0; i < out.length; i++) {
        if (out[i].type === "trees") return out;
      }
    }
    out.push(Planner.featureItem(type));
    return out;
  }

  function rollPlan(size, deeper) {
    let n = size;
    let features = Planner.rollFeatures(forest, n);
    let lock = false;
    let cost = 0;
    if (deeper && parsed) {
      if (parsed.kind === "feature") {
        const spec = FEATURE_CATALOG[parsed.type];
        const need = spec ? spec.minN : SIZE_MIN;
        if (n < need) n = Planner.clampSize(need);
        features = Planner.cover(forest, n, forceFeature(Planner.rollFeatures(forest, n), parsed.type));
        if (lockedNext && n >= need) {
          lock = true;
          cost = costTarget;
        }
      } else if (parsed.kind === "size") {
        const want = Planner.clampSize(parsed.n);
        if (want > forest.maxN) {
          n = want;
          features = Planner.rollFeatures(forest, n);
          if (lockedNext) {
            lock = true;
            cost = costTarget;
          }
        }
      }
    }
    return { plan: Plan.make(n, features), lock: lock, cost: cost };
  }

  const cards = [];
  for (let i = 0; i < cardSizes.length; i++) {
    const deeper = i === cardSizes.length - 1;
    let built = rollPlan(cardSizes[i], deeper);
    for (let t = 0; t < 8; t++) {
      const key = Plan.key(built.plan);
      let clash = !!(avoidKey && key === avoidKey);
      for (let k = 0; k < cards.length && !clash; k++) {
        if (Plan.key(cards[k].plan) === key) clash = true;
      }
      if (!clash) break;
      built = rollPlan(cardSizes[i], deeper);
    }
    cards.push(Planner.getCard(kinds[i] || "stay", built.plan, built.lock, built.cost));
  }

  forest.offers = Planner.refreshLocked(cards, forest);
  return forest.offers;
};
