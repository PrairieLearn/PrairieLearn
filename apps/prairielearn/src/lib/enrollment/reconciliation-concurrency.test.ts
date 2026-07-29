import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  execute,
  loadSqlEquiv,
  queryOptionalScalar,
  queryRow,
  queryScalar,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { withResolvers } from '@prairielearn/utils';
import { IdSchema } from '@prairielearn/zod';

import { selectCourseInstanceById } from '../../models/course-instances.js';
import * as helperCourse from '../../tests/helperCourse.js';
import * as helperDb from '../../tests/helperDb.js';
import { type CourseInstance } from '../db-types.js';
import { TEST_COURSE_PATH } from '../paths.js';

import { admitUserToCourseInstance } from './reconciliation.js';
import {
  actorFor,
  createEnrollment,
  createUser,
  selectEnrollments,
} from './reconciliation.test-helpers.js';

const sql = loadSqlEquiv(import.meta.url);

async function setLocalApplicationName(applicationName: string): Promise<void> {
  await queryScalar(
    sql.set_local_application_name,
    { application_name: applicationName },
    z.string(),
  );
}

async function waitForApplicationLock(
  applicationName: string,
  queryPattern: string,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const waiting = await queryOptionalScalar(
      sql.select_waiting_application_lock,
      { application_name: applicationName, query_pattern: queryPattern },
      z.number(),
    );
    if (waiting !== null) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${applicationName} to run ${queryPattern}`);
}

describe('checked enrollment admission concurrency', { concurrent: false }, () => {
  let courseInstance: CourseInstance;

  beforeAll(async () => {
    await helperDb.before();
    await helperCourse.syncCourse(TEST_COURSE_PATH);
    courseInstance = await selectCourseInstanceById('1');
  });

  afterAll(helperDb.after);

  it('revalidates a candidate deleted after selection before validation', async () => {
    const user = await createUser({ prefix: 'candidate-deletion' });
    const invitation = await createEnrollment({ courseInstance, pendingUid: user.uid });
    const parentLocked = withResolvers<undefined>();
    const releaseDeletion = withResolvers<undefined>();
    const deletion = runInTransactionAsync(async () => {
      await queryRow(
        sql.lock_enrollment,
        { enrollment_id: invitation.id },
        z.object({ id: IdSchema }),
      );
      parentLocked.resolve(undefined);
      await releaseDeletion.promise;
      await execute(sql.delete_enrollment, { enrollment_id: invitation.id });
    }).catch((error) => {
      parentLocked.reject(error);
      throw error;
    });
    void deletion.catch(() => undefined);

    try {
      await parentLocked.promise;
      const applicationName = `candidate-delete-${crypto.randomUUID()}`;
      let validationCalls = 0;
      const admission = runInTransactionAsync(async () => {
        await setLocalApplicationName(applicationName);
        return await admitUserToCourseInstance({
          courseInstanceId: courseInstance.id,
          userId: user.id,
          source: { type: 'pending_uid' },
          ...actorFor(user),
          validateAdmission: async () => {
            validationCalls += 1;
          },
        });
      });
      void admission.catch(() => undefined);
      await waitForApplicationLock(applicationName, '%lock_enrollments_by_id%');
      releaseDeletion.resolve(undefined);

      await expect(admission).rejects.toMatchObject({
        decision: { allowed: false, reason: 'no_matching_invitation' },
      });
      expect(validationCalls).toBe(0);
      expect(await selectEnrollments([invitation.id])).toEqual([]);
    } finally {
      releaseDeletion.resolve(undefined);
      await deletion;
    }
  });

  it('rolls back admission after a database error', async () => {
    const user = await createUser({ prefix: 'unrelated-error' });
    const invitation = await createEnrollment({ courseInstance, pendingUin: user.uin });
    let validationCalls = 0;

    await expect(
      admitUserToCourseInstance({
        courseInstanceId: courseInstance.id,
        userId: user.id,
        source: { type: 'institution_uin' },
        agentAuthnUserId: '999999999999999999',
        agentUserId: '999999999999999999',
        validateAdmission: async () => {
          validationCalls += 1;
        },
      }),
    ).rejects.toMatchObject({ code: '23503' });

    expect(validationCalls).toBe(1);
    expect(await selectEnrollments([invitation.id])).toEqual([invitation]);
  });
});
