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
  type DangerousAuthzData,
  type RawAuthzData,
  type StaffCourseInstanceContext,
  type StudentCourseInstanceContext,
  dangerousFullAuthzPermissions,
} from '../lib/client/page-context.js';
import {
  type Course,
  type CourseInstance,
  type Enrollment,
  EnrollmentSchema,
  type EnumCourseInstanceRole,
  type EnumEnrollmentStatus,
  type Institution,
} from '../lib/db-types.js';
import { isEnterprise } from '../lib/license.js';
import { HttpRedirect } from '../lib/redirect.js';
import { assertNever } from '../lib/types.js';

import { type SupportedActionsForTable, insertAuditEvent } from './audit-event.js';
import { selectCourseInstanceById } from './course-instances.js';
import { generateUsers, selectAndLockUser } from './user.js';

const sql = loadSqlEquiv(import.meta.url);

type CourseInstanceContext =
  | CourseInstance
  | StudentCourseInstanceContext['course_instance']
  | StaffCourseInstanceContext['course_instance'];
type CourseInstanceRole = EnumCourseInstanceRole | 'Student';
type CourseInstanceRoles = CourseInstanceRole | CourseInstanceRole[];

function isDangerousFullAuthzPermissions(
  authzData: RawAuthzData | DangerousAuthzData,
): authzData is DangerousAuthzData {
  if (authzData.authn_user.user_id === null) {
    return true;
  }
  return false;
}

function assertRequiredRoles(
  requiredRoleOptions: CourseInstanceRoles,
  authzData: RawAuthzData | DangerousAuthzData,
): void {
  if (isDangerousFullAuthzPermissions(authzData)) {
    return;
  }
  const roles = Array.isArray(requiredRoleOptions) ? requiredRoleOptions : [requiredRoleOptions];
  for (const role of roles) {
    if (role === 'Student' && authzData.has_student_access) {
      return;
    }
    if (authzData.course_instance_role === role) {
      return;
    }
  }

  throw new error.HttpStatusError(403, 'Access denied');
}

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

/**
 * Changes the status of an enrollment to joined.
 *
 * Function callers should hold a lock on the enrollment.
 */
