import { escapeRegExp } from 'es-toolkit';
import { z } from 'zod';

import { callRow, execute, loadSqlEquiv, queryOptionalRow, queryRow } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { config } from '../../lib/config.js';
import { InstitutionSchema, type User, UserSchema } from '../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export interface AuthUser {
  name: string | null;
  uid: string;
  uin: string | null;
  email?: string | null;
  institutionId?: string;
}

export async function withUser<T>(user: AuthUser, fn: () => Promise<T>): Promise<T> {
  const originalName = config.authName;
  const originalUid = config.authUid;
  const originalUin = config.authUin;
  const originalEmail = config.authEmail;

  try {
    config.authName = user.name;
    config.authUid = user.uid;
    config.authUin = user.uin;
    config.authEmail = user.email ?? null;

    return await fn();
  } finally {
    config.authName = originalName;
    config.authUid = originalUid;
    config.authUin = originalUin;
    config.authEmail = originalEmail;
  }
}

export async function getConfiguredUser(): Promise<User> {
  if (!config.authUid || !config.authName || !config.authUin || !config.authEmail) {
    throw new Error('No configured user');
  }

  return await getOrCreateUser({
    uid: config.authUid,
    name: config.authName,
    uin: config.authUin,
    email: config.authEmail,
  });
}

export async function getOrCreateUser(authUser: AuthUser): Promise<User> {
  const user = await callRow(
    'users_select_or_insert',
    [
      authUser.uid,
      authUser.name,
      authUser.uin,
      authUser.email,
      'dev',
      authUser.institutionId || null,
    ],
    // The sproc returns multiple columns, but we only use the ID.
    z.object({ user_id: IdSchema }),
  );
  return await queryRow('SELECT * FROM users WHERE id = $id', { id: user.user_id }, UserSchema);
}

/** Helper function to create institutions for testing */
export async function createInstitution(id: string, shortName: string, longName: string) {
  await queryOptionalRow(
    sql.create_institution,
    {
      id,
      short_name: shortName,
      long_name: longName,
      uid_regexp: `@${escapeRegExp(shortName)}$`,
    },
    InstitutionSchema,
  );
}

/** Helper function to update course instance settings */
export async function updateCourseInstanceSettings(
  courseInstanceId: string,
  options: {
    selfEnrollmentEnabled: boolean;
    restrictToInstitution: boolean;
    selfEnrollmentUseEnrollmentCode: boolean;
  },
) {
  await execute(sql.update_course_instance_settings, {
    course_instance_id: courseInstanceId,
    self_enrollment_enabled: options.selfEnrollmentEnabled,
    restrict_to_institution: options.restrictToInstitution,
    self_enrollment_use_enrollment_code: options.selfEnrollmentUseEnrollmentCode,
  });
}

/** Helper function to delete enrollments in a course instance for testing */
export async function deleteEnrollmentsInCourseInstance(courseInstanceId: string) {
  await execute(sql.delete_enrollments_in_course_instance, {
    course_instance_id: courseInstanceId,
  });
}
