import { z } from 'zod';

import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Check if a user is a member of a team.
 */
export async function isUserInTeam({
  team_id,
  user_id,
}: {
  team_id: string;
  user_id: string;
}): Promise<boolean> {
  const result = await queryRow(
    sql.is_user_in_team,
    { team_id, user_id },
    z.object({ is_member: z.boolean() }),
  );
  return result.is_member;
}
