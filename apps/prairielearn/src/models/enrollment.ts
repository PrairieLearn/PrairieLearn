import * as error from '@prairielearn/error';
import {
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import {
  PotentialEnterpriseEnrollmentStatus,
  checkPotentialEnterpriseEnrollment,
} from '../ee/models/enrollment.js';
import {
  type CourseInstanceRole,
  assertHasRole,
  dangerousFullSystemAuthz,
  hasRole,
  isDangerousFullSystemAuthz,
} from '../lib/authzData.js';
import type { AuthzData, PageAuthzData } from '../lib/authzData.types.js';
import {
  type StaffCourseInstanceContext,
  type StudentCourseInstanceContext,
} from '../lib/client/page-context.js';
import {
  type Course,
  type CourseInstance,
  type Enrollment,
  EnrollmentSchema,
  type EnumEnrollmentStatus,
  type Institution,
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
  | StudentCourseInstanceContext['course_instance']
  | StaffCourseInstanceContext['course_instance'];

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
  if (enrollment.user_id && enrollment.user_id !== authzData.user.user_id) {
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
  requestedRole,
  authzData,
}: {
  lockedEnrollment: Enrollment;
  userId: string;
  actionDetail: SupportedActionsForTable<'enrollments'>;
  requestedRole: 'System' | 'Student';
  authzData: AuthzData;
}): Promise<Enrollment> {
  assertHasRole(authzData, requestedRole);

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
    agentAuthnUserId: authzData.authn_user.user_id,
    agentUserId: authzData.user.user_id,
  });

  return newEnrollment;
}

/**
 * Ensures that the user is enrolled in the given course instance. If the
 * enrollment already exists, this is a no-op.
 *
 * If the user was in the 'removed', 'invited' or 'rejected' status, this will set the
 * enrollment status to 'joined'.
 *
 * If the user was 'blocked', this will throw an error.
 */
