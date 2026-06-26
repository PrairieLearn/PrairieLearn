import * as path from 'path';

import fs from 'fs-extra';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { config } from '../lib/config.js';
import { features } from '../lib/features/index.js';

import { fetchCheerio } from './helperClient.js';
import {
  type CourseRepoFixture,
  commitOriginAndSync,
  createCourseRepoFixture,
  updateCourseRepository,
} from './helperCourse.js';
import * as helperServer from './helperServer.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const courseTemplateDir = path.join(import.meta.dirname, 'testFileEditor', 'courseTemplate');

let courseRepo: CourseRepoFixture;

async function setSharingFilesPublic(sharePublicly: boolean) {
  const fileUpdates = [
    {
      relPath: 'questions/test/question/info.json',
      properties: ['sharePublicly', 'shareSourcePublicly'],
    },
    {
      relPath: 'courseInstances/Fa18/assessments/HW1/infoAssessment.json',
      properties: ['shareSourcePublicly'],
    },
    {
      relPath: 'courseInstances/Fa18/infoCourseInstance.json',
      properties: ['shareSourcePublicly'],
    },
  ];

  for (const fileUpdate of fileUpdates) {
    const absPath = path.join(courseRepo.courseOriginDir, fileUpdate.relPath);
    const info = await fs.readJSON(absPath);
    for (const property of fileUpdate.properties) {
      if (sharePublicly) {
        info[property] = true;
      } else {
        delete info[property];
      }
    }
    await fs.writeJSON(absPath, info, { spaces: 2 });
  }

  await commitOriginAndSync(
    courseRepo,
    sharePublicly ? 'Share test content' : 'Unshare test content',
    fileUpdates.map((u) => u.relPath),
  );
}

describe('Updating a course instance ID', { concurrent: false }, () => {
  beforeAll(async () => {
    courseRepo = await createCourseRepoFixture(courseTemplateDir);
    await helperServer.before(courseRepo.courseLiveDir)();
    await updateCourseRepository({ courseId: '1', repository: courseRepo.courseOriginDir });
    // The sharing-related tests below rely on the share_source_publicly server-side
    // validation, which only runs when this feature flag is enabled.
    await features.enable('question-sharing');
  });

  afterAll(async () => {
    await features.disable('question-sharing');
    await helperServer.after();
  });

  test('should not be able to change course instance id to one that falls outside the correct root directory', async () => {
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
  });

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
      display_timezone: 'America/Chicago',
      group_assessments_by: 'Set',
    };
    if (shareSourcePublicly) body.share_source_publicly = 'on';
    for (const name of [
      'self_enrollment_enabled',
      'self_enrollment_use_enrollment_code',
      'self_enrollment_restrict_to_institution',
      'self_enrollment_enabled_before_date_enabled',
      'self_enrollment_enabled_before_date',
    ]) {
      const value = settingsPageResponse.$(`input[name="${name}"]`).last().val();
      if (typeof value === 'string') body[name] = value;
    }
    return body;
  }

  test('cannot share course instance source publicly while it contains non-public assessments', async () => {
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
  });

  test('un-shares course instance source', async () => {
    await setSharingFilesPublic(true);
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
      assert.equal(response.status, 200);
      const courseInstanceInfoPath = path.join(
        courseRepo.courseLiveDir,
        'courseInstances',
        'Fa18',
        'infoCourseInstance.json',
      );
      const courseInstanceInfo = await fs.readJSON(courseInstanceInfoPath);
      assert.isUndefined(courseInstanceInfo.shareSourcePublicly);
    } finally {
      await setSharingFilesPublic(false);
    }
  });
});
