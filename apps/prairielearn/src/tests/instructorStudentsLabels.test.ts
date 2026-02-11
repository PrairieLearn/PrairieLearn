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

import { queryRows } from '@prairielearn/postgres';

import { config } from '../lib/config.js';
import { computeCourseInstanceJsonHash } from '../lib/courseInstanceJson.js';
import { EnrollmentSchema } from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';
import {
  selectEnrollmentsInStudentLabel,
  selectStudentLabelsInCourseInstance,
} from '../models/student-label.js';
import type { StudentLabelsRouter } from '../pages/instructorStudentsLabels/trpc.js';

import {
  type CourseRepoFixture,
  createCourseRepoFixture,
  updateCourseRepository,
} from './helperCourse.js';
import * as helperServer from './helperServer.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const labelsUrl = `${siteUrl}/pl/course_instance/1/instructor/instance_admin/students/labels`;

async function getOrigHash(courseLiveDir: string, courseInstanceShortName: string) {
  const courseInstanceJsonPath = path.join(
    courseLiveDir,
    'courseInstances',
    courseInstanceShortName,
    'infoCourseInstance.json',
  );
  return await computeCourseInstanceJsonHash(courseInstanceJsonPath);
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

  return createTRPCClient<StudentLabelsRouter>({
    links: [
      httpLink({
        url: labelsUrl + '/trpc',
        headers: {
          'X-TRPC': 'true',
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

    // Create and enroll test students
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

    // Test labels query returns array of labels
    const labels = await trpcClient.labels.query();
    assert.isArray(labels);

    // Test checkUids with valid enrolled UIDs
    const validCheckResult = await trpcClient.checkUids.query({ uids: [studentUids[0]] });
    assert.deepEqual(validCheckResult.invalidUids, []);

    // Test checkUids with invalid UIDs
    const invalidUid = 'nonexistent@example.com';
    const invalidCheckResult = await trpcClient.checkUids.query({ uids: [invalidUid] });
    assert.deepEqual(invalidCheckResult.invalidUids, [invalidUid]);

    // Test checkUids with mixed valid and invalid UIDs
    const mixedCheckResult = await trpcClient.checkUids.query({
      uids: [studentUids[0], invalidUid],
    });
    assert.deepEqual(mixedCheckResult.invalidUids, [invalidUid]);
  });

  test.sequential('should handle create label operations', async () => {
    const trpcClient = await createTrpcClient();
    let origHash = await getOrigHash(courseRepo.courseLiveDir, courseInstanceShortName);

    // Create label without students
    await trpcClient.createLabel.mutate({
      name: 'Test Label A',
      color: 'blue1',
      uids: '',
      origHash,
    });

    // Verify label exists in database
    const courseInstance = await selectCourseInstanceById('1');
    let labels = await selectStudentLabelsInCourseInstance(courseInstance);
    const labelA = labels.find((l: (typeof labels)[number]) => l.name === 'Test Label A');
    assert.isDefined(labelA);
    assert.equal(labelA.color, 'blue1');

    // Refresh origHash after the first mutation
    origHash = await getOrigHash(courseRepo.courseLiveDir, courseInstanceShortName);

    // Create label with students
    await trpcClient.createLabel.mutate({
      name: 'Test Label B',
      color: 'green2',
      uids: `${studentUids[0]}\n${studentUids[1]}`,
      origHash,
    });

    // Verify label exists with enrollments
    labels = await selectStudentLabelsInCourseInstance(courseInstance);
    const labelB = labels.find((l: (typeof labels)[number]) => l.name === 'Test Label B');
    assert.isDefined(labelB);
    const studentsWithLabelB = (await selectEnrollmentsInStudentLabel(labelB)).map((e) => e.id);
    assert.equal(studentsWithLabelB.length, 2);
    assert.includeMembers(studentsWithLabelB, [enrollmentIds[0], enrollmentIds[1]]);

    // Refresh origHash after the second mutation
    origHash = await getOrigHash(courseRepo.courseLiveDir, courseInstanceShortName);

    // Attempt to create label with duplicate name - should fail
    try {
      await trpcClient.createLabel.mutate({
        name: 'Test Label A',
        color: 'red1',
        uids: '',
        origHash,
      });
      assert.fail('Expected error for duplicate name');
    } catch (err) {
      assert.instanceOf(err, TRPCClientError);
      assert.include((err as TRPCClientErrorLike<StudentLabelsRouter>).message, 'already exists');
    }

    // Attempt to create label with empty name - should fail
    try {
      await trpcClient.createLabel.mutate({
        name: '',
        color: 'gray1',
        uids: '',
        origHash,
      });
      assert.fail('Expected error for empty name');
    } catch (err) {
      assert.instanceOf(err, TRPCClientError);
    }
  });

  test.sequential('should handle edit label operations', async () => {
    const trpcClient = await createTrpcClient();
    let origHash = await getOrigHash(courseRepo.courseLiveDir, courseInstanceShortName);

    // Get current labels
    let labels = await selectStudentLabelsInCourseInstance(await selectCourseInstanceById('1'));
    let labelA = labels.find((l) => l.name === 'Test Label A');
    assert.isDefined(labelA);

    // Edit label name
    await trpcClient.editLabel.mutate({
      labelId: labelA.id,
      name: 'Test Label A Renamed',
      oldName: 'Test Label A',
      color: 'blue1',
      uids: '',
      origHash,
    });

    // Verify name changed
    labels = await selectStudentLabelsInCourseInstance(await selectCourseInstanceById('1'));
    labelA = labels.find((l) => l.name === 'Test Label A Renamed');
    assert.isDefined(labelA);

    // Refresh origHash after the mutation
    origHash = await getOrigHash(courseRepo.courseLiveDir, courseInstanceShortName);

    // Edit label color
    await trpcClient.editLabel.mutate({
      labelId: labelA.id,
      name: 'Test Label A Renamed',
      oldName: 'Test Label A Renamed',
      color: 'purple3',
      uids: '',
      origHash,
    });

    labels = await selectStudentLabelsInCourseInstance(await selectCourseInstanceById('1'));
    labelA = labels.find((l) => l.name === 'Test Label A Renamed');
    assert.isDefined(labelA);
    assert.equal(labelA.color, 'purple3');

    // Refresh origHash after the mutation
    origHash = await getOrigHash(courseRepo.courseLiveDir, courseInstanceShortName);

    // Add students to label via edit
    await trpcClient.editLabel.mutate({
      labelId: labelA.id,
      name: 'Test Label A Renamed',
      oldName: 'Test Label A Renamed',
      color: 'purple3',
      uids: studentUids[2],
      origHash,
    });

    let studentsWithLabel = (await selectEnrollmentsInStudentLabel(labelA)).map((e) => e.id);
    assert.equal(studentsWithLabel.length, 1);
    assert.include(studentsWithLabel, enrollmentIds[2]);

    // Refresh origHash after the mutation
    origHash = await getOrigHash(courseRepo.courseLiveDir, courseInstanceShortName);

    // Remove students via edit (set empty uids)
    await trpcClient.editLabel.mutate({
      labelId: labelA.id,
      name: 'Test Label A Renamed',
      oldName: 'Test Label A Renamed',
      color: 'purple3',
      uids: '',
      origHash,
    });

    studentsWithLabel = (await selectEnrollmentsInStudentLabel(labelA)).map((e) => e.id);
    assert.equal(studentsWithLabel.length, 0);

    // Refresh origHash after the mutation
    origHash = await getOrigHash(courseRepo.courseLiveDir, courseInstanceShortName);

    // Attempt to rename to existing label name - should fail
    const labelB = labels.find((l) => l.name === 'Test Label B');
    assert.isDefined(labelB);

    try {
      await trpcClient.editLabel.mutate({
        labelId: labelA.id,
        name: 'Test Label B',
        oldName: 'Test Label A Renamed',
        color: 'purple3',
        uids: '',
        origHash,
      });
      assert.fail('Expected error for duplicate name');
    } catch (err) {
      assert.instanceOf(err, TRPCClientError);
      assert.include((err as TRPCClientErrorLike<StudentLabelsRouter>).message, 'already exists');
    }
  });

  test.sequential('should handle delete label operations', async () => {
    const trpcClient = await createTrpcClient();
    let origHash = await getOrigHash(courseRepo.courseLiveDir, courseInstanceShortName);

    // Get current labels
    let labels = await selectStudentLabelsInCourseInstance(await selectCourseInstanceById('1'));
    const labelA = labels.find((l) => l.name === 'Test Label A Renamed');
    assert.isDefined(labelA);

    // Delete existing label
    await trpcClient.deleteLabel.mutate({
      labelId: labelA.id,
      labelName: 'Test Label A Renamed',
      origHash,
    });

    // Verify label is deleted
    labels = await selectStudentLabelsInCourseInstance(await selectCourseInstanceById('1'));
    const deletedLabel = labels.find((l) => l.name === 'Test Label A Renamed');
    assert.isUndefined(deletedLabel);

    // Refresh origHash after the mutation
    origHash = await getOrigHash(courseRepo.courseLiveDir, courseInstanceShortName);

    // Attempt to delete with wrong label name - should fail with NOT_FOUND
    const labelB = labels.find((l) => l.name === 'Test Label B');
    assert.isDefined(labelB);

    try {
      await trpcClient.deleteLabel.mutate({
        labelId: labelB.id,
        labelName: 'Wrong Name',
        origHash,
      });
      assert.fail('Expected error for wrong label name');
    } catch (err) {
      assert.instanceOf(err, TRPCClientError);
      assert.include(
        (err as TRPCClientErrorLike<StudentLabelsRouter>).message,
        'not found in course configuration',
      );
    }
  });
});
