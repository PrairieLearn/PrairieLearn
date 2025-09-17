/**
 * An object containing a promise and its resolve/reject methods.
 */
export interface PromiseWithResolvers<T> {
  /** The promise instance. */
  promise: Promise<T>;
  /** Resolves the promise. */
  resolve: (value: T | PromiseLike<T>) => void;
  /** Rejects the promise. */
  reject: (reason?: any) => void;
}

/**
 * Returns an object with a promise and its resolve/reject methods exposed.
 * This is similar to Node.js's util.withResolvers (Node 21+).
 *
 * @returns An object containing the promise, resolve, and reject.
 */
export function withResolvers<T>(): PromiseWithResolvers<T> {
  let resolve: (value: T | PromiseLike<T>) => void;
  let reject: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // TypeScript will ensure resolve/reject are assigned
  return { promise, resolve: resolve!, reject: reject! };
}
