/** Reads forest, returns 1–3 cards. Does not build a field. */

const CARD_TITLES = {
  chill: ["let's chill out"],
  stay: ["wander on the path"],
  deeper: ["deeper into the forest..."],
  retry: ["let's try again!", "one more try!"],
  variant: ["maybe something else"],
};

const WATER_MAX = 4;

function Planner() {}

Planner.pickTitle = function (kind) {
  const list = CARD_TITLES[kind] || [kind];
  return list[Math.floor(Math.random() * list.length)];
};

Planner.featureItem = function (type, size) {
  const spec = Forest.CATALOG[type];
  const item = { type: type };
  if (spec && spec.defaults) {
    for (const k in spec.defaults) item[k] = spec.defaults[k];
  }
  if (size) item.size = size;
  return item;
};

Planner.waterCap = function (n) {
  const min = typeof POND_MIN_LEVEL === "number" ? POND_MIN_LEVEL : 7;
  const cap = n - min + 1;
  if (cap < 1) return 0;
  return cap > WATER_MAX ? WATER_MAX : cap;
};

Planner.waterParts = function (forest, n) {
  const cap = Planner.waterCap(n);
  if (cap < 1) return [];
  let budget = 1 + Math.floor(Math.random() * cap);
  const allowRiver = forest.canPut("river", n);
  const parts = [];

  if (allowRiver && Math.random() < 0.5) {
    if (budget === 1 || Math.random() < 0.5) {
      parts.push(Planner.featureItem("river", 2));
      budget = budget > 2 ? budget - 2 : 0;
    } else {
      const pondSize = 1 + Math.floor(Math.random() * (budget - 1));
      parts.push(Planner.featureItem("pond", pondSize));
      parts.push(Planner.featureItem("river", 1));
      budget -= pondSize + 1;
    }
  }

  while (budget > 0) {
    const chunk = 1 + Math.floor(Math.random() * budget);
    parts.push(Planner.featureItem("pond", chunk));
    budget -= chunk;
  }
  return parts;
};

Planner.rollFeatures = function (forest, n) {
  const out = [];
  for (const type in Forest.CATALOG) {
    if (type === "water" || type === "pond" || type === "river") continue;
    if (!forest.canPut(type, n)) continue;
    if (Math.random() < Forest.CATALOG[type].p) out.push(Planner.featureItem(type));
  }
  const water = Forest.CATALOG.water;
  if (forest.canPut("water", n) && water && Math.random() < water.p) {
    const parts = Planner.waterParts(forest, n);
    for (let i = 0; i < parts.length; i++) out.push(parts[i]);
  }
  return out;
};

Planner.makePlan = function (size, features) {
  return { size: Save.clampSize(size), features: features || [] };
};

Planner.sameFeatures = function (a, b) {
  return Forest.featureKey(a) === Forest.featureKey(b);
};

Planner.forceFeature = function (features, type, forest, n) {
  const out = features.slice();
  if (type === "water") {
    for (let i = 0; i < out.length; i++) {
      if (out[i].type === "pond" || out[i].type === "river") return out;
    }
    const parts = forest && n ? Planner.waterParts(forest, n) : [];
    if (parts.length) {
      for (let i = 0; i < parts.length; i++) out.push(parts[i]);
      return out;
    }
    out.push(Planner.featureItem("pond", 1));
    return out;
  }
  for (let i = 0; i < out.length; i++) {
    if (out[i].type === type) return out;
  }
  if (type === "pond") {
    out.push(Planner.featureItem("pond", 1));
    return out;
  }
  if (type === "river") {
    let hasPond = false;
    for (let i = 0; i < out.length; i++) {
      if (out[i].type === "pond") hasPond = true;
    }
    out.push(Planner.featureItem("river", hasPond ? 1 : 2));
    return out;
  }
  out.push(Planner.featureItem(type));
  return out;
};

Planner.rollDiffer = function (forest, n, avoid) {
  let plan = Planner.makePlan(n, Planner.rollFeatures(forest, n));
  if (avoid && Planner.sameFeatures(plan, avoid)) {
    const again = Planner.makePlan(n, Planner.rollFeatures(forest, n));
    if (!Planner.sameFeatures(again, avoid)) return again;
  }
  return plan;
};

Planner.chillPlan = function (forest) {
  const loc = forest.location;
  if (loc.size <= Save.SIZE_MIN) return null;
  const size = loc.size - 1;
  return Planner.makePlan(size, Planner.rollFeatures(forest, size));
};

Planner.stayPlan = function (forest) {
  return Planner.rollDiffer(forest, forest.location.size, forest.location);
};

