import { assert } from 'chai';
import fetch from 'node-fetch';
import { z } from 'zod';
import { queryRow } from '@prairielearn/postgres';

// Must be imported so that `config.serverPort` is set.
import '../helperServer';
import { config } from '../../lib/config';
import { AuthUser, withUser } from './auth';
import { getCsrfToken } from './csrf';

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';

export async function enrollUser(courseInstanceId: string, user: AuthUser) {
  return await withUser(user, async () => {
    const url = baseUrl + '/enroll';
    return await fetch(url, {
      method: 'POST',
      body: new URLSearchParams({
        course_instance_id: courseInstanceId,
        __action: 'enroll',
        __csrf_token: await getCsrfToken(url),
      }),
    });
  });
}

export async function unenrollUser(courseInstanceId: string, user: AuthUser) {
  return await withUser(user, async () => {
    const url = baseUrl + '/enroll';
    return await fetch(url, {
      method: 'POST',
      body: new URLSearchParams({
        course_instance_id: courseInstanceId,
        __action: 'unenroll',
        __csrf_token: await getCsrfToken(url),
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
    const res = await enrollUser(courseInstanceId, {
      name: `Student ${i}`,
      uid: `student${number}@example.com`,
      uin: `student-${i}`,
    });
    assert.isOk(res.ok);
  }
}
