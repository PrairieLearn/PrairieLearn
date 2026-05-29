import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import type { Enrollment } from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';
import { getOrCreateUser } from '../tests/utils/auth.js';

import {
  addEnrollmentToPublishingExtension,
  insertPublishingExtension,
  removeStudentFromPublishingExtension,
} from './course-instance-publishing-extensions.js';
import { selectCourseInstanceById } from './course-instances.js';
import { ensureUncheckedEnrollment } from './enrollment.js';

let enrollmentCounter = 0;

async function createEnrollment(courseInstanceId = '1'): Promise<Enrollment> {
  enrollmentCounter++;
  const uid = `publishing-extension-${enrollmentCounter}@example.com`;
  const user = await getOrCreateUser({
    uid,
    name: `Publishing Extension User ${enrollmentCounter}`,
    uin: uid,
    email: uid,
  });
  const courseInstance = await selectCourseInstanceById(courseInstanceId);
  const enrollment = await ensureUncheckedEnrollment({
    userId: user.id,
    courseInstance,
    requiredRole: ['System'],
    authzData: dangerousFullSystemAuthz(),
    actionDetail: 'implicit_joined',
  });
  assert.isNotNull(enrollment);
  assert.isNotNull(enrollment.user_id);
  return enrollment;
}

describe('Course Instance Publishing Extensions Model', () => {
  beforeAll(async function () {
    await helperDb.before();
    await helperCourse.syncCourse(TEST_COURSE_PATH);
  });

  afterAll(helperDb.after);

  describe('addEnrollmentToPublishingExtension', () => {
    it('throws 403 when enrollment belongs to a different course instance', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const courseInstance = await selectCourseInstanceById('1');
        const enrollment = await createEnrollment('2');
        const extension = await insertPublishingExtension({
          courseInstance,
          name: 'Cross-course test',
          endDate: new Date(),
        });

        await expect(
          addEnrollmentToPublishingExtension({
            courseInstancePublishingExtension: extension,
            enrollment,
          }),
        ).rejects.toThrowError(
          expect.objectContaining({
            status: 403,
          }),
        );
      });
    });
  });

  describe('removeStudentFromPublishingExtension', () => {
    it('throws 403 when enrollment belongs to a different course instance', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const courseInstance = await selectCourseInstanceById('1');
        const enrollment = await createEnrollment('2');
        const extension = await insertPublishingExtension({
          courseInstance,
          name: 'Cross-course test',
          endDate: new Date(),
        });

        await expect(
          removeStudentFromPublishingExtension({
            courseInstancePublishingExtension: extension,
            enrollment,
          }),
        ).rejects.toThrowError(
          expect.objectContaining({
            status: 403,
          }),
        );
      });
    });
  });
});
