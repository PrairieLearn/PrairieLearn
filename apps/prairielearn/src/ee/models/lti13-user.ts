import { loadSqlEquiv, queryAsync, queryOptionalRow } from '@prairielearn/postgres';
import { UserSchema, type User } from '../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Updates (or inserts) a row in the `lti13_users` table.
 */
export async function updateLti13UserSub({
  user_id,
  lti13_instance_id,
  sub,
}: {
  user_id: string;
  lti13_instance_id: string;
  sub: string;
}) {
  await queryAsync(sql.update_lti13_users, {
    user_id,
    lti13_instance_id,
    sub,
  });
}

/**
 * Selects a user by their LTI 1.3 sub claim for a given LTI 1.3 instance.
 */
export async function selectOptionalUserByLti13Sub({
  lti13_instance_id,
  sub,
}: {
  lti13_instance_id: string;
  sub: string;
}): Promise<User | null> {
  return await queryOptionalRow(
    sql.select_user_by_lti13_sub,
    { lti13_instance_id, sub },
    UserSchema,
  );
}
