// @ts-check
const async = require('async');
const AWS = require('aws-sdk');
const { callbackify } = require('util');
const fetch = require('node-fetch').default;
const { logger } = require('@prairielearn/logger');

const { config } = require('../lib/config');
const workspaceHelper = require('../lib/workspace');
const workspaceHostUtils = require('../lib/workspaceHost');

const sqldb = require('@prairielearn/postgres');
const sql = sqldb.loadSqlEquiv(__filename);

module.exports.run = callbackify(async () => {
  if (!config.runningInEc2) return;

  await checkDBConsistency();
  await terminateHosts();
  await checkHealth();
});

/**
 * Attempts to make the list of hosts in EC2 consistent with what is in
 * the database.
 */
async function checkDBConsistency() {
  const ec2 = new AWS.EC2();
  const running_host_set = new Set();
  const reservations = (
    await ec2
      .describeInstances({
        Filters: [
          {
            Name: 'tag-key',
            Values: [config.workspaceLoadLaunchTag],
          },
          {
            Name: 'instance-state-name',
            Values: ['pending', 'running'],
          },
        ],
        MaxResults: 500,
      })
      .promise()
  ).Reservations;
  for (const reservation of reservations ?? []) {
    for (const instance of Object.values(reservation.Instances ?? [])) {
      running_host_set.add(instance.InstanceId);
    }
  }

  const db_hosts_nonterminated = new Set(
    (await sqldb.queryAsync(sql.select_nonterminated_workspace_hosts, [])).rows.map(
      (instance) => instance.instance_id
    )
  );

  const set_difference = (a, b) => {
    const diff = new Set();
    for (const val of a) {
      if (!b.has(val)) {
        diff.add(val);
      }
    }
    return diff;
  };

  // Kill off any host that is running but not in the db
  const not_in_db = set_difference(running_host_set, db_hosts_nonterminated);
  if (not_in_db.size > 0) {
    logger.info('Terminating hosts that are not in the database', Array.from(not_in_db));
    await sqldb.queryAsync(sql.add_terminating_hosts, {
      instances: Array.from(not_in_db),
    });
    await ec2.terminateInstances({ InstanceIds: Array.from(not_in_db) }).promise();
  }

  // Any host that is in the db but not running we will mark as "terminated".
  const not_in_ec2 = set_difference(db_hosts_nonterminated, running_host_set);
  if (not_in_ec2.size > 0) {
    logger.info('Terminating hosts that are not running in EC2', Array.from(not_in_ec2));
    const stoppedWorkspaces = await workspaceHostUtils.terminateWorkspaceHostsIfNotLaunching(
      Array.from(not_in_ec2)
    );
    stoppedWorkspaces.forEach((workspace) => {
      workspaceHelper.emitMessageForWorkspace(workspace.workspace_id, 'change:state', {
        workspace_id: workspace.workspace_id,
        state: workspace.state,
        message: workspace.message,
      });
    });
  }
}

async function terminateHosts() {
  const ec2 = new AWS.EC2();
  const hosts = await workspaceHostUtils.findTerminableWorkspaceHosts(
    config.workspaceHostUnhealthyTimeoutSec,
    config.workspaceHostLaunchTimeoutSec
  );
  if (hosts.length > 0) {
    logger.info('Found terminable hosts', hosts);
    await ec2.terminateInstances({ InstanceIds: hosts.map((h) => h.instance_id) }).promise();
  }
}

async function checkHealth() {
  const db_hosts = (await sqldb.queryAsync(sql.select_healthy_hosts, [])).rows;
  await async.each(db_hosts, async (host) => {
    const url = `http://${host.hostname}/status`;
    let healthy = true;
    if (host.hostname === null || host.hostname === 'null') {
      healthy = false;
    } else {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        healthy = res.ok;
      } catch (err) {
        healthy = false;
        logger.error(`Could not reach host ${host.hostname}`, err);
      }
    }

    if (!healthy) {
      logger.info(`Host ${host.hostname} (${host.instance_id}) is unhealthy!`);
      await workspaceHostUtils.markWorkspaceHostUnhealthy(host.instance_id, 'Failed health check');
    }
  });
}
