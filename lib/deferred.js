/**
 * @typedef {Object} DeferredPromise
 * @template T
 * @property {Promise<T>} promise
 * @property {(resolve: (value: T) => void) => void} resolve
 * @property {(reject: (reason: any) => void) => void} reject
 */

/**
 * Returns an object that can be used to resolve or reject a promise from
 * the outside.
 *
 * @template T
 * @returns {DeferredPromise<T>}
 */
module.exports.deferredPromise = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    resolve,
    reject,
    promise,
  };
};
