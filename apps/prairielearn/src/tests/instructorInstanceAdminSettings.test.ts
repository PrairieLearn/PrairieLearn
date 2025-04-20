import * as path from 'path';

import { assert } from 'chai';
import { execa } from 'execa';
import fs from 'fs-extra';
import { step } from 'mocha-steps';
import * as tmp from 'tmp';

import { loadSqlEquiv, queryAsync } from '@prairielearn/postgres';

import { config } from '../lib/config.js';

import { fetchCheerio } from './helperClient.js';
import * as helperServer from './helperServer.js';

const siteUrl = `http://localhost:${config.serverPort}`;

const sql = loadSqlEquiv(import.meta.url);

const baseDir = tmp.dirSync().name;

const courseOriginDir = path.join(baseDir, 'courseOrigin');
const courseLiveDir = path.join(baseDir, 'courseLive');

const courseDevDir = path.join(baseDir, 'courseDev');
const courseTemplateDir = path.join(import.meta.dirname, 'testFileEditor', 'courseTemplate');

describe('Updating a course instance ID', () => {
  before(async () => {
    // Clone the course template for testing
    await execa('git', ['-c', 'init.defaultBranch=master', 'init', '--bare', courseOriginDir], {
      cwd: '.',
      env: process.env,
    });

    await execa('git', ['clone', courseOriginDir, courseLiveDir], {
      cwd: '.',
      env: process.env,
    });

    await fs.copy(courseTemplateDir, courseLiveDir);

    const execOptions = { cwd: courseLiveDir, env: process.env };
    await execa('git', ['add', '-A'], execOptions);
    await execa('git', ['commit', '-m', 'Initial commit'], execOptions);
    await execa('git', ['push', 'origin', 'master'], execOptions);
    await execa('git', ['clone', courseOriginDir, courseDevDir], { cwd: '.', env: process.env });

    await helperServer.before(courseLiveDir)();

    await queryAsync(sql.update_course_repo, { repo: courseOriginDir });
  });

  after(helperServer.after);

  step(
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
