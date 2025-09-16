import { z } from 'zod';

import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';
import * as workspaceUtils from '@prairielearn/workspace-utils';
import { IdSchema } from '@prairielearn/zod';

import { config } from '../lib/config.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export async function run() {
  const workspaces = await sqldb.queryRows(
    sql.select_almost_launched_timeout_workspaces,
    {
      launched_timeout_sec: config.workspaceLaunchedTimeoutSec,
      launched_timeout_warn_sec: config.workspaceLaunchedTimeoutWarnSec,
    },
    z.object({
      id: IdSchema,
      time_to_timeout_sec: z.number(),
    }),
  );
  for (const workspace of workspaces) {
    logger.verbose(`workspaceTimeoutWarn: timeout warning for workspace_id = ${workspace.id}`);
    const time_to_timeout_min = Math.ceil(workspace.time_to_timeout_sec / 60);
    await workspaceUtils.updateWorkspaceMessage(
      workspace.id,
      `WARNING: This workspace will stop in < ${time_to_timeout_min} min. Click "Reboot" to keep working.`,
    );
  }
}
