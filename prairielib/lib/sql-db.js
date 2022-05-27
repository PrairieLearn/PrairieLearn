// @ts-check
const ERR = require('async-stacktrace');
const _ = require('lodash');
const pg = require('pg');
const path = require('path');
const debug = require('debug')('prairielib:' + path.basename(__filename, '.js'));
const { callbackify } = require('util');
const { AsyncLocalStorage } = require('async_hooks');

const error = require('./error');

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

class PostgresPool {
  constructor() {
    /**
     * @type {import('pg').Pool}
     * @private
     *
     * The pool from which clients will be acquired.
     * */
    this.pool = null;

    /**
     * @type {AsyncLocalStorage<import('pg').PoolClient>}
     * @private
     *
     * We use this to propagate the client associated with the current transaction
     * to any nested queries. In the past, we had some nasty bugs associated with
     * the fact that we tried to acquire new clients inside of transactions, which
     * ultimately lead to a deadlock.
     */
    this.alsClient = new AsyncLocalStorage();

    this.searchSchema = null;
  }

  /**
   * Creates a new connection pool and attempts to connect to the database.
   *
   * @param { import("pg").PoolConfig } pgConfig - The config object for Postgres
   * @param {(error: Error, client: import("pg").PoolClient) => void} idleErrorHandler - A handler for async errors
   * @returns {Promise<void>}
   */
  async initAsync(pgConfig, idleErrorHandler) {
    this.pool = new pg.Pool(pgConfig);
    this.pool.on('error', function (err, client) {
      idleErrorHandler(err, client);
    });
    this.pool.on('connect', (client) => {
      client.on('error', (err) => {
        idleErrorHandler(err, client);
      });
    });
    this.pool.on('remove', (client) => {
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
        const client = await this.pool.connect();
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
  }

  /**
   * Creates a new connection pool and attempts to connect to the database.
   */
  init = callbackify(this.initAsync);

  /**
   * Closes the connection pool.
   *
   * @returns {Promise<void>}
   */
  async closeAsync() {
    if (!this.pool) return;
    await this.pool.end();
    this.pool = null;
  }

  /**
   * Closes the connection pool.
   */
  close = callbackify(this.closeAsync);

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
  async getClientAsync() {
    if (!this.pool) {
      throw new Error('Connection pool is not open');
    }

    /** @type {import('pg').PoolClient} */
    let client;

    // If we're inside a transaction, we'll reuse the same client to avoid a
    // potential deadlock.
    if (this.alsClient.getStore() === undefined) {
      client = await this.pool.connect();
    } else {
      client = this.alsClient.getStore();
    }

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
    if (this.searchSchema != null && client[SEARCH_SCHEMA] !== this.searchSchema) {
      const setSearchPathSql = `SET search_path TO ${escapeIdentifier(this.searchSchema)},public`;
      try {
        await this.queryWithClientAsync(client, setSearchPathSql, {});
      } catch (err) {
        client.release();
        throw err;
      }
      client[SEARCH_SCHEMA] = this.searchSchema;
    }

    return client;
  }

  /**
   * Gets a new client from the connection pool.
   *
   * @param {(error: Error | null, client?: import("pg").PoolClient, done?: (release?: any) => void) => void} callback
   */
  getClient(callback) {
    this.getClientAsync()
      .then((client) => callback(null, client, client.release))
      .catch((err) => callback(err));
  }

  /**
   * Performs a query with the given client.
   *
   * @param {import("pg").PoolClient} client - The client with which to execute the query
   * @param {string} sql - The SQL query to execute
   * @param {Params} params
   * @returns {Promise<QueryResult>}
   */
  async queryWithClientAsync(client, sql, params) {
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
  }

  /**
   * Performs a query with the given client.
   *
   * @param {import("pg").PoolClient} client - The client with which to execute the query
   * @param {string} sql - The SQL query to execute
   * @param {Params} params
   * @param {ResultsCallback} callback
   */
  queryWithClient = callbackify(this.queryWithClientAsync);

  /**
   * Performs a query with the given client. Errors if the query returns more
   * than one row.
   *
   * @param {import("pg").PoolClient} client - The client with which to execute the query
   * @param {String} sql - The SQL query to execute
   * @param {Params} params
   * @returns {Promise<QueryResult>}
   */
  async queryWithClientOneRowAsync(client, sql, params) {
    debug('queryWithClientOneRow()', 'sql:', debugString(sql));
    debug('queryWithClientOneRow()', 'params:', debugParams(params));
    const result = await this.queryWithClientAsync(client, sql, params);
    if (result.rowCount !== 1) {
      throw error.makeWithData(`Incorrect rowCount: ${result.rowCount}`, {
        sql,
        sqlParams: params,
        result,
      });
    }
    debug('queryWithClientOneRow() success', 'rowCount:', result.rowCount);
    return result;
  }

  /**
   * Performs a query with the given client. Errors if the query returns more
   * than one row.
   *
   * @param {import("pg").PoolClient} client - The client with which to execute the query
   * @param {String} sql - The SQL query to execute
   * @param {Params} params
   * @param {ResultsCallback} callback
   */
  queryWithClientOneRow = callbackify(this.queryWithClientOneRowAsync);

  /**
   * Performs a query with the given client. Errors if the query returns more
   * than one row.
   *
   * @param {import("pg").PoolClient} client - The client with which to execute the query
   * @param {String} sql - The SQL query to execute
   * @param {Params} params
   * @returns {Promise<QueryResult>}
   */
  async queryWithClientZeroOrOneRowAsync(client, sql, params) {
    debug('queryWithClientZeroOrOneRow()', 'sql:', debugString(sql));
    debug('queryWithClientZeroOrOneRow()', 'params:', debugParams(params));
    const result = await this.queryWithClientAsync(client, sql, params);
    if (result.rowCount > 1) {
      throw error.makeWithData(`Incorrect rowCount: ${result.rowCount}`, {
        sql,
        sqlParams: params,
        result,
      });
    }
    debug('queryWithClientZeroOrOneRow() success', 'rowCount:', result.rowCount);
    return result;
  }

  /**
   * Performs a query with the given client. Errors if the query returns more
   * than one row.
   *
   * @param {import("pg").PoolClient} client - The client with which to execute the query
   * @param {String} sql - The SQL query to execute
   * @param {Params} params
   * @param {ResultsCallback} callback
   */
  queryWithClientZeroOrOneRow = callbackify(this.queryWithClientZeroOrOneRowAsync);

  /**
   * Rolls back the current transaction for the given client.
   *
   * @param {import("pg").PoolClient} client
   */
  async rollbackWithClientAsync(client) {
    debug('rollbackWithClient()');
    // From https://node-postgres.com/features/transactions
    try {
      await client.query('ROLLBACK');
      // Only release the client if we weren't already inside a transaction.
      if (this.alsClient.getStore() === undefined) {
        client.release();
      }
    } catch (err) {
      // If there was a problem rolling back the query, something is
      // seriously messed up. Return the error to the release() function to
      // close & remove this client from the pool. If you leave a client in
      // the pool with an unaborted transaction, weird and hard to diagnose
      // problems might happen.
      client.release(err);
    }
  }

  /**
   * Rolls back the current transaction for the given client.
   *
   * @param {import("pg").PoolClient} client
   * @param {(release?: any) => void} done
   * @param {(err: Error | null) => void} callback
   */
  rollbackWithClient(client, done, callback) {
    // Note that we can't use `util.callbackify` here because this function
    // has an additional unused `done` parameter for backwards compatibility.
    this.rollbackWithClientAsync(client)
      .then(() => callback(null))
      .catch((err) => callback(err));
  }

  /**
   * Begins a new transaction.
   *
   * @returns {Promise<import('pg').PoolClient>}
   */
  async beginTransactionAsync() {
    debug('beginTransaction()');
    const client = await this.getClientAsync();
    try {
      await this.queryWithClientAsync(client, 'START TRANSACTION;', {});
      return client;
    } catch (err) {
      await this.rollbackWithClientAsync(client);
      throw err;
    }
  }

  /**
   * Begins a new transation.
   *
   * @param {(err: Error | null, client?: import("pg").PoolClient, done?: (release?: any) => void) => void} callback
   */
  beginTransaction(callback) {
    this.beginTransactionAsync()
      .then((client) => callback(null, client, client.release))
      .catch((err) => callback(err));
  }

  /**
   * Commits the transaction if err is null, otherwize rollbacks the transaction.
   * Also releasese the client.
   *
   * @param {import('pg').PoolClient} client
   * @param {Error | null} err
   */
  async endTransactionAsync(client, err) {
    debug('endTransaction()');
    if (err) {
      try {
        await this.rollbackWithClientAsync(client);
      } catch (rollbackErr) {
        throw error.addData(rollbackErr, { prevErr: err, rollback: 'fail' });
      }

      // Even though we successfully rolled back the transaction, there was
      // still an error in the first place that necessitated a rollback. Re-throw
      // that error here so that everything downstream of here will know about it.
      throw error.addData(err, { rollback: 'success' });
    } else {
      try {
        await this.queryWithClientAsync(client, 'COMMIT', {});
      } finally {
        // Only release the client if we aren't nested inside another transaction.
        if (this.alsClient.getStore() === undefined) {
          client.release();
        }
      }
    }
  }

  /**
   * Commits the transaction if err is null, otherwize rollbacks the transaction.
   * Also releasese the client.
   *
   * @param {import("pg").PoolClient} client
   * @param {(rollback?: any) => void} done
   * @param {Error | null} err
   * @param {(error: Error | null) => void} callback
   */
  endTransaction(client, done, err, callback) {
    this.endTransactionAsync(client, err)
      .then(() => callback(null))
      .catch((error) => callback(error));
  }

  /**
   * Runs the specified function inside of a transaction. The function will
   * receive a database client as an argument, but it can also make queries
   * as usual, and the correct client will be used automatically.
   *
   * The transaction will be rolled back if the function throws an error, and
   * will be committed otherwise.
   *
   * @param {(client: import('pg').PoolClient) => Promise<void>} fn
   */
  async runInTransactionAsync(fn) {
    const client = await this.beginTransactionAsync();
    try {
      await this.alsClient.run(client, () => fn(client));
    } catch (err) {
      await this.endTransactionAsync(client, err);
      throw err;
    }

    // Note that we don't invoke `endTransactionAsync` inside the `try` block
    // because we don't want an error thrown by it to trigger *another* call
    // to `endTransactionAsync` in the `catch` block.
    await this.endTransactionAsync(client, null);
  }

  /**
   * Like `runInTransactionAsync`, but with callbacks.
   *
   * @param {(client: import('pg').PoolClient, done: (err?: Error) => void) => void} fn
   * @param {(err?: Error) => void} callback
   */
  runInTransaction(fn, callback) {
    const alreadyInTransaction = this.alsClient.getStore() !== undefined;
    this.beginTransaction((err, client, done) => {
      if (ERR(err, callback)) return;

      this.alsClient.run(client, () => {
        fn(client, (err) => {
          if (alreadyInTransaction) {
            this.endTransaction(client, done, err, callback);
          } else {
            // If this wasn't invoked inside an existing transaction, "exit"
            // from the current execution context so that any code downstream
            // of the callback isn't executed with this client.
            this.alsClient.exit(() => this.endTransaction(client, done, err, callback));
          }
        });
      });
    });
  }

  /**
   * Executes a query with the specified parameters.
   *
   * @param {string} sql - The SQL query to execute
   * @param {Params} params - The params for the query
   * @returns {Promise<QueryResult>}
   */
  async queryAsync(sql, params) {
    debug('query()', 'sql:', debugString(sql));
    debug('query()', 'params:', debugParams(params));
    const client = await this.getClientAsync();
    try {
      return await this.queryWithClientAsync(client, sql, params);
    } finally {
      // Only release if we aren't nested in a transaction.
      if (this.alsClient.getStore() === undefined) {
        client.release();
      }
    }
  }

  /**
   * Executes a query with the specified parameters.
   *
   * @param {string} sql - The SQL query to execute
   * @param {Params} params - The params for the query
   * @param {ResultsCallback} callback
   */
  query = callbackify(this.queryAsync);

  /**
   * Executes a query with the specified parameters. Errors if the query does
   * not return exactly one row.
   *
   * @param {string} sql - The SQL query to execute
   * @param {Params} params - The params for the query
   * @returns {Promise<QueryResult>}
   */
  async queryOneRowAsync(sql, params) {
    debug('queryOneRow()', 'sql:', debugString(sql));
    debug('queryOneRow()', 'params:', debugParams(params));
    const result = await this.queryAsync(sql, params);
    if (result.rowCount !== 1) {
      throw error.makeWithData(`Incorrect rowCount: ${result.rowCount}`, {
        sql,
        sqlParams: params,
      });
    }
    debug('queryOneRow() success', 'rowCount:', result.rowCount);
    return result;
  }

  /**
   * Executes a query with the specified parameters. Errors if the query does
   * not return exactly one row.
   *
   * @param {string} sql - The SQL query to execute
   * @param {Params} params - The params for the query
   * @param {ResultsCallback} callback
   */
  queryOneRow = callbackify(this.queryOneRowAsync);

  /**
   * Executes a query with the specified parameters. Errors if the query
   * returns more than one row.
   *
   * @param {string} sql - The SQL query to execute
   * @param {Params} params - The params for the query
   * @returns {Promise<QueryResult>}
   */
  async queryZeroOrOneRowAsync(sql, params) {
    debug('queryZeroOrOneRow()', 'sql:', debugString(sql));
    debug('queryZeroOrOneRow()', 'params:', debugParams(params));
    const result = await this.queryAsync(sql, params);
    if (result.rowCount > 1) {
      throw error.makeWithData(`Incorrect rowCount: ${result.rowCount}`, {
        sql,
        sqlParams: params,
      });
    }
    debug('queryZeroOrOneRow() success', 'rowCount:', result.rowCount);
    return result;
  }

  /**
   * Executes a query with the specified parameters. Errors if the query
   * returns more than one row.
   *
   * @param {string} sql - The SQL query to execute
   * @param {Params} params - The params for the query
   * @param {ResultsCallback} callback
   */
  queryZeroOrOneRow = callbackify(this.queryZeroOrOneRowAsync);

  /**
   * Calls the given function with the specified parameters.
   *
   * @param {string} functionName - The name of the function to call
   * @param {any[]} params - The params for the function
   * @returns {Promise<QueryResult>}
   */
  async callAsync(functionName, params) {
    debug('call()', 'function:', functionName);
    debug('call()', 'params:', debugParams(params));
    const placeholders = _.map(_.range(1, params.length + 1), (v) => '$' + v).join();
    const sql = `SELECT * FROM ${escapeIdentifier(functionName)}(${placeholders});`;
    const result = await this.queryAsync(sql, params);
    debug('call() success', 'rowCount:', result.rowCount);
    return result;
  }

  /**
   * Calls the given function with the specified parameters.
   *
   * @param {string} functionName - The name of the function to call
   * @param {any[]} params - The params for the function
   * @param {ResultsCallback} callback
   */
  call = callbackify(this.callAsync);

  /**
   * Calls the given function with the specified parameters. Errors if the
   * function does not return exactly one row.
   *
   * @param {string} functionName - The name of the function to call
   * @param {any[]} params - The params for the function
   * @returns {Promise<QueryResult>}
   */
  async callOneRowAsync(functionName, params) {
    debug('callOneRow()', 'function:', functionName);
    debug('callOneRow()', 'params:', debugParams(params));
    const result = await this.callAsync(functionName, params);
    if (result.rowCount !== 1) {
      throw error.makeWithData('Incorrect rowCount: ' + result.rowCount, {
        functionName,
        sqlParams: params,
      });
    }
    debug('callOneRow() success', 'rowCount:', result.rowCount);
    return result;
  }

  /**
   * Calls the given function with the specified parameters. Errors if the
   * function does not return exactly one row.
   *
   * @param {string} functionName - The name of the function to call
   * @param {any[]} params - The params for the function
   * @param {ResultsCallback} callback
   */
  callOneRow = callbackify(this.callOneRowAsync);

  /**
   * Calls the given function with the specified parameters. Errors if the
   * function returns more than one row.
   *
   * @param {string} functionName - The name of the function to call
   * @param {any[]} params - The params for the function
   * @returns {Promise<QueryResult>}
   */
  async callZeroOrOneRowAsync(functionName, params) {
    debug('callZeroOrOneRow()', 'function:', functionName);
    debug('callZeroOrOneRow()', 'params:', debugParams(params));
    const result = await this.callAsync(functionName, params);
    if (result.rowCount > 1) {
      throw error.makeWithData('Incorrect rowCount: ' + result.rowCount, {
        functionName,
        sqlParams: params,
      });
    }
    debug('callZeroOrOneRow() success', 'rowCount:', result.rowCount);
    return result;
  }

  /**
   * Calls the given function with the specified parameters. Errors if the
   * function returns more than one row.
   *
   * @param {string} functionName - The name of the function to call
   * @param {any[]} params - The params for the function
   * @param {ResultsCallback} callback
   */
  callZeroOrOneRow = callbackify(this.callZeroOrOneRowAsync);

  /**
   * Calls a function with the specified parameters using a specific client.
   *
   * @param {import("pg").PoolClient} client
   * @param {string} functionName
   * @param {any[]} params
   * @returs {Promise<QueryResult>}
   */
  async callWithClientAsync(client, functionName, params) {
    debug('callWithClient()', 'function:', functionName);
    debug('callWithClient()', 'params:', debugParams(params));
    const placeholders = _.map(_.range(1, params.length + 1), (v) => '$' + v).join();
    const sql = `SELECT * FROM ${escapeIdentifier(functionName)}(${placeholders})`;
    const result = await this.queryWithClientAsync(client, sql, params);
    debug('callWithClient() success', 'rowCount:', result.rowCount);
    return result;
  }

  /**
   * Calls a function with the specified parameters using a specific client.
   *
   * @param {import("pg").PoolClient} client
   * @param {string} functionName
   * @param {any[]} params
   * @param {ResultsCallback} callback
   */
  callWithClient = callbackify(this.callWithClientAsync);

  /**
   * Calls a function with the specified parameters using a specific client.
   * Errors if the function does not return exactly one row.
   *
   * @param {import("pg").PoolClient} client
   * @param {string} functionName
   * @param {any[]} params
   * @returns {Promise<QueryResult>}
   */
  async callWithClientOneRowAsync(client, functionName, params) {
    debug('callWithClientOneRow()', 'function:', functionName);
    debug('callWithClientOneRow()', 'params:', debugParams(params));
    const result = await this.callWithClientAsync(client, functionName, params);
    if (result.rowCount !== 1) {
      throw error.makeWithData('Incorrect rowCount: ' + result.rowCount, {
        functionName,
        sqlParams: params,
      });
    }
    debug('callWithClientOneRow() success', 'rowCount:', result.rowCount);
    return result;
  }

  /**
   * Calls a function with the specified parameters using a specific client.
   * Errors if the function does not return exactly one row.
   *
   * @param {import("pg").PoolClient} client
   * @param {string} functionName
   * @param {any[]} params
   * @param {ResultsCallback} callback
   */
  callWithClientOneRow = callbackify(this.callWithClientOneRowAsync);

  /**
   * Calls a function with the specified parameters using a specific client.
   * Errors if the function returns more than one row.
   *
   * @param {import("pg").PoolClient} client
   * @param {string} functionName
   * @param {any[]} params
   * @returns {Promise<QueryResult>}
   */
  async callWithClientZeroOrOneRowAsync(client, functionName, params) {
    debug('callWithClientZeroOrOneRow()', 'function:', functionName);
    debug('callWithClientZeroOrOneRow()', 'params:', debugParams(params));
    const result = await this.callWithClientAsync(client, functionName, params);
    if (result.rowCount > 1) {
      throw error.makeWithData('Incorrect rowCount: ' + result.rowCount, {
        functionName,
        sqlParams: params,
      });
    }
    debug('callWithClientZeroOrOneRow() success', 'rowCount:', result.rowCount);
    return result;
  }

  /**
   * Calls a function with the specified parameters using a specific client.
   * Errors if the function returns more than one row.
   *
   * @param {import("pg").PoolClient} client
   * @param {string} functionName
   * @param {any[]} params
   * @param {ResultsCallback} callback
   */
  callWithClientZeroOrOneRow = callbackify(this.callWithClientZeroOrOneRowAsync);

  /**
   * Set the schema to use for the search path.
   *
   * @param {string} schema - The schema name to use (can be "null" to unset the search path)
   */
  async setSearchSchema(schema) {
    if (schema == null) {
      this.searchSchema = schema;
      return;
    }

    await this.queryAsync(`CREATE SCHEMA IF NOT EXISTS ${escapeIdentifier(schema)}`, {});
    // We only set searchSchema after CREATE to avoid the above query() call using searchSchema.
    this.searchSchema = schema;
  }

  /**
   * Get the schema that is currently used for the search path.
   *
   * @return {string | null} schema in use (may be "null" to indicate no schema)
   */
  getSearchSchema() {
    return this.searchSchema;
  }

  /**
   * Generate, set, and return a random schema name.
   *
   * @param {string} prefix - The prefix of the new schema, only the first 28 characters will be used (after lowercasing).
   * @returns {Promise<string>} The randomly-generated search schema.
   */
  async setRandomSearchSchemaAsync(prefix) {
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
    await this.setSearchSchema(schema);
    return schema;
  }

  /**
   * Generate, set, and return a random schema name.
   *
   * @param {string} prefix - The prefix of the new schema, only the first 28 characters will be used (after lowercasing).
   * @param {(error: Error | null, schema: String) => void} callback
   */
  setRandomSearchSchema = callbackify(this.setRandomSearchSchemaAsync);
}

const defaultPool = new PostgresPool();

module.exports = {
  // We re-expose all functions from the default pool here to account for the
  // default case of a shared global pool of clients. If someone want to create
  // their own pool, we expose the `PostgresPool` class.
  //
  // Note that we explicitly bind all functions to `defaultPool`. This ensures
  // that they'll be invoked with the correct `this` context, specifically when
  // this module is imported as `import * as db from '...'` and that import is
  // subsequently transformed by Babel to `interopRequireWildcard(...)`.
  init: defaultPool.init.bind(defaultPool),
  initAsync: defaultPool.initAsync.bind(defaultPool),
  close: defaultPool.close.bind(defaultPool),
  closeAsync: defaultPool.closeAsync.bind(defaultPool),
  getClientAsync: defaultPool.getClientAsync.bind(defaultPool),
  getClient: defaultPool.getClient.bind(defaultPool),
  queryWithClient: defaultPool.queryWithClient.bind(defaultPool),
  queryWithClientAsync: defaultPool.queryWithClientAsync.bind(defaultPool),
  queryWithClientOneRow: defaultPool.queryWithClientOneRow.bind(defaultPool),
  queryWithClientOneRowAsync: defaultPool.queryWithClientOneRowAsync.bind(defaultPool),
  queryWithClientZeroOrOneRow: defaultPool.queryWithClientZeroOrOneRow.bind(defaultPool),
  queryWithClientZeroOrOneRowAsync: defaultPool.queryWithClientZeroOrOneRowAsync.bind(defaultPool),
  rollbackWithClientAsync: defaultPool.rollbackWithClientAsync.bind(defaultPool),
  rollbackWithClient: defaultPool.rollbackWithClient.bind(defaultPool),
  beginTransactionAsync: defaultPool.beginTransactionAsync.bind(defaultPool),
  beginTransaction: defaultPool.beginTransaction.bind(defaultPool),
  endTransactionAsync: defaultPool.endTransactionAsync.bind(defaultPool),
  endTransaction: defaultPool.endTransaction.bind(defaultPool),
  runInTransactionAsync: defaultPool.runInTransactionAsync.bind(defaultPool),
  runInTransaction: defaultPool.runInTransaction.bind(defaultPool),
  query: defaultPool.query.bind(defaultPool),
  queryAsync: defaultPool.queryAsync.bind(defaultPool),
  queryOneRow: defaultPool.queryOneRow.bind(defaultPool),
  queryOneRowAsync: defaultPool.queryOneRowAsync.bind(defaultPool),
  queryZeroOrOneRow: defaultPool.queryZeroOrOneRow.bind(defaultPool),
  queryZeroOrOneRowAsync: defaultPool.queryZeroOrOneRowAsync.bind(defaultPool),
  call: defaultPool.call.bind(defaultPool),
  callAsync: defaultPool.callAsync.bind(defaultPool),
  callOneRow: defaultPool.callOneRow.bind(defaultPool),
  callOneRowAsync: defaultPool.callOneRowAsync.bind(defaultPool),
  callZeroOrOneRow: defaultPool.callZeroOrOneRow.bind(defaultPool),
  callZeroOrOneRowAsync: defaultPool.callZeroOrOneRowAsync.bind(defaultPool),
  callWithClient: defaultPool.callWithClient.bind(defaultPool),
  callWithClientAsync: defaultPool.callWithClientAsync.bind(defaultPool),
  callWithClientOneRow: defaultPool.callWithClientOneRow.bind(defaultPool),
  callWithClientOneRowAsync: defaultPool.callWithClientOneRowAsync.bind(defaultPool),
  callWithClientZeroOrOneRow: defaultPool.callWithClientZeroOrOneRow.bind(defaultPool),
  callWithClientZeroOrOneRowAsync: defaultPool.callWithClientZeroOrOneRowAsync.bind(defaultPool),
  setSearchSchema: defaultPool.setSearchSchema.bind(defaultPool),
  getSearchSchema: defaultPool.getSearchSchema.bind(defaultPool),
  setRandomSearchSchema: defaultPool.setRandomSearchSchema.bind(defaultPool),
  setRandomSearchSchemaAsync: defaultPool.setRandomSearchSchemaAsync.bind(defaultPool),
};

module.exports.PostgresPool = PostgresPool;
