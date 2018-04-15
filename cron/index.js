const ERR = require('async-stacktrace');
const async = require('async');
const _ = require('lodash');

const logger = require('../lib/logger');
const config = require('../lib/config');

// jobTimeouts meaning (used by stop()):
//     Timeout object = timeout is running and can be canceled
//     0 = job is currently running
//     -1 = stop requested
const jobTimeouts = {};

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
                name: 'serverUsage',
                module: require('./serverUsage'),
                intervalSec: config.cronIntervalServerUsageSec,
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

    stop(callback) {
        _.forEach(jobTimeouts, (timeout, interval) => {
            if (!_.isInteger(timeout)) {
                // current pending timeout, which can be canceled
                clearTimeout(timeout);
                delete jobTimeouts[interval];
            } else if (timeout == 0) {
                // job is currently running, request that it stop
                jobTimeouts[interval] = -1;
            }
        });

        function check() {
            if (_.size(jobTimeouts) == 0) {
                callback(null);
            } else {
                setTimeout(check, 100);
            }
        }
        check();
    },

    queueJobs(jobsList, intervalSec) {
        const that = this;
        function queueRun() {
            jobTimeouts[intervalSec] = 0;
            that.runJobs(jobsList, () => {
                if (jobTimeouts[intervalSec] == -1) {
                    // someone requested a stop
                    delete jobTimeouts[intervalSec];
                    return;
                }
                jobTimeouts[intervalSec] = setTimeout(queueRun, intervalSec * 1000);
            });
        }
        jobTimeouts[intervalSec] = setTimeout(queueRun, intervalSec * 1000);
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
            jobTimeouts['daily'] = 0;
            that.runJobs(jobsList, () => {
                if (jobTimeouts['daily'] == -1) {
                    // someone requested a stop
                    delete jobTimeouts['daily'];
                    return;
                }
                jobTimeouts['daily'] = setTimeout(queueRun, timeToNextMS());
            });
        }
        jobTimeouts['daily'] = setTimeout(queueRun, timeToNextMS());
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
