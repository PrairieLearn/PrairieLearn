import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { User, UserSchema } from '../lib/db-types';

const sql = loadSqlEquiv(__filename);

export async function selectUserById(user_id: string): Promise<User> {
  return await queryRow(sql.select_user_by_id, { user_id }, UserSchema);
}
