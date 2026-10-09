import { loadSqlEquiv, queryOptionalRow, queryScalar } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { type Workspace, WorkspaceSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export function selectOptionalWorkspace(workspace_id: string): Promise<Workspace | null> {
  return queryOptionalRow(sql.select_workspace, { workspace_id }, WorkspaceSchema);
}

export function selectVariantIdForWorkspace(workspace_id: string): Promise<string> {
  return queryScalar(sql.select_variant_id_for_workspace, { workspace_id }, IdSchema);
}
