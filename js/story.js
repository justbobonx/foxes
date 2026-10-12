/** Story page catalog. Game decides when to show. */

const StoryPages = {
  start: [
    { image: "images/fox.png", sizex: 64, sizey: 64, text:
`All the Foxes in the field

They love to hunt and play`
    },
    { image: "images/fox.png", sizex: 64, sizey: 64, text:
`But they each need their own space not in view of other foxes

And not too close!`
    },
    { image: "images/fox.png", sizex: 64, sizey: 64, text:
`Tap to add an X

Double tap to add a fox

Tap to remove an X or fox`
    },
    { image: "images/fox.png", sizex: 64, sizey: 64, text:
`Only one fox per colored territory

No fox can look at another fox in row or run

And no fox can sit next to another fox in any direction`
  }
 ],
  first_7: { image: "images/sizes.png", sizex: 64, sizey: 64, text:
`As the fields grow larger
that means more foxes

Always 1 per row, run, and territory`
  },
  first_pond: { image: "images/pond.png", sizex: 64, sizey: 64, text:
`Foxes don't go in ponds, but they can see over them` },
  first_river: { image: "images/stream.png", sizex: 64, sizey: 64, text:
`Rivers are just like ponds

Only longer` },
  first_wolf: { image: "images/wolf.png", sizex: 64, sizey: 64, text:
`The wolf is scary

No fox wants to be next to a wolf

But foxes love to taunt the wolf. They often sit right next to cave spaces where the wolf is not!` },
  first_bunny: { image: "images/bunny.png", sizex: 64, sizey: 64, text:
`The foxes have found a rabbits den

Foxes love to hunt rabbits

There will always be the most foxes that can fit around a rabbits den (that's two)` },
  first_hawk: { image: "images/hawk.png", sizex: 64, sizey: 64, text:
`A hawk stares down from the corner of the field

The hawk has a favorite fox and protects only it

There is always exactly one fox on the hawk's line`
  },
  first_trees: { image: "images/trees.png", sizex: 64, sizey: 64, text:
`Sometimes trees grow into a field from the sides

Trees block foxes view as well as movement

Unlike water, two foxes can sit on the same line if a tree sits between them blocking their view of each other
` },
  "L0": { image: "images/prints.png", sizex: 64, sizey: 64, text:
`Two foxes cannot share the same row, run, ring or territory` },
  "L0.wolf": { image: "images/prints.png", sizex: 64, sizey: 64, text:
`There is only one wolf in the caves` },
  "L1": { image: "images/prints.png", sizex: 64, sizey: 64, text: 
`There is no fox there` },
  "L1.wolf": { image: "images/prints.png", sizex: 64, sizey: 64, text:
`The wolf is not in that cave` },
  "L2.1.1": { image: "images/prints.png", sizex: 64, sizey: 64, text:
`No other foxes can be in that row` },
  "L2.1.2": { image: "images/prints.png", sizex: 64, sizey: 64, text:
`No other foxes can be in that run` },
  "L2.1.3": { image: "images/prints.png", sizex: 64, sizey: 64, text:
`No other foxes around that fox` },
  "L2.1.4": { image: "images/prints.png", sizex: 64, sizey: 64, text:
`No other foxes can be in that territory` },
  "L2.2.5": { image: "images/prints.png", sizex: 64, sizey: 64, text:
`No more foxes can fit around the bunnies spot` },
  "L2.2.6": { image: "images/prints.png", sizex: 64, sizey: 64, text:
`No other fox can be in the hawk's sight line` },
  "L2.2.7": { image: "images/prints.png", sizex: 64, sizey: 64, text:
`Only one wolf in the caves and no foxes by the wolf` },
  "L3.1.1.a": { image: "images/prints.png", sizex: 64, sizey: 64, text:
`All remaining open spots of this territory are on this line, so spots from any other territory on this line must be empty` },
  "L3.1.1.b": { image: "images/prints.png", sizex: 64, sizey: 64, text:
`This line is all one territory so its fox must be on this line, so spots of this territory on other lines must be empty` },
  "L3.1.2": { image: "images/prints.png", sizex: 64, sizey: 64, text:
`These spots could be seen by the fox of that territory no matter which spot it sits, so they must be empty.` },
  "L3.1.3.a": { image: "images/prints.png", sizex: 64, sizey: 64, text:
`All remaining open spots of these two territories sit wholly on this group of two lines.

So spots from any other territory on this group of two lines must be empty.` },
  "L3.1.3.b": { image: "images/prints.png", sizex: 64, sizey: 64, text:
`This group of two lines only holds remaining open spots for these two territories.

So the foxes of these two territories must be on these two lines and all the spots of these two territories on other lines must be empty.` },
  "L3.1.4.a": { image: "images/prints.png", sizex: 64, sizey: 64, text:
`All remaining open spots of these three territories sit wholly on this group of three lines.

So spots from any other territory on this group of three lines must be empty.` },
  "L3.1.4.b": { image: "images/prints.png", sizex: 64, sizey: 64, text:
`This group of three lines only holds remaining open spots for these three territories.

So the foxes of these three territories must be on these three lines and all the spots of these three territories on other lines must be empty.` },
  "L3.2.1.a": { image: "images/prints.png", sizex: 64, sizey: 64, text:
`These two territories only have remaining open spots around the bunnies spot.

So, spots from any other territory around the bunnies spot must be empty.` },
  "L3.2.1.b": { image: "images/prints.png", sizex: 64, sizey: 64, text:
`There are only two territories open around the bunnies, so those foxes must be hunting the bunnies.

So, all other spots of those two territoires not around the bunnies spot must be empty.` },
  "L3.2.2.a": { image: "images/prints.png", sizex: 64, sizey: 64, text:
`All remaining open spots for this territory are in the hawks line, so it must have its fox there.

So, all spots from other territoires must be empty.` },
  "L3.2.2.b": { image: "images/prints.png", sizex: 64, sizey: 64, text:
`The hawks line contains only one territory so its fox must be there, so any other spots of that territory must be empty` },
  "L3.2.3": { image: "images/prints.png", sizex: 64, sizey: 64, text:
`Any spot that is next to all cave spots must be next to the wolf and so cannot contain a fox` },
  "L4": { image: "images/prints.png", sizex: 64, sizey: 64, text:
`Still stumped?

Then let's look for some fox tracks.

Here's a few spots a fox is not.` },
  "L5": { image: "images/prints.png", sizex: 64, sizey: 64, text:
`Still stumped?!

Well, here's the last spots of this territory where a fox is not.` },
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
  return [Story.normPage(StoryPages['first_bunny'])];
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
