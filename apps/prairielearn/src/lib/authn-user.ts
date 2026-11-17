import assert from 'node:assert';

import * as sqldb from '@prairielearn/postgres';

import { type LoadUserAuth } from './authn.types.js';
import { SprocUsersSelectOrInsertSchema } from './db-types.js';
import { HttpRedirect } from './redirect.js';

export async function selectOrInsertUserId(authnParams: LoadUserAuth): Promise<string> {
  const userSelectOrInsertRes = await sqldb.callRow(
    'users_select_or_insert',
    [
      authnParams.uid,
      authnParams.name,
      authnParams.uin,
      authnParams.email,
      authnParams.provider,
      authnParams.institution_id,
    ],
    SprocUsersSelectOrInsertSchema,
  );

  const { result, user_institution_id } = userSelectOrInsertRes;
  if (result === 'invalid_authn_provider') {
    assert(user_institution_id !== null);
    throw new HttpRedirect(
      `/pl/login?unsupported_provider=true&institution_id=${user_institution_id}`,
    );
  }

  assert(userSelectOrInsertRes.user_id !== null);
  return userSelectOrInsertRes.user_id;
}
