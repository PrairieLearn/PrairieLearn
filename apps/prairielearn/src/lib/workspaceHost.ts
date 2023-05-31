import { z } from 'zod';
import {
  loadSqlEquiv,
  queryAsync,
  queryOptionalRow,
  queryRow,
  queryRows,
} from '@prairielearn/postgres';

const sql = loadSqlEquiv(__filename);

const WorkspaceHostSchema = z.object({
  id: z.string(),
  instance_id: z.string(),
});
type WorkspaceHost = z.infer<typeof WorkspaceHostSchema>;

const WorkspaceLogSchema = z.object({
  workspace_id: z.string(),
  state: z.string(),
  message: z.string(),
});
type WorkspaceLog = z.infer<typeof WorkspaceLogSchema>;

/**
 * Marks the given workspace host as unhealthy.
 */
export async function markWorkspaceHostUnhealthy(workspace_host_id: string, reason: string) {
  await queryAsync(sql.set_host_unhealthy, {
    workspace_host_id,
    reason,
  });
}

export async function assignWorkspaceToHost(
  workspace_id: string,
  capacity: number
): Promise<string | null> {
  return await queryOptionalRow(
    sql.assign_workspace_to_host,
    {
      workspace_id,
      capacity,
    },
    z.string()
  );
}

/**
 * Recaptures up to the specified number of draining workspace hosts.
 *
 * @param needed_hosts How many hosts are needed
 * @returns The number of hosts that were recaptured
 */
export async function recaptureDrainingWorkspaceHosts(needed_hosts: number) {
  return await queryRow(sql.recapture_draining_hosts, { needed_hosts }, z.number());
}

export async function drainExtraWorkspaceHosts(surplus: number) {
  await queryAsync(sql.drain_extra_hosts, { surplus });
}

/**
 * Finds workspace hosts that are terminable and marks them as terminating.
 * Returns the workspace hosts that were marked as terminating.
 */
export async function findTerminableWorkspaceHosts(
  unhealthy_timeout_sec: number,
  launch_timeout_sec: number
): Promise<WorkspaceHost[]> {
  return queryRows(
    sql.find_terminable_hosts,
    {
      unhealthy_timeout_sec,
      launch_timeout_sec,
    },
    WorkspaceHostSchema
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
  instanceIds: string[]
): Promise<WorkspaceLog[]> {
  return queryRows(
    sql.terminate_hosts_if_not_launching,
    { instance_ids: instanceIds },
    WorkspaceLogSchema
  );
}
