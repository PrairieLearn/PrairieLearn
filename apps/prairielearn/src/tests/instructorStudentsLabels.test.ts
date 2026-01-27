import * as path from 'path';

import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { execute } from '@prairielearn/postgres';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { config } from '../lib/config.js';
import { computeCourseInstanceJsonHash } from '../lib/courseInstanceJson.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { ensureUncheckedEnrollment } from '../models/enrollment.js';
import {
  selectEnrollmentIdsForStudentLabel,
  selectStudentLabelsByCourseInstance,
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
const labelsUrl = `${siteUrl}/pl/course_instance/1/instructor/instance_admin/students/labels`;

function makeStudent(n: number) {
  const uid = `test-labels-student-${n}@example.com`;
  return { name: `Test Labels Student ${n}`, uid, uin: `testlabels${n}`, email: uid };
}

async function getOrigHash(courseLiveDir: string, courseInstanceShortName: string) {
  const courseInstanceJsonPath = path.join(
    courseLiveDir,
    'courseInstances',
    courseInstanceShortName,
    'infoCourseInstance.json',
  );
  return await computeCourseInstanceJsonHash(courseInstanceJsonPath);
}

async function postAction(
  action: Record<string, unknown>,
  courseLiveDir: string,
  courseInstanceShortName: string,
) {
  const pageResponse = await fetchCheerio(labelsUrl);
  const csrfToken = getCSRFToken(pageResponse.$);
  const origHash = await getOrigHash(courseLiveDir, courseInstanceShortName);

  return fetchCheerio(labelsUrl, {
    method: 'POST',
    body: JSON.stringify({ __csrf_token: csrfToken, orig_hash: origHash, ...action }),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  });
}

describe('Instructor student labels page', () => {
  let enrollmentIds: string[];
  let studentUids: string[];
  let courseRepo: CourseRepoFixture;
  let courseInstanceShortName: string;

  beforeAll(async () => {
    courseRepo = await createCourseRepoFixture(TEST_COURSE_PATH);
    await helperServer.before(courseRepo.courseLiveDir)();
    await updateCourseRepository({ courseId: '1', repository: courseRepo.courseOriginDir });

    const courseInstance = await selectCourseInstanceById('1');
    courseInstanceShortName = courseInstance.short_name!;

    // Create and enroll test students
    const students = [1, 2, 3].map((n) => makeStudent(n));
    studentUids = students.map((s) => s.uid);

    const users = await Promise.all(students.map((s) => getOrCreateUser(s)));
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
  });

  afterAll(async () => {
    await execute('DELETE FROM enrollments WHERE id = ANY($1::bigint[])', [enrollmentIds]);
    await helperServer.after();
  });

  test.sequential('should load page and API endpoints correctly', async () => {
    // Test main page loads
    const pageResponse = await fetchCheerio(labelsUrl);
    assert.equal(pageResponse.status, 200);

    // Test data.json returns array of labels
    const dataResponse = await fetchCheerio(`${labelsUrl}/data.json`, {
      headers: { Accept: 'application/json' },
    });
    assert.equal(dataResponse.status, 200);
    const data = JSON.parse(dataResponse.$.text());
    assert.isArray(data);

    // Test /check with valid enrolled UIDs
    const validCheckResponse = await fetchCheerio(
      `${labelsUrl}/check?uids=${encodeURIComponent(studentUids[0])}`,
      { headers: { Accept: 'application/json' } },
    );
    assert.equal(validCheckResponse.status, 200);
    const validCheckData = JSON.parse(validCheckResponse.$.text());
    assert.deepEqual(validCheckData.invalidUids, []);

    // Test /check with invalid UIDs
    const invalidUid = 'nonexistent@example.com';
    const invalidCheckResponse = await fetchCheerio(
      `${labelsUrl}/check?uids=${encodeURIComponent(invalidUid)}`,
      { headers: { Accept: 'application/json' } },
    );
    assert.equal(invalidCheckResponse.status, 200);
    const invalidCheckData = JSON.parse(invalidCheckResponse.$.text());
    assert.deepEqual(invalidCheckData.invalidUids, [invalidUid]);

    // Test /check with mixed valid and invalid UIDs
    const mixedCheckResponse = await fetchCheerio(
      `${labelsUrl}/check?uids=${encodeURIComponent(`${studentUids[0]},${invalidUid}`)}`,
      { headers: { Accept: 'application/json' } },
    );
    assert.equal(mixedCheckResponse.status, 200);
    const mixedCheckData = JSON.parse(mixedCheckResponse.$.text());
    assert.deepEqual(mixedCheckData.invalidUids, [invalidUid]);
  });

  test.sequential('should handle create label operations', async () => {
    // Create label without students
    const createResponse = await postAction(
      {
        __action: 'create_label',
        name: 'Test Label A',
        color: 'blue1',
        uids: '',
      },
      courseRepo.courseLiveDir,
      courseInstanceShortName,
    );
    assert.equal(createResponse.status, 200);

    // Verify label exists in database
    let labels = await selectStudentLabelsByCourseInstance('1');
    const labelA = labels.find((l) => l.name === 'Test Label A');
    assert.isDefined(labelA);
    assert.equal(labelA.color, 'blue1');

    // Create label with students
    const createWithStudentsResponse = await postAction(
      {
        __action: 'create_label',
        name: 'Test Label B',
        color: 'green2',
        uids: `${studentUids[0]}\n${studentUids[1]}`,
      },
      courseRepo.courseLiveDir,
      courseInstanceShortName,
    );
    assert.equal(createWithStudentsResponse.status, 200);

    // Verify label exists with enrollments
    labels = await selectStudentLabelsByCourseInstance('1');
    const labelB = labels.find((l) => l.name === 'Test Label B');
    assert.isDefined(labelB);
    const labelBEnrollments = await selectEnrollmentIdsForStudentLabel(labelB.id);
    assert.equal(labelBEnrollments.length, 2);
    assert.includeMembers(labelBEnrollments, [enrollmentIds[0], enrollmentIds[1]]);

    // Attempt to create label with duplicate name - should fail
    const duplicateResponse = await postAction(
      {
        __action: 'create_label',
        name: 'Test Label A',
        color: 'red1',
        uids: '',
      },
      courseRepo.courseLiveDir,
      courseInstanceShortName,
    );
    assert.equal(duplicateResponse.status, 400);

    // Attempt to create label with empty name - should fail
    const emptyNameResponse = await postAction(
      {
        __action: 'create_label',
        name: '',
        color: 'gray1',
        uids: '',
      },
      courseRepo.courseLiveDir,
      courseInstanceShortName,
    );
    assert.notEqual(emptyNameResponse.status, 200);
  });

  test.sequential('should handle edit label operations', async () => {
    // Get current labels
    let labels = await selectStudentLabelsByCourseInstance('1');
    let labelA = labels.find((l) => l.name === 'Test Label A');
    assert.isDefined(labelA);

    // Edit label name
    const editNameResponse = await postAction(
      {
        __action: 'edit_label',
        label_id: labelA.id,
        name: 'Test Label A Renamed',
        old_name: 'Test Label A',
        color: 'blue1',
        uids: '',
      },
      courseRepo.courseLiveDir,
      courseInstanceShortName,
    );
    assert.equal(editNameResponse.status, 200);

    // Verify name changed
    labels = await selectStudentLabelsByCourseInstance('1');
    labelA = labels.find((l) => l.name === 'Test Label A Renamed');
    assert.isDefined(labelA);

    // Edit label color
    const editColorResponse = await postAction(
      {
        __action: 'edit_label',
        label_id: labelA.id,
        name: 'Test Label A Renamed',
        old_name: 'Test Label A Renamed',
        color: 'purple3',
        uids: '',
      },
      courseRepo.courseLiveDir,
      courseInstanceShortName,
    );
    assert.equal(editColorResponse.status, 200);

    labels = await selectStudentLabelsByCourseInstance('1');
    labelA = labels.find((l) => l.name === 'Test Label A Renamed');
    assert.isDefined(labelA);
    assert.equal(labelA.color, 'purple3');

    // Add students to label via edit
    const addStudentsResponse = await postAction(
      {
        __action: 'edit_label',
        label_id: labelA.id,
        name: 'Test Label A Renamed',
        old_name: 'Test Label A Renamed',
        color: 'purple3',
        uids: `${studentUids[2]}`,
      },
      courseRepo.courseLiveDir,
      courseInstanceShortName,
    );
    assert.equal(addStudentsResponse.status, 200);

    let enrollmentIdsInLabel = await selectEnrollmentIdsForStudentLabel(labelA.id);
    assert.equal(enrollmentIdsInLabel.length, 1);
    assert.include(enrollmentIdsInLabel, enrollmentIds[2]);

    // Remove students via edit (set empty uids)
    const removeStudentsResponse = await postAction(
      {
        __action: 'edit_label',
        label_id: labelA.id,
        name: 'Test Label A Renamed',
        old_name: 'Test Label A Renamed',
        color: 'purple3',
        uids: '',
      },
      courseRepo.courseLiveDir,
      courseInstanceShortName,
    );
    assert.equal(removeStudentsResponse.status, 200);

    enrollmentIdsInLabel = await selectEnrollmentIdsForStudentLabel(labelA.id);
    assert.equal(enrollmentIdsInLabel.length, 0);

    // Attempt to rename to existing label name - should fail
    const labelB = labels.find((l) => l.name === 'Test Label B');
    assert.isDefined(labelB);

    const renameToDuplicateResponse = await postAction(
      {
        __action: 'edit_label',
        label_id: labelA.id,
        name: 'Test Label B',
        old_name: 'Test Label A Renamed',
        color: 'purple3',
        uids: '',
      },
      courseRepo.courseLiveDir,
      courseInstanceShortName,
    );
    assert.equal(renameToDuplicateResponse.status, 400);
  });

  test.sequential('should handle delete label operations', async () => {
    // Get current labels
    let labels = await selectStudentLabelsByCourseInstance('1');
    const labelA = labels.find((l) => l.name === 'Test Label A Renamed');
    assert.isDefined(labelA);

    // Delete existing label
    const deleteResponse = await postAction(
      {
        __action: 'delete_label',
        label_id: labelA.id,
        label_name: 'Test Label A Renamed',
      },
      courseRepo.courseLiveDir,
      courseInstanceShortName,
    );
    assert.equal(deleteResponse.status, 200);

    // Verify label is deleted (soft delete via deleted_at)
    labels = await selectStudentLabelsByCourseInstance('1');
    const deletedLabel = labels.find((l) => l.name === 'Test Label A Renamed');
    assert.isUndefined(deletedLabel);

    // Attempt to delete with wrong label name - should fail with 404
    const labelB = labels.find((l) => l.name === 'Test Label B');
    assert.isDefined(labelB);

    const deleteWrongNameResponse = await postAction(
      {
        __action: 'delete_label',
        label_id: labelB.id,
        label_name: 'Wrong Name',
      },
      courseRepo.courseLiveDir,
      courseInstanceShortName,
    );
    assert.equal(deleteWrongNameResponse.status, 404);
  });
});
