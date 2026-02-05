import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import * as helperDb from '../tests/helperDb.js';

import migration from './20260204120004_assessment_instances__number__backfill.js';

describe('assessment_instances number backfill migration', () => {
  beforeAll(helperDb.before);
  afterAll(helperDb.after);

  it('backfills NULL number values per user/assessment', async () => {
    // Create course
    const courseId = await sqldb.queryRow(
      `INSERT INTO courses (path, short_name, title, display_timezone, institution_id)
       VALUES ('test', 'TEST', 'Test Course', 'America/Chicago', 1) RETURNING id`,
      {},
      IdSchema,
    );

    // Create course instance
    const courseInstanceId = await sqldb.queryRow(
      `INSERT INTO course_instances (course_id, display_timezone, enrollment_code)
       VALUES ($course_id, 'America/Chicago', 'test123') RETURNING id`,
      { course_id: courseId },
      IdSchema,
    );

    // Create assessment
    const assessmentId = await sqldb.queryRow(
      `INSERT INTO assessments (course_instance_id, type)
       VALUES ($course_instance_id, 'Homework') RETURNING id`,
      { course_instance_id: courseInstanceId },
      IdSchema,
    );

    // Create user
    const userId = await sqldb.queryRow(
      `INSERT INTO users (uid, name, institution_id)
       VALUES ('test@example.com', 'Test User', 1) RETURNING id`,
      {},
      IdSchema,
    );

    // Insert assessment instances: two with numbers, two without
    await sqldb.execute(
      `INSERT INTO assessment_instances (assessment_id, user_id, number)
       VALUES ($assessment_id, $user_id, 1),
              ($assessment_id, $user_id, 3),
              ($assessment_id, $user_id, NULL),
              ($assessment_id, $user_id, NULL)`,
      { assessment_id: assessmentId, user_id: userId },
    );

    await migration.execute(1n, 10000n);

    const instances = await sqldb.queryRows(
      `SELECT id, number FROM assessment_instances
       WHERE assessment_id = $assessment_id AND user_id = $user_id
       ORDER BY id`,
      { assessment_id: assessmentId, user_id: userId },
      z.object({ id: IdSchema, number: z.number().nullable() }),
    );

    expect(instances.map((i) => i.number)).toEqual([1, 3, 4, 5]);
  });

  it('does not change existing number values', async () => {
    const courseId = await sqldb.queryRow(
      `INSERT INTO courses (path, short_name, title, display_timezone, institution_id)
       VALUES ('test2', 'TEST2', 'Test Course 2', 'America/Chicago', 1) RETURNING id`,
      {},
      IdSchema,
    );

    const courseInstanceId = await sqldb.queryRow(
      `INSERT INTO course_instances (course_id, display_timezone, enrollment_code)
       VALUES ($course_id, 'America/Chicago', 'test456') RETURNING id`,
      { course_id: courseId },
      IdSchema,
    );

    const assessmentId = await sqldb.queryRow(
      `INSERT INTO assessments (course_instance_id, type)
       VALUES ($course_instance_id, 'Homework') RETURNING id`,
      { course_instance_id: courseInstanceId },
      IdSchema,
    );

    const userId = await sqldb.queryRow(
      `INSERT INTO users (uid, name, institution_id)
       VALUES ('test2@example.com', 'Test User 2', 1) RETURNING id`,
      {},
      IdSchema,
    );

    await sqldb.execute(
      `INSERT INTO assessment_instances (assessment_id, user_id, number)
       VALUES ($assessment_id, $user_id, 1),
              ($assessment_id, $user_id, 3)`,
      { assessment_id: assessmentId, user_id: userId },
    );

    await migration.execute(1n, 10000n);

    const instances = await sqldb.queryRows(
      `SELECT id, number FROM assessment_instances
       WHERE assessment_id = $assessment_id AND user_id = $user_id
       ORDER BY id`,
      { assessment_id: assessmentId, user_id: userId },
      z.object({ id: IdSchema, number: z.number().nullable() }),
    );

    expect(instances.map((i) => i.number)).toEqual([1, 3]);
  });

  it('assigns numbers starting from 1 when all are NULL', async () => {
    const courseId = await sqldb.queryRow(
      `INSERT INTO courses (path, short_name, title, display_timezone, institution_id)
       VALUES ('test3', 'TEST3', 'Test Course 3', 'America/Chicago', 1) RETURNING id`,
      {},
      IdSchema,
    );

    const courseInstanceId = await sqldb.queryRow(
      `INSERT INTO course_instances (course_id, display_timezone, enrollment_code)
       VALUES ($course_id, 'America/Chicago', 'test789') RETURNING id`,
      { course_id: courseId },
      IdSchema,
    );

    const assessmentId = await sqldb.queryRow(
      `INSERT INTO assessments (course_instance_id, type)
       VALUES ($course_instance_id, 'Homework') RETURNING id`,
      { course_instance_id: courseInstanceId },
      IdSchema,
    );

    const userId = await sqldb.queryRow(
      `INSERT INTO users (uid, name, institution_id)
       VALUES ('test3@example.com', 'Test User 3', 1) RETURNING id`,
      {},
      IdSchema,
    );

    await sqldb.execute(
      `INSERT INTO assessment_instances (assessment_id, user_id, number)
       VALUES ($assessment_id, $user_id, NULL),
              ($assessment_id, $user_id, NULL)`,
      { assessment_id: assessmentId, user_id: userId },
    );

    await migration.execute(1n, 10000n);

    const instances = await sqldb.queryRows(
      `SELECT id, number FROM assessment_instances
       WHERE assessment_id = $assessment_id AND user_id = $user_id
       ORDER BY id`,
      { assessment_id: assessmentId, user_id: userId },
      z.object({ id: IdSchema, number: z.number().nullable() }),
    );

    expect(instances.map((i) => i.number)).toEqual([1, 2]);
  });
});
