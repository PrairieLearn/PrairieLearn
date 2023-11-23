// @ts-check
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
export function deferredPromise() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  if (resolve === undefined || reject === undefined) {
    throw new Error('resolve or reject is undefined');
  }
  return {
    resolve,
    reject,
    promise,
  };
}
