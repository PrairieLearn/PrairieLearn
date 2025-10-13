import * as fs from 'node:fs/promises';
import * as path from 'path';

import { execa } from 'execa';
import { move } from 'fs-extra/esm';
import fetch from 'node-fetch';
import * as tmp from 'tmp';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import { config } from '../lib/config.js';
import { insertCoursePermissionsByUserUid } from '../models/course-permissions.js';
import { selectCourseById } from '../models/course.js';

import { fetchCheerio } from './helperClient.js';
import * as helperServer from './helperServer.js';
import { getOrCreateUser, withUser } from './utils/auth.js';

const sql = loadSqlEquiv(import.meta.url);

const courseTemplateDir = path.join(import.meta.dirname, 'testFileEditor', 'courseTemplate');
const baseDir = tmp.dirSync().name;
const courseOriginDir = path.join(baseDir, 'courseOrigin');
const courseLiveDir = path.join(baseDir, 'courseLive');
const courseLiveInfoPath = path.join(courseLiveDir, 'infoCourse.json');
const courseDevDir = path.join(baseDir, 'courseDev');
const courseDevInfoPath = path.join(courseDevDir, 'infoCourse.json');

const siteUrl = `http://localhost:${config.serverPort}`;

describe('Editing course settings', () => {
  beforeAll(async () => {
    // init git repo in directory
    await execa('git', ['-c', 'init.defaultBranch=master', 'init', '--bare', courseOriginDir], {
      cwd: '.',
      env: process.env,
    });

    await execa('git', ['clone', courseOriginDir, courseLiveDir], {
      cwd: '.',
      env: process.env,
    });

    // create course files
    await fs.cp(courseTemplateDir, courseLiveDir, { recursive: true });

    const execOptions = { cwd: courseLiveDir, env: process.env };
    await execa('git', ['add', '-A'], execOptions);
    await execa('git', ['commit', '-m', 'Initial commit'], execOptions);
    await execa('git', ['push', 'origin', 'master'], execOptions);
    await execa('git', ['clone', courseOriginDir, courseDevDir], { cwd: '.', env: process.env });

    await helperServer.before(courseLiveDir)();

    // update db with course repo info
    await execute(sql.update_course_repo, { repo: courseOriginDir });
  });
  afterAll(helperServer.after);

  test.sequential('access the test course info file', async () => {
    const courseInfo = JSON.parse(await fs.readFile(courseLiveInfoPath, 'utf8'));
    assert.equal(courseInfo.name, 'TEST 101');
  });

  test.sequential('change course info', async () => {
    const settingsPageResponse = await fetchCheerio(`${siteUrl}/pl/course/1/course_admin/settings`);
    assert.equal(settingsPageResponse.status, 200);

    const response = await fetch(`${siteUrl}/pl/course/1/course_admin/settings`, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'update_configuration',
        __csrf_token: settingsPageResponse.$('input[name="__csrf_token"]').val() as string,
        orig_hash: settingsPageResponse.$('input[name="orig_hash"]').val() as string,
        short_name: 'TEST 102',
        title: 'Test Course 102',
        display_timezone: 'America/Los_Angeles',
      }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.url, `${siteUrl}/pl/course/1/course_admin/settings`);
  });

  test.sequential('verify course info change', async () => {
    const courseLiveInfo = JSON.parse(await fs.readFile(courseLiveInfoPath, 'utf8'));
    assert.equal(courseLiveInfo.name, 'TEST 102');
    assert.equal(courseLiveInfo.title, 'Test Course 102');
    assert.equal(courseLiveInfo.timezone, 'America/Los_Angeles');
  });

  test.sequential('pull and verify changes', async () => {
    await execa('git', ['pull'], { cwd: courseDevDir, env: process.env });
    const courseDevInfo = JSON.parse(
      await fs.readFile(path.join(courseDevDir, 'infoCourse.json'), 'utf8'),
    );
    assert.equal(courseDevInfo.name, 'TEST 102');
    assert.equal(courseDevInfo.title, 'Test Course 102');
    assert.equal(courseDevInfo.timezone, 'America/Los_Angeles');
  });

  test.sequential('verify course info change in db', async () => {
    const course = await selectCourseById('1');
    assert.equal(course.short_name, 'TEST 102');
    assert.equal(course.title, 'Test Course 102');
    assert.equal(course.display_timezone, 'America/Los_Angeles');
  });

  // try submitting without being an authorized user
  test.sequential('should not be able to submit without being an authorized user', async () => {
    const user = await getOrCreateUser({
      uid: 'viewer@example.com',
      name: 'Viewer User',
      uin: 'viewer',
      email: 'viewer@example.com',
    });
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'viewer@example.com',
      course_role: 'Viewer',
      authn_user_id: '1',
    });
    await withUser(user, async () => {
      const settingsPageResponse = await fetchCheerio(
        `${siteUrl}/pl/course/1/course_admin/settings`,
      );
      assert.equal(settingsPageResponse.status, 200);

      const response = await fetch(`${siteUrl}/pl/course/1/course_admin/settings`, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'update_configuration',
          __csrf_token: settingsPageResponse.$('input[name="__csrf_token"]').val() as string,
          orig_hash: settingsPageResponse.$('input[name="orig_hash"]').val() as string,
          short_name: 'TEST 103',
          title: 'Test Course 103',
          display_timezone: 'America/Los_Angeles',
        }),
      });
      assert.equal(response.status, 403);
    });
  });

  test.sequential('should not be able to submit without course info file', async () => {
    await move(courseLiveInfoPath, `${courseLiveInfoPath}.bak`);
    try {
      const settingsPageResponse = await fetchCheerio(
        `${siteUrl}/pl/course/1/course_admin/settings`,
      );
      assert.equal(settingsPageResponse.status, 200);

      const response = await fetch(`${siteUrl}/pl/course/1/course_admin/settings`, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'update_configuration',
          __csrf_token: settingsPageResponse.$('input[name="__csrf_token"]').val() as string,
          orig_hash: settingsPageResponse.$('input[name="orig_hash"]').val() as string,
          short_name: 'TEST 104',
          title: 'Test Course 104',
          display_timezone: 'America/Los_Angeles',
        }),
      });
      assert.equal(response.status, 400);
    } finally {
      await move(`${courseLiveInfoPath}.bak`, courseLiveInfoPath);
    }
  });

  test.sequential('should be able to submit without any changes', async () => {
    const courseInfo = JSON.parse(await fs.readFile(courseLiveInfoPath, 'utf8'));
    const settingsPageResponse = await fetchCheerio(`${siteUrl}/pl/course/1/course_admin/settings`);
    const response = await fetch(`${siteUrl}/pl/course/1/course_admin/settings`, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'update_configuration',
        __csrf_token: settingsPageResponse.$('input[name="__csrf_token"]').val() as string,
        orig_hash: settingsPageResponse.$('input[name="orig_hash"]').val() as string,
        short_name: courseInfo.name,
        title: courseInfo.title,
        display_timezone: courseInfo.timezone,
      }),
    });
    assert.equal(response.status, 200);
    assert.match(response.url, /\/pl\/course\/1\/course_admin\/settings$/);
  });

  test.sequential(
    'should not be able to submit if repo course info file has been changed',
    async () => {
      const settingsPageResponse = await fetchCheerio(
        `${siteUrl}/pl/course/1/course_admin/settings`,
      );

      const courseInfo = JSON.parse(await fs.readFile(courseDevInfoPath, 'utf8'));
      const newCourseInfo = { ...courseInfo, name: 'TEST 107' };
      await fs.writeFile(courseDevInfoPath, JSON.stringify(newCourseInfo, null, 2));
      await execa('git', ['add', '-A'], { cwd: courseDevDir, env: process.env });
      await execa('git', ['commit', '-m', 'Change course info'], {
        cwd: courseDevDir,
        env: process.env,
      });
      await execa('git', ['push', 'origin', 'master'], { cwd: courseDevDir, env: process.env });

      const response = await fetch(`${siteUrl}/pl/course/1/course_admin/settings`, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'update_configuration',
          __csrf_token: settingsPageResponse.$('input[name="__csrf_token"]').val() as string,
          orig_hash: settingsPageResponse.$('input[name="orig_hash"]').val() as string,
          short_name: 'TEST 108',
          title: 'Test Course 108',
          display_timezone: 'America/Los_Angeles',
        }),
      });
      assert.equal(response.status, 200);
      assert.match(response.url, /\/pl\/course\/1\/edit_error\/\d+$/);
    },
  );
});
