import { loadSqlEquiv, queryAsync } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

/**
 * The `user_sessions` table is used to store user sessions. If a request is
 * received that doesn't have a session cookie, a new session is created and
 * persisted. However, if the user never logs in (as is common with scrapers),
 * the session will sit there forever. We need to retain records of logged-in
 * sessions forever for forensic purposes and also because fingerprints rely
 * on them, but if a given session never logs in, it won't ever be useful and
 * thus can be cleaned up.
 *
 * This cron job deletes all user sessions that have never been logged in to
 * (that is, that have a null `user_id`) and that were created more than an hour ago.
 */
export async function run() {
  await queryAsync(sql.clean_user_sessions, {});
}
