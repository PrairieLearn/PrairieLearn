import crypto from 'node:crypto';

import { loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';

import { getOrCreateUser } from '../../tests/utils/auth.js';
import {
  type CourseInstance,
  type Enrollment,
  EnrollmentSchema,
  type EnumEnrollmentStatus,
  Lti13CourseInstanceSchema,
  type User,
} from '../db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export const OTHER_INSTITUTION_ID = '900001';

export function uniqueTestValue(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export async function createUser({
  prefix,
  uin = uniqueTestValue(`${prefix}-uin`),
  institutionId,
}: {
  institutionId?: string;
  prefix: string;
  uin?: string;
}): Promise<User> {
  const uid = `${uniqueTestValue(prefix)}@${
    institutionId === OTHER_INSTITUTION_ID ? 'other.example' : 'example.com'
  }`;
  return await getOrCreateUser({
    email: uid,
    institutionId,
    name: prefix,
    uid,
    uin,
  });
}

export async function createEnrollment({
  courseInstance,
  userId = null,
  status = 'invited',
  firstJoinedAt = null,
  isGuest = false,
  pendingUid = null,
  pendingUin = null,
  pendingName = null,
  pendingEmail = null,
  pendingLti13CourseInstanceId = null,
  pendingLti13Sub = null,
}: {
  courseInstance: CourseInstance;
  firstJoinedAt?: Date | null;
  isGuest?: boolean;
  pendingEmail?: string | null;
  pendingLti13CourseInstanceId?: string | null;
  pendingLti13Sub?: string | null;
  pendingName?: string | null;
  pendingUid?: string | null;
  pendingUin?: string | null;
  status?: EnumEnrollmentStatus;
  userId?: string | null;
}): Promise<Enrollment> {
  return await queryRow(
    sql.insert_enrollment,
    {
      course_instance_id: courseInstance.id,
      first_joined_at: firstJoinedAt,
      is_guest: isGuest,
      pending_email: pendingEmail,
      pending_lti13_course_instance_id: pendingLti13CourseInstanceId,
      pending_lti13_sub: pendingLti13Sub,
      pending_name: pendingName,
      pending_uid: pendingUid,
      pending_uin: pendingUin,
      status,
      user_id: userId,
    },
    EnrollmentSchema,
  );
}

export async function selectEnrollments(enrollmentIds: string[]): Promise<Enrollment[]> {
  return await queryRows(
    sql.select_enrollments_by_ids,
    { enrollment_ids: enrollmentIds },
    EnrollmentSchema,
  );
}

export async function createLti13CourseInstance(
  courseInstance: CourseInstance,
): Promise<{ id: string }> {
  const identity = uniqueTestValue('lti-link');
  return await queryRow(
    sql.insert_lti13_course_instance,
    {
      context_id: `${identity}-context`,
      course_instance_id: courseInstance.id,
      deployment_id: `${identity}-deployment`,
    },
    Lti13CourseInstanceSchema.pick({ id: true }),
  );
}
