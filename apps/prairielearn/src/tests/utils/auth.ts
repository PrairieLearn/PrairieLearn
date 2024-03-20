import { z } from 'zod';
import { callRow, queryRow } from '@prairielearn/postgres';
import { config } from '../../lib/config';
import { IdSchema, User, UserSchema } from '../../lib/db-types';

export interface AuthUser {
  name: string;
  uid: string;
  uin: string;
}

export async function withUser<T>(user: AuthUser, fn: () => Promise<T>): Promise<T> {
  const originalName = config.authName;
  const originalUid = config.authUid;
  const originalUin = config.authUin;

  try {
    config.authName = user.name;
    config.authUid = user.uid;
    config.authUin = user.uin;

    return await fn();
  } finally {
    config.authName = originalName;
    config.authUid = originalUid;
    config.authUin = originalUin;
  }
}

export async function getConfiguredUser(): Promise<User> {
  if (!config.authUid || !config.authName || !config.authUin) {
    throw new Error('No configured user');
  }

  return await getOrCreateUser({
    uid: config.authUid,
    name: config.authName,
    uin: config.authUin,
  });
}

export async function getOrCreateUser(authUser: AuthUser): Promise<User> {
  const user = await callRow(
    'users_select_or_insert',
    [authUser.uid, authUser.name, authUser.uin, 'dev'],
    // The sproc returns multiple columns, but we only use the ID.
    z.object({ user_id: IdSchema }),
  );
  return await queryRow(
    'SELECT * FROM users WHERE user_id = $id',
    { id: user.user_id },
    UserSchema,
  );
}
