import { CloudWatch } from '@aws-sdk/client-cloudwatch';
import { EC2 } from '@aws-sdk/client-ec2';
import { loadSqlEquiv, queryAsync, callOneRowAsync } from '@prairielearn/postgres';

import { makeAwsClientConfig } from '../../lib/aws';
import { config } from '../../lib/config';
import * as workspaceHostUtils from '../../lib/workspaceHost';

const sql = loadSqlEquiv(__filename);

type WorkspaceLoadStats = Record<string, any>;

export async function run() {
  if (!config.runningInEc2) return;
  const stats = await getLoadStats();
  await sendStatsToCloudwatch(stats);
  await handleWorkspaceAutoscaling(stats);
}

async function getLoadStats(): Promise<WorkspaceLoadStats> {
  const params = [config.workspaceLoadCapacityFactor, config.workspaceLoadHostCapacity];
  return (await callOneRowAsync('workspace_loads_current', params)).rows[0];
}

const cloudwatch_definitions = {
  workspace_jobs_capacity_desired: {
    name: 'DesiredJobCapacity',
    unit: 'Count',
  },
  workspace_hosts_desired: {
    name: 'DesiredHosts',
    unit: 'Count',
  },
  workspace_hosts_launching_count: {
    name: 'HostsLaunching',
    unit: 'Count',
  },
  workspace_hosts_ready_count: {
    name: 'HostsReady',
    unit: 'Count',
  },
  workspace_hosts_draining_count: {
    name: 'HostsDraining',
    unit: 'Count',
  },
  workspace_hosts_unhealthy_count: {
    name: 'HostsUnhealthy',
    unit: 'Count',
  },
  workspace_hosts_terminating_count: {
    name: 'HostsTerminating',
    unit: 'Count',
  },
  workspace_hosts_active_count: {
    name: 'HostsActive',
    unit: 'Count',
  },
  workspace_hosts_longest_launching_sec: {
    name: 'MaxLaunchingHostAge',
    unit: 'Seconds',
  },
  workspace_hosts_longest_ready_sec: {
    name: 'MaxReadyHostAge',
    unit: 'Seconds',
  },
  workspace_hosts_longest_draining_sec: {
    name: 'MaxDrainingHostAge',
    unit: 'Seconds',
  },
  workspace_hosts_longest_unhealthy_sec: {
    name: 'MaxUnhealthyHostAge',
    unit: 'Seconds',
  },
  workspace_hosts_longest_terminating_sec: {
    name: 'MaxTerminatingHostAge',
    unit: 'Seconds',
  },
  workspace_uninitialized_count: {
    name: 'WorkspacesUninitialized',
    unit: 'Count',
  },
  workspace_launching_count: {
    name: 'WorkspacesLaunching',
    unit: 'Count',
  },
  workspace_relaunching_count: {
    name: 'WorkspacesRelaunching',
    unit: 'Count',
  },
  workspace_running_count: {
    name: 'WorkspacesRunning',
    unit: 'Count',
  },
  workspace_running_on_healthy_hosts_count: {
    name: 'WorkspacesRunningOnHealthyHosts',
    unit: 'Count',
  },
  workspace_active_count: {
    name: 'WorkspacesActive',
    unit: 'Count',
  },
  workspace_active_on_healthy_hosts_count: {
    name: 'WorkspacesActiveOnHealthyHosts',
    unit: 'Count',
  },
  workspace_longest_launching_sec: {
    name: 'MaxLaunchingWorkspaceAge',
    unit: 'Seconds',
  },
  workspace_longest_running_sec: {
    name: 'MaxRunningWorkspaceAge',
    unit: 'Seconds',
  },
};

async function sendStatsToCloudwatch(stats: WorkspaceLoadStats) {
  const cloudwatch = new CloudWatch(makeAwsClientConfig());
  const dimensions = [{ Name: 'By Server', Value: config.workspaceCloudWatchName }];
  const cloudwatch_metricdata_limit = 20; // AWS limits to 20 items within each list
  const entries = Object.entries(stats).filter(([key, _value]) => {
    return key !== 'timestamp_formatted';
  });

  for (let i = 0; i < entries.length; i += cloudwatch_metricdata_limit) {
    const data = entries.slice(i, i + cloudwatch_metricdata_limit).map(([key, value]) => {
      if (!(key in cloudwatch_definitions)) {
        throw new Error(`Unknown datapoint ${key}!`);
      }
      const def = cloudwatch_definitions[key];
      return {
        MetricName: def.name,
        Dimensions: dimensions,
        Timestamp: new Date(stats.timestamp_formatted),
        Unit: def.unit,
        Value: value,
        StorageResolution: 1,
      };
    });
    await cloudwatch.putMetricData({ MetricData: data, Namespace: 'Workspaces' });
  }
}

async function handleWorkspaceAutoscaling(stats: WorkspaceLoadStats) {
  if (!config.workspaceAutoscalingEnabled || !config.workspaceLoadLaunchTemplateId) return;

  const desired_hosts = stats.workspace_hosts_desired;
  const ready_hosts = stats.workspace_hosts_ready_count;
  const launching_hosts = stats.workspace_hosts_launching_count;
  if (desired_hosts > ready_hosts + launching_hosts) {
    let needed = desired_hosts - (ready_hosts + launching_hosts);
    // First thing we can try is to "re-capture" draining hosts to be ready.
    // This is very cheap to do because we don't need to call out to AWS.
    const recapturedHostCount = await workspaceHostUtils.recaptureDrainingWorkspaceHosts(needed);
    needed -= recapturedHostCount;
    if (needed > 0) {
      // We couldn't get enough hosts, so lets spin up some more and insert them into the DB.
      const ec2 = new EC2(makeAwsClientConfig());
      const data = await ec2.runInstances({
        MaxCount: needed,
        MinCount: 1,
        LaunchTemplate: {
          LaunchTemplateId: config.workspaceLoadLaunchTemplateId,
        },
      });
      const instance_ids = (data.Instances ?? []).map((instance) => instance.InstanceId);
      await queryAsync(sql.insert_new_instances, { instance_ids });
    }
  } else if (desired_hosts < ready_hosts) {
    const surplus = ready_hosts - desired_hosts;
    await workspaceHostUtils.drainExtraWorkspaceHosts(surplus);
  }
}
