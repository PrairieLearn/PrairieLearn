const ERR = require('async-stacktrace');
const _ = require('lodash');
const pg = require('pg');
const path = require('path');
const debug = require('debug')('prairielib:' + path.basename(__filename, '.js'));
const { promisify } = require('util');

const error = require('./error');

let searchSchema = null;

/**
 * Formats a string for debugging.
 *
 * @param {string} s
 * @returns string
 */
function debugString(s) {
    if (!_.isString(s)) return 'NOT A STRING';
    s = s.replace(/\n/g, '\\n');
    if (s.length > 78) s = s.substring(0, 75) + '...';
    s = '"' + s + '"';
    return s;
}

/**
 * Formats a set of params for debugging.
 *
 * @param {Params} params
 * @returns string
 */
function debugParams(params) {
    let s;
    try {
        s = JSON.stringify(params);
    } catch (err) {
        s = 'CANNOT JSON STRINGIFY';
    }
    return debugString(s);
}

/**
 * Given an SQL string and params, creates an array of params and an SQL string
 * with any named dollar-sign placeholders replaced with parameters.
 *
 * @param {String} sql
 * @param {Params} params
 * @param {(error: Error | null, processedSql: string, paramsArray: any[])} callback
 */
function paramsToArray(sql, params, callback) {
    if (!_.isString(sql)) return callback(new Error('SQL must be a string'));
    if (_.isArray(params)) return callback(null, sql, params);
    if (!_.isObjectLike(params)) return callback(new Error('params must be array or object'));
    const re = /\$([-_a-zA-Z0-9]+)/;
    let result;
    let processedSql = '';
    let remainingSql = sql;
    let nParams = 0;
    const map = {};
    let paramsArray = [];
    while ((result = re.exec(remainingSql)) !== null) {
        const v = result[1];
        if (!_(map).has(v)) {
            if (!_(params).has(v)) return callback(new Error('Missing parameter: ' + v));
            if (_.isArray(params[v])) {
                map[v] = 'ARRAY[' + _.map(_.range(nParams + 1, nParams + params[v].length + 1), function(n) {return '$' + n;}).join(',') + ']';
                nParams += params[v].length;
                paramsArray = paramsArray.concat(params[v]);
            } else {
                nParams++;
                map[v] = '$' + nParams;
                paramsArray.push(params[v]);
            }
        }
        processedSql += remainingSql.substring(0, result.index) + map[v];
        remainingSql = remainingSql.substring(result.index + result[0].length);
    }
    processedSql += remainingSql;
    remainingSql = '';
    callback(null, processedSql, paramsArray);
}

/**
 * The pool from which clients will be acquired.
 * @type { import("pg").Pool }
 */
let pool = null;

/** @typedef {{[key: string]: any} | any[]} Params */
/** @typedef {(error: Error | null, result: import("pg").QueryResult) => void} ResultsCallback */

/**
 * Creates a new connection pool and attempts to connect to the database.
 *
 * @param { import("pg").PoolConfig } pgConfig - The config object for Postgres
 * @param {(error: Error, client: import("pg").PoolClient) => void} idleErrorHandler - A handler for async errors
 * @param {(error: Error | null) => void} callback - Callback once the connection is initialized
 */
module.exports.init = function(pgConfig, idleErrorHandler, callback) {
    try {
        pool = new pg.Pool(pgConfig);
    } catch (err) {
        error.addData(err, {pgConfig: pgConfig});
        callback(err);
        return;
    }
    pool.on('error', function(err, client) {
        idleErrorHandler(err, client);
    });
    pool.on('connect', (client) => {
        client.on('error', (err) => {
            idleErrorHandler(err, client);
        });
    });

    let retryCount = 0;
    const retryTimeouts = [500, 1000, 2000, 5000, 10000];
    const tryConnect = () => {
        pool.connect((err, client, done) => {
            if (err) {
                if (client) {
                    done(client);
                }

                if (retryCount >= retryTimeouts.length) {
                    err.message = `Couldn't connect to Postgres after ${retryTimeouts.length} retries: ${err.message}`;
                    callback(err);
                    return;
                }

                const timeout = retryTimeouts[retryCount];
                retryCount++;
                setTimeout(tryConnect, timeout);
            } else {
                done();
                callback(null);
            }
        });
    };
    tryConnect();
};

