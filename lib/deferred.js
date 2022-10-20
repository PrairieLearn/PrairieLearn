/**
 * @template T
 * @typedef {Object} DeferredPromise
 * @property {Promise<T>} promise
 * @property {(value: T) => void} resolve
 * @property {(reason: any) => void} reject
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
