var ERR = require('async-stacktrace');
var _ = require('lodash');
var fs = require('fs');
var async = require('async');

var logger = require('./lib/logger');
var error = require('./lib/error');
var config = require('./lib/config');
var sqldb = require('./lib/sqldb');

var userAssessmentDurations = require('./userAssessmentDurations');
var autoFinishExams = require('./autoFinishExams');

module.exports = {
    init: function(callback) {
        var that = module.exports;
        logger.info('initializing cron', {cronIntervalMS: config.cronIntervalMS});
        setTimeout(that.runJobs, config.cronIntervalMS);
        callback(null);
    },

    runJobs: function() {
        var that = module.exports;
        logger.info('cron jobs starting');
        async.eachSeries([
            ['userAssessmentDurations', userAssessmentDurations],
            ['autoFinishExams', autoFinishExams],
        ], function(item, callback) {
            var title = item[0];
            var cronModule = item[1];
            var startTime = new Date();
            cronModule.run(function(err) {
                var endTime = new Date();
                var elapsedTimeMS = endTime - startTime;
                if (ERR(err)) {
                    logger.error('cron: ' + title + ' failure, duration: ' + elapsedTimeMS + ' ms', err);
                } else {
                    logger.info('cron: ' + title + ' success, duration: ' + elapsedTimeMS + ' ms');
                }
                callback(null); // don't return error as we want to do all cron jobs even if one fails
            });
        }, function() {
            logger.info('cron jobs finished');
            setTimeout(that.runJobs, config.cronIntervalMS);
        });
    },
};
