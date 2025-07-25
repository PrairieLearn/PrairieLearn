import { type CursorIterator, PostgresPool, type QueryParams } from './pool.js';

const defaultPool = new PostgresPool();
export { defaultPool, type CursorIterator, type QueryParams };

// We re-expose all functions from the default pool here to account for the
// default case of a shared global pool of clients. If someone want to create
// their own pool, we expose the `PostgresPool` class.
//
// Note that we explicitly bind all functions to `defaultPool`. This ensures
// that they'll be invoked with the correct `this` context, specifically when
// this module is imported as `import * as db from '...'` and that import is
// subsequently transformed by Babel to `interopRequireWildcard(...)`.

// VSCode currently doesn't allow for us to use `inheritDoc` to inherit the
// documentation from the `PostgresPool` class. We mirror the documentation
// here for *async methods* in VSCode intellisense.

export const init = defaultPool.init.bind(defaultPool);
/**
 * Creates a new connection pool and attempts to connect to the database.
 */
export const initAsync = defaultPool.initAsync.bind(defaultPool);
export const close = defaultPool.close.bind(defaultPool);
/**
 * Closes the connection pool.
 */
export const closeAsync = defaultPool.closeAsync.bind(defaultPool);
/**
 * Gets a new client from the connection pool. If `err` is not null
 * then `client` and `done` are undefined. If `err` is null then
 * `client` is valid and can be used. The caller MUST call `done()` to
 * release the client, whether or not errors occurred while using
 * `client`. The client can call `done(truthy_value)` to force
 * destruction of the client, but this should not be used except in
 * unusual circumstances.
 */
export const getClientAsync = defaultPool.getClientAsync.bind(defaultPool);

/**
 * Performs a query with the given client.
 */
export const queryWithClientAsync = defaultPool.queryWithClientAsync.bind(defaultPool);

/**
 * Performs a query with the given client. Errors if the query returns more
 * than one row.
 */
export const queryWithClientOneRowAsync = defaultPool.queryWithClientOneRowAsync.bind(defaultPool);

/**
 * Performs a query with the given client. Errors if the query returns more
 * than one row.
 */
export const queryWithClientZeroOrOneRowAsync =
  defaultPool.queryWithClientZeroOrOneRowAsync.bind(defaultPool);
/**
 * Rolls back the current transaction for the given client.
 */
export const rollbackWithClientAsync = defaultPool.rollbackWithClientAsync.bind(defaultPool);
export const beginTransactionAsync = defaultPool.beginTransactionAsync.bind(defaultPool);
/**
 * Commits the transaction if err is null, otherwise rollbacks the transaction.
 * Also releases the client.
 */
export const endTransactionAsync = defaultPool.endTransactionAsync.bind(defaultPool);
/**
 * Runs the specified function inside of a transaction. The function will
 * receive a database client as an argument, but it can also make queries
 * as usual, and the correct client will be used automatically.
 *
 * The transaction will be rolled back if the function throws an error, and
 * will be committed otherwise.
 */
export const runInTransactionAsync = defaultPool.runInTransactionAsync.bind(defaultPool);
export const query = defaultPool.query.bind(defaultPool);
/**
 * Executes a query with the specified parameters.
 *
 * It is not recommended to use the return from this function. Instead, use
 * {@link queryRows}, {@link queryRow}, or {@link queryOptionalRow}.
 */
export const queryAsync = defaultPool.queryAsync.bind(defaultPool);
/**
 * Executes a query with the specified parameters. Errors if the query does
 * not return exactly one row.
 *
 * @deprecated Use {@link queryRow} instead.
 */
export const queryOneRowAsync = defaultPool.queryOneRowAsync.bind(defaultPool);
/**
 * Executes a query with the specified parameters. Errors if the query
 * returns more than one row.
 *
 * @deprecated Use {@link queryOptionalRow} instead.
 */
