import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(import.meta.url);

function reportTime(sqlBlockName: string) {
  return async function (jobId: string | number) {
    return await sqldb.queryRow(sql[sqlBlockName], { job_id: jobId }, z.date());
  };
}

export const reportReceivedTime = reportTime('update_job_received_time');

export const reportStartTime = reportTime('update_job_start_time');

export const reportEndTime = reportTime('update_job_end_time');
