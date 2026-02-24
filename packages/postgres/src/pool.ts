import { AsyncLocalStorage } from 'node:async_hooks';
import { Readable, Transform } from 'node:stream';

import debugfn from 'debug';
import { difference, sampleSize } from 'es-toolkit';
import multipipe from 'multipipe';
import pg, { DatabaseError, type QueryResult, escapeLiteral } from 'pg';
import Cursor from 'pg-cursor';
import { z } from 'zod';

export type QueryParams = Record<string, any> | any[];

export interface CursorIterator<T> {
  iterate: (batchSize: number) => AsyncGenerator<T[]>;
  stream: (batchSize: number) => NodeJS.ReadWriteStream;
}

export interface PostgresPoolConfig extends pg.PoolConfig {
  errorOnUnusedParameters?: boolean;
}

const debug = debugfn('@prairielearn/postgres');
const lastQueryMap = new WeakMap<pg.PoolClient, string>();
const searchSchemaMap = new WeakMap<pg.PoolClient, string>();

function addDataToError(err: Error, data: Record<string, any>): Error {
  (err as any).data = {
    ...(err as any).data,
    ...data,
  };
  return err;
}

/** @knipignore */
export class PostgresError extends Error {
  public data: Record<string, any>;

  constructor(message: string, data: Record<string, any>) {
    super(message);
    this.data = data;
    this.name = 'PostgresError';
  }
}

/**
 * Formats a string for debugging.
 */
function debugString(s: string): string {
  if (typeof s !== 'string') return 'NOT A STRING';
  s = s.replaceAll('\n', '\\n');
  if (s.length > 78) s = s.slice(0, 75) + '...';
  s = '"' + s + '"';
  return s;
}

/**
 * Formats a set of params for debugging.
 */
function debugParams(params: QueryParams): string {
  let s;
  try {
    s = JSON.stringify(params);
  } catch {
    s = 'CANNOT JSON STRINGIFY';
  }
  return debugString(s);
}

/**
 * Given an SQL string and params, creates an array of params and an SQL string
 * with any named dollar-sign placeholders replaced with parameters.
 */
function paramsToArray(
  sql: string,
  params: QueryParams,
  errorOnUnusedParameters: boolean,
): { processedSql: string; paramsArray: any } {
  if (typeof sql !== 'string') throw new Error('SQL must be a string');
  if (Array.isArray(params)) {
    return {
      processedSql: sql,
      paramsArray: params,
    };
  }
  if (params == null || typeof params !== 'object') {
    throw new Error('params must be array or object');
  }

  const re = /\$([-_a-zA-Z0-9]+)/;
  let result;
  let processedSql = '';
  let remainingSql = sql;
  let nParams = 0;
  const map: Record<string, string> = {};
  let paramsArray: any[] = [];
  while ((result = re.exec(remainingSql)) !== null) {
    const v = result[1];
    if (!(v in map)) {
      if (!(v in params)) throw new Error(`Missing parameter: ${v}`);
      if (Array.isArray(params[v])) {
        map[v] = 'ARRAY[' + params[v].map((_, n) => '$' + (n + nParams + 1)).join(',') + ']';
        nParams += params[v].length;
        paramsArray = paramsArray.concat(params[v]);
      } else {
        nParams++;
        map[v] = '$' + nParams;
        paramsArray.push(params[v]);
      }
    }
    processedSql += remainingSql.slice(0, result.index) + map[v];
    remainingSql = remainingSql.slice(result.index + result[0].length);
  }
  processedSql += remainingSql;
  remainingSql = '';
  if (errorOnUnusedParameters) {
    const unusedKeys = difference(Object.keys(params), Object.keys(map));
    if (unusedKeys.length > 0) {
      throw new Error(`Unused parameters in SQL query: ${JSON.stringify(unusedKeys)}`);
    }
  }
  return { processedSql, paramsArray };
}

/**
 * Escapes the given identifier for use in an SQL query. Useful for preventing
 * SQL injection.
 */
