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
import { type StaffEnrollment, StaffEnrollmentSchema } from '../lib/client/safe-db-types.js';
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

import { insertAuditEvent } from './audit-event.js';
import { generateUsers, selectUserById } from './user.js';

const sql = loadSqlEquiv(import.meta.url);

export async function enrollInvitedUserInCourseInstance({
  course_instance_id,
  user_id,
  pending_uid,
}: {
  course_instance_id: string;
  user_id: string;
  pending_uid: string;
}): Promise<Enrollment> {
  return await queryRow(
    sql.enroll_invited_user_in_course_instance,
    {
      course_instance_id,
      pending_uid,
      user_id,
    },
    EnrollmentSchema,
  );
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
}: {
  course_instance_id: string;
  user_id: string;
}): Promise<Enrollment | null> {
  return await runInTransactionAsync(async () => {
    const user = await selectUserById(user_id);
    const enrollment = await getEnrollmentForUserInCourseInstanceByPendingUid({
      course_instance_id,
      pending_uid: user.uid,
    });

    if (enrollment && enrollment.status === 'invited') {
      const updated = await enrollInvitedUserInCourseInstance({
        course_instance_id,
        user_id,
        pending_uid: user.uid,
      });

      await insertAuditEvent({
        table_name: 'enrollments',
        action: 'update',
        // The user implicitly joined to the course instance, probably by clicking a link.
        action_detail: 'implicit_joined',
        row_id: updated.id,
        old_row: enrollment,
        new_row: updated,
        // This is done by the system
        agent_user_id: null,
        agent_authn_user_id: null,
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
        row_id: inserted.id,
        new_row: inserted,
        // This is done by the system
        agent_user_id: null,
        agent_authn_user_id: null,
      });
    }
    return inserted;
  });
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
}: {
  institution: Institution;
  course: Course;
  course_instance: CourseInstance;
  authz_data: any;
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
  });
}

export async function getEnrollmentForUserInCourseInstance({
  user_id,
  course_instance_id,
}): Promise<Enrollment | null> {
  return await queryOptionalRow(
    sql.select_enrollment_for_user_in_course_instance,
    { user_id, course_instance_id },
    EnrollmentSchema,
  );
}

export async function getEnrollmentForUserInCourseInstanceByPendingUid({
  pending_uid,
  course_instance_id,
}): Promise<Enrollment | null> {
  return await queryOptionalRow(
    sql.select_enrollment_for_user_in_course_instance_by_pending_uid,
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
      await ensureEnrollment({ course_instance_id, user_id: user.user_id });
    }
    return users;
  });
}

export async function selectEnrollmentById({ id }: { id: string }) {
  return await queryRow(sql.select_enrollment_by_id, { id }, EnrollmentSchema);
}

export async function selectEnrollmentByUid({
  course_instance_id,
  uid,
}: {
  course_instance_id: string;
  uid: string;
}) {
  return await queryRow(
    sql.select_enrollment_by_uid,
    { course_instance_id, uid },
    StaffEnrollmentSchema,
  );
}

export async function inviteStudentByUid({
  course_instance_id,
  uid,
  existing_enrollment_id,
  agent_user_id,
  agent_authn_user_id,
}: {
  course_instance_id: string;
  uid: string;
  existing_enrollment_id: string | null;
  agent_user_id: string | null;
  agent_authn_user_id: string | null;
}): Promise<StaffEnrollment> {
  return await runInTransactionAsync(async () => {
    const enrollment = await queryRow(
      sql.upsert_enrollment_invitation_by_uid,
      {
        course_instance_id,
        uid,
      },
      EnrollmentSchema,
    );
    let old_row: Enrollment | null = null;
    if (existing_enrollment_id) {
      old_row = await selectEnrollmentById({ id: existing_enrollment_id });
    }
    await insertAuditEvent({
      table_name: 'enrollments',
      action: existing_enrollment_id ? 'update' : 'insert',
      row_id: enrollment.id,
      subject_user_id: null,
      new_row: enrollment,
      old_row,
      agent_user_id,
      agent_authn_user_id,
    });
    return StaffEnrollmentSchema.parse(enrollment);
  });
}
