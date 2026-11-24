import { z } from 'zod';

import { execute, loadSqlEquiv, queryRow, queryRows, queryScalar } from '@prairielearn/postgres';
import * as workspaceUtils from '@prairielearn/workspace-utils';

import {
  type WorkspaceHost,
  WorkspaceHostSchema,
  type WorkspaceLog,
  WorkspaceLogSchema,
} from './db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Marks the given workspace host as unhealthy.
 *
 * @returns All updated workspace hosts
 */
export async function markWorkspaceHostUnhealthy(
  workspace_host_id: string,
  reason: string,
): Promise<WorkspaceHost> {
  return await queryRow(
    sql.set_hosts_unhealthy,
    {
      workspace_host_id,
      reason,
    },
    WorkspaceHostSchema,
  );
}

/**
 * Marks all active workspace hosts as unhealthy.
 *
 * @returns All updated workspace hosts
 */
export async function markAllWorkspaceHostsUnhealthy(reason: string): Promise<WorkspaceHost[]> {
  return await queryRows(
    sql.set_hosts_unhealthy,
    { workspace_host_id: null, reason },
    WorkspaceHostSchema,
  );
}

export interface WorkspaceHostAssignment {
  /** Null if no host had capacity, or if the launch is no longer current. */
  workspace_host_id: string | null;
  launch_current: boolean;
}

/**
 * Assigns a host to a workspace launch. A launch that has been superseded by
 * a reboot or a reset is not assigned, since that would take the workspace
 * away from the host its replacement is running on.
 */
export async function assignWorkspaceToHost(
  launch: { id: string; launch_uuid: string },
  capacity: number,
): Promise<WorkspaceHostAssignment> {
  const params = { workspace_id: launch.id, launch_uuid: launch.launch_uuid };
  const workspace_host_id = await queryScalar(
    sql.assign_workspace_to_host,
    { ...params, capacity },
    z.string().nullable(),
  );
  if (workspace_host_id !== null) return { workspace_host_id, launch_current: true };

  // The assignment's snapshot does not show a replacement launch that
  // committed while it waited for a host lock, so check in a new statement.
  const launch_current = await workspaceUtils.isWorkspaceLaunchCurrent(launch);
  return { workspace_host_id: null, launch_current };
}

/**
 * Recaptures up to the specified number of draining workspace hosts.
 *
 * @param needed_hosts How many hosts are needed
 * @returns The number of hosts that were recaptured
 */
export async function recaptureDrainingWorkspaceHosts(needed_hosts: number) {
  return await queryScalar(sql.recapture_draining_hosts, { needed_hosts }, z.number());
}

export async function drainExtraWorkspaceHosts(surplus: number) {
  await execute(sql.drain_extra_hosts, { surplus });
}

/**
 * Finds workspace hosts that are terminable and marks them as terminating.
 * Returns the workspace hosts that were marked as terminating.
 */
export async function findTerminableWorkspaceHosts(
  unhealthy_timeout_sec: number,
  launch_timeout_sec: number,
): Promise<WorkspaceHost[]> {
  return await queryRows(
    sql.find_terminable_hosts,
    {
      unhealthy_timeout_sec,
      launch_timeout_sec,
    },
    WorkspaceHostSchema,
  );
}

/**
 * Finds the workspace hosts with the given instance IDs and marks them as
 * `terminated` if they are not in the `launching` state. Returns a list of
 * affected workspaces.
 *
 * @param instanceIds The instance IDs of the workspace hosts to terminate
 * @returns The workspaces on the terminated hosts
 */
export async function terminateWorkspaceHostsIfNotLaunching(
  instanceIds: string[],
): Promise<WorkspaceLog[]> {
  return await queryRows(
    sql.terminate_hosts_if_not_launching,
    { instance_ids: instanceIds },
    WorkspaceLogSchema,
  );
}
