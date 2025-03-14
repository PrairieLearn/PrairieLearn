import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { TagSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectTagsByCourseId(course_id: string) {
  return await queryRows(sql.select_tags, { course_id }, TagSchema);
}
