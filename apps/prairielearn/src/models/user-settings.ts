import { loadSqlEquiv, queryOptionalRow, queryRow } from '@prairielearn/postgres';

import { type UserSettings, UserSettingsSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectUserSettings({ user_id }: { user_id: string }): Promise<UserSettings> {
  const settings = await queryOptionalRow(
    sql.select_user_settings,
    { user_id },
    UserSettingsSchema,
  );
  return (
    settings ?? {
      user_id,
      course_agent_approval_mode: 'ask',
      enable_single_key_shortcuts: true,
    }
  );
}

export async function updateUserSettings({
  user_id,
  enable_single_key_shortcuts,
}: {
  user_id: string;
  enable_single_key_shortcuts: boolean;
}): Promise<UserSettings> {
  return await queryRow(
    sql.upsert_user_settings,
    { user_id, enable_single_key_shortcuts },
    UserSettingsSchema,
  );
}

export async function updateCourseAgentApprovalMode({
  user_id,
  course_agent_approval_mode,
}: {
  user_id: string;
  course_agent_approval_mode: UserSettings['course_agent_approval_mode'];
}): Promise<UserSettings> {
  return await queryRow(
    sql.upsert_course_agent_approval_mode,
    { user_id, course_agent_approval_mode },
    UserSettingsSchema,
  );
}
