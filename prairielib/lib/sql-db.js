// @ts-check
const ERR = require('async-stacktrace');
const _ = require('lodash');
const pg = require('pg');
const path = require('path');
const debug = require('debug')('prairielib:' + path.basename(__filename, '.js'));
const { promisify, callbackify } = require('util');

const error = require('./error');

let searchSchema = null;

const SEARCH_SCHEMA = Symbol('SEARCH_SCHEMA');

/** @typedef {{[key: string]: any} | any[]} Params */
/** @typedef {import("pg").QueryResult} QueryResult */
/** @typedef {(error: Error | null, result?: QueryResult) => void} ResultsCallback */

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
 * @param {string} sql
 * @param {Params} params
 * @returns {{ processedSql: string, paramsArray: any }}
 */
function paramsToArray(sql, params) {
    if (typeof sql !== 'string') throw new Error('SQL must be a string');
    if (Array.isArray(params)) {
        return {
            processedSql: sql,
            paramsArray: params,
        };
    }
    if (!_.isObjectLike(params)) throw new Error('params must be array or object');

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
            if (!_(params).has(v)) throw new Error(`Missing parameter: ${v}`);
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
    return { processedSql, paramsArray };
}

/**
 * The pool from which clients will be acquired.
 * @type { import("pg").Pool }
 */
let pool = null;

/**
 * Creates a new connection pool and attempts to connect to the database.
 *
 * @param { import("pg").PoolConfig } pgConfig - The config object for Postgres
 * @param {(error: Error, client: import("pg").PoolClient) => void} idleErrorHandler - A handler for async errors
 * @returns {Promise<void>}
 */
module.exports.initAsync = async function(pgConfig, idleErrorHandler) {
    pool = new pg.Pool(pgConfig);
    pool.on('error', function(err, client) {
        idleErrorHandler(err, client);
    });
    pool.on('connect', (client) => {
        client.on('error', (err) => {
            idleErrorHandler(err, client);
        });
    });
    pool.on('remove', (client) => {
        // This shouldn't be necessary, as `pg` currently allows clients to be
        // garbage collected after they're removed. However, if `pg` someday
        // starts reusing client objects across difference connections, this
        // will ensure that we re-set the search path when the client reconnects.
        delete client[SEARCH_SCHEMA];
    });

    // Attempt to connect to the database so that we can fail quickly if
    // something isn't configured correctly.
    let retryCount = 0;
    const retryTimeouts = [500, 1000, 2000, 5000, 10000];
    while (retryCount <= retryTimeouts.length) {
        try {
            await pool.connect();
            return;
        } catch (err) {
            if (retryCount === retryTimeouts.length) {
                throw new Error(`Cound not connect to Postgres after ${retryTimeouts.length} attempts: ${err.message}`);
            }

            const timeout = retryTimeouts[retryCount];
            retryCount++;
            await new Promise((resolve) => setTimeout(resolve, timeout));
        }
    }
};

/**
 * Creates a new connection pool and attempts to connect to the database.
 */
module.exports.init = callbackify(module.exports.initAsync);

/**
 * Closes the connection pool.
 * 
 * @returns {Promise<void>}
 */
module.exports.closeAsync = async function(callback) {
    if (!pool) {
        return callback(null);
    }
    await pool.end();
    pool = null;
};

/**
 * Closes the connection pool.
 */
module.exports.close = promisify(module.exports.closeAsync);

/**
 * Gets a new client from the connection pool. If `err` is not null
 * then `client` and `done` are undefined. If `err` is null then
 * `client` is valid and can be used. The caller MUST call `done()` to
 * release the client, whether or not errors occurred while using
 * `client`. The client can call `done(truthy_value)` to force
 * destruction of the client, but this should not be used except in
 * unusual circumstances.
 *
 * @returns {Promise<{client: import("pg").PoolClient, done: (release?: any) => void}>}
 */
module.exports.getClientAsync = async function() {
    if (!pool) {
        throw new Error('Connection pool is not open');
    }

    const client = await pool.connect();

    // If we're configured to use a particular schema, we'll store whether or
    // not the search path has already been configured for this particular
    // client. If we acquire a client and it's already had its search path
    // set, we can avoid setting it again since the search path will persist
    // for the life of the client.
    //
    // We do this check for each call to `getClient` instead of on
    // `pool.connect` so that we don't have to be really careful about
    // destroying old clients that were created before `setSearchSchema` was 
    // called. Instead, we'll just check if the search path matches the
    // currently-desired schema, and if it's a mismatch (or doesn't exist
    // at all), we re-set it for the current client.
    //
    // Note that this accidentally supports changing the search_path on the fly,
    // although that's not something we currently do (or would be likely to do).
    // It does NOT support clearing the existing search schema - e.g.,
    // `setSearchSchema(null)` would not work as you expect. This is fine, as
    // that's not something we ever do in practice.
    if (searchSchema != null && client[SEARCH_SCHEMA] !== searchSchema) {
        const setSearchPathSql = `SET search_path TO ${client.escapeIdentifier(searchSchema)},public`;
        try {
            await module.exports.queryWithClientAsync(client, setSearchPathSql, {});
        } catch (err) {
            client.release();
            throw err;
        }
        client[SEARCH_SCHEMA] = searchSchema;
    }

    return { client, done: client.release };
};

