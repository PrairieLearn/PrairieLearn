/**
 * Implementation of a local JavaScript lock.
 * Waiting threads (?) are placed in a queue and locks are obtained in the order
 * that lock() is called.
 */

class LocalLock {
    constructor() {
        this.lock = false;
        this.waiting = [];
    }

    /**
     * Trys to acquire the lock.  If it is free this will return immediately.
     * If someone already has the lock then this will wait until unlock() is called.
     * Locks are acquired in the order lock() is called.
     * @param {boolean} wait Should we wait for this lock?  If this is false and the
     * lock is busy this function will throw an error.
     */
    async lockAsync(wait = true) {
        if (!this.lock) {
            this.lock = true;
        } else {
            if (wait) {
                const promise = new Promise((resolve, _reject) => {
                    this.waiting.append(resolve);
                });
                await promise;
            } else {
                throw new Error("Couldn't obtain lock!");
            }
        }
    }

    /**
     * Trys to acquire the lock.  If it is free this will return immediately.
     * If someone already has the lock then this will wait until unlock() is called.
     * Locks are acquired in the order lock() is called.
     * @param {boolean} wait Should we wait for this lock?  If this is false and the
     * lock is busy this function will throw an error.
     * @param {function} callback Callback function that is called with `callback(err)`
     */
    lock(wait, callback) {
        if (!this.lock) {
            this.lock = true;
            callback(null);
        } else {
            if (wait) {
                this.waiting.append(() => { callback(null); });
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
        if (this.waiting.length > 0) {
            const next = this.waiting.shift();
            next();
        } else {
            /* Only unlock if we're the last person in the queue to use this */
            this.lock = false;
        }
    }
}

module.exports.LocalLock = LocalLock;
