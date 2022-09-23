const execa = require('execa');

function memoize(fn) {
  let hasResult = false;
  let result = null;
  let promise = null;

  return async function () {
    if (hasResult === true) {
      return result;
    }

    if (promise === null) {
      promise = fn();
    }

    result = await promise;
    hasResult = true;
    promise = null;

    return result;
  };
}

module.exports.getCurrentRevision = memoize(async () => {
  try {
    return (await execa('git', ['rev-parse', 'HEAD'])).stdout.trim();
  } catch {
    return null;
  }
});
