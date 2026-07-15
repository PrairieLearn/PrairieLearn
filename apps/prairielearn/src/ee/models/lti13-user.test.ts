import { afterAll, assert, beforeAll, beforeEach, describe, test } from 'vitest';

import { execute, loadSqlEquiv, queryScalar } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import * as helperDb from '../../tests/helperDb.js';
import { getOrCreateUser } from '../../tests/utils/auth.js';

import {
  ensureLti13UserSub,
  selectOptionalUserByLti13Sub,
  updateLti13UserSub,
} from './lti13-user.js';

const sql = loadSqlEquiv(import.meta.url);

describe('ensureLti13UserSub', () => {
  let lti13InstanceId: string;
  let firstUserId: string;
  let secondUserId: string;

  beforeAll(async () => {
    await helperDb.before();
    lti13InstanceId = await queryScalar(sql.insert_lti13_instance, IdSchema);
    firstUserId = (
      await getOrCreateUser({
        uid: 'first@example.com',
        name: 'First User',
        uin: 'first',
        email: 'first@example.com',
      })
    ).id;
    secondUserId = (
      await getOrCreateUser({
        uid: 'second@example.com',
        name: 'Second User',
        uin: 'second',
        email: 'second@example.com',
      })
    ).id;
  });

  beforeEach(async () => {
    await execute(sql.delete_lti13_users);
  });

  afterAll(helperDb.after);

  test('creates an absent binding and accepts the same binding again', async () => {
    const params = {
      user_id: firstUserId,
      lti13_instance_id: lti13InstanceId,
      sub: 'first-sub',
    };

    assert.isTrue(await ensureLti13UserSub(params));
    assert.isTrue(await ensureLti13UserSub(params));
  });

  test('does not replace a different sub for the user', async () => {
    await updateLti13UserSub({
      user_id: firstUserId,
      lti13_instance_id: lti13InstanceId,
      sub: 'original-sub',
    });

    assert.isFalse(
      await ensureLti13UserSub({
        user_id: firstUserId,
        lti13_instance_id: lti13InstanceId,
        sub: 'replacement-sub',
      }),
    );
    assert.equal(
      (
        await selectOptionalUserByLti13Sub({
          lti13_instance_id: lti13InstanceId,
          sub: 'original-sub',
        })
      )?.id,
      firstUserId,
    );
  });

  test('does not move an existing sub to another user', async () => {
    await updateLti13UserSub({
      user_id: firstUserId,
      lti13_instance_id: lti13InstanceId,
      sub: 'shared-sub',
    });

    assert.isFalse(
      await ensureLti13UserSub({
        user_id: secondUserId,
        lti13_instance_id: lti13InstanceId,
        sub: 'shared-sub',
      }),
    );
    assert.equal(
      (
        await selectOptionalUserByLti13Sub({
          lti13_instance_id: lti13InstanceId,
          sub: 'shared-sub',
        })
      )?.id,
      firstUserId,
    );
  });
});
