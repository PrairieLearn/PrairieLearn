const ERR = require('async-stacktrace');

const logger = require('../lib/logger');
const opsbot = require('../lib/opsbot');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {};

module.exports.run = (callback) => {
    if (!opsbot.canSendMessages()) return callback(null);
    sqldb.query(sql.select_unfinished_cron_jobs, [], (err, result) => {
        if (ERR(err, callback)) return;

        if (result.rowCount <= 0) return callback(null);

        let msg = `_Unfinished cron jobs:_\n`;
        for (const row of result.rows) {
            msg += `    *${row.name}:* started at ${row.formatted_started_at} but not finished\n`;
        }

        opsbot.sendMessage(msg, (err, res, body) => {
            if (ERR(err, callback)) return;
            if (res.statusCode != 200) {
                logger.error('Error posting unfinished cron jobs to slack [status code ${res.statusCode}]', body);
            }
            callback(null);
        });
    });
};