/**
 * Creates a new connection pool and attempts to connect to the database.
 */
module.exports.initAsync = promisify(module.exports.init);

/**
 * Closes the connection pool.
 *
 * @param {(error: Error | null) => void} callback
 */
module.exports.close = function(callback) {
    if (!pool) {
        return callback(null);
    }
    pool.end((err) => {
        if (ERR(err, callback)) return;
        pool = null;
        callback(null);
    });
};

/**
 * Closes the connection pool.
 */
module.exports.closeAsync = promisify(module.exports.close);

/**
 * Gets a new client from the connection pool. If `err` is not null
 * then `client` and `done` are undefined. If `err` is null then
 * `client` is valid and can be used. The caller MUST call
 * `done(client)` to release the client, whether or not errors occured
 * while using `client`.
 *
 * @param {(error: Error | null, client: import("pg").PoolClient, done: (release?: any) => void) => void} callback
 */
module.exports.getClient = function(callback) {
    if (!pool) {
        return callback(new Error('Connection pool is not open'));
    }
    pool.connect(function(err, client, done) {
        if (err) {
            if (client) {
                done(client);
            }
            return ERR(err, callback); // unconditionally return
        }
        if (searchSchema != null) {
            const setSearchPathSql = `SET search_path TO ${client.escapeIdentifier(searchSchema)},public`;
            module.exports.queryWithClient(client, setSearchPathSql, {}, (err) => {
                if (err) {
                    done(client);
                    return ERR(err, callback); // unconditionally return
                }
                callback(null, client, done);
            });
        } else {
            callback(null, client, done);
        }
    });
};

/**
 * Set the schema to use for the search path.
 *
 * @param {string} schema - The schema name to use (can be "null" to unset the search path)
 * @param {(error: Error | null) => void} callback
 */
module.exports.setSearchSchema = function(schema, callback) {
    searchSchema = schema;
    if (schema == null) return;
    /* Note that as of 2021-06-29 escapeIdentifier() is undocumented. See:
     * https://github.com/brianc/node-postgres/pull/396
     * https://github.com/brianc/node-postgres/issues/1978
     * https://www.postgresql.org/docs/12/sql-syntax-lexical.html
     */
    module.exports.query(`CREATE SCHEMA IF NOT EXISTS ${pg.Client.prototype.escapeIdentifier(schema)}`, [], (err) => {
        if (ERR(err, callback)) return;
        callback(null);
    });
};

/**
 * Get the schema that is currently used for the search path.
 *
 * @return {string} schema in use (may be "null" to indicate no schema)
 */
module.exports.getSearchSchema = function() {
    return searchSchema;
};

/**
 * Generate, set, and return a random schema name.
 *
 * @param {string} prefix - The prefix of the new schema, only the first 28 characters will be used.
 * @param {(error: Error | null, schema: String) => void} callback
 */
module.exports.setRandomSearchSchema = function(prefix, callback) {
    // truncated prefix (max 28 characters)
    const truncPrefix = prefix.substring(0, 28);
    // 27-character timestamp in format YYYY-MM-DDTHH-MM-SS-SSSZ
    const timestamp = (new Date()).toISOString().replace(/-/g, '_').replace(/:/g, '_').replace(/[.]/g, '_');
    // random 6-character suffix to avoid clashes (approx 2 billion values)
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const suffix = _.times(6, function() {return _.sample(chars);}).join('');

    // schema is guaranteed to have length at most 63 (= 28 + 1 + 27 + 1 + 6)
    // which is the default PostgreSQL identifier limit
    const schema = `${truncPrefix}_${timestamp}_${suffix}`;
    module.exports.setSearchSchema(schema, (err) => {
        if (ERR(err, callback)) return;
        callback(null, schema);
    });
};

/**
 * Gets a new client from the connection pool.
 *
 * @returns {Promise<{client: import("pg").PoolClient, done: (release?: any) => void}>}
 */
module.exports.getClientAsync = function() {
    return new Promise((resolve, reject) => {
        module.exports.getClient((err, client, done) => {
            if (err) {
                reject(err);
            } else {
                resolve({ client, done });
            }
        });
    });
};

