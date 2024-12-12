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
const courseInstancesCourseLiveDir = path.join(courseLiveDir, 'courseInstances');

const courseDevDir = path.join(baseDir, 'courseDev');
const courseTemplateDir = path.join(import.meta.dirname, 'testFileEditor', 'courseTemplate');

describe('Create course instance', () => {
  before(async () => {
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

  step('create a course instance', async () => {
    const courseInstancePageResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );

    assert.equal(courseInstancePageResponse.status, 200);

    const courseInstanceCreationResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
      {
        method: 'POST',
        form: {
          __action: 'add_course_instance',
          __csrf_token: courseInstancePageResponse.$('input[name=__csrf_token]').val(),
          orig_hash: courseInstancePageResponse.$('input[name=orig_hash]').val(),
          short_name: 'Fa19',
          long_name: 'Fall 2019',
          start_access_date: '2021-01-01T00:00',
          end_access_date: '2021-01-02T00:00',
        },
      },
    );
    assert.equal(courseInstanceCreationResponse.status, 200);
    assert.equal(
      courseInstanceCreationResponse.url,
      `${siteUrl}/pl/course_instance/2/instructor/instance_admin/assessments`,
    );
  });

  step('verify course instance has the correct info', async () => {
    const courseInstanceInfoPath = path.join(
      courseInstancesCourseLiveDir,
      'Fa19',
      'infoCourseInstance.json',
    );

    const courseInstanceInfo = JSON.parse(await fs.readFile(courseInstanceInfoPath, 'utf8'));

    assert.equal(courseInstanceInfo.longName, 'Fall 2019');
    assert.equal(courseInstanceInfo.allowAccess.length, 1);
    assert.equal(courseInstanceInfo.allowAccess[0].startDate, '2021-01-01T00:00:00');
    assert.equal(courseInstanceInfo.allowAccess[0].endDate, '2021-01-02T00:00:00');
  });

  step('add 2nd course instance with the same name', async () => {
    const courseInstancePageResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );

    assert.equal(courseInstancePageResponse.status, 200);

    const courseInstanceCreationResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
      {
        method: 'POST',
        form: {
          __action: 'add_course_instance',
          __csrf_token: courseInstancePageResponse.$('input[name=__csrf_token]').val(),
          orig_hash: courseInstancePageResponse.$('input[name=orig_hash]').val(),
          short_name: 'Fa19',
          long_name: 'Fall 2019',
          start_access_date: '2021-01-01T00:00',
          end_access_date: '2021-01-02T00:00',
        },
      },
    );
    assert.equal(courseInstanceCreationResponse.status, 200);
    assert.equal(
      courseInstanceCreationResponse.url,
      `${siteUrl}/pl/course_instance/3/instructor/instance_admin/assessments`,
    );
  });

  step('verify that duplicate course instance name had 2 appended to it', async () => {
    const courseInstanceInfoPath = path.join(
      courseInstancesCourseLiveDir,
      'Fa19_2',
      'infoCourseInstance.json',
    );

    const courseInstanceInfo = JSON.parse(await fs.readFile(courseInstanceInfoPath, 'utf8'));

    assert.equal(courseInstanceInfo.longName, 'Fall 2019 (2)');
  });

  step('add 3rd course instance with the same name', async () => {
    const courseInstancePageResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );

    assert.equal(courseInstancePageResponse.status, 200);

    const courseInstanceCreationResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
      {
        method: 'POST',
        form: {
          __action: 'add_course_instance',
          __csrf_token: courseInstancePageResponse.$('input[name=__csrf_token]').val(),
          orig_hash: courseInstancePageResponse.$('input[name=orig_hash]').val(),
          short_name: 'Fa19',
          long_name: 'Fall 2019',
          start_access_date: '2021-01-01T00:00',
          end_access_date: '2021-01-02T00:00',
        },
      },
    );
    assert.equal(courseInstanceCreationResponse.status, 200);
    assert.equal(
      courseInstanceCreationResponse.url,
      `${siteUrl}/pl/course_instance/4/instructor/instance_admin/assessments`,
    );
  });

  step('verify that duplicate course instance name had 3 appended to it', async () => {
    const courseInstanceInfoPath = path.join(
      courseInstancesCourseLiveDir,
      'Fa19_3',
      'infoCourseInstance.json',
    );

    const courseInstanceInfo = JSON.parse(await fs.readFile(courseInstanceInfoPath, 'utf8'));

    assert.equal(courseInstanceInfo.longName, 'Fall 2019 (3)');
  });

  step('should not be able to create course instance with start date after end date', async () => {
    const courseInstancePageResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );

    assert.equal(courseInstancePageResponse.status, 200);

    const courseInstanceCreationResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
      {
        method: 'POST',
        form: {
          __action: 'add_course_instance',
          __csrf_token: courseInstancePageResponse.$('input[name=__csrf_token]').val(),
          orig_hash: courseInstancePageResponse.$('input[name=orig_hash]').val(),
          short_name: 'Fa19',
          long_name: 'Fall 2019',
          start_access_date: '2021-01-02T00:00',
          end_access_date: '2021-01-01T00:00',
        },
      },
    );

    assert.match(courseInstanceCreationResponse.url, /\/pl\/course\/1\/edit_error\/\d+$/);
  });

  step('should not be able to create course instance with no short_name', async () => {
    const courseInstancePageResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );

    assert.equal(courseInstancePageResponse.status, 200);

    const courseInstanceCreationResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
      {
        method: 'POST',
        form: {
          __action: 'add_course_instance',
          __csrf_token: courseInstancePageResponse.$('input[name=__csrf_token]').val(),
          orig_hash: courseInstancePageResponse.$('input[name=orig_hash]').val(),
          long_name: 'Fall 2019',
          start_access_date: '2021-01-01T00:00',
          end_access_date: '2021-01-02T00:00',
        },
      },
    );

    assert.equal(courseInstanceCreationResponse.status, 400);
    assert.equal(
      courseInstanceCreationResponse.url,
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );
  });

  step('should not be able to create course instance with no long_name', async () => {
    const courseInstancePageResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );

    assert.equal(courseInstancePageResponse.status, 200);

    const courseInstanceCreationResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
      {
        method: 'POST',
        form: {
          __action: 'add_course_instance',
          __csrf_token: courseInstancePageResponse.$('input[name=__csrf_token]').val(),
          orig_hash: courseInstancePageResponse.$('input[name=orig_hash]').val(),
          short_name: 'Fa19',
          start_access_date: '2021-01-01T00:00',
          end_access_date: '2021-01-02T00:00',
        },
      },
    );

    assert.equal(courseInstanceCreationResponse.status, 400);
    assert.equal(
      courseInstanceCreationResponse.url,
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );
  });
});
