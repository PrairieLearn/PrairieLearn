var ERR = require('async-stacktrace');
var async = require('async');

var logger = require('../lib/logger');
var config = require('../lib/config');

var autoFinishExams = require('./autoFinishExams');
var errorAbandonedJobs = require('./errorAbandonedJobs');
var sendExternalGraderStats = require('./sendExternalGraderStats');
var calculateAssessmentQuestionStats = require('./calculateAssessmentQuestionStats');
var calculateAssessmentMode = require('./calculateAssessmentMode');

module.exports = {
    init: function(callback) {
        logger.verbose('initializing cron', {cronIntervalMS: config.cronIntervalMS});
        logger.verbose('and ', {statsCronIntervalMS: config.statsCronIntervalMS});
        var that = module.exports;
        that.queueAll();
        callback(null);
    },

    runJobs: function(jobs, callback) {
        logger.verbose('cron jobs starting:');
        jobs.forEach(function(job) {
          logger.verbose(job[0]);
        });
        async.eachSeries(jobs, function(item, callback) {
            var title = item[0];
            var cronModule = item[1];
            if (typeof cronModule.shouldRun === 'function') {
                if (!cronModule.shouldRun(Date.now(), config.cronIntervalMS)) {
                    return callback(null);
                }
            }

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
            callback();
        });
    },

    queueJobs: function(jobs, timeout) {
      var that = module.exports;
      var callback = function() {
        that.queueJobs(jobs, timeout);
      };
      var run = function() {
        that.runJobs(jobs, callback);
      };
      setTimeout(run, timeout);
    },

    queueAll: function() {
      var that = module.exports;
      var jobs = [
        ['autoFinishExams', autoFinishExams],
        ['errorAbandonedJobs', errorAbandonedJobs],
        ['sendExternalGraderStats', sendExternalGraderStats]
      ];
      that.queueJobs(jobs, config.cronIntervalMS);
      var statsJobs = [
        ['calculateAssessmentQuestionStats', calculateAssessmentQuestionStats],
        ['calculateAssessmentMode', calculateAssessmentMode],
      ];
      that.queueJobs(statsJobs, config.statsCronIntervalMS);
    }
};
