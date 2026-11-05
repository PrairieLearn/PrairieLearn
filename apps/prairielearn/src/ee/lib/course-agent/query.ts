import { createHmac } from 'node:crypto';

import pg from 'pg';
import { z } from 'zod';

import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

const MAX_ROWS = 10_000;
const MAX_BYTES = 10 * 1024 * 1024;
const STATEMENT_TIMEOUT_MS = 10_000;
const CLAIM_LIFETIME_SECONDS = 60;

/** A failure the agent can act on, such as a SQL error or an oversized result. */
export class CourseAgentQueryError extends Error {}

let pool: pg.Pool | null = null;

/**
 * The pool must authenticate as a login role that is a member of
 * `course_agent_reader` and not of the application role. Otherwise the query
 * could switch back to the application role with `RESET ROLE`.
 */
export function initCourseAgentQueryPool(config: pg.PoolConfig) {
  pool = new pg.Pool({ ...config, max: 3 });
}

export async function closeCourseAgentQueryPool() {
  await pool?.end();
  pool = null;
}

export function courseAgentQueryAvailable() {
  return pool !== null;
}

let claimKey: Buffer | null = null;

async function signClaims({ user_id, course_id }: { user_id: string; course_id: string }) {
  claimKey ??= (await queryRow(sql.select_claim_key, z.object({ key: z.instanceof(Buffer) }))).key;
  const expiresAt = Math.floor(Date.now() / 1000) + CLAIM_LIFETIME_SECONDS;
  const payload = `${user_id}.${course_id}.${expiresAt}`;
  return `${payload}.${createHmac('sha256', claimKey).update(payload).digest('hex')}`;
}

/**
 * Runs agent-written SQL as the course agent reader and returns the result as
 * JSONL. Row-level security limits every table to the given course, and only
 * while the user still owns it.
 */
export async function runCourseAgentQuery({
  user_id,
  course_id,
  query,
}: {
  user_id: string;
  course_id: string;
  query: string;
}): Promise<string> {
  if (!pool) throw new Error('The course agent query pool is not configured');
  const claims = await signClaims({ user_id, course_id });
  // Wrapping the query as a subquery accepts only a single SELECT, VALUES, or
  // read-only WITH. Passing a parameter forces the extended protocol, which
  // rejects multiple statements.
  const text = `SELECT * FROM (\n${query.trim().replace(/;+$/, '')}\n) AS course_agent_result LIMIT $1`;
  const client = await pool.connect();
  let result: pg.QueryArrayResult;
  try {
    await client.query(sql.configure_session, [String(STATEMENT_TIMEOUT_MS), claims]);
    result = await client.query({ text, values: [MAX_ROWS + 1], rowMode: 'array' });
  } catch (err) {
    if (err instanceof pg.DatabaseError) throw new CourseAgentQueryError(err.message);
    throw err;
  } finally {
    // The query may have changed session settings or taken advisory locks, so
    // never return this connection to the pool.
    client.release(true);
  }
  if (result.rows.length > MAX_ROWS) {
    throw new CourseAgentQueryError(
      `The query returned more than ${MAX_ROWS} rows. Aggregate or add a LIMIT.`,
    );
  }
  const seen = new Map<string, number>();
  const columns = result.fields.map(({ name }) => {
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    return count === 1 ? name : `${name}_${count}`;
  });
  let bytes = 0;
  const lines = result.rows.map((row) => {
    const line = JSON.stringify(Object.fromEntries(columns.map((name, i) => [name, row[i]])));
    bytes += Buffer.byteLength(line) + 1;
    if (bytes > MAX_BYTES) {
      throw new CourseAgentQueryError(
        'The query result is larger than 10 MB. Select fewer columns or rows.',
      );
    }
    return line;
  });
  return lines.map((line) => `${line}\n`).join('');
}
