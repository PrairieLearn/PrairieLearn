const ERR = require('async-stacktrace');
const _ = require('lodash');
const cron = require('../cron');
const assert = require('chai').assert;

const config = require('../lib/config');
const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

const helperServer = require('./helperServer');

describe('Cron', function () {
  this.timeout(60000);

  after('shut down testing server', helperServer.after);

  describe('1. cron jobs', () => {
    it('should be configured to all run within the next 15 seconds', () => {
      // set config.cronDailyMS so that daily cron jobs will execute soon
      const now = new Date();
      const midnight = new Date(now).setHours(0, 0, 0, 0);
      const sinceMidnightMS = now - midnight;
      const dayMS = 24 * 60 * 60 * 1000;
      const timeToNextMS = 15 * 1000;
      const cronDailyMS = (timeToNextMS + sinceMidnightMS) % dayMS;
      config.cronDailySec = cronDailyMS / 1000;

      // set all other cron jobs to execute soon
      config.cronOverrideAllIntervalsSec = 3;
    });
    it('should init successfully', (callback) => {
      const init = helperServer.before();
      init.call(this, (err) => {
        if (ERR(err, callback)) return;
        callback(null);
      });
    });
    it('should wait for 20 seconds', (callback) => {
      setTimeout(callback, 20000);
    });
    it('should all have started', async () => {
      const result = await sqldb.queryAsync(sql.select_cron_jobs, []);
      const runJobs = _.map(result.rows, (row) => row.name);
      const cronJobs = _.map(cron.jobs, (row) => row.name);
      assert.lengthOf(_.difference(runJobs, cronJobs), 0);
      assert.lengthOf(_.difference(cronJobs, runJobs), 0);
    });
    it('should all have successfully completed', async () => {
      const result = await sqldb.queryAsync(sql.select_unsuccessful_cron_jobs, []);
      assert.lengthOf(result.rows, 0);
    });
  });
});
