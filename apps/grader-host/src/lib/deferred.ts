interface DeferredPromise<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: any) => void;
}

/**
 * Returns an object that can be used to resolve or reject a promise from
 * the outside.
 */
export function deferredPromise<T>(): DeferredPromise<T> {
  let resolve, reject;
  const promise = new Promise<T>((res, rej) => {
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
