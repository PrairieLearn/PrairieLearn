import crypto from 'node:crypto';

import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryScalar,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import type {
  Assessment,
  CourseInstance,
  CourseInstancePublishingExtension,
  Enrollment,
} from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';

import {
  type EnrollmentAccessControlRuleData,
  replaceEnrollmentAccessControlRules,
  selectAccessControlRules,
} from './assessment-access-control-rules.js';
import { selectAssessmentByTid } from './assessment.js';
import {
  addEnrollmentToPublishingExtension,
  createPublishingExtensionWithEnrollments,
  removeStudentFromPublishingExtension,
  selectEnrollmentsForPublishingExtension,
  updatePublishingExtensionEnrollments,
} from './course-instance-publishing-extensions.js';
import { selectCourseInstanceById } from './course-instances.js';
import { lockEnrollments, normalizeEnrollmentIds } from './enrollment-lock.js';
import {
  generateAndEnrollUsers,
  selectUsersAndEnrollmentsByUidsInCourseInstance,
} from './enrollment.js';
import {
  addLabelToEnrollments,
  createStudentLabel,
  removeLabelFromEnrollments,
  selectEnrollmentsInStudentLabel,
  updateStudentLabelEnrollments,
} from './student-label.js';

const sql = loadSqlEquiv(import.meta.url);

function deferred() {
  let resolve: () => void;
  let reject: (error: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject: reject!, resolve: resolve! };
}

async function expectEnrollmentLock(enrollmentId: string) {
  await expect(
    runInTransactionAsync(async () => {
      await execute(sql.set_short_lock_timeout);
      await execute(sql.lock_enrollment_for_no_key_update, {
        enrollment_id: enrollmentId,
      });
    }),
  ).rejects.toMatchObject({ code: '55P03' });
}

async function withHeldWriter(
  writer: () => Promise<void>,
  checkLocks: () => Promise<void>,
): Promise<void> {
  const held = deferred();
  const release = deferred();
  const writerPromise = runInTransactionAsync(async () => {
    await writer();
    held.resolve();
    await release.promise;
  }).catch((error) => {
    held.reject(error);
    throw error;
  });

  try {
    await held.promise;
    await checkLocks();
  } finally {
    release.resolve();
    await writerPromise;
  }
}

function makeRuleData(id?: string): EnrollmentAccessControlRuleData {
  return {
    id,
    beforeReleaseListed: null,
    releaseDate: null,
    dueOverridden: false,
    dueDate: null,
    dueCredit: null,
    earlyDeadlinesOverridden: false,
    lateDeadlinesOverridden: false,
    afterLastDeadlineAllowSubmissions: null,
    afterLastDeadlineCredit: null,
    durationMinutesOverridden: false,
    durationMinutes: null,
    passwordOverridden: false,
    password: null,
    questionsHidden: null,
    questionsVisibleFromDate: null,
    questionsVisibleUntilDate: null,
    scoreHidden: null,
    scoreVisibleFromDate: null,
    earlyDeadlines: [],
    lateDeadlines: [],
  };
}

async function setLocalApplicationName(applicationName: string): Promise<void> {
  await queryScalar(
    sql.set_local_application_name,
    { application_name: applicationName },
    z.string(),
  );
}

async function waitForEnrollmentLockWaiter({
  applicationName,
  afterQueryStart,
}: {
  applicationName: string;
  afterQueryStart?: string;
}): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const query = afterQueryStart
      ? sql.select_later_waiting_enrollment_lock
      : sql.select_waiting_enrollment_lock;
    const waiting = await queryOptionalRow(
      query,
      {
        application_name: applicationName,
        ...(afterQueryStart ? { after_query_start: afterQueryStart } : {}),
      },
      z.object({ query_start: z.string() }),
    );
    if (waiting) return waiting.query_start;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for enrollment lock contention');
}

async function expectWriterWaitsForLowerBeforeLockingHigher({
  lowerEnrollmentId,
  higherEnrollmentId,
  writer,
}: {
  lowerEnrollmentId: string;
  higherEnrollmentId: string;
  writer: () => Promise<void>;
}): Promise<void> {
  const lowerLocked = deferred();
  const releaseLower = deferred();
  const blockerPromise = runInTransactionAsync(async () => {
    await lockEnrollments([lowerEnrollmentId]);
    lowerLocked.resolve();
    await releaseLower.promise;
  }).catch((error) => {
    lowerLocked.reject(error);
    throw error;
  });

  await lowerLocked.promise;
  const writerApplicationName = `el-writer-${crypto.randomUUID()}`;
  const writerPromise = runInTransactionAsync(async () => {
    await setLocalApplicationName(writerApplicationName);
    await writer();
  });
  void writerPromise.catch(() => undefined);

  try {
    await waitForEnrollmentLockWaiter({ applicationName: writerApplicationName });
    await runInTransactionAsync(async () => {
      await execute(sql.set_short_lock_timeout);
      await execute(sql.lock_enrollment_for_no_key_update, {
        enrollment_id: higherEnrollmentId,
      });
    });
  } finally {
    releaseLower.resolve();
    await Promise.all([blockerPromise, writerPromise]);
  }
}

