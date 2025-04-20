import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export function reportReceivedTime(jobId: string) {
  return sqldb.queryRow(sql.update_job_received_time, { job_id: jobId }, z.date());
}

export function reportStartTime(jobId: string) {
  return sqldb.queryRow(sql.update_job_start_time, { job_id: jobId }, z.date());
}

export function reportEndTime(jobId: string) {
  return sqldb.queryRow(sql.update_job_end_time, { job_id: jobId }, z.date());
}
