import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  execute,
  loadSqlEquiv,
  queryOptionalScalar,
  queryRow,
  queryRows,
  queryScalar,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { setLti13CourseInstanceAdmissionContinuation } from '../lib/course-instance-admission-continuation.js';
import {
  AssessmentAccessControlRuleSchema,
  type CourseInstance,
  CourseInstancePublishingExtensionSchema,
  type Enrollment,
  StudentLabelSchema,
} from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';

import { selectAssessmentByTid } from './assessment.js';
import { admitUserWithCourseInstanceAdmissionSelection } from './course-instance-admission-continuation.js';
import { deletePublishingExtension } from './course-instance-publishing-extensions.js';
import { selectCourseInstanceById } from './course-instances.js';
import { selectEnrollmentAdmissionDecision } from './enrollment-identity.js';
import {
  admitUserFromEnrollmentInvitation,
  admitUserToCourseInstance,
  reconcileEnrollmentIdentities,
} from './enrollment-reconciliation.js';
import {
  actorFor,
  createEnrollment,
  createLti13CourseInstance,
  createUser,
  nextFixtureName,
  nextFixtureNumber,
  selectEnrollments,
  selectReconciliationAuditEvents,
} from './enrollment-reconciliation.test-helpers.js';
import { deleteStudentLabel } from './student-label.js';

const sql = loadSqlEquiv(import.meta.url);

async function selectIds(query: string, params: Record<string, unknown>): Promise<string[]> {
  return (await queryRows(query, params, z.object({ id: IdSchema }))).map((row) => row.id);
}

