import { AutoScaling } from '@aws-sdk/client-auto-scaling';
import { CloudWatch } from '@aws-sdk/client-cloudwatch';
import { z } from 'zod';

import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';

import { makeAwsClientConfig } from '../../lib/aws.js';
import { config } from '../../lib/config.js';

const ExternalGraderLoadStatsSchema = z.object({
  instance_count: z.number().int(),
  instance_count_launching: z.number().int(),
  instance_count_in_service: z.number().int(),
  instance_count_abandoning_launch: z.number().int(),
  instance_count_unhealthy: z.number().int(),
  current_jobs: z.number(),
  max_jobs: z.number(),
  load_perc: z.number(),
  ungraded_jobs: z.number(),
  ungraded_jobs_in_submit: z.number(),
  ungraded_jobs_in_queue: z.number(),
  ungraded_jobs_in_prepare: z.number(),
  ungraded_jobs_in_run: z.number(),
  ungraded_jobs_in_report: z.number(),
  age_of_oldest_job_sec: z.number(),
  age_of_oldest_job_in_submit_sec: z.number(),
  age_of_oldest_job_in_queue_sec: z.number(),
  age_of_oldest_job_in_prepare_sec: z.number(),
  age_of_oldest_job_in_run_sec: z.number(),
  age_of_oldest_job_in_report_sec: z.number(),
  history_jobs: z.number(),
  current_users: z.number().int(),
  grading_jobs_per_user: z.number(),
  average_grading_jobs_per_user: z.number(),
  history_grading_jobs_per_user: z.number(),
  predicted_jobs_by_current_users: z.number(),
  predicted_jobs_by_history_users: z.number(),
  jobs_per_instance: z.number(),
  desired_instances_by_ungraded_jobs: z.number(),
  desired_instances_by_current_jobs: z.number(),
  desired_instances_by_history_jobs: z.number(),
  desired_instances_by_current_users: z.number(),
  desired_instances_by_history_users: z.number(),
  desired_instances_current: z.number().int(),
  desired_instances_history: z.number().int(),
  desired_instances: z.number().int(),
  timestamp_formatted: z.string(),
});

export async function run() {
  if (!config.runningInEc2) return;

  const stats = await getLoadStats();
  await sendStatsToCloudWatch(stats);
  await setAutoScalingGroupCapacity(stats);
}

async function getLoadStats() {
  return await sqldb.callRow(
    'grader_loads_current',
    [
      config.externalGradingJobsQueueName,
      config.externalGradingLoadAverageIntervalSec,
      config.externalGradingHistoryLoadIntervalSec,
      config.externalGradingCurrentCapacityFactor,
      config.externalGradingHistoryCapacityFactor,
    ],
    ExternalGraderLoadStatsSchema,
  );
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
  if (!Number.isInteger(stats.desired_instances)) return;
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
