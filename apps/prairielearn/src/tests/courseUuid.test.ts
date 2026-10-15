import { afterAll, assert, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { execute, loadSqlEquiv, queryRow, queryScalar } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { CourseSchema } from '../lib/db-types.js';
import {
  insertCourse,
  selectCourseById,
  selectOrInsertCourseByPath,
  updateCourseSharingName,
} from '../models/course.js';
import { selectOrInsertUserByUid } from '../models/user.js';

import * as helperDb from './helperDb.js';
import * as util from './sync/util.js';

const sql = loadSqlEquiv(import.meta.url);
const MigrationCourseSchema = CourseSchema.extend({ uuid: z.string().nullable() });

// This migration establishes the writer before a later deployed backfill.
// Its nullable state is intentional and must remain readable during rollout.
describe('Course UUID migration', () => {
  it('preserves existing courses and generates UUIDs for legacy inserts', async () => {
    await helperDb.testMigration({
      name: '20261014005618_courses__uuid__add',
      beforeMigration: async () => {
        return await queryScalar(sql.insert_course, { path: '/existing-course' }, IdSchema);
      },
      afterMigration: async (courseId) => {
        const existingCourse = await queryRow(
          sql.select_course,
          { course_id: courseId },
          MigrationCourseSchema,
        );
        assert.equal(existingCourse.path, '/existing-course');
        assert.isNull(existingCourse.uuid);

        // Old application hosts omit the new column and still receive its default.
        const newCourseId = await queryScalar(sql.insert_course, { path: '/new-course' }, IdSchema);
        const newCourse = await queryRow(
          sql.select_course,
          { course_id: newCourseId },
          MigrationCourseSchema,
        );
        z.guid().parse(newCourse.uuid);
      },
    });
  });
});

describe('Course UUIDs', () => {
  beforeAll(helperDb.before);
  afterAll(helperDb.after);
  beforeEach(helperDb.resetDatabase);

  it('rejects null and duplicate course UUIDs', async () => {
    const sourceId = await queryScalar(sql.insert_course, { path: '/source-course' }, IdSchema);
    const source = await selectCourseById(sourceId);
    const otherId = await queryScalar(sql.insert_course, { path: '/other-course' }, IdSchema);

    await expect(
      execute(sql.update_course_uuid, { course_id: otherId, uuid: null }),
    ).rejects.toMatchObject({ code: '23502', column: 'uuid' });
    await expect(
      execute(sql.update_course_uuid, { course_id: otherId, uuid: source.uuid }),
    ).rejects.toMatchObject({ code: '23505', constraint: 'courses_uuid_key' });
  });

  it('generates a UUID through the administrative course creation path', async () => {
    const user = await selectOrInsertUserByUid('admin@example.com');
    const course = await insertCourse({
      institution_id: '1',
      short_name: 'TEST 101',
      title: 'Test course',
      display_timezone: 'UTC',
      path: '/admin-created-course',
      repository: null,
      branch: 'master',
      authn_user_id: user.id,
    });
    z.guid().parse(course.uuid);
    assert.equal((await selectCourseById(course.id)).uuid, course.uuid);
  });

  it('keeps course identity across syncs and gives repository copies distinct UUIDs', async () => {
    const initialCourseData = util.getCourseData();
    const repositoryUuid = crypto.randomUUID();
    const courseData = {
      ...initialCourseData,
      course: { ...initialCourseData.course, uuid: repositoryUuid },
    };
    const source = await util.writeAndSyncCourseData(courseData);
    const course = await selectCourseById(source.syncResults.courseId);
    z.guid().parse(course.uuid);
    assert.notEqual(course.uuid, repositoryUuid);
    assert.equal((await selectOrInsertCourseByPath(source.courseDir)).uuid, course.uuid);

    await updateCourseSharingName({ course_id: course.id, sharing_name: 'original-name' });
    await updateCourseSharingName({ course_id: course.id, sharing_name: 'renamed-course' });
    courseData.course.uuid = crypto.randomUUID();
    courseData.course.name = 'RENAMED 101';
    await util.overwriteAndSyncCourseData(courseData, source.courseDir);
    assert.equal((await selectCourseById(course.id)).uuid, course.uuid);

    const copy = await util.writeAndSyncCourseData(courseData);
    const copiedCourse = await selectCourseById(copy.syncResults.courseId);
    z.guid().parse(copiedCourse.uuid);
    assert.notEqual(copiedCourse.uuid, course.uuid);
    assert.notEqual(copiedCourse.uuid, courseData.course.uuid);
  });
});
