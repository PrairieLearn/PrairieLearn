var ERR = require('async-stacktrace');
const AWS = require('aws-sdk');

var config = require('../lib/config');
var sqldb = require('../lib/sqldb');

module.exports = {};

module.exports.run = function(callback) {
    if (!config.externalGradingUseAws) return callback(null); // FIXME: replace with config.runningInEc2
    const params = [
        config.groupName,
        config.serverLoadAverageIntervalSec,
    ];
    sqldb.callOneRow('server_loads_current', params, (err, result) => {
        if (ERR(err, callback)) return;
        const stats = result.rows[0];

        const cloudwatch = new AWS.CloudWatch();
        const dimensions = [{Name: 'By Group', Value: config.groupName}];
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
            ],
            Namespace: 'Server',
        };
        cloudwatch.putMetricData(params, function(err, _data) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    });
};
