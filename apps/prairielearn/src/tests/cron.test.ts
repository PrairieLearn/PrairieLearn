import { difference } from 'es-toolkit';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import * as sqldb from '@prairielearn/postgres';

import * as cron from '../cron/index.js';
import { config } from '../lib/config.js';
import { CronJobSchema } from '../lib/db-types.js';

import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

describe('Cron', { timeout: 60_000 }, function () {
  beforeAll(async function () {
    // Set config.cronDailySec so that daily cron jobs will execute soon.
    // We use 15s to ensure the target time hasn't already passed by the
    // time cron.init() runs (server startup can take several seconds).
    const now = Date.now();
    const midnight = new Date(now).setHours(0, 0, 0, 0);
    const sinceMidnightMS = now - midnight;
    const dayMS = 24 * 60 * 60 * 1000;
    const timeToNextMS = 15 * 1000;
    const cronDailyMS = (timeToNextMS + sinceMidnightMS) % dayMS;
    config.cronDailySec = cronDailyMS / 1000;

    // set all other cron jobs to execute soon
    config.cronOverrideAllIntervalsSec = 3;

    await helperServer.before()();
  });

  afterAll(helperServer.after);

  describe('1. cron jobs', () => {
    it('should wait for cron jobs to run and then stop cron', { timeout: 30_000 }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 20_000));
      // Stop cron and wait for any in-flight jobs to finish. This avoids
      // a race where a job has updated its `date` but hasn't yet written
      // `succeeded_at`, which would cause the next assertion to fail.
      await cron.stop();
    });

    it('should all have started', async () => {
      const result = await sqldb.queryRows(sql.select_cron_jobs, CronJobSchema);
      const runJobs = result.map((row) => row.name);
      const cronJobs = cron.jobs.map((row) => row.name);
      assert.lengthOf(difference(runJobs, cronJobs), 0);
      assert.lengthOf(difference(cronJobs, runJobs), 0);
    });

    it('should all have successfully completed', async () => {
      const rowCount = await sqldb.execute(sql.select_unsuccessful_cron_jobs);
      assert.equal(rowCount, 0);
    });
  });
});
