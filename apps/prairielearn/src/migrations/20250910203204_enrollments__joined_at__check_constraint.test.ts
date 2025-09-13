import { test } from 'vitest';
import z from 'zod';

import { loadSqlEquiv } from '@prairielearn/postgres';
import * as sqldb from '@prairielearn/postgres';

import { IdSchema } from '../lib/db-types.js';
import { insertCourse } from '../models/course.js';
import { testMigration } from '../tests/helperDb.js';

const sql = loadSqlEquiv(import.meta.url);

const enrollUser = async ({
  uin,
  courseInstanceId,
  status,
  created_at,
  joined_at,
  pending_uid,
}: {
  uin: string;
  courseInstanceId: string;
  status: string;
  created_at: string | null;
  joined_at: string | null;
  pending_uid: string | null;
}) => {
  const user = await sqldb.queryRow(
    sql.insert_user,
    {
      uid: uin + '@example.com',
      name: 'Example Student',
      uin,
      email: 'student@example.com',
      institution_id: '1',
    },
    z.any(),
  );
  const enrollment = await sqldb.queryRow(
    sql.enroll_user,
    {
      // We can't have a pending_uid and a user_id at the same time.
      user_id: pending_uid ? null : user.user_id,
      course_instance_id: courseInstanceId,
      status,
      created_at,
      joined_at,
      pending_uid,
    },
    z.any(),
  );
  return enrollment;
};

test('joined_at check constraint works correctly', { timeout: 20_000 }, async () => {
  await testMigration({
    name: '20250910203204_enrollments__joined_at__check_constraint',
    beforeMigration: async () => {
      const course = await insertCourse({
        institution_id: '1',
        short_name: 'test',
        title: 'Test Course',
        display_timezone: 'America/Chicago',
        path: 'test',
        repository: 'test',
        branch: 'test',
        authn_user_id: '1',
      });

      const courseInstanceId = await sqldb.queryRow(
        sql.insert_course_instance,
        {
          course_id: course.id,
          display_timezone: 'America/Chicago',
        },
        IdSchema,
      );

      const validStates = [
        // created_at is null
        ['created_at_null_1', courseInstanceId, 'joined', null, null, null],
        [
          'created_at_null_2',
          courseInstanceId,
          'invited',
          null,
          '2025-01-01',
          'created_at_null_2@example.com',
        ],
        // status is not 'joined', joined_at is not null
        [
          'not_joined_1',
          courseInstanceId,
          'invited',
          null,
          '2025-01-01',
          'not_joined_1@example.com',
        ],
        // status is not 'joined', joined_at is null
        [
          'not_joined_2',
          courseInstanceId,
          'invited',
          '2025-01-01',
          null,
          'not_joined_2@example.com',
        ],
        // status is 'joined', created_at is not null, joined_at is not null
        ['joined_1', courseInstanceId, 'joined', '2025-01-01', '2025-01-01', null],
      ] as const;
      for (const [
        uin,
        courseInstanceId,
        status,
        created_at,
        joined_at,
        pending_uid,
      ] of validStates) {
        await enrollUser({
          uin,
          courseInstanceId,
          status,
          created_at,
          joined_at,
          pending_uid,
        });
      }
    },
  });
});
