/** Story page catalog. Game decides when to show. */

const StoryPages = {
  start: { image: "images/fox.png", sizex: 64, sizey: 64, text: "" },
  first_pond: { image: "images/pond.png", sizex: 64, sizey: 64, text: "" },
  first_river: { image: "images/stream.png", sizex: 64, sizey: 64, text: "" },
  first_wolf: { image: "images/wolf.png", sizex: 64, sizey: 64, text: "" },
  first_bunny: { image: "images/bunny.png", sizex: 64, sizey: 64, text: "" },
};

function Story() {}

Story.DEFAULT_SIZE = 64;

Story.isPage = function (p) {
  if (!p) return false;
  return !!(String(p.text || "").trim() || String(p.image || "").trim());
};

Story.normPage = function (p) {
  const x = p.sizex | 0;
  const y = p.sizey | 0;
  return {
    image: p.image || "",
    sizex: x > 0 ? x : y > 0 ? y : Story.DEFAULT_SIZE,
    sizey: y > 0 ? y : x > 0 ? x : Story.DEFAULT_SIZE,
    text: String(p.text || ""),
  };
};

Story.pages = function (id) {
  if (!id) return [];
  const entry = StoryPages[id];
  if (!entry) return [];
  const list = Array.isArray(entry) ? entry : [entry];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    if (!Story.isPage(list[i])) continue;
    out.push(Story.normPage(list[i]));
  }
  return out;
};
