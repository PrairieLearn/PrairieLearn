const ERR = require('async-stacktrace');

const logger = require('../lib/logger');
const opsbot = require('../lib/opsbot');
const sqldb = require('../lib/sqldb');

module.exports = {};

module.exports.run = (callback) => {
    sqldb.call('grading_jobs_stats_day', [], function(err, result) {
        if (ERR(err, callback)) return;
        const {
            count,
            average_duration,
            total_duration
        } = result.rows[0];

        let msg = '_Autograder stats, past 24 hours_\n';
        msg +=    `Count: *${count}*\n`;
        msg +=    `Average duration: *${Number(average_duration).toFixed(1)}s*\n`;
        msg +=    `Total duration: *${Number(total_duration).toFixed(0)}s*\n`;

        opsbot.sendMessage(msg, (err, res, body) => {
            if (ERR(err, callback)) return;
            if (res.statusCode != 200) {
                logger.error('Error posting external grading stats to slack [status code ${res.statusCode}]');
                logger.error(body);
            }
            callback(null);
        });
    });
};

// Both given in ms
module.exports.shouldRun = (currentTime, cronInterval) => {
    // Only run if we have a place to send the message
    if (!opsbot.canSendMessages()) {
        return false;
    }

    // Corresponds to 2am UTC (9pm central)
    const desiredTime = 3 * 60 * 60 * 1000;
    // Computes time of day in milliseconds since midnight
    const dayTime = currentTime % (24 * 60 * 60 * 1000);
    return (desiredTime <= dayTime && dayTime <= desiredTime + cronInterval) || true;
};
