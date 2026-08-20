// Read-only SQL access for the agent.
//
// This is deliberately a single general-purpose tool rather than dozens of
// typed accessors: the set of questions an instructor might ask about their
// course is unbounded, and PrairieLearn already stores the answers. Safety comes
// from the transaction, not from a restricted verb list.

import * as sqldb from '@prairielearn/postgres';

const MAX_ROWS = 1000;
const STATEMENT_TIMEOUT_MS = 15_000;

/**
 * Statements that would mutate data. Checked as a cheap second guard; the real
 * protection is the read-only transaction, which the database enforces.
 */
const FORBIDDEN_KEYWORDS = [
  'insert',
  'update',
  'delete',
  'truncate',
  'drop',
  'alter',
  'create',
  'grant',
  'revoke',
  'copy',
  'vacuum',
  'reindex',
  'refresh',
  'call',
  'do',
  'set',
  'reset',
  'listen',
  'notify',
];

/** Strips string literals, dollar-quoted blocks, and comments before scanning. */
function stripLiteralsAndComments(sql: string): string {
  return sql
    .replaceAll(/\$\w*\$[\s\S]*?\$\w*\$/g, ' ')
    .replaceAll(/'(?:''|[^'])*'/g, ' ')
    .replaceAll(/"(?:""|[^"])*"/g, ' ')
    .replaceAll(/--[^\n]*/g, ' ')
    .replaceAll(/\/\*[\s\S]*?\*\//g, ' ');
}

class QueryRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryRejectedError';
  }
}

function assertQueryIsReadOnly(query: string) {
  const scannable = stripLiteralsAndComments(query);
  const normalized = scannable.trim().toLowerCase();

  if (normalized.length === 0) {
    throw new QueryRejectedError('Query is empty.');
  }

  if (!/^(select|with)\b/.test(normalized)) {
    throw new QueryRejectedError('Only SELECT and WITH queries are allowed.');
  }

  // Reject multiple statements. A trailing semicolon is fine.
  const withoutTrailingSemicolon = normalized.replace(/;\s*$/, '');
  if (withoutTrailingSemicolon.includes(';')) {
    throw new QueryRejectedError('Only a single statement is allowed.');
  }

  for (const keyword of FORBIDDEN_KEYWORDS) {
    if (new RegExp(`\\b${keyword}\\b`).test(withoutTrailingSemicolon)) {
      throw new QueryRejectedError(`Query contains forbidden keyword "${keyword}".`);
    }
  }
}

export interface QueryCourseDataResult {
  rowCount: number;
  /** True when results were cut off at {@link MAX_ROWS}. */
  truncated: boolean;
  columns: string[];
  rows: Record<string, any>[];
}

/**
 * Runs a single read-only query inside a read-only transaction with a statement
 * timeout. Row count is capped so a careless `SELECT *` can't exhaust memory.
 *
 * The query runs on the raw client rather than through `queryAsync` so that
 * PrairieLearn's named-parameter interpolation doesn't rewrite `$` characters
 * in agent-authored SQL.
 */
export async function queryCourseData(query: string): Promise<QueryCourseDataResult> {
  assertQueryIsReadOnly(query);

  return await sqldb.runInTransactionAsync(async (client) => {
    // Enforced by Postgres for the duration of this transaction, so it holds
    // even if the keyword scan above is fooled.
    await client.query('SET TRANSACTION READ ONLY');
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);

    const result = await client.query(query);
    const rows = result.rows.slice(0, MAX_ROWS);

    return {
      rowCount: result.rows.length,
      truncated: result.rows.length > MAX_ROWS,
      columns: result.fields.map((field) => field.name),
      rows,
    };
  });
}
