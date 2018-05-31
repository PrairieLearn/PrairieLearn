const ERR = require('async-stacktrace');
const async = require('async');
const _ = require('lodash');

const logger = require('../lib/logger');
const config = require('../lib/config');

const namedLocks = require('../lib/named-locks');
var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

// jobTimeouts meaning (used by stop()):
//     Timeout object = timeout is running and can be canceled
//     0 = job is currently running
//     -1 = stop requested
const jobTimeouts = {};

// Cron jobs are protected by two layers:
// 1. We use a namedLock of the form `cron:JOB_NAME`
// 2. We check the `cron_jobs` table and only run the job if the last
//    time it ran was more than `intervalSec` time ago.
// This means that we can have multiple servers running cron jobs and
// the jobs will still only run at the required frequency.

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

    // run a list of jobs
    runJobs(jobsList, callback) {
        logger.verbose('cron: jobs starting');
        async.eachSeries(jobsList, (job, callback) => {
            this.tryJobWithLock(job, (err) => {
                if (ERR(err, () => {})) {
                    logger.error('cron: ' + job.name + ' failure: ' + String(err),
                                 {message: err.message, stack: err.stack, data: JSON.stringify(err.data)});
                }
                // return null even on error so that we run all jobs even if one fails
                callback(null);
            });
        }, () => {
            logger.verbose('cron: jobs finished');
            callback(null);
        });
    },

    // try and get the job lock, and run the job if we get it
    tryJobWithLock(job, callback) {
        const lockName = 'cron:' + job.name;
        namedLocks.tryLock(lockName, (err, lock) => {
            if (ERR(err, callback)) return;
            if (lock == null) {
                logger.verbose('cron: ' + job.name + ' did not acquire lock');
                callback(null);
            } else {
                logger.verbose('cron: ' + job.name + ' acquired lock');
                this.tryJobWithTime(job, (err) => {
                    namedLocks.releaseLock(lock, (lockErr) => {
                        if (ERR(lockErr, callback)) return;
                        if (ERR(err, callback)) return;
                        logger.verbose('cron: ' + job.name + ' released lock');
                        callback(null);
                    });
                });
            }
        });
    },

    // See how long it is since we last ran the job and only run it if
    // enough time has elapsed. We are protected by a lock here so we
    // have exclusive access.
    tryJobWithTime(job, callback) {
        var interval_secs;
        if (Number.isInteger(job.intervalSec)) {
            interval_secs = job.intervalSec;
        } else if (job.intervalSec == 'daily') {
            interval_secs = 12 * 60 * 60;
        } else {
            return callback(new Error(`cron: ${job.name} invalid intervalSec: ${job.intervalSec}`));
        }
        const params = {
            name: job.name,
            interval_secs,
        };
        sqldb.query(sql.select_recent_cron_job, params, (err, result) => {
            if (ERR(err, callback)) return;
            if (result.rowCount > 0) {
                logger.verbose('cron: ' + job.name + ' job was recently run, skipping');
                callback(null);
            } else {
                logger.verbose('cron: ' + job.name + ' job was not recently run');
                const params = {name: job.name};
                sqldb.query(sql.update_cron_job_time, params, (err, _result) => {
                    if (ERR(err, callback)) return;
                    logger.verbose('cron: ' + job.name + ' updated date');
                    this.runJob(job, (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                });
            }
        });
    },

    // actually run the job
    runJob(job, callback) {
        logger.verbose('cron: starting ' + job.name);
        var startTime = new Date();
        job.module.run((err) => {
            if (ERR(err, callback)) return;
            var endTime = new Date();
            var elapsedTimeMS = endTime - startTime;
            logger.verbose('cron: ' + job.name + ' success, duration: ' + elapsedTimeMS + ' ms');
            callback(null);
        });
    },
};
