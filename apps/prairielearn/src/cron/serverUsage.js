const util = require('node:util');
const { CloudWatch } = require('@aws-sdk/client-cloudwatch');
const sqldb = require('@prairielearn/postgres');

const { makeAwsClientConfig } = require('../lib/aws');
const { config } = require('../lib/config');

module.exports.run = util.callbackify(async () => {
  if (!config.runningInEc2) return;

  const result = await sqldb.callOneRowAsync('server_usage_current', [
    config.serverUsageIntervalSec,
  ]);
  const stats = result.rows[0];
  const cloudwatch = new CloudWatch(makeAwsClientConfig());
  const dimensions = [{ Name: 'Server Group', Value: config.groupName }];

  await cloudwatch.putMetricData({
    Namespace: 'PrairieLearn',
    MetricData: [
      {
        MetricName: 'UserCount',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: stats.timestamp_formatted,
        Unit: 'Count',
        Value: stats.user_count,
      },
      {
        MetricName: 'PageViewsPerSecond',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: stats.timestamp_formatted,
        Unit: 'Count/Second',
        Value: stats.page_views_per_second,
      },
      {
        MetricName: 'SubmissionsPerSecond',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: stats.timestamp_formatted,
        Unit: 'Count/Second',
        Value: stats.submissions_per_second,
      },
      {
        MetricName: 'InternalGradingJobsPerSecond',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: stats.timestamp_formatted,
        Unit: 'Count/Second',
        Value: stats.internal_grading_jobs_per_second,
      },
      {
        MetricName: 'ExternalGradingJobsPerSecond',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: stats.timestamp_formatted,
        Unit: 'Count/Second',
        Value: stats.external_grading_jobs_per_second,
      },
    ],
  });
});
