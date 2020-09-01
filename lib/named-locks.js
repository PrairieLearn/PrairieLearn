// @ts-check
const ERR = require('async-stacktrace');
const util = require('util');
const async = require('async');

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

/** @typedef {{ client: import("pg").PoolClient, done: (release?: any) => void }} Lock */
/** @typedef {{ timeout?: number }} Options */

/*
 * The functions here all identify locks by "name", which is a plain
 * string. The locks use the named_locks DB table. Each lock name
 * corresponds to a unique table row. To take a lock, we:
 *     1. make sure a row exists for the lock name
 *     2. start a transaction
 *     3. acquire a "FOR UPDATE" row lock on the DB row for the named
 *        lock (this blocks all other locks on the same row). See
 *        https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS
 *     4. return to the caller with the transaction held open
 *
 * The caller then does some work and finally calls releaseLock(),
 * which ends the transaction, thereby releasing the row lock.
 *
 * The flow above will wait indefinitely for the lock to become
 * available. To implement optional timeouts, we set the DB variable
 * `lock_timeout`:
 * https://www.postgresql.org/docs/current/runtime-config-client.html#GUC-LOCK-TIMEOUT
 * If we timeout then we will return an error to the caller.
 *
 * To implement a no-waiting tryLock() we use the PostgreSQL "SKIP
 * LOCKED" feature:
 * https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE
 * If we fail to acquire the lock then we immediately release the
 * transaction and return to the caller with `lock = null`. In this
 * case the caller should not call releaseLock().
 *
 * The lock object returned by functions in this module are of the
 * form `{client, done}`, where `client` and `done` are sqldb
 * transaction objects. These are simply the objects we need to end
 * the transaction, which will release the lock.
 */

/**
 * Try to acquire a lock and either succeed if it's available or
 * return immediately if not. If a lock is acquired then it must
 * must later be released by releaseLock(). If a lock is not acquired
 * (it is null) then releaseLock() should not be called.
 *
 * @param {string} name The name of the lock to acquire.
 * @param {(err: Error | null, lock: Lock) => void} callback A callback(err, lock) function. If lock is null then it was not acquired.
 */
module.exports.tryLock = function(name, callback) {
    module.exports._getLock(name, { wait: false }, (err, lock) => {
        if (ERR(err, callback)) return;
        callback(null, lock);
    });
};
module.exports.tryLockAsync = util.promisify(module.exports.tryLock);

/**
 * Wait until a lock can be successfully acquired.
 *
 * @param {string} name The name of the lock to acquire.
 * @param {Options} options Optional parameters:
 *                              timeout (how many milliseconds to wait - undefined, null, or
 *                                       anything other than a positive number means forever)
 * @param {(err: Error | null, lock?: Lock) => void} callback A callback(err, lock) function.
 */
module.exports.waitLock = function(name, options, callback) {
    const internalOptions = {
        wait: true,
        timeout: options.timeout || 0,
    };
    module.exports._getLock(name, internalOptions, (err, lock) => {
        if (ERR(err, callback)) return;
        if (lock == null) return callback(new Error('failed to acquire lock'));
        callback(null, lock);
    });
};

module.exports.waitLockAsync = util.promisify(module.exports.waitLock);

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
module.exports._getLock = function(name, options, callback) {
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
                            // could not get the lock, return success with a null lock
                            if (result.rowCount == 0) return callback(null, null);
                            // got the lock, make a lock object and return it
                            const lock = {client, done};
                            callback(null, lock);
                        });
                    },
                ], (err, lock) => {
                    // We need to make sure the transaction is going
                    // to be ended on any code path.
                    if (err) {
                        // Something went wrong, so we end the
                        // transaction and return the error.
                        sqldb.endTransaction(client, done, err, (endErr) => {
                            if (ERR(endErr, callback)) return;
                            callback(err);
                        });
                    } else {
                        if (lock == null) {
                            // We didn't acquire the lock so our
                            // parent caller will never release it, so
                            // we have to end the transaction now.
                            sqldb.endTransaction(client, done, err, (endErr) => {
                                if (ERR(endErr, callback)) return;
                                callback(null, null);
                            });
                        } else {
                            // We successfully acquired the lock, so
                            // we return with the transaction held
                            // open. The caller will later call
                            // releaseLock() to end the transaction.
                            callback(null, lock);
                        }
                    }
                });
            });
        });
    });
};
