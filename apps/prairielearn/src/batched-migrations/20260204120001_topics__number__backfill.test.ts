import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import * as helperDb from '../tests/helperDb.js';

import migration from './20260204120001_topics__number__backfill.js';

describe('topics number backfill migration', () => {
  beforeAll(helperDb.before);
  afterAll(helperDb.after);

  it('backfills NULL number values sequentially per course', async () => {
    const courseId = await sqldb.queryRow(
      `INSERT INTO courses (path, short_name, title, display_timezone, institution_id)
       VALUES ('test', 'TEST', 'Test Course', 'America/Chicago', 1) RETURNING id`,
      {},
      IdSchema,
    );

    // Insert topics: two with numbers, two without
    await sqldb.execute(
      `INSERT INTO topics (course_id, name, color, description, number)
       VALUES ($course_id, 'Topic A', '#000', '', 1),
              ($course_id, 'Topic B', '#000', '', 5),
              ($course_id, 'Topic C', '#000', '', NULL),
              ($course_id, 'Topic D', '#000', '', NULL)`,
      { course_id: courseId },
    );

    await migration.execute(1n, 10000n);

    const topics = await sqldb.queryRows(
      'SELECT name, number FROM topics WHERE course_id = $course_id ORDER BY name',
      { course_id: courseId },
      z.object({ name: z.string(), number: z.number().nullable() }),
    );

    expect(topics).toEqual([
      { name: 'Topic A', number: 1 },
      { name: 'Topic B', number: 5 },
      { name: 'Topic C', number: 6 }, // max(5) + 1
      { name: 'Topic D', number: 7 }, // max(5) + 2
    ]);
  });

  it('does not change existing number values', async () => {
    const courseId = await sqldb.queryRow(
      `INSERT INTO courses (path, short_name, title, display_timezone, institution_id)
       VALUES ('test2', 'TEST2', 'Test Course 2', 'America/Chicago', 1) RETURNING id`,
      {},
      IdSchema,
    );

    await sqldb.execute(
      `INSERT INTO topics (course_id, name, color, description, number)
       VALUES ($course_id, 'Topic A', '#000', '', 1),
              ($course_id, 'Topic B', '#000', '', 5)`,
      { course_id: courseId },
    );

    await migration.execute(1n, 10000n);

    const topics = await sqldb.queryRows(
      'SELECT name, number FROM topics WHERE course_id = $course_id ORDER BY name',
      { course_id: courseId },
      z.object({ name: z.string(), number: z.number().nullable() }),
    );

    expect(topics).toEqual([
      { name: 'Topic A', number: 1 },
      { name: 'Topic B', number: 5 },
    ]);
  });

  it('assigns numbers starting from 1 when all are NULL', async () => {
    const courseId = await sqldb.queryRow(
      `INSERT INTO courses (path, short_name, title, display_timezone, institution_id)
       VALUES ('test3', 'TEST3', 'Test Course 3', 'America/Chicago', 1) RETURNING id`,
      {},
      IdSchema,
    );

    await sqldb.execute(
      `INSERT INTO topics (course_id, name, color, description, number)
       VALUES ($course_id, 'Topic A', '#000', '', NULL),
              ($course_id, 'Topic B', '#000', '', NULL)`,
      { course_id: courseId },
    );

    await migration.execute(1n, 10000n);

    const topics = await sqldb.queryRows(
      'SELECT name, number FROM topics WHERE course_id = $course_id ORDER BY name',
      { course_id: courseId },
      z.object({ name: z.string(), number: z.number().nullable() }),
    );

    expect(topics).toEqual([
      { name: 'Topic A', number: 1 },
      { name: 'Topic B', number: 2 },
    ]);
  });
});
