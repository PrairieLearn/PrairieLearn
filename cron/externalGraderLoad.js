var ERR = require('async-stacktrace');
const AWS = require('aws-sdk');

var config = require('../lib/config');
var sqldb = require('@prairielearn/prairielib/sql-db');

module.exports = {};

module.exports.run = function(callback) {
    if (!config.externalGradingUseAws) return callback(null);
    const params = [
        config.externalGradingSqsQueueName,
        config.externalGradingLoadAverageIntervalSec,
        config.externalGradingHistoryLoadIntervalSec,
        config.externalGradingCurrentCapacityFactor,
        config.externalGradingHistoryCapacityFactor,
    ];
    sqldb.callOneRow('grader_loads_current', params, (err, result) => {
        if (ERR(err, callback)) return;
        const stats = result.rows[0];

        const cloudwatch = new AWS.CloudWatch();
        const dimensions = [{Name: 'By Queue', Value: config.externalGradingSqsQueueName}];
        const params = {
            MetricData: [
                {
                    MetricName: 'InstanceCount',
                    Dimensions: dimensions,
                    StorageResolution: 1,
                    Timestamp: stats.timestamp_formatted,
                    Unit: 'Count',
                    Value: stats.instance_count,
                },
                {
                    MetricName: 'CurrentJobs',
                    Dimensions: dimensions,
                    StorageResolution: 1,
                    Timestamp: stats.timestamp_formatted,
                    Unit: 'Count',
                    Value: stats.current_jobs,
                },
                {
                    MetricName: 'MaxJobs',
                    Dimensions: dimensions,
                    StorageResolution: 1,
                    Timestamp: stats.timestamp_formatted,
                    Unit: 'Count',
                    Value: stats.max_jobs,
                },
                {
                    MetricName: 'LoadPercentage',
                    Dimensions: dimensions,
                    StorageResolution: 1,
                    Timestamp: stats.timestamp_formatted,
                    Unit: 'Percent',
                    Value: stats.load_perc,
                },
                {
                    MetricName: 'UngradedJobs',
                    Dimensions: dimensions,
                    StorageResolution: 1,
                    Timestamp: stats.timestamp_formatted,
                    Unit: 'Count',
                    Value: stats.ungraded_jobs,
                },
                {
                    MetricName: 'HistoryJobs',
                    Dimensions: dimensions,
                    StorageResolution: 1,
                    Timestamp: stats.timestamp_formatted,
                    Unit: 'Count',
                    Value: stats.history_jobs,
                },
                {
                    MetricName: 'DesiredInstancesByUngradedJobs',
                    Dimensions: dimensions,
                    StorageResolution: 1,
                    Timestamp: stats.timestamp_formatted,
                    Unit: 'Count',
                    Value: stats.desired_instances_by_ungraded_jobs,
                },
                {
                    MetricName: 'DesiredInstancesByCurrentJobs',
                    Dimensions: dimensions,
                    StorageResolution: 1,
                    Timestamp: stats.timestamp_formatted,
                    Unit: 'Count',
                    Value: stats.desired_instances_by_current_jobs,
                },
                {
                    MetricName: 'DesiredInstancesByHistoryJobs',
                    Dimensions: dimensions,
                    StorageResolution: 1,
                    Timestamp: stats.timestamp_formatted,
                    Unit: 'Count',
                    Value: stats.desired_instances_by_history_jobs,
                },
                {
                    MetricName: 'DesiredInstances',
                    Dimensions: dimensions,
                    StorageResolution: 1,
                    Timestamp: stats.timestamp_formatted,
                    Unit: 'Count',
                    Value: stats.desired_instances,
                },
            ],
            Namespace: 'Grader',
        };
        cloudwatch.putMetricData(params, function(err, _data) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    });
};
