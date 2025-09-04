import { loadSqlEquiv, queryOptionalRow, queryRow } from '@prairielearn/postgres';

import { type User, UserSchema } from '../lib/db-types.js';
import * as faker from '../lib/faker.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectUserById(user_id: string): Promise<User> {
  return await queryRow(sql.select_user_by_id, { user_id }, UserSchema);
}

export async function selectUserByUid(uid: string): Promise<User> {
  return await queryRow(sql.select_user_by_uid, { uid }, UserSchema);
}

export async function selectOptionalUserByUid(uid: string): Promise<User | null> {
  return await queryOptionalRow(sql.select_user_by_uid, { uid }, UserSchema);
}

export async function selectUserByUidAndInstitution({
  uid,
  institution_id,
}: {
  uid: string;
  institution_id: string;
}): Promise<User | null> {
  return await queryOptionalRow(
    sql.select_user_by_uid_and_institution,
    { uid, institution_id },
    UserSchema,
  );
}

export async function selectOptionalUserByUin({
  uin,
  institution_id,
}: {
  uin: string;
  institution_id: string;
}): Promise<User | null> {
  return await queryOptionalRow(sql.select_user_by_uin, { uin, institution_id }, UserSchema);
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

export async function insertUserLti({
  uid,
  name,
  lti_course_instance_id,
  lti_user_id,
  lti_context_id,
  institution_id,
}: {
  uid: string;
  name: string | null;
  lti_course_instance_id: string;
  lti_user_id: string;
  lti_context_id: string;
  institution_id: string;
}): Promise<User> {
  return await queryRow(
    sql.insert_user_lti,
    { uid, name, lti_course_instance_id, lti_user_id, lti_context_id, institution_id },
    UserSchema,
  );
}

export async function updateUserName({
  user_id,
  name,
}: {
  user_id: string;
  name: string;
}): Promise<User> {
  return await queryRow(sql.update_user_name, { user_id, name }, UserSchema);
}

export async function updateUserUid({ user_id, uid }: { user_id: string; uid: string }) {
  return await queryRow(sql.update_user_uid, { user_id, uid }, UserSchema);
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
