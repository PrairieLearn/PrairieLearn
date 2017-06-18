var ERR = require('async-stacktrace');
var async = require('async');
var _ = require('lodash');

var logger = require('../lib/logger');
var config = require('../lib/config');

module.exports = {
    init(callback) {
        const jobs = [
            {
                name: 'autoFinishExams',
                module: require('./autoFinishExams'),
                intervalSec: config.cronIntervalAutoFinishExamsSec,
            },
            {
                name: 'errorAbandonedJobs',
                module: require('./errorAbandonedJobs'),
                intervalSec: config.cronIntervalErrorAbandonedJobsSec,
            },
            {
                name: 'sendExternalGraderStats',
                module: require('./sendExternalGraderStats'),
                intervalSec: 'daily',
            },
            {
                name: 'externalGraderLoad',
                module: require('./externalGraderLoad'),
                intervalSec: config.cronIntervalExternalGraderLoadSec,
            },
            {
                name: 'serverLoad',
                module: require('./serverLoad'),
                intervalSec: config.cronIntervalServerLoadSec,
            },
            {
                name: 'calculateAssessmentQuestionStats',
                module: require('./calculateAssessmentQuestionStats'),
                intervalSec: 'daily',
            },
            {
                name: 'calculateAssessmentMode',
                module: require('./calculateAssessmentMode'),
                intervalSec: 'daily',
            },
            {
                name: 'calculateQuestionStats',
                module: require('./calculateQuestionStats'),
                intervalSec: 'daily',
            },
        ];
        logger.verbose('initializing cron', _.map(jobs, j => _.pick(j, ['name', 'intervalSec'])));

        const jobsByPeriodSec = _.groupBy(jobs, 'intervalSec');
        _.forEach(jobsByPeriodSec, (jobsList, intervalSec) => {
            if (intervalSec == 'daily') {
                this.queueDailyJobs(jobsList);
            } else {
                this.queueJobs(jobsList, intervalSec);
            }
        });
        callback(null);
    },

    queueJobs(jobsList, intervalSec) {
        const that = this;
        function queueRun() {
            that.runJobs(jobsList, () => {
                setTimeout(queueRun, intervalSec * 1000);
            });
        }
        setTimeout(queueRun, intervalSec * 1000);
    },

    queueDailyJobs(jobsList) {
        const that = this;
        function timeToNextMS() {
            const now = new Date();
            const midnight = (new Date(now)).setHours(0,0,0,0);
            const sinceMidnightMS = now - midnight;
            const cronDailyMS = config.cronDailySec * 1000;
            const dayMS = 24 * 60 * 60 * 1000;
            var tMS = (cronDailyMS - sinceMidnightMS + dayMS) % dayMS;
            if (tMS < 0) {
                logger.error('negative tMS', {now, midnight, sinceMidnightMS, cronDailyMS, dayMS, tMS});
                tMS = 24 * 60 * 60 * 1000;
            }
            return tMS;
        }
        function queueRun() {
            that.runJobs(jobsList, () => {
                setTimeout(queueRun, timeToNextMS());
            });
        }
        setTimeout(queueRun, timeToNextMS());
    },

    runJobs(jobsList, callback) {
        logger.verbose('cron jobs starting');
        async.eachSeries(jobsList, (job, callback) => {
            var startTime = new Date();
            job.module.run((err) => {
                var endTime = new Date();
                var elapsedTimeMS = endTime - startTime;
                if (ERR(err, () => {})) {
                    logger.error('cron: ' + job.name + ' failure, duration: ' + elapsedTimeMS + ' ms',
                                 {message: err.message, stack: err.stack, data: JSON.stringify(err.data)});
                } else {
                    logger.verbose('cron: ' + job.name + ' success, duration: ' + elapsedTimeMS + ' ms');
                }
                callback(null); // don't return error as we want to do all cron jobs even if one fails
            });
        }, () => {
            logger.verbose('cron jobs finished');
            callback(null);
        });
    },
};
