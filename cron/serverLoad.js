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
    sqldb.call('server_loads_current', params, (err, result) => {
        if (ERR(err, callback)) return;
        const params = {
            Namespace: 'PrairieLearn',
            MetricData: [],
        };
        _.forEach(result.rows, (row) => {
            const dimensions = [
                {Name: 'Server Group', Value: config.groupName},
                {Name: 'Job Type', Value: row.job_type},
            ];
            params.MetricData.push(...[
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
            ]);
        });

        const cloudwatch = new AWS.CloudWatch();
        cloudwatch.putMetricData(params, function(err, _data) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    });
};
