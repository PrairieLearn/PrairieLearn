import { loadSqlEquiv, queryOptionalRow, queryRow } from '@prairielearn/postgres';

import {
  type CourseAgentUserSettings,
  CourseAgentUserSettingsSchema,
  type EnumCourseAgentApprovalMode,
} from '../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/** A user with no row has the defaults. */
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
  return settings ?? { user_id, course_id, default_approval_mode: 'approval_required' };
}

export async function updateCourseAgentUserDefaultApprovalMode({
  user_id,
  course_id,
  default_approval_mode,
}: {
  user_id: string;
  course_id: string;
  default_approval_mode: EnumCourseAgentApprovalMode;
}) {
  return await queryRow(
    sql.upsert_course_agent_user_default_approval_mode,
    { user_id, course_id, default_approval_mode },
    CourseAgentUserSettingsSchema,
  );
}
