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
    // We skip all workspaces that already have a disk usage value.
    const workspaces = await queryRows(
      'SELECT * FROM workspaces WHERE id >= $min AND id <= $max AND disk_usage_bytes IS NULL',
      { min, max },
      WorkspaceSchema,
    );

    for (const workspace of workspaces) {
      await updateWorkspaceDiskUsage(workspace.id, config.workspaceHomeDirRoot);
    }
  },
});
