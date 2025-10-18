import assert from 'node:assert';

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
import type { AuthzData, DangerousAuthzData } from '../lib/client/page-context.js';
import {
  type Course,
  type CourseInstance,
  type Enrollment,
  EnrollmentSchema,
  type Institution,
} from '../lib/db-types.js';
import { isEnterprise } from '../lib/license.js';
import { HttpRedirect } from '../lib/redirect.js';
import { assertNever } from '../lib/types.js';

import { type SupportedActionsForTable, insertAuditEvent } from './audit-event.js';
import { generateUsers, selectAndLockUser } from './user.js';

const sql = loadSqlEquiv(import.meta.url);

/** This is the authorization context you need to provide to most enrollment functions. */
interface EnrollmentContext {
  roleNeeded: 'student';
  authzData: AuthzData | DangerousAuthzData;
  courseInstance: CourseInstance;
}
/**
 * If the enrollment is not tied to a user, the user_id can be provided to tie it to a user.
 * Otherwise, you should not provide a user_id.
 */
export async function enrollUserInCourseInstance({
  enrollment_id,
  user_id,
  action_detail,
  context,
}: {
  enrollment_id: string;
  user_id?: string;
  action_detail: SupportedActionsForTable<'enrollments'>;
  context: EnrollmentContext;
}): Promise<Enrollment> {
  return await runInTransactionAsync(async () => {
    const enrollment = await selectAndLockEnrollment(enrollment_id);
    if (user_id && enrollment.user_id) {
      throw new Error('Enrollment is already tied to a user');
    }

    const user_id_to_use = user_id ?? enrollment.user_id;
    if (!user_id_to_use) {
      throw new Error('User ID is required to enroll a user into a course instance');
    }

    return await dangerouslyEnrollUserInCourseInstance({
      enrollment_id,
      user_id: user_id_to_use,
      action_detail,
      context,
    });
  });
}

/**
 * Changes the status of an enrollment to joined.
 *
 * Function callers should hold a lock on the enrollment.
 */
