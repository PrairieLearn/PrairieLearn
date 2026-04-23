import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export interface SharingSetUsage {
  question_count: number;
  consumer_count: number;
}

export async function selectSharingSetUsage({
  course_id,
  name,
}: {
  course_id: string;
  name: string;
}): Promise<SharingSetUsage> {
  return await sqldb.queryRow(
    sql.select_sharing_set_usage,
    { course_id, name },
    z.object({
      question_count: z.coerce.number(),
      consumer_count: z.coerce.number(),
    }),
  );
}

export async function deleteSharingSet({
  course_id,
  name,
}: {
  course_id: string;
  name: string;
}): Promise<void> {
  await sqldb.execute(sql.delete_sharing_set, { course_id, name });
}
