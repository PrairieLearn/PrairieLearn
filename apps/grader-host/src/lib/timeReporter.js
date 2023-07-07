const sqldb = require('@prairielearn/postgres');

const sql = sqldb.loadSqlEquiv(__filename);

function reportTime(sqlBlockName) {
  return async function (jobId) {
    const results = await sqldb.queryOneRowAsync(sql[sqlBlockName], {
      job_id: jobId,
    });
    return results.rows[0].time;
  };
}

module.exports.reportReceivedTime = reportTime('update_job_received_time');

module.exports.reportStartTime = reportTime('update_job_start_time');

module.exports.reportEndTime = reportTime('update_job_end_time');
