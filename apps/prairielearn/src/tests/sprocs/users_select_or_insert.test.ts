import { afterAll, assert, beforeAll, describe, expect, test } from 'vitest';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { SprocUsersSelectOrInsertSchema, UserSchema } from '../../lib/db-types.js';
import * as helperDb from '../helperDb.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

async function getUserParams(user_id: string | null) {
  assert.ok(user_id);
  return await sqldb.queryRow(
    'SELECT uid, name, uin, institution_id FROM users WHERE id = $user_id;',
    { user_id },
    z.object({
      uid: UserSchema.shape.uid,
      name: UserSchema.shape.name,
      uin: UserSchema.shape.uin,
      institution_id: UserSchema.shape.institution_id,
    }),
  );
}

async function usersSelectOrInsert(
  user: { uid: string; name: string; uin?: string | null; email?: string | null },
  authn_provider_name: string | null = null,
  institution_id: string | null = null,
) {
  return await sqldb.callRow(
    'users_select_or_insert',
    [user.uid, user.name, user.uin, user.email, authn_provider_name, institution_id],
    SprocUsersSelectOrInsertSchema,
  );
}

const baseUser = {
  uid: 'user@host.com',
  name: 'Joe User',
  uin: null,
  institution_id: '1',
};

describe('sproc users_select_or_insert tests', () => {
  beforeAll(helperDb.before);

  afterAll(helperDb.after);

  test.sequential('create new user', async () => {
    const { user_id } = await usersSelectOrInsert(baseUser);
    assert.equal(user_id, '1');

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(baseUser, fromdb);
  });

  test.sequential('create new user again, confirm info is the same', async () => {
    const { user_id } = await usersSelectOrInsert(baseUser);
    assert.equal(user_id, '1');

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(baseUser, fromdb);
  });

  test.sequential('user 1 updates name', async () => {
    const user = {
      ...baseUser,
      name: 'J.R. User',
    };

    const { user_id } = await usersSelectOrInsert(user);
    assert.equal(user_id, '1');

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  test.sequential('add an institution for host.com', async () => {
    await sqldb.execute(sql.insert_host_com_institution);
  });

  test.sequential('user 1 updates institution_id', async () => {
    const user = {
      ...baseUser,
      name: 'J.R. User',
      institution_id: '100',
    };

    const { user_id } = await usersSelectOrInsert(user, 'SAML', '100');
    assert.equal(user_id, '1');

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  test.sequential('user 1 updates uin when uin was null', async () => {
    const user = {
      ...baseUser,
      name: 'J.R. User',
      uin: '111122223',
      institution_id: '100',
    };

    const { user_id } = await usersSelectOrInsert(user, 'SAML', '100');
    assert.equal(user_id, '1');

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  test.sequential('user 1 updates uin when uin was value', async () => {
    const user = {
      ...baseUser,
      name: 'J.R. User',
      uin: '111122224',
      institution_id: '100',
    };

    const { user_id } = await usersSelectOrInsert(user, 'SAML', '100');
    assert.equal(user_id, '1');

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  test.sequential('user 1 updates uid with already present uin', async () => {
    const user = {
      ...baseUser,
      name: 'J.R. User',
      uid: 'newuid@host.com',
      uin: '111122224',
      institution_id: '100',
    };

    const { user_id } = await usersSelectOrInsert(user, 'SAML', '100');
    assert.equal(user_id, '1');

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  test.sequential('user 2 create under Shibboleth', async () => {
    const user = {
      uid: 'joe@example.com',
      name: 'Joe Bob',
      uin: '444444444',
      institution_id: '1',
    };

    const { user_id } = await usersSelectOrInsert(user, 'Shibboleth');
    assert.equal(user_id, '2');

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  test.sequential('add an institution for example.com', async () => {
    await sqldb.execute(sql.insert_example_com_institution);
  });

  test.sequential('user 2 logs in via Google', async () => {
    const user = {
      uid: 'joe@example.com',
      name: 'joe@example.com',
      uin: null,
      institution_id: '200',
    };

    const { user_id } = await usersSelectOrInsert(user, 'Google', '200');
    assert.equal(user_id, '2');

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(
      {
        ...user,
        // The user should still have the same UIN.
        uin: '444444444',
      },
      fromdb,
    );
  });

  test.sequential('user 2 fails to log in via Azure', async () => {
    const user = {
      uid: 'joe@example.com',
      name: 'joe@example.com',
      uin: null,
      institution_id: '200',
    };

    const { result, user_id } = await usersSelectOrInsert(user, 'Azure');
    assert.equal(result, 'invalid_authn_provider');
    assert.isNull(user_id);
  });

  test.sequential('user 3 create under Google', async () => {
    const user = {
      uid: 'sally@example.com',
      name: 'sally@example.com',
      uin: null,
      institution_id: '200',
    };

    const { user_id } = await usersSelectOrInsert(user, 'Google', '200');
    assert.equal(user_id, '3');

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  test.sequential('user 3 logs in via SAML', async () => {
    const user = {
      uid: 'sally@example.com',
      name: 'Sally Ann',
      uin: '555566665',
      institution_id: '200',
    };

    const { user_id } = await usersSelectOrInsert(user, 'SAML', '200');
    assert.equal(user_id, '3');

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  test.sequential('user 3 logs back in via Google', async () => {
    const user = {
      uid: 'sally@example.com',
      name: 'sally@example.com',
      uin: null,
      institution_id: '200',
    };

    const { user_id } = await usersSelectOrInsert(user, 'Google', '200');
    assert.equal(user_id, '3');

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(
      {
        ...user,
        // The user should still have the same UIN.
        uin: '555566665',
      },
      fromdb,
    );
  });

  test.sequential('user 4 created with wrong netid and correct UIN', async () => {
    const user = {
      uid: 'uin-888899990@example.com',
      name: 'UIN 888899990',
      uin: '888899990',
      institution_id: '200',
    };

    const { user_id } = await usersSelectOrInsert(user, 'SAML', '200');
    assert.equal(user_id, '4');

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  test.sequential('user 4 logs in with full correct credentials', async () => {
    const user = {
      uid: 'newstudent',
      name: 'Johnny New Student',
      uin: '888899990',
      institution_id: '1',
    };

    const { user_id } = await usersSelectOrInsert(user, 'Shibboleth');
    assert.equal(user_id, '4');

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  // This test ensures that a malicious IDP cannot create a user with a UID
  // that doesn't match the institution's UID regexp.
  test.sequential('user 5 logs in with mismatched UID and institution', async () => {
    const user = {
      uid: 'jasmine@not-illinois.edu',
      name: 'Jasmine H. Acker',
      uin: '666666666',
    };

    await expect(usersSelectOrInsert(user, 'SAML', '200')).rejects.toThrow(/does not match policy/);
  });

  // This test ensures that users in separate institutions can have the same UIN.
  test.sequential('users 6 and 7 log in with the same UIN', async () => {
    const firstUser = {
      uid: 'raj@host.com',
      name: 'Raj Patel',
      uin: '787878787',
      institution_id: '100',
    };

    const secondUser = {
      uid: 'alex@example.com',
      name: 'Alex Wong',
      uin: '787878787',
      institution_id: '200',
    };

    const { user_id: firstUserId } = await usersSelectOrInsert(firstUser, 'SAML', '100');
    const { user_id: secondUserId } = await usersSelectOrInsert(secondUser, 'SAML', '200');

    // Ensure two distinct users were created.
    assert.notEqual(firstUserId, secondUserId);

    const firstFromDb = await getUserParams(firstUserId);
    const secondFromDb = await getUserParams(secondUserId);

    assert.deepEqual(firstUser, firstFromDb);
    assert.deepEqual(secondUser, secondFromDb);
  });
});
