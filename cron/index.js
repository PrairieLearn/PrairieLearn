const ERR = require('async-stacktrace');
const async = require('async');
const _ = require('lodash');
const debug = require('debug')('prairielearn:cron');
const uuidv4 = require('uuid/v4');

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
        debug(`init()`);
        module.exports.jobs = [
            {
                name: 'sendUnfinishedCronWarnings',
                module: require('./sendUnfinishedCronWarnings'),
                intervalSec: 'daily',
            },
            {
                name: 'autoFinishExams',
                module: require('./autoFinishExams'),
                intervalSec: config.cronOverrideAllIntervalsSec || config.cronIntervalAutoFinishExamsSec,
            },
            {
                name: 'errorAbandonedJobs',
                module: require('./errorAbandonedJobs'),
                intervalSec: config.cronOverrideAllIntervalsSec || config.cronIntervalErrorAbandonedJobsSec,
            },
            {
                name: 'sendExternalGraderStats',
                module: require('./sendExternalGraderStats'),
                intervalSec: 'daily',
            },
            {
                name: 'sendExternalGraderDeadLetters',
                module: require('./sendExternalGraderDeadLetters'),
                intervalSec: 'daily',
            },
            {
                name: 'externalGraderLoad',
                module: require('./externalGraderLoad'),
                intervalSec: config.cronOverrideAllIntervalsSec || config.cronIntervalExternalGraderLoadSec,
            },
            {
                name: 'serverLoad',
                module: require('./serverLoad'),
                intervalSec: config.cronOverrideAllIntervalsSec || config.cronIntervalServerLoadSec,
            },
            {
                name: 'serverUsage',
                module: require('./serverUsage'),
                intervalSec: config.cronOverrideAllIntervalsSec || config.cronIntervalServerUsageSec,
            },
            {
                name: 'calculateAssessmentQuestionStats',
                module: require('./calculateAssessmentQuestionStats'),
                intervalSec: config.cronOverrideAllIntervalsSec || config.cronIntervalCalculateAssessmentQuestionStatsSec,
            },
            {
                name: 'calculateAssessmentMode',
                module: require('./calculateAssessmentMode'),
                intervalSec: 'daily',
            },
        ];
        logger.verbose('initializing cron', _.map(module.exports.jobs, j => _.pick(j, ['name', 'intervalSec'])));

        const jobsByPeriodSec = _.groupBy(module.exports.jobs, 'intervalSec');
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
        debug(`stop()`);
        _.forEach(jobTimeouts, (timeout, interval) => {
            if (!_.isInteger(timeout)) {
                // current pending timeout, which can be canceled
                debug(`stop(): clearing timeout for ${interval}`);
                clearTimeout(timeout);
                delete jobTimeouts[interval];
            } else if (timeout == 0) {
                // job is currently running, request that it stop
                debug(`stop(): requesting stop for ${interval}`);
                jobTimeouts[interval] = -1;
            }
        });

        function check() {
            if (_.size(jobTimeouts) == 0) {
                debug(`stop(): all jobs stopped`);
                callback(null);
            } else {
                debug(`stop(): waiting for ${_.size(jobTimeouts)} jobs to stop`);
                setTimeout(check, 100);
            }
        }
        check();
    },

    queueJobs(jobsList, intervalSec) {
        debug(`queueJobs(): ${intervalSec}`);
        const that = this;
        function queueRun() {
            debug(`queueJobs(): ${intervalSec}: starting run`);
            jobTimeouts[intervalSec] = 0;
            that.runJobs(jobsList, () => {
                debug(`queueJobs(): ${intervalSec}: completed run`);
                if (jobTimeouts[intervalSec] == -1) {
                    // someone requested a stop
                    debug(`queueJobs(): ${intervalSec}: stop requested`);
                    delete jobTimeouts[intervalSec];
                    return;
                }
                debug(`queueJobs(): ${intervalSec}: waiting for next run time`);
                jobTimeouts[intervalSec] = setTimeout(queueRun, intervalSec * 1000);
            });
        }
        jobTimeouts[intervalSec] = setTimeout(queueRun, intervalSec * 1000);
    },

    queueDailyJobs(jobsList) {
        debug(`queueDailyJobs()`);
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
            debug(`queueDailyJobs(): starting run`);
            jobTimeouts['daily'] = 0;
            that.runJobs(jobsList, () => {
                debug(`queueDailyJobs(): completed run`);
                if (jobTimeouts['daily'] == -1) {
                    // someone requested a stop
                    debug(`queueDailyJobs(): stop requested`);
                    delete jobTimeouts['daily'];
                    return;
                }
                debug(`queueDailyJobs(): waiting for next run time`);
                jobTimeouts['daily'] = setTimeout(queueRun, timeToNextMS());
            });
        }
        jobTimeouts['daily'] = setTimeout(queueRun, timeToNextMS());
    },

    // run a list of jobs
    runJobs(jobsList, callback) {
        debug(`runJobs()`);
        const cronUuid = uuidv4();
        logger.verbose('cron: jobs starting', {cronUuid});
        async.eachSeries(jobsList, (job, callback) => {
            debug(`runJobs(): running ${job.name}`);
            this.tryJobWithLock(job, cronUuid, (err) => {
                if (ERR(err, () => {})) {
                    debug(`runJobs(): error running ${job.name}: ${err}`);
                    logger.error('cron: ' + job.name + ' failure: ' + String(err),
                                 {message: err.message, stack: err.stack, data: JSON.stringify(err.data), cronUuid});
                }
                // return null even on error so that we run all jobs even if one fails
                debug(`runJobs(): completed ${job.name}`);
                callback(null);
            });
        }, () => {
            debug(`runJobs(): done`);
            logger.verbose('cron: jobs finished', {cronUuid});
            callback(null);
        });
    },

    // try and get the job lock, and run the job if we get it
    tryJobWithLock(job, cronUuid, callback) {
        debug(`tryJobWithLock(): ${job.name}`);
        const lockName = 'cron:' + job.name;
        namedLocks.tryLock(lockName, (err, lock) => {
            if (ERR(err, callback)) return;
            if (lock == null) {
                debug(`tryJobWithLock(): ${job.name}: did not acquire lock`);
                logger.verbose('cron: ' + job.name + ' did not acquire lock', {cronUuid});
                callback(null);
            } else {
                debug(`tryJobWithLock(): ${job.name}: acquired lock`);
                logger.verbose('cron: ' + job.name + ' acquired lock', {cronUuid});
                this.tryJobWithTime(job, cronUuid, (err) => {
                    namedLocks.releaseLock(lock, (lockErr) => {
                        if (ERR(lockErr, callback)) return;
                        if (ERR(err, callback)) return;
                        debug(`tryJobWithLock(): ${job.name}: released lock`);
                        logger.verbose('cron: ' + job.name + ' released lock', {cronUuid});
                        callback(null);
                    });
                });
            }
        });
    },

    // See how long it is since we last ran the job and only run it if
    // enough time has elapsed. We are protected by a lock here so we
    // have exclusive access.
    tryJobWithTime(job, cronUuid, callback) {
        debug(`tryJobWithTime(): ${job.name}`);
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
                debug(`tryJobWithTime(): ${job.name}: job was recently run, skipping`);
                logger.verbose('cron: ' + job.name + ' job was recently run, skipping', {cronUuid});
                callback(null);
            } else {
                debug(`tryJobWithTime(): ${job.name}: job was not recently run`);
                logger.verbose('cron: ' + job.name + ' job was not recently run', {cronUuid});
                const params = {name: job.name};
                sqldb.query(sql.update_cron_job_time, params, (err, _result) => {
                    if (ERR(err, callback)) return;
                    debug(`tryJobWithTime(): ${job.name}: updated run time`);
                    logger.verbose('cron: ' + job.name + ' updated date', {cronUuid});
                    this.runJob(job, cronUuid, (err) => {
                        if (ERR(err, callback)) return;
                        debug(`tryJobWithTime(): ${job.name}: done`);
                        const params = {name: job.name};
                        sqldb.query(sql.update_succeeded_at, params, (err, _result) => {
                            if (ERR(err, callback)) return;
                            debug(`tryJobWithTime(): ${job.name}: updated succeeded_at`);
                            callback(null);
                        });
                    });
                });
            }
        });
    },

    // actually run the job
    runJob(job, cronUuid, callback) {
        debug(`runJob(): ${job.name}`);
        logger.verbose('cron: starting ' + job.name, {cronUuid});
        var startTime = new Date();
        job.module.run((err) => {
            if (ERR(err, callback)) return;
            var endTime = new Date();
            var elapsedTimeMS = endTime - startTime;
            debug(`runJob(): ${job.name}: success, duration ${elapsedTimeMS} ms`);
            logger.verbose('cron: ' + job.name + ' success', {cronUuid, elapsedTimeMS});
            callback(null);
        });
    },
};
