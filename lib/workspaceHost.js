// @ts-check
const { z } = require('zod');
const sqldb = require('@prairielearn/postgres');

const sql = sqldb.loadSqlEquiv(__filename);

const WorkspaceHostSchema = z.object({
  id: z.string(),
  instance_id: z.string(),
});

/**
 * Marks the given workspace host as unhealthy.
 *
 * @param {string | number} workspace_host_id
 * @param {string} reason
 * @returns {Promise<void>}
 */
async function markWorkspaceHostUnhealthy(workspace_host_id, reason) {
  await sqldb.queryAsync(sql.set_host_unhealthy, {
    workspace_host_id,
    reason,
  });
}

/**
 *
 * @param {string | number} workspace_id
 * @param {number} capacity
 * @return {Promise<string | null>}
 */
async function assignWorkspaceToHost(workspace_id, capacity) {
  // TODO: insert workspace_host logs, maybe workspace logs too?
  const result = await sqldb.queryZeroOrOneRowAsync(sql.assign_workspace_to_host, {
    workspace_id,
    capacity,
  });
  return result.rows[0]?.workspace_host_id ?? null;
}

/**
 * Recaptures up to the specified number of draining workspace hosts.
 *
 * @param {number} needed_hosts How many hosts are needed
 * @returns {Promise<number>} The number of hosts that were recaptured
 */
async function recaptureDrainingWorkspaceHosts(needed_hosts) {
  const result = await sqldb.queryOneRowAsync(sql.recapture_draining_hosts, {
    needed_hosts,
  });
  return result.rows[0].recaptured_hosts;
}

async function drainExtraWorkspaceHosts(surplus) {
  await sqldb.queryAsync(sql.drain_extra_hosts, { surplus });
}

/**
 * Finds workspace hosts that are terminable and marks them as terminating.
 * Returns the workspace hosts that were marked as terminating.
 *
 * @param {number} unhealthy_timeout_sec
 * @param {number} launch_timeout_sec
 * @returns {Promise<Array<z.infer<typeof WorkspaceHostSchema>>>}
 */
async function findTerminableWorkspaceHosts(unhealthy_timeout_sec, launch_timeout_sec) {
  return sqldb.queryValidatedRows(
    sql.find_terminable_hosts,
    {
      unhealthy_timeout_sec,
      launch_timeout_sec,
    },
    WorkspaceHostSchema
  );
}

module.exports = {
  markWorkspaceHostUnhealthy,
  assignWorkspaceToHost,
  recaptureDrainingWorkspaceHosts,
  drainExtraWorkspaceHosts,
  findTerminableWorkspaceHosts,
};
