const SAVE_BOARD = "foxes_field";
const SAVE_TEST_BOARD = "foxes_test";
const SAVE_QUICK_BOARD = "foxes_quick";
const SAVE_FOREST = "foxes_forest";
const SAVE_QUICK_STATS = "foxes_quick_stats";

function Save() {}

// slot = which board save: the field, the URL plan board, or the quick board, kept apart so none clobbers another.
Save.readBoard = function (slot) {
  try {
    const data = JSON.parse(localStorage.getItem(slot) || "null");
    return data && data.n && data.cells ? data : null;
  } catch (err) {
    return null;
  }
};

Save.writeBoard = function (data, slot) {
  try {
    localStorage.setItem(slot, JSON.stringify(data));
  } catch (err) {}
};

Save.clearBoard = function (slot) {
  try {
    localStorage.removeItem(slot);
  } catch (err) {}
};

Save.readForest = function () {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_FOREST) || "null");
    return data && typeof data === "object" ? data : null;
  } catch (err) {
    return null;
  }
};

Save.writeForest = function (data) {
  try {
    localStorage.setItem(SAVE_FOREST, JSON.stringify(data));
  } catch (err) {}
};

// Quick play records by size, kept out of the forest.
Save.readQuick = function () {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_QUICK_STATS) || "null");
    return data && typeof data === "object" ? data : null;
  } catch (err) {
    return null;
  }
};

Save.writeQuick = function (data) {
  try {
    localStorage.setItem(SAVE_QUICK_STATS, JSON.stringify(data));
  } catch (err) {}
};
