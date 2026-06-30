import * as crypto from 'node:crypto';
import * as path from 'path';

import fs from 'fs-extra';
import { afterAll, assert, beforeAll, describe, expect, test } from 'vitest';

import { queryOptionalRow } from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { getAppError } from '../lib/client/errors.js';
import { config } from '../lib/config.js';
import { EnrollmentSchema } from '../lib/db-types.js';
import { computeScopedJsonHash } from '../lib/editorUtil.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import {
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
} from '../models/course-permissions.js';
import {
  generateAndEnrollUsers,
  selectUsersAndEnrollmentsForCourseInstance,
} from '../models/enrollment.js';
import {
  selectEnrollmentsInStudentLabel,
  selectStudentLabelsInCourseInstance,
} from '../models/student-label.js';
import { getStudentLabelsWithUserData } from '../pages/instructorStudentsLabels/queries.js';
import type { AssessmentJsonInput } from '../schemas/infoAssessment.js';
import {
  type CourseInstanceJsonInput,
  MAX_STUDENT_LABELS_PER_COURSE_INSTANCE,
} from '../schemas/infoCourseInstance.js';
import { createCourseInstanceTrpcClient } from '../trpc/courseInstance/client.js';
import type { StudentLabelError } from '../trpc/courseInstance/student-labels.js';

import * as helperClient from './helperClient.js';
import {
  type CourseRepoFixture,
  commitOriginAndSync,
  createCourseRepoFixture,
  updateCourseRepository,
} from './helperCourse.js';
import * as helperServer from './helperServer.js';
import { getOrCreateUser } from './utils/auth.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const labelsUrl = `${siteUrl}/pl/course_instance/1/instructor/instance_admin/students/labels`;

function getCourseInstanceJsonPath(courseLiveDir: string, courseInstanceShortName: string) {
  return path.join(
    courseLiveDir,
    'courseInstances',
    courseInstanceShortName,
    'infoCourseInstance.json',
  );
}

function createTrpcClient() {
  const csrfToken = generatePrefixCsrfToken(
    { url: '/pl/course_instance/1/instructor/trpc', authn_user_id: '1' },
    config.secretKey,
  );
  return createCourseInstanceTrpcClient({
    csrfToken,
    courseInstanceId: '1',
    urlBase: siteUrl,
  });
}