Planner.deeperCard = function (forest) {
  const loc = forest.location;
  const item = forest.nextItem();
  const parsed = item ? Forest.parseUnlock(item.unlock) : null;
  const lockedNext = !!(item && !forest.canAfford());
  const costTarget = item ? forest.needStars() : 0;

  if (parsed && parsed.kind === "feature") {
    const spec = Forest.CATALOG[parsed.type];
    const need = spec ? spec.minN : Save.SIZE_MIN;
    let size = loc.size < forest.maxN ? loc.size + 1 : loc.size;
    if (size < need) size = need;
    size = Save.clampSize(size);
    const features = Planner.forceFeature(Planner.rollFeatures(forest, size), parsed.type, forest, size);
    const lock = !!(lockedNext && size >= need);
    return Planner.card("deeper", Planner.makePlan(size, features), lock, lock ? costTarget : 0);
  }

  if (loc.size < forest.maxN) {
    const size = loc.size + 1;
    return Planner.card("deeper", Planner.makePlan(size, Planner.rollFeatures(forest, size)), false, 0);
  }

  if (parsed && parsed.kind === "size") {
    const size = Save.clampSize(parsed.n);
    return Planner.card("deeper", Planner.makePlan(size, Planner.rollFeatures(forest, size)), lockedNext, lockedNext ? costTarget : 0);
  }

  const size = loc.size < Save.SIZE_MAX ? loc.size + 1 : loc.size;
  return Planner.card("deeper", Planner.makePlan(size, Planner.rollFeatures(forest, size)), false, 0);
};

Planner.card = function (kind, plan, locked, costTarget) {
  return {
    kind: kind,
    title: Planner.pickTitle(kind),
    plan: Forest.copyPlan(plan),
    locked: !!locked,
    costTarget: costTarget | 0,
  };
};

Planner.cardSig = function (card) {
  return card.kind + ":" + (card.locked ? "L" : "P") + ":" + Forest.featureKey(card.plan);
};

Planner.dedupe = function (cards) {
  const seen = {};
  const out = [];
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (!card || !card.plan) continue;
    const sig = Forest.featureKey(card.plan) + (card.locked ? "|L" : "|P");
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
    cards[i].costLeft = 0;
  }
  return cards;
};

Planner.prototype.travel = function (forest) {
  if (forest.offers && forest.offers.length) {
    return Planner.refreshLocked(forest.offers, forest);
  }
  const cards = [];
  const chill = Planner.chillPlan(forest);
  if (chill) cards.push(Planner.card("chill", chill, false, 0));
  cards.push(Planner.card("stay", Planner.stayPlan(forest), false, 0));
  cards.push(Planner.deeperCard(forest));
  const offers = Planner.refreshLocked(Planner.dedupe(cards), forest);
  forest.offers = offers;
  return offers;
};

Planner.prototype.giveUp = function (forest) {
  const cards = [];
  const chill = Planner.chillPlan(forest);
  if (chill) cards.push(Planner.card("chill", chill, false, 0));
  cards.push(Planner.card("retry", forest.lastPlan || forest.location, false, 0));
  cards.push(Planner.card("variant", Planner.rollDiffer(forest, forest.location.size, forest.lastPlan), false, 0));
  const offers = Planner.dedupe(cards);
  forest.offers = offers;
  return offers;
};

Planner.toBuilder = function (plan) {
  const out = { n: plan.size, ponds: [], river: 0, wolf: false, bunny: false };
  const list = plan.features || [];
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    if (f.type === "pond") out.ponds.push(f.size | 0 || f.amount | 0 || 1);
    if (f.type === "river") out.river = f.size | 0 || 2;
    if (f.type === "wolf") out.wolf = true;
    if (f.type === "bunny") out.bunny = true;
  }
  return out;
};

Planner.fromBuilder = function (plan) {
  if (!plan) return Forest.blankPlan();
  if (plan.size && Array.isArray(plan.features)) return Forest.copyPlan(plan);
  const features = [];
  if (Array.isArray(plan.ponds)) {
    for (let i = 0; i < plan.ponds.length; i++) {
      const sz = plan.ponds[i] | 0;
      if (sz) features.push({ type: "pond", size: sz });
    }
  } else {
    const ponds = plan.ponds | 0;
    if (ponds) features.push({ type: "pond", size: ponds });
  }
  const river = plan.river | 0;
  if (river) features.push({ type: "river", size: river });
  if (plan.wolf) features.push({ type: "wolf" });
  if (plan.bunny) features.push({ type: "bunny" });
  return { size: Save.clampSize(plan.n || plan.size || Save.SIZE_MIN), features: features };
};