/**
 * Performs a query with the given client.
 *
 * @param { import("pg").PoolClient } client - The client with which to execute the query
 * @param {String} sql - The SQL query to execute
 * @param {Params} params
 */
module.exports.queryWithClient = function(client, sql, params, callback) {
    debug('queryWithClient()', 'sql:', debugString(sql));
    debug('queryWithClient()', 'params:', debugParams(params));
    paramsToArray(sql, params, function(err, newSql, newParams) {
        if (err) err = error.addData(err, {sql: sql, sqlParams: params});
        if (ERR(err, callback)) return;
        client.query(newSql, newParams, function(err, result) {
            if (err) {
                const sqlError = JSON.parse(JSON.stringify(err));
                sqlError.message = err.message;
                err = error.addData(err, {sqlError: sqlError, sql: sql, sqlParams: params, result: result});
            }
            if (ERR(err, callback)) return;
            debug('queryWithClient() success', 'rowCount:', result.rowCount);
            callback(null, result);
        });
    });
};

/**
 * Performs a query with the given client.
 */
module.exports.queryWithClientAsync = promisify(module.exports.queryWithClient);

/**
 * Performs a query with the given client. Errors if the query returns more
 * than one row.
 *
 * @param { import("pg").PoolClient } client - The client with which to execute the query
 * @param {String} sql - The SQL query to execute
 * @param {Params} params
 * @param {ResultsCallback} callback
 */
module.exports.queryWithClientOneRow = function(client, sql, params, callback) {
    debug('queryWithClientOneRow()', 'sql:', debugString(sql));
    debug('queryWithClientOneRow()', 'params:', debugParams(params));
    module.exports.queryWithClient(client, sql, params, function(err, result) {
        if (ERR(err, callback)) return;
        if (result.rowCount !== 1) {
            const data = {sql: sql, sqlParams: params, result: result};
            return callback(error.makeWithData('Incorrect rowCount: ' + result.rowCount, data));
        }
        debug('queryWithClientOneRow() success', 'rowCount:', result.rowCount);
        callback(null, result);
    });
};

/**
 * Performs a query with the given client. Errors if the query returns more
 * than one row.
 */
module.exports.queryWithClientOneRowAsync = promisify(module.exports.queryWithClientOneRow);

/**
 * Performs a query with the given client. Errors if the query returns more
 * than one row.
 * @param { import("pg").PoolClient } client - The client with which to execute the query
 * @param {String} sql - The SQL query to execute
 * @param {Params} params
 * @param {ResultsCallback} callback
 */
module.exports.queryWithClientZeroOrOneRow = function(client, sql, params, callback) {
    debug('queryWithClientZeroOrOneRow()', 'sql:', debugString(sql));
    debug('queryWithClientZeroOrOneRow()', 'params:', debugParams(params));
    module.exports.queryWithClient(client, sql, params, function(err, result) {
        if (ERR(err, callback)) return;
        if (result.rowCount > 1) {
            const data = {sql: sql, sqlParams: params, result: result};
            return callback(error.makeWithData('Incorrect rowCount: ' + result.rowCount, data));
        }
        debug('queryWithClientZeroOrOneRow() success', 'rowCount:', result.rowCount);
        callback(null, result);
    });
};

/**
 * Performs a query with the given client. Errors if the query returns more
 * than one row.
 */
module.exports.queryWithClientZeroOrOneRowAsync = promisify(module.exports.queryWithClientZeroOrOneRow);

/**
 * Rolls back the current transaction for the given client.
 *
 * @param {import("pg").PoolClient} client
 * @param {(release?: any) => void} done
 * @param {(err: Error | null) => void} callback
 */
module.exports.rollbackWithClient = function(client, done, callback) {
    debug('rollbackWithClient()');
    // from https://github.com/brianc/node-postgres/wiki/Transactions
    client.query('ROLLBACK;', function(err) {
        //if there was a problem rolling back the query
        //something is seriously messed up.  Return the error
        //to the done function to close & remove this client from
        //the pool.  If you leave a client in the pool with an unaborted
        //transaction weird, hard to diagnose problems might happen.
        done(err);
        if (ERR(err, callback)) return;
        callback(null);
    });
};

/**
 * Rolls back the current transaction for the given client.
 */