export async function ensureEnrollment({
  userId,
  authzData,
  courseInstance,
  actionDetail,
  requestedRole,
}: {
  userId: string;
  requestedRole: 'System' | 'Student';
  authzData: AuthzData;
  courseInstance: CourseInstanceContext;
  actionDetail: SupportedActionsForTable<'enrollments'>;
}): Promise<Enrollment | null> {
  assertHasRole(authzData, requestedRole);
  const result = await runInTransactionAsync(async () => {
    const user = await selectAndLockUser(userId);
    let enrollment = await selectOptionalEnrollmentByPendingUid({
      pendingUid: user.uid,
      requestedRole,
      authzData,
      courseInstance,
    });

    if (enrollment == null) {
      // Try to lookup an enrollment by user_id
      enrollment = await selectOptionalEnrollmentByUserId({
        courseInstance,
        userId,
        requestedRole,
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
        requestedRole,
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
        agentUserId: authzData.user.user_id,
        agentAuthnUserId: authzData.authn_user.user_id,
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
export async function ensureCheckedEnrollment({
  institution,
  course,
  courseInstance,
  authzData,
  requestedRole,
  actionDetail,
}: {
  institution: Institution;
  course: Course;
  courseInstance: CourseInstance;
  authzData: PageAuthzData;
  requestedRole: 'Student';
  actionDetail: SupportedActionsForTable<'enrollments'>;
}) {
  // If the current user is not a student, bail.
  // We don't want to give instructors an enrollment.
  if (!hasRole(authzData, 'Student')) return;

  if (isEnterprise()) {
    const status = await checkPotentialEnterpriseEnrollment({
      institution,
      course,
      courseInstance,
      authzData,
    });

    switch (status) {
      case PotentialEnterpriseEnrollmentStatus.PLAN_GRANTS_REQUIRED:
        throw new HttpRedirect(`/pl/course_instance/${courseInstance.id}/upgrade`);
      case PotentialEnterpriseEnrollmentStatus.LIMIT_EXCEEDED:
        throw new HttpRedirect('/pl/enroll/limit_exceeded');
      case PotentialEnterpriseEnrollmentStatus.ALLOWED:
        break;
      default:
        assertNever(status);
    }
  }

  await ensureEnrollment({
    courseInstance,
    userId: authzData.authn_user.user_id,
    requestedRole,
    authzData,
    actionDetail,
  });
}

export async function selectOptionalEnrollmentByUserId({
  userId,
  requestedRole,
  authzData,
  courseInstance,
}: {
  userId: string;
  requestedRole: 'System' | 'Student' | 'Student Data Viewer' | 'Student Data Editor' | 'Any';
  authzData: AuthzData;
  courseInstance: CourseInstanceContext;
}): Promise<Enrollment | null> {
  assertHasRole(authzData, requestedRole);
  const enrollment = await queryOptionalRow(
    sql.select_enrollment_by_user_id,
    { user_id: userId, course_instance_id: courseInstance.id },
    EnrollmentSchema,
  );
  if (enrollment) {
    assertEnrollmentInCourseInstance(enrollment, courseInstance);
  }
  if (hasRole(authzData, 'Student')) {
    assertEnrollmentBelongsToUser(enrollment, authzData);
  }
  return enrollment;
}

export async function selectOptionalEnrollmentByPendingUid({
  pendingUid,
  requestedRole,
  authzData,
  courseInstance,
}: {
  pendingUid: string;
  requestedRole: 'System' | 'Student' | 'Student Data Viewer' | 'Student Data Editor' | 'Any';
  authzData: AuthzData;
  courseInstance: CourseInstanceContext;
}): Promise<Enrollment | null> {
  assertHasRole(authzData, requestedRole);
  const enrollment = await queryOptionalRow(
    sql.select_enrollment_by_pending_uid,
    { pending_uid: pendingUid, course_instance_id: courseInstance.id },
    EnrollmentSchema,
  );
  if (enrollment) {
    assertEnrollmentInCourseInstance(enrollment, courseInstance);
  }
  if (hasRole(authzData, 'Student')) {
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
      await ensureEnrollment({
        courseInstance,
        userId: user.user_id,
        // Typically, model code should never set requestedRole,
        // but this function is only used in test code where we don't care about
        // the role the caller requests.
        requestedRole: 'System',
        authzData: dangerousFullSystemAuthz(),
        actionDetail: 'implicit_joined',
      });
    }
    return users;
  });
}

export async function selectEnrollmentById({
  id,
  courseInstance,
  requestedRole,
  authzData,
}: {
  id: string;
  courseInstance: CourseInstanceContext;
  requestedRole: 'Student' | 'Student Data Viewer' | 'Student Data Editor' | 'Any';
  authzData: AuthzData;
}) {
  assertHasRole(authzData, requestedRole);
  const enrollment = await queryRow(sql.select_enrollment_by_id, { id }, EnrollmentSchema);
  assertEnrollmentInCourseInstance(enrollment, courseInstance);
  if (hasRole(authzData, 'Student')) {
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
  requestedRole,
  authzData,
  courseInstance,
}: {
  uid: string;
  requestedRole: 'Student' | 'Student Data Viewer' | 'Student Data Editor' | 'Any';
  authzData: AuthzData;
  courseInstance: CourseInstanceContext;
}) {
  assertHasRole(authzData, requestedRole);
  const enrollment = await queryOptionalRow(
    sql.select_enrollment_by_uid,
    { course_instance_id: courseInstance.id, uid },
    EnrollmentSchema,
  );
  if (enrollment) {
    assertEnrollmentInCourseInstance(enrollment, courseInstance);
  }
  if (hasRole(authzData, 'Student')) {
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
  requestedRole,
}: {
  lockedEnrollment: Enrollment;
  pendingUid: string;
  authzData: AuthzData;
  requestedRole: 'Student Data Editor';
}): Promise<Enrollment> {
  assertHasRole(authzData, requestedRole);
  assertEnrollmentStatus(lockedEnrollment, ['rejected', 'removed', 'blocked']);

  const newEnrollment = await queryRow(
    sql.invite_existing_enrollment,
    { enrollment_id: lockedEnrollment.id, pending_uid: pendingUid },
    EnrollmentSchema,
  );

  await insertAuditEvent({
    tableName: 'enrollments',
    action: 'update',
    actionDetail: 'invited',
    rowId: newEnrollment.id,
    oldRow: lockedEnrollment,
    newRow: newEnrollment,
    subjectUserId: null,
    agentUserId: authzData.user.user_id,
    agentAuthnUserId: authzData.authn_user.user_id,
  });

  return newEnrollment;
}

async function inviteNewEnrollment({
  pendingUid,
  authzData,
  courseInstance,
  requestedRole,
}: {
  pendingUid: string;
  authzData: AuthzData;
  courseInstance: CourseInstanceContext;
  requestedRole: 'Student Data Editor';
}) {
  assertHasRole(authzData, requestedRole);
  const newEnrollment = await queryRow(
    sql.invite_new_enrollment,
    { course_instance_id: courseInstance.id, pending_uid: pendingUid },
    EnrollmentSchema,
  );

  await insertAuditEvent({
    tableName: 'enrollments',
    action: 'insert',
    actionDetail: 'invited',
    rowId: newEnrollment.id,
    newRow: newEnrollment,
    subjectUserId: null,
    agentUserId: authzData.user.user_id,
    agentAuthnUserId: authzData.authn_user.user_id,
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
  requestedRole,
}: {
  uid: string;
  requestedRole: 'Student Data Editor';
  authzData: AuthzData;
  courseInstance: CourseInstanceContext;
}): Promise<Enrollment> {
  return await runInTransactionAsync(async () => {
    const existingEnrollment = await selectOptionalEnrollmentByUid({
      uid,
      requestedRole,
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
        requestedRole,
      });
    }

    return await inviteNewEnrollment({
      pendingUid: uid,
      authzData,
      courseInstance,
      requestedRole,
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
 */
export async function setEnrollmentStatus({
  enrollment,
  status,
  authzData,
  requestedRole,
}: {
  enrollment: Enrollment;
  status: 'rejected' | 'blocked' | 'removed' | 'joined';
  authzData: AuthzData;
  requestedRole: CourseInstanceRole;
}): Promise<Enrollment> {
  const transitionInformation: {
    previousStatus: EnumEnrollmentStatus;
    actionDetail: SupportedActionsForTable<'enrollments'>;
    allowedRoles: CourseInstanceRole[];
  } = run(() => {
    switch (status) {
      case 'joined':
        return {
          previousStatus: 'blocked',
          actionDetail: 'unblocked',
          allowedRoles: ['Student Data Viewer', 'Student Data Editor'],
        };
      case 'removed':
        return {
          previousStatus: 'joined',
          actionDetail: 'removed',
          allowedRoles: ['Student'],
        };
      case 'rejected':
        return {
          previousStatus: 'invited',
          actionDetail: 'invitation_rejected',
          allowedRoles: ['Student'],
        };
      case 'blocked':
        return {
          previousStatus: 'joined',
          actionDetail: 'blocked',
          allowedRoles: ['Student Data Viewer', 'Student Data Editor'],
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

    // Assert that the caller is authorized to perform the action.
    assertHasRole(authzData, requestedRole, transitionInformation.allowedRoles);

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
      agentUserId: authzData.user.user_id,
      agentAuthnUserId: authzData.authn_user.user_id,
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
  requestedRole,
}: {
  enrollment: Enrollment;
  actionDetail: SupportedActionsForTable<'enrollments'>;
  authzData: AuthzData;
  requestedRole: 'Student Data Editor';
}): Promise<Enrollment> {
  assertHasRole(authzData, requestedRole);

  return await runInTransactionAsync(async () => {
    const lockedEnrollment = await _selectAndLockEnrollment(enrollment.id);

    assertEnrollmentStatus(lockedEnrollment, 'invited');

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
      agentUserId: authzData.user.user_id,
      agentAuthnUserId: authzData.authn_user.user_id,
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
  requestedRole,
}: {
  enrollment: Enrollment;
  pendingUid: string;
  authzData: AuthzData;
  requestedRole: 'Student Data Editor';
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
      requestedRole,
    });
  });
}
