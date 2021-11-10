const { callbackify } = require('util');

const logger = require('../lib/logger');
const opsbot = require('../lib/opsbot');
const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {};

module.exports.run = (callback) => {
  callbackify(async () => {
    if (!opsbot.canSendMessages()) return;
    const result = await sqldb.queryAsync(sql.select_unfinished_cron_jobs, []);
    if (result.rowCount <= 0) return;

    let msg = `_Unfinished cron jobs:_\n`;
    for (const row of result.rows) {
      msg += `    *${row.name}:* started at ${row.formatted_started_at} but not finished\n`;
      logger.error('cron:sendUnfinishedCronJobs job not finished', row);
    }

    const { res, body } = await opsbot.sendMessageAsync(msg);
    if (res.statusCode !== 200) {
      logger.error(`Error posting unfinished cron jobs to slack [status code ${res.statusCode}]`, {
        res,
        body,
      });
    }
  })(callback);
};
