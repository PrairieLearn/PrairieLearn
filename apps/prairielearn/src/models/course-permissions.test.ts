import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest';

import { execute, loadSqlEquiv, runInTransactionAsync } from '@prairielearn/postgres';

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
import { ensureUncheckedEnrollment, selectOptionalEnrollmentByUserId } from './enrollment.js';

const sql = loadSqlEquiv(import.meta.url);

function deferred() {
  let resolve: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve: resolve! };
}

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

    const barrierHeld = deferred();
    const releaseBarrier = deferred();
    const barrierHolder = runInTransactionAsync(async () => {
      await execute(sql.acquire_exclusive_course_instance_enrollment_barrier, {
        course_instance_id: courseInstance.id,
      });
      barrierHeld.resolve();
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
      ).rejects.toMatchObject({ code: '55P03' });
    } finally {
      releaseBarrier.resolve();
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