module.exports.rollbackWithClientAsync = promisify(module.exports.rollbackWithClient);

/**
 * Begins a new transaction.
 *
 * @param {(err: Error | null, client?: import("pg").PoolClient, done?: (release?: any) => void) => void} callback
 */
module.exports.beginTransaction = function(callback) {
    debug('beginTransaction()');
    module.exports.getClient(function(err, client, done) {
        if (ERR(err, callback)) return;
        module.exports.queryWithClient(client, 'START TRANSACTION;', [], function(err) {
            if (err) {
                module.exports.rollbackWithClient(client, done, function(rollbackErr) {
                    if (ERR(rollbackErr, callback)) return;
                    return ERR(err, callback);
                });
            } else {
                callback(null, client, done);
            }
        });
    });
};

/**
 * Begins a new transation.
 *
 * @returns {Promise<{client: import("pg").PoolClient, done: (release?: any) => void}>}
 */
module.exports.begiTransactionAsync = function() {
    return new Promise((resolve, reject) => {
        module.exports.beginTransaction((err, client, done) => {
            if (err) {
                reject(err);
            } else {
                resolve({ client, done });
            }
        });
    });
};

/**
 * Commits the transaction if err is null, otherwize rollbacks the transaction.
 * Also releasese the client.
 *
 * @param { import("pg").PoolClient } client
 * @param {(rollback?: any) => void} done
 * @param {Error | null} err
 * @param {(error: Error | null) => void} callback
 */
module.exports.endTransaction = function(client, done, err, callback) {
    debug('endTransaction()');
    if (err) {
        module.exports.rollbackWithClient(client, done, function(rollbackErr) {
            if (rollbackErr) {
                rollbackErr = error.addData(rollbackErr, {prevErr: err, rollback: 'fail'});
                return ERR(rollbackErr, callback);
            }
            err = error.addData(err, {rollback: 'success'});
            ERR(err, callback);
        });
    } else {
        module.exports.queryWithClient(client, 'COMMIT', [], function(err, _result) {
            if (err) {
                done();
                return ERR(err, callback); // unconditionally return
            }
            done();
            callback(null);
        });
    }
};

/**
 * Commits the transaction if err is null, otherwize rollbacks the transaction.
 * Also releasese the client.
 */
module.exports.endTransactionAsync = promisify(module.exports.endTransaction);

/**
 * Executes a query with the specified parameters.
 *
 * @param {string} sql - The SQL query to execute
 * @param {Params} params - The params for the query
 * @param {ResultsCallback} callback
 */
module.exports.query = function(sql, params, callback) {
    debug('query()', 'sql:', debugString(sql));
    debug('query()', 'params:', debugParams(params));
    if (!pool) {
        return callback(new Error('Connection pool is not open'));
    }
    pool.connect(function(err, client, done) {
        const handleError = function(err) {
            if (!err) return false;
            if (client) {
                done(client);
            }
            const sqlError = JSON.parse(JSON.stringify(err));
            sqlError.message = err.message;
            err = error.addData(err, {sqlError: sqlError, sql: sql, sqlParams: params});
            ERR(err, callback);
            return true;
        };
        if (handleError(err)) return;

        const setSearchPath = function(callback) {
            if (searchSchema != null) {
                const setSearchPathSql = `SET search_path TO ${client.escapeIdentifier(searchSchema)},public`;
                module.exports.queryWithClient(client, setSearchPathSql, {}, (err) => {
                    if (err) {
                        if (client) {
                            done(client);
                        }
                        return ERR(err, callback); // unconditionally return
                    }
                    callback(null);
                });
            } else {
                callback(null);
            }
        };

        setSearchPath(function (err) {
            if (ERR(err, callback)) return;
            paramsToArray(sql, params, function(err, newSql, newParams) {
                if (err) err = error.addData(err, {sql: sql, sqlParams: params});
                if (ERR(err, callback)) return;
                client.query(newSql, newParams, function(err, result) {
                    if (handleError(err)) return;
                    done();
                    debug('query() success', 'rowCount:', result.rowCount);
                    callback(null, result);
                });
            });
        });
    });
};

/**
 * Executes a query with the specified parameters.
 */
module.exports.queryAsync = promisify(module.exports.query);

