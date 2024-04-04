import * as _ from 'lodash';
import { AutoScaling } from '@aws-sdk/client-auto-scaling';
import { CloudWatch } from '@aws-sdk/client-cloudwatch';
import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';

import { makeAwsClientConfig } from '../lib/aws';
import { config } from '../lib/config';

export async function run() {
  if (!config.runningInEc2) return;

  const stats = await getLoadStats();
  await sendStatsToCloudWatch(stats);
  await setAutoScalingGroupCapacity(stats);
}

async function getLoadStats() {
  const params = [
    config.externalGradingJobsQueueName,
    config.externalGradingLoadAverageIntervalSec,
    config.externalGradingHistoryLoadIntervalSec,
    config.externalGradingCurrentCapacityFactor,
    config.externalGradingHistoryCapacityFactor,
  ];
  const result = await sqldb.callOneRowAsync('grader_loads_current', params);
  return result.rows[0];
}

async function sendStatsToCloudWatch(stats) {
  const dimensions = [{ Name: 'By Queue', Value: config.externalGradingJobsQueueName }];
  const timestamp = new Date(stats.timestamp_formatted);

  const cloudwatch = new CloudWatch(makeAwsClientConfig());
  await cloudwatch.putMetricData({
    // AWS limits to 20 items within each MetricData list
    MetricData: [
      {
        MetricName: 'InstanceCount',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.instance_count,
      },
      {
        MetricName: 'InstanceCountLaunching',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.instance_count_launching,
      },
      {
        MetricName: 'InstanceCountInService',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.instance_count_in_service,
      },
      {
        MetricName: 'InstanceCountAbandoningLaunch',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.instance_count_abandoning_launch,
      },
      {
        MetricName: 'InstanceCountUnhealthy',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.instance_count_unhealthy,
      },
      {
        MetricName: 'CurrentJobs',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.current_jobs,
      },
      {
        MetricName: 'MaxJobs',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.max_jobs,
      },
      {
        MetricName: 'LoadPercentage',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Percent',
        Value: stats.load_perc,
      },
      {
        MetricName: 'UngradedJobs',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.ungraded_jobs,
      },
      {
        MetricName: 'UngradedJobsInSubmit',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.ungraded_jobs_in_submit,
      },
      {
        MetricName: 'UngradedJobsInQueue',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.ungraded_jobs_in_queue,
      },
      {
        MetricName: 'UngradedJobsInPrepare',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.ungraded_jobs_in_prepare,
      },
      {
        MetricName: 'UngradedJobsInRun',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.ungraded_jobs_in_run,
      },
      {
        MetricName: 'UngradedJobsInReport',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.ungraded_jobs_in_report,
      },
      {
        MetricName: 'AgeOfOldestJob',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Seconds',
        Value: stats.age_of_oldest_job_sec,
      },
      {
        MetricName: 'AgeOfOldestJobInSubmit',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Seconds',
        Value: stats.age_of_oldest_job_in_submit_sec,
      },
      {
        MetricName: 'AgeOfOldestJobInQueue',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Seconds',
        Value: stats.age_of_oldest_job_in_queue_sec,
      },
      {
        MetricName: 'AgeOfOldestJobInPrepare',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Seconds',
        Value: stats.age_of_oldest_job_in_prepare_sec,
      },
      {
        MetricName: 'AgeOfOldestJobInRun',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Seconds',
        Value: stats.age_of_oldest_job_in_run_sec,
      },
      {
        MetricName: 'AgeOfOldestJobInReport',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Seconds',
        Value: stats.age_of_oldest_job_in_report_sec,
      },
    ],
    Namespace: 'Grader',
  });

  // AWS limits to 20 items within each MetricData list, so we split up the
  // metrics into two batches.
  await cloudwatch.putMetricData({
    MetricData: [
      {
        MetricName: 'HistoryJobs',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.history_jobs,
      },
      {
        MetricName: 'CurrentUsers',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.current_users,
      },
      {
        MetricName: 'GradingJobsPerUser',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.grading_jobs_per_user,
      },
      {
        MetricName: 'AverageGradingJobsPerUser',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.average_grading_jobs_per_user,
      },
      {
        MetricName: 'HistoryGradingJobsPerUser',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.history_grading_jobs_per_user,
      },
      {
        MetricName: 'PredictedJobsByCurrentUsers',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.predicted_jobs_by_current_users,
      },
      {
        MetricName: 'PredictedJobsByHistoryUsers',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.predicted_jobs_by_history_users,
      },
      {
        MetricName: 'JobsPerInstance',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.jobs_per_instance,
      },
      {
        MetricName: 'DesiredInstancesByUngradedJobs',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.desired_instances_by_ungraded_jobs,
      },
      {
        MetricName: 'DesiredInstancesByCurrentJobs',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.desired_instances_by_current_jobs,
      },
      {
        MetricName: 'DesiredInstancesByHistoryJobs',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.desired_instances_by_history_jobs,
      },
      {
        MetricName: 'DesiredInstancesByCurrentUsers',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.desired_instances_by_current_users,
      },
      {
        MetricName: 'DesiredInstancesByHistoryUsers',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.desired_instances_by_history_users,
      },
      {
        MetricName: 'DesiredInstancesCurrent',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.desired_instances_current,
      },
      {
        MetricName: 'DesiredInstancesHistory',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.desired_instances_history,
      },
      {
        MetricName: 'DesiredInstances',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.desired_instances,
      },
    ],
    Namespace: 'Grader',
  });
}

async function setAutoScalingGroupCapacity(stats) {
  if (!config.externalGradingAutoScalingGroupName) return;
  if (!_.isInteger(stats.desired_instances)) return;
  if (stats.desired_instances < 1 || stats.desired_instances > 1e6) return;
  if (stats.desired_instances === stats.instance_count) return;

  const autoscaling = new AutoScaling(makeAwsClientConfig());
  logger.verbose(`setting AutoScalingGroup capacity to ${stats.desired_instances}`);
  await autoscaling.setDesiredCapacity({
    AutoScalingGroupName: config.externalGradingAutoScalingGroupName,
    DesiredCapacity: stats.desired_instances,
    HonorCooldown: false,
  });
}
