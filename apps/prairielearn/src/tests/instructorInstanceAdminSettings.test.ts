import * as path from 'path';

import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { execute } from '@prairielearn/postgres';

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

  async function buildUpdateConfigurationBody({
    shareSourcePublicly,
  }: {
    shareSourcePublicly: boolean;
  }) {
    const settingsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/instance_admin/settings`,
    );
    assert.equal(settingsPageResponse.status, 200);

    const body: Record<string, string> = {
      __action: 'update_configuration',
      __csrf_token: settingsPageResponse.$('input[name=__csrf_token]').val() as string,
      orig_hash: settingsPageResponse.$('input[name=orig_hash]').val() as string,
      ciid: 'Fa18',
      long_name: 'Fall 2018',
      display_timezone: '',
      group_assessments_by: 'Set',
    };
    if (shareSourcePublicly) body.share_source_publicly = 'on';
    return body;
  }

  test.sequential(
    'cannot share course instance source publicly while it contains non-public assessments',
    async () => {
      const response = await fetchCheerio(
        `${siteUrl}/pl/course_instance/1/instructor/instance_admin/settings`,
        {
          method: 'POST',
          body: new URLSearchParams(
            await buildUpdateConfigurationBody({ shareSourcePublicly: true }),
          ),
        },
      );
      assert.equal(response.status, 400);
    },
  );

  test.sequential('cannot un-share a course instance whose source is already public', async () => {
    await execute(
      'UPDATE course_instances SET share_source_publicly = TRUE WHERE id = $course_instance_id',
      { course_instance_id: '1' },
    );
    try {
      const response = await fetchCheerio(
        `${siteUrl}/pl/course_instance/1/instructor/instance_admin/settings`,
        {
          method: 'POST',
          body: new URLSearchParams(
            await buildUpdateConfigurationBody({ shareSourcePublicly: false }),
          ),
        },
      );
      assert.equal(response.status, 400);
    } finally {
      await execute(
        'UPDATE course_instances SET share_source_publicly = FALSE WHERE id = $course_instance_id',
        { course_instance_id: '1' },
      );
    }
  });
});