/**
 * Executes a query with the specified parameters. Errors if the query does
 * not return exactly one row.
 *
 * @param {string} sql - The SQL query to execute
 * @param {Params} params - The params for the query
 * @param {ResultsCallback} callback
 */
module.exports.queryOneRow = function(sql, params, callback) {
    debug('queryOneRow()', 'sql:', debugString(sql));
    debug('queryOneRow()', 'params:', debugParams(params));
    module.exports.query(sql, params, function(err, result) {
        if (ERR(err, callback)) return;
        if (result.rowCount !== 1) {
            const data = {sql: sql, sqlParams: params};
            return callback(error.makeWithData('Incorrect rowCount: ' + result.rowCount, data));
        }
        debug('queryOneRow() success', 'rowCount:', result.rowCount);
        callback(null, result);
    });
};

/**
 * Executes a query with the specified parameters. Errors if the query does
 * not return exactly one row.
 */
module.exports.queryOneRowAsync = promisify(module.exports.queryOneRow);

/**
 * Executes a query with the specified parameters. Errors if the query
 * returns more than one row.
 *
 * @param {string} sql - The SQL query to execute
 * @param {Params} params - The params for the query
 * @param {ResultsCallback} callback
 */
module.exports.queryZeroOrOneRow = function(sql, params, callback) {
    debug('queryZeroOrOneRow()', 'sql:', debugString(sql));
    debug('queryZeroOrOneRow()', 'params:', debugParams(params));
    module.exports.query(sql, params, function(err, result) {
        if (ERR(err, callback)) return;
        if (result.rowCount > 1) {
            const data = {sql: sql, sqlParams: params};
            return callback(error.makeWithData('Incorrect rowCount: ' + result.rowCount, data));
        }
        debug('queryZeroOrOneRow() success', 'rowCount:', result.rowCount);
        callback(null, result);
    });
};

/**
 * Executes a query with the specified parameters. Errors if the query
 * returns more than one row.
 */
module.exports.queryZeroOrOneRowAsync = promisify(module.exports.queryZeroOrOneRow);

/**
 * Calls the given function with the specified parameters.
 *
 * @param {string} functionName - The name of the function to call
 * @param {any[]} params - The params for the function
 * @param {ResultsCallback} callback
 */
module.exports.call = function(functionName, params, callback) {
    debug('call()', 'function:', functionName);
    debug('call()', 'params:', debugParams(params));
    const placeholders = _.map(_.range(1, params.length + 1), v => '$' + v).join();
    const sql = 'SELECT * FROM ' + functionName + '(' + placeholders + ')';
    module.exports.query(sql, params, function(err, result) {
        if (ERR(err, callback)) return;
        debug('call() success', 'rowCount:', result.rowCount);
        callback(null, result);
    });
};

/**
 * Calls the given function with the specified parameters.
 */
module.exports.callAsync = promisify(module.exports.call);

/**
 * Calls the given function with the specified parameters. Errors if the
 * function does not return exactly one row.
 *
 * @param {string} functionName - The name of the function to call
 * @param {Params} params - The params for the function
 * @param {ResultsCallback} callback
 */
module.exports.callOneRow = function(functionName, params, callback) {
    debug('callOneRow()', 'function:', functionName);
    debug('callOneRow()', 'params:', debugParams(params));
    module.exports.call(functionName, params, function(err, result) {
        if (ERR(err, callback)) return;
        if (result.rowCount !== 1) {
            const data = {functionName: functionName, sqlParams: params};
            return callback(error.makeWithData('Incorrect rowCount: ' + result.rowCount, data));
        }
        debug('callOneRow() success', 'rowCount:', result.rowCount);
        callback(null, result);
    });
};

/**
 * Calls the given function with the specified parameters. Errors if the
 * function does not return exactly one row.
 */
module.exports.callOneRowAsync = promisify(module.exports.callOneRow);

/**
 * Calls the given function with the specified parameters. Errors if the
 * function returns more than one row.
 *
 * @param {string} functionName - The name of the function to call
 * @param {Params} params - The params for the function
 * @param {ResultsCallback} callback
 */
