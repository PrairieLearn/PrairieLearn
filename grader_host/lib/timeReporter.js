const ERR = require('async-stacktrace');

const config = require('./config').config;
const sqldb = require('./sqldb');
const sql = require('./sql-loader').loadSqlEquiv(__filename);

function reportTime(sqlBlockName) {
  return function(jobId, callback) {
    if (!config.useDatabase) return callback(null);
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
