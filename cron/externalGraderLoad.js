const ERR = require('async-stacktrace');
const _ = require('lodash');
const AWS = require('aws-sdk');

const config = require('../lib/config');
const logger = require('../lib/logger');
const sqldb = require('@prairielearn/prairielib/sql-db');

module.exports = {};

module.exports.run = function(callback) {
    if (!config.externalGradingUseAws) return callback(null);
    getLoadStats((err, stats) => {
        if (ERR(err, callback)) return;
        sendStatsToCloudWatch(stats, (err) => {
            if (ERR(err, callback)) return;
            setAutoScalingGroupCapacity(stats, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    });
};

function getLoadStats(callback) {
    const params = [
        config.externalGradingJobsQueueName,
        config.externalGradingLoadAverageIntervalSec,
        config.externalGradingHistoryLoadIntervalSec,
        config.externalGradingCurrentCapacityFactor,
        config.externalGradingHistoryCapacityFactor,
        config.externalGradingSecondsPerSubmissionPerUser,
    ];
    sqldb.callOneRow('grader_loads_current', params, (err, result) => {
        if (ERR(err, callback)) return;
        const stats = result.rows[0];
        callback(null, stats);
    });
}

function sendStatsToCloudWatch(stats, callback) {
    const cloudwatch = new AWS.CloudWatch();
    const dimensions = [{Name: 'By Queue', Value: config.externalGradingJobsQueueName}];
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
                MetricName: 'AgeOfOldestJob',
                Dimensions: dimensions,
                StorageResolution: 1,
                Timestamp: stats.timestamp_formatted,
                Unit: 'Seconds',
                Value: stats.age_of_oldest_job_sec,
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
                MetricName: 'CurrentUsers',
                Dimensions: dimensions,
                StorageResolution: 1,
                Timestamp: stats.timestamp_formatted,
                Unit: 'Count',
                Value: stats.current_users,
            },
            {
                MetricName: 'PredictedJobsByCurrentUsers',
                Dimensions: dimensions,
                StorageResolution: 1,
                Timestamp: stats.timestamp_formatted,
                Unit: 'Count',
                Value: stats.predicted_jobs_by_current_users,
            },
            {
                MetricName: 'JobsPerInstance',
                Dimensions: dimensions,
                StorageResolution: 1,
                Timestamp: stats.timestamp_formatted,
                Unit: 'Count',
                Value: stats.jobs_per_instance,
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
                MetricName: 'DesiredInstancesByCurrentUsers',
                Dimensions: dimensions,
                StorageResolution: 1,
                Timestamp: stats.timestamp_formatted,
                Unit: 'Count',
                Value: stats.desired_instances_by_current_users,
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
}

function setAutoScalingGroupCapacity(stats, callback) {
    if (!config.externalGradingAutoScalingGroupName) return callback(null);
    if (!_.isInteger(stats.desired_instances)) return callback(null);
    if (stats.desired_instances < 1 || stats.desired_instances > 1e6) return callback(null);
    if (stats.desired_instances == stats.instance_count) return callback(null);

    const autoscaling = new AWS.AutoScaling();
    const params = {
        AutoScalingGroupName: config.externalGradingAutoScalingGroupName,
        DesiredCapacity: stats.desired_instances,
        HonorCooldown: false,
    };
    logger.verbose('setting AutoScalingGroup capacity', params);
    autoscaling.setDesiredCapacity(params, (err) => {
        if (ERR(err, callback)) return;
        callback(null);
    });
}
