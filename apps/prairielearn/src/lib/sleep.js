/**
 * Returns a Promise that resolves after the given number of milliseconds.
 * @param {number} ms How many milliseconds to wait.
 * @returns {Promise<void>}
 */
module.exports.sleep = function (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
