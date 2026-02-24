import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export async function reportReceivedTime(jobId: string) {
  const grading_received_at = await sqldb.queryScalar(
    sql.update_job_received_time,
    { job_id: jobId },
    z.date(),
  );
  return grading_received_at;
}

export async function reportStartTime(jobId: string) {
  const grading_started_at = await sqldb.queryScalar(
    sql.update_job_start_time,
    { job_id: jobId },
    z.date(),
  );
  return grading_started_at;
}

export async function reportEndTime(jobId: string) {
  const grading_finished_at = await sqldb.queryScalar(
    sql.update_job_end_time,
    { job_id: jobId },
    z.date(),
  );
  return grading_finished_at;
}
