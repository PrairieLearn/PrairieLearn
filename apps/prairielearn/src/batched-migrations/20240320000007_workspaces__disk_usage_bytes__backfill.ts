import z from 'zod';

import { makeBatchedMigration } from '@prairielearn/migrations';
import { queryRow, queryRows } from '@prairielearn/postgres';
import { updateWorkspaceDiskUsage } from '@prairielearn/workspace-utils';

import { config } from '../lib/config.js';
import { WorkspaceSchema } from '../lib/db-types.js';

export default makeBatchedMigration({
  async getParameters() {
    const max = await queryRow(
      'SELECT MAX(id) as max from workspaces;',
      z.bigint({ coerce: true }).nullable(),
    );
    return {
      min: 1n,
      max,
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
