import { makeBatchedMigration } from '@prairielearn/migrations';
import { queryOneRowAsync, queryRows } from '@prairielearn/postgres';
import { updateWorkspaceDiskUsage } from '@prairielearn/workspace-utils';

import { config } from '../lib/config';
import { WorkspaceSchema } from '../lib/db-types';

export default makeBatchedMigration({
  async getParameters() {
    const result = await queryOneRowAsync('SELECT MAX(id) as max from workspaces;', {});
    return {
      min: 1n,
      max: result.rows[0].max,
      batchSize: 100,
    };
  },
  async execute(min: bigint, max: bigint): Promise<void> {
    const workspaces = await queryRows(
      'SELECT * FROM workspaces WHERE id >= $min AND id <= $max',
      { min, max },
      WorkspaceSchema,
    );

    for (const workspace of workspaces) {
      await updateWorkspaceDiskUsage(workspace.id, config.workspaceHomeDirRoot);
    }
  },
});
