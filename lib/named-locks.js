// @ts-check
const util = require('util');

const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');

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
 * @returns {Promise<Lock | null>}
 */
module.exports.tryLockAsync = async function(name) {
    return getLock(name, { wait: false });
};

module.exports.tryLock = util.callbackify(module.exports.tryLockAsync);

/**
 * Wait until a lock can be successfully acquired.
 *
 * @param {string} name The name of the lock to acquire.
 * @param {Options} options Optional parameters:
 *                              timeout (how many milliseconds to wait - undefined, null, or
 *                                       anything other than a positive number means forever)
 */
module.exports.waitLockAsync = async function(name, options) {
    const internalOptions = {
        wait: true,
        timeout: options.timeout || 0,
    };

    const lock = await getLock(name, internalOptions);
    if (lock == null) throw new Error(`failed to acquire lock: ${name}`);
    return lock;
};

module.exports.waitLock = util.callbackify(module.exports.waitLockAsync);

/**
 * Release a lock.
 *
 * @param {Lock} lock - The previously acquired lock.
 */
module.exports.releaseLockAsync = async function(lock) {
    if (lock == null) throw new Error('lock is null');
    await sqldb.endTransactionAsync(lock.client, null);
};

module.exports.releaseLock = util.callbackify(module.exports.releaseLockAsync);

/**
 * Internal helper function to get a lock with optional
 * waiting. Do not call directly, but use tryLock() or waitLock()
 * instead.
 *
 * @param {string} name The name of the lock to acquire.
 * @param {{ wait?: boolean, timeout?: number }} options Optional parameters.
 */
async function getLock(name, options) {
    options = options || {};
    // TODO: we should try to ensure this only happens at most once per
    // process; currently, we ensure the table exists every single time that
    // we try to acquire a lock.
    await sqldb.queryAsync(sql.ensure_named_locks_table, {name});

    await sqldb.queryAsync(sql.ensure_named_lock_row, {name});

    const client = await sqldb.beginTransactionAsync();

    let acquiredLock = false;
    try {
        if (options.wait && (options.timeout > 0)) {
            await sqldb.callWithClientAsync(client, 'lock_timeout_set', [options.timeout]);
        }

        const lock_sql = options.wait ? sql.lock_row_wait : sql.lock_row_nowait;
        const result = await sqldb.queryWithClientAsync(client, lock_sql, {name});
        acquiredLock = (result.rowCount === 1);
    } catch (err) {
        // Something went wrong, so we end the transaction and re-throw the
        // error.
        await sqldb.endTransactionAsync(client, err);
        throw err;
    }

    if (!acquiredLock) {
        // We didn't acquire the lock so our parent caller will never
        // release it, so we have to end the transaction now.
        await sqldb.endTransactionAsync(client, null);
        return null;
    }

    // We successfully acquired the lock, so we return with the transaction
    // help open. The caller will be responsible for releasing the lock and
    // ending the transaction.
    return { client, done: client.release };
}
