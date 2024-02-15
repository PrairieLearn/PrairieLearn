import { loadSqlEquiv, queryOptionalRow, queryRow } from '@prairielearn/postgres';

import { User, UserSchema } from '../lib/db-types';

const sql = loadSqlEquiv(__filename);

export async function selectUserById(user_id: string): Promise<User> {
  return await queryRow(sql.select_user_by_id, { user_id }, UserSchema);
}

export async function selectUserByUid(uid: string): Promise<User | null> {
  return await queryOptionalRow(sql.select_user_by_uid, { uid }, UserSchema);
}

/**
 * Locks the user with `SELECT ... FOR NO KEY UPDATE` and returns the user.
 */
export async function selectAndLockUserById(user_id: string): Promise<User> {
  return await queryRow(sql.select_and_lock_user_by_id, { user_id }, UserSchema);
}

export async function selectOrInsertUserByUid(uid: string): Promise<User> {
  return await queryRow(sql.select_or_insert_user_by_uid, { uid }, UserSchema);
}
