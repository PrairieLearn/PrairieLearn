import z from 'zod';

import * as error from '@prairielearn/error';
import {
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import {
  PotentialEnrollmentStatus,
  checkPotentialEnterpriseEnrollment,
} from '../ee/models/enrollment.js';
import {
  type AuthzData,
  type AuthzDataWithEffectiveUser,
  type AuthzDataWithoutEffectiveUser,
  type CourseInstanceRole,
  type DangerousSystemAuthzData,
  assertHasRole,
  assertRoleIsPermitted,
  dangerousFullSystemAuthz,
  hasRole,
  isDangerousFullSystemAuthz,
} from '../lib/authz-data-lib.js';
import type { PageContext } from '../lib/client/page-context.js';
import {
  type Course,
  type CourseInstance,
  type Enrollment,
  EnrollmentSchema,
  type EnumEnrollmentStatus,
  type Institution,
  UserSchema,
} from '../lib/db-types.js';
import { isEnterprise } from '../lib/license.js';
import { HttpRedirect } from '../lib/redirect.js';
import { assertNever } from '../lib/types.js';

import { insertAuditEvent } from './audit-event.js';
import type { SupportedActionsForTable } from './audit-event.types.js';
import { selectCourseInstanceById } from './course-instances.js';
import { generateUsers, selectAndLockUser } from './user.js';

const sql = loadSqlEquiv(import.meta.url);

type CourseInstanceContext =
  | CourseInstance
  | PageContext<'courseInstance', 'student' | 'instructor'>['course_instance'];

function assertEnrollmentStatus(
  enrollment: Enrollment,
  requiredStatus: EnumEnrollmentStatus | EnumEnrollmentStatus[],
) {
  const requiredStatuses = Array.isArray(requiredStatus) ? requiredStatus : [requiredStatus];
  if (!requiredStatuses.includes(enrollment.status)) {
    throw new error.HttpStatusError(403, 'Access denied');
  }
}

function assertEnrollmentInCourseInstance(
  enrollment: Enrollment,
  courseInstance: CourseInstanceContext,
) {
  if (enrollment.course_instance_id !== courseInstance.id) {
    throw new error.HttpStatusError(403, 'Access denied');
  }
}

function assertEnrollmentBelongsToUser(enrollment: Enrollment | null, authzData: AuthzData) {
  if (isDangerousFullSystemAuthz(authzData)) {
    return;
  }
  if (enrollment == null) {
    return;
  }
  // We only check this for enrollments that have a user_id (e.g. non-pending enrollments)
  if (enrollment.user_id && enrollment.user_id !== authzData.user.id) {
    throw new error.HttpStatusError(403, 'Access denied');
  }
  // Check for invitations
  if (enrollment.pending_uid && enrollment.pending_uid !== authzData.user.uid) {
    throw new error.HttpStatusError(403, 'Access denied');
  }
}

/**
 * Changes the status of an enrollment to joined.
 *
 * Function callers should hold a lock on the enrollment.
 */
async function _enrollUserInCourseInstance({
  lockedEnrollment,
  userId,
  actionDetail,
  requiredRole,
  authzData,
}: {
  lockedEnrollment: Enrollment;
  userId: string;
  actionDetail: SupportedActionsForTable<'enrollments'>;
  requiredRole: ('System' | 'Student')[];
  authzData: AuthzDataWithoutEffectiveUser;
}): Promise<Enrollment> {
  assertHasRole(authzData, requiredRole);

  assertEnrollmentStatus(lockedEnrollment, ['invited', 'removed', 'rejected']);

  const newEnrollment = await queryRow(
    sql.enroll_user,
    {
      enrollment_id: lockedEnrollment.id,
      user_id: userId,
    },
    EnrollmentSchema,
  );

  await insertAuditEvent({
    tableName: 'enrollments',
    action: 'update',
    actionDetail,
    rowId: newEnrollment.id,
    oldRow: lockedEnrollment,
    newRow: newEnrollment,
    agentAuthnUserId: authzData.user.id,
    agentUserId: authzData.user.id,
  });

  return newEnrollment;
}

/**
 * Ensures that the user is enrolled in the given course instance. If the
 * enrollment already exists, this is a no-op. This function does not check
 * enterprise enrollment eligibility, and should not be used directly outside of tests.
 *
 * If the user was in the 'removed', 'invited' or 'rejected' status, this will set the
 * enrollment status to 'joined'.
 *
 * If the user was 'blocked', this will throw an error.
 */
export async function ensureUncheckedEnrollment({
  userId,
  authzData,
  courseInstance,
  actionDetail,
  requiredRole,
}: {
  userId: string;
  requiredRole: ('System' | 'Student')[];
  authzData: AuthzDataWithoutEffectiveUser;
  courseInstance: CourseInstanceContext;
  actionDetail: SupportedActionsForTable<'enrollments'>;
}): Promise<Enrollment | null> {
  assertHasRole(authzData, requiredRole);
  const result = await runInTransactionAsync(async () => {
    const user = await selectAndLockUser(userId);
    let enrollment = await selectOptionalEnrollmentByPendingUid({
      pendingUid: user.uid,
      requiredRole,
      authzData,
      courseInstance,
    });

    if (enrollment == null) {
      // Try to lookup an enrollment by user_id
      enrollment = await selectOptionalEnrollmentByUserId({
        courseInstance,
        userId,
        requiredRole,
        authzData,
      });
    }

    const lockedEnrollment = await run(async () => {
      if (enrollment === null) {
        return null;
      }
      return await _selectAndLockEnrollment(enrollment.id);
    });

    if (lockedEnrollment) {
      if (lockedEnrollment.status === 'joined') {
        return lockedEnrollment;
      }

      const updated = await _enrollUserInCourseInstance({
        lockedEnrollment,
        userId,
        actionDetail,
        requiredRole,
        authzData,
      });
      return updated;
    }

    const inserted = await queryOptionalRow(
      sql.ensure_enrollment,
      { course_instance_id: courseInstance.id, user_id: userId },
      EnrollmentSchema,
    );
    if (inserted) {
      await insertAuditEvent({
        tableName: 'enrollments',
        action: 'insert',
        actionDetail,
        rowId: inserted.id,
        newRow: inserted,
        agentUserId: authzData.user.id,
        agentAuthnUserId: authzData.user.id,
      });
    }
    return inserted;
  });
  return result;
}

/**
 * Ensures that the user is enrolled in the given course instance. If the
 * enrollment already exists, this is a no-op.
 *
 * For enterprise installations, this will also check if the user is eligible
 * for an enrollment. They are considered eligible if they have all required
 * plan grants and if their enrollment wouldn't cause an institution or course
 * instance enrollment limit to be exceeded.
 *
 */
export async function ensureEnrollment({
  institution,
  course,
  courseInstance,
  authzData,
  requiredRole,
  actionDetail,
  throwOnIneligible = true,
}: {
  institution: Institution;
  course: Course;
  courseInstance: CourseInstance;
  authzData: Exclude<AuthzDataWithoutEffectiveUser, DangerousSystemAuthzData>;
  requiredRole: 'Student'[];
  actionDetail: SupportedActionsForTable<'enrollments'>;
  throwOnIneligible?: boolean;
}): Promise<PotentialEnrollmentStatus> {
  // If the current user is not a student, bail.
  // We don't want to give instructors an enrollment.
  if (!hasRole(authzData, requiredRole)) return PotentialEnrollmentStatus.INELIGIBLE;

  let status = PotentialEnrollmentStatus.ALLOWED;

  if (isEnterprise()) {
    status = await checkPotentialEnterpriseEnrollment({
      institution,
      course,
      courseInstance,
      authzData,
    });

    switch (status) {
      case PotentialEnrollmentStatus.PLAN_GRANTS_REQUIRED: {
        if (throwOnIneligible) {
          throw new HttpRedirect(`/pl/course_instance/${courseInstance.id}/upgrade`);
        } else {
          return status;
        }
      }
      case PotentialEnrollmentStatus.LIMIT_EXCEEDED: {
        if (throwOnIneligible) {
          throw new HttpRedirect('/pl/enroll/limit_exceeded');
        } else {
          return status;
        }
      }
      case PotentialEnrollmentStatus.ALLOWED:
        break;
      default:
        assertNever(status);
    }
  }

  await ensureUncheckedEnrollment({
    courseInstance,
    userId: authzData.user.id,
    requiredRole,
    authzData,
    actionDetail,
  });

  return status;
}

export async function selectOptionalEnrollmentByUserId({
  userId,
  requiredRole,
  authzData,
  courseInstance,
}: {
  userId: string;
  requiredRole: ('System' | 'Student' | 'Student Data Viewer' | 'Student Data Editor')[];
  authzData: AuthzData;
  courseInstance: CourseInstanceContext;
}): Promise<Enrollment | null> {
  assertHasRole(authzData, requiredRole);
  const enrollment = await queryOptionalRow(
    sql.select_enrollment_by_user_id,
    { user_id: userId, course_instance_id: courseInstance.id },
    EnrollmentSchema,
  );
  if (enrollment) {
    assertEnrollmentInCourseInstance(enrollment, courseInstance);
  }
  if (hasRole(authzData, ['Student'])) {
    assertEnrollmentBelongsToUser(enrollment, authzData);
  }
  return enrollment;
}

export async function selectOptionalEnrollmentByPendingUid({
  pendingUid,
  requiredRole,
  authzData,
  courseInstance,
}: {
  pendingUid: string;
  requiredRole: ('System' | 'Student' | 'Student Data Viewer' | 'Student Data Editor')[];
  authzData: AuthzData;
  courseInstance: CourseInstanceContext;
}): Promise<Enrollment | null> {
  assertHasRole(authzData, requiredRole);
  const enrollment = await queryOptionalRow(
    sql.select_enrollment_by_pending_uid,
    { pending_uid: pendingUid, course_instance_id: courseInstance.id },
    EnrollmentSchema,
  );
  if (enrollment) {
    assertEnrollmentInCourseInstance(enrollment, courseInstance);
  }
  if (hasRole(authzData, ['Student'])) {
    assertEnrollmentBelongsToUser(enrollment, authzData);
  }
  return enrollment;
}

export async function generateAndEnrollUsers({
  count,
  course_instance_id,
}: {
  count: number;
  course_instance_id: string;
}) {
  return await runInTransactionAsync(async () => {
    const courseInstance = await selectCourseInstanceById(course_instance_id);
    const users = await generateUsers(count);
    for (const user of users) {
      await ensureUncheckedEnrollment({
        courseInstance,
        userId: user.id,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
        actionDetail: 'implicit_joined',
      });
    }
    return users;
  });
}

/**
 * Gets enrollments and associated users for the given UIDs in a course instance.
 */
export async function selectUsersAndEnrollmentsByUidsInCourseInstance({
  uids,
  courseInstance,
  requiredRole,
  authzData,
}: {
  uids: string[];
  courseInstance: CourseInstanceContext;
  requiredRole: ('System' | 'Student Data Viewer' | 'Student Data Editor')[];
  authzData: AuthzData;
}) {
  assertHasRole(authzData, requiredRole);
  return await queryRows(
    sql.select_enrollments_by_uids_in_course_instance,
    { uids, course_instance_id: courseInstance.id },
    z.object({
      enrollment: EnrollmentSchema,
      user: UserSchema,
    }),
  );
}

export async function selectEnrollmentById({
  id,
  courseInstance,
  requiredRole,
  authzData,
}: {
  id: string;
  courseInstance: CourseInstanceContext;
  requiredRole: ('System' | 'Student' | 'Student Data Viewer' | 'Student Data Editor')[];
  authzData: AuthzData;
}) {
  assertHasRole(authzData, requiredRole);
  const enrollment = await queryRow(sql.select_enrollment_by_id, { id }, EnrollmentSchema);
  assertEnrollmentInCourseInstance(enrollment, courseInstance);
  if (hasRole(authzData, ['Student'])) {
    assertEnrollmentBelongsToUser(enrollment, authzData);
  }
  return enrollment;
}

/**
 * Look up an enrollment by uid and course instance id.
 * If there is no enrollment where the uid or pending_uid matches the given uid,
 * this will return null.
 */
export async function selectOptionalEnrollmentByUid({
  uid,
  requiredRole,
  authzData,
  courseInstance,
}: {
  uid: string;
  requiredRole: ('System' | 'Student' | 'Student Data Viewer' | 'Student Data Editor')[];
  authzData: AuthzData;
  courseInstance: CourseInstanceContext;
}) {
  assertHasRole(authzData, requiredRole);
  const enrollment = await queryOptionalRow(
    sql.select_enrollment_by_uid,
    { course_instance_id: courseInstance.id, uid },
    EnrollmentSchema,
  );
  if (enrollment) {
    assertEnrollmentInCourseInstance(enrollment, courseInstance);
  }
  if (hasRole(authzData, ['Student'])) {
    assertEnrollmentBelongsToUser(enrollment, authzData);
  }
  return enrollment;
}

/**
 * This function invites an existing enrollment.
 * All usages of this function should hold a lock on the enrollment.
 * Callers should ensure that the enrollment is not already invited or joined.
 */
async function _inviteExistingEnrollment({
  lockedEnrollment,
  pendingUid,
  authzData,
  requiredRole,
  actionDetail = 'invited',
}: {
  lockedEnrollment: Enrollment;
  pendingUid: string;
  authzData: AuthzDataWithEffectiveUser;
  requiredRole: ('Student Data Editor' | 'System')[];
  actionDetail?: 'invited' | 'invited_from_sync';
}): Promise<Enrollment> {
  assertHasRole(authzData, requiredRole);
  assertEnrollmentStatus(lockedEnrollment, ['rejected', 'removed', 'blocked']);

  const newEnrollment = await queryRow(
    sql.invite_existing_enrollment,
    { enrollment_id: lockedEnrollment.id, pending_uid: pendingUid },
    EnrollmentSchema,
  );

  await insertAuditEvent({
    tableName: 'enrollments',
    action: 'update',
    actionDetail,
    rowId: newEnrollment.id,
    oldRow: lockedEnrollment,
    newRow: newEnrollment,
    subjectUserId: null,
    agentUserId: authzData.user.id,
    agentAuthnUserId: authzData.authn_user.id,
  });

  return newEnrollment;
}

async function inviteNewEnrollment({
  pendingUid,
  authzData,
  courseInstance,
  requiredRole,
  actionDetail = 'invited',
}: {
  pendingUid: string;
  authzData: AuthzDataWithEffectiveUser;
  courseInstance: CourseInstanceContext;
  requiredRole: ('Student Data Editor' | 'System')[];
  actionDetail?: 'invited' | 'invited_from_sync';
}) {
  assertHasRole(authzData, requiredRole);
  const newEnrollment = await queryRow(
    sql.invite_new_enrollment,
    { course_instance_id: courseInstance.id, pending_uid: pendingUid },
    EnrollmentSchema,
  );

  await insertAuditEvent({
    tableName: 'enrollments',
    action: 'insert',
    actionDetail,
    rowId: newEnrollment.id,
    newRow: newEnrollment,
    subjectUserId: null,
    agentUserId: authzData.user.id,
    agentAuthnUserId: authzData.authn_user.id,
  });

  return newEnrollment;
}

/**
 * Invite a student by uid.
 * If there is an existing enrollment with the given uid, it will be updated to a invitation.
 * If there is no existing enrollment, a new enrollment will be created.
 *
 * Transitions users in the 'blocked', 'rejected' or 'removed' status to 'invited'.
 */
export async function inviteStudentByUid({
  uid,
  authzData,
  courseInstance,
  requiredRole,
  actionDetail = 'invited',
}: {
  uid: string;
  requiredRole: ('Student Data Editor' | 'System')[];
  authzData: AuthzDataWithEffectiveUser;
  courseInstance: CourseInstanceContext;
  actionDetail?: 'invited' | 'invited_from_sync';
}): Promise<Enrollment> {
  return await runInTransactionAsync(async () => {
    const existingEnrollment = await selectOptionalEnrollmentByUid({
      uid,
      requiredRole,
      authzData,
      courseInstance,
    });

    if (existingEnrollment) {
      if (existingEnrollment.user_id) {
        await selectAndLockUser(existingEnrollment.user_id);
      }
      const lockedEnrollment = await _selectAndLockEnrollment(existingEnrollment.id);
      return await _inviteExistingEnrollment({
        lockedEnrollment,
        pendingUid: uid,
        authzData,
        requiredRole,
        actionDetail,
      });
    }

    return await inviteNewEnrollment({
      pendingUid: uid,
      authzData,
      courseInstance,
      requiredRole,
      actionDetail,
    });
  });
}

async function _selectAndLockEnrollment(id: string) {
  return await queryRow(sql.select_and_lock_enrollment_by_id, { id }, EnrollmentSchema);
}

/**
 * Updates the status of an existing enrollment record.
 *
 * If the enrollment is not in the required status or already in the desired status, this will throw an error.
 *
 * The function will lock the enrollment row and create an audit event based on the status change.
 *
 * This function enforces specific state transitions:
 * - `blocked` → `joined` (unblock)
 * - `joined` → `blocked` (block)
 * - `joined` → `removed` (student self-removal)
 * - `invited` → `rejected` (student rejects invitation)
 *
 * For roster sync operations that need to block from any status, use `blockEnrollmentFromSync` instead.
 */
export async function setEnrollmentStatus({
  enrollment,
  status,
  authzData,
  requiredRole,
}: {
  enrollment: Enrollment;
  status: 'rejected' | 'blocked' | 'removed' | 'joined';
  authzData: AuthzData;
  requiredRole: CourseInstanceRole[];
}): Promise<Enrollment> {
  const transitionInformation: {
    previousStatus: EnumEnrollmentStatus;
    actionDetail: SupportedActionsForTable<'enrollments'>;
    permittedRoles: CourseInstanceRole[];
  } = run(() => {
    switch (status) {
      case 'joined':
        return {
          previousStatus: 'blocked',
          actionDetail: 'unblocked',
          permittedRoles: ['Student Data Viewer', 'Student Data Editor'],
        };
      case 'removed':
        return {
          previousStatus: 'joined',
          actionDetail: 'removed',
          permittedRoles: ['Student'],
        };
      case 'rejected':
        return {
          previousStatus: 'invited',
          actionDetail: 'invitation_rejected',
          permittedRoles: ['Student'],
        };
      case 'blocked':
        return {
          previousStatus: 'joined',
          actionDetail: 'blocked',
          permittedRoles: ['Student Data Viewer', 'Student Data Editor'],
        };
      default:
        assertNever(status);
    }
  });

  return await runInTransactionAsync(async () => {
    const lockedEnrollment = await _selectAndLockEnrollment(enrollment.id);
    if (lockedEnrollment.user_id) {
      await selectAndLockUser(lockedEnrollment.user_id);
    }
    // The enrollment is already in the desired status, so we can return early.
    if (lockedEnrollment.status === status) {
      return lockedEnrollment;
    }

    // Assert that the enrollment is in the previous status.
    assertEnrollmentStatus(lockedEnrollment, transitionInformation.previousStatus);

    // Assert that the requested role is permitted to perform the action.
    assertRoleIsPermitted(requiredRole, transitionInformation.permittedRoles);

    // Assert that the caller is authorized to perform the action.
    assertHasRole(authzData, requiredRole);

    const newEnrollment = await queryRow(
      sql.set_enrollment_status,
      { enrollment_id: lockedEnrollment.id, status },
      EnrollmentSchema,
    );

    await insertAuditEvent({
      tableName: 'enrollments',
      action: 'update',
      actionDetail: transitionInformation.actionDetail,
      rowId: newEnrollment.id,
      oldRow: lockedEnrollment,
      newRow: newEnrollment,
      agentUserId: authzData.user.id,
      agentAuthnUserId: 'authn_user' in authzData ? authzData.authn_user.id : authzData.user.id,
    });

    return newEnrollment;
  });
}

/**
 * Removes an enrollment as part of a roster sync operation.
 *
 * Unlike `setEnrollmentStatus`, this function can remove enrollments from any "active" status
 * (joined) because roster sync treats the provided roster as the source of truth and needs
 * to remove anyone not on it who is currently enrolled.
 *
 * LTI-managed enrollments (lti13_pending) cannot be removed via roster sync.
 */
export async function removeEnrollmentFromSync({
  enrollment,
  authzData,
}: {
  enrollment: Enrollment;
  authzData: AuthzData;
}): Promise<Enrollment> {
  return await runInTransactionAsync(async () => {
    const lockedEnrollment = await _selectAndLockEnrollment(enrollment.id);
    if (lockedEnrollment.user_id) {
      await selectAndLockUser(lockedEnrollment.user_id);
    }

    // Already removed - nothing to do.
    if (lockedEnrollment.status === 'removed') {
      return lockedEnrollment;
    }

    // LTI-managed enrollments cannot be removed via roster sync.
    if (lockedEnrollment.status === 'lti13_pending') {
      throw new error.HttpStatusError(400, 'Cannot remove LTI-managed enrollment');
    }

    // Can only remove joined enrollments via roster sync.
    if (lockedEnrollment.status !== 'joined') {
      throw new error.HttpStatusError(
        400,
        `Cannot remove enrollment with status "${lockedEnrollment.status}"`,
      );
    }

    // Roster sync requires Student Data Editor permission.
    assertHasRole(authzData, ['Student Data Editor']);

    const newEnrollment = await queryRow(
      sql.set_enrollment_status,
      { enrollment_id: lockedEnrollment.id, status: 'removed' },
      EnrollmentSchema,
    );

    await insertAuditEvent({
      tableName: 'enrollments',
      action: 'update',
      actionDetail: 'removed_from_sync',
      rowId: newEnrollment.id,
      oldRow: lockedEnrollment,
      newRow: newEnrollment,
      agentUserId: authzData.user.id,
      agentAuthnUserId: 'authn_user' in authzData ? authzData.authn_user.id : authzData.user.id,
    });

    return newEnrollment;
  });
}

/**
 * Deletes an enrollment.
 */
export async function deleteEnrollment({
  enrollment,
  actionDetail,
  authzData,
  requiredRole,
}: {
  enrollment: Enrollment;
  actionDetail: SupportedActionsForTable<'enrollments'>;
  authzData: AuthzDataWithEffectiveUser;
  requiredRole: 'Student Data Editor'[];
}): Promise<Enrollment> {
  assertHasRole(authzData, requiredRole);

  return await runInTransactionAsync(async () => {
    const lockedEnrollment = await _selectAndLockEnrollment(enrollment.id);

    assertEnrollmentStatus(lockedEnrollment, ['invited', 'rejected']);

    const deletedEnrollment = await queryRow(
      sql.delete_enrollment_by_id,
      { enrollment_id: lockedEnrollment.id },
      EnrollmentSchema,
    );

    await insertAuditEvent({
      tableName: 'enrollments',
      action: 'delete',
      actionDetail,
      rowId: lockedEnrollment.id,
      oldRow: lockedEnrollment,
      newRow: null,
      subjectUserId: null,
      courseInstanceId: lockedEnrollment.course_instance_id,
      agentUserId: authzData.user.id,
      agentAuthnUserId: authzData.authn_user.id,
    });

    return deletedEnrollment;
  });
}

/**
 * Invites an enrollment by id, given a pending uid.
 */
export async function inviteEnrollment({
  enrollment,
  pendingUid,
  authzData,
  requiredRole,
}: {
  enrollment: Enrollment;
  pendingUid: string;
  authzData: AuthzDataWithEffectiveUser;
  requiredRole: 'Student Data Editor'[];
}): Promise<Enrollment> {
  return await runInTransactionAsync(async () => {
    const lockedEnrollment = await _selectAndLockEnrollment(enrollment.id);
    if (lockedEnrollment.user_id) {
      await selectAndLockUser(lockedEnrollment.user_id);
    }

    return await _inviteExistingEnrollment({
      lockedEnrollment,
      pendingUid,
      authzData,
      requiredRole,
    });
  });
}
