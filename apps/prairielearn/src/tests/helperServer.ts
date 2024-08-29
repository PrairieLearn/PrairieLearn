import { setTimeout as sleep } from 'node:timers/promises';

import { assert } from 'chai';
import debugfn from 'debug';
import * as tmp from 'tmp-promise';

import { cache } from '@prairielearn/cache';
import * as opentelemetry from '@prairielearn/opentelemetry';
import * as sqldb from '@prairielearn/postgres';

import * as cron from '../cron/index.js';
import * as assets from '../lib/assets.js';
import * as codeCaller from '../lib/code-caller/index.js';
import { config } from '../lib/config.js';
import * as externalGrader from '../lib/externalGrader.js';
import * as externalGradingSocket from '../lib/externalGradingSocket.js';
import * as load from '../lib/load.js';
import * as localCache from '../lib/local-cache.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import * as serverJobs from '../lib/server-jobs.js';
import * as socketServer from '../lib/socket-server.js';
import * as freeformServer from '../question-servers/freeform.js';
import * as server from '../server.js';

import * as helperCourse from './helperCourse.js';
import * as helperDb from './helperDb.js';

const debug = debugfn('prairielearn:helperServer');
const sql = sqldb.loadSqlEquiv(import.meta.url);

config.startServer = false;
// Pick a unique port based on the Mocha worker ID.
config.serverPort = (3007 + Number.parseInt(process.env.MOCHA_WORKER_ID ?? '0', 10)).toString();

export function before(courseDir: string | string[] = TEST_COURSE_PATH): () => Promise<void> {
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
      await cron.init();

      debug('before(): inserting dev user');
      await server.insertDevUser();

      debug('before(): sync from disk');
      if (Array.isArray(courseDir)) {
        for (const dir of courseDir) {
          await helperCourse.syncCourse(dir);
        }
      } else {
        await helperCourse.syncCourse(courseDir);
      }

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
      externalGradingSocket.init();
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
    await server.stopServer();

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

export async function waitForJobSequence(job_sequence_id) {
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

export async function waitForJobSequenceStatus(job_sequence_id, status: 'Success' | 'Error') {
  const job_sequence = await waitForJobSequence(job_sequence_id);

  // In the case of a failure, print more information to aid debugging.
  if (job_sequence.status !== status) {
    console.log(job_sequence);
    const result = await sqldb.queryAsync(sql.select_jobs, { job_sequence_id });
    console.log(result.rows);
  }

  assert.equal(job_sequence.status, status);
}

export async function waitForJobSequenceSuccess(job_sequence_id) {
  await waitForJobSequenceStatus(job_sequence_id, 'Success');
}
