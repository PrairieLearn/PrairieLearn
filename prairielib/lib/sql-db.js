// @ts-check
const _ = require('lodash');
const pg = require('pg');
const path = require('path');
const debug = require('debug')('prairielib:' + path.basename(__filename, '.js'));
const { callbackify } = require('util');

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
        map[v] =
          'ARRAY[' +
          _.map(_.range(nParams + 1, nParams + params[v].length + 1), function (n) {
            return '$' + n;
          }).join(',') +
          ']';
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
 * Escapes the given identifier for use in an SQL query. Useful for preventing
 * SQL injection.
 *
 * @param {string} identifier
 * @returns {string}
 */
function escapeIdentifier(identifier) {
  // Note that as of 2021-06-29 escapeIdentifier() is undocumented. See:
  // https://github.com/brianc/node-postgres/pull/396
  // https://github.com/brianc/node-postgres/issues/1978
  // https://www.postgresql.org/docs/12/sql-syntax-lexical.html
  return pg.Client.prototype.escapeIdentifier(identifier);
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
module.exports.initAsync = async function (pgConfig, idleErrorHandler) {
  pool = new pg.Pool(pgConfig);
  pool.on('error', function (err, client) {
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
      const client = await pool.connect();
      client.release();
      return;
    } catch (err) {
      if (retryCount === retryTimeouts.length) {
        throw new Error(
          `Cound not connect to Postgres after ${retryTimeouts.length} attempts: ${err.message}`
        );
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
module.exports.closeAsync = async function () {
  if (!pool) return;
  await pool.end();
  pool = null;
};

/**
 * Closes the connection pool.
 */
module.exports.close = callbackify(module.exports.closeAsync);

/**
 * Gets a new client from the connection pool. If `err` is not null
 * then `client` and `done` are undefined. If `err` is null then
 * `client` is valid and can be used. The caller MUST call `done()` to
 * release the client, whether or not errors occurred while using
 * `client`. The client can call `done(truthy_value)` to force
 * destruction of the client, but this should not be used except in
 * unusual circumstances.
 *
 * @returns {Promise<import('pg').PoolClient>}
 */
module.exports.getClientAsync = async function () {
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
    const setSearchPathSql = `SET search_path TO ${escapeIdentifier(searchSchema)},public`;
    try {
      await module.exports.queryWithClientAsync(client, setSearchPathSql, {});
    } catch (err) {
      client.release();
      throw err;
    }
    client[SEARCH_SCHEMA] = searchSchema;
  }

  return client;
};

/**
 * Gets a new client from the connection pool.
 *
 * @param {(error: Error | null, client?: import("pg").PoolClient, done?: (release?: any) => void) => void} callback
 */
module.exports.getClient = function (callback) {
  module.exports
    .getClientAsync()
    .then((client) => callback(null, client, client.release))
    .catch((err) => callback(err));
};

/**
 * Performs a query with the given client.
 *
 * @param {import("pg").PoolClient} client - The client with which to execute the query
 * @param {string} sql - The SQL query to execute
 * @param {Params} params
 * @returns {Promise<QueryResult>}
 */
module.exports.queryWithClientAsync = async function (client, sql, params) {
  debug('queryWithClient()', 'sql:', debugString(sql));
  debug('queryWithClient()', 'params:', debugParams(params));
  const { processedSql, paramsArray } = paramsToArray(sql, params);
  try {
    const result = await client.query(processedSql, paramsArray);
    debug('queryWithClient() success', 'rowCount:', result.rowCount);
    return result;
  } catch (err) {
    // TODO: why do we do this?
    const sqlError = JSON.parse(JSON.stringify(err));
    sqlError.message = err.message;
    throw error.addData(err, {
      sqlError: sqlError,
      sql: sql,
      sqlParams: params,
    });
  }
};

/**
 * Performs a query with the given client.
 *
 * @param {import("pg").PoolClient} client - The client with which to execute the query
 * @param {string} sql - The SQL query to execute
 * @param {Params} params
 * @param {ResultsCallback} callback
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
 */
module.exports.queryWithClientOneRowAsync = async function (client, sql, params) {
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
 *
 * @param {import("pg").PoolClient} client - The client with which to execute the query
 * @param {String} sql - The SQL query to execute
 * @param {Params} params
 * @returns {Promise<QueryResult>}
 */
module.exports.queryWithClientZeroOrOneRowAsync = async function (client, sql, params) {
  debug('queryWithClientZeroOrOneRow()', 'sql:', debugString(sql));
  debug('queryWithClientZeroOrOneRow()', 'params:', debugParams(params));
  const result = await module.exports.queryWithClientAsync(client, sql, params);
  if (result.rowCount > 1) {
    throw error.makeWithData(`Incorrect rowCount: ${result.rowCount}`, {
      sql,
      sqlParams: params,
      result,
    });
  }
  debug('queryWithClientZeroOrOneRow() success', 'rowCount:', result.rowCount);
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
module.exports.queryWithClientZeroOrOneRow = callbackify(
  module.exports.queryWithClientZeroOrOneRowAsync
);

/**
 * Rolls back the current transaction for the given client.
 *
 * @param {import("pg").PoolClient} client
 */
module.exports.rollbackWithClientAsync = async function (client) {
  debug('rollbackWithClient()');
  // From https://node-postgres.com/features/transactions
  try {
    await client.query('ROLLBACK');
    client.release();
  } catch (err) {
    // If there was a problem rolling back the query, something is
    // seriously messed up. Return the error to the release() function to
    // close & remove this client from the pool. If you leave a client in
    // the pool with an unaborted transaction, weird and hard to diagnose
    // problems might happen.
    client.release(err);
  }
};

/**
 * Rolls back the current transaction for the given client.
 *
 * @param {import("pg").PoolClient} client
 * @param {(release?: any) => void} done
 * @param {(err: Error | null) => void} callback
 */
module.exports.rollbackWithClient = (client, done, callback) => {
  // Note that we can't use `util.callbackify` here because this function
  // has an additional unused `done` parameter for backwards compatibility.
  module.exports
    .rollbackWithClientAsync(client)
    .then(() => callback(null))
    .catch((err) => callback(err));
};

/**
 * Begins a new transaction.
 *
 * @returns {Promise<import('pg').PoolClient>}
 */
module.exports.beginTransactionAsync = async function () {
  debug('beginTransaction()');
  const client = await module.exports.getClientAsync();
  try {
    await module.exports.queryWithClientAsync(client, 'START TRANSACTION;', {});
    return client;
  } catch (err) {
    await module.exports.rollbackWithClientAsync(client);
    throw err;
  }
};

/**
 * Begins a new transation.
 *
 * @param {(err: Error | null, client?: import("pg").PoolClient, done?: (release?: any) => void) => void} callback
 */
module.exports.beginTransaction = function (callback) {
  module.exports
    .beginTransactionAsync()
    .then((client) => callback(null, client, client.release))
    .catch((err) => callback(err));
};

/**
 * Commits the transaction if err is null, otherwize rollbacks the transaction.
 * Also releasese the client.
 *
 * @param {import('pg').PoolClient} client
 * @param {Error | null} err
 */
module.exports.endTransactionAsync = async function (client, err) {
  debug('endTransaction()');
  if (err) {
    try {
      await module.exports.rollbackWithClientAsync(client);
      throw error.addData(err, { rollback: 'success' });
    } catch (rollbackErr) {
      throw error.addData(rollbackErr, { prevErr: err, rollback: 'fail' });
    }
  } else {
    try {
      await module.exports.queryWithClientAsync(client, 'COMMIT', {});
    } finally {
      client.release();
    }
  }
};

/**
 * Commits the transaction if err is null, otherwize rollbacks the transaction.
 * Also releasese the client.
 *
 * @param {import("pg").PoolClient} client
 * @param {(rollback?: any) => void} done
 * @param {Error | null} err
 * @param {(error: Error | null) => void} callback
 */
module.exports.endTransaction = function (client, done, err, callback) {
  module.exports
    .endTransactionAsync(client, err)
    .then(() => callback(null))
    .catch((error) => callback(error));
};

/**
 * Executes a query with the specified parameters.
 *
 * @param {string} sql - The SQL query to execute
 * @param {Params} params - The params for the query
 * @returns {Promise<QueryResult>}
 */
module.exports.queryAsync = async function (sql, params) {
  debug('query()', 'sql:', debugString(sql));
  debug('query()', 'params:', debugParams(params));
  const client = await module.exports.getClientAsync();
  try {
    return await module.exports.queryWithClientAsync(client, sql, params);
  } finally {
    client.release();
  }
};

/**
 * Executes a query with the specified parameters.
 *
 * @param {string} sql - The SQL query to execute
 * @param {Params} params - The params for the query
 * @param {ResultsCallback} callback
 */
module.exports.query = callbackify(module.exports.queryAsync);

/**
 * Executes a query with the specified parameters. Errors if the query does
 * not return exactly one row.
 *
 * @param {string} sql - The SQL query to execute
 * @param {Params} params - The params for the query
 * @returns {Promise<QueryResult>}
 */
module.exports.queryOneRowAsync = async function (sql, params) {
  debug('queryOneRow()', 'sql:', debugString(sql));
  debug('queryOneRow()', 'params:', debugParams(params));
  const result = await module.exports.queryAsync(sql, params);
  if (result.rowCount !== 1) {
    throw error.makeWithData(`Incorrect rowCount: ${result.rowCount}`, {
      sql,
      sqlParams: params,
    });
  }
  debug('queryOneRow() success', 'rowCount:', result.rowCount);
  return result;
};

/**
 * Executes a query with the specified parameters. Errors if the query does
 * not return exactly one row.
 *
 * @param {string} sql - The SQL query to execute
 * @param {Params} params - The params for the query
 * @param {ResultsCallback} callback
 */
module.exports.queryOneRow = callbackify(module.exports.queryOneRowAsync);

/**
 * Executes a query with the specified parameters. Errors if the query
 * returns more than one row.
 *
 * @param {string} sql - The SQL query to execute
 * @param {Params} params - The params for the query
 * @returns {Promise<QueryResult>}
 */
module.exports.queryZeroOrOneRowAsync = async function (sql, params) {
  debug('queryZeroOrOneRow()', 'sql:', debugString(sql));
  debug('queryZeroOrOneRow()', 'params:', debugParams(params));
  const result = await module.exports.queryAsync(sql, params);
  if (result.rowCount > 1) {
    throw error.makeWithData(`Incorrect rowCount: ${result.rowCount}`, {
      sql,
      sqlParams: params,
    });
  }
  debug('queryZeroOrOneRow() success', 'rowCount:', result.rowCount);
  return result;
};

/**
 * Executes a query with the specified parameters. Errors if the query
 * returns more than one row.
 *
 * @param {string} sql - The SQL query to execute
 * @param {Params} params - The params for the query
 * @param {ResultsCallback} callback
 */
module.exports.queryZeroOrOneRow = callbackify(module.exports.queryZeroOrOneRowAsync);

/**
 * Calls the given function with the specified parameters.
 *
 * @param {string} functionName - The name of the function to call
 * @param {any[]} params - The params for the function
 * @returns {Promise<QueryResult>}
 */
module.exports.callAsync = async function (functionName, params) {
  debug('call()', 'function:', functionName);
  debug('call()', 'params:', debugParams(params));
  const placeholders = _.map(_.range(1, params.length + 1), (v) => '$' + v).join();
  const sql = `SELECT * FROM ${escapeIdentifier(functionName)}(${placeholders});`;
  const result = await module.exports.queryAsync(sql, params);
  debug('call() success', 'rowCount:', result.rowCount);
  return result;
};

/**
 * Calls the given function with the specified parameters.
 *
 * @param {string} functionName - The name of the function to call
 * @param {any[]} params - The params for the function
 * @param {ResultsCallback} callback
 */
module.exports.call = callbackify(module.exports.callAsync);

/**
 * Calls the given function with the specified parameters. Errors if the
 * function does not return exactly one row.
 *
 * @param {string} functionName - The name of the function to call
 * @param {any[]} params - The params for the function
 * @returns {Promise<QueryResult>}
 */
module.exports.callOneRowAsync = async function (functionName, params) {
  debug('callOneRow()', 'function:', functionName);
  debug('callOneRow()', 'params:', debugParams(params));
  const result = await module.exports.callAsync(functionName, params);
  if (result.rowCount !== 1) {
    throw error.makeWithData('Incorrect rowCount: ' + result.rowCount, {
      functionName,
      sqlParams: params,
    });
  }
  debug('callOneRow() success', 'rowCount:', result.rowCount);
  return result;
};

/**
 * Calls the given function with the specified parameters. Errors if the
 * function does not return exactly one row.
 *
 * @param {string} functionName - The name of the function to call
 * @param {any[]} params - The params for the function
 * @param {ResultsCallback} callback
 */
module.exports.callOneRow = callbackify(module.exports.callOneRowAsync);

/**
 * Calls the given function with the specified parameters. Errors if the
 * function returns more than one row.
 *
 * @param {string} functionName - The name of the function to call
 * @param {any[]} params - The params for the function
 * @returns {Promise<QueryResult>}
 */
module.exports.callZeroOrOneRowAsync = async function (functionName, params) {
  debug('callZeroOrOneRow()', 'function:', functionName);
  debug('callZeroOrOneRow()', 'params:', debugParams(params));
  const result = await module.exports.callAsync(functionName, params);
  if (result.rowCount > 1) {
    throw error.makeWithData('Incorrect rowCount: ' + result.rowCount, {
      functionName,
      sqlParams: params,
    });
  }
  debug('callZeroOrOneRow() success', 'rowCount:', result.rowCount);
  return result;
};

/**
 * Calls the given function with the specified parameters. Errors if the
 * function returns more than one row.
 *
 * @param {string} functionName - The name of the function to call
 * @param {any[]} params - The params for the function
 * @param {ResultsCallback} callback
 */
module.exports.callZeroOrOneRow = callbackify(module.exports.callZeroOrOneRowAsync);

/**
 * Calls a function with the specified parameters using a specific client.
 *
 * @param {import("pg").PoolClient} client
 * @param {string} functionName
 * @param {any[]} params
 * @returs {Promise<QueryResult>}
 */
module.exports.callWithClientAsync = async function (client, functionName, params) {
  debug('callWithClient()', 'function:', functionName);
  debug('callWithClient()', 'params:', debugParams(params));
  const placeholders = _.map(_.range(1, params.length + 1), (v) => '$' + v).join();
  const sql = `SELECT * FROM ${escapeIdentifier(functionName)}(${placeholders})`;
  const result = await module.exports.queryWithClientAsync(client, sql, params);
  debug('callWithClient() success', 'rowCount:', result.rowCount);
  return result;
};

/**
 * Calls a function with the specified parameters using a specific client.
 *
 * @param {import("pg").PoolClient} client
 * @param {string} functionName
 * @param {any[]} params
 * @param {ResultsCallback} callback
 */
module.exports.callWithClient = callbackify(module.exports.callWithClientAsync);

/**
 * Calls a function with the specified parameters using a specific client.
 * Errors if the function does not return exactly one row.
 *
 * @param {import("pg").PoolClient} client
 * @param {string} functionName
 * @param {any[]} params
 * @returns {Promise<QueryResult>}
 */
module.exports.callWithClientOneRowAsync = async function (client, functionName, params) {
  debug('callWithClientOneRow()', 'function:', functionName);
  debug('callWithClientOneRow()', 'params:', debugParams(params));
  const result = await module.exports.callWithClientAsync(client, functionName, params);
  if (result.rowCount !== 1) {
    throw error.makeWithData('Incorrect rowCount: ' + result.rowCount, {
      functionName,
      sqlParams: params,
    });
  }
  debug('callWithClientOneRow() success', 'rowCount:', result.rowCount);
  return result;
};

/**
 * Calls a function with the specified parameters using a specific client.
 * Errors if the function does not return exactly one row.
 *
 * @param {import("pg").PoolClient} client
 * @param {string} functionName
 * @param {any[]} params
 * @param {ResultsCallback} callback
 */
module.exports.callWithClientOneRow = callbackify(module.exports.callWithClientOneRowAsync);

/**
 * Calls a function with the specified parameters using a specific client.
 * Errors if the function returns more than one row.
 *
 * @param {import("pg").PoolClient} client
 * @param {string} functionName
 * @param {any[]} params
 * @returns {Promise<QueryResult>}
 */
module.exports.callWithClientZeroOrOneRowAsync = async function (client, functionName, params) {
  debug('callWithClientZeroOrOneRow()', 'function:', functionName);
  debug('callWithClientZeroOrOneRow()', 'params:', debugParams(params));
  const result = await module.exports.callWithClientAsync(client, functionName, params);
  if (result.rowCount > 1) {
    throw error.makeWithData('Incorrect rowCount: ' + result.rowCount, {
      functionName,
      sqlParams: params,
    });
  }
  debug('callWithClientZeroOrOneRow() success', 'rowCount:', result.rowCount);
  return result;
};

/**
 * Calls a function with the specified parameters using a specific client.
 * Errors if the function returns more than one row.
 *
 * @param {import("pg").PoolClient} client
 * @param {string} functionName
 * @param {any[]} params
 * @param {ResultsCallback} callback
 */
module.exports.callWithClientZeroOrOneRow = callbackify(
  module.exports.callWithClientZeroOrOneRowAsync
);

/**
 * Set the schema to use for the search path.
 *
 * @param {string} schema - The schema name to use (can be "null" to unset the search path)
 */
module.exports.setSearchSchema = async function (schema) {
  if (schema == null) {
    searchSchema = schema;
    return;
  }

  await module.exports.queryAsync(`CREATE SCHEMA IF NOT EXISTS ${escapeIdentifier(schema)}`, {});
  // We only set searchSchema after CREATE to avoid the above query() call using searchSchema.
  searchSchema = schema;
};

/**
 * Get the schema that is currently used for the search path.
 *
 * @return {string | null} schema in use (may be "null" to indicate no schema)
 */
module.exports.getSearchSchema = function () {
  return searchSchema;
};

/**
 * Generate, set, and return a random schema name.
 *
 * @param {string} prefix - The prefix of the new schema, only the first 28 characters will be used (after lowercasing).
 * @returns {Promise<string>} The randomly-generated search schema.
 */
module.exports.setRandomSearchSchemaAsync = async function (prefix) {
  // truncated prefix (max 28 characters)
  const truncPrefix = prefix.substring(0, 28);
  // timestamp in format YYYY-MM-DDTHH:MM:SS.SSSZ (guaranteed to not exceed 27 characters in the spec)
  const timestamp = new Date().toISOString();
  // random 6-character suffix to avoid clashes (approx 2 billion possible values)
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const suffix = _.times(6, function () {
    return _.sample(chars);
  }).join('');

  // Schema is guaranteed to have length at most 63 (= 28 + 1 + 27 + 1 + 6),
  // which is the default PostgreSQL identifier limit.
  // Note that this schema name will need quoting because of characters like ':', '-', etc
  const schema = `${truncPrefix}_${timestamp}_${suffix}`;
  await module.exports.setSearchSchema(schema);
  return schema;
};

/**
 * Generate, set, and return a random schema name.
 *
 * @param {string} prefix - The prefix of the new schema, only the first 28 characters will be used (after lowercasing).
 * @param {(error: Error | null, schema: String) => void} callback
 */
module.exports.setRandomSearchSchema = callbackify(module.exports.setRandomSearchSchemaAsync);
