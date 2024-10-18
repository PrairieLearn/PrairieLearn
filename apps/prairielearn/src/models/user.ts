import { loadSqlEquiv, queryOptionalRow, queryRow } from '@prairielearn/postgres';

import { type User, UserSchema } from '../lib/db-types.js';
import * as faker from '../lib/faker.js';

const sql = loadSqlEquiv(import.meta.url);

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

export async function generateUsers(count: number): Promise<User[]> {
  const users: User[] = [];
  while (users.length < count) {
    const { name, email } = faker.fakeNameAndEmail();
    const user = await queryOptionalRow(sql.insert_user, { name, uid: email, email }, UserSchema);
    // If the user already exists, we don't want to add them to the list of generated users.
    if (user) users.push(user);
  }
  return users;
}

export async function generateUser(): Promise<User> {
  return (await generateUsers(1))[0];
}