module.exports.callZeroOrOneRow = function(functionName, params, callback) {
    debug('callZeroOrOneRow()', 'function:', functionName);
    debug('callZeroOrOneRow()', 'params:', debugParams(params));
    module.exports.call(functionName, params, function(err, result) {
        if (ERR(err, callback)) return;
        if (result.rowCount > 1) {
            const data = {functionName: functionName, sqlParams: params};
            return callback(error.makeWithData('Incorrect rowCount: ' + result.rowCount, data));
        }
        debug('callZeroOrOneRow() success', 'rowCount:', result.rowCount);
        callback(null, result);
    });
};

/**
 * Calls the given function with the specified parameters. Errors if the
 * function returns more than one row.
 */
module.exports.callZeroOrOneRowAsync = promisify(module.exports.callZeroOrOneRow);

/**
 * Calls a function with the specified parameters using a specific client.
 *
 * @param { import("pg").PoolClient } client
 * @param {string} functionName
 * @param {Params} params
 * @param {ResultsCallback} callback
 */
module.exports.callWithClient = function(client, functionName, params, callback) {
    debug('callWithClient()', 'function:', functionName);
    debug('callWithClient()', 'params:', debugParams(params));
    const placeholders = _.map(_.range(1, params.length + 1), v => '$' + v).join();
    const sql = 'SELECT * FROM ' + functionName + '(' + placeholders + ')';
    module.exports.queryWithClient(client, sql, params, function(err, result) {
        if (ERR(err, callback)) return;
        debug('callWithClient() success', 'rowCount:', result.rowCount);
        callback(null, result);
    });
};

/**
 * Calls a function with the specified parameters using a specific client.
 */
module.exports.callWithClientAsync = promisify(module.exports.callWithClient);

/**
 * Calls a function with the specified parameters using a specific client.
 * Errors if the function does not return exactly one row.
 *
 * @param { import("pg").PoolClient } client
 * @param {string} functionName
 * @param {Params} params
 * @param {ResultsCallback} callback
 */
module.exports.callWithClientOneRow = function(client, functionName, params, callback) {
    debug('callWithClientOneRow()', 'function:', functionName);
    debug('callWithClientOneRow()', 'params:', debugParams(params));
    const placeholders = _.map(_.range(1, params.length + 1), v => '$' + v).join();
    const sql = 'SELECT * FROM ' + functionName + '(' + placeholders + ')';
    module.exports.queryWithClient(client, sql, params, function(err, result) {
        if (ERR(err, callback)) return;
        if (result.rowCount !== 1) {
            const data = {functionName: functionName, sqlParams: params};
            return callback(error.makeWithData('Incorrect rowCount: ' + result.rowCount, data));
        }
        debug('callWithClientOneRow() success', 'rowCount:', result.rowCount);
        callback(null, result);
    });
};

/**
 * Calls a function with the specified parameters using a specific client.
 * Errors if the function does not return exactly one row.
 */
module.exports.callWithClientOneRowAsync = promisify(module.exports.callWithClientOneRow);

/**
 * Calls a function with the specified parameters using a specific client.
 * Errors if the function returns more than one row.
 *
 * @param { import("pg").PoolClient } client
 * @param {string} functionName
 * @param {Params} params
 * @param {ResultsCallback} callback
 */
module.exports.callWithClientZeroOrOneRow = function(client, functionName, params, callback) {
    debug('callWithClientZeroOrOneRow()', 'function:', functionName);
    debug('callWithClientZeroOrOneRow()', 'params:', debugParams(params));
    const placeholders = _.map(_.range(1, params.length + 1), v => '$' + v).join();
    const sql = 'SELECT * FROM ' + functionName + '(' + placeholders + ')';
    module.exports.queryWithClient(client, sql, params, function(err, result) {
        if (ERR(err, callback)) return;
        if (result.rowCount > 1) {
            const data = {functionName: functionName, sqlParams: params};
            return callback(error.makeWithData('Incorrect rowCount: ' + result.rowCount, data));
        }
        debug('callWithClientZeroOrOneRow() success', 'rowCount:', result.rowCount);
        callback(null, result);
    });
};

/**
 * Calls a function with the specified parameters using a specific client.
 * Errors if the function returns more than one row.
 */
module.exports.callWithClientZeroOrOneRowAsync = promisify(module.exports.callWithClientZeroOrOneRow);
