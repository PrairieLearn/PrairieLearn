import * as _ from 'lodash';
import debugfn from 'debug';
import { v4 as uuidv4 } from 'uuid';
import { setTimeout as sleep } from 'node:timers/promises';
import { trace, context, suppressTracing, SpanStatusCode } from '@prairielearn/opentelemetry';
import * as Sentry from '@prairielearn/sentry';
import { logger } from '@prairielearn/logger';
import * as namedLocks from '@prairielearn/named-locks';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config';
import { isEnterprise } from '../lib/license';

const debug = debugfn('prairielearn:cron');
const sql = sqldb.loadSqlEquiv(__filename);

/**
 * jobTimeouts meaning (used by stop()):
 *     Timeout object = timeout is running and can be canceled
 *     0 = job is currently running
 *     -1 = stop requested
 */
const jobTimeouts: Record<string | number, number | NodeJS.Timeout> = {};

interface CronJobModule {
  run: () => Promise<void>;
}

interface CronJob {
  name: string;
  module: CronJobModule;
  intervalSec: number | 'daily';
}

export let jobs: CronJob[] = [];

// Cron jobs are protected by two layers:
// 1. We use a namedLock of the form `cron:JOB_NAME`
// 2. We check the `cron_jobs` table and only run the job if the last
//    time it ran was more than `intervalSec` time ago.
// This means that we can have multiple servers running cron jobs and
// the jobs will still only run at the required frequency.

export function init() {
  debug(`init()`);
  if (!config.cronActive) {
    logger.verbose('cronActive is false, skipping cron initialization');
    return;
  }

  jobs = [
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
      intervalSec:
        config.cronOverrideAllIntervalsSec ||
        config.cronIntervalCalculateAssessmentQuestionStatsSec,
    },
    {
      name: 'workspaceTimeoutStop',
      module: require('./workspaceTimeoutStop'),
      intervalSec: config.cronOverrideAllIntervalsSec || config.cronIntervalWorkspaceTimeoutStopSec,
    },
    {
      name: 'workspaceTimeoutWarn',
      module: require('./workspaceTimeoutWarn'),
      intervalSec: config.cronOverrideAllIntervalsSec || config.cronIntervalWorkspaceTimeoutWarnSec,
    },
    {
      name: 'workspaceHostTransitions',
      module: require('./workspaceHostTransitions'),
      intervalSec:
        config.cronOverrideAllIntervalsSec || config.cronIntervalWorkspaceHostTransitionsSec,
    },
    {
      name: 'cleanTimeSeries',
      module: require('./cleanTimeSeries'),
      intervalSec: config.cronOverrideAllIntervalsSec || config.cronIntervalCleanTimeSeriesSec,
    },
  ];

  if (isEnterprise()) {
    jobs.push({
      name: 'workspaceHostLoads',
      module: require('../ee/cron/workspaceHostLoads'),
      intervalSec: config.cronOverrideAllIntervalsSec || config.cronIntervalWorkspaceHostLoadsSec,
    });

    jobs.push({
      name: 'chunksHostAutoScaling',
      module: require('../ee/cron/chunksHostAutoScaling'),
      intervalSec:
        config.cronOverrideAllIntervalsSec || config.cronIntervalChunksHostAutoScalingSec,
    });
  }

  const enabledJobs = config.cronEnabledJobs;
  const disabledJobs = config.cronDisabledJobs;

  if (enabledJobs && disabledJobs) {
    throw new Error('Cannot set both cronEnabledJobs and cronDisabledJobs');
  }

  jobs.forEach((job) => {
    if (typeof job.module.run !== 'function') {
      throw new Error(`Cron job ${job.name} does not have a run() function`);
    }
  });

  jobs = jobs.filter((job) => {
    if (enabledJobs) {
      return enabledJobs.includes(job.name);
    } else if (disabledJobs) {
      return !disabledJobs.includes(job.name);
    } else {
      return true;
    }
  });

  logger.verbose(
    'initializing cron',
    _.map(jobs, (j) => _.pick(j, ['name', 'intervalSec'])),
  );

  const jobsByPeriodSec = _.groupBy(jobs, 'intervalSec');
  _.forEach(jobsByPeriodSec, (jobsList, intervalSec) => {
    const intervalSecNum = Number.parseInt(intervalSec);
    if (intervalSec === 'daily') {
      queueDailyJobs(jobsList);
    } else if (Number.isNaN(intervalSecNum)) {
      throw new Error(`Invalid cron interval: ${intervalSec}`);
    } else if (intervalSecNum > 0) {
      queueJobs(jobsList, intervalSecNum);
    } // zero or negative intervalSec jobs are not run
  });
}

export async function stop() {
  Object.entries(jobTimeouts).forEach(([interval, timeout]) => {
    if (typeof timeout !== 'number') {
      // This is a pending timeout, which can be canceled.
      clearTimeout(timeout);
      delete jobTimeouts[interval];
    } else if (timeout === 0) {
      // Job is currently running; request that it stop.
      jobTimeouts[interval] = -1;
    }
  });

  // Wait until all jobs have finished.
  while (Object.keys(jobTimeouts).length > 0) {
    await sleep(100);
  }
}

