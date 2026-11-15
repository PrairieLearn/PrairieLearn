import { loadSqlEquiv, queryOptionalRow, queryRow } from '@prairielearn/postgres';

import { type CourseAgentUserSettings, CourseAgentUserSettingsSchema } from '../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/** A user who has never chosen settings in this course gets the defaults. */
export async function selectCourseAgentUserSettings({
  user_id,
  course_id,
}: {
  user_id: string;
  course_id: string;
}): Promise<CourseAgentUserSettings> {
  const settings = await queryOptionalRow(
    sql.select_course_agent_user_settings,
    { user_id, course_id },
    CourseAgentUserSettingsSchema,
  );
  return settings ?? { user_id, course_id, approval_mode: 'approval_required' };
}

export async function updateCourseAgentUserSettings({
  user_id,
  course_id,
  approval_mode,
}: CourseAgentUserSettings) {
  return await queryRow(
    sql.upsert_course_agent_user_settings,
    { user_id, course_id, approval_mode },
    CourseAgentUserSettingsSchema,
  );
}
