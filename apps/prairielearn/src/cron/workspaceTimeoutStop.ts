import { logger } from '@prairielearn/logger';
import { metrics, getCounter, ValueType } from '@prairielearn/opentelemetry';
import * as sqldb from '@prairielearn/postgres';
import * as workspaceUtils from '@prairielearn/workspace-utils';

import { config } from '../lib/config';

const sql = sqldb.loadSqlEquiv(__filename);

async function stopLaunchedTimeoutWorkspaces() {
  const meter = metrics.getMeter('prairielearn');
  const launchedTimeoutCounter = getCounter(meter, 'workspace.stopped.launched_timeout', {
    valueType: ValueType.INT,
  });

  const result = await sqldb.queryAsync(sql.select_launched_timeout_workspaces, {
    launched_timeout_sec: config.workspaceLaunchedTimeoutSec,
  });
  for (const workspace of result.rows) {
    logger.verbose(`workspaceTimeoutStop: launched timeout for workspace_id = ${workspace.id}`);
    await workspaceUtils.updateWorkspaceState(
      workspace.id,
      'stopped',
      `Maximum run time of ${Math.round(
        config.workspaceLaunchedTimeoutSec / 3600,
      )} hours exceeded. Click "Reboot" to keep working.`,
    );
    launchedTimeoutCounter.add(1);
  }
}

async function stopHeartbeatTimeoutWorkspaces() {
  const meter = metrics.getMeter('prairielearn');
  const visibilityTimeoutCounter = getCounter(meter, 'workspace.stopped.heartbeat_timeout', {
    valueType: ValueType.INT,
  });

  const result = await sqldb.queryAsync(sql.select_heartbeat_timeout_workspaces, {
    heartbeat_timeout_sec: config.workspaceHeartbeatTimeoutSec,
  });
  for (const workspace of result.rows) {
    logger.verbose(`workspaceTimeoutStop: heartbeat timeout for workspace_id = ${workspace.id}`);
    await workspaceUtils.updateWorkspaceState(
      workspace.id,
      'stopped',
      `Connection was lost for more than ${Math.round(
        config.workspaceHeartbeatTimeoutSec / 60,
      )} min. Click "Reboot" to keep working.`,
    );
    visibilityTimeoutCounter.add(1);
  }
}

async function stopInLaunchingTimeoutWorkspaces() {
  const meter = metrics.getMeter('prairielearn');
  const launchingTimeoutCounter = getCounter(meter, 'workspace.stopped.launching_timeout', {
    valueType: ValueType.INT,
  });

  const result = await sqldb.queryAsync(sql.select_in_launching_timeout_workspaces, {
    in_launching_timeout_sec: config.workspaceInLaunchingTimeoutSec,
  });
  const workspaces = result.rows;
  for (const workspace of workspaces) {
    // these are errors because timeouts should have been enforced
    // by the workspace hosts
    logger.error(`workspaceTimeoutStop: in-launching timeout for workspace_id = ${workspace.id}`);
    await workspaceUtils.updateWorkspaceState(
      workspace.id,
      'stopped',
      `Maximum launching time of ${Math.round(
        config.workspaceInLaunchingTimeoutSec / 60,
      )} min exceeded. Click "Reboot" to keep working.`,
    );
    launchingTimeoutCounter.add(1);
  }
}

export async function run() {
  await stopLaunchedTimeoutWorkspaces();
  await stopHeartbeatTimeoutWorkspaces();
  await stopInLaunchingTimeoutWorkspaces();
}