function deferred() {
  let resolve: () => void;
  let reject: (error: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject: reject!, resolve: resolve! };
}

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
      {
        application_name: applicationName,
        query_pattern: queryPattern,
      },
      z.number(),
    );
    if (waiting !== null) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${applicationName} to run ${queryPattern}`);
}

function preserveFirstFailure(
  currentFailure: { error: unknown } | undefined,
  workerResults: PromiseSettledResult<unknown>[],
): { error: unknown } | undefined {
  if (currentFailure) return currentFailure;
  const rejectedWorker = workerResults.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  return rejectedWorker ? { error: rejectedWorker.reason } : undefined;
}

async function runOwnerDeletionRace({
  blockLaterChild,
  deleteOwner,
  deletionQueryPattern,
  reconcile,
  reconciliationQueryPattern,
}: {
  blockLaterChild: () => Promise<void>;
  deleteOwner: () => Promise<void>;
  deletionQueryPattern: string;
  reconcile: () => Promise<void>;
  reconciliationQueryPattern: string;
}): Promise<void> {
  const laterChildLocked = deferred();
  const releaseLaterChild = deferred();
  let failure: { error: unknown } | undefined;
  const blockerPromise = runInTransactionAsync(async () => {
    await blockLaterChild();
    laterChildLocked.resolve();
    await releaseLaterChild.promise;
  }).catch((error) => {
    failure ??= { error };
    laterChildLocked.reject(error);
    throw error;
  });
  void blockerPromise.catch(() => undefined);

  let reconciliationPromise: Promise<void> | undefined;
  let deletionPromise: Promise<void> | undefined;

  try {
    await laterChildLocked.promise;

    const reconciliationApplicationName = `reconcile-owner-${crypto.randomUUID()}`;
    reconciliationPromise = runInTransactionAsync(async () => {
      await setLocalApplicationName(reconciliationApplicationName);
      await reconcile();
    });
    void reconciliationPromise.catch((error) => {
      failure ??= { error };
    });
    await waitForApplicationLock(reconciliationApplicationName, reconciliationQueryPattern);

    const deletionApplicationName = `delete-owner-${crypto.randomUUID()}`;
    deletionPromise = runInTransactionAsync(async () => {
      await setLocalApplicationName(deletionApplicationName);
      await deleteOwner();
    });
    void deletionPromise.catch((error) => {
      failure ??= { error };
    });
    await waitForApplicationLock(deletionApplicationName, deletionQueryPattern);
  } catch (error) {
    failure ??= { error };
  } finally {
    releaseLaterChild.resolve();
    const workerResults = await Promise.allSettled([
      blockerPromise,
      ...(reconciliationPromise ? [reconciliationPromise] : []),
      ...(deletionPromise ? [deletionPromise] : []),
    ]);
    failure = preserveFirstFailure(failure, workerResults);
  }

  if (failure) throw failure.error;
}

describe('enrollment reconciliation concurrency and retry', { concurrent: false }, () => {
  let courseInstance: CourseInstance;
  let otherCourseInstance: CourseInstance;

  beforeAll(async () => {
    await helperDb.before();
    await helperCourse.syncCourse(TEST_COURSE_PATH);
    courseInstance = await selectCourseInstanceById('1');
    otherCourseInstance = await selectCourseInstanceById('2');
  });

  afterAll(helperDb.after);

  it('does not introduce owner-FK inserts while moving dependent rows', () => {
    const reconciliationSql = readFileSync(
      new URL('enrollment-reconciliation.sql', import.meta.url),
      'utf8',
    );
    for (const table of [
      'student_label_enrollments',
      'course_instance_publishing_extension_enrollments',
      'assessment_access_control_enrollments',
    ]) {
      expect(reconciliationSql).not.toMatch(new RegExp(`INSERT\\s+INTO\\s+${table}`, 'iu'));
      expect(reconciliationSql).toMatch(
        new RegExp(`UPDATE\\s+${table}\\s+SET\\s+enrollment_id`, 'iu'),
      );
    }
  });

  it('avoids a reverse-FK deadlock with concurrent student-label deletion', async () => {
    const user = await createUser({ prefix: 'label-owner-delete' });
    const survivor = await createEnrollment({
      courseInstance,
      pendingUid: user.uid,
    });
    const loser = await createEnrollment({
      courseInstance,
      pendingUin: user.uin,
    });
    const label = await queryRow(
      sql.insert_student_label,
      {
        course_instance_id: courseInstance.id,
        name: nextFixtureName('concurrent-label-delete'),
        uuid: crypto.randomUUID(),
      },
      StudentLabelSchema,
    );
    await execute(sql.insert_student_label_enrollment, {
      enrollment_id: loser.id,
      student_label_id: label.id,
    });
    const extension = await queryRow(
      sql.insert_publishing_extension,
      {
        course_instance_id: courseInstance.id,
        end_date: new Date('2026-01-01T00:00:00Z'),
        name: nextFixtureName('label-delete-blocker'),
      },
      CourseInstancePublishingExtensionSchema,
    );
    await execute(sql.insert_publishing_extension_enrollment, {
      enrollment_id: loser.id,
      publishing_extension_id: extension.id,
    });
    const publishingMembership = await queryRow(
      sql.select_publishing_extension_enrollment_id,
      {
        enrollment_id: loser.id,
        publishing_extension_id: extension.id,
      },
      z.object({ id: IdSchema }),
    );

    await runOwnerDeletionRace({
      blockLaterChild: async () => {
        await queryRow(
          sql.lock_publishing_extension_enrollment,
          { id: publishingMembership.id },
          z.object({ id: IdSchema }),
        );
      },
      reconcile: async () => {
        await reconcileEnrollmentIdentities({
          courseInstanceId: courseInstance.id,
          userId: user.id,
          ...actorFor(user),
        });
      },
      reconciliationQueryPattern: '%lock_publishing_extension_enrollments%',
      deleteOwner: async () => {
        await deleteStudentLabel(label);
      },
      deletionQueryPattern: '%delete_student_label%',
    });

    expect(await selectEnrollments([survivor.id, loser.id])).toEqual([
      expect.objectContaining({ id: survivor.id }),
    ]);
    expect(await selectIds(sql.select_student_label_ids, { enrollment_id: survivor.id })).toEqual(
      [],
    );
    expect(
      await selectIds(sql.select_publishing_extension_ids, {
        enrollment_id: survivor.id,
      }),
    ).toEqual([extension.id]);
  });

  it('avoids a reverse-FK deadlock with concurrent publishing-extension deletion', async () => {
    const user = await createUser({ prefix: 'extension-owner-delete' });
    const survivor = await createEnrollment({
      courseInstance,
      pendingUid: user.uid,
    });
    const loser = await createEnrollment({
      courseInstance,
      pendingUin: user.uin,
    });
    const extension = await queryRow(
      sql.insert_publishing_extension,
      {
        course_instance_id: courseInstance.id,
        end_date: new Date('2026-01-01T00:00:00Z'),
        name: nextFixtureName('concurrent-extension-delete'),
      },
      CourseInstancePublishingExtensionSchema,
    );
    await execute(sql.insert_publishing_extension_enrollment, {
      enrollment_id: loser.id,
      publishing_extension_id: extension.id,
    });
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: 'hw19-accessControlUi',
    });
    const rule = await queryRow(
      sql.insert_assessment_access_control_rule,
      {
        assessment_id: assessment.id,
        number: 90_000 + nextFixtureNumber(),
        uuid: crypto.randomUUID(),
      },
      AssessmentAccessControlRuleSchema,
    );
    await execute(sql.insert_assessment_access_control_enrollment, {
      enrollment_id: loser.id,
      rule_id: rule.id,
    });
    const assessmentReference = await queryRow(
      sql.select_assessment_access_control_enrollment_id,
      {
        enrollment_id: loser.id,
        rule_id: rule.id,
      },
      z.object({ id: IdSchema }),
    );

    await runOwnerDeletionRace({
      blockLaterChild: async () => {
        await queryRow(
          sql.lock_assessment_access_control_enrollment,
          { id: assessmentReference.id },
          z.object({ id: IdSchema }),
        );
      },
      reconcile: async () => {
        await reconcileEnrollmentIdentities({
          courseInstanceId: courseInstance.id,
          userId: user.id,
          ...actorFor(user),
        });
      },
      reconciliationQueryPattern: '%lock_assessment_access_control_enrollments%',
      deleteOwner: async () => {
        await deletePublishingExtension({ extension, courseInstance });
      },
      deletionQueryPattern: '%delete_publishing_extension%',
    });

    expect(await selectEnrollments([survivor.id, loser.id])).toEqual([
      expect.objectContaining({ id: survivor.id }),
    ]);
    expect(
      await queryOptionalScalar(
        sql.select_publishing_extension_id,
        { publishing_extension_id: extension.id },
        IdSchema,
      ),
    ).toBeNull();
    expect(
      await selectIds(sql.select_publishing_extension_ids, {
        enrollment_id: survivor.id,
      }),
    ).toEqual([]);
    expect(
      await selectIds(sql.select_assessment_access_control_rule_ids, {
        enrollment_id: survivor.id,
      }),
    ).toEqual([rule.id]);
  });

  it('retries once after a recognized concurrent bound-user uniqueness race', async () => {
    const user = await createUser({ prefix: 'recognized-race' });
    const invitation = await createEnrollment({
      courseInstance,
      pendingUin: user.uin,
    });
    const parentLocked = deferred();
    const releaseParent = deferred();
    let failure: { error: unknown } | undefined;
    const blockerPromise = runInTransactionAsync(async () => {
      await queryRow(
        sql.lock_enrollment,
        { enrollment_id: invitation.id },
        z.object({ id: IdSchema }),
      );
      parentLocked.resolve();
      await releaseParent.promise;
    }).catch((error) => {
      failure ??= { error };
      parentLocked.reject(error);
      throw error;
    });
    void blockerPromise.catch(() => undefined);

    let admissionPromise:
      | Promise<{ admitted: Enrollment; preSavepointEnrollment: Enrollment }>
      | undefined;
    try {
      await parentLocked.promise;
      const applicationName = `reconcile-${crypto.randomUUID()}`;
      let validationCalls = 0;
      admissionPromise = runInTransactionAsync(async () => {
        const preSavepointEnrollment = await createEnrollment({
          courseInstance: otherCourseInstance,
          pendingUid: nextFixtureName('pre-savepoint-enrollment'),
        });
        await setLocalApplicationName(applicationName);
        const admitted = await admitUserFromEnrollmentInvitation({
          courseInstanceId: courseInstance.id,
          userId: user.id,
          source: { type: 'institution_uin' },
          ...actorFor(user),
          validateAdmission: async () => {
            validationCalls += 1;
          },
        });
        return { admitted, preSavepointEnrollment };
      });
      void admissionPromise.catch((error) => {
        failure ??= { error };
      });
      await waitForApplicationLock(applicationName, '%lock_enrollments_by_id%');

      const concurrentBound = await createEnrollment({
        courseInstance,
        userId: user.id,
        status: 'left',
        firstJoinedAt: new Date('2025-01-01T00:00:00Z'),
      });
      releaseParent.resolve();

      const { admitted, preSavepointEnrollment } = await admissionPromise;
      expect(validationCalls).toBe(2);
      expect(admitted).toMatchObject({
        id: concurrentBound.id,
        status: 'joined',
        user_id: user.id,
      });
      expect(await selectEnrollments([invitation.id, concurrentBound.id])).toEqual([admitted]);
      expect(await selectEnrollments([preSavepointEnrollment.id])).toEqual([
        preSavepointEnrollment,
      ]);
    } catch (error) {
      failure ??= { error };
    } finally {
      releaseParent.resolve();
      const workerResults = await Promise.allSettled([
        blockerPromise,
        ...(admissionPromise ? [admissionPromise] : []),
      ]);
      failure = preserveFirstFailure(failure, workerResults);
    }

    if (failure) throw failure.error;
  });

  it('selects the admission source only after candidate parents are locked', async () => {
    const user = await createUser({ prefix: 'locked-source-selection' });
    const invitation = await createEnrollment({
      courseInstance,
      pendingUin: user.uin,
    });
    const parentLocked = deferred();
    const releaseParent = deferred();
    let failure: { error: unknown } | undefined;
    const blockerPromise = runInTransactionAsync(async () => {
      await queryRow(
        sql.lock_enrollment,
        { enrollment_id: invitation.id },
        z.object({ id: IdSchema }),
      );
      parentLocked.resolve();
      await releaseParent.promise;
    }).catch((error) => {
      failure ??= { error };
      parentLocked.reject(error);
      throw error;
    });
    void blockerPromise.catch(() => undefined);

    let admissionPromise: Promise<Enrollment> | undefined;
    let sourceSelectionCalls = 0;
    try {
      await parentLocked.promise;
      const applicationName = `locked-source-${crypto.randomUUID()}`;
      admissionPromise = runInTransactionAsync(async () => {
        await setLocalApplicationName(applicationName);
        return await admitUserToCourseInstance({
          courseInstanceId: courseInstance.id,
          userId: user.id,
          source: { type: 'ordinary' },
          ...actorFor(user),
          selectSource: ({ classification, source }) => {
            sourceSelectionCalls += 1;
            expect(source).toEqual({ type: 'ordinary' });
            expect(classification.actionableInstitutionRosterInvitationCandidates).toHaveLength(1);
            return { type: 'institution_uin' };
          },
          validateAdmission: async (context) => {
            expect(context.source).toEqual({ type: 'institution_uin' });
          },
        });
      });
      void admissionPromise.catch((error) => {
        failure ??= { error };
      });
      await waitForApplicationLock(applicationName, '%lock_enrollments_by_id%');
      expect(sourceSelectionCalls).toBe(0);
      releaseParent.resolve();

      const admitted = await admissionPromise;
      expect(sourceSelectionCalls).toBe(1);
      expect(admitted).toMatchObject({
        id: invitation.id,
        status: 'joined',
        user_id: user.id,
      });
      expect(await selectReconciliationAuditEvents(invitation.id)).toEqual([
        expect.objectContaining({
          action_detail: 'roster_admitted',
          context: expect.objectContaining({ admission_source: 'institution_uin' }),
        }),
      ]);
    } catch (error) {
      failure ??= { error };
    } finally {
      releaseParent.resolve();
      const workerResults = await Promise.allSettled([
        blockerPromise,
        ...(admissionPromise ? [admissionPromise] : []),
      ]);
      failure = preserveFirstFailure(failure, workerResults);
    }

    if (failure) throw failure.error;
  });

  it('returns a blocked result when exact LTI admission becomes blocked under its lock', async () => {
    const user = await createUser({ prefix: 'exact-lti-blocked-race' });
    const lti13CourseInstance = await createLti13CourseInstance(courseInstance);
    const sub = nextFixtureName('exact-lti-blocked-race-sub');
    const invitation = await createEnrollment({
      courseInstance,
      pendingLti13CourseInstanceId: lti13CourseInstance.id,
      pendingLti13Sub: sub,
      pendingUin: user.uin,
    });
    const source = {
      type: 'lti13' as const,
      lti13CourseInstanceId: lti13CourseInstance.id,
      sub,
    };
    const decision = await selectEnrollmentAdmissionDecision(
      {
        courseInstanceId: courseInstance.id,
        lti13Identity: { lti13CourseInstanceId: lti13CourseInstance.id, sub },
        userId: user.id,
      },
      source,
    );
    expect(decision.allowed).toBe(true);

    const session: Record<string, unknown> = {};
    const continuation = setLti13CourseInstanceAdmissionContinuation({
      courseInstanceId: courseInstance.id,
      launchExpiresAtSeconds: Math.floor(Date.now() / 1000) + 3600,
      lti13CourseInstanceId: lti13CourseInstance.id,
      session,
      sub,
      userId: user.id,
    });
    const invitationLocked = deferred();
    const releaseInvitation = deferred();
    let failure: { error: unknown } | undefined;
    const blockerPromise = runInTransactionAsync(async () => {
      await queryRow(
        sql.lock_enrollment,
        { enrollment_id: invitation.id },
        z.object({ id: IdSchema }),
      );
      invitationLocked.resolve();
      await releaseInvitation.promise;
      await execute(sql.block_enrollment_for_user, {
        enrollment_id: invitation.id,
        user_id: user.id,
      });
    }).catch((error) => {
      failure ??= { error };
      invitationLocked.reject(error);
      throw error;
    });
    void blockerPromise.catch(() => undefined);

    let admissionPromise:
      | Promise<Awaited<ReturnType<typeof admitUserWithCourseInstanceAdmissionSelection>>>
      | undefined;
    try {
      await invitationLocked.promise;
      const applicationName = `exact-lti-blocked-${crypto.randomUUID()}`;
      admissionPromise = runInTransactionAsync(async () => {
        await setLocalApplicationName(applicationName);
        return await admitUserWithCourseInstanceAdmissionSelection({
          courseInstanceId: courseInstance.id,
          ip: null,
          isAdministrator: false,
          reqDate: new Date(),
          selection: {
            continuation,
            plan: { source, type: 'lti13_roster_invitation' },
            type: 'lti13',
          },
          session,
          userId: user.id,
        });
      });
      void admissionPromise.catch((error) => {
        failure ??= { error };
      });
      await waitForApplicationLock(applicationName, '%lock_enrollments_by_id%');
      releaseInvitation.resolve();

      await expect(admissionPromise).resolves.toEqual({ type: 'blocked' });
      expect(session).not.toHaveProperty('course_instance_admission_continuation');
      expect(await selectEnrollments([invitation.id])).toEqual([
        expect.objectContaining({
          id: invitation.id,
          status: 'blocked',
          user_id: user.id,
        }),
      ]);
    } catch (error) {
      failure ??= { error };
    } finally {
      releaseInvitation.resolve();
      const workerResults = await Promise.allSettled([
        blockerPromise,
        ...(admissionPromise ? [admissionPromise] : []),
      ]);
      failure = preserveFirstFailure(failure, workerResults);
    }

    if (failure) throw failure.error;
  });

  it('revalidates a candidate deleted after selection without running validation', async () => {
    const user = await createUser({ prefix: 'candidate-deletion' });
    const invitation = await createEnrollment({
      courseInstance,
      pendingUid: user.uid,
    });
    const parentLocked = deferred();
    const releaseDeletion = deferred();
    let failure: { error: unknown } | undefined;
    const deletionPromise = runInTransactionAsync(async () => {
      await queryRow(
        sql.lock_enrollment,
        { enrollment_id: invitation.id },
        z.object({ id: IdSchema }),
      );
      parentLocked.resolve();
      await releaseDeletion.promise;
      await execute(sql.delete_enrollment, { enrollment_id: invitation.id });
    }).catch((error) => {
      failure ??= { error };
      parentLocked.reject(error);
      throw error;
    });
    void deletionPromise.catch(() => undefined);

    let admissionPromise: Promise<Enrollment> | undefined;
    try {
      await parentLocked.promise;
      const applicationName = `candidate-delete-${crypto.randomUUID()}`;
      let validationCalls = 0;
      admissionPromise = runInTransactionAsync(async () => {
        await setLocalApplicationName(applicationName);
        return await admitUserFromEnrollmentInvitation({
          courseInstanceId: courseInstance.id,
          userId: user.id,
          source: { type: 'pending_uid' },
          ...actorFor(user),
          validateAdmission: async () => {
            validationCalls += 1;
          },
        });
      });
      void admissionPromise.catch(() => undefined);
      await waitForApplicationLock(applicationName, '%lock_enrollments_by_id%');
      releaseDeletion.resolve();

      await expect(admissionPromise).rejects.toMatchObject({
        decision: {
          allowed: false,
          reason: 'no_matching_invitation',
          source: { type: 'pending_uid' },
        },
      });
      expect(validationCalls).toBe(0);
      expect(await selectEnrollments([invitation.id])).toEqual([]);
    } catch (error) {
      failure ??= { error };
    } finally {
      releaseDeletion.resolve();
      const workerResults = await Promise.allSettled([
        deletionPromise,
        ...(admissionPromise ? [admissionPromise] : []),
      ]);
      failure = preserveFirstFailure(failure, workerResults.slice(0, 1));
    }

    if (failure) throw failure.error;
  });

  it('does not retry an unrelated database error and rolls back the failed attempt', async () => {
    const user = await createUser({ prefix: 'unrelated-error' });
    const invitation = await createEnrollment({
      courseInstance,
      pendingUin: user.uin,
    });
    const sequenceBefore = BigInt(
      await queryScalar(sql.select_audit_event_sequence_value, {}, z.string()),
    );

    await expect(
      admitUserFromEnrollmentInvitation({
        courseInstanceId: courseInstance.id,
        userId: user.id,
        source: { type: 'institution_uin' },
        agentAuthnUserId: '999999999999999999',
        agentUserId: '999999999999999999',
        validateAdmission: async () => {},
      }),
    ).rejects.toMatchObject({ code: '23503' });

    const sequenceAfter = BigInt(
      await queryScalar(sql.select_audit_event_sequence_value, {}, z.string()),
    );
    expect(sequenceAfter - sequenceBefore).toBe(1n);
    expect(await selectEnrollments([invitation.id])).toEqual([invitation]);
  });
});
