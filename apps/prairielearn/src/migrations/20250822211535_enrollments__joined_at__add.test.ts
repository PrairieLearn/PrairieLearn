import { assert, test } from 'vitest';
import z from 'zod';

import { loadSqlEquiv } from '@prairielearn/postgres';
import * as sqldb from '@prairielearn/postgres';

import * as helperCourse from '../tests/helperCourse.js';
import {
  runAllMigrationsBefore,
  runAllMigrationsIncluding,
  runRemainingMigrations,
} from '../tests/helperDb.js';
import { getOrCreateUser } from '../tests/utils/auth.js';

const sql = loadSqlEquiv(import.meta.url);

test('joined_at migration works correctly', async () => {
  await runAllMigrationsBefore('20250822211535_enrollments__joined_at__add', {
    drop: true,
  });
  await helperCourse.syncCourse();

  const user = await getOrCreateUser({
    uid: 'student@example.com',
    name: 'Example Student',
    uin: 'student',
    email: 'student@example.com',
  });

  await sqldb.execute(sql.old_ensure_enrollment, {
    user_id: user.user_id,
    course_instance_id: '1',
  });
  const enrollment = await sqldb.queryRow(
    sql.select_enrollment_for_user_in_course_instance,
    {
      course_instance_id: '1',
      user_id: user.user_id,
    },
    z.any(),
  );

  assert.isUndefined(enrollment.foobar);
  assert.isUndefined(enrollment.joined_at);

  await runAllMigrationsIncluding('20250822211535_enrollments__joined_at__add');

  const migratedEnrollment = await sqldb.queryRow(
    sql.select_enrollment_for_user_in_course_instance,
    {
      course_instance_id: '1',
      user_id: user.user_id,
    },
    z.any(),
  );

  assert.isDefined(migratedEnrollment.joined_at);
  await runRemainingMigrations();
});
