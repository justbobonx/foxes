const SAVE_BOARD = "foxes_field";
const SAVE_FOREST = "foxes_forest";

function Save() {}

Save.readBoard = function () {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_BOARD) || "null");
    return data && data.n && data.cells ? data : null;
  } catch (err) {
    return null;
  }
};

Save.writeBoard = function (data) {
  try {
    localStorage.setItem(SAVE_BOARD, JSON.stringify(data));
  } catch (err) {}
};

Save.clearBoard = function () {
  try {
    localStorage.removeItem(SAVE_BOARD);
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
