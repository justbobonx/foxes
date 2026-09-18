/** Reads forest, returns 1-3 cards. Does not build a field. */

const CARD_TITLES = {
  chill: ["let's chill out"],
  stay: ["just over the hill", "down the path a bit"],
  deeper: ["let's go deeper...", "around the bend", "what's over there?"],
  retry: ["let's try again!", "one more try!"],
  variant: ["maybe something else"],
};

function Planner() {}

Planner.pickTitle = function (kind) {
  const list = CARD_TITLES[kind] || [kind];
  return list[Math.floor(Math.random() * list.length)];
};

Planner.featureItem = function (type) {
  const spec = Forest.CATALOG[type];
  const item = { type: type };
  if (spec && spec.defaults) {
    for (const k in spec.defaults) item[k] = spec.defaults[k];
  }
  return item;
};

Planner.rollFeatures = function (forest, n) {
  const out = [];
  for (const type in Forest.CATALOG) {
    if (!forest.canPut(type, n)) continue;
    if (Math.random() < Forest.CATALOG[type].p) out.push(Planner.featureItem(type));
  }
  return out;
};

Planner.makePlan = function (size, features) {
  return { size: Save.clampSize(size), features: features || [] };
};

Planner.sameFeatures = function (a, b) {
  return Forest.featureKey(a) === Forest.featureKey(b);
};

Planner.forceFeature = function (features, type) {
  const out = features.slice();
  for (let i = 0; i < out.length; i++) {
    if (out[i].type === type) return out;
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

  if (loc.size < forest.maxN) {
    const size = loc.size + 1;
    return Planner.card("deeper", Planner.makePlan(size, Planner.rollFeatures(forest, size)), false, 0);
  }

  if (parsed && parsed.kind === "size") {
    const size = Save.clampSize(parsed.n);
    return Planner.card("deeper", Planner.makePlan(size, Planner.rollFeatures(forest, size)), lockedNext, lockedNext ? costTarget : 0);
  }

  if (parsed && parsed.kind === "feature") {
    const spec = Forest.CATALOG[parsed.type];
    const need = spec ? spec.minN : Save.SIZE_MIN;
    const size = loc.size >= need ? loc.size : need;
    const features = Planner.forceFeature(Planner.rollFeatures(forest, size), parsed.type);
    return Planner.card("deeper", Planner.makePlan(size, features), lockedNext, lockedNext ? costTarget : 0);
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

Planner.prototype.travel = function (forest) {
  if (forest.offers && forest.offers.length) return forest.offers;
  const cards = [];
  const chill = Planner.chillPlan(forest);
  if (chill) cards.push(Planner.card("chill", chill, false, 0));
  cards.push(Planner.card("stay", Planner.stayPlan(forest), false, 0));
  cards.push(Planner.deeperCard(forest));
  const offers = Planner.dedupe(cards);
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
  const out = { n: plan.size, ponds: 0, wolf: false, bunny: false };
  const list = plan.features || [];
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    if (f.type === "pond") out.ponds = f.amount | 0 || 1;
    if (f.type === "wolf") out.wolf = true;
    if (f.type === "bunny") out.bunny = true;
  }
  return out;
};

Planner.fromBuilder = function (plan) {
  if (!plan) return Forest.blankPlan();
  if (plan.size && Array.isArray(plan.features)) return Forest.copyPlan(plan);
  const features = [];
  const ponds = plan.ponds | 0;
  if (ponds) features.push({ type: "pond", amount: ponds });
  if (plan.wolf) features.push({ type: "wolf" });
  if (plan.bunny) features.push({ type: "bunny" });
  return { size: Save.clampSize(plan.n || plan.size || Save.SIZE_MIN), features: features };
};
