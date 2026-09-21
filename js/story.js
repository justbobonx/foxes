/** Story page catalog. Game decides when to show. */

const StoryPages = {
  start: [
  { image: "images/fox.png", sizex: 64, sizey: 64, text:
`All the Foxes in the field
They each need their own space
To hunt and play
But not too close and not in view`
  },
  { image: "images/fox.png", sizex: 64, sizey: 64, text:
`Tap to add an X
Double tap to add a fox
Tap to remove an X or fox
Only one f per colored area
And no fox can look at another fox
in row or column.`
  } ],
  first_7: { image: "images/sizes.png", sizex: 64, sizey: 64, text:
`the fields grow larger
that means more foxes`
  },
  first_pond: { image: "images/pond.png", sizex: 64, sizey: 64, text: "you can see over ponds" },
  first_river: { image: "images/stream.png", sizex: 64, sizey: 64, text: "rivers" },
  first_wolf: { image: "images/wolf.png", sizex: 64, sizey: 64, text: "wolfs is scary" },
  first_bunny: { image: "images/bunny.png", sizex: 64, sizey: 64, text: "bunny go hop hop" },
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
