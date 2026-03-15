import { type PoolConfig } from 'pg';

import { type PoolClient, PostgresPool, loadSqlEquiv } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.filename);

export const pool = new PostgresPool();

export async function init(
  pgConfig: PoolConfig,
  idleErrorHandler: (error: Error, client: PoolClient) => void,
): Promise<void> {
  await pool.initAsync(pgConfig, idleErrorHandler);
  await pool.execute(sql.create_table);
}

export async function close(): Promise<void> {
  await pool.closeAsync();
}
