/** Field spec: { size, features[] }. */

function Plan() {}

Plan.blank = function () {
  return { size: Save.SIZE_MIN, features: [] };
};

Plan.copy = function (plan) {
  if (!plan) return Plan.blank();
  const size = Save.clampSize(plan.size || plan.n || Save.SIZE_MIN);
  const src = Array.isArray(plan.features) ? plan.features : [];
  const features = [];
  for (let i = 0; i < src.length; i++) {
    const f = src[i];
    if (!f || !f.type || f.type === "water") continue;
    const item = { type: f.type };
    for (const k in f) {
      if (k === "type") continue;
      item[k] = f[k];
    }
    if (item.amount && !item.size) item.size = item.amount;
    features.push(item);
  }
  return { size: size, features: features };
};

Plan.has = function (plan, type) {
  if (!plan || !plan.features) return false;
  for (let i = 0; i < plan.features.length; i++) {
    if (plan.features[i].type === type) return true;
  }
  return false;
};

Plan.treeCount = function (plan) {
  if (!plan || !plan.features) return 0;
  for (let i = 0; i < plan.features.length; i++) {
    const f = plan.features[i];
    if (!f || f.type !== "trees") continue;
    const z = f.size | 0 || f.amount | 0 || 1;
    return z < 1 ? 1 : z;
  }
  return 0;
};

Plan.riverMode = function (plan) {
  if (!plan || !plan.features) return 0;
  for (let i = 0; i < plan.features.length; i++) {
    const f = plan.features[i];
    if (!f || f.type !== "river") continue;
    return f.size === 1 ? 1 : 2;
  }
  return 0;
};

Plan.pondSizes = function (plan) {
  const jobs = [];
  const list = plan && plan.features ? plan.features : [];
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    if (!f || f.type !== "pond") continue;
    let sz = f.size | 0 || f.amount | 0 || 1;
    if (sz < 1) sz = 1;
    if (sz > 4) sz = 4;
    jobs.push(sz);
  }
  return jobs;
};

Plan.key = function (plan) {
  const list = plan && plan.features ? plan.features.slice() : [];
  list.sort(function (a, b) {
    if (a.type < b.type) return -1;
    if (a.type > b.type) return 1;
    return (a.size || a.amount || 0) - (b.size || b.amount || 0);
  });
  const parts = [];
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    if (!f || f.type === "water") continue;
    let bit = f.type;
    const n = f.size || f.amount;
    if (n) bit += ":" + n;
    parts.push(bit);
  }
  return (plan ? plan.size : 0) + "|" + parts.join(",");
};

Plan.make = function (size, features) {
  const rank = { trees: 0, pond: 1, river: 2, wolf: 3, bunny: 4, hawk: 5 };
  const raw = features || [];
  let hasTrees = false;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] && raw[i].type === "trees") hasTrees = true;
  }
  const list = raw.filter(function (f) {
    return f && f.type && f.type !== "water" && !(hasTrees && f.type === "hawk");
  }).sort(function (a, b) {
    const aa = rank[a.type] != null ? rank[a.type] : 9;
    const bb = rank[b.type] != null ? rank[b.type] : 9;
    if (aa !== bb) return aa - bb;
    return (a.size || 0) - (b.size || 0);
  });
  return { size: Save.clampSize(size), features: list };
};

Plan.fromQuery = function (search) {
  let raw = "";
  try {
    raw = new URLSearchParams(search || "").get("plan") || "";
  } catch (err) {
    return null;
  }
  raw = raw.trim();
  if (!raw) return null;
  if (raw.charAt(0) === "{") {
    try {
      const src = JSON.parse(raw);
      if (!src || typeof src !== "object") return null;
      const features = [];
      const list = Array.isArray(src.features) ? src.features : [];
      let hasRiver = false;
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        if (!f || !f.type || f.type === "water") continue;
        if (f.type === "pond") {
          const sz = f.size | 0 || f.amount | 0 || 1;
          features.push({ type: "pond", size: sz < 1 ? 1 : sz > 4 ? 4 : sz });
        } else if (f.type === "river") {
          if (hasRiver) continue;
          hasRiver = true;
          const sz = f.size | 0;
          features.push({ type: "river", size: sz === 1 ? 1 : 2 });
        } else if (f.type === "trees") {
          const sz = f.size | 0 || f.amount | 0 || 1;
          features.push({ type: "trees", size: sz < 1 ? 1 : sz });
        } else if (f.type === "wolf" || f.type === "bunny" || f.type === "hawk") {
          features.push({ type: f.type });
        }
      }
      return Plan.copy({ size: src.size || src.n, features: features });
    } catch (err) {
      return null;
    }
  }
  const parts = raw.split(",");
  const size = parseInt(parts[0], 10);
  if (!size) return null;
  const features = [];
  let hasRiver = false;
  for (let i = 1; i < parts.length; i++) {
    const bit = parts[i].trim();
    if (!bit) continue;
    const kv = bit.split(":");
    const type = kv[0].trim();
    if (type === "water") continue;
    const sz = kv.length > 1 ? parseInt(kv[1], 10) : 0;
    if (type === "pond") {
      const pond = sz >= 1 && sz <= 4 ? sz : 1;
      features.push({ type: "pond", size: pond });
    } else if (type === "river") {
      if (hasRiver) continue;
      hasRiver = true;
      features.push({ type: "river", size: sz === 1 ? 1 : 2 });
    } else if (type === "trees") {
      features.push({ type: "trees", size: sz >= 1 ? sz : 1 });
    } else if (type === "wolf" || type === "bunny" || type === "hawk") {
      features.push({ type: type });
    }
  }
  return Plan.copy({ size: size, features: features });
};
