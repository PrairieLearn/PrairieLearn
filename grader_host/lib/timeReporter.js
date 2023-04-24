const ERR = require('async-stacktrace');
const sqldb = require('@prairielearn/postgres');

const { config } = require('./config');
const sql = sqldb.loadSqlEquiv(__filename);

function reportTime(sqlBlockName) {
  return function (jobId, callback) {
    if (!config.useDatabase) {
      // Fall back to machine time if DB isn't enabled
      const time = new Date().toISOString();
      return callback(null, time);
    }
    const params = { job_id: jobId };
    sqldb.queryOneRow(sql[sqlBlockName], params, (err, results) => {
      if (ERR(err, callback)) return;
      callback(null, results.rows[0].time);
    });
  };
}

module.exports.reportReceivedTime = reportTime('update_job_received_time');

module.exports.reportStartTime = reportTime('update_job_start_time');

module.exports.reportEndTime = reportTime('update_job_end_time');