async function _enrollUserInCourseInstanceWithLock({
  enrollment,
  userId,
  actionDetail,
  requiredRoleOptions,
  authzData,
}: {
  enrollment: Enrollment;
  userId: string;
  actionDetail: SupportedActionsForTable<'enrollments'>;
  requiredRoleOptions: CourseInstanceRoles;
  authzData: RawAuthzData | DangerousAuthzData;
}): Promise<Enrollment> {
  assertRequiredRoles(requiredRoleOptions, authzData);

  const newEnrollment = await queryRow(
    sql.enroll_user,
    {
      enrollment_id: enrollment.id,
      user_id: userId,
    },
    EnrollmentSchema,
  );

  await insertAuditEvent({
    tableName: 'enrollments',
    action: 'update',
    actionDetail,
    rowId: newEnrollment.id,
    oldRow: enrollment,
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
 * If the user was invited to the course instance, this will set the
 * enrollment status to 'joined'.
 * If the user was in the 'removed' status, this will set the
 * enrollment status to 'joined'.
 */
export async function ensureEnrollment({
  userId,
  requiredRoleOptions,
  authzData,
  courseInstance,
  actionDetail,
}: {
  userId: string;
  requiredRoleOptions: CourseInstanceRoles;
  authzData: RawAuthzData | DangerousAuthzData;
  courseInstance: CourseInstanceContext;
  actionDetail: SupportedActionsForTable<'enrollments'>;
}): Promise<Enrollment | null> {
  const result = await runInTransactionAsync(async () => {
    const user = await selectAndLockUser(userId);
    let enrollment = await selectOptionalEnrollmentByPendingUid({
      pendingUid: user.uid,
      requiredRoleOptions,
      authzData,
      courseInstance,
    });

    if (enrollment == null) {
      // Try to lookup an enrollment by user_id
      enrollment = await selectOptionalEnrollmentByUserId({
        courseInstance,
        userId,
        requiredRoleOptions,
        authzData,
      });
    }

    if (enrollment) {
      await _selectAndLockEnrollment(enrollment.id);
    }

    if (enrollment && ['invited', 'removed', 'rejected'].includes(enrollment.status)) {
      const updated = await _enrollUserInCourseInstanceWithLock({
        enrollment,
        userId,
        actionDetail,
        requiredRoleOptions,
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
 * If the user was successfully enrolled, returns true. Otherwise, returns
 * false. If false is returned, the response has already been redirected to
 * an appropriate page.
 */
export async function ensureCheckedEnrollment({
  institution,
  course,
  courseInstance,
  authzData,
  actionDetail,
  requiredRoleOptions,
}: {
  institution: Institution;
  course: Course;
  courseInstance: CourseInstance;
  authzData: RawAuthzData;
  actionDetail: SupportedActionsForTable<'enrollments'>;
  requiredRoleOptions: CourseInstanceRoles;
}) {
  assertRequiredRoles(requiredRoleOptions, authzData);

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
    requiredRoleOptions: 'Student',
    authzData,
    actionDetail,
  });
}

export async function selectOptionalEnrollmentByUserId({
  userId,
  requiredRoleOptions,
  authzData,
  courseInstance,
}: {
  userId: string;
  requiredRoleOptions: CourseInstanceRoles;
  authzData: RawAuthzData | DangerousAuthzData;
  courseInstance: CourseInstanceContext;
}): Promise<Enrollment | null> {
  assertRequiredRoles(requiredRoleOptions, authzData);
  const enrollment = await queryOptionalRow(
    sql.select_enrollment_by_user_id,
    { user_id: userId, course_instance_id: courseInstance.id },
    EnrollmentSchema,
  );
  if (enrollment) {
    assertEnrollmentInCourseInstance(enrollment, courseInstance);
  }
  return enrollment;
}

export async function selectOptionalEnrollmentByPendingUid({
  pendingUid,
  requiredRoleOptions,
  authzData,
  courseInstance,
}: {
  pendingUid: string;
  requiredRoleOptions: CourseInstanceRoles;
  authzData: RawAuthzData | DangerousAuthzData;
  courseInstance: CourseInstanceContext;
}): Promise<Enrollment | null> {
  assertRequiredRoles(requiredRoleOptions, authzData);
  const enrollment = await queryOptionalRow(
    sql.select_enrollment_by_pending_uid,
    { pending_uid: pendingUid, course_instance_id: courseInstance.id },
    EnrollmentSchema,
  );
  if (enrollment) {
    assertEnrollmentInCourseInstance(enrollment, courseInstance);
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
        requiredRoleOptions: 'Student Data Editor',
        authzData: dangerousFullAuthzPermissions(),
        actionDetail: 'implicit_joined',
      });
    }
    return users;
  });
}

export async function selectEnrollmentById({
  id,
  courseInstance,
  requiredRoleOptions,
  authzData,
}: {
  id: string;
  courseInstance: CourseInstanceContext;
  requiredRoleOptions: CourseInstanceRoles;
  authzData: RawAuthzData | DangerousAuthzData;
}) {
  assertRequiredRoles(requiredRoleOptions, authzData);
  const enrollment = await queryRow(sql.select_enrollment_by_id, { id }, EnrollmentSchema);
  assertEnrollmentInCourseInstance(enrollment, courseInstance);
  return enrollment;
}

/**
 * Look up an enrollment by uid and course instance id.
 * If there is no enrollment where the uid or pending_uid matches the given uid,
 * this will return null.
 */
export async function selectOptionalEnrollmentByUid({
  uid,
  requiredRoleOptions,
  authzData,
  courseInstance,
}: {
  uid: string;
  requiredRoleOptions: CourseInstanceRoles;
  authzData: RawAuthzData | DangerousAuthzData;
  courseInstance: CourseInstanceContext;
}) {
  assertRequiredRoles(requiredRoleOptions, authzData);
  const enrollment = await queryOptionalRow(
    sql.select_enrollment_by_uid,
    { course_instance_id: courseInstance.id, uid },
    EnrollmentSchema,
  );
  if (enrollment) {
    assertEnrollmentInCourseInstance(enrollment, courseInstance);
  }
  return enrollment;
}

/**
 * This function invites an existing enrollment.
 * All usages of this function should hold a lock on the enrollment.
 * Callers should ensure that the enrollment is not already invited or joined.
 */
async function _inviteExistingEnrollmentLocked({
  enrollment,
  pendingUid,
  requiredRoleOptions,
  authzData,
}: {
  enrollment: Enrollment;
  pendingUid: string;
  requiredRoleOptions: CourseInstanceRoles;
  authzData: RawAuthzData | DangerousAuthzData;
}): Promise<Enrollment> {
  assertRequiredRoles(requiredRoleOptions, authzData);
  assertEnrollmentStatus(enrollment, ['rejected', 'removed']);

  const newEnrollment = await queryRow(
    sql.invite_existing_enrollment,
    { enrollment_id: enrollment.id, pending_uid: pendingUid },
    EnrollmentSchema,
  );

  await insertAuditEvent({
    tableName: 'enrollments',
    action: 'update',
    actionDetail: 'invited',
    rowId: newEnrollment.id,
    oldRow: enrollment,
    newRow: newEnrollment,
    subjectUserId: null,
    agentUserId: authzData.user.user_id,
    agentAuthnUserId: authzData.authn_user.user_id,
  });

  return newEnrollment;
}

async function inviteNewEnrollment({
  pendingUid,
  requiredRoleOptions,
  authzData,
  courseInstance,
}: {
  pendingUid: string;
  requiredRoleOptions: CourseInstanceRoles;
  authzData: RawAuthzData | DangerousAuthzData;
  courseInstance: CourseInstanceContext;
}) {
  assertRequiredRoles(requiredRoleOptions, authzData);
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
 */
export async function inviteStudentByUid({
  uid,
  requiredRoleOptions,
  authzData,
  courseInstance,
}: {
  uid: string;
  requiredRoleOptions: CourseInstanceRoles;
  authzData: RawAuthzData | DangerousAuthzData;
  courseInstance: CourseInstanceContext;
}): Promise<Enrollment> {
  return await runInTransactionAsync(async () => {
    const existingEnrollment = await selectOptionalEnrollmentByUid({
      uid,
      requiredRoleOptions,
      authzData,
      courseInstance,
    });

    if (existingEnrollment) {
      if (existingEnrollment.user_id) {
        await selectAndLockUser(existingEnrollment.user_id);
      }
      await _selectAndLockEnrollment(existingEnrollment.id);
      return await _inviteExistingEnrollmentLocked({
        enrollment: existingEnrollment,
        pendingUid: uid,
        requiredRoleOptions,
        authzData,
      });
    }

    return await inviteNewEnrollment({
      pendingUid: uid,
      requiredRoleOptions,
      authzData,
      courseInstance,
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
  requiredRoleOptions,
  authzData,
}: {
  enrollment: Enrollment;
  status: 'rejected' | 'blocked' | 'removed' | 'joined';
  requiredRoleOptions: CourseInstanceRoles;
  authzData: RawAuthzData | DangerousAuthzData;
}): Promise<Enrollment> {
  assertRequiredRoles(requiredRoleOptions, authzData);

  const transitionInformation: {
    previousStatus: EnumEnrollmentStatus;
    actionDetail: SupportedActionsForTable<'enrollments'>;
    requiredRole: CourseInstanceRole;
  } = run(() => {
    switch (status) {
      case 'joined':
        return {
          previousStatus: 'blocked',
          actionDetail: 'blocked',
          requiredRole: 'Student Data Editor',
        };
      case 'removed':
        return {
          previousStatus: 'joined',
          actionDetail: 'unblocked',
          requiredRole: 'Student Data Editor',
        };
      case 'rejected':
        return {
          previousStatus: 'invited',
          actionDetail: 'invitation_rejected',
          requiredRole: 'Student',
        };
      case 'blocked':
        return {
          previousStatus: 'joined',
          actionDetail: 'unblocked',
          requiredRole: 'Student Data Editor',
        };
      default:
        assertNever(status);
    }
  });

  return await runInTransactionAsync(async () => {
    const oldEnrollment = await _selectAndLockEnrollment(enrollment.id);
    if (oldEnrollment.user_id) {
      await selectAndLockUser(oldEnrollment.user_id);
    }
    // The enrollment is already in the desired status, so we can return early.
    if (oldEnrollment.status === status) {
      return oldEnrollment;
    }

    // Assert that the enrollment is in the previous status.
    assertEnrollmentStatus(oldEnrollment, transitionInformation.previousStatus);
    // Assert that the caller is authorized to perform the action.
    assertRequiredRoles(transitionInformation.requiredRole, authzData);

    const newEnrollment = await queryRow(
      sql.set_enrollment_status,
      { enrollment_id: enrollment.id, status },
      EnrollmentSchema,
    );

    await insertAuditEvent({
      tableName: 'enrollments',
      action: 'update',
      actionDetail: transitionInformation.actionDetail,
      rowId: newEnrollment.id,
      oldRow: oldEnrollment,
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
  requiredRoleOptions,
  authzData,
}: {
  enrollment: Enrollment;
  actionDetail: SupportedActionsForTable<'enrollments'>;
  requiredRoleOptions: CourseInstanceRoles;
  authzData: RawAuthzData | DangerousAuthzData;
}): Promise<Enrollment> {
  assertRequiredRoles(requiredRoleOptions, authzData);

  return await runInTransactionAsync(async () => {
    const oldEnrollment = await _selectAndLockEnrollment(enrollment.id);

    const deletedEnrollment = await queryRow(
      sql.delete_enrollment_by_id,
      { enrollment_id: enrollment.id },
      EnrollmentSchema,
    );

    assertEnrollmentStatus(deletedEnrollment, 'invited');

    await insertAuditEvent({
      tableName: 'enrollments',
      action: 'delete',
      actionDetail,
      rowId: oldEnrollment.id,
      oldRow: oldEnrollment,
      newRow: null,
      subjectUserId: null,
      courseInstanceId: oldEnrollment.course_instance_id,
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
  enrollment: unlockedEnrollment,
  pendingUid,
  requiredRoleOptions,
  authzData,
}: {
  enrollment: Enrollment;
  pendingUid: string;
  requiredRoleOptions: CourseInstanceRoles;
  authzData: RawAuthzData | DangerousAuthzData;
}): Promise<Enrollment> {
  return await runInTransactionAsync(async () => {
    const enrollment = await _selectAndLockEnrollment(unlockedEnrollment.id);
    if (enrollment.user_id) {
      await selectAndLockUser(enrollment.user_id);
    }

    return await _inviteExistingEnrollmentLocked({
      enrollment,
      pendingUid,
      requiredRoleOptions,
      authzData,
    });
  });
}
