// @ts-check
const scopedData = {};

module.exports = function (scopeName) {
  if (!scopedData[scopeName]) {
    scopedData[scopeName] = {};
  }

  const scope = scopedData[scopeName];

  /**
   * @param {string} name
   */
  function start(name) {
    scope[name] = new Date();
  }

  /**
   * @param {string} name
   */
  function end(name) {
    if (!(name in scope)) {
      return;
    }
    if (process.env.PROFILE_SYNC) {
      console.log(`${name} took ${Date.now() - scope[name]}ms`);
    }
  }

  /**
   * @param {string} name
   * @param {(callback: (err: Error | null) => void) => void} func
   * @param {*} callback
   */
  function timedFunc(name, func, callback) {
    start(name);
    func((err) => {
      end(name);
      callback(err);
    });
  }

  /**
   * @template T
   * @param {string} name
   * @param {() => Promise<T>} asyncFunc
   * @returns {Promise<T>}
   */
  async function timedAsync(name, asyncFunc) {
    start(name);
    let res;
    try {
      res = await asyncFunc();
    } finally {
      end(name);
    }
    return res;
  }

  return {
    start,
    end,
    timedFunc,
    timedAsync,
  };
};
