const ERR = require('async-stacktrace');
const AWS = require('aws-sdk');

const { config } = require('../lib/config');
const sqldb = require('@prairielearn/postgres');

module.exports = {};

module.exports.run = function (callback) {
  if (!config.runningInEc2) return callback(null);
  const params = [config.serverUsageIntervalSec];
  sqldb.callOneRow('server_usage_current', params, (err, result) => {
    if (ERR(err, callback)) return;
    const stats = result.rows[0];
    const cloudwatch = new AWS.CloudWatch(config.awsServiceGlobalOptions);
    const dimensions = [{ Name: 'Server Group', Value: config.groupName }];

    const params = {
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
    };
    cloudwatch.putMetricData(params, function (err, _data) {
      if (ERR(err, callback)) return;
      callback(null);
    });
  });
};