function escapeIdentifier(identifier: string): string {
  // Note that as of 2021-06-29 escapeIdentifier() is undocumented. See:
  // https://github.com/brianc/node-postgres/pull/396
  // https://github.com/brianc/node-postgres/issues/1978
  // https://www.postgresql.org/docs/current/sql-syntax-lexical.html
  return pg.Client.prototype.escapeIdentifier(identifier);
}

function enhanceError(err: Error, sql: string, params: QueryParams): Error {
  // Copy the error so we don't end up with a circular reference in the
  // final error.
  const sqlError = {
    ...err,
    // `message` is a non-enumerable property, so we need to copy it manually to
    // the error object.
    message: err.message,
  };

  const errorHasPosition = err instanceof DatabaseError && err.position != null;

  return addDataToError(err, {
    sqlError,
    // If the error has a `position` field, we need to use the processed source
    // (where e.g. `$foobar` has been replaced with `$1`) so that the position
    // is accurate.
    sql: errorHasPosition ? paramsToArray(sql, params, false).processedSql : sql,
    sqlParams: params,
  });
}

export class PostgresPool {
  /** The pool from which clients will be acquired. */
  private pool: pg.Pool | null = null;
  /**
   * We use this to propagate the client associated with the current transaction
   * to any nested queries. In the past, we had some nasty bugs associated with
   * the fact that we tried to acquire new clients inside of transactions, which
   * ultimately lead to a deadlock.
   */
  private alsClient = new AsyncLocalStorage<pg.PoolClient>();
  private searchSchema: string | null = null;
  /** Tracks the total number of queries executed by this pool. */
  private _queryCount = 0;
  private errorOnUnusedParameters = false;

  /**
   * Creates a new connection pool and attempts to connect to the database.
   */
  async initAsync(
    pgConfig: PostgresPoolConfig,
    idleErrorHandler: (error: Error, client: pg.PoolClient) => void,
  ): Promise<void> {
    if (this.pool != null) {
      throw new Error('Postgres pool already initialized');
    }
    this.errorOnUnusedParameters = pgConfig.errorOnUnusedParameters ?? false;
    this.pool = new pg.Pool(pgConfig);
    this.pool.on('error', function (err, client) {
      const lastQuery = lastQueryMap.get(client);
      idleErrorHandler(addDataToError(err, { lastQuery }), client);
    });
    this.pool.on('connect', (client) => {
      client.on('error', (err) => {
        const lastQuery = lastQueryMap.get(client);
        idleErrorHandler(addDataToError(err, { lastQuery }), client);
      });
    });
    this.pool.on('remove', (client) => {
      // This shouldn't be necessary, as `pg` currently allows clients to be
      // garbage collected after they're removed. However, if `pg` someday
      // starts reusing client objects across difference connections, this
      // will ensure that we re-set the search path when the client reconnects.
      searchSchemaMap.delete(client);
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
      } catch (err: any) {
        if (retryCount === retryTimeouts.length) {
          throw new Error(`Could not connect to Postgres after ${retryTimeouts.length} attempts`, {
            cause: err,
          });
        }

        const timeout = retryTimeouts[retryCount];
        retryCount++;
        await new Promise((resolve) => setTimeout(resolve, timeout));
      }
    }
  }

  /**
   * Closes the connection pool.
   */
  async closeAsync(): Promise<void> {
    if (!this.pool) return;
    await this.pool.end();
    this.pool = null;
  }

  /**
   * Gets a new client from the connection pool. The caller MUST call `release()` to
   * release the client, whether or not errors occurred while using
   * `client`. The client can call `done(truthy_value)` to force
   * destruction of the client, but this should not be used except in
   * unusual circumstances.
   */
  async getClientAsync(): Promise<pg.PoolClient> {
    if (!this.pool) {
      throw new Error('Connection pool is not open');
    }

    // If we're inside a transaction, we'll reuse the same client to avoid a
    // potential deadlock.
    const client = this.alsClient.getStore() ?? (await this.pool.connect());

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
    const clientSearchSchema = searchSchemaMap.get(client);
    if (this.searchSchema != null && clientSearchSchema !== this.searchSchema) {
      const setSearchPathSql = `SET search_path TO ${escapeIdentifier(this.searchSchema)},public`;
      try {
        await this.queryWithClientAsync(client, setSearchPathSql, {});
      } catch (err) {
        client.release();
        throw err;
      }
      searchSchemaMap.set(client, this.searchSchema);
    }

    return client;
  }

