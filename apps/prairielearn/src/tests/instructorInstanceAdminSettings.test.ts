import * as path from 'path';

import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { config } from '../lib/config.js';

import { fetchCheerio } from './helperClient.js';
import {
  type CourseRepoFixture,
  createCourseRepoFixture,
  updateCourseRepository,
} from './helperCourse.js';
import * as helperServer from './helperServer.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const courseTemplateDir = path.join(import.meta.dirname, 'testFileEditor', 'courseTemplate');

let courseRepo: CourseRepoFixture;

describe('Updating a course instance ID', () => {
  beforeAll(async () => {
    courseRepo = await createCourseRepoFixture(courseTemplateDir);
    await helperServer.before(courseRepo.courseLiveDir)();
    await updateCourseRepository({ courseId: '1', repository: courseRepo.courseOriginDir });
  });

  afterAll(helperServer.after);

  test.sequential(
    'should not be able to change course instance id to one that falls outside the correct root directory',
    async () => {
      const courseInstancePageResponse = await fetchCheerio(
        `${siteUrl}/pl/course_instance/1/instructor/instance_admin/settings`,
      );

      assert.equal(courseInstancePageResponse.status, 200);

      // Attempt to update the course instance id to one that falls outside the correct root directory
      // It should fail
      const courseInstanceCreationResponse = await fetchCheerio(
        `${siteUrl}/pl/course_instance/1/instructor/instance_admin/settings`,
        {
          method: 'POST',
          body: new URLSearchParams({
            __action: 'change_id',
            __csrf_token: courseInstancePageResponse.$('input[name=__csrf_token]').val() as string,
            id: '../Fa25',
          }),
        },
      );

      assert.equal(courseInstanceCreationResponse.status, 400);
      assert.equal(
        courseInstanceCreationResponse.url,
        `${siteUrl}/pl/course_instance/1/instructor/instance_admin/settings`,
      );
    },
  );
});