async function dangerouslyEnrollUserInCourseInstance({
  enrollment_id,
  user_id,
  action_detail,
  context: { authzData },
}: {
  enrollment_id: string;
  user_id: string;
  action_detail: SupportedActionsForTable<'enrollments'>;
  context: EnrollmentContext;
}): Promise<Enrollment> {
  const oldEnrollment = await selectEnrollmentById({ id: enrollment_id });
  assert(oldEnrollment.status !== 'joined');
  const newEnrollment = await queryRow(
    sql.enroll_user,
    {
      enrollment_id,
      user_id,
    },
    EnrollmentSchema,
  );

  await insertAuditEvent({
    table_name: 'enrollments',
    action: 'update',
    action_detail,
    row_id: newEnrollment.id,
    old_row: oldEnrollment,
    new_row: newEnrollment,
    agent_user_id: authzData.user.user_id,
    agent_authn_user_id: authzData.authn_user.user_id,
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
  course_instance_id,
  user_id,
  context,
  action_detail,
}: {
  course_instance_id: string;
  user_id: string;
  context: EnrollmentContext;
  action_detail: SupportedActionsForTable<'enrollments'>;
}): Promise<Enrollment | null> {
  const { authzData } = context;
  const result = await runInTransactionAsync(async () => {
    const user = await selectAndLockUser(user_id);
    let enrollment = await selectOptionalEnrollmentByPendingUid({
      course_instance_id,
      pending_uid: user.uid,
      context,
    });

    if (enrollment == null) {
      // Try to lookup an enrollment by user_id
      enrollment = await selectOptionalEnrollmentByUserId({
        course_instance_id,
        user_id,
        context,
      });
    }

    if (enrollment) {
      await selectAndLockEnrollment(enrollment.id);
    }

    if (enrollment && ['invited', 'removed', 'rejected'].includes(enrollment.status)) {
      const updated = await dangerouslyEnrollUserInCourseInstance({
        enrollment_id: enrollment.id,
        user_id,
        action_detail,
        context,
      });
      return updated;
    }

    const inserted = await queryOptionalRow(
      sql.ensure_enrollment,
      { course_instance_id, user_id },
      EnrollmentSchema,
    );
    if (inserted) {
      await insertAuditEvent({
        table_name: 'enrollments',
        action: 'insert',
        action_detail,
        row_id: inserted.id,
        new_row: inserted,
        agent_user_id: authzData.user.user_id,
        agent_authn_user_id: authzData.authn_user.user_id,
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
  course_instance,
  authz_data,
  action_detail,
}: {
  institution: Institution;
  course: Course;
  course_instance: CourseInstance;
  authz_data: AuthzData;
  action_detail: SupportedActionsForTable<'enrollments'>;
}) {
  // Safety check: ensure the student would otherwise have access to the course.
  // If they don't, throw an access denied error. In most cases, this should
  // have already been checked.
  if (!authz_data.has_student_access) {
    throw new error.HttpStatusError(403, 'Access denied');
  }

  if (isEnterprise()) {
    const status = await checkPotentialEnterpriseEnrollment({
      institution,
      course,
      course_instance,
      authz_data,
    });

    switch (status) {
      case PotentialEnterpriseEnrollmentStatus.PLAN_GRANTS_REQUIRED:
        throw new HttpRedirect(`/pl/course_instance/${course_instance.id}/upgrade`);
      case PotentialEnterpriseEnrollmentStatus.LIMIT_EXCEEDED:
        throw new HttpRedirect('/pl/enroll/limit_exceeded');
      case PotentialEnterpriseEnrollmentStatus.ALLOWED:
        break;
      default:
        assertNever(status);
    }
  }

  await ensureEnrollment({
    course_instance_id: course_instance.id,
    user_id: authz_data.authn_user.user_id,
    context: { roleNeeded: 'student', authzData: authz_data, courseInstance: course_instance },
    action_detail,
  });
}

export async function selectOptionalEnrollmentByUserId({
  user_id,
  course_instance_id,
  context,
}: {
  user_id: string;
  course_instance_id: string;
  context: EnrollmentContext;
}): Promise<Enrollment | null> {
  return await queryOptionalRow(
    sql.select_enrollment_by_user_id,
    { user_id, course_instance_id },
    EnrollmentSchema,
  );
}

export async function selectOptionalEnrollmentByPendingUid({
  pending_uid,
  course_instance_id,
  context,
}: {
  pending_uid: string;
  course_instance_id: string;
  context: EnrollmentContext;
}): Promise<Enrollment | null> {
  return await queryOptionalRow(
    sql.select_enrollment_by_pending_uid,
    { pending_uid, course_instance_id },
    EnrollmentSchema,
  );
}

export async function generateAndEnrollUsers({
  count,
  course_instance_id,
  context,
}: {
  count: number;
  course_instance_id: string;
  context: EnrollmentContext;
}) {
  return await runInTransactionAsync(async () => {
    const users = await generateUsers(count);
    for (const user of users) {
      await ensureEnrollment({
        course_instance_id,
        user_id: user.user_id,
        // This is done by the system
        context,
        action_detail: 'implicit_joined',
      });
    }
    return users;
  });
}

export async function selectEnrollmentById({ id }: { id: string }) {
  return await queryRow(sql.select_enrollment_by_id, { id }, EnrollmentSchema);
}

/**
 * Look up an enrollment by uid and course instance id.
 * If there is no enrollment where the uid or pending_uid matches the given uid,
 * this will return null.
 */
export async function selectOptionalEnrollmentByUid({
  course_instance_id,
  uid,
}: {
  course_instance_id: string;
  uid: string;
}) {
  return await queryOptionalRow(
    sql.select_enrollment_by_uid,
    { course_instance_id, uid },
    EnrollmentSchema,
  );
}

/**
 * This function invites an existing enrollment.
 * All usages of this function should hold a lock on the enrollment.
 * Callers should ensure that the enrollment is not already invited or joined.
 */
async function inviteExistingEnrollmentLocked({
  enrollment_id,
  pending_uid,
  context: { authzData },
}: {
  enrollment_id: string;
  pending_uid: string;
  context: EnrollmentContext;
}): Promise<Enrollment> {
  const oldEnrollment = await selectEnrollmentById({ id: enrollment_id });

  assert(oldEnrollment.status !== 'invited');
  assert(oldEnrollment.status !== 'joined');

  const newEnrollment = await queryRow(
    sql.invite_existing_enrollment,
    { enrollment_id, pending_uid },
    EnrollmentSchema,
  );

  await insertAuditEvent({
    table_name: 'enrollments',
    action: 'update',
    action_detail: 'invited',
    row_id: newEnrollment.id,
    old_row: oldEnrollment,
    new_row: newEnrollment,
    subject_user_id: null,
    agent_user_id: authzData.user.user_id,
    agent_authn_user_id: authzData.authn_user.user_id,
  });

  return newEnrollment;
}

async function inviteNewEnrollment({
  course_instance_id,
  pending_uid,
  context: { authzData },
}: {
  course_instance_id: string;
  pending_uid: string;
  context: {
    roleNeeded: 'student';
    authzData: AuthzData;
    courseInstance: CourseInstance;
  };
}) {
  const newEnrollment = await queryRow(
    sql.invite_new_enrollment,
    { course_instance_id, pending_uid },
    EnrollmentSchema,
  );

  await insertAuditEvent({
    table_name: 'enrollments',
    action: 'insert',
    action_detail: 'invited',
    row_id: newEnrollment.id,
    new_row: newEnrollment,
    subject_user_id: null,
    agent_user_id: authzData.user.user_id,
    agent_authn_user_id: authzData.authn_user.user_id,
  });

  return newEnrollment;
}

/**
 * Invite a student by uid.
 * If there is an existing enrollment with the given uid, it will be updated to a invitation.
 * If there is no existing enrollment, a new enrollment will be created.
 */
export async function inviteStudentByUid({
  course_instance_id,
  uid,
  context,
}: {
  course_instance_id: string;
  uid: string;
  context: {
    roleNeeded: 'student';
    authzData: AuthzData;
    courseInstance: CourseInstance;
  };
}): Promise<Enrollment> {
  return await runInTransactionAsync(async () => {
    const existingEnrollment = await selectOptionalEnrollmentByUid({
      course_instance_id,
      uid,
    });

    if (existingEnrollment) {
      if (existingEnrollment.user_id) {
        await selectAndLockUser(existingEnrollment.user_id);
      }
      await selectAndLockEnrollment(existingEnrollment.id);
      return await inviteExistingEnrollmentLocked({
        enrollment_id: existingEnrollment.id,
        pending_uid: uid,
        context,
      });
    }

    return await inviteNewEnrollment({
      course_instance_id,
      pending_uid: uid,
      context,
    });
  });
}

/** This action requires no authorization checks. */
export async function selectAndLockEnrollment(id: string) {
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
  enrollment_id,
  status,
  required_status,
  context: { authzData },
}: {
  enrollment_id: string;
  status: 'rejected' | 'blocked' | 'removed';
  required_status: 'invited' | 'joined';
  context: {
    roleNeeded: 'student';
    authzData: AuthzData;
    courseInstance: CourseInstance;
  };
}): Promise<Enrollment> {
  return await runInTransactionAsync(async () => {
    const oldEnrollment = await selectAndLockEnrollment(enrollment_id);
    if (oldEnrollment.user_id) {
      await selectAndLockUser(oldEnrollment.user_id);
    }

    // The enrollment is already in the desired status, so we can return early.
    if (oldEnrollment.status === status) {
      return oldEnrollment;
    }

    if (oldEnrollment.status !== required_status) {
      throw new Error(
        `Enrollment is not in the required status. Expected ${required_status}, but got ${oldEnrollment.status}`,
      );
    }

    const newEnrollment = await queryRow(
      sql.set_enrollment_status,
      { enrollment_id, status },
      EnrollmentSchema,
    );

    const action_detail = run(() => {
      switch (status) {
        case 'blocked':
          return 'blocked';
        case 'rejected':
          return 'invitation_rejected';
        case 'removed':
          return 'removed';
        default:
          assertNever(status);
      }
    });

    await insertAuditEvent({
      table_name: 'enrollments',
      action: 'update',
      action_detail,
      row_id: newEnrollment.id,
      old_row: oldEnrollment,
      new_row: newEnrollment,
      agent_user_id: authzData.user.user_id,
      agent_authn_user_id: authzData.authn_user.user_id,
    });

    return newEnrollment;
  });
}

/**
 * Deletes an enrollment.
 */
export async function deleteEnrollment({
  enrollment_id,
  action_detail,
  context: { authzData },
}: {
  enrollment_id: string;
  action_detail: SupportedActionsForTable<'enrollments'>;
  context: {
    roleNeeded: 'student';
    authzData: AuthzData;
    courseInstance: CourseInstance;
  };
}): Promise<Enrollment> {
  return await runInTransactionAsync(async () => {
    const oldEnrollment = await selectAndLockEnrollment(enrollment_id);

    const deletedEnrollment = await queryRow(
      sql.delete_enrollment_by_id,
      { enrollment_id },
      EnrollmentSchema,
    );

    await insertAuditEvent({
      table_name: 'enrollments',
      action: 'delete',
      action_detail,
      row_id: oldEnrollment.id,
      old_row: oldEnrollment,
      new_row: null,
      subject_user_id: null,
      course_instance_id: oldEnrollment.course_instance_id,
      agent_user_id: authzData.user.user_id,
      agent_authn_user_id: authzData.authn_user.user_id,
    });

    return deletedEnrollment;
  });
}

/**
 * Invites an enrollment by id, given a pending uid.
 */
export async function inviteEnrollment({
  enrollment_id,
  pending_uid,
  context,
}: {
  enrollment_id: string;
  pending_uid: string;
  context: EnrollmentContext;
}): Promise<Enrollment> {
  return await runInTransactionAsync(async () => {
    const enrollment = await selectAndLockEnrollment(enrollment_id);
    if (enrollment.user_id) {
      await selectAndLockUser(enrollment.user_id);
    }

    return await inviteExistingEnrollmentLocked({
      enrollment_id,
      pending_uid,
      context,
    });
  });
}
