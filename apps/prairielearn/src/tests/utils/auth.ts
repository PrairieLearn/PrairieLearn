import { z } from 'zod';

import { callRow, queryRow } from '@prairielearn/postgres';

import { config } from '../../lib/config.js';
import { IdSchema, type User, UserSchema } from '../../lib/db-types.js';

export interface AuthUser {
  name: string | null;
  uid: string;
  uin: string | null;
  email: string | null;
}

export async function withUser<T>(user: AuthUser, fn: () => Promise<T>): Promise<T> {
  const originalName = config.authName;
  const originalUid = config.authUid;
  const originalUin = config.authUin;
  const originalEmail = config.authEmail;

  try {
    config.authName = user.name;
    config.authUid = user.uid;
    config.authUin = user.uin;
    config.authEmail = user.email;

    return await fn();
  } finally {
    config.authName = originalName;
    config.authUid = originalUid;
    config.authUin = originalUin;
    config.authEmail = originalEmail;
  }
}

export async function getConfiguredUser(): Promise<User> {
  if (!config.authUid || !config.authName || !config.authUin || !config.authEmail) {
    throw new Error('No configured user');
  }

  return await getOrCreateUser({
    uid: config.authUid,
    name: config.authName,
    uin: config.authUin,
    email: config.authEmail,
  });
}

export async function getOrCreateUser(authUser: AuthUser): Promise<User> {
  const user = await callRow(
    'users_select_or_insert',
    [authUser.uid, authUser.name, authUser.uin, authUser.email, 'dev'],
    // The sproc returns multiple columns, but we only use the ID.
    z.object({ user_id: IdSchema }),
  );
  return await queryRow(
    'SELECT * FROM users WHERE user_id = $id',
    { id: user.user_id },
    UserSchema,
  );
}