/**
 * Gets a new client from the connection pool.
 *
 * @param {(error: Error | null, client?: import("pg").PoolClient, done?: (release?: any) => void) => void} callback
 */
module.exports.getClient = function(callback) {
    module.exports.getClientAsync().then(({ client, done }) => {
        callback(null, client, done);
    }).catch((err) => {
        callback(err);
    });
};

/**
 * Performs a query with the given client.
 *
 * @param { import("pg").PoolClient } client - The client with which to execute the query
 * @param {String} sql - The SQL query to execute
 * @param {Params} params
 * @returns {Promise<QueryResult>}
 */
module.exports.queryWithClientAsync = async function(client, sql, params) {
    debug('queryWithClient()', 'sql:', debugString(sql));
    debug('queryWithClient()', 'params:', debugParams(params));
    const { processedSql, paramsArray } = paramsToArray(sql, params);
    try {
        return await client.query(processedSql, paramsArray);
    } catch (err) {
        // TODO: why do we do this?
        const sqlError = JSON.parse(JSON.stringify(err));
        sqlError.message = err.message;
        throw error.addData(err, {sqlError: sqlError, sql: sql, sqlParams: params });
    }
};

/**
 * Performs a query with the given client.
 * 
 * @param { import("pg").PoolClient } client - The client with which to execute the query
 * @param {String} sql - The SQL query to execute
 * @param {Params} params
 * @param {ResultsCallback}
 */
module.exports.queryWithClient = callbackify(module.exports.queryWithClientAsync);

/**
 * Performs a query with the given client. Errors if the query returns more
 * than one row.
 *
 * @param {import("pg").PoolClient} client - The client with which to execute the query
 * @param {String} sql - The SQL query to execute
 * @param {Params} params
 * @returns {Promise<QueryResult>}
 * @param {ResultsCallback} callback
 */
module.exports.queryWithClientOneRowAsync = async function(client, sql, params, callback) {
    debug('queryWithClientOneRow()', 'sql:', debugString(sql));
    debug('queryWithClientOneRow()', 'params:', debugParams(params));
    const result = await module.exports.queryWithClientAsync(client, sql, params);
    if (result.rowCount !== 1) {
        throw error.makeWithData(`Incorrect rowCount: ${result.rowCount}`, {
            sql,
            sqlParams: params,
            result,
        });
    }
    debug('queryWithClientOneRow() success', 'rowCount:', result.rowCount);
    return result;
};

/**
 * Performs a query with the given client. Errors if the query returns more
 * than one row.
 * 
 * @param {import("pg").PoolClient} client - The client with which to execute the query
 * @param {String} sql - The SQL query to execute
 * @param {Params} params
 * @param {ResultsCallback} callback
 */
module.exports.queryWithClientOneRow = callbackify(module.exports.queryWithClientOneRowAsync);

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
module.exports.beginTransactionAsync = function() {
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
    module.exports.getClient((err, client, done) => {
        if (ERR(err, callback)) return;
        module.exports.queryWithClient(client, sql, params, (err, result) => {
            done();
            if (ERR(err, callback)) return;
            callback(null, result);
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

/**
 * Set the schema to use for the search path.
 *
 * @param {string} schema - The schema name to use (can be "null" to unset the search path)
 * @param {(error: Error | null) => void} callback
 */
module.exports.setSearchSchema = function(schema, callback) {
    if (schema == null) {
        searchSchema = schema;
        return;
    }
    /* Note that as of 2021-06-29 escapeIdentifier() is undocumented. See:
     * https://github.com/brianc/node-postgres/pull/396
     * https://github.com/brianc/node-postgres/issues/1978
     * https://www.postgresql.org/docs/12/sql-syntax-lexical.html
     */
    module.exports.query(`CREATE SCHEMA IF NOT EXISTS ${pg.Client.prototype.escapeIdentifier(schema)}`, [], (err) => {
        if (ERR(err, callback)) return;
        // we only set searchSchema after CREATE to avoid the above query() call using searchSchema
        searchSchema = schema;
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
 * @param {string} prefix - The prefix of the new schema, only the first 28 characters will be used (after lowercasing).
 * @param {(error: Error | null, schema: String) => void} callback
 */
module.exports.setRandomSearchSchema = function(prefix, callback) {
    // truncated prefix (max 28 characters)
    const truncPrefix = prefix.substring(0, 28);
    // timestamp in format YYYY-MM-DDTHH:MM:SS.SSSZ (guaranteed to not exceed 27 characters in the spec)
    const timestamp = (new Date()).toISOString();
    // random 6-character suffix to avoid clashes (approx 2 billion possible values)
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const suffix = _.times(6, function() {return _.sample(chars);}).join('');

    // Schema is guaranteed to have length at most 63 (= 28 + 1 + 27 + 1 + 6),
    // which is the default PostgreSQL identifier limit.
    // Note that this schema name will need quoting because of characters like ':', '-', etc
    const schema = `${truncPrefix}_${timestamp}_${suffix}`;
    module.exports.setSearchSchema(schema, (err) => {
        if (ERR(err, callback)) return;
        callback(null, schema);
    });
};
