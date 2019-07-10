
/**
 * @param {<T>() => Promise<T>} func - The async function to execute
 * @param {(error: Error | null, result: T | undefined) => void} callback - Callback to receive the result or the error
 */
module.exports.safeAsync = function(func, callback) {
  func().then(res => callback(null, res)).catch(err => callback(err));
};
