import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest';

import { execute, loadSqlEquiv, runInTransactionAsync } from '@prairielearn/postgres';
import { withResolvers } from '@prairielearn/utils';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { EXAMPLE_COURSE_PATH } from '../lib/paths.js';
import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';

import { selectCourseInstanceById } from './course-instances.js';
import {
  deleteCoursePermissions,
  insertCoursePermissionsByUserUid,
  selectCoursePermissionForUser,
} from './course-permissions.js';
import { runWithExclusiveEnrollmentBarrier } from './enrollment-barrier.js';
import { ensureUncheckedEnrollment, selectOptionalEnrollmentByUserId } from './enrollment.js';

const sql = loadSqlEquiv(import.meta.url);

// PostgreSQL SQLSTATE for lock_not_available.
const POSTGRES_LOCK_NOT_AVAILABLE = '55P03';

describe('deleteCoursePermissions', () => {
  beforeAll(async () => {
    await helperDb.before();
    await helperCourse.syncCourse(EXAMPLE_COURSE_PATH);
  });

  afterAll(helperDb.after);

  it('rolls back when its enrollment barrier is blocked', async () => {
    const courseInstance = await selectCourseInstanceById('1');
    const user = await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'course-permissions-test@example.com',
      course_role: 'Owner',
      authn_user_id: '1',
    });
    await ensureUncheckedEnrollment({
      userId: user.id,
      courseInstance,
      actionDetail: 'implicit_joined',
      authzData: dangerousFullSystemAuthz(),
      requiredRole: ['System'],
    });

    const barrierHeld = withResolvers<undefined>();
    const releaseBarrier = withResolvers<undefined>();
    const barrierHolder = runWithExclusiveEnrollmentBarrier(courseInstance.id, async () => {
      barrierHeld.resolve(undefined);
      await releaseBarrier.promise;
    });
    await barrierHeld.promise;

    try {
      await expect(
        runInTransactionAsync(async () => {
          await execute(sql.set_short_lock_timeout);
          await deleteCoursePermissions({
            course_id: '1',
            user_id: user.id,
            authn_user_id: '1',
          });
        }),
      ).rejects.toMatchObject({ code: POSTGRES_LOCK_NOT_AVAILABLE });
    } finally {
      releaseBarrier.resolve(undefined);
      await barrierHolder;
    }

    assert.isNotNull(
      await selectOptionalEnrollmentByUserId({
        userId: user.id,
        courseInstance,
        authzData: dangerousFullSystemAuthz(),
        requiredRole: ['System'],
      }),
    );
    assert.equal(
      await selectCoursePermissionForUser({ course_id: '1', user_id: user.id }),
      'Owner',
    );
  });
});
