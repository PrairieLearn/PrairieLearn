const ERR = require('async-stacktrace');

const config = require('../lib/config');
const logger = require('../lib/logger');
const opsbot = require('../lib/opsbot');
const sqldb = require('../lib/sqldb');

module.exports = {};

module.exports.run = (callback) => {
    if (!opsbot.canSendMessages()) return callback(null);
    sqldb.callOneRow('grading_jobs_stats_day', [], function(err, result) {
        if (ERR(err, callback)) return;
        const {
            count,
            delta_total,
            delta_submitted_at,
            delta_started_at,
            delta_finished_at,
            delta_final,
        } = result.rows[0];

        let msg = `_External grading stats, past 24 hours:_ *${config.externalGradingSqsQueueName}*\n`;
        msg +=    `Count: *${count}*\n`;
        msg +=    `Average duration: *${Number(delta_total).toFixed(2)} s*\n`;
        msg +=    `Composed of:\n`;
        msg +=    `    Avg time to submit: *${Number(delta_submitted_at).toFixed(2)} s*\n`;
        msg +=    `    Avg time to queue: *${Number(delta_started_at).toFixed(2)} s*\n`;
        msg +=    `    Avg time to execute: *${Number(delta_finished_at).toFixed(2)} s*\n`;
        msg +=    `    Avg time to report: *${Number(delta_final).toFixed(2)} s*\n`;

        opsbot.sendMessage(msg, (err, res, body) => {
            if (ERR(err, callback)) return;
            if (res.statusCode != 200) {
                logger.error('Error posting external grading stats to slack [status code ${res.statusCode}]', body);
            }
            callback(null);
        });
    });
};
