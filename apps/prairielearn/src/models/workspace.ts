import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { IdSchema, type Workspace, WorkspaceSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export function selectWorkspace(workspace_id: string): Promise<Workspace> {
  return queryRow(sql.select_workspace, { workspace_id }, WorkspaceSchema);
}

export function selectVariantIdForWorkspace(workspace_id: string): Promise<string> {
  return queryRow(sql.select_variant_id_for_workspace, { workspace_id }, IdSchema);
}
