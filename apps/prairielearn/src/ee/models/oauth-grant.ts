import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  queryRows,
} from '@prairielearn/postgres';

import {
  type Course,
  CourseSchema,
  type OauthGrant,
  OauthGrantSchema,
} from '../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function insertOauthGrant({
  user_id,
  oauth_client_id,
  scopes,
  resource,
  expires_at,
  course_ids,
}: {
  user_id: string;
  oauth_client_id: string;
  scopes: string[];
  resource: string;
  expires_at: Date;
  course_ids: string[];
}): Promise<OauthGrant> {
  return await queryRow(
    sql.insert_oauth_grant,
    { user_id, oauth_client_id, scopes, resource, expires_at, course_ids },
    OauthGrantSchema,
  );
}

export async function selectOptionalOauthGrantById(id: string): Promise<OauthGrant | null> {
  return await queryOptionalRow(sql.select_oauth_grant_by_id, { id }, OauthGrantSchema);
}

/** The courses the user picked for this grant that still exist. */
export async function selectOauthGrantCourses(oauth_grant_id: string): Promise<Course[]> {
  return await queryRows(sql.select_oauth_grant_courses, { oauth_grant_id }, CourseSchema);
}

export async function revokeOauthGrant(grant: OauthGrant) {
  await execute(sql.revoke_oauth_grant, { id: grant.id });
}

export async function updateOauthGrantLastUsed(grant: OauthGrant) {
  await execute(sql.update_oauth_grant_last_used, { id: grant.id });
}