export const queryZeroOrOneRowAsync = defaultPool.queryZeroOrOneRowAsync.bind(defaultPool);
/**
 * Calls the given function with the specified parameters.
 *
 * @deprecated Use {@link callRows} instead.
 */
export const callAsync = defaultPool.callAsync.bind(defaultPool);
/**
 * Calls the given function with the specified parameters. Errors if the
 * function does not return exactly one row.
 *
 * @deprecated Use {@link callRow} instead.
 */
export const callOneRowAsync = defaultPool.callOneRowAsync.bind(defaultPool);
/**
 * Calls the given function with the specified parameters. Errors if the
 * function returns more than one row.
 *
 * @deprecated Use {@link callOptionalRow} instead.
 */
export const callZeroOrOneRowAsync = defaultPool.callZeroOrOneRowAsync.bind(defaultPool);
/**
 * Calls a function with the specified parameters using a specific client.
 */
export const callWithClientAsync = defaultPool.callWithClientAsync.bind(defaultPool);
/**
 * Calls a function with the specified parameters using a specific client.
 * Errors if the function does not return exactly one row.
 */
export const callWithClientOneRowAsync = defaultPool.callWithClientOneRowAsync.bind(defaultPool);
/**
 * Calls a function with the specified parameters using a specific client.
 * Errors if the function returns more than one row.
 */
export const callWithClientZeroOrOneRowAsync =
  defaultPool.callWithClientZeroOrOneRowAsync.bind(defaultPool);
export const queryRows = defaultPool.queryRows.bind(defaultPool);
/**
 * Wrapper around {@link queryOneRowAsync} that parses the resulting row with
 * the given Zod schema. If the query doesn't return exactly one row, an error
 * is thrown.
 */
export const queryRow = defaultPool.queryRow.bind(defaultPool);
/**
 * Wrapper around {@link queryZeroOrOneRowAsync} that parses the resulting row
 * (if any) with the given Zod schema. Returns either null or a single row, and
 * errors otherwise.
 */
export const queryOptionalRow = defaultPool.queryOptionalRow.bind(defaultPool);
export const callRows = defaultPool.callRows.bind(defaultPool);
export const callRow = defaultPool.callRow.bind(defaultPool);
export const callOptionalRow = defaultPool.callOptionalRow.bind(defaultPool);
/**
 * Returns a {@link Cursor} for the given query. The cursor can be used to
 * read results in batches, which is useful for large result sets.
 */
export const queryCursorWithClient = defaultPool.queryCursorWithClient.bind(defaultPool);
/**
 * Returns an {@link CursorIterator} that can be used to iterate over the
 * results of the query in batches, which is useful for large result sets.
 *
 * @deprecated Use {@link queryValidatedCursor} instead.
 */
export const queryCursor = defaultPool.queryCursor.bind(defaultPool);
/**
 * Returns an {@link CursorIterator} that can be used to iterate over the
 * results of the query in batches, which is useful for large result sets.
 * Each row will be parsed by the given Zod schema.
 */
export const queryValidatedCursor = defaultPool.queryValidatedCursor.bind(defaultPool);
/**
 * Set the schema to use for the search path.
 *
 * @param schema The schema name to use (can be "null" to unset the search path)
 */
export const setSearchSchema = defaultPool.setSearchSchema.bind(defaultPool);
/**
 * Get the schema that is currently used for the search path.
 *
 * @return schema in use (may be `null` to indicate no schema)
 */
export const getSearchSchema = defaultPool.getSearchSchema.bind(defaultPool);
export const setRandomSearchSchema = defaultPool.setRandomSearchSchema.bind(defaultPool);
/**
 * Generate, set, and return a random schema name.
 *
 * @param prefix The prefix of the new schema, only the first 28 characters will be used (after lowercasing).
 * @returns The randomly-generated search schema.
 */
export const setRandomSearchSchemaAsync = defaultPool.setRandomSearchSchemaAsync.bind(defaultPool);
