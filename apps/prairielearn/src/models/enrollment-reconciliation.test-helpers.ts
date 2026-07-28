import crypto from 'node:crypto';

import { loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';

import {
  type CourseInstance,
  type Enrollment,
  EnrollmentSchema,
  type EnumEnrollmentStatus,
  Lti13CourseInstanceSchema,
  type User,
} from '../lib/db-types.js';
import { getOrCreateUser } from '../tests/utils/auth.js';

import { selectAuditEventsByEnrollmentId } from './audit-event.js';

const sql = loadSqlEquiv(import.meta.url);

export const OTHER_INSTITUTION_ID = '900001';

let fixtureCounter = 0;

export function nextFixtureName(prefix: string): string {
  fixtureCounter += 1;
  return `${prefix}-${fixtureCounter}-${crypto.randomUUID()}`;
}

export function nextFixtureNumber(): number {
  fixtureCounter += 1;
  return fixtureCounter;
}

export async function createUser({
  prefix,
  uin = nextFixtureName(`${prefix}-uin`),
  institutionId,
}: {
  institutionId?: string;
  prefix: string;
  uin?: string;
}): Promise<User> {
  const uid = `${nextFixtureName(prefix)}@${
    institutionId === OTHER_INSTITUTION_ID ? 'other.example' : 'example.com'
  }`;
  return await getOrCreateUser({
    uid,
    name: prefix,
    uin,
    email: uid,
    institutionId,
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
  const identity = nextFixtureName('lti-link');
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

export async function selectReconciliationAuditEvents(enrollmentId: string) {
  const events = await selectAuditEventsByEnrollmentId({
    enrollment_id: enrollmentId,
    table_names: ['enrollments'],
  });
  return events.filter(
    (event) =>
      (event.context as Record<string, unknown> | null)?.reason === 'identity_reconciliation',
  );
}

export function actorFor(user: User) {
  return {
    agentAuthnUserId: user.id,
    agentUserId: user.id,
  };
}
