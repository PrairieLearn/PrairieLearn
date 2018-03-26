const ERR = require('async-stacktrace');

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
        this._getLock(name, false, (err, lock) => {
            if (ERR(err, callback)) return;
            callback(null, lock);
        });
    },

    /**
     * Wait until a lock can be successfully acquired.
     *
     * @param {string} name - The name of the lock to acquire.
     * @param {function} callback - A callback(err, lock) function.
     */
    waitLock(name, callback) {
        this._getLock(name, true, (err, lock) => {
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
     * @param {boolean} wait - Whether to wait for the lock.
     * @param {function} callback - A callback(err, lock) function.
     */
    _getLock(name, wait, callback) {
        sqldb.query(sql.ensure_named_locks_table, {name}, (err, _result) => {
            if (ERR(err, callback)) return;

            const lock_sql = wait ? sql.lock_row_wait : sql.lock_row_nowait;
            sqldb.query(sql.ensure_named_lock_row, {name}, (err, _result) => {
                if (ERR(err, callback)) return;
                sqldb.beginTransaction((err, client, done) => {
                    if (ERR(err, callback)) return;

                    sqldb.queryWithClient(client, lock_sql, {name}, (err, result) => {
                        if (err) {
                            // something went wrong, end the transaction
                            sqldb.endTransaction(client, done, err, (endErr) => {
                                if (ERR(endErr, callback)) return;
                                callback(err);
                            });
                        } else {
                            if (result.rowCount == 0) {
                                // could not get the lock, end the transaction
                                sqldb.endTransaction(client, done, null, (err) => {
                                    if (ERR(err, callback)) return;
                                    callback(null, null);
                                });
                            } else {
                                // got the lock, make a lock object and return it
                                const lock = {client, done};
                                callback(null, lock);
                            }
                        }
                    });
                });
            });
        });
    },
};
