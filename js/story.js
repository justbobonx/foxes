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
  first_hawk: { image: "images/hawk.png", sizex: 64, sizey: 64, text:
`a hawk stares down
from the corner of the forest
exactly one fox on that line`
  },
  first_trees: { image: "images/trees.png", sizex: 64, sizey: 64, text:
`trees on the edge split a column
two foxes can share that file
if the trees stand between them`
  },

  L0: { image: "images/prints.png", sizex: 64, sizey: 64, text:
`two foxes cannot share a row, a run, a range, a ring, or the hawk line` },
  "L0.wolf": { image: "images/prints.png", sizex: 64, sizey: 64, text: "two wolves cannot both be the wolf" },
  L1: { image: "images/prints.png", sizex: 64, sizey: 64, text: "that fox is not there" },
  "L1.wolf": { image: "images/prints.png", sizex: 64, sizey: 64, text: "that cave is not the wolf" },
  "L2.1.1": { image: "images/prints.png", sizex: 64, sizey: 64, text: "a found fox clears the rest of its row" },
  "L2.1.2": { image: "images/prints.png", sizex: 64, sizey: 64, text: "a found fox clears the rest of its run" },
  "L2.1.3": { image: "images/prints.png", sizex: 64, sizey: 64, text: "a found fox clears the ring around it" },
  "L2.1.4": { image: "images/prints.png", sizex: 64, sizey: 64, text: "a found fox clears the rest of its range" },
  "L2.2.5": { image: "images/prints.png", sizex: 64, sizey: 64, text: "both foxes by the bunny are found. the rest of the ring is empty" },
  "L2.2.6": { image: "images/prints.png", sizex: 64, sizey: 64, text: "the hawk line fox is found. the rest of that line is empty" },
  "L2.2.7": { image: "images/prints.png", sizex: 64, sizey: 64, text: "the wolf is found. other caves and the grass around it are empty" },
  "L3.1.1.a": { image: "images/prints.png", sizex: 64, sizey: 64, text: "one range sits on this line. the other opens there are empty" },
  "L3.1.1.b": { image: "images/prints.png", sizex: 64, sizey: 64, text: "this line holds opens from only one range. that range is empty off the line" },
  "L3.1.2": { image: "images/prints.png", sizex: 64, sizey: 64, text: "this spot touches every open seat of a small range" },
  "L3.1.3.a": { image: "images/prints.png", sizex: 64, sizey: 64, text: "two ranges sit on these two lines. the other opens there are empty" },
  "L3.1.3.b": { image: "images/prints.png", sizex: 64, sizey: 64, text: "these two lines hold opens from only two ranges. those ranges are empty off the pair" },
  "L3.1.4.a": { image: "images/prints.png", sizex: 64, sizey: 64, text: "three ranges sit on these three lines. the other opens there are empty" },
  "L3.1.4.b": { image: "images/prints.png", sizex: 64, sizey: 64, text: "these three lines hold opens from only three ranges. those ranges are empty off the triple" },
  "L3.2.1.a": { image: "images/prints.png", sizex: 64, sizey: 64, text: "two ranges sit on the bunny ring. the other opens on the ring are empty" },
  "L3.2.1.b": { image: "images/prints.png", sizex: 64, sizey: 64, text: "the bunny ring holds opens from exactly those ranges. they are empty off the ring" },
  "L3.2.2.a": { image: "images/prints.png", sizex: 64, sizey: 64, text: "one range sits on the hawk line. the other opens on the line are empty" },
  "L3.2.2.b": { image: "images/prints.png", sizex: 64, sizey: 64, text: "the hawk line holds opens from only one range. that range is empty off the line" },
  "L3.2.3": { image: "images/prints.png", sizex: 64, sizey: 64, text: "a spot that touches every cave cannot hold a fox" },
  L4: { image: "images/prints.png", sizex: 64, sizey: 64, text: "no more logic. one fox-free line of a range is marked" },
  L5: { image: "images/prints.png", sizex: 64, sizey: 64, text: "nothing left but the fox. the last empty spots of a range are marked" },
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
