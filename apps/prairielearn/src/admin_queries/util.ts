import { readFile } from 'fs/promises';

import { z } from 'zod';

import { queryAsync } from '@prairielearn/postgres';

export const AdministratorQueryResultSchema = z.object({
  rows: z.record(z.any()).array(),
  columns: z.string().array(),
});
export type AdministratorQueryResult = z.infer<typeof AdministratorQueryResultSchema>;

export async function runLegacySqlAdminQuery(
  metaUrl: string,
  params: Record<string, string>,
): Promise<AdministratorQueryResult> {
  const sql = await readFile(new URL(metaUrl.replace(/\.[jt]s$/, '.sql')).pathname, {
    encoding: 'utf8',
  });
  const result = await queryAsync(sql, params);
  return { rows: result.rows, columns: result.fields.map((field) => field.name) };
}
