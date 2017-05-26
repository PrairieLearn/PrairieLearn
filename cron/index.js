var ERR = require('async-stacktrace');
var async = require('async');

var logger = require('../lib/logger');
var config = require('../lib/config');

var autoFinishExams = require('./autoFinishExams');
var errorAbandonedJobs = require('./errorAbandonedJobs');

module.exports = {
    init: function(callback) {
        var that = module.exports;
        logger.verbose('initializing cron', {cronIntervalMS: config.cronIntervalMS});
        setTimeout(that.runJobs, config.cronIntervalMS);
        callback(null);
    },

    runJobs: function() {
        var that = module.exports;
        logger.verbose('cron jobs starting');
        async.eachSeries([
            ['autoFinishExams', autoFinishExams],
            ['errorAbandonedJobs', errorAbandonedJobs],
        ], function(item, callback) {
            var title = item[0];
            var cronModule = item[1];
            var startTime = new Date();
            cronModule.run(function(err) {
                var endTime = new Date();
                var elapsedTimeMS = endTime - startTime;
                if (ERR(err, function() {})) {
                    logger.error('cron: ' + title + ' failure, duration: ' + elapsedTimeMS + ' ms',
                                 {message: err.message, stack: err.stack, data: JSON.stringify(err.data)});
                } else {
                    logger.verbose('cron: ' + title + ' success, duration: ' + elapsedTimeMS + ' ms');
                }
                callback(null); // don't return error as we want to do all cron jobs even if one fails
            });
        }, function() {
            logger.verbose('cron jobs finished');
            setTimeout(that.runJobs, config.cronIntervalMS);
        });
    },
};
