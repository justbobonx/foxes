/** Field links: a whole board, marks, clock and hints packed into a short base64url string, and back. */

const SHARE_VERSION = 1;
const SHARE_VERSION_BITS = 4;
const SHARE_SIDE_BITS = 5; // rows, columns, plan size, wolf row and column
const SHARE_HAWK_BITS = 2;
const SHARE_FEATURE_COUNT_BITS = 5;
const SHARE_FEATURE_TYPE_BITS = 3;
const SHARE_WIDTH_BITS = 5; // how many bits the free-size number after it takes
const SHARE_RUN_WIDTH_BITS = 4; // how many bits each patch key and run length take
const SHARE_GUESS_BITS = 2;
const SHARE_CHAR_BITS = 6;
const SHARE_CUT_SCALE = 1000;
const SHARE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const SHARE_HOLE_TYPES = ["water", "cave", "bunny", "hawk", "tree"];
const SHARE_FEATURE_TYPES = ["pond", "river", "trees", "wolf", "bunny", "hawk"];
const SHARE_GUESSES = [null, "x", "o"];
// Patch keys below this are hole kinds; from here up they are grass ranges, starting at the hole range id.
const SHARE_GRASS_KEY = SHARE_HOLE_TYPES.length;
const SHARE_DELL_FLOOR = -2;

function Share() {}

// Bits needed to hold any whole number up to max.
function shareBits(max) {
  return max > 0 ? max.toString(2).length : 0;
}

// data: a saved board (cells plus clock and hints). The won flag is left out so the friend gets to play it.
Share.encode = function (data) {
  let bits = "";
  function put(value, width) {
    if (!width) return;
    bits += (value >>> 0).toString(2).padStart(width, "0").slice(-width);
  }
  function putNumber(value) {
    put(shareBits(value), SHARE_WIDTH_BITS);
    put(value, shareBits(value));
  }
  const rows = data.n | 0;
  const cols = data.cols | 0 || rows;
  const count = rows * cols;
  const plan = Plan.copy(data.plan, rows);
  put(SHARE_VERSION, SHARE_VERSION_BITS);
  put(rows, SHARE_SIDE_BITS);
  put(cols, SHARE_SIDE_BITS);
  put(plan.size, SHARE_SIDE_BITS);
  put(data.wolfShown ? 1 : 0, 1);
  put(data.wolfRow + 1, SHARE_SIDE_BITS);
  put(data.wolfCol + 1, SHARE_SIDE_BITS);
  put(data.hawk === "L" ? 1 : data.hawk === "R" ? 2 : 0, SHARE_HAWK_BITS);
  put(plan.features.length, SHARE_FEATURE_COUNT_BITS);
  for (let i = 0; i < plan.features.length; i++) {
    put(SHARE_FEATURE_TYPES.indexOf(plan.features[i].type), SHARE_FEATURE_TYPE_BITS);
    putNumber(plan.features[i].size | 0);
  }
  putNumber(Math.max(0, Math.round((data.elapsedMs || 0) / 1000)));
  putNumber(data.hintCount | 0);
  putNumber(Math.max(1, Math.round((data.hintCut > 0 ? data.hintCut : 1) * SHARE_CUT_SCALE)));

  // Ranges are blobs, so reading order gives long runs of one patch; each run is its patch and length.
  const runs = [];
  let maxKey = 0;
  let maxRun = 0;
  for (let i = 0; i < count; i++) {
    const cell = data.cells[i];
    const key =
      cell.type === "grass" ? SHARE_GRASS_KEY + cell.dellId - SHARE_DELL_FLOOR : SHARE_HOLE_TYPES.indexOf(cell.type);
    const last = runs[runs.length - 1];
    if (last && last.key === key) last.length++;
    else runs.push({ key: key, length: 1 });
    maxKey = Math.max(maxKey, key);
    maxRun = Math.max(maxRun, runs[runs.length - 1].length);
  }
  const keyBits = shareBits(maxKey);
  const runBits = shareBits(maxRun - 1);
  put(keyBits, SHARE_RUN_WIDTH_BITS);
  put(runBits, SHARE_RUN_WIDTH_BITS);
  for (let i = 0; i < runs.length; i++) {
    put(runs[i].key, keyBits);
    put(runs[i].length - 1, runBits);
  }

  // Foxes are few, so they go as a list of cell spots rather than a flag on every cell.
  const spotBits = shareBits(count - 1);
  let foxes = 0;
  for (let i = 0; i < count; i++) {
    if (data.cells[i].spriteId) foxes++;
  }
  putNumber(foxes);
  for (let i = 0; i < count; i++) {
    if (data.cells[i].spriteId) put(i, spotBits);
  }

  // One flag per cell says whether it carries any mark; only marked cells spend bits on the mark itself.
  for (let i = 0; i < count; i++) {
    const cell = data.cells[i];
    const guess = Math.max(0, SHARE_GUESSES.indexOf(cell.guessId || null));
    if (!guess && !cell.locked && !cell.wrong && !cell.warn) {
      put(0, 1);
      continue;
    }
    put(1, 1);
    put(guess, SHARE_GUESS_BITS);
    put(cell.locked ? 1 : 0, 1);
    put(cell.wrong ? 1 : 0, 1);
    put(cell.warn ? 1 : 0, 1);
  }

  while (bits.length % SHARE_CHAR_BITS) bits += "0";
  let out = "";
  for (let i = 0; i < bits.length; i += SHARE_CHAR_BITS) {
    out += SHARE_ALPHABET.charAt(parseInt(bits.slice(i, i + SHARE_CHAR_BITS), 2));
  }
  return out;
};

