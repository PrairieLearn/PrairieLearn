import * as path from 'path';

import {
  TRPCClientError,
  type TRPCClientErrorLike,
  createTRPCClient,
  httpLink,
} from '@trpc/client';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import superjson from 'superjson';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { queryOptionalRow, queryRows } from '@prairielearn/postgres';

import { config } from '../lib/config.js';
import { EnrollmentSchema } from '../lib/db-types.js';
import { getOriginalHash } from '../lib/editors.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';
import {
  selectEnrollmentsInStudentLabel,
  selectStudentLabelsInCourseInstance,
} from '../models/student-label.js';
import { getStudentLabelsWithUserData } from '../pages/instructorStudentsLabels/queries.js';
import type { CourseInstanceRouter } from '../trpc/courseInstance/trpc.js';

import {
  type CourseRepoFixture,
  createCourseRepoFixture,
  updateCourseRepository,
} from './helperCourse.js';
import * as helperServer from './helperServer.js';

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

async function createTrpcClient() {
  // Fetch the page to get the CSRF token from hydration data
  const pageResponse = await fetch(labelsUrl);
  const pageHtml = await pageResponse.text();
  const $ = cheerio.load(pageHtml);

  // Extract trpcCsrfToken from the hydration data
  const dataScript = $('script[data-component-props][data-component="InstructorStudentsLabels"]');
  const propsJson = dataScript.text();
  const props = superjson.parse<{ trpcCsrfToken: string }>(propsJson);
  const trpcCsrfToken = props.trpcCsrfToken;

  return createTRPCClient<CourseInstanceRouter>({
    links: [
      httpLink({
        url: `${siteUrl}/pl/course_instance/1/instructor/trpc`,
        headers: {
          'X-CSRF-Token': trpcCsrfToken,
        },
        transformer: superjson,
      }),
    ],
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

    const users = await generateAndEnrollUsers({ count: 3, course_instance_id: '1' });
    studentUids = users.map((u) => u.uid);
    const userIds = users.map((u) => u.id);
    const enrollments = await queryRows(
      'SELECT * FROM enrollments WHERE user_id = ANY($1::bigint[])',
      [userIds],
      EnrollmentSchema,
    );
    enrollmentIds = enrollments.map((e) => e.id);
  });

  afterAll(helperServer.after);

  test.sequential('should load page and API endpoints correctly', async () => {
    // Test main page loads
    const pageResponse = await fetch(labelsUrl);
    assert.equal(pageResponse.status, 200);

    // Get tRPC client
    const trpcClient = await createTrpcClient();

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

  test.sequential('should handle create label operations', async () => {
    const trpcClient = await createTrpcClient();
    let origHash = await getOriginalHash(
      getCourseInstanceJsonPath(courseRepo.courseLiveDir, courseInstanceShortName),
    );

    // Create label without students
    await trpcClient.studentLabels.create.mutate({
      name: 'Test Label A',
      color: 'blue1',
      uids: [],
      origHash,
    });

    // Verify label exists in database
    const courseInstance = await selectCourseInstanceById('1');
    let labels = await selectStudentLabelsInCourseInstance(courseInstance);
    const labelA = labels.find((l) => l.name === 'Test Label A');
    assert.isDefined(labelA);
    assert.equal(labelA.color, 'blue1');

    // Refresh origHash after the first mutation
    origHash = await getOriginalHash(
      getCourseInstanceJsonPath(courseRepo.courseLiveDir, courseInstanceShortName),
    );

    // Create label with students
    await trpcClient.studentLabels.create.mutate({
      name: 'Test Label B',
      color: 'green2',
      uids: [studentUids[0], studentUids[1]],
      origHash,
    });

    // Verify label exists with enrollments
    labels = await selectStudentLabelsInCourseInstance(courseInstance);
    const labelB = labels.find((l) => l.name === 'Test Label B');
    assert.isDefined(labelB);
    const studentsWithLabelB = (await selectEnrollmentsInStudentLabel(labelB)).map((e) => e.id);
    assert.equal(studentsWithLabelB.length, 2);
    assert.includeMembers(studentsWithLabelB, [enrollmentIds[0], enrollmentIds[1]]);

    // Refresh origHash after the second mutation
    origHash = await getOriginalHash(
      getCourseInstanceJsonPath(courseRepo.courseLiveDir, courseInstanceShortName),
    );

    // Attempt to create label with duplicate name - should fail
    try {
      await trpcClient.studentLabels.create.mutate({
        name: 'Test Label A',
        color: 'red1',
        uids: [],
        origHash,
      });
      assert.fail('Expected error for duplicate name');
    } catch (err) {
      assert.instanceOf(err, TRPCClientError);
      assert.include((err as TRPCClientErrorLike<CourseInstanceRouter>).message, 'already exists');
    }

    // Attempt to create label with empty name - should fail
    try {
      await trpcClient.studentLabels.create.mutate({
        name: '',
        color: 'gray1',
        uids: [],
        origHash,
      });
      assert.fail('Expected error for empty name');
    } catch (err) {
      assert.instanceOf(err, TRPCClientError);
    }
  });

  test.sequential('should handle edit label operations', async () => {
    const trpcClient = await createTrpcClient();
    let origHash = await getOriginalHash(
      getCourseInstanceJsonPath(courseRepo.courseLiveDir, courseInstanceShortName),
    );

    // Get current labels
    let labels = await selectStudentLabelsInCourseInstance(await selectCourseInstanceById('1'));
    let labelA = labels.find((l) => l.name === 'Test Label A');
    assert.isDefined(labelA);

    // Edit label name
    await trpcClient.studentLabels.edit.mutate({
      labelId: labelA.id,
      name: 'Test Label A Renamed',
      color: 'blue1',
      uids: [],
      origHash,
    });

    // Verify name changed
    labels = await selectStudentLabelsInCourseInstance(await selectCourseInstanceById('1'));
    labelA = labels.find((l) => l.name === 'Test Label A Renamed');
    assert.isDefined(labelA);

    // Refresh origHash after the mutation
    origHash = await getOriginalHash(
      getCourseInstanceJsonPath(courseRepo.courseLiveDir, courseInstanceShortName),
    );

    // Edit label color
    await trpcClient.studentLabels.edit.mutate({
      labelId: labelA.id,
      name: 'Test Label A Renamed',
      color: 'purple3',
      uids: [],
      origHash,
    });

    labels = await selectStudentLabelsInCourseInstance(await selectCourseInstanceById('1'));
    labelA = labels.find((l) => l.name === 'Test Label A Renamed');
    assert.isDefined(labelA);
    assert.equal(labelA.color, 'purple3');

    // Refresh origHash after the mutation
    origHash = await getOriginalHash(
      getCourseInstanceJsonPath(courseRepo.courseLiveDir, courseInstanceShortName),
    );

    // Add students to label via edit
    await trpcClient.studentLabels.edit.mutate({
      labelId: labelA.id,
      name: 'Test Label A Renamed',
      color: 'purple3',
      uids: [studentUids[2]],
      origHash,
    });

    let studentsWithLabel = (await selectEnrollmentsInStudentLabel(labelA)).map((e) => e.id);
    assert.equal(studentsWithLabel.length, 1);
    assert.include(studentsWithLabel, enrollmentIds[2]);

    // Refresh origHash after the mutation
    origHash = await getOriginalHash(
      getCourseInstanceJsonPath(courseRepo.courseLiveDir, courseInstanceShortName),
    );

    // Remove students via edit (set empty uids)
    await trpcClient.studentLabels.edit.mutate({
      labelId: labelA.id,
      name: 'Test Label A Renamed',
      color: 'purple3',
      uids: [],
      origHash,
    });

    studentsWithLabel = (await selectEnrollmentsInStudentLabel(labelA)).map((e) => e.id);
    assert.equal(studentsWithLabel.length, 0);

    // Refresh origHash after the mutation
    origHash = await getOriginalHash(
      getCourseInstanceJsonPath(courseRepo.courseLiveDir, courseInstanceShortName),
    );

    // Attempt to rename to existing label name - should fail
    const labelB = labels.find((l) => l.name === 'Test Label B');
    assert.isDefined(labelB);

    try {
      await trpcClient.studentLabels.edit.mutate({
        labelId: labelA.id,
        name: 'Test Label B',
        color: 'purple3',
        uids: [],
        origHash,
      });
      assert.fail('Expected error for duplicate name');
    } catch (err) {
      assert.instanceOf(err, TRPCClientError);
      assert.include((err as TRPCClientErrorLike<CourseInstanceRouter>).message, 'already exists');
    }
  });

  test.sequential('should handle delete label operations', async () => {
    const trpcClient = await createTrpcClient();
    let origHash = await getOriginalHash(
      getCourseInstanceJsonPath(courseRepo.courseLiveDir, courseInstanceShortName),
    );

    // Get current labels
    let labels = await selectStudentLabelsInCourseInstance(await selectCourseInstanceById('1'));
    const labelA = labels.find((l) => l.name === 'Test Label A Renamed');
    assert.isDefined(labelA);

    await trpcClient.studentLabels.destroy.mutate({
      labelId: labelA.id,
      origHash,
    });

    // Verify label is deleted
    labels = await selectStudentLabelsInCourseInstance(await selectCourseInstanceById('1'));
    const deletedLabel = labels.find((l) => l.name === 'Test Label A Renamed');
    assert.isUndefined(deletedLabel);

    // Refresh origHash after the mutation
    origHash = await getOriginalHash(
      getCourseInstanceJsonPath(courseRepo.courseLiveDir, courseInstanceShortName),
    );

    // Attempt to delete non-existent label - should fail with NOT_FOUND
    try {
      await trpcClient.studentLabels.destroy.mutate({
        labelId: '999999',
        origHash,
      });
      assert.fail('Expected error for non-existent label');
    } catch (err) {
      assert.instanceOf(err, TRPCClientError);
    }
  });

  test.sequential('should support invited (pending) students in labels', async () => {
    const trpcClient = await createTrpcClient();
    const invitedUid = 'invited-student@example.com';

    // Create an invited enrollment (pending_uid, no user_id)
    await queryOptionalRow(
      `INSERT INTO enrollments (course_instance_id, status, pending_uid)
       VALUES ($1, 'invited', $2)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      ['1', invitedUid],
      EnrollmentSchema,
    );

    // checkUids should recognize the invited student's UID as valid
    const checkResult = await trpcClient.studentLabels.checkUids.query({ uids: [invitedUid] });
    assert.deepEqual(checkResult.unenrolledUids, []);

    // checkUids should still flag truly unknown UIDs
    const unknownUid = 'totally-unknown@example.com';
    const mixedResult = await trpcClient.studentLabels.checkUids.query({
      uids: [invitedUid, studentUids[0], unknownUid],
    });
    assert.deepEqual(mixedResult.unenrolledUids, [unknownUid]);

    // Create a label with the invited student
    const origHash = await getOriginalHash(
      getCourseInstanceJsonPath(courseRepo.courseLiveDir, courseInstanceShortName),
    );
    await trpcClient.studentLabels.create.mutate({
      name: 'Invited Label',
      color: 'red1',
      uids: [invitedUid, studentUids[0]],
      origHash,
    });

    // Verify the label has both enrollments
    const courseInstance = await selectCourseInstanceById('1');
    const labels = await selectStudentLabelsInCourseInstance(courseInstance);
    const invitedLabel = labels.find((l) => l.name === 'Invited Label');
    assert.isDefined(invitedLabel);
    const enrollmentsInLabel = await selectEnrollmentsInStudentLabel(invitedLabel);
    assert.equal(enrollmentsInLabel.length, 2);

    // Verify the display query includes the invited student
    const labelsWithUserData = await getStudentLabelsWithUserData('1');
    const labelData = labelsWithUserData.find((l) => l.student_label.name === 'Invited Label');
    assert.isDefined(labelData);
    const uidsInLabel = labelData.user_data.map((u) => u.uid);
    assert.include(uidsInLabel, invitedUid);
    assert.include(uidsInLabel, studentUids[0]);
  });
});
