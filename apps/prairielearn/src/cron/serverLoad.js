const async = require('async');
const util = require('node:util');
const { CloudWatch } = require('@aws-sdk/client-cloudwatch');

const { config } = require('../lib/config');
const sqldb = require('@prairielearn/postgres');

module.exports.run = util.callbackify(async () => {
  if (!config.runningInEc2) return null;

  const result = await sqldb.callAsync('server_loads_current', [
    config.groupName,
    config.serverLoadAverageIntervalSec,
  ]);
  if (result.rowCount === 0) {
    // Nothing to report.
    return;
  }
  const cloudwatch = new CloudWatch({
    region: config.awsRegion,
    ...config.awsServiceGlobalOptions,
  });
  await async.each(result.rows, async (row) => {
    const dimensions = [
      { Name: 'Server Group', Value: config.groupName },
      { Name: 'Job Type', Value: row.job_type },
    ];
    await cloudwatch.putMetricData({
      Namespace: 'PrairieLearn',
      MetricData: [
        {
          MetricName: 'InstanceCount',
          Dimensions: dimensions,
          StorageResolution: 1,
          Timestamp: row.timestamp_formatted,
          Unit: 'Count',
          Value: row.instance_count,
        },
        {
          MetricName: 'CurrentJobs',
          Dimensions: dimensions,
          StorageResolution: 1,
          Timestamp: row.timestamp_formatted,
          Unit: 'Count',
          Value: row.current_jobs,
        },
        {
          MetricName: 'MaxJobs',
          Dimensions: dimensions,
          StorageResolution: 1,
          Timestamp: row.timestamp_formatted,
          Unit: 'Count',
          Value: row.max_jobs,
        },
        {
          MetricName: 'LoadPercentage',
          Dimensions: dimensions,
          StorageResolution: 1,
          Timestamp: row.timestamp_formatted,
          Unit: 'Percent',
          Value: row.load_perc,
        },
      ],
    });
  });
});
