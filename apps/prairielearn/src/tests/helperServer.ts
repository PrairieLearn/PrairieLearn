import { promisify, callbackify } from 'util';
import * as tmp from 'tmp-promise';
import * as path from 'path';
import { setTimeout as sleep } from 'node:timers/promises';
import { assert } from 'chai';
import * as opentelemetry from '@prairielearn/opentelemetry';
import debugfn from 'debug';
import { cache } from '@prairielearn/cache';

import * as assets from '../lib/assets';
import { config } from '../lib/config';
import * as load from '../lib/load';
import * as cron from '../cron';
import * as socketServer from '../lib/socket-server';
import * as serverJobs from '../lib/server-jobs-legacy';
import * as freeformServer from '../question-servers/freeform';
import * as localCache from '../lib/local-cache';
import * as codeCaller from '../lib/code-caller';
import * as externalGrader from '../lib/externalGrader';
import * as externalGradingSocket from '../lib/externalGradingSocket';
import { TEST_COURSE_PATH } from '../lib/paths';

import * as sqldb from '@prairielearn/postgres';
const sql = sqldb.loadSqlEquiv(__filename);

import * as server from '../server';

import * as helperDb from './helperDb';
import * as helperCourse from './helperCourse';

const debug = debugfn('prairielearn:' + path.basename(__filename, '.js'));

config.startServer = false;
// Pick a unique port based on the Mocha worker ID.
config.serverPort = (3007 + Number.parseInt(process.env.MOCHA_WORKER_ID ?? '0', 10)).toString();

export function before(courseDir: string = TEST_COURSE_PATH): () => Promise<void> {
  return async () => {
    debug('before()');
    try {
      // We (currently) don't ever want tracing to run during tests.
      await opentelemetry.init({ openTelemetryEnabled: false });

      debug('before(): initializing DB');
      // pass "this" explicitly to enable this.timeout() calls
      await helperDb.before.call(this);

      debug('before(): create tmp dir for config.filesRoot');
      const tmpDir = await tmp.dir({ unsafeCleanup: true });
      config.filesRoot = tmpDir.path;

      debug('before(): initializing cron');
      cron.init();

      debug('before(): inserting dev user');
      await promisify(server.insertDevUser)();

      debug('before(): sync from disk');
      await helperCourse.syncCourse(courseDir);

      debug('before(): set up load estimators');
      load.initEstimator('request', 1);
      load.initEstimator('authed_request', 1);
      load.initEstimator('python', 1);

      debug('before(): initialize code callers');
      await codeCaller.init();
      await assets.init();

      debug('before(): start server');
      const httpServer = await server.startServer();

      debug('before(): initialize socket server');
      socketServer.init(httpServer);

      debug('before(): initialize cache');
      await cache.init({
        type: config.cacheType,
        keyPrefix: config.cacheKeyPrefix,
        redisUrl: config.redisUrl,
      });

      debug('before(): initialize server jobs');
      serverJobs.init();

      debug('before(): initialize freeform server');
      await freeformServer.init();

      externalGrader.init();
      await promisify(externalGradingSocket.init)();
    } finally {
      debug('before(): completed');
    }
  };
}

export async function after(): Promise<void> {
  debug('after()');
  // call close()/stop() functions in reverse order to the
  // start() functions above
  try {
    await assets.close();

    debug('after(): finish workers');
    await codeCaller.finish();

    debug('after(): stop server');
    await promisify(server.stopServer)();

    debug('after(): close socket server');
    await socketServer.close();

    debug('after(): close load estimators');
    load.close();

    debug('after(): stop cron');
    await cron.stop();

    debug('after(): close server jobs');
    await serverJobs.stop();

    debug('after(): close cache');
    await cache.close();

    debug('after(): close local cache');
    localCache.close();

    debug('after(): finish DB');
    await helperDb.after.call(this);
  } finally {
    debug('after(): complete');
  }
}

export async function getLastJobSequenceIdAsync() {
  const result = await sqldb.queryZeroOrOneRowAsync(sql.select_last_job_sequence, []);
  if (result.rowCount === 0) {
    throw new Error('Could not find last job_sequence_id: did the job start?');
  }
  const job_sequence_id = result.rows[0].id;
  return job_sequence_id;
}

export const getLastJobSequenceId = callbackify(getLastJobSequenceIdAsync);

export async function waitForJobSequenceAsync(job_sequence_id) {
  let job_sequence;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await sqldb.queryOneRowAsync(sql.select_job_sequence, {
      job_sequence_id,
    });
    job_sequence = result.rows[0];
    if (job_sequence.status !== 'Running') break;
    await sleep(10);
  }
  return job_sequence;
}

export const waitForJobSequence = callbackify(waitForJobSequenceAsync);

export async function waitForJobSequenceSuccessAsync(job_sequence_id) {
  const job_sequence = await waitForJobSequenceAsync(job_sequence_id);

  // In the case of a failure, print more information to aid debugging.
  if (job_sequence.status !== 'Success') {
    console.log(job_sequence);
    const result = await sqldb.queryAsync(sql.select_jobs, { job_sequence_id });
    console.log(result.rows);
  }

  assert.equal(job_sequence.status, 'Success');
}

export const waitForJobSequenceSuccess = callbackify(waitForJobSequenceSuccessAsync);
