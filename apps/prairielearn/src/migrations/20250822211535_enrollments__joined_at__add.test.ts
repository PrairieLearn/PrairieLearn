/**
 * This is a example test for a migration that adds a new column to the database.
 *
 * We typically don't need to test migrations other than backfills and constraint changes.
 *
 * TODO: Delete this test
 */
import { assert, test } from 'vitest';
import z from 'zod';

import { callRow, loadSqlEquiv } from '@prairielearn/postgres';
import * as sqldb from '@prairielearn/postgres';

import { IdSchema } from '../lib/db-types.js';
import { insertCourse } from '../models/course.js';
import { testMigration } from '../tests/helperDb.js';

const sql = loadSqlEquiv(import.meta.url);

test('joined_at migration works correctly', { timeout: 20_000 }, async () => {
  await testMigration({
    name: '20250822211535_enrollments__joined_at__add',
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
      const user = await callRow(
        'users_select_or_insert',
        ['student@example.com', 'Example Student', 'student', 'student@example.com', 'dev'],
        // The sproc returns multiple columns, but we only use the ID.
        z.object({ user_id: IdSchema }),
      );

      await sqldb.execute(sql.old_ensure_enrollment, {
        user_id: user.user_id,
        course_instance_id: courseInstanceId,
      });

      await sqldb.execute(sql.old_ensure_enrollment, {
        user_id: user.user_id,
        course_instance_id: courseInstanceId,
      });

      const enrollment = await sqldb.queryRow(
        sql.select_enrollment_for_user_in_course_instance,
        {
          course_instance_id: courseInstanceId,
          user_id: user.user_id,
        },
        z.any(),
      );

      assert.isUndefined(enrollment.joined_at);

      return { user, courseInstanceId };
    },
    afterMigration: async ({ user, courseInstanceId }) => {
      await sqldb.execute(sql.old_ensure_enrollment, {
        user_id: user.user_id,
        course_instance_id: courseInstanceId,
      });
      const migratedEnrollment = await sqldb.queryRow(
        sql.select_enrollment_for_user_in_course_instance,
        {
          course_instance_id: courseInstanceId,
          user_id: user.user_id,
        },
        z.any(),
      );

      assert.isDefined(migratedEnrollment.joined_at);
    },
  });
});
