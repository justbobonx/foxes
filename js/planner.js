/** Content tables and card offers. Reads forest. Does not build a field. */

const FEATURE_CATALOG = {
  pond: { minN: 7, p: 0.7, icon: "images/pond.png", defaults: { size: 1 } },
  river: { minN: 8, icon: "images/stream.png" },
  wolf: { minN: 8, p: 0.3, icon: "images/wolf.png" },
  bunny: { minN: 8, p: 0.3, icon: "images/bunny.png" },
  hawk: { minN: 9, p: 0.3, icon: "images/hawk.png" },
  trees: { minN: 8, p: 0.5, icon: "images/trees.png", defaults: { size: 1 } },
};

const UNLOCK_CHART = [
  { unlock: "size-7", plus: 3, story: "first_7" },
  { unlock: "pond", plus: 3, story: "first_pond" },
  { unlock: "size-8", plus: 3, story: "" },
  { unlock: "river", plus: 3, story: "first_river" },
  { unlock: "wolf", plus: 3, story: "first_wolf" },
  { unlock: "size-9", plus: 3, story: "" },
  { unlock: "bunny", plus: 3, story: "first_bunny" },
  { unlock: "size-10", plus: 3, story: "" },
  { unlock: "hawk", plus: 3, story: "first_hawk" },
  { unlock: "trees", plus: 3, story: "first_trees" },
];

const CARD_TITLES = {
  chill: ["lighter", "quieter"],
  stay: ["hang around"],
  deeper: ["deeper...", "further..."],
  retry: ["let's try again", "one more try"],
  variant: ["maybe something else"],
};

function Planner() {}

Planner.CATALOG = FEATURE_CATALOG;
Planner.CHART = UNLOCK_CHART;

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

Planner.featureItem = function (type, size) {
  const spec = FEATURE_CATALOG[type];
  const item = { type: type };
  if (spec && spec.defaults) {
    for (const k in spec.defaults) item[k] = spec.defaults[k];
  }
  if (size) item.size = size;
  return item;
};

Planner.pondParts = function (forest, n, trees) {
  const spec = FEATURE_CATALOG.pond;
  const min = spec && spec.minN ? spec.minN : 7;
  let amount = n - min + 1 - (trees | 0);
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
  if (riverOk && Math.random() < 0.5) {
    if (Math.random() < 0.5) {
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
  let trees = 0;
  if (Planner.canPut(forest, "trees", n) && Math.random() < FEATURE_CATALOG.trees.p) {
    const max = Math.max(0, n + 1 - FEATURE_CATALOG.trees.minN);
    if (max > 0) {
      trees = Math.ceil(max * (0.45 + 0.55 * Math.random()));
      out.push(Planner.featureItem("trees", trees));
    }
  }
  for (const type in FEATURE_CATALOG) {
    if (type === "pond" || type === "river" || type === "trees") continue;
    if (type === "hawk" && trees) continue;
    if (!Planner.canPut(forest, type, n)) continue;
    if (Math.random() < FEATURE_CATALOG[type].p) out.push(Planner.featureItem(type));
  }
  if (Planner.canPut(forest, "pond", n) && Math.random() < FEATURE_CATALOG.pond.p) {
    const parts = Planner.pondParts(forest, n, trees);
    for (let i = 0; i < parts.length; i++) out.push(parts[i]);
  }
  return out;
};

Planner.rollDiffer = function (forest, n, avoid) {
  const plan = Plan.make(n, Planner.rollFeatures(forest, n));
  if (avoid && Plan.key(plan) === Plan.key(avoid)) {
    const again = Plan.make(n, Planner.rollFeatures(forest, n));
    if (Plan.key(again) !== Plan.key(avoid)) return again;
  }
  return plan;
};

Planner.chillCard = function (forest) {
  const loc = forest.location;
  if (loc.size <= Save.SIZE_MIN) return null;
  const size = loc.size - 1;
  return Plan.make(size, Planner.rollFeatures(forest, size));
};

Planner.deeperCard = function (forest) {
  const loc = forest.location;
  const item = forest.nextItem();
  const parsed = item ? Planner.parseUnlock(item.unlock) : null;
  const lockedNext = !!(item && !forest.canAfford());
  const costTarget = item ? forest.needStars() : 0;

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

  if (parsed && parsed.kind === "feature") {
    const spec = FEATURE_CATALOG[parsed.type];
    const need = spec ? spec.minN : Save.SIZE_MIN;
    let size = loc.size < forest.maxN ? loc.size + 1 : loc.size;
    if (size < need) size = need;
    size = Save.clampSize(size);
    const features = forceFeature(Planner.rollFeatures(forest, size), parsed.type);
    const lock = !!(lockedNext && size >= need);
    return Planner.getCard("deeper", Plan.make(size, features), lock, lock ? costTarget : 0);
  }

  if (loc.size < forest.maxN) {
    const size = loc.size + 1;
    return Planner.getCard("deeper", Plan.make(size, Planner.rollFeatures(forest, size)), false, 0);
  }

  if (parsed && parsed.kind === "size") {
    const size = Save.clampSize(parsed.n);
    return Planner.getCard("deeper", Plan.make(size, Planner.rollFeatures(forest, size)), lockedNext, lockedNext ? costTarget : 0);
  }

  const size = loc.size < Save.SIZE_MAX ? loc.size + 1 : loc.size;
  return Planner.getCard("deeper", Plan.make(size, Planner.rollFeatures(forest, size)), false, 0);
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

Planner.dedupe = function (cards) {
  const seen = {};
  const out = [];
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (!card || !card.plan) continue;
    const sig = Plan.key(card.plan) + (card.locked ? "|L" : "|P");
    if (seen[sig]) continue;
    seen[sig] = true;
    out.push(card);
  }
  return out;
};

Planner.refreshLocked = function (cards, forest) {
  const target = forest.needStars();
  for (let i = 0; i < cards.length; i++) {
    if (!cards[i] || !cards[i].locked) continue;
    cards[i].costTarget = target;
  }
  return cards;
};

Planner.prototype.travel = function (forest) {
  if (forest.offers && forest.offers.length) {
    return Planner.refreshLocked(forest.offers, forest);
  }
  const cards = [];
  const chill = Planner.chillCard(forest);
  if (chill) cards.push(Planner.getCard("chill", chill, false, 0));
  cards.push(Planner.getCard("stay", Planner.rollDiffer(forest, forest.location.size, forest.location), false, 0));
  cards.push(Planner.deeperCard(forest));
  const offers = Planner.refreshLocked(Planner.dedupe(cards), forest);
  forest.offers = offers;
  return offers;
};

Planner.prototype.giveUp = function (forest) {
  const cards = [];
  const chill = Planner.chillCard(forest);
  if (chill) cards.push(Planner.getCard("chill", chill, false, 0));
  cards.push(Planner.getCard("retry", forest.lastPlan || forest.location, false, 0));
  cards.push(Planner.getCard("variant", Planner.rollDiffer(forest, forest.location.size, forest.lastPlan), false, 0));
  const offers = Planner.dedupe(cards);
  forest.offers = offers;
  return offers;
};
