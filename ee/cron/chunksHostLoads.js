// @ts-check
const AWS = require('aws-sdk');
const { callbackify } = require('util');

const config = require('../../lib/config');
const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports.run = callbackify(async () => {
  if (!config.runningInEc2) return;

  const cloudwatch = new AWS.CloudWatch();

  const now = Date.now();
  const startTime = new Date(now - 1000 * 60 * 5);
  const endTime = new Date(now + 1000 * 60 * 5);
  const metrics = cloudwatch
    .getMetricData({
      StartTime: startTime,
      EndTime: endTime,
      MetricDataQueries: [
        {
          Id: 'PageViewsPerSecond',
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
          Id: 'ActiveWorkersPerSecond',
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
          Id: 'LoadBalancerRequestsPerMinute',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/ApplicationELB',
              MetricName: 'RequestCount',
              Dimensions: [
                {
                  Name: 'LoadBalancer',
                  // TODO: pull from config?
                  Value: '',
                },
                {
                  Name: 'TargetGroup',
                  // TODO: pull from config?
                  Value: '',
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

  await cloudwatch.putMetricData({ MetricData: [], Namespace: 'TESTING' }).promise();

  // TODO: add chunks ASG name to config.
  await setAutoScalingGroupCapacity(config.chunksAutoScalingGroupName, 1);
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
