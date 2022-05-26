/**
 * Implementation of a local JavaScript lock.
 * Waiting callers are placed in a queue and locks are obtained in the order
 * that lock() is called.
 */

class LocalLock {
  constructor() {
    this._lock = false;
    this._waiting = [];
  }

  /**
   * Tries to acquire the lock.  If it is free this will return immediately.
   * If someone already has the lock then this will wait until unlock() is called.
   * Locks are acquired in the order lock() is called.
   * @param {boolean} wait Should we wait for this lock?  If this is false and the
   * lock is busy this function will throw an error.
   */
  async lockAsync(wait = true) {
    if (!this._lock) {
      this._lock = true;
    } else {
      if (wait) {
        const promise = new Promise((resolve, _reject) => {
          this._waiting.push(resolve);
        });
        await promise;
      } else {
        throw new Error("Couldn't obtain lock!");
      }
    }
  }

  /**
   * Tries to acquire the lock.  If it is free this will return immediately.
   * If someone already has the lock then this will wait until unlock() is called.
   * Locks are acquired in the order lock() is called.
   * @param {boolean} wait Should we wait for this lock?  If this is false and the
   * lock is busy this function will throw an error.
   * @param {function} callback Callback function that is called with `callback(err)`
   */
  lock(wait, callback) {
    if (!this._lock) {
      this._lock = true;
      callback(null);
    } else {
      if (wait) {
        this._waiting.push(() => {
          callback(null);
        });
      } else {
        callback(new Error("Couldn't obtain lock!"));
      }
    }
  }

  /**
   * Frees the lock and calls the next waiting promise, if it exists.
   * There are no deferred calls in here, so both callback and promise style
   * code can use this.
   */
  unlock() {
    if (this._waiting.length > 0) {
      const next = this._waiting.shift();
      next();
    } else {
      // Only unlock if we're the last person in the queue to use this
      this._lock = false;
    }
  }
}

module.exports = LocalLock;
