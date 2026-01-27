import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { execute } from '@prairielearn/postgres';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { config } from '../lib/config.js';
import type { StudentLabel } from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { ensureUncheckedEnrollment } from '../models/enrollment.js';
import {
  createStudentLabel,
  deleteStudentLabel,
  selectEnrollmentsInStudentLabel,
  selectStudentLabelsInCourseInstance,
} from '../models/student-label.js';

import { fetchCheerio, getCSRFToken } from './helperClient.js';
import {
  type CourseRepoFixture,
  createCourseRepoFixture,
  updateCourseRepository,
} from './helperCourse.js';
import * as helperServer from './helperServer.js';
import { getOrCreateUser } from './utils/auth.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const studentsUrl = `${siteUrl}/pl/course_instance/1/instructor/instance_admin/students`;

function makeStudent(n: number) {
  const uid = `test-student-${n}@example.com`;
  return { name: `Test Student ${n}`, uid, uin: `test${n}`, email: uid };
}

async function postAction(action: Record<string, unknown>) {
  const pageResponse = await fetchCheerio(studentsUrl);
  const csrfToken = getCSRFToken(pageResponse.$);
  return fetchCheerio(studentsUrl, {
    method: 'POST',
    body: JSON.stringify({ __csrf_token: csrfToken, ...action }),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  });
}

describe('Student labels batch actions', () => {
  let label: StudentLabel;
  let enrollmentIds: string[];
  let courseRepo: CourseRepoFixture;

  beforeAll(async () => {
    courseRepo = await createCourseRepoFixture(TEST_COURSE_PATH);
    await helperServer.before(courseRepo.courseLiveDir)();
    await updateCourseRepository({ courseId: '1', repository: courseRepo.courseOriginDir });

    const courseInstance = await selectCourseInstanceById('1');
    const users = await Promise.all([1, 2, 3].map((n) => getOrCreateUser(makeStudent(n))));

    const enrollments = await Promise.all(
      users.map((user) =>
        ensureUncheckedEnrollment({
          courseInstance,
          userId: user.id,
          requiredRole: ['System'],
          authzData: dangerousFullSystemAuthz(),
          actionDetail: 'implicit_joined',
        }),
      ),
    );
    enrollmentIds = enrollments.map((e) => e!.id);

    label = await createStudentLabel({ courseInstanceId: '1', name: 'Batch Test Label' });
  });

  afterAll(async () => {
    try {
      await deleteStudentLabel(label.id);
    } catch {
      // ignore
    }
    await execute('DELETE FROM enrollments WHERE id = ANY($1::bigint[])', [enrollmentIds]);
    await helperServer.after();
  });

  test.sequential('should load the students page', async () => {
    const response = await fetchCheerio(studentsUrl);
    assert.equal(response.status, 200);
  });

  test.sequential('should batch add multiple students to a label', async () => {
    const response = await postAction({
      __action: 'batch_add_to_label',
      enrollment_ids: enrollmentIds,
      student_label_id: label.id,
    });
    assert.equal(response.status, 200);

    const memberIds = (await selectEnrollmentsInStudentLabel(label)).map((e) => e.id);
    assert.equal(memberIds.length, 3);
    assert.includeMembers(memberIds, enrollmentIds);
  });

  test.sequential('should batch remove multiple students from a label', async () => {
    const response = await postAction({
      __action: 'batch_remove_from_label',
      enrollment_ids: [enrollmentIds[0], enrollmentIds[1]],
      student_label_id: label.id,
    });
    assert.equal(response.status, 200);

    const memberIds = (await selectEnrollmentsInStudentLabel(label)).map((e) => e.id);
    assert.deepEqual(memberIds, [enrollmentIds[2]]);
  });

  test.sequential('should remove the last student from a label', async () => {
    const response = await postAction({
      __action: 'batch_remove_from_label',
      enrollment_ids: [enrollmentIds[2]],
      student_label_id: label.id,
    });
    assert.equal(response.status, 200);

    const memberIds = (await selectEnrollmentsInStudentLabel(label)).map((e) => e.id);
    assert.equal(memberIds.length, 0);
  });

  test.sequential('should fail when adding to non-existent label', async () => {
    const response = await postAction({
      __action: 'batch_add_to_label',
      enrollment_ids: [enrollmentIds[0]],
      student_label_id: '999999',
    });
    assert.equal(response.status, 500);
  });

  test.sequential('should create a new label and add students to it', async () => {
    const response = await postAction({
      __action: 'create_label_and_add_students',
      enrollment_ids: [enrollmentIds[0], enrollmentIds[1]],
      name: 'New Created Label',
    });
    assert.equal(response.status, 200);

    const courseInstance = await selectCourseInstanceById('1');
    const labels = await selectStudentLabelsInCourseInstance(courseInstance);
    const newLabel = labels.find((l: (typeof labels)[number]) => l.name === 'New Created Label');
    assert.isDefined(newLabel);

    const memberIds = (await selectEnrollmentsInStudentLabel(newLabel)).map((e) => e.id);
    assert.equal(memberIds.length, 2);
    assert.includeMembers(memberIds, [enrollmentIds[0], enrollmentIds[1]]);
  });

  test.sequential('should fail to create label with duplicate name', async () => {
    const response = await postAction({
      __action: 'create_label_and_add_students',
      enrollment_ids: [enrollmentIds[2]],
      name: 'New Created Label',
    });
    assert.equal(response.status, 400);
  });

  test.sequential('should fail to create label with empty name', async () => {
    const response = await postAction({
      __action: 'create_label_and_add_students',
      enrollment_ids: [enrollmentIds[0]],
      name: '',
    });
    assert.notEqual(response.status, 200);
  });
});
