import * as async from 'async';
import { EC2 } from '@aws-sdk/client-ec2';
import fetch from 'node-fetch';
import { z } from 'zod';
import { logger } from '@prairielearn/logger';
import { loadSqlEquiv, queryAsync, queryRows } from '@prairielearn/postgres';
import * as workspaceUtils from '@prairielearn/workspace-utils';

import { config } from '../lib/config';
import { makeAwsClientConfig } from '../lib/aws';
import * as workspaceHostUtils from '../lib/workspaceHost';

const sql = loadSqlEquiv(__filename);

export async function run() {
  if (!config.runningInEc2) return;

  await checkDBConsistency();
  await terminateHosts();
  await checkHealth();
}

function setDifference<T>(a: Set<T>, b: Set<T>): Set<T> {
  const diff = new Set<T>();
  for (const val of a) {
    if (!b.has(val)) {
      diff.add(val);
    }
  }
  return diff;
}

/**
 * Attempts to make the list of hosts in EC2 consistent with what is in
 * the database.
 */
async function checkDBConsistency() {
  const ec2 = new EC2(makeAwsClientConfig());
  const runningHosts = new Set<string>();
  const instances = await ec2.describeInstances({
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
  });
  for (const reservation of instances.Reservations ?? []) {
    for (const instance of Object.values(reservation.Instances ?? [])) {
      if (instance.InstanceId) {
        runningHosts.add(instance.InstanceId);
      }
    }
  }

  const nonTerminatedHosts = new Set(
    await queryRows(sql.select_nonterminated_workspace_hosts, z.string()),
  );

  // Kill off any host that is running but not in the db
  const hostsNotInDatabase = setDifference(runningHosts, nonTerminatedHosts);
  if (hostsNotInDatabase.size > 0) {
    logger.info('Terminating hosts that are not in the database', Array.from(hostsNotInDatabase));
    await queryAsync(sql.add_terminating_hosts, {
      instances: Array.from(hostsNotInDatabase),
    });
    await ec2.terminateInstances({ InstanceIds: Array.from(hostsNotInDatabase) });
  }

  // Any host that is in the db but not running we will mark as "terminated".
  const hostsNotInEc2 = setDifference(nonTerminatedHosts, runningHosts);
  if (hostsNotInEc2.size > 0) {
    logger.info('Terminating hosts that are not running in EC2', Array.from(hostsNotInEc2));
    const stoppedWorkspaces = await workspaceHostUtils.terminateWorkspaceHostsIfNotLaunching(
      Array.from(hostsNotInEc2),
    );
    stoppedWorkspaces.forEach((workspace) => {
      workspaceUtils.emitMessageForWorkspace(workspace.workspace_id, 'change:state', {
        workspace_id: workspace.workspace_id,
        state: workspace.state,
        message: workspace.message,
      });
    });
  }
}

async function terminateHosts() {
  const ec2 = new EC2(makeAwsClientConfig());
  const hosts = await workspaceHostUtils.findTerminableWorkspaceHosts(
    config.workspaceHostUnhealthyTimeoutSec,
    config.workspaceHostLaunchTimeoutSec,
  );
  if (hosts.length > 0) {
    logger.info('Found terminable hosts', hosts);
    await ec2.terminateInstances({ InstanceIds: hosts.map((h) => h.instance_id) });
  }
}

async function checkHealth() {
  const hosts = await queryRows(
    sql.select_healthy_hosts,
    z.object({
      id: z.string(),
      instance_id: z.string().nullable(),
      hostname: z.string().nullable(),
    }),
  );

  await async.each(hosts, async (host) => {
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
      await workspaceHostUtils.markWorkspaceHostUnhealthy(host.id, 'Failed health check');
    }
  });
}
