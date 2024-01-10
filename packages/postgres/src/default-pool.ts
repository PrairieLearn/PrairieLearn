import { PostgresPool, type CursorIterator, type QueryParams } from './pool';

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
export const init = defaultPool.init.bind(defaultPool);
export const initAsync = defaultPool.initAsync.bind(defaultPool);
export const close = defaultPool.close.bind(defaultPool);
export const closeAsync = defaultPool.closeAsync.bind(defaultPool);
export const getClientAsync = defaultPool.getClientAsync.bind(defaultPool);
export const getClient = defaultPool.getClient.bind(defaultPool);
export const queryWithClient = defaultPool.queryWithClient.bind(defaultPool);
export const queryWithClientAsync = defaultPool.queryWithClientAsync.bind(defaultPool);
export const queryWithClientOneRow = defaultPool.queryWithClientOneRow.bind(defaultPool);
export const queryWithClientOneRowAsync = defaultPool.queryWithClientOneRowAsync.bind(defaultPool);
export const queryWithClientZeroOrOneRow =
  defaultPool.queryWithClientZeroOrOneRow.bind(defaultPool);
export const queryWithClientZeroOrOneRowAsync =
  defaultPool.queryWithClientZeroOrOneRowAsync.bind(defaultPool);
export const rollbackWithClientAsync = defaultPool.rollbackWithClientAsync.bind(defaultPool);
export const rollbackWithClient = defaultPool.rollbackWithClient.bind(defaultPool);
export const beginTransactionAsync = defaultPool.beginTransactionAsync.bind(defaultPool);
export const endTransactionAsync = defaultPool.endTransactionAsync.bind(defaultPool);
export const endTransaction = defaultPool.endTransaction.bind(defaultPool);
export const runInTransactionAsync = defaultPool.runInTransactionAsync.bind(defaultPool);
export const query = defaultPool.query.bind(defaultPool);
export const queryAsync = defaultPool.queryAsync.bind(defaultPool);
export const queryOneRow = defaultPool.queryOneRow.bind(defaultPool);
export const queryOneRowAsync = defaultPool.queryOneRowAsync.bind(defaultPool);
export const queryZeroOrOneRow = defaultPool.queryZeroOrOneRow.bind(defaultPool);
export const queryZeroOrOneRowAsync = defaultPool.queryZeroOrOneRowAsync.bind(defaultPool);
export const call = defaultPool.call.bind(defaultPool);
export const callAsync = defaultPool.callAsync.bind(defaultPool);
export const callOneRow = defaultPool.callOneRow.bind(defaultPool);
export const callOneRowAsync = defaultPool.callOneRowAsync.bind(defaultPool);
export const callZeroOrOneRow = defaultPool.callZeroOrOneRow.bind(defaultPool);
export const callZeroOrOneRowAsync = defaultPool.callZeroOrOneRowAsync.bind(defaultPool);
export const callWithClient = defaultPool.callWithClient.bind(defaultPool);
export const callWithClientAsync = defaultPool.callWithClientAsync.bind(defaultPool);
export const callWithClientOneRow = defaultPool.callWithClientOneRow.bind(defaultPool);
export const callWithClientOneRowAsync = defaultPool.callWithClientOneRowAsync.bind(defaultPool);
export const callWithClientZeroOrOneRow = defaultPool.callWithClientZeroOrOneRow.bind(defaultPool);
export const callWithClientZeroOrOneRowAsync =
  defaultPool.callWithClientZeroOrOneRowAsync.bind(defaultPool);
export const queryValidatedRows = defaultPool.queryValidatedRows.bind(defaultPool);
export const queryValidatedOneRow = defaultPool.queryValidatedOneRow.bind(defaultPool);
export const queryValidatedZeroOrOneRow = defaultPool.queryValidatedZeroOrOneRow.bind(defaultPool);
export const queryValidatedSingleColumnRows =
  defaultPool.queryValidatedSingleColumnRows.bind(defaultPool);
export const queryValidatedSingleColumnOneRow =
  defaultPool.queryValidatedSingleColumnOneRow.bind(defaultPool);
export const queryValidatedSingleColumnZeroOrOneRow =
  defaultPool.queryValidatedSingleColumnZeroOrOneRow.bind(defaultPool);
export const callValidatedRows = defaultPool.callValidatedRows.bind(defaultPool);
export const callValidatedOneRow = defaultPool.callValidatedOneRow.bind(defaultPool);
export const callValidatedZeroOrOneRow = defaultPool.callValidatedZeroOrOneRow.bind(defaultPool);
export const queryRows = defaultPool.queryRows.bind(defaultPool);
export const queryRow = defaultPool.queryRow.bind(defaultPool);
export const queryOptionalRow = defaultPool.queryOptionalRow.bind(defaultPool);
export const callRows = defaultPool.callRows.bind(defaultPool);
export const callRow = defaultPool.callRow.bind(defaultPool);
export const callOptionalRow = defaultPool.callOptionalRow.bind(defaultPool);
export const queryCursorWithClient = defaultPool.queryCursorWithClient.bind(defaultPool);
export const queryCursor = defaultPool.queryCursor.bind(defaultPool);
export const queryValidatedCursor = defaultPool.queryValidatedCursor.bind(defaultPool);
export const setSearchSchema = defaultPool.setSearchSchema.bind(defaultPool);
export const getSearchSchema = defaultPool.getSearchSchema.bind(defaultPool);
export const setRandomSearchSchema = defaultPool.setRandomSearchSchema.bind(defaultPool);
export const setRandomSearchSchemaAsync = defaultPool.setRandomSearchSchemaAsync.bind(defaultPool);
