const { callbackify } = require('util');

const { logger } = require('@prairielearn/logger');
const opsbot = require('../lib/opsbot');
const sqldb = require('@prairielearn/postgres');

const sql = sqldb.loadSqlEquiv(__filename);

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

    await opsbot
      .sendMessage(msg)
      .catch((err) => logger.error(`Error posting unfinished cron jobs to slack`, err.data));
  })(callback);
};
