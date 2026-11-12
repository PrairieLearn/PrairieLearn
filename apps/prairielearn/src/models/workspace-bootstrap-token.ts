import { execute, loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { type WorkspaceBootstrapToken, WorkspaceBootstrapTokenSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function insertWorkspaceBootstrapToken(
  token: Omit<WorkspaceBootstrapToken, 'id' | 'expires_at'>,
) {
  await execute(sql.insert_workspace_bootstrap_token, token);
}

export async function consumeWorkspaceBootstrapToken({
  token_hash,
  workspace_id,
}: Pick<WorkspaceBootstrapToken, 'token_hash' | 'workspace_id'>) {
  // DELETE ... RETURNING makes redemption single-use even across concurrent server requests.
  return await queryOptionalRow(
    sql.consume_workspace_bootstrap_token,
    { token_hash, workspace_id },
    WorkspaceBootstrapTokenSchema,
  );
}

export async function deleteExpiredWorkspaceBootstrapTokens() {
  await execute(sql.delete_expired_workspace_bootstrap_tokens);
}
