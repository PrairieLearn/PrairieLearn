import { faker } from '@faker-js/faker';

import { loadSqlEquiv, queryOptionalRow, queryRow } from '@prairielearn/postgres';

import { User, UserSchema } from '../lib/db-types.js';

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
    // faker.person.fullName() is not used because it adds prefixes we're not interested in.
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const middleName = Math.random() < 0.2 ? faker.person.middleName() + ' ' : '';
    const suffix = Math.random() < 0.2 ? ' ' + faker.person.suffix() : '';
    const email = faker.internet.exampleEmail({ firstName, lastName }).toLowerCase();
    const user = await queryOptionalRow(
      sql.insert_user,
      { name: `${firstName} ${middleName}${lastName}${suffix}`, uid: email, email },
      UserSchema,
    );
    // If the user already exists, we don't want to add them to the list of generated users.
    if (user) users.push(user);
  }
  return users;
}
