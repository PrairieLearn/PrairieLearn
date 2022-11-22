// @ts-check
const AWS = require('aws-sdk');
const { callbackify } = require('util');

const config = require('../../lib/config');
const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

const PAGE_VIEWS_PER_SECOND = 'PageViewsPerSecond';
const ACTIVE_WORKERS_PER_SECOND = 'ActiveWorkersPerSecond';
const LOAD_BALANCER_REQUESTS_PER_MINUTE = 'LoadBalancerRequestsPerMinute';

/**
 * Finds the maximum value in the given array.
 * @param {number[]} arr
 */
function arrayMax(arr) {
  return arr.reduce((a, b) => Math.max(a, b), 0);
}

module.exports.run = callbackify(async () => {
  if (
    !config.runningInEc2 ||
    !config.chunksLoadBalancerDimensionName ||
    !config.chunksTargetGroupDimensionName
  ) {
    return;
  }

  const cloudwatch = new AWS.CloudWatch();

  const now = Date.now();
  const startTime = new Date(now - 1000 * 60 * 15);
  const endTime = new Date(now + 1000 * 60 * 5);
  const metrics = await cloudwatch
    .getMetricData({
      StartTime: startTime,
      EndTime: endTime,
      MetricDataQueries: [
        {
          Id: PAGE_VIEWS_PER_SECOND,
          MetricStat: {
            Metric: {
              Namespace: 'PrairieLearn',
              MetricName: 'PageViewsPerSecond',
              Dimensions: [
                {
                  Name: 'ServerGroup',
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
    })
    .promise();

  const pageViewsPerSecondMetric = metrics.MetricDataResults.find(
    (m) => m.Id === PAGE_VIEWS_PER_SECOND
  );
  const activeWorkersPerSecondMetric = metrics.MetricDataResults.find(
    (m) => m.Id === ACTIVE_WORKERS_PER_SECOND
  );
  const loadBalancerRequestsPerMinuteMetric = metrics.MetricDataResults.find(
    (m) => m.Id === LOAD_BALANCER_REQUESTS_PER_MINUTE
  );

  const maxPageViewsPerSecond = Math.ceil(arrayMax(pageViewsPerSecondMetric.Values));
  const maxActiveWorkersPerSecond = Math.ceil(arrayMax(activeWorkersPerSecondMetric.Values));
  const maxLoadBalancerRequestsPerMinute = Math.ceil(
    arrayMax(loadBalancerRequestsPerMinuteMetric.Values)
  );

  const desiredInstancesByPageViews = maxPageViewsPerSecond / config.chunksPageViewsCapacityFactor;
  const desiredInstancesByActiveWorkers =
    maxActiveWorkersPerSecond / config.chunksActiveWorkersCapacityFactor;
  const desiredInstancesByLoadBalancerRequests =
    maxLoadBalancerRequestsPerMinute / config.chunksLoadBalancerRequestsCapacityFactor;
  const desiredInstances = Math.max(
    desiredInstancesByPageViews,
    desiredInstancesByActiveWorkers,
    desiredInstancesByLoadBalancerRequests,
    1
  );

  await cloudwatch
    .putMetricData({
      MetricData: [
        {
          MetricName: 'DesiredInstancesByPageViews',
          Unit: 'Count',
        },
        {
          MetricName: 'DesiredInstancesByActiveWorkers',
          Unit: 'Count',
        },
        {
          MetricName: 'DesiredInstancesByLoadBalancerRequests',
          Unit: 'Count',
        },
        {
          MetricName: 'DesiredInstances',
          Unit: 'Count',
          Value: desiredInstances,
        },
      ],
      Namespace: 'Chunks',
    })
    .promise();

  await setAutoScalingGroupCapacity(config.chunksAutoScalingGroupName, desiredInstances);
});

/**
 * Sets the desired capacity of the given autoscaling group.
 * @param {string} groupName
 * @param {number} capacity
 * @returns {Promise<void>}
 */
async function setAutoScalingGroupCapacity(groupName, capacity) {
  if (!groupName) return;

  const autoscaling = new AWS.AutoScaling();
  await autoscaling
    .setDesiredCapacity({
      AutoScalingGroupName: groupName,
      DesiredCapacity: capacity,
    })
    .promise();
}
