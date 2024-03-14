import { assert } from 'chai';
import { step } from 'mocha-steps';

import * as sqldb from '@prairielearn/postgres';
import * as helperDb from '../helperDb';

const sql = sqldb.loadSqlEquiv(__filename);

async function getUserParams(user_id) {
  const query = 'SELECT uid, name, uin, institution_id FROM users WHERE user_id = $1;';
  const result = await sqldb.queryOneRowAsync(query, [user_id]);

  const { uid, name, uin, institution_id } = result.rows[0];
  return { uid, name, uin, institution_id };
}

async function usersSelectOrInsert(
  user: { uid: string; name: string; uin?: string | null },
  authn_provider_name: string | null = null,
  institution_id: string | null = null,
) {
  return sqldb.callAsync('users_select_or_insert', [
    user.uid,
    user.name,
    user.uin,
    authn_provider_name,
    institution_id,
  ]);
}

const baseUser = {
  uid: 'user@host.com',
  name: 'Joe User',
  uin: null,
  institution_id: '1',
};

describe('sproc users_select_or_insert tests', () => {
  before('set up testing server', helperDb.before);
  after('tear down testing database', helperDb.after);

  step('create new user', async () => {
    const result = await usersSelectOrInsert(baseUser);
    const user_id = result.rows[0].user_id;
    assert.equal(user_id, 1);

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(baseUser, fromdb);
  });

  step('create new user again, confirm info is the same', async () => {
    const result = await usersSelectOrInsert(baseUser);
    const user_id = result.rows[0].user_id;
    assert.equal(user_id, 1);

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(baseUser, fromdb);
  });

  step('user 1 updates name', async () => {
    const user = {
      ...baseUser,
      name: 'J.R. User',
    };

    const result = await usersSelectOrInsert(user);
    const user_id = result.rows[0].user_id;
    assert.equal(user_id, 1);

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  step('add an institution for host.com', async () => {
    await sqldb.queryAsync(sql.insert_host_com, []);
  });

  step('user 1 updates institution_id', async () => {
    const user = {
      ...baseUser,
      name: 'J.R. User',
      institution_id: '100',
    };

    const result = await usersSelectOrInsert(user, 'SAML', '100');
    const user_id = result.rows[0].user_id;
    assert.equal(user_id, 1);

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  step('user 1 updates uin when uin was null', async () => {
    const user = {
      ...baseUser,
      name: 'J.R. User',
      uin: '111122223',
      institution_id: '100',
    };

    const result = await usersSelectOrInsert(user, 'SAML', '100');
    const user_id = result.rows[0].user_id;
    assert.equal(user_id, 1);

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  step('user 1 updates uin when uin was value', async () => {
    const user = {
      ...baseUser,
      name: 'J.R. User',
      uin: '111122224',
      institution_id: '100',
    };

    const result = await usersSelectOrInsert(user, 'SAML', '100');
    const user_id = result.rows[0].user_id;
    assert.equal(user_id, 1);

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  step('user 1 updates uid with already present uin', async () => {
    const user = {
      ...baseUser,
      name: 'J.R. User',
      uid: 'newuid@host.com',
      uin: '111122224',
      institution_id: '100',
    };

    const result = await usersSelectOrInsert(user, 'SAML', '100');
    const user_id = result.rows[0].user_id;
    assert.equal(user_id, 1);

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  step('user 2 create under Shibboleth', async () => {
    const user = {
      uid: 'joe@illinois.edu',
      name: 'Joe Bob',
      uin: '444444444',
      institution_id: '1',
    };

    const result = await usersSelectOrInsert(user, 'Shibboleth');
    const user_id = result.rows[0].user_id;
    assert.equal(user_id, 2);

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  step('add an institution for illinois.edu', async () => {
    await sqldb.queryAsync(sql.insert_illinois_edu, []);
  });

  step('user 2 logs in via Google', async () => {
    const user = {
      uid: 'joe@illinois.edu',
      name: 'joe@illinois.edu',
      uin: null,
      institution_id: '200',
    };

    const result = await usersSelectOrInsert(user, 'Google', '200');
    const user_id = result.rows[0].user_id;
    assert.equal(user_id, 2);

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

  step('user 2 fails to log in via Azure', async () => {
    const user = {
      uid: 'joe@illinois.edu',
      name: 'joe@illinois.edu',
      uin: null,
      institution_id: '200',
    };

    const userResult = await usersSelectOrInsert(user, 'Azure');
    assert.equal(userResult.rows[0].result, 'invalid_authn_provider');
    assert.isNull(userResult.rows[0].user_id);
  });

  step('user 3 create under Google', async () => {
    const user = {
      uid: 'sally@illinois.edu',
      name: 'sally@illinois.edu',
      uin: null,
      institution_id: '200',
    };

    const result = await usersSelectOrInsert(user, 'Google', '200');
    const user_id = result.rows[0].user_id;
    assert.equal(user_id, 3);

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  step('user 3 logs in via SAML', async () => {
    const user = {
      uid: 'sally@illinois.edu',
      name: 'Sally Ann',
      uin: '555566665',
      institution_id: '200',
    };

    const result = await usersSelectOrInsert(user, 'SAML', '200');
    const user_id = result.rows[0].user_id;
    assert.equal(user_id, 3);

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  step('user 3 logs back in via Google', async () => {
    const user = {
      uid: 'sally@illinois.edu',
      name: 'sally@illinois.edu',
      uin: null,
      institution_id: '200',
    };

    const result = await usersSelectOrInsert(user, 'Google', '200');
    const user_id = result.rows[0].user_id;
    assert.equal(user_id, 3);

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

  step('user 4 created with wrong netid and correct UIN', async () => {
    const user = {
      uid: 'uin-888899990@illinois.edu',
      name: 'UIN 888899990',
      uin: '888899990',
      institution_id: '200',
    };

    const result = await usersSelectOrInsert(user, 'SAML', '200');
    const user_id = result.rows[0].user_id;
    assert.equal(user_id, 4);

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  step('user 4 logs in with full correct credentials', async () => {
    const user = {
      uid: 'newstudent',
      name: 'Johnny New Student',
      uin: '888899990',
      institution_id: '1',
    };

    const result = await usersSelectOrInsert(user, 'Shibboleth');
    const user_id = result.rows[0].user_id;
    assert.equal(user_id, 4);

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  // This test ensures that a malicious IDP cannot create a user with a UID
  // that doesn't match the institution's UID regexp.
  step('user 5 logs in with mismatched UID and institution', async () => {
    const user = {
      uid: 'jasmine@not-illinois.edu',
      name: 'Jasmine H. Acker',
      uin: '666666666',
    };

    await assert.isRejected(usersSelectOrInsert(user, 'SAML', '200'), /does not match policy/);
  });

  // This test ensures that users in separate institutions can have the same UIN.
  step('users 6 and 7 log in with the same UIN', async () => {
    const firstUser = {
      uid: 'raj@host.com',
      name: 'Raj Patel',
      uin: '787878787',
      institution_id: '100',
    };

    const secondUser = {
      uid: 'alex@illinois.edu',
      name: 'Alex Wong',
      uin: '787878787',
      institution_id: '200',
    };

    const firstResult = await usersSelectOrInsert(firstUser, 'SAML', '100');
    const firstUserId = firstResult.rows[0].user_id;
    const secondResult = await usersSelectOrInsert(secondUser, 'SAML', '200');
    const secondUserId = secondResult.rows[0].user_id;

    // Ensure two distinct users were created.
    assert.notEqual(firstUserId, secondUserId);

    const firstFromDb = await getUserParams(firstUserId);
    const secondFromDb = await getUserParams(secondUserId);

    assert.deepEqual(firstUser, firstFromDb);
    assert.deepEqual(secondUser, secondFromDb);
  });
});
