import { loadSqlEquiv, queryOptionalRow, queryRow } from '@prairielearn/postgres';

import { type User, UserSchema } from '../lib/db-types.js';
import * as faker from '../lib/faker.js';

import { insertAuditEvent } from './audit-event.js';

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
  // UIDs are globally unique, so if the institution_id doesn't match, the user is not in the institution.
  const user = await selectOptionalUserByUid(uid);
  if (user && user.institution_id !== institution_id) {
    return null;
  }
  return user;
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
  const user = await queryRow(
    sql.insert_user_lti,
    { uid, name, lti_course_instance_id, lti_user_id, lti_context_id, institution_id },
    UserSchema,
  );
  await insertAuditEvent({
    action: 'insert',
    table_name: 'users',
    row_id: user.user_id,
    new_row: user,
    // This is done by the system
    agent_user_id: null,
    agent_authn_user_id: null,
  });
  return user;
}

export async function updateUserName({
  user_id,
  name,
}: {
  user_id: string;
  name: string;
}): Promise<User> {
  const oldUser = await selectUserById(user_id);
  const newUser = await queryRow(sql.update_user_name, { user_id, name }, UserSchema);
  await insertAuditEvent({
    action: 'update',
    action_detail: 'name',
    table_name: 'users',
    row_id: user_id,
    old_row: oldUser,
    new_row: newUser,
    // This is done by the system
    agent_user_id: null,
    agent_authn_user_id: null,
  });
  return newUser;
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
