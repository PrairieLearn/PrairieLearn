import { loadSqlEquiv, queryAsync } from '@prairielearn/postgres';

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
