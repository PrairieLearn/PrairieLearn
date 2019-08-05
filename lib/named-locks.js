const ERR = require('async-stacktrace');
const async = require('async');

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

/*
 * The lock object returned by functions in this module are of the
 * form `{client, done}`, where `client` and `done` are sqldb
 * transaction objects.
 */

module.exports = {
    /**
     * Try to acquire a lock and either succeed if it's available or
     * return immediately if not. If a lock is acquired then it must
     * later be released by releaseLock().
     *
     * @param {string} name - The name of the lock to acquire.
     * @param {function} callback - A callback(err, lock) function. If lock is null then it was not acquired.
     */
    tryLock(name, callback) {
        this._getLock(name, {wait: false}, (err, lock) => {
            if (ERR(err, callback)) return;
            callback(null, lock);
        });
    },

    /**
     * Wait until a lock can be successfully acquired.
     *
     * @param {string} name - The name of the lock to acquire.
     * @param {object} options - Optional parameters:
     *                              timeout (how many milliseconds to wait - undefined, null, or
     *                                       anything other than a positive number means forever)
     * @param {function} callback - A callback(err, lock) function.
     */
    waitLock(name, options, callback) {
        options = options || {};
        options.wait = true;
        this._getLock(name, options, (err, lock) => {
            if (ERR(err, callback)) return;
            if (lock == null) return callback(new Error('failed to acquire lock'));
            callback(null, lock);
        });
    },

    /**
     * Release a lock.
     *
     * @param {object} lock - The previously acquired lock.
     * @param {function} callback - A callback(err) function.
     */
    releaseLock(lock, callback) {
        if (lock == null) return callback(new Error('lock is null'));
        sqldb.endTransaction(lock.client, lock.done, null, (err) => {
            if (ERR(err, callback)) return;
            callback(null);
        });
    },

    /**
     * Internal helper function to get a lock with optional
     * waiting. Do not call directly, but use tryLock() or waitLock()
     * instead.
     *
     * @param {string} name - The name of the lock to acquire.
     * @param {object} options - Optional parameters.
     * @param {function} callback - A callback(err, lock) function.
     */
    _getLock(name, options, callback) {
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
    },
};
