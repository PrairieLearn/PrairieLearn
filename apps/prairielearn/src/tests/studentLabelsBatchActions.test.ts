import * as crypto from 'node:crypto';

import { TRPCClientError } from '@trpc/client';
import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { config } from '../lib/config.js';
import type { CourseInstance, StudentLabel } from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import {
  generateAndEnrollUsers,
  selectEnrollmentsByIdsInCourseInstance,
  selectEnrollmentsByUidsOrPendingUidsInCourseInstance,
} from '../models/enrollment.js';
import { createStudentLabel, selectEnrollmentsInStudentLabel } from '../models/student-label.js';
import { createCourseInstanceTrpcClient } from '../trpc/courseInstance/client.js';

import {
  type CourseRepoFixture,
  createCourseRepoFixture,
  updateCourseRepository,
} from './helperCourse.js';
import * as helperServer from './helperServer.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const studentsUrl = `${siteUrl}/pl/course_instance/1/instructor/instance_admin/students`;

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

describe('Student labels batch actions', () => {
  let courseInstance: CourseInstance;
  let label: StudentLabel;
  let enrollmentIds: string[];
  let courseRepo: CourseRepoFixture;

  beforeAll(async () => {
    courseRepo = await createCourseRepoFixture(TEST_COURSE_PATH);
    await helperServer.before(courseRepo.courseLiveDir)();
    await updateCourseRepository({ courseId: '1', repository: courseRepo.courseOriginDir });

    courseInstance = await selectCourseInstanceById('1');
    const users = await generateAndEnrollUsers({ count: 3, course_instance_id: '1' });
    const uidEnrollments = await selectEnrollmentsByUidsOrPendingUidsInCourseInstance({
      uids: users.map((u) => u.uid),
      courseInstance,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
    });
    enrollmentIds = uidEnrollments.map((e) => e.enrollment.id);

    label = await createStudentLabel({
      courseInstance,
      uuid: crypto.randomUUID(),
      name: 'Batch Test Label',
      color: 'blue1',
    });
  });

  afterAll(helperServer.after);

  test.sequential('should load the students page', async () => {
    const response = await fetch(studentsUrl);
    assert.equal(response.status, 200);
  });

  test.sequential('should batch add label to multiple students', async () => {
    const trpcClient = createTrpcClient();
    await trpcClient.studentLabels.batchAdd.mutate({
      enrollmentIds,
      labelId: label.id,
    });

    const enrollments = await selectEnrollmentsByIdsInCourseInstance({
      ids: enrollmentIds,
      courseInstance,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
    });
    assert.equal(enrollments.length, 3);

    const studentsWithLabel = (await selectEnrollmentsInStudentLabel(label)).map((e) => e.id);
    assert.equal(studentsWithLabel.length, 3);
    assert.includeMembers(studentsWithLabel, enrollmentIds);
  });

  test.sequential('should batch remove label from multiple students', async () => {
    const trpcClient = createTrpcClient();
    await trpcClient.studentLabels.batchRemove.mutate({
      enrollmentIds: [enrollmentIds[0], enrollmentIds[1]],
      labelId: label.id,
    });

    const studentsWithLabel = (await selectEnrollmentsInStudentLabel(label)).map((e) => e.id);
    assert.deepEqual(studentsWithLabel, [enrollmentIds[2]]);
  });

  test.sequential('should remove label from the last student', async () => {
    const trpcClient = createTrpcClient();
    await trpcClient.studentLabels.batchRemove.mutate({
      enrollmentIds: [enrollmentIds[2]],
      labelId: label.id,
    });

    const studentsWithLabel = (await selectEnrollmentsInStudentLabel(label)).map((e) => e.id);
    assert.equal(studentsWithLabel.length, 0);
  });

  test.sequential('should fail when adding non-existent label', async () => {
    const trpcClient = createTrpcClient();
    try {
      await trpcClient.studentLabels.batchAdd.mutate({
        enrollmentIds: [enrollmentIds[0]],
        labelId: '999999',
      });
      assert.fail('Expected error for non-existent label');
    } catch (error) {
      assert.instanceOf(error, TRPCClientError);
    }
  });
});
