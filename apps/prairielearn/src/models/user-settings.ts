import { loadSqlEquiv, queryOptionalRow, queryRow } from '@prairielearn/postgres';

import { type UserSetting, UserSettingSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectUserSettings({ user_id }: { user_id: string }): Promise<UserSetting> {
  const settings = await queryOptionalRow(sql.select_user_settings, { user_id }, UserSettingSchema);
  return settings ?? { user_id, enable_keyboard_shortcut: true };
}

export async function updateUserSettings({
  user_id,
  enable_keyboard_shortcut,
}: {
  user_id: string;
  enable_keyboard_shortcut: boolean;
}): Promise<UserSetting> {
  return await queryRow(
    sql.upsert_user_settings,
    { user_id, enable_keyboard_shortcut },
    UserSettingSchema,
  );
}
