import assert from 'node:assert';

import * as error from '@prairielearn/error';
import {
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import {
  PotentialEnterpriseEnrollmentStatus,
  checkPotentialEnterpriseEnrollment,
} from '../ee/models/enrollment.js';
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
import { generateUsers, selectAndLockUserById } from './user.js';

const sql = loadSqlEquiv(import.meta.url);

export async function enrollUserInCourseInstance({
  enrollment_id,
  user_id,
  agent_user_id,
  agent_authn_user_id,
  action_detail,
}: {
  enrollment_id: string;
  user_id: string;
  agent_user_id: string | null;
  agent_authn_user_id: string | null;
  action_detail: SupportedActionsForTable<'enrollments'>;
}): Promise<Enrollment> {
  return await runInTransactionAsync(async () => {
    await selectAndLockEnrollmentById(enrollment_id);
    return await dangerouslyEnrollUserInCourseInstance({
      enrollment_id,
      user_id,
      agent_user_id,
      agent_authn_user_id,
      action_detail,
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
  agent_user_id,
  agent_authn_user_id,
  action_detail,
}: {
  enrollment_id: string;
  user_id: string;
  agent_user_id: string | null;
  agent_authn_user_id: string | null;
  action_detail: SupportedActionsForTable<'enrollments'>;
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
    agent_user_id,
    agent_authn_user_id,
  });

  return newEnrollment;
}

/**
 * Ensures that the user is enrolled in the given course instance. If the
 * enrollment already exists, this is a no-op.
 *
 * If the user was invited to the course instance, this will set the
 * enrollment status to 'joined'.
 */
export async function ensureEnrollment({
  course_instance_id,
  user_id,
  agent_user_id,
  agent_authn_user_id,
  action_detail,
}: {
  course_instance_id: string;
  user_id: string;
  agent_user_id: string | null;
  agent_authn_user_id: string | null;
  action_detail: SupportedActionsForTable<'enrollments'>;
}): Promise<Enrollment | null> {
  const result = await runInTransactionAsync(async () => {
    const user = await selectAndLockUserById(user_id);
    const enrollment = await selectOptionalEnrollmentByPendingUid({
      course_instance_id,
      pending_uid: user.uid,
    });

    if (enrollment) {
      await selectAndLockEnrollmentById(enrollment.id);
    }

    if (enrollment && enrollment.status === 'invited') {
      const updated = await dangerouslyEnrollUserInCourseInstance({
        enrollment_id: enrollment.id,
        user_id,
        agent_user_id,
        agent_authn_user_id,
        action_detail,
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
        agent_user_id,
        agent_authn_user_id,
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
  authz_data: any;
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
    agent_user_id: authz_data.authn_user.user_id,
    agent_authn_user_id: authz_data.user.id,
    action_detail,
  });
}

export async function selectOptionalEnrollmentByUserId({
  user_id,
  course_instance_id,
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
}: {
  count: number;
  course_instance_id: string;
}) {
  return await runInTransactionAsync(async () => {
    const users = await generateUsers(count);
    for (const user of users) {
      await ensureEnrollment({
        course_instance_id,
        user_id: user.user_id,
        // This is done by the system
        agent_user_id: null,
        agent_authn_user_id: null,
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
async function dangerouslyInviteExistingEnrollment({
  enrollment_id,
  agent_user_id,
  pending_uid,
  agent_authn_user_id,
}: {
  enrollment_id: string;
  agent_user_id: string | null;
  pending_uid: string;
  agent_authn_user_id: string | null;
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
    agent_user_id,
    agent_authn_user_id,
  });

  return newEnrollment;
}

async function inviteNewEnrollment({
  course_instance_id,
  pending_uid,
  agent_user_id,
  agent_authn_user_id,
}: {
  course_instance_id: string;
  pending_uid: string;
  agent_user_id: string | null;
  agent_authn_user_id: string | null;
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
    agent_user_id,
    agent_authn_user_id,
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
  agent_user_id,
  agent_authn_user_id,
}: {
  course_instance_id: string;
  uid: string;
  agent_user_id: string | null;
  agent_authn_user_id: string | null;
}): Promise<Enrollment> {
  return await runInTransactionAsync(async () => {
    const existingEnrollment = await selectOptionalEnrollmentByUid({
      course_instance_id,
      uid,
    });

    if (existingEnrollment) {
      if (existingEnrollment.user_id) {
        await selectAndLockUserById(existingEnrollment.user_id);
      }
      await selectAndLockEnrollmentById(existingEnrollment.id);
      return await dangerouslyInviteExistingEnrollment({
        enrollment_id: existingEnrollment.id,
        agent_user_id,
        pending_uid: uid,
        agent_authn_user_id,
      });
    }

    return await inviteNewEnrollment({
      course_instance_id,
      pending_uid: uid,
      agent_user_id,
      agent_authn_user_id,
    });
  });
}

export async function selectAndLockEnrollmentById(id: string) {
  return await queryRow(sql.select_and_lock_enrollment_by_id, { id }, EnrollmentSchema);
}

/**
 * Sets the status of an enrollment.
 * This function updates the enrollment status without any additional WHERE clauses
 * for course_instance_id or current status.
 *
 * The function will lock the enrollment row and create an audit event based on the status change.
 */
export async function setEnrollmentStatusBlocked({
  enrollment_id,
  agent_user_id,
  agent_authn_user_id,
}: {
  enrollment_id: string;
  agent_user_id: string | null;
  agent_authn_user_id: string | null;
}): Promise<Enrollment> {
  return await runInTransactionAsync(async () => {
    const oldEnrollment = await selectAndLockEnrollmentById(enrollment_id);
    if (oldEnrollment.user_id) {
      await selectAndLockUserById(oldEnrollment.user_id);
    }

    const newEnrollment = await queryRow(
      sql.set_enrollment_status,
      { enrollment_id, status: 'blocked' },
      EnrollmentSchema,
    );

    await insertAuditEvent({
      table_name: 'enrollments',
      action: 'update',
      action_detail: 'blocked',
      row_id: newEnrollment.id,
      old_row: oldEnrollment,
      new_row: newEnrollment,
      agent_user_id,
      agent_authn_user_id,
    });

    return newEnrollment;
  });
}

/**
 * Deletes an enrollment.
 */
export async function deleteEnrollmentById({
  enrollment_id,
  agent_user_id,
  agent_authn_user_id,
}: {
  enrollment_id: string;
  agent_user_id: string | null;
  agent_authn_user_id: string | null;
}): Promise<Enrollment> {
  return await runInTransactionAsync(async () => {
    const oldEnrollment = await selectAndLockEnrollmentById(enrollment_id);

    const deletedEnrollment = await queryRow(
      sql.delete_enrollment_by_id,
      { enrollment_id },
      EnrollmentSchema,
    );

    await insertAuditEvent({
      table_name: 'enrollments',
      action: 'delete',
      action_detail: 'invitation_deleted',
      row_id: deletedEnrollment.id,
      old_row: oldEnrollment,
      new_row: null,
      agent_user_id,
      agent_authn_user_id,
    });

    return deletedEnrollment;
  });
}