  /**
   * Performs a query with the given client.
   */
  async queryWithClientAsync(
    client: pg.PoolClient,
    sql: string,
    params: QueryParams,
  ): Promise<pg.QueryResult> {
    this._queryCount += 1;
    debug('queryWithClient()', 'sql:', debugString(sql));
    debug('queryWithClient()', 'params:', debugParams(params));
    const { processedSql, paramsArray } = paramsToArray(sql, params, this.errorOnUnusedParameters);
    try {
      lastQueryMap.set(client, processedSql);
      const result = await client.query(processedSql, paramsArray);
      debug('queryWithClient() success', 'rowCount:', result.rowCount);
      return result;
    } catch (err: any) {
      throw enhanceError(err, sql, params);
    }
  }

  /**
   * Performs a query with the given client. Errors if the query returns more
   * than one row.
   */
  async queryWithClientOneRowAsync(
    client: pg.PoolClient,
    sql: string,
    params: QueryParams,
  ): Promise<pg.QueryResult> {
    debug('queryWithClientOneRow()', 'sql:', debugString(sql));
    debug('queryWithClientOneRow()', 'params:', debugParams(params));
    const result = await this.queryWithClientAsync(client, sql, params);
    if (result.rowCount !== 1) {
      throw new PostgresError(`Incorrect rowCount: ${result.rowCount}`, {
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
   */
  async queryWithClientZeroOrOneRowAsync(
    client: pg.PoolClient,
    sql: string,
    params: QueryParams,
  ): Promise<QueryResult> {
    debug('queryWithClientZeroOrOneRow()', 'sql:', debugString(sql));
    debug('queryWithClientZeroOrOneRow()', 'params:', debugParams(params));
    const result = await this.queryWithClientAsync(client, sql, params);
    if (result.rowCount == null || result.rowCount > 1) {
      throw new PostgresError(`Incorrect rowCount: ${result.rowCount}`, {
        sql,
        sqlParams: params,
        result,
      });
    }
    debug('queryWithClientZeroOrOneRow() success', 'rowCount:', result.rowCount);
    return result;
  }

  /**
   * Rolls back the current transaction for the given client.
   */
  async rollbackWithClientAsync(client: pg.PoolClient) {
    debug('rollbackWithClient()');
    // From https://node-postgres.com/features/transactions
    try {
      await client.query('ROLLBACK');
      // Only release the client if we weren't already inside a transaction.
      if (this.alsClient.getStore() === undefined) {
        client.release();
      }
    } catch (err: any) {
      // If there was a problem rolling back the query, something is
      // seriously messed up. Return the error to the release() function to
      // close & remove this client from the pool. If you leave a client in
      // the pool with an unaborted transaction, weird and hard to diagnose
      // problems might happen.
      client.release(err);
    }
  }

  /**
   * Begins a new transaction.
   */
  async beginTransactionAsync(): Promise<pg.PoolClient> {
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
   * Commits the transaction if err is null, otherwise rollbacks the transaction.
   * Also releases the client.
   */
  async endTransactionAsync(client: pg.PoolClient, err: Error | null | undefined) {
    debug('endTransaction()');
    if (err) {
      try {
        await this.rollbackWithClientAsync(client);
      } catch (rollbackErr: any) {
        throw addDataToError(rollbackErr, { prevErr: err, rollback: 'fail' });
      }

      // Even though we successfully rolled back the transaction, there was
      // still an error in the first place that necessitated a rollback. Re-throw
      // that error here so that everything downstream of here will know about it.
      throw addDataToError(err, { rollback: 'success' });
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
   * Runs the specified function inside of a transaction. The function will
   * receive a database client as an argument, but it can also make queries
   * as usual, and the correct client will be used automatically.
   *
   * The transaction will be rolled back if the function throws an error, and
   * will be committed otherwise.
   */
  async runInTransactionAsync<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    // Check if we're already inside a transaction. If so, we won't start another one,
    // as Postgres doesn't support nested transactions.
    const client = this.alsClient.getStore();
    const isNestedTransaction = client !== undefined;
    const transactionClient = client ?? (await this.beginTransactionAsync());

    let result: T;
    try {
      result = await this.alsClient.run(transactionClient, () => fn(transactionClient));
    } catch (err: any) {
      if (!isNestedTransaction) {
        // If we're inside another transaction, we assume that the root transaction
        // will catch this error and roll back the transaction.
        await this.endTransactionAsync(transactionClient, err);
      }
      throw err;
    }

    if (!isNestedTransaction) {
      // If we're inside another transaction; don't commit it prematurely. Allow
      // the root transaction to commit it instead.
      //
      // Note that we don't invoke `endTransactionAsync` inside the `try` block
      // because we don't want an error thrown by it to trigger *another* call
      // to `endTransactionAsync` in the `catch` block.
      await this.endTransactionAsync(transactionClient, null);
    }

    return result;
  }

  /**
   * Executes a query with the specified parameters.
   *
   * @deprecated Use {@link execute} instead.
   *
   * Using the return value of this function directly is not recommended. Instead, use
   * {@link queryRows}, {@link queryRow}, or {@link queryOptionalRow}.
   */
  async queryAsync(sql: string, params: QueryParams): Promise<QueryResult> {
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
   * Executes a query with the specified parameters. Errors if the query does
   * not return exactly one row.
   *
   * @deprecated Use {@link executeRow} or {@link queryRow} instead.
   */
  async queryOneRowAsync(sql: string, params: QueryParams): Promise<pg.QueryResult> {
    debug('queryOneRow()', 'sql:', debugString(sql));
    debug('queryOneRow()', 'params:', debugParams(params));
    const result = await this.queryAsync(sql, params);
    if (result.rowCount !== 1) {
      throw new PostgresError(`Incorrect rowCount: ${result.rowCount}`, {
        sql,
        sqlParams: params,
      });
    }
    debug('queryOneRow() success', 'rowCount:', result.rowCount);
    return result;
  }

  /**
   * Executes a query with the specified parameters. Errors if the query
   * returns more than one row.
   */
  async queryZeroOrOneRowAsync(sql: string, params: QueryParams): Promise<pg.QueryResult> {
    debug('queryZeroOrOneRow()', 'sql:', debugString(sql));
    debug('queryZeroOrOneRow()', 'params:', debugParams(params));
    const result = await this.queryAsync(sql, params);
    if (result.rowCount == null || result.rowCount > 1) {
      throw new PostgresError(`Incorrect rowCount: ${result.rowCount}`, {
        sql,
        sqlParams: params,
      });
    }
    debug('queryZeroOrOneRow() success', 'rowCount:', result.rowCount);
    return result;
  }

  /**
   * Calls the given sproc with the specified parameters.
   */
  async callAsync(functionName: string, params: any[]): Promise<pg.QueryResult> {
    debug('call()', 'function:', functionName);
    debug('call()', 'params:', debugParams(params));
    const placeholders = params.map((_, v) => '$' + (v + 1)).join(',');
    const sql = `SELECT * FROM ${escapeIdentifier(functionName)}(${placeholders});`;
    const result = await this.queryAsync(sql, params);
    debug('call() success', 'rowCount:', result.rowCount);
    return result;
  }

  /**
   * Calls the given sproc with the specified parameters. Errors if the
   * sproc does not return exactly one row.
   */
  async callOneRowAsync(functionName: string, params: any[]): Promise<pg.QueryResult> {
    debug('callOneRow()', 'function:', functionName);
    debug('callOneRow()', 'params:', debugParams(params));
    const result = await this.callAsync(functionName, params);
    if (result.rowCount !== 1) {
      throw new PostgresError('Incorrect rowCount: ' + result.rowCount, {
        functionName,
        sqlParams: params,
      });
    }
    debug('callOneRow() success', 'rowCount:', result.rowCount);
    return result;
  }

  /**
   * Calls the given sproc with the specified parameters. Errors if the
   * sproc returns more than one row.
   */
  async callZeroOrOneRowAsync(functionName: string, params: any[]): Promise<pg.QueryResult> {
    debug('callZeroOrOneRow()', 'function:', functionName);
    debug('callZeroOrOneRow()', 'params:', debugParams(params));
    const result = await this.callAsync(functionName, params);
    if (result.rowCount == null || result.rowCount > 1) {
      throw new PostgresError('Incorrect rowCount: ' + result.rowCount, {
        functionName,
        sqlParams: params,
      });
    }
    debug('callZeroOrOneRow() success', 'rowCount:', result.rowCount);
    return result;
  }

  /**
   * Calls a sproc with the specified parameters using a specific client.
   */
  async callWithClientAsync(
    client: pg.PoolClient,
    functionName: string,
    params: any[],
  ): Promise<pg.QueryResult> {
    debug('callWithClient()', 'function:', functionName);
    debug('callWithClient()', 'params:', debugParams(params));
    const placeholders = params.map((_, v) => '$' + (v + 1)).join(',');
    const sql = `SELECT * FROM ${escapeIdentifier(functionName)}(${placeholders})`;
    const result = await this.queryWithClientAsync(client, sql, params);
    debug('callWithClient() success', 'rowCount:', result.rowCount);
    return result;
  }

  /**
   * Calls a sproc with the specified parameters using a specific client.
   * Errors if the sproc does not return exactly one row.
   */
  async callWithClientOneRowAsync(
    client: pg.PoolClient,
    functionName: string,
    params: any[],
  ): Promise<pg.QueryResult> {
    debug('callWithClientOneRow()', 'function:', functionName);
    debug('callWithClientOneRow()', 'params:', debugParams(params));
    const result = await this.callWithClientAsync(client, functionName, params);
    if (result.rowCount !== 1) {
      throw new PostgresError('Incorrect rowCount: ' + result.rowCount, {
        functionName,
        sqlParams: params,
      });
    }
    debug('callWithClientOneRow() success', 'rowCount:', result.rowCount);
    return result;
  }

  /**
   * Calls a function with the specified parameters using a specific client.
   * Errors if the sproc returns more than one row.
   */
  async callWithClientZeroOrOneRowAsync(
    client: pg.PoolClient,
    functionName: string,
    params: any[],
  ): Promise<pg.QueryResult> {
    debug('callWithClientZeroOrOneRow()', 'function:', functionName);
    debug('callWithClientZeroOrOneRow()', 'params:', debugParams(params));
    const result = await this.callWithClientAsync(client, functionName, params);
    if (result.rowCount == null || result.rowCount > 1) {
      throw new PostgresError('Incorrect rowCount: ' + result.rowCount, {
        functionName,
        sqlParams: params,
      });
    }
    debug('callWithClientZeroOrOneRow() success', 'rowCount:', result.rowCount);
    return result;
  }

  async queryRows<Model extends z.ZodTypeAny>(sql: string, model: Model): Promise<z.infer<Model>[]>;
  async queryRows<Model extends z.ZodTypeAny>(
    sql: string,
    params: QueryParams,
    model: Model,
  ): Promise<z.infer<Model>[]>;
  /**
   * Executes a query with the specified parameters. Returns an array of rows
   * that conform to the given Zod schema.
   *
   * If the query returns a single column, the return value will be a list of column values.
   */
  async queryRows<Model extends z.ZodTypeAny>(
    sql: string,
    paramsOrSchema: QueryParams | Model,
    maybeModel?: Model,
  ) {
    const params = maybeModel === undefined ? {} : (paramsOrSchema as QueryParams);
    const model = maybeModel === undefined ? (paramsOrSchema as Model) : maybeModel;
    const results = await this.queryAsync(sql, params);
    if (results.fields.length === 1) {
      const columnName = results.fields[0].name;
      const rawData = results.rows.map((row) => row[columnName]);
      return z.array(model).parse(rawData);
    } else {
      return z.array(model).parse(results.rows);
    }
  }

  async queryRow<Model extends z.ZodTypeAny>(sql: string, model: Model): Promise<z.infer<Model>>;
  async queryRow<Model extends z.ZodTypeAny>(
    sql: string,
    params: QueryParams,
    model: Model,
  ): Promise<z.infer<Model>>;
  /**
   * Executes a query with the specified parameters. Returns exactly one row that conforms to the given Zod schema.
   *
   * If the query returns a single column, the return value will be the column value itself.
   */
  async queryRow<Model extends z.ZodTypeAny>(
    sql: string,
    paramsOrSchema: QueryParams | Model,
    maybeModel?: Model,
  ) {
    const params = maybeModel === undefined ? {} : (paramsOrSchema as QueryParams);
    const model = maybeModel === undefined ? (paramsOrSchema as Model) : maybeModel;
    const results = await this.queryOneRowAsync(sql, params);
    if (results.fields.length === 1) {
      const columnName = results.fields[0].name;
      return model.parse(results.rows[0][columnName]);
    } else {
      return model.parse(results.rows[0]);
    }
  }

  async queryOptionalRow<Model extends z.ZodTypeAny>(
    sql: string,
    model: Model,
  ): Promise<z.infer<Model> | null>;
  async queryOptionalRow<Model extends z.ZodTypeAny>(
    sql: string,
    params: QueryParams,
    model: Model,
  ): Promise<z.infer<Model> | null>;
  /**
   * Executes a query with the specified parameters. Returns either null or a
   * single row that conforms to the given Zod schema, and errors otherwise.
   *
   * If the query returns a single column, the return value will be the column value itself.
   */
  async queryOptionalRow<Model extends z.ZodTypeAny>(
    sql: string,
    paramsOrSchema: QueryParams | Model,
    maybeModel?: Model,
  ) {
    const params = maybeModel === undefined ? {} : (paramsOrSchema as QueryParams);
    const model = maybeModel === undefined ? (paramsOrSchema as Model) : maybeModel;
    const results = await this.queryZeroOrOneRowAsync(sql, params);
    if (results.rows.length === 0) {
      return null;
    } else if (results.fields.length === 1) {
      const columnName = results.fields[0].name;
      return model.parse(results.rows[0][columnName]);
    } else {
      return model.parse(results.rows[0]);
    }
  }

  async callRows<Model extends z.ZodTypeAny>(sql: string, model: Model): Promise<z.infer<Model>[]>;
  async callRows<Model extends z.ZodTypeAny>(
    sql: string,
    params: any[],
    model: Model,
  ): Promise<z.infer<Model>[]>;
  /**
   * Calls the given sproc with the specified parameters.
   * Errors if the sproc does not return anything.
   */
  async callRows<Model extends z.ZodTypeAny>(
    sql: string,
    paramsOrSchema: any[] | Model,
    maybeModel?: Model,
  ) {
    const params = maybeModel === undefined ? [] : (paramsOrSchema as any[]);
    const model = maybeModel === undefined ? (paramsOrSchema as Model) : maybeModel;
    const results = await this.callAsync(sql, params);
    if (results.fields.length === 1) {
      const columnName = results.fields[0].name;
      const rawData = results.rows.map((row) => row[columnName]);
      return z.array(model).parse(rawData);
    } else {
      return z.array(model).parse(results.rows);
    }
  }

  async callRow<Model extends z.ZodTypeAny>(sql: string, model: Model): Promise<z.infer<Model>>;
  async callRow<Model extends z.ZodTypeAny>(
    sql: string,
    params: any[],
    model: Model,
  ): Promise<z.infer<Model>>;
  /**
   * Calls the given sproc with the specified parameters.
   * Returns exactly one row from the sproc that conforms to the given Zod schema.
   */
  async callRow<Model extends z.ZodTypeAny>(
    sql: string,
    paramsOrSchema: any[] | Model,
    maybeModel?: Model,
  ) {
    const params = maybeModel === undefined ? [] : (paramsOrSchema as any[]);
    const model = maybeModel === undefined ? (paramsOrSchema as Model) : maybeModel;
    const results = await this.callOneRowAsync(sql, params);
    if (results.fields.length === 1) {
      const columnName = results.fields[0].name;
      return model.parse(results.rows[0][columnName]);
    } else {
      return model.parse(results.rows[0]);
    }
  }

  async callOptionalRow<Model extends z.ZodTypeAny>(
    sql: string,
    model: Model,
  ): Promise<z.infer<Model> | null>;
  async callOptionalRow<Model extends z.ZodTypeAny>(
    sql: string,
    params: any[],
    model: Model,
  ): Promise<z.infer<Model> | null>;
  /**
   * Calls the given sproc with the specified parameters. Returns either null
   * or a single row that conforms to the given Zod schema.
   */
  async callOptionalRow<Model extends z.ZodTypeAny>(
    sql: string,
    paramsOrSchema: any[] | Model,
    maybeModel?: Model,
  ) {
    const params = maybeModel === undefined ? [] : (paramsOrSchema as any[]);
    const model = maybeModel === undefined ? (paramsOrSchema as Model) : maybeModel;
    const results = await this.callZeroOrOneRowAsync(sql, params);
    if (results.rows.length === 0) {
      return null;
    } else if (results.fields.length === 1) {
      const columnName = results.fields[0].name;
      return model.parse(results.rows[0][columnName]);
    } else {
      return model.parse(results.rows[0]);
    }
  }

  /**
   * Executes a query with the specified parameters. Returns the number of rows affected.
   */
  async execute(sql: string, params: QueryParams = {}): Promise<number> {
    const result = await this.queryAsync(sql, params);
    return result.rowCount ?? 0;
  }

  /**
   * Executes a query with the specified parameter, and errors if the query doesn't return exactly one row.
   */
  async executeRow(sql: string, params: QueryParams = {}) {
    const rowCount = await this.execute(sql, params);
    if (rowCount !== 1) {
      throw new PostgresError('Incorrect rowCount: ' + rowCount, {
        sql,
        sqlParams: params,
      });
    }
  }

  /**
   * Returns a {@link Cursor} for the given query. The cursor can be used to
   * read results in batches, which is useful for large result sets.
   */
  private async queryCursorWithClient(
    client: pg.PoolClient,
    sql: string,
    params: QueryParams,
  ): Promise<Cursor> {
    this._queryCount += 1;
    debug('queryCursorWithClient()', 'sql:', debugString(sql));
    debug('queryCursorWithClient()', 'params:', debugParams(params));
    const { processedSql, paramsArray } = paramsToArray(sql, params, this.errorOnUnusedParameters);
    lastQueryMap.set(client, processedSql);
    return client.query(new Cursor(processedSql, paramsArray));
  }

  async queryCursor<Model extends z.ZodTypeAny>(
    sql: string,
    model: Model,
  ): Promise<CursorIterator<z.infer<Model>>>;

  async queryCursor<Model extends z.ZodTypeAny>(
    sql: string,
    params: QueryParams,
    model: Model,
  ): Promise<CursorIterator<z.infer<Model>>>;

  /**
   * Returns an {@link CursorIterator} that can be used to iterate over the
   * results of the query in batches, which is useful for large result sets.
   * Each row will be parsed by the given Zod schema.
   */
  async queryCursor<Model extends z.ZodTypeAny>(
    sql: string,
    paramsOrSchema: Model | QueryParams,
    maybeModel?: Model,
  ): Promise<CursorIterator<z.infer<Model>>> {
    const params = maybeModel === undefined ? {} : (paramsOrSchema as QueryParams);
    const model = maybeModel === undefined ? (paramsOrSchema as Model) : maybeModel;
    return this.queryCursorInternal(sql, params, model);
  }

  private async queryCursorInternal<Model extends z.ZodTypeAny>(
    sql: string,
    params: QueryParams,
    model?: Model,
  ): Promise<CursorIterator<z.infer<Model>>> {
    const client = await this.getClientAsync();
    const cursor = await this.queryCursorWithClient(client, sql, params);

    let iterateCalled = false;
    let rowKeys: string[] | null = null;
    const iterator: CursorIterator<z.infer<Model>> = {
      async *iterate(batchSize: number) {
        // Safety check: if someone calls iterate multiple times, they're
        // definitely doing something wrong.
        if (iterateCalled) {
          throw new Error('iterate() called multiple times');
        }
        iterateCalled = true;

        try {
          while (true) {
            const rows = await cursor.read(batchSize);
            if (rows.length === 0) {
              break;
            }

            if (rowKeys === null) {
              rowKeys = Object.keys(rows[0] ?? {});
            }
            const flattened =
              rowKeys.length === 1 ? rows.map((row) => row[(rowKeys as string[])[0]]) : rows;
            if (model) {
              yield z.array(model).parse(flattened);
            } else {
              yield flattened;
            }
          }
        } catch (err: any) {
          throw enhanceError(err, sql, params);
        } finally {
          try {
            await cursor.close();
          } finally {
            client.release();
          }
        }
      },
      stream(batchSize: number) {
        const transform = new Transform({
          readableObjectMode: true,
          writableObjectMode: true,
          transform(chunk, _encoding, callback) {
            for (const row of chunk) {
              this.push(row);
            }
            callback();
          },
        });

        // TODO: use native `node:stream#compose` once it's stable.
        const generator = iterator.iterate(batchSize);
        const pipe = multipipe(Readable.from(generator), transform);

        // When the underlying stream is closed, we need to make sure that the
        // cursor is also closed. We do this by calling `return()` on the generator,
        // which will trigger its `finally` block, which will in turn release
        // the client and close the cursor. The fact that the stream is already
        // closed by this point means that someone reading from the stream will
        // never actually see the `null` value that's returned.
        pipe.once('close', () => {
          generator.return(null);
        });

        return pipe;
      },
    };
    return iterator;
  }

  /**
   * Set the schema to use for the search path.
   *
   * @param schema The schema name to use (can be "null" to unset the search path)
   */
  async setSearchSchema(schema: string | null) {
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
   * @returns schema in use (may be `null` to indicate no schema)
   */
  getSearchSchema(): string | null {
    return this.searchSchema;
  }

  /**
   * Generate, set, and return a random schema name.
   *
   * @param prefix The prefix of the new schema, only the first 28 characters will be used (after lowercasing).
   * @returns The randomly-generated search schema.
   */
  async setRandomSearchSchemaAsync(prefix: string): Promise<string> {
    // truncated prefix (max 28 characters)
    const truncPrefix = prefix.slice(0, 28);
    // timestamp in format YYYY-MM-DDTHH:MM:SS.SSSZ (guaranteed to not exceed 27 characters in the spec)
    const timestamp = new Date().toISOString();
    // random 6-character suffix to avoid clashes (approx 1.4 billion possible values)
    const suffix = sampleSize([...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'], 6).join('');

    // Schema is guaranteed to have length at most 63 (= 28 + 1 + 27 + 1 + 6),
    // which is the default PostgreSQL identifier limit.
    // Note that this schema name will need quoting because of characters like ':', '-', etc
    const schema = `${truncPrefix}_${timestamp}_${suffix}`;
    await this.setSearchSchema(schema);
    return schema;
  }

  /**
   * Deletes all schemas starting with the given prefix.
   *
   * @param prefix The prefix of the schemas to delete.
   */
  async clearSchemasStartingWith(prefix: string): Promise<void> {
    // Sanity check against deleting public, pg_, information_schema, etc.
    if (prefix === 'public' || prefix.startsWith('pg_') || prefix === 'information_schema') {
      throw new Error(`Cannot clear schema starting with ${prefix}`);
    }
    // Sanity check against a bad prefix.
    if (prefix.length < 4) {
      throw new Error(`Prefix is too short: ${prefix}`);
    }

    await this.queryAsync(
      `DO $$
    DECLARE
      r RECORD;
    BEGIN
      FOR r IN
        SELECT nspname
        FROM pg_namespace
        WHERE nspname LIKE ${escapeLiteral(prefix + '%')}
          AND nspname NOT LIKE 'pg_temp_%'
      LOOP
        EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE;', r.nspname);
        COMMIT;  -- avoid shared memory exhaustion
      END LOOP;
    END $$;`,
      {},
    );
  }

  /** The number of established connections. */
  get totalCount() {
    return this.pool?.totalCount ?? 0;
  }

  /** The number of idle connections. */
  get idleCount() {
    return this.pool?.idleCount ?? 0;
  }

  /** The number of queries waiting for a connection to become available. */
  get waitingCount() {
    return this.pool?.waitingCount ?? 0;
  }

  /** The total number of queries that have been executed by this pool. */
  get queryCount() {
    return this._queryCount;
  }
}