describe('enrollment-dependent locking', { concurrent: false }, () => {
  let assessment: Assessment;
  let courseInstance: CourseInstance;
  let enrollments: Enrollment[];

  beforeAll(async () => {
    await helperDb.before();
    await helperCourse.syncCourse(TEST_COURSE_PATH);

    courseInstance = await selectCourseInstanceById('1');
    assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: 'hw19-accessControlUi',
    });

    const users = await generateAndEnrollUsers({
      count: 4,
      course_instance_id: courseInstance.id,
    });
    const records = await selectUsersAndEnrollmentsByUidsInCourseInstance({
      uids: users.map((user) => user.uid),
      courseInstance,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
    });
    enrollments = records
      .map((record) => record.enrollment)
      .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
  });

  afterAll(helperDb.after);

  it('normalizes enrollment IDs in numeric order', () => {
    expect(normalizeEnrollmentIds(['100', '20', '3', '20'])).toEqual(['3', '20', '100']);
  });

  it('takes FOR UPDATE locks on every student-label membership target', async () => {
    const label = await createStudentLabel({
      courseInstance,
      uuid: crypto.randomUUID(),
      name: 'Enrollment lock test',
      color: 'gray1',
    });
    const targets = [enrollments[2], enrollments[0]];

    await withHeldWriter(
      async () => {
        await addLabelToEnrollments({
          enrollments: targets,
          label,
          authzData: dangerousFullSystemAuthz(),
        });
      },
      async () => {
        await expectEnrollmentLock(enrollments[0].id);
        await expectEnrollmentLock(enrollments[2].id);
      },
    );

    await withHeldWriter(
      async () => {
        await removeLabelFromEnrollments({
          enrollments: targets,
          label,
          authzData: dangerousFullSystemAuthz(),
        });
      },
      async () => {
        await expectEnrollmentLock(enrollments[0].id);
        await expectEnrollmentLock(enrollments[2].id);
      },
    );
  });

  it('prelocks the complete student-label replacement set before split mutations', async () => {
    const label = await createStudentLabel({
      courseInstance,
      uuid: crypto.randomUUID(),
      name: 'Enrollment replacement lock test',
      color: 'gray1',
    });
    const lowerEnrollment = enrollments[0];
    const higherEnrollment = enrollments[2];
    await addLabelToEnrollments({
      enrollments: [lowerEnrollment],
      label,
      authzData: dangerousFullSystemAuthz(),
    });

    await expectWriterWaitsForLowerBeforeLockingHigher({
      lowerEnrollmentId: lowerEnrollment.id,
      higherEnrollmentId: higherEnrollment.id,
      writer: async () => {
        await updateStudentLabelEnrollments({
          enrollmentsToAdd: [higherEnrollment],
          enrollmentsToRemove: [lowerEnrollment],
          label,
          authzData: dangerousFullSystemAuthz(),
        });
      },
    });

    const updatedEnrollments = await selectEnrollmentsInStudentLabel(label);
    expect(updatedEnrollments.map((enrollment) => enrollment.id)).toEqual([higherEnrollment.id]);
  });

  it('prelocks publishing-extension create, add, and remove targets', async () => {
    let extension: CourseInstancePublishingExtension | null = null;
    const createTargets = [enrollments[3], enrollments[1]];

    await withHeldWriter(
      async () => {
        extension = await createPublishingExtensionWithEnrollments({
          courseInstance,
          name: 'Enrollment lock test',
          endDate: new Date('2030-01-01T00:00:00Z'),
          enrollments: createTargets,
        });
      },
      async () => {
        await expectEnrollmentLock(enrollments[1].id);
        await expectEnrollmentLock(enrollments[3].id);
      },
    );
    assert.isNotNull(extension);
    const createdExtension = extension;

    await withHeldWriter(
      async () => {
        await addEnrollmentToPublishingExtension({
          courseInstancePublishingExtension: createdExtension,
          enrollment: enrollments[0],
        });
      },
      async () => {
        await expectEnrollmentLock(enrollments[0].id);
      },
    );

    await withHeldWriter(
      async () => {
        await removeStudentFromPublishingExtension({
          courseInstancePublishingExtension: createdExtension,
          enrollment: enrollments[0],
        });
      },
      async () => {
        await expectEnrollmentLock(enrollments[0].id);
      },
    );
  });

  it('prelocks the complete publishing-extension replacement set before split mutations', async () => {
    const lowerEnrollment = enrollments[0];
    const higherEnrollment = enrollments[2];
    const extension = await createPublishingExtensionWithEnrollments({
      courseInstance,
      name: 'Enrollment replacement lock test',
      endDate: new Date('2030-01-01T00:00:00Z'),
      enrollments: [higherEnrollment],
    });

    await expectWriterWaitsForLowerBeforeLockingHigher({
      lowerEnrollmentId: lowerEnrollment.id,
      higherEnrollmentId: higherEnrollment.id,
      writer: async () => {
        await updatePublishingExtensionEnrollments({
          courseInstancePublishingExtension: extension,
          enrollmentsToAdd: [lowerEnrollment],
          enrollmentsToRemove: [higherEnrollment],
        });
      },
    });

    const updatedEnrollments = await selectEnrollmentsForPublishingExtension({ extension });
    expect(updatedEnrollments.map((enrollment) => enrollment.id)).toEqual([lowerEnrollment.id]);
  });

  it('locks both old and new assessment access-control targets', async () => {
    await replaceEnrollmentAccessControlRules(assessment, [
      {
        ruleData: makeRuleData(),
        enrollmentIds: [enrollments[0].id],
      },
    ]);
    const [rule] = await selectAccessControlRules(assessment, ['enrollment']);
    assert.isOk(rule);

    await withHeldWriter(
      async () => {
        await replaceEnrollmentAccessControlRules(assessment, [
          {
            ruleData: makeRuleData(rule.id),
            enrollmentIds: [enrollments[1].id],
          },
        ]);
      },
      async () => {
        await expectEnrollmentLock(enrollments[0].id);
        await expectEnrollmentLock(enrollments[1].id);
      },
    );
  });

  it('retries a nested assessment replacement when a target moves before locking', async () => {
    await replaceEnrollmentAccessControlRules(assessment, [
      {
        ruleData: makeRuleData(),
        enrollmentIds: [enrollments[0].id],
      },
    ]);
    const [rule] = await selectAccessControlRules(assessment, ['enrollment']);
    assert.isOk(rule);

    const parentsLocked = deferred();
    const moveTarget = deferred();
    const mover = runInTransactionAsync(async () => {
      await lockEnrollments([enrollments[0].id, enrollments[2].id]);
      parentsLocked.resolve();
      await moveTarget.promise;
      await execute(sql.move_assessment_access_control_target, {
        rule_id: rule.id,
        old_enrollment_id: enrollments[0].id,
        new_enrollment_id: enrollments[2].id,
      });
    });
    await parentsLocked.promise;

    const replacementApplicationName = `el-replacement-${crypto.randomUUID()}`;
    const replacement = runInTransactionAsync(async () => {
      await setLocalApplicationName(replacementApplicationName);
      await replaceEnrollmentAccessControlRules(assessment, [
        {
          ruleData: makeRuleData(rule.id),
          enrollmentIds: [enrollments[1].id],
        },
      ]);
    });
    void replacement.catch(() => undefined);

    const retryParentLocked = deferred();
    const releaseRetryParent = deferred();
    let retryBlocker: Promise<void> | undefined;

    try {
      // The replacement only reaches its lock query after reading the current target.
      const initialLockQueryStart = await waitForEnrollmentLockWaiter({
        applicationName: replacementApplicationName,
      });

      const retryBlockerApplicationName = `el-retry-blocker-${crypto.randomUUID()}`;
      retryBlocker = runInTransactionAsync(async () => {
        await setLocalApplicationName(retryBlockerApplicationName);
        await lockEnrollments([enrollments[2].id]);
        retryParentLocked.resolve();
        await releaseRetryParent.promise;
      }).catch((error) => {
        retryParentLocked.reject(error);
        throw error;
      });
      void retryBlocker.catch(() => undefined);

      await waitForEnrollmentLockWaiter({
        applicationName: retryBlockerApplicationName,
      });
      moveTarget.resolve();
      await retryParentLocked.promise;

      const retryLockQueryStart = await waitForEnrollmentLockWaiter({
        applicationName: replacementApplicationName,
        afterQueryStart: initialLockQueryStart,
      });
      expect(retryLockQueryStart).not.toEqual(initialLockQueryStart);
    } finally {
      moveTarget.resolve();
      releaseRetryParent.resolve();
      await Promise.all([mover, replacement, ...(retryBlocker ? [retryBlocker] : [])]);
    }

    const [updatedRule] = await selectAccessControlRules(assessment, ['enrollment']);
    assert.isOk(updatedRule);
    expect(updatedRule.enrollments?.map((enrollment) => enrollment.enrollmentId)).toEqual([
      enrollments[1].id,
    ]);
  });
});
