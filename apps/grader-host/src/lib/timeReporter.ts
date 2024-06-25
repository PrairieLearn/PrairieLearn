import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(import.meta.url);

function reportTime(sqlBlockName: string) {
  return async function (jobId) {
    const results = await sqldb.queryOneRowAsync(sql[sqlBlockName], {
      job_id: jobId,
    });
    return results.rows[0].time;
  };
}

export const reportReceivedTime = reportTime('update_job_received_time');

export const reportStartTime = reportTime('update_job_start_time');

export const reportEndTime = reportTime('update_job_end_time');
