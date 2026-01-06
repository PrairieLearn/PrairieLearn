import fetch from 'node-fetch';
import { z } from 'zod';

import { queryRow } from '@prairielearn/postgres';

// Must be imported so that `config.serverPort` is set.
import '../helperServer';
import { type PotentialEnterpriseEnrollmentStatus } from '../../ee/models/enrollment.js';
import { constructCourseOrInstanceContext } from '../../lib/authz-data.js';
import { config } from '../../lib/config.js';
import { ensureEnrollment } from '../../models/enrollment.js';

import { type AuthUser, getOrCreateUser, withUser } from './auth.js';
import { getCsrfToken } from './csrf.js';

const siteUrl = 'http://localhost:' + config.serverPort;

/**
 * Enroll a user in a course instance.
 *
 * Returns the potential enterprise enrollment status.
 */
export async function enrollUser(
  courseInstanceId: string,
  user: AuthUser,
): Promise<PotentialEnterpriseEnrollmentStatus> {
  const dbUser = await getOrCreateUser(user);

  const context = await constructCourseOrInstanceContext({
    user: dbUser,
    course_id: null,
    course_instance_id: courseInstanceId,
    ip: null,
    req_date: new Date(),
    is_administrator: false,
  });

  if (context.courseInstance === null) {
    throw new Error(`Course instance ${courseInstanceId} not found`);
  }

  const { authzData, course, institution, courseInstance } = context;

  const status = await ensureEnrollment({
    institution,
    course,
    courseInstance,
    requiredRole: ['Student'],
    authzData,
    throwOnIneligible: false,
    actionDetail: 'implicit_joined',
  });

  if (status === undefined) {
    throw new Error('Enrollment failed for unknown reasons');
  }

  return status;
}

export async function unenrollUser(courseInstanceId: string, user: AuthUser) {
  return await withUser(user, async () => {
    const homeUrl = siteUrl;
    return await fetch(homeUrl, {
      method: 'POST',
      body: new URLSearchParams({
        course_instance_id: courseInstanceId,
        __action: 'unenroll',
        __csrf_token: await getCsrfToken(homeUrl),
      }),
    });
  });
}

export async function enrollRandomUsers(courseInstanceId: string, count: number) {
  // Get current number of enrolled students.
  const currentCount = await queryRow(
    'SELECT COUNT(*)::integer FROM enrollments WHERE course_instance_id = $id',
    { id: courseInstanceId },
    z.number(),
  );
  for (let i = 0; i < count; i++) {
    const number = currentCount + i + 1;
    await enrollUser(courseInstanceId, {
      name: `Student ${i}`,
      uid: `student${number}@example.com`,
      uin: `student-${i}`,
      email: `student${number}@example.com`,
    });
  }
}
