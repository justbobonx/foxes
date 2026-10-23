const SAVE_BOARD = "foxes_field";
const SAVE_TEST_BOARD = "foxes_test";
const SAVE_FOREST = "foxes_forest";

function Save() {}

// test = the URL plan board, kept apart so it never clobbers the field in progress.
Save.readBoard = function (test) {
  try {
    const data = JSON.parse(localStorage.getItem(test ? SAVE_TEST_BOARD : SAVE_BOARD) || "null");
    return data && data.n && data.cells ? data : null;
  } catch (err) {
    return null;
  }
};

Save.writeBoard = function (data, test) {
  try {
    localStorage.setItem(test ? SAVE_TEST_BOARD : SAVE_BOARD, JSON.stringify(data));
  } catch (err) {}
};

Save.clearBoard = function (test) {
  try {
    localStorage.removeItem(test ? SAVE_TEST_BOARD : SAVE_BOARD);
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
