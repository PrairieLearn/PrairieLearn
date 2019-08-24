// @ts-check
const ERR = require('async-stacktrace');
const async = require('async');
const util = require('util');

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

/** @typedef {{ client: import("pg").PoolClient, done: (release?: any) => void }} Lock */
/** @typedef {{ timeout?: number }} Optionsss */

/**
 * Try to acquire a lock and either succeed if it's available or
 * return immediately if not. If a lock is acquired then it must
 * later be released by releaseLock().
 *
 * @param {string} name The name of the lock to acquire.
 * @param {(err: Error | null, lock: Lock) => void} callback A callback(err, lock) function. If lock is null then it was not acquired.
 */
module.exports.tryLock = function(name, callback) {
    _getLock(name, { wait: false }, (err, lock) => {
        if (ERR(err, callback)) return;
        callback(null, lock);
    });
};

module.exports.tryLockAsync = util.promisify(module.exports.tryLock);

/**
 * Wait until a lock can be successfully acquired.
 *
 * @param {string} name The name of the lock to acquire.
 * @param {{ timeout?: number }} options Optional parameters:
 *                              timeout (how many milliseconds to wait - undefined, null, or
 *                                       anything other than a positive number means forever)
 * @param {(err: Error | null, lock?: Lock) => void} callback A callback(err, lock) function.
 */
module.exports.waitLock = function(name, options, callback) {
    const internalOptions = {
        wait: true,
        timeout: options.timeout || 0,
    };
    _getLock(name, internalOptions, (err, lock) => {
        if (ERR(err, callback)) return;
        if (lock == null) return callback(new Error('failed to acquire lock'));
        callback(null, lock);
    });
};

module.exports.waitLockAsync = util.promisify(module.exports.waitLock);

/**
 * Convenience function to do some unit of work with a lock. Automatically
 * releases the lock once `acquiredCallback` finishes executing. If the lock
 * could not be acquired, `failedCallback` is called with the error.
 * 
 * @param {string} name The name of the lock to acquire
 * @param {(lock: Lock) => Promise<void>} acquiredCallback
 * @param {(err: Error | null) => void} failedCallback
 */
module.exports.doWithLockAsync = async function(name, acquiredCallback, failedCallback) {
    let lock;
    try {
        lock = await this.tryLockAsync(name);
    } catch (e) {
        await failedCallback(e);
        return;
    }

    let callbackErr;
    try {
        await acquiredCallback(lock);
    } catch (e) {
        callbackErr = e;
    }

    await this.releaseLockAsync(lock);
    if (callbackErr) {
        throw callbackErr;
    }
};

/**
 * Release a lock.
 *
 * @param {Lock} lock - The previously acquired lock.
 * @param {(err: Error | null) => void} callback - A callback(err) function.
 */
module.exports.releaseLock = function(lock, callback) {
    if (lock == null) return callback(new Error('lock is null'));
    sqldb.endTransaction(lock.client, lock.done, null, (err) => {
        if (ERR(err, callback)) return;
        callback(null);
    });
};

module.exports.releaseLockAsync = util.promisify(module.exports.releaseLock);

/**
 * Internal helper function to get a lock with optional
 * waiting. Do not call directly, but use tryLock() or waitLock()
 * instead.
 *
 * @param {string} name The name of the lock to acquire.
 * @param {{ wait?: boolean, timeout?: number }} options Optional parameters.
 * @param {(err: Error | null, lock?: Lock) => void} callback A callback(err, lock) function.
 */
function _getLock(name, options, callback) {
    options = options || {};
    sqldb.query(sql.ensure_named_locks_table, {name}, (err, _result) => {
        if (ERR(err, callback)) return;
        const lock_sql = options.wait ? sql.lock_row_wait : sql.lock_row_nowait;
        sqldb.query(sql.ensure_named_lock_row, {name}, (err, _result) => {
            if (ERR(err, callback)) return;
            sqldb.beginTransaction((err, client, done) => {
                if (ERR(err, callback)) return;
                async.waterfall([
                    (callback) => {
                        if (options.wait && (options.timeout > 0)) {
                            sqldb.callWithClient(client, 'lock_timeout_set', [options.timeout], (err) => {
                                if (ERR(err, callback)) return;
                                callback(null);
                            });
                        } else {
                            callback(null);
                        }
                    },
                    (callback) => {
                        sqldb.queryWithClient(client, lock_sql, {name}, (err, result) => {
                            if (ERR(err, callback)) return;
                            // could not get the lock
                            if (result.rowCount == 0) return callback(new Error('could not get the lock'));
                            // got the lock, make a lock object and return it
                            const lock = {client, done};
                            callback(null, lock);
                        });
                    },
                ], (err, lock) => {
                    if (err) {
                        sqldb.endTransaction(client, done, err, (endErr) => {
                            if (ERR(endErr, callback)) return;
                            callback(err);
                        });
                    } else {
                        callback(null, lock);
                    }
                });
            });
        });
    });
}
