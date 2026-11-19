import { deleteExpiredWorkspaceBootstrapTokens } from '../models/workspace-bootstrap-token.js';

export async function run() {
  await deleteExpiredWorkspaceBootstrapTokens();
}
