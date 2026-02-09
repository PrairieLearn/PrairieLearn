import { TRPCClientError, createTRPCClient, httpLink } from '@trpc/client';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import superjson from 'superjson';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { queryRows } from '@prairielearn/postgres';

import { config } from '../lib/config.js';
import { EnrollmentSchema, type StudentLabel } from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';
import { createStudentLabel, selectEnrollmentsInStudentLabel } from '../models/student-label.js';
import type { StudentLabelsRouter } from '../pages/instructorStudentsLabels/trpc.js';

import {
  type CourseRepoFixture,
  createCourseRepoFixture,
  updateCourseRepository,
} from './helperCourse.js';
import * as helperServer from './helperServer.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const studentsUrl = `${siteUrl}/pl/course_instance/1/instructor/instance_admin/students`;

async function createTrpcClient() {
  // Fetch the students page to get the CSRF token from hydration data
  const pageResponse = await fetch(studentsUrl);
  const pageHtml = await pageResponse.text();
  const $ = cheerio.load(pageHtml);

  // Extract trpcCsrfToken from the hydration data
  const dataScript = $('script[data-component-props][data-component="InstructorStudents"]');
  const propsJson = dataScript.text();
  const props = superjson.parse<{ trpcCsrfToken: string }>(propsJson);
  const trpcCsrfToken = props.trpcCsrfToken;

  return createTRPCClient<StudentLabelsRouter>({
    links: [
      httpLink({
        url: studentsUrl + '/trpc',
        headers: {
          'X-TRPC': 'true',
          'X-CSRF-Token': trpcCsrfToken,
        },
        transformer: superjson,
      }),
    ],
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

    const users = await generateAndEnrollUsers({ count: 3, course_instance_id: '1' });
    const userIds = users.map((u) => u.id);
    const enrollments = await queryRows(
      'SELECT * FROM enrollments WHERE user_id = ANY($1::bigint[])',
      [userIds],
      EnrollmentSchema,
    );
    enrollmentIds = enrollments.map((e) => e.id);

    label = await createStudentLabel({ courseInstanceId: '1', name: 'Batch Test Label' });
  });

  afterAll(helperServer.after);

  test.sequential('should load the students page', async () => {
    const response = await fetch(studentsUrl);
    assert.equal(response.status, 200);
  });

  test.sequential('should batch add label to multiple students', async () => {
    const trpcClient = await createTrpcClient();
    await trpcClient.batchAddLabel.mutate({
      enrollmentIds,
      labelId: label.id,
    });

    const studentsWithLabel = (await selectEnrollmentsInStudentLabel(label)).map((e) => e.id);
    assert.equal(studentsWithLabel.length, 3);
    assert.includeMembers(studentsWithLabel, enrollmentIds);
  });

  test.sequential('should batch remove label from multiple students', async () => {
    const trpcClient = await createTrpcClient();
    await trpcClient.batchRemoveLabel.mutate({
      enrollmentIds: [enrollmentIds[0], enrollmentIds[1]],
      labelId: label.id,
    });

    const studentsWithLabel = (await selectEnrollmentsInStudentLabel(label)).map((e) => e.id);
    assert.deepEqual(studentsWithLabel, [enrollmentIds[2]]);
  });

  test.sequential('should remove label from the last student', async () => {
    const trpcClient = await createTrpcClient();
    await trpcClient.batchRemoveLabel.mutate({
      enrollmentIds: [enrollmentIds[2]],
      labelId: label.id,
    });

    const studentsWithLabel = (await selectEnrollmentsInStudentLabel(label)).map((e) => e.id);
    assert.equal(studentsWithLabel.length, 0);
  });

  test.sequential('should fail when adding non-existent label', async () => {
    const trpcClient = await createTrpcClient();
    try {
      await trpcClient.batchAddLabel.mutate({
        enrollmentIds: [enrollmentIds[0]],
        labelId: '999999',
      });
      assert.fail('Expected error for non-existent label');
    } catch (error) {
      assert.instanceOf(error, TRPCClientError);
    }
  });
});