// Returns a saved-board shaped object, or null if the text is not a whole, sane field.
Share.decode = function (text) {
  try {
    let bits = "";
    for (let i = 0; i < text.length; i++) {
      const v = SHARE_ALPHABET.indexOf(text.charAt(i));
      if (v < 0) return null;
      bits += v.toString(2).padStart(SHARE_CHAR_BITS, "0");
    }
    let pos = 0;
    function take(width) {
      if (pos + width > bits.length) throw new Error("short field");
      const v = width ? parseInt(bits.slice(pos, pos + width), 2) : 0;
      pos += width;
      return v;
    }
    function takeNumber() {
      return take(take(SHARE_WIDTH_BITS));
    }
    take(SHARE_VERSION_BITS);
    const rows = take(SHARE_SIDE_BITS);
    const cols = take(SHARE_SIDE_BITS);
    const size = take(SHARE_SIDE_BITS);
    if (!rows || !cols || !size) return null;
    const count = rows * cols;
    const wolfShown = !!take(1);
    const wolfRow = take(SHARE_SIDE_BITS) - 1;
    const wolfCol = take(SHARE_SIDE_BITS) - 1;
    if (wolfRow >= rows || wolfCol >= cols || (wolfRow < 0) !== (wolfCol < 0)) return null;
    const hawkCode = take(SHARE_HAWK_BITS);
    if (hawkCode > 2) return null;
    const features = [];
    const featureCount = take(SHARE_FEATURE_COUNT_BITS);
    for (let i = 0; i < featureCount; i++) {
      const type = SHARE_FEATURE_TYPES[take(SHARE_FEATURE_TYPE_BITS)];
      if (!type) return null;
      const item = { type: type };
      const featureSize = takeNumber();
      if (featureSize) item.size = featureSize;
      features.push(item);
    }
    const elapsedMs = takeNumber() * 1000;
    const hintCount = takeNumber();
    const hintCut = takeNumber() / SHARE_CUT_SCALE;
    if (!(hintCut > 0)) return null;

    const cells = [];
    const keyBits = take(SHARE_RUN_WIDTH_BITS);
    const runBits = take(SHARE_RUN_WIDTH_BITS);
    while (cells.length < count) {
      const key = take(keyBits);
      const length = take(runBits) + 1;
      if (cells.length + length > count) return null;
      if (key < SHARE_GRASS_KEY && !SHARE_HOLE_TYPES[key]) return null;
      for (let i = 0; i < length; i++) {
        cells.push({
          type: key < SHARE_GRASS_KEY ? SHARE_HOLE_TYPES[key] : "grass",
          dellId: key < SHARE_GRASS_KEY ? Grid.HOLE_DELL : key - SHARE_GRASS_KEY + SHARE_DELL_FLOOR,
          spriteId: null,
          guessId: null,
          wrong: false,
          warn: false,
          locked: false,
        });
      }
    }

    const spotBits = shareBits(count - 1);
    const foxes = takeNumber();
    if (foxes > count) return null;
    for (let i = 0; i < foxes; i++) {
      const spot = take(spotBits);
      if (spot >= count) return null;
      cells[spot].spriteId = "o";
    }

    for (let i = 0; i < count; i++) {
      if (!take(1)) continue;
      const guess = take(SHARE_GUESS_BITS);
      if (guess >= SHARE_GUESSES.length) return null;
      cells[i].guessId = SHARE_GUESSES[guess];
      cells[i].locked = !!take(1);
      cells[i].wrong = !!take(1);
      cells[i].warn = !!take(1);
    }
    if (bits.length - pos >= SHARE_CHAR_BITS) return null;

    return {
      n: rows,
      cols: cols,
      wolfShown: wolfShown,
      wolfRow: wolfRow,
      wolfCol: wolfCol,
      hawk: hawkCode === 1 ? "L" : hawkCode === 2 ? "R" : null,
      plan: { size: size, features: features },
      cells: cells,
      elapsedMs: elapsedMs,
      hintCount: hintCount,
      hintCut: hintCut,
    };
  } catch (err) {
    return null;
  }
};
