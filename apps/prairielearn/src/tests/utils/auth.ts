import { z } from 'zod';
import { callValidatedOneRow, queryRow } from '@prairielearn/postgres';
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
  const user = await callValidatedOneRow(
    'users_select_or_insert',
    [config.authUid, config.authName, config.authUin, 'dev'],
    z.object({ user_id: IdSchema }),
  );
  return await queryRow(
    'SELECT * FROM users WHERE user_id = $id',
    { id: user.user_id },
    UserSchema,
  );
}
