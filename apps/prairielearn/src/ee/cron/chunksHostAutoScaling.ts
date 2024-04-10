import { CloudWatch, type Dimension } from '@aws-sdk/client-cloudwatch';
import { AutoScaling } from '@aws-sdk/client-auto-scaling';
import * as _ from 'lodash';

import { makeAwsClientConfig } from '../../lib/aws';
import { config } from '../../lib/config';

// These are used as IDs when reading CloudWatch metrics. They must start with
// a lowercase letter and contain only numbers, letters, and underscores.
const PAGE_VIEWS_PER_SECOND = 'pageViewsPerSecond';
const ACTIVE_WORKERS_PER_SECOND = 'activeWorkersPerSecond';
const LOAD_BALANCER_REQUESTS_PER_MINUTE = 'loadBalancerRequestsPerMinute';

export async function run() {
  if (
    !config.runningInEc2 ||
    !config.chunksLoadBalancerDimensionName ||
    !config.chunksTargetGroupDimensionName ||
    !config.chunksAutoScalingGroupName
  ) {
    return;
  }

  const now = Date.now();
  const cloudwatch = new CloudWatch(makeAwsClientConfig());

  const metrics = await cloudwatch.getMetricData({
    StartTime: new Date(now - 1000 * config.chunksHostAutoScalingHistoryIntervalSec),
    EndTime: new Date(now),
    MetricDataQueries: [
      {
        Id: PAGE_VIEWS_PER_SECOND,
        MetricStat: {
          Metric: {
            Namespace: 'PrairieLearn',
            MetricName: 'PageViewsPerSecond',
            Dimensions: [
              {
                Name: 'Server Group',
                Value: config.groupName,
              },
            ],
          },
          Period: 10,
          Stat: 'Maximum',
        },
      },
      {
        Id: ACTIVE_WORKERS_PER_SECOND,
        MetricStat: {
          Metric: {
            Namespace: 'PrairieLearn',
            MetricName: 'CurrentJobs',
            Dimensions: [
              {
                Name: 'Server Group',
                Value: config.groupName,
              },
              {
                Name: 'Job Type',
                Value: 'python_worker_active',
              },
            ],
          },
          Period: 10,
          Stat: 'Maximum',
        },
      },
      {
        Id: LOAD_BALANCER_REQUESTS_PER_MINUTE,
        MetricStat: {
          Metric: {
            Namespace: 'AWS/ApplicationELB',
            MetricName: 'RequestCount',
            Dimensions: [
              {
                Name: 'LoadBalancer',
                Value: config.chunksLoadBalancerDimensionName,
              },
              {
                Name: 'TargetGroup',
                Value: config.chunksTargetGroupDimensionName,
              },
            ],
          },
          Period: 60,
          Stat: 'Sum',
        },
      },
    ],
  });

  const pageViewsPerSecondMetric = metrics.MetricDataResults?.find(
    (m) => m.Id === PAGE_VIEWS_PER_SECOND,
  );
  const activeWorkersPerSecondMetric = metrics.MetricDataResults?.find(
    (m) => m.Id === ACTIVE_WORKERS_PER_SECOND,
  );
  const loadBalancerRequestsPerMinuteMetric = metrics.MetricDataResults?.find(
    (m) => m.Id === LOAD_BALANCER_REQUESTS_PER_MINUTE,
  );

  const maxPageViewsPerSecond = _.max(pageViewsPerSecondMetric?.Values) ?? 0;
  const maxActiveWorkersPerSecond = _.max(activeWorkersPerSecondMetric?.Values) ?? 0;
  const maxLoadBalancerRequestsPerMinute = _.max(loadBalancerRequestsPerMinuteMetric?.Values) ?? 0;

  const desiredInstancesByPageViews = maxPageViewsPerSecond / config.chunksPageViewsCapacityFactor;
  const desiredInstancesByActiveWorkers =
    maxActiveWorkersPerSecond / config.chunksActiveWorkersCapacityFactor;
  const desiredInstancesByLoadBalancerRequests =
    maxLoadBalancerRequestsPerMinute / config.chunksLoadBalancerRequestsCapacityFactor;

  const desiredInstances = Math.ceil(
    Math.max(
      desiredInstancesByPageViews,
      desiredInstancesByActiveWorkers,
      desiredInstancesByLoadBalancerRequests,
      1,
    ),
  );

  const dimensions: Dimension[] = [{ Name: 'Server Group', Value: config.groupName }];

  await cloudwatch.putMetricData({
    MetricData: [
      {
        MetricName: 'DesiredInstancesByPageViews',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: new Date(now),
        Unit: 'Count',
        Value: desiredInstancesByPageViews,
      },
      {
        MetricName: 'DesiredInstancesByActiveWorkers',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: new Date(now),
        Unit: 'Count',
        Value: desiredInstancesByActiveWorkers,
      },
      {
        MetricName: 'DesiredInstancesByLoadBalancerRequests',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: new Date(now),
        Unit: 'Count',
        Value: desiredInstancesByLoadBalancerRequests,
      },
      {
        MetricName: 'DesiredInstances',
        Dimensions: dimensions,
        StorageResolution: 1,
        Unit: 'Count',
        Timestamp: new Date(now),
        Value: desiredInstances,
      },
    ],
    Namespace: 'Chunks',
  });

  await setAutoScalingGroupCapacity(config.chunksAutoScalingGroupName, desiredInstances);
}

/**
 * Sets the desired capacity of the given autoscaling group.
 */
async function setAutoScalingGroupCapacity(groupName: string, capacity: number) {
  if (!groupName) return;

  const autoscaling = new AutoScaling(makeAwsClientConfig());
  await autoscaling.setDesiredCapacity({
    AutoScalingGroupName: groupName,
    DesiredCapacity: capacity,
  });
}
