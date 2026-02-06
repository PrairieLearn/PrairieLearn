import { afterEach, assert, beforeEach, describe, it } from 'vitest';

import { queryRow } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { AssessmentInstanceSchema, type Course, type CourseInstance } from '../lib/db-types.js';
import { EXAMPLE_COURSE_PATH } from '../lib/paths.js';
import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';
import { getOrCreateUser } from '../tests/utils/auth.js';

import { flagSelfModifiedAssessmentInstance } from './assessment-instance.js';
import { selectAssessments } from './assessment.js';
import { selectCourseInstanceById } from './course-instances.js';
import {
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserId,
} from './course-permissions.js';
import { selectCourseById } from './course.js';

describe('flagSelfModifiedAssessmentInstance', () => {
  let course: Course;
  let courseInstance: CourseInstance;
  let assessmentId: string;

  beforeEach(async function () {
    await helperDb.before();
    await helperCourse.syncCourse(EXAMPLE_COURSE_PATH);
    courseInstance = await selectCourseInstanceById('1');
    course = await selectCourseById(courseInstance.course_id);
    const assessments = await selectAssessments({ course_instance_id: courseInstance.id });
    assessmentId = assessments[0].id;
  });

  afterEach(async function () {
    await helperDb.after();
  });

  async function createAssessmentInstance(userId: string): Promise<string> {
    return await queryRow(
      `INSERT INTO assessment_instances (assessment_id, user_id, include_in_statistics, open, modified_at)
       VALUES ($assessment_id, $user_id, TRUE, TRUE, now())
       RETURNING id`,
      { assessment_id: assessmentId, user_id: userId },
      IdSchema,
    );
  }

  async function getIncludeInStatistics(assessmentInstanceId: string): Promise<boolean> {
    const instance = await queryRow(
      'SELECT * FROM assessment_instances WHERE id = $id',
      { id: assessmentInstanceId },
      AssessmentInstanceSchema,
    );
    return instance.include_in_statistics;
  }

  it('sets include_in_statistics to FALSE when instructor modifies their own instance', async () => {
    const user = await getOrCreateUser({
      uid: 'instructor@test.com',
      name: 'Instructor',
      uin: 'inst1',
      email: 'instructor@test.com',
    });

    const assessmentInstanceId = await createAssessmentInstance(user.id);
    assert.isTrue(await getIncludeInStatistics(assessmentInstanceId));

    await insertCoursePermissionsByUserId({
      course_id: course.id,
      user_id: user.id,
      course_role: 'Viewer',
      authn_user_id: user.id,
    });

    await flagSelfModifiedAssessmentInstance({
      assessmentInstanceId,
      assessmentInstanceUserId: user.id,
      assessmentInstanceGroupId: null,
      courseInstanceId: courseInstance.id,
      authnUserId: user.id,
    });

    assert.isFalse(await getIncludeInStatistics(assessmentInstanceId));
  });

  it('does not change include_in_statistics when student modifies their own instance', async () => {
    const user = await getOrCreateUser({
      uid: 'student@test.com',
      name: 'Student',
      uin: 'stud1',
      email: 'student@test.com',
    });

    const assessmentInstanceId = await createAssessmentInstance(user.id);

    await flagSelfModifiedAssessmentInstance({
      assessmentInstanceId,
      assessmentInstanceUserId: user.id,
      assessmentInstanceGroupId: null,
      courseInstanceId: courseInstance.id,
      authnUserId: user.id,
    });

    assert.isTrue(await getIncludeInStatistics(assessmentInstanceId));
  });

  it('does not change include_in_statistics when instructor modifies another user instance', async () => {
    const student = await getOrCreateUser({
      uid: 'student2@test.com',
      name: 'Student',
      uin: 'stud2',
      email: 'student2@test.com',
    });
    const instructor = await getOrCreateUser({
      uid: 'instructor2@test.com',
      name: 'Instructor',
      uin: 'inst2',
      email: 'instructor2@test.com',
    });

    const assessmentInstanceId = await createAssessmentInstance(student.id);

    await insertCoursePermissionsByUserId({
      course_id: course.id,
      user_id: instructor.id,
      course_role: 'Viewer',
      authn_user_id: instructor.id,
    });

    await flagSelfModifiedAssessmentInstance({
      assessmentInstanceId,
      assessmentInstanceUserId: student.id,
      assessmentInstanceGroupId: null,
      courseInstanceId: courseInstance.id,
      authnUserId: instructor.id,
    });

    assert.isTrue(await getIncludeInStatistics(assessmentInstanceId));
  });

  it('sets include_in_statistics to FALSE when course instance staff modifies their own instance', async () => {
    const user = await getOrCreateUser({
      uid: 'cistaff@test.com',
      name: 'CI Staff',
      uin: 'cistaff1',
      email: 'cistaff@test.com',
    });

    const assessmentInstanceId = await createAssessmentInstance(user.id);

    await insertCourseInstancePermissions({
      course_id: course.id,
      course_instance_id: courseInstance.id,
      user_id: user.id,
      course_instance_role: 'Student Data Viewer',
      authn_user_id: user.id,
    });

    await flagSelfModifiedAssessmentInstance({
      assessmentInstanceId,
      assessmentInstanceUserId: user.id,
      assessmentInstanceGroupId: null,
      courseInstanceId: courseInstance.id,
      authnUserId: user.id,
    });

    assert.isFalse(await getIncludeInStatistics(assessmentInstanceId));
  });
});
