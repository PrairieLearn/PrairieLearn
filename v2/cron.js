var ERR = require('async-stacktrace');
var _ = require('lodash');
var fs = require('fs');
var async = require('async');

var logger = require('./logger');
var error = require('./error');
var config = require('./config');
var sqldb = require('./sqldb');

var user_assessment_durations = fs.readFileSync('./cron.d/user_assessment_durations.sql', 'utf8');

module.exports = {
    init: function(callback) {
        var that = module.exports;
        setTimeout(that.runJobs, config.cronIntervalMS);
        callback(null);
    },

    runJobs: function() {
        var that = module.exports;
        logger.info('cron jobs starting');
        async.eachSeries([
            ['user_assessment_durations', user_assessment_durations],
        ], function(item, callback) {
            var title = item[0];
            var sql = item[1];
            var startTime = new Date();
            sqldb.query(sql, [], function(err) {
                var endTime = new Date();
                var elapsedTimeMS = endTime - startTime;
                if (ERR(err)) {
                    logger.error('cron: ' + title + ' failure, duration: ' + elapsedTimeMS + ' ms', err);
                } else {
                    logger.info('cron: ' + title + ' success, duration: ' + elapsedTimeMS + ' ms');
                }
                callback(null);
            });
        }, function() {
            logger.info('cron jobs finished');
            setTimeout(that.runJobs, config.cronIntervalMS);
        });
    },
};