describe('Instructor student labels page', { concurrent: false }, () => {
  let enrollmentIds: string[];
  let studentUids: string[];
  let courseRepo: CourseRepoFixture;
  let courseInstanceShortName: string;

  beforeAll(async () => {
    courseRepo = await createCourseRepoFixture(TEST_COURSE_PATH);
    await helperServer.before(courseRepo.courseLiveDir)();
    await updateCourseRepository({ courseId: '1', repository: courseRepo.courseOriginDir });

    const instructor = await getOrCreateUser({
      uid: 'instructor@example.com',
      name: 'Test Instructor',
      uin: '100000000',
      email: 'instructor@example.com',
    });
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: instructor.uid,
      course_role: 'Owner',
      authn_user_id: instructor.id,
    });
    await insertCourseInstancePermissions({
      course_id: '1',
      user_id: instructor.id,
      course_instance_id: '1',
      course_instance_role: 'Student Data Editor',
      authn_user_id: instructor.id,
    });

    const courseInstance = await selectCourseInstanceById('1');
    courseInstanceShortName = courseInstance.short_name!;

    const users = await generateAndEnrollUsers({ count: 3, course_instance_id: '1' });
    studentUids = users.map((u) => u.uid);
    const enrollments = await selectUsersAndEnrollmentsForCourseInstance(courseInstance);
    const enrollmentIdByUserId = new Map(
      enrollments.filter((e) => e.user != null).map((e) => [e.user!.id, e.enrollment.id]),
    );
    enrollmentIds = users.map((u) => {
      const enrollmentId = enrollmentIdByUserId.get(u.id);
      assert.isDefined(enrollmentId);
      return enrollmentId;
    });
  });

  afterAll(helperServer.after);

  test('should load page and API endpoints correctly', async () => {
    const pageResponse = await fetch(labelsUrl);
    assert.equal(pageResponse.status, 200);

    const trpcClient = createTrpcClient();

    const result = await trpcClient.studentLabels.list.query();
    assert.isArray(result.labels);
    assert.isNotNull(result.origHash);

    const validCheckResult = await trpcClient.studentLabels.checkUids.query({
      uids: [studentUids[0]],
    });
    assert.deepEqual(validCheckResult.unenrolledUids, []);

    const invalidUid = 'nonexistent@example.com';
    const invalidCheckResult = await trpcClient.studentLabels.checkUids.query({
      uids: [invalidUid],
    });
    assert.deepEqual(invalidCheckResult.unenrolledUids, [invalidUid]);

    const mixedCheckResult = await trpcClient.studentLabels.checkUids.query({
      uids: [studentUids[0], invalidUid],
    });
    assert.deepEqual(mixedCheckResult.unenrolledUids, [invalidUid]);
  });

  test('should handle create label operations', async () => {
    const trpcClient = createTrpcClient();
    let origHash = await computeScopedJsonHash<CourseInstanceJsonInput>(
      getCourseInstanceJsonPath(courseRepo.courseLiveDir, courseInstanceShortName),
      (json) => json.studentLabels ?? [],
    );

    await trpcClient.studentLabels.upsert.mutate({
      name: 'Test Label A',
      color: 'blue1',
      uids: [],
      origHash,
    });

    const courseInstance = await selectCourseInstanceById('1');
    let labels = await selectStudentLabelsInCourseInstance(courseInstance);
    const labelA = labels.find((l) => l.name === 'Test Label A');
    assert.isDefined(labelA);
    assert.equal(labelA.color, 'blue1');

    origHash = await computeScopedJsonHash<CourseInstanceJsonInput>(
      getCourseInstanceJsonPath(courseRepo.courseLiveDir, courseInstanceShortName),
      (json) => json.studentLabels ?? [],
    );

    await trpcClient.studentLabels.upsert.mutate({
      name: 'Test Label B',
      color: 'green2',
      uids: [studentUids[0], studentUids[1]],
      origHash,
    });

    labels = await selectStudentLabelsInCourseInstance(courseInstance);
    const labelB = labels.find((l) => l.name === 'Test Label B');
    assert.isDefined(labelB);
    const studentsWithLabelB = (await selectEnrollmentsInStudentLabel(labelB)).map((e) => e.id);
    assert.equal(studentsWithLabelB.length, 2);
    assert.includeMembers(studentsWithLabelB, [enrollmentIds[0], enrollmentIds[1]]);

    origHash = await computeScopedJsonHash<CourseInstanceJsonInput>(
      getCourseInstanceJsonPath(courseRepo.courseLiveDir, courseInstanceShortName),
      (json) => json.studentLabels ?? [],
    );

    try {
      await trpcClient.studentLabels.upsert.mutate({
        name: 'Test Label A',
        color: 'red1',
        uids: [],
        origHash,
      });
      assert.fail('Expected error for duplicate name');
    } catch (err) {
      const appError = getAppError<StudentLabelError['Upsert']>(err);
      assert.isNotNull(appError);
      assert.include(appError.message, 'A label with this name already exists');
    }

    try {
      await trpcClient.studentLabels.upsert.mutate({
        name: '',
        color: 'gray1',
        uids: [],
        origHash,
      });
      assert.fail('Expected error for empty name');
    } catch (err) {
      assert.isNotNull(getAppError<StudentLabelError['Upsert']>(err));
    }
  });

  test('should require student data view and only show label management actions to users with both permissions', async () => {
    const courseEditorOnly = await helperClient.fetchCheerio(labelsUrl, {
      headers: {
        cookie:
          'pl_test_user=test_instructor; pl2_requested_course_role=Editor; pl2_requested_course_instance_role=None',
      },
    });
    assert.equal(courseEditorOnly.status, 403);

    const studentDataEditorOnly = await helperClient.fetchCheerio(labelsUrl, {
      headers: {
        cookie:
          'pl_test_user=test_instructor; pl2_requested_course_role=None; pl2_requested_course_instance_role=Student Data Editor',
      },
    });
    assert.equal(studentDataEditorOnly.status, 200);
    assert.lengthOf(studentDataEditorOnly.$('button:contains("Add label")'), 0);
    assert.lengthOf(studentDataEditorOnly.$('th:contains("Students")'), 1);

    const editorAndStudentDataEditor = await helperClient.fetchCheerio(labelsUrl, {
      headers: {
        cookie:
          'pl_test_user=test_instructor; pl2_requested_course_role=Editor; pl2_requested_course_instance_role=Student Data Editor',
      },
    });
    assert.equal(editorAndStudentDataEditor.status, 200);
    assert.lengthOf(editorAndStudentDataEditor.$('button:contains("Add label")'), 1);
    assert.lengthOf(editorAndStudentDataEditor.$('th:contains("Students")'), 1);
  });

  test('should handle edit label operations', async () => {
    const trpcClient = createTrpcClient();
    let origHash = await computeScopedJsonHash<CourseInstanceJsonInput>(
      getCourseInstanceJsonPath(courseRepo.courseLiveDir, courseInstanceShortName),
      (json) => json.studentLabels ?? [],
    );

    let labels = await selectStudentLabelsInCourseInstance(await selectCourseInstanceById('1'));
    let labelA = labels.find((l) => l.name === 'Test Label A');
    assert.isDefined(labelA);

    await trpcClient.studentLabels.upsert.mutate({
      labelId: labelA.id,
      name: 'Test Label A Renamed',
      color: 'blue1',
      uids: [],
      origHash,
    });

    labels = await selectStudentLabelsInCourseInstance(await selectCourseInstanceById('1'));
    labelA = labels.find((l) => l.name === 'Test Label A Renamed');
    assert.isDefined(labelA);

    origHash = await computeScopedJsonHash<CourseInstanceJsonInput>(
      getCourseInstanceJsonPath(courseRepo.courseLiveDir, courseInstanceShortName),
      (json) => json.studentLabels ?? [],
    );

    await trpcClient.studentLabels.upsert.mutate({
      labelId: labelA.id,
      name: 'Test Label A Renamed',
      color: 'purple3',
      uids: [studentUids[2]],
      origHash,
    });

    labels = await selectStudentLabelsInCourseInstance(await selectCourseInstanceById('1'));
    labelA = labels.find((l) => l.name === 'Test Label A Renamed');
    assert.isDefined(labelA);
    assert.equal(labelA.color, 'purple3');

    let studentsWithLabel = (await selectEnrollmentsInStudentLabel(labelA)).map((e) => e.id);
    assert.equal(studentsWithLabel.length, 1);
    assert.include(studentsWithLabel, enrollmentIds[2]);

    origHash = await computeScopedJsonHash<CourseInstanceJsonInput>(
      getCourseInstanceJsonPath(courseRepo.courseLiveDir, courseInstanceShortName),
      (json) => json.studentLabels ?? [],
    );

    await trpcClient.studentLabels.upsert.mutate({
      labelId: labelA.id,
      name: 'Test Label A Renamed',
      color: 'purple3',
      origHash,
    });

    studentsWithLabel = (await selectEnrollmentsInStudentLabel(labelA)).map((e) => e.id);
    assert.equal(studentsWithLabel.length, 1);
    assert.include(studentsWithLabel, enrollmentIds[2]);

    origHash = await computeScopedJsonHash<CourseInstanceJsonInput>(
      getCourseInstanceJsonPath(courseRepo.courseLiveDir, courseInstanceShortName),
      (json) => json.studentLabels ?? [],
    );

    await trpcClient.studentLabels.upsert.mutate({
      labelId: labelA.id,
      name: 'Test Label A Renamed',
      color: 'purple3',
      uids: [],
      origHash,
    });

    studentsWithLabel = (await selectEnrollmentsInStudentLabel(labelA)).map((e) => e.id);
    assert.equal(studentsWithLabel.length, 0);

    origHash = await computeScopedJsonHash<CourseInstanceJsonInput>(
      getCourseInstanceJsonPath(courseRepo.courseLiveDir, courseInstanceShortName),
      (json) => json.studentLabels ?? [],
    );

    const labelB = labels.find((l) => l.name === 'Test Label B');
    assert.isDefined(labelB);

    try {
      await trpcClient.studentLabels.upsert.mutate({
        labelId: labelA.id,
        name: 'Test Label B',
        color: 'purple3',
        uids: [],
        origHash,
      });
      assert.fail('Expected error for duplicate name');
    } catch (err) {
      const appError = getAppError<StudentLabelError['Upsert']>(err);
      assert.isNotNull(appError);
      assert.include(appError.message, 'A label with this name already exists');
    }
  });

  test('should handle delete label operations', async () => {
    const trpcClient = createTrpcClient();
    let origHash = await computeScopedJsonHash<CourseInstanceJsonInput>(
      getCourseInstanceJsonPath(courseRepo.courseLiveDir, courseInstanceShortName),
      (json) => json.studentLabels ?? [],
    );

    let labels = await selectStudentLabelsInCourseInstance(await selectCourseInstanceById('1'));
    const labelA = labels.find((l) => l.name === 'Test Label A Renamed');
    assert.isDefined(labelA);

    await trpcClient.studentLabels.destroy.mutate({
      labelId: labelA.id,
      origHash,
    });

    labels = await selectStudentLabelsInCourseInstance(await selectCourseInstanceById('1'));
    const deletedLabel = labels.find((l) => l.name === 'Test Label A Renamed');
    assert.isUndefined(deletedLabel);

    origHash = await computeScopedJsonHash<CourseInstanceJsonInput>(
      getCourseInstanceJsonPath(courseRepo.courseLiveDir, courseInstanceShortName),
      (json) => json.studentLabels ?? [],
    );

    try {
      await trpcClient.studentLabels.destroy.mutate({
        labelId: '999999',
        origHash,
      });
      assert.fail('Expected error for non-existent label');
    } catch (err) {
      assert.isNotNull(getAppError<StudentLabelError['Destroy']>(err));
    }
  });

  test('should support invited (pending) students in labels', async () => {
    const trpcClient = createTrpcClient();
    const invitedUid = 'invited-student@example.com';

    const invitedEnrollment = await queryOptionalRow(
      `INSERT INTO enrollments (course_instance_id, status, pending_uid)
       VALUES ($1, 'invited', $2)
       RETURNING *`,
      ['1', invitedUid],
      EnrollmentSchema,
    );
    assert.isNotNull(invitedEnrollment);

    const checkResult = await trpcClient.studentLabels.checkUids.query({ uids: [invitedUid] });
    assert.deepEqual(checkResult.unenrolledUids, []);

    const unknownUid = 'totally-unknown@example.com';
    const mixedResult = await trpcClient.studentLabels.checkUids.query({
      uids: [invitedUid, studentUids[0], unknownUid],
    });
    assert.deepEqual(mixedResult.unenrolledUids, [unknownUid]);

    const origHash = await computeScopedJsonHash<CourseInstanceJsonInput>(
      getCourseInstanceJsonPath(courseRepo.courseLiveDir, courseInstanceShortName),
      (json) => json.studentLabels ?? [],
    );
    await trpcClient.studentLabels.upsert.mutate({
      name: 'Invited Label',
      color: 'red1',
      uids: [invitedUid, studentUids[0]],
      origHash,
    });

    const courseInstance = await selectCourseInstanceById('1');
    const labels = await selectStudentLabelsInCourseInstance(courseInstance);
    const invitedLabel = labels.find((l) => l.name === 'Invited Label');
    assert.isDefined(invitedLabel);

    const enrollmentsInLabel = await selectEnrollmentsInStudentLabel(invitedLabel);
    assert.equal(enrollmentsInLabel.length, 2);

    const labelsWithUserData = await getStudentLabelsWithUserData(courseInstance);
    const labelData = labelsWithUserData.find((l) => l.student_label.name === 'Invited Label');
    assert.isDefined(labelData);
    const uidsInLabel = labelData.user_data.map((u) => u.uid);
    assert.include(uidsInLabel, invitedUid);
    assert.include(uidsInLabel, studentUids[0]);
  });

  test('renames propagate to accessControl entries in infoAssessment.json', async () => {
    const trpcClient = createTrpcClient();
    const assessmentJsonPath = path.join(
      courseRepo.courseLiveDir,
      'courseInstances',
      courseInstanceShortName,
      'assessments',
      'hw19-accessControlUi',
      'infoAssessment.json',
    );

    const before = (await fs.readJson(assessmentJsonPath)) as AssessmentJsonInput;
    assert.deepEqual(before.accessControl?.[1].labels, ['Section A']);

    const courseInstance = await selectCourseInstanceById('1');
    const labels = await selectStudentLabelsInCourseInstance(courseInstance);
    const sectionA = labels.find((l) => l.name === 'Section A');
    assert.isDefined(sectionA);

    const origHash = await computeScopedJsonHash<CourseInstanceJsonInput>(
      getCourseInstanceJsonPath(courseRepo.courseLiveDir, courseInstanceShortName),
      (json) => json.studentLabels ?? [],
    );

    await trpcClient.studentLabels.upsert.mutate({
      labelId: sectionA.id,
      name: 'Section A Renamed',
      color: 'red1',
      origHash,
    });

    const after = (await fs.readJson(assessmentJsonPath)) as AssessmentJsonInput;
    assert.deepEqual(after.accessControl?.[1].labels, ['Section A Renamed']);
  });

  test('deletes propagate to accessControl entries, leaving labels: []', async () => {
    const trpcClient = createTrpcClient();
    const assessmentJsonPath = path.join(
      courseRepo.courseLiveDir,
      'courseInstances',
      courseInstanceShortName,
      'assessments',
      'hw19-accessControlUi',
      'infoAssessment.json',
    );

    const courseInstance = await selectCourseInstanceById('1');
    const labels = await selectStudentLabelsInCourseInstance(courseInstance);
    const renamedSectionA = labels.find((l) => l.name === 'Section A Renamed');
    assert.isDefined(renamedSectionA);

    const origHash = await computeScopedJsonHash<CourseInstanceJsonInput>(
      getCourseInstanceJsonPath(courseRepo.courseLiveDir, courseInstanceShortName),
      (json) => json.studentLabels ?? [],
    );

    await trpcClient.studentLabels.destroy.mutate({
      labelId: renamedSectionA.id,
      origHash,
    });

    const after = (await fs.readJson(assessmentJsonPath)) as AssessmentJsonInput;
    // Override rule survives with an empty labels array; other fields are preserved.
    assert.deepEqual(after.accessControl?.[1].labels, []);
    assert.isDefined(after.accessControl?.[1].dateControl);
  });

  test('should enforce the student label limit only for new labels', async () => {
    const trpcClient = createTrpcClient();
    const originInfoPath = getCourseInstanceJsonPath(
      courseRepo.courseOriginDir,
      courseInstanceShortName,
    );
    const originJson = (await fs.readJson(originInfoPath)) as CourseInstanceJsonInput;
    originJson.studentLabels = Array.from(
      { length: MAX_STUDENT_LABELS_PER_COURSE_INSTANCE },
      (_, index) => ({
        uuid: crypto.randomUUID(),
        name: index === 0 ? 'Section A' : `Limit Label ${String(index + 1).padStart(2, '0')}`,
        color: 'blue1' as const,
      }),
    );
    await fs.writeJson(originInfoPath, originJson, { spaces: 2 });

    await commitOriginAndSync(courseRepo, 'Fill student labels to limit', [
      path.relative(courseRepo.courseOriginDir, originInfoPath),
    ]);

    let labels = await selectStudentLabelsInCourseInstance(await selectCourseInstanceById('1'));
    assert.lengthOf(labels, MAX_STUDENT_LABELS_PER_COURSE_INSTANCE);

    const labelToEdit = labels.find((l) => l.name === 'Limit Label 02');
    assert.isDefined(labelToEdit);

    let origHash = await computeScopedJsonHash<CourseInstanceJsonInput>(
      getCourseInstanceJsonPath(courseRepo.courseLiveDir, courseInstanceShortName),
      (json) => json.studentLabels ?? [],
    );

    await trpcClient.studentLabels.upsert.mutate({
      labelId: labelToEdit.id,
      name: 'Limit Label 02 Renamed',
      color: 'green1',
      uids: [],
      origHash,
    });

    labels = await selectStudentLabelsInCourseInstance(await selectCourseInstanceById('1'));
    assert.lengthOf(labels, MAX_STUDENT_LABELS_PER_COURSE_INSTANCE);
    assert.isDefined(labels.find((l) => l.name === 'Limit Label 02 Renamed'));

    origHash = await computeScopedJsonHash<CourseInstanceJsonInput>(
      getCourseInstanceJsonPath(courseRepo.courseLiveDir, courseInstanceShortName),
      (json) => json.studentLabels ?? [],
    );

    await expect(
      trpcClient.studentLabels.upsert.mutate({
        name: 'Overflow Label',
        color: 'red1',
        uids: [],
        origHash,
      }),
    ).rejects.toThrow(`at most ${MAX_STUDENT_LABELS_PER_COURSE_INSTANCE} student labels`);
  });
});
