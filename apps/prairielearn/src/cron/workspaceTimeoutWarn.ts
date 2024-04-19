import { config } from '../lib/config';
import { logger } from '@prairielearn/logger';
import * as workspaceUtils from '@prairielearn/workspace-utils';
import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(__filename);

export async function run() {
  const result = await sqldb.queryAsync(sql.select_almost_launched_timeout_workspaces, {
    launched_timeout_sec: config.workspaceLaunchedTimeoutSec,
    launched_timeout_warn_sec: config.workspaceLaunchedTimeoutWarnSec,
  });
  const workspaces = result.rows;
  for (const workspace of workspaces) {
    logger.verbose(`workspaceTimeoutWarn: timeout warning for workspace_id = ${workspace.id}`);
    const time_to_timeout_min = Math.ceil(workspace.time_to_timeout_sec / 60);
    await workspaceUtils.updateWorkspaceMessage(
      workspace.id,
      `WARNING: This workspace will stop in < ${time_to_timeout_min} min. Click "Reboot" to keep working.`,
    );
  }
}
