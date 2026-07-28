import crypto from 'node:crypto';

import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { execute, loadSqlEquiv, queryScalar, runInTransactionAsync } from '@prairielearn/postgres';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import type { Assessment, CourseInstance, Enrollment } from '../lib/db-types.js';
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
  createPublishingExtensionWithEnrollments,
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

function observeWorker(
  promise: Promise<void>,
  recordFailure: (error: unknown) => void,
  ready?: ReturnType<typeof deferred>,
): Promise<void> {
  const observed = promise.catch((error) => {
    recordFailure(error);
    ready?.reject(error);
    throw error;
  });
  void observed.catch(() => {});
  return observed;
}

async function finishWorkers(
  failure: { error: unknown } | undefined,
  workers: Promise<void>[],
): Promise<void> {
  const rejected = (await Promise.allSettled(workers)).find(
    (result) => result.status === 'rejected',
  );
  if (failure) throw failure.error;
  if (rejected) throw rejected.reason;
}

async function setApplicationName(name: string): Promise<void> {
  await queryScalar(sql.set_local_application_name, { application_name: name }, z.string());
}

async function waitForApplicationBlock(applicationName: string): Promise<void> {
  const params = { application_name: applicationName };
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await queryScalar(sql.select_application_is_blocked, params, z.boolean())) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for enrollment lock contention');
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
      count: 3,
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

  it('normalizes parent locks in numeric order', () => {
    expect(normalizeEnrollmentIds(['100', '20', '3', '20'])).toEqual(['3', '20', '100']);
  });

  it('updates composed student-label and publishing-extension memberships', async () => {
    const [lowerEnrollment, , higherEnrollment] = enrollments;
    const label = await createStudentLabel({
      courseInstance,
      uuid: crypto.randomUUID(),
      name: 'Composed writer test',
      color: 'gray1',
    });
    await addLabelToEnrollments({
      enrollments: [lowerEnrollment],
      label,
      authzData: dangerousFullSystemAuthz(),
    });
    await updateStudentLabelEnrollments({
      enrollmentsToAdd: [higherEnrollment],
      enrollmentsToRemove: [lowerEnrollment],
      label,
      authzData: dangerousFullSystemAuthz(),
    });
    expect(
      (await selectEnrollmentsInStudentLabel(label)).map((enrollment) => enrollment.id),
    ).toEqual([higherEnrollment.id]);

    const extension = await createPublishingExtensionWithEnrollments({
      courseInstance,
      name: 'Composed writer test',
      endDate: new Date('2030-01-01T00:00:00Z'),
      enrollments: [higherEnrollment],
    });
    await updatePublishingExtensionEnrollments({
      courseInstancePublishingExtension: extension,
      enrollmentsToAdd: [lowerEnrollment],
      enrollmentsToRemove: [higherEnrollment],
    });
    expect(
      (await selectEnrollmentsForPublishingExtension({ extension })).map(
        (enrollment) => enrollment.id,
      ),
    ).toEqual([lowerEnrollment.id]);
  });

  it('retries moved assessment targets without rolling back the outer transaction', async () => {
    const [oldTarget, submittedTarget, movedTarget] = enrollments;
    await replaceEnrollmentAccessControlRules(assessment, [
      { ruleData: makeRuleData(), enrollmentIds: [oldTarget.id] },
    ]);
    const [rule] = await selectAccessControlRules(assessment, ['enrollment']);
    assert.isOk(rule);

    const parentsLocked = deferred();
    const moveTarget = deferred();
    let failure: { error: unknown } | undefined;
    const recordFailure = (error: unknown) => {
      failure ??= { error };
    };
    const mover = observeWorker(
      runInTransactionAsync(async () => {
        await lockEnrollments([oldTarget.id, movedTarget.id]);
        parentsLocked.resolve();
        await moveTarget.promise;
        await execute(sql.move_assessment_access_control_target, {
          rule_id: rule.id,
          old_enrollment_id: oldTarget.id,
          new_enrollment_id: movedTarget.id,
        });
      }),
      recordFailure,
      parentsLocked,
    );
    await parentsLocked.promise;

    const replacementApplicationName = `enrollment-replacement-${crypto.randomUUID()}`;
    const replacement = observeWorker(
      runInTransactionAsync(async () => {
        await setApplicationName(replacementApplicationName);
        await replaceEnrollmentAccessControlRules(assessment, [
          { ruleData: makeRuleData(rule.id), enrollmentIds: [submittedTarget.id] },
        ]);
      }),
      recordFailure,
    );

    const retryParentLocked = deferred();
    const releaseRetryParent = deferred();
    let retryBlocker: Promise<void> | undefined;
    try {
      await waitForApplicationBlock(replacementApplicationName);
      const retryBlockerApplicationName = `enrollment-retry-blocker-${crypto.randomUUID()}`;
      retryBlocker = observeWorker(
        runInTransactionAsync(async () => {
          await setApplicationName(retryBlockerApplicationName);
          await lockEnrollments([movedTarget.id]);
          retryParentLocked.resolve();
          await releaseRetryParent.promise;
        }),
        recordFailure,
        retryParentLocked,
      );
      await waitForApplicationBlock(retryBlockerApplicationName);
      moveTarget.resolve();
      await retryParentLocked.promise;
      await waitForApplicationBlock(replacementApplicationName);
    } catch (error) {
      failure ??= { error };
    } finally {
      moveTarget.resolve();
      releaseRetryParent.resolve();
      await finishWorkers(failure, [mover, replacement, ...(retryBlocker ? [retryBlocker] : [])]);
    }

    const [updatedRule] = await selectAccessControlRules(assessment, ['enrollment']);
    assert.isOk(updatedRule);
    expect(updatedRule.enrollments?.map((enrollment) => enrollment.enrollmentId)).toEqual([
      submittedTarget.id,
    ]);
  });
});
