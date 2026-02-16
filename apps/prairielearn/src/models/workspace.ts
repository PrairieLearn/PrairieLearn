import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

const sql = loadSqlEquiv(import.meta.url);

export function selectVariantIdForWorkspace(workspace_id: string): Promise<string> {
  return queryRow(sql.select_variant_id_for_workspace, { workspace_id }, IdSchema);
}
