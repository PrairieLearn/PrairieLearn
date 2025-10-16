import { z } from 'zod';

import { callRow, execute, queryOptionalRow, queryRow } from '@prairielearn/postgres';

import { config } from '../../lib/config.js';
import { IdSchema, type User, UserSchema } from '../../lib/db-types.js';

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
  return await queryRow(
    'SELECT * FROM users WHERE user_id = $id',
    { id: user.user_id },
    UserSchema,
  );
}

/** Helper function to create institutions for testing */
export async function createInstitution(id: string, shortName: string, longName: string) {
  await queryOptionalRow(
    `INSERT INTO institutions (id, short_name, long_name, uid_regexp)
     VALUES ($id, $short_name, $long_name, $uid_regexp)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    {
      id,
      short_name: shortName,
      long_name: longName,
      uid_regexp: `@${shortName}$`,
    },
    z.object({ id: z.string() }),
  );
}

/** Helper function to update course instance settings */
export async function updateCourseInstanceSettings(
  courseInstanceId: string,
  options: {
    selfEnrollmentEnabled: boolean;
    restrictToInstitution?: boolean;
    selfEnrollmentUseEnrollmentCode?: boolean;
  },
) {
  const updates: string[] = ['self_enrollment_enabled = $self_enrollment_enabled'];
  const params: Record<string, any> = {
    course_instance_id: courseInstanceId,
    self_enrollment_enabled: options.selfEnrollmentEnabled,
  };

  if (options.restrictToInstitution !== undefined) {
    updates.push('self_enrollment_restrict_to_institution = $restrict_to_institution');
    params.restrict_to_institution = options.restrictToInstitution;
  }

  if (options.selfEnrollmentUseEnrollmentCode !== undefined) {
    updates.push('self_enrollment_use_enrollment_code = $self_enrollment_use_enrollment_code');
    params.self_enrollment_use_enrollment_code = options.selfEnrollmentUseEnrollmentCode;
  }

  await execute(
    `UPDATE course_instances 
     SET ${updates.join(', ')}
     WHERE id = $course_instance_id`,
    params,
  );
}

/** Helper function to delete enrollments in a course instance for testing */
export async function deleteEnrollmentsInCourseInstance(courseInstanceId: string) {
  await execute('DELETE FROM enrollments WHERE course_instance_id = $course_instance_id', {
    course_instance_id: courseInstanceId,
  });
}
