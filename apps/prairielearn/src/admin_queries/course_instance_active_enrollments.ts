import { loadSqlEquiv, queryAsync } from '@prairielearn/postgres';

import type { AdministratorQueryResult } from './index.types.js';

const sql = loadSqlEquiv(import.meta.url);

export default async function (params: Record<string, string>): Promise<AdministratorQueryResult> {
  const result = await queryAsync(sql.admin_query, params);
  return { rows: result.rows, columns: result.fields.map((field) => field.name) };
}