function queueJobs(jobsList: CronJob[], intervalSec: number) {
  debug(`queueJobs(): ${intervalSec}`);
  function queueRun() {
    debug(`queueJobs(): ${intervalSec}: starting run`);
    jobTimeouts[intervalSec] = 0;
    runJobs(jobsList)
      .catch((err) => {
        logger.error('Error running cron jobs', err);
        Sentry.captureException(err);
      })
      .finally(() => {
        debug(`queueJobs(): ${intervalSec}: completed run`);
        if (jobTimeouts[intervalSec] === -1) {
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
}

function queueDailyJobs(jobsList: CronJob[]) {
  debug(`queueDailyJobs()`);
  function timeToNextMS() {
    const now = Date.now();
    const midnight = new Date(now).setHours(0, 0, 0, 0);
    const sinceMidnightMS = now - midnight;
    const cronDailyMS = config.cronDailySec * 1000;
    const dayMS = 24 * 60 * 60 * 1000;
    let tMS = (cronDailyMS - sinceMidnightMS + dayMS) % dayMS;
    if (tMS < 0) {
      logger.error('negative tMS', {
        now,
        midnight,
        sinceMidnightMS,
        cronDailyMS,
        dayMS,
        tMS,
      });
      tMS = 24 * 60 * 60 * 1000;
    }
    return tMS;
  }
  function queueRun() {
    debug(`queueDailyJobs(): starting run`);
    jobTimeouts['daily'] = 0;
    runJobs(jobsList)
      .catch((err) => {
        logger.error('Error running cron jobs', err);
        Sentry.captureException(err);
      })
      .finally(() => {
        debug(`queueDailyJobs(): completed run`);
        if (jobTimeouts['daily'] === -1) {
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
}

// run a list of jobs
async function runJobs(jobsList: CronJob[]) {
  debug(`runJobs()`);
  const cronUuid = uuidv4();
  logger.verbose('cron: jobs starting', { cronUuid });

  for (const job of jobsList) {
    debug(`runJobs(): running ${job.name}`);
    const tracer = trace.getTracer('cron');
    await tracer.startActiveSpan(`cron:${job.name}`, async (span) => {
      // Don't actually trace anything that runs during the job;
      // that would create too many events for us. The only thing
      // we're interested in for now is the duration and the
      // success/failure state.
      await context.with(suppressTracing(context.active()), async () => {
        try {
          await tryJobWithLock(job, cronUuid);
          span.setStatus({ code: SpanStatusCode.OK });
        } catch (err) {
          debug(`runJobs(): error running ${job.name}: ${err}`);
          logger.error(`cron: ${job.name} failure: ` + String(err), {
            message: err.message,
            stack: err.stack,
            data: JSON.stringify(err.data),
            cronUuid,
          });

          Sentry.captureException(err, {
            tags: {
              'cron.name': job.name,
              'cron.uuid': cronUuid,
            },
          });

          span.recordException(err);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: err.message,
          });
        }

        debug(`runJobs(): completed ${job.name}`);
      });

      span.end();
    });
  }

  debug(`runJobs(): done`);
  logger.verbose('cron: jobs finished', { cronUuid });
}

// try and get the job lock, and run the job if we get it
async function tryJobWithLock(job: CronJob, cronUuid: string) {
  debug(`tryJobWithLock(): ${job.name}`);
  const lockName = 'cron:' + job.name;
  const didLock = await namedLocks.doWithLock(
    lockName,
    { onNotAcquired: () => false },
    async () => {
      debug(`tryJobWithLock(): ${job.name}: acquired lock`);
      logger.verbose('cron: ' + job.name + ' acquired lock', { cronUuid });
      await tryJobWithTime(job, cronUuid);
      return true;
    },
  );

  if (didLock) {
    debug(`tryJobWithLock(): ${job.name}: released lock`);
    logger.verbose('cron: ' + job.name + ' released lock', {
      cronUuid,
    });
  } else {
    debug(`tryJobWithLock(): ${job.name}: did not acquire lock`);
    logger.verbose('cron: ' + job.name + ' did not acquire lock', {
      cronUuid,
    });
  }
}

// See how long it is since we last ran the job and only run it if
// enough time has elapsed. We are protected by a lock here so we
// have exclusive access.
async function tryJobWithTime(job: CronJob, cronUuid: string) {
  debug(`tryJobWithTime(): ${job.name}`);
  let interval_secs;
  if (Number.isInteger(job.intervalSec)) {
    interval_secs = job.intervalSec;
  } else if (job.intervalSec === 'daily') {
    interval_secs = 12 * 60 * 60;
  } else {
    throw new Error(`cron: ${job.name} invalid intervalSec: ${job.intervalSec}`);
  }
  const result = await sqldb.queryAsync(sql.select_recent_cron_job, {
    name: job.name,
    interval_secs,
  });

  if (result.rowCount != null && result.rowCount > 0) {
    debug(`tryJobWithTime(): ${job.name}: job was recently run, skipping`);
    logger.verbose('cron: ' + job.name + ' job was recently run, skipping', { cronUuid });
    return null;
  }

  debug(`tryJobWithTime(): ${job.name}: job was not recently run`);
  logger.verbose('cron: ' + job.name + ' job was not recently run', {
    cronUuid,
  });
  const params = { name: job.name };
  await sqldb.queryAsync(sql.update_cron_job_time, params);
  debug(`tryJobWithTime(): ${job.name}: updated run time`);
  logger.verbose('cron: ' + job.name + ' updated date', { cronUuid });
  await runJob(job, cronUuid);
  debug(`tryJobWithTime(): ${job.name}: done`);
  await sqldb.queryAsync(sql.update_succeeded_at, { name: job.name });
  debug(`tryJobWithTime(): ${job.name}: updated succeeded_at`);
}

// actually run the job
async function runJob(job: CronJob, cronUuid: string) {
  debug(`runJob(): ${job.name}`);
  logger.verbose('cron: starting ' + job.name, { cronUuid });
  const startTime = Date.now();
  await job.module.run();
  const endTime = Date.now();
  const elapsedTimeMS = endTime - startTime;
  debug(`runJob(): ${job.name}: success, duration ${elapsedTimeMS} ms`);
  logger.verbose('cron: ' + job.name + ' success', {
    cronUuid,
    elapsedTimeMS,
  });
}
