import * as path from 'path';

import { execa } from 'execa';
import fs from 'fs-extra';
import fetch from 'node-fetch';
import * as tmp from 'tmp';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { config } from '../lib/config.js';
import { insertCoursePermissionsByUserUid } from '../models/course-permissions.js';
import { selectQuestionById } from '../models/question.js';

import { fetchCheerio } from './helperClient.js';
import { updateCourseRepository } from './helperCourse.js';
import * as helperServer from './helperServer.js';
import { getOrCreateUser, withUser } from './utils/auth.js';

const courseTemplateDir = path.join(import.meta.dirname, 'testFileEditor', 'courseTemplate');
const baseDir = tmp.dirSync().name;
const courseOriginDir = path.join(baseDir, 'courseOrigin');
const courseLiveDir = path.join(baseDir, 'courseLive');
const courseDevDir = path.join(baseDir, 'courseDev');
const questionLiveDir = path.join(courseLiveDir, 'questions');
let questionLiveInfoPath = path.join(questionLiveDir, 'test', 'question', 'info.json');
const questionDevDir = path.join(courseDevDir, 'questions', 'test', 'question');
let questionDevInfoPath = path.join(questionDevDir, 'info.json');

const siteUrl = `http://localhost:${config.serverPort}`;

describe('Editing question settings', () => {
  beforeAll(async () => {
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

    await updateCourseRepository({ courseId: '1', repository: courseOriginDir });
  });

  afterAll(helperServer.after);

  test.sequential('access the test question info file', async () => {
    const questionInfo = JSON.parse(await fs.readFile(questionLiveInfoPath, 'utf8'));
    assert.equal(questionInfo.title, 'Test question');
  });

  test.sequential('change question info', async () => {
    const settingsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`,
    );
    assert.equal(settingsPageResponse.status, 200);

    const response = await fetch(`${siteUrl}/pl/course_instance/1/instructor/question/1/settings`, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'update_question',
        __csrf_token: settingsPageResponse.$('input[name=__csrf_token]').val() as string,
        orig_hash: settingsPageResponse.$('input[name=orig_hash]').val() as string,
        title: 'New title',
        qid: 'question',
        topic: 'Test2',
        tags: 'test2',
        grading_method: 'Internal',
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(response.url, `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`);
  });

  test.sequential('verify question info change', async () => {
    questionLiveInfoPath = path.join(questionLiveDir, 'question', 'info.json');
    const questionLiveInfo = JSON.parse(await fs.readFile(questionLiveInfoPath, 'utf8'));
    assert.equal(questionLiveInfo.title, 'New title');
  });

  test.sequential('verify nesting a question id', async () => {
    const settingsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`,
    );
    assert.equal(settingsPageResponse.status, 200);

    const body = new URLSearchParams({
      __action: 'update_question',
      __csrf_token: settingsPageResponse.$('input[name=__csrf_token]').val() as string,
      orig_hash: settingsPageResponse.$('input[name=orig_hash]').val() as string,
      title: 'New title',
      qid: 'test/question1',
      topic: 'Test',
      grading_method: 'Internal',
    });
    body.append('tags', 'test1');
    body.append('tags', 'test2');

    const response = await fetch(`${siteUrl}/pl/course_instance/1/instructor/question/1/settings`, {
      method: 'POST',
      body,
    });

    assert.equal(response.status, 200);
    assert.equal(response.url, `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`);
  });

  test.sequential('verify changing qid did not leave any empty directories', async () => {
    const questionDir = path.join(courseLiveDir, 'question');
    assert.notOk(await fs.pathExists(questionDir));
  });

  test.sequential('pull and verify changes', async () => {
    await execa('git', ['pull'], { cwd: courseDevDir, env: process.env });
    questionDevInfoPath = path.join(courseDevDir, 'questions', 'test', 'question1', 'info.json');
    const questionDevInfo = JSON.parse(await fs.readFile(questionDevInfoPath, 'utf8'));
    assert.equal(questionDevInfo.title, 'New title');
  });

  test.sequential('verify question info change in db', async () => {
    const question = await selectQuestionById('1');
    assert.equal(question.title, 'New title');
  });

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
        `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`,
      );
      assert.equal(settingsPageResponse.status, 200);

      const response = await fetch(
        `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`,
        {
          method: 'POST',
          body: new URLSearchParams({
            __action: 'update_question',
            __csrf_token: settingsPageResponse.$('input[name="__csrf_token"]').val() as string,
            orig_hash: settingsPageResponse.$('input[name="orig_hash"]').val() as string,
            title: 'Test Title - Unauthorized',
            qid: 'test/question',
            grading_method: 'Internal',
          }),
        },
      );
      assert.equal(response.status, 403);
    });
  });

  test.sequential('should not be able to submit without question info file', async () => {
    questionLiveInfoPath = path.join(questionLiveDir, 'test', 'question1', 'info.json');
    await fs.move(questionLiveInfoPath, `${questionLiveInfoPath}.bak`);
    try {
      const settingsPageResponse = await fetchCheerio(
        `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`,
      );
      assert.equal(settingsPageResponse.status, 200);

      const response = await fetch(
        `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`,
        {
          method: 'POST',
          body: new URLSearchParams({
            __action: 'update_question',
            __csrf_token: settingsPageResponse.$('input[name="__csrf_token"]').val() as string,
            orig_hash: settingsPageResponse.$('input[name="orig_hash"]').val() as string,
            title: 'Test title - no info file',
            qid: 'test/question',
            grading_method: 'Internal',
          }),
        },
      );
      assert.equal(response.status, 400);
    } finally {
      await fs.move(`${questionLiveInfoPath}.bak`, questionLiveInfoPath);
    }
  });

  test.sequential(
    'should not be able to submit if repo question info file has been changed',
    async () => {
      const settingsPageResponse = await fetchCheerio(
        `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`,
      );
      assert.equal(settingsPageResponse.status, 200);

      const questionInfo = JSON.parse(await fs.readFile(questionLiveInfoPath, 'utf8'));
      const newQuestionInfo = { ...questionInfo, title: 'New title - changed' };
      await fs.writeFile(questionLiveInfoPath, JSON.stringify(newQuestionInfo, null, 2));
      await execa('git', ['add', '-A'], { cwd: courseLiveDir, env: process.env });
      await execa('git', ['commit', '-m', 'Change question info'], {
        cwd: courseLiveDir,
        env: process.env,
      });
      await execa('git', ['push', 'origin', 'master'], { cwd: courseLiveDir, env: process.env });

      const response = await fetch(
        `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`,
        {
          method: 'POST',
          body: new URLSearchParams({
            __action: 'update_question',
            __csrf_token: settingsPageResponse.$('input[name="__csrf_token"]').val() as string,
            orig_hash: settingsPageResponse.$('input[name="orig_hash"]').val() as string,
            title: 'Test title - changed',
            qid: 'test/question',
            grading_method: 'Internal',
          }),
        },
      );
      assert.equal(response.status, 200);
      assert.match(response.url, /\/pl\/course_instance\/1\/instructor\/edit_error\/\d+$/);
    },
  );

  test.sequential('change question id', async () => {
    const settingsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`,
    );
    assert.equal(settingsPageResponse.status, 200);

    // Change the question id to a new, valid id. Leave the title, qid, and topic unchanged.
    const response = await fetch(`${siteUrl}/pl/course_instance/1/instructor/question/1/settings`, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'update_question',
        __csrf_token: settingsPageResponse.$('input[name=__csrf_token]').val() as string,
        orig_hash: settingsPageResponse.$('input[name=orig_hash]').val() as string,
        title: 'Test title - changed',
        qid: 'question2',
        topic: 'Test',
        grading_method: 'Internal',
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(response.url, `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`);
  });

  test.sequential('verify question id changed', async () => {
    questionLiveInfoPath = path.join(
      questionLiveDir,
      'question2', // The new question id
      'info.json',
    );

    // If the file at path questionLiveInfoPath exists, then the question id was successfully changed
    assert.ok(await fs.pathExists(questionLiveInfoPath));
  });

  test.sequential(
    'should not be able to submit if changed question id is not in the root directory',
    async () => {
      const settingsPageResponse = await fetchCheerio(
        `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`,
      );
      assert.equal(settingsPageResponse.status, 200);

      // Change the question id to one that is not contained within the root directory. Leave the title, qid, and topic unchanged.
      const response = await fetch(
        `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`,
        {
          method: 'POST',
          body: new URLSearchParams({
            __action: 'update_question',
            __csrf_token: settingsPageResponse.$('input[name=__csrf_token]').val() as string,
            orig_hash: settingsPageResponse.$('input[name=orig_hash]').val() as string,
            title: 'Test title - changed',
            qid: '../question3',
            topic: 'Test',
            grading_method: 'Internal',
          }),
        },
      );

      assert.equal(response.status, 400);
    },
  );

  test.sequential('verify workspace settings changes with minimal configuration', async () => {
    const settingsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`,
    );
    assert.equal(settingsPageResponse.status, 200);

    const response = await fetch(`${siteUrl}/pl/course_instance/1/instructor/question/1/settings`, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'update_question',
        __csrf_token: settingsPageResponse.$('input[name=__csrf_token]').val() as string,
        orig_hash: settingsPageResponse.$('input[name=orig_hash]').val() as string,
        title: 'Test title - changed',
        qid: 'question2',
        topic: 'Test',
        grading_method: 'Internal',
        workspace_image: 'test_image',
        workspace_port: '1234',
        workspace_home: '/home/test',
        workspace_graded_files: 'test_file.txt',
        workspace_args: '',
        workspace_environment: '',
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(response.url, `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`);

    const questionInfo = JSON.parse(await fs.readFile(questionLiveInfoPath, 'utf8'));
    assert.equal(questionInfo.workspaceOptions.image, 'test_image');
    assert.equal(questionInfo.workspaceOptions.port, 1234);
    assert.equal(questionInfo.workspaceOptions.home, '/home/test');
    assert.equal(questionInfo.workspaceOptions.gradedFiles, 'test_file.txt');
    assert.notExists(questionInfo.workspaceOptions.args);
    assert.notExists(questionInfo.workspaceOptions.environment);
  });

  test.sequential('verify workspace settings changes with full configuration', async () => {
    const settingsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`,
    );
    assert.equal(settingsPageResponse.status, 200);

    const response = await fetch(`${siteUrl}/pl/course_instance/1/instructor/question/1/settings`, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'update_question',
        __csrf_token: settingsPageResponse.$('input[name=__csrf_token]').val() as string,
        orig_hash: settingsPageResponse.$('input[name=orig_hash]').val() as string,
        title: 'Test title - changed',
        qid: 'question2',
        topic: 'Test',
        grading_method: 'Internal',
        workspace_image: 'test_image',
        workspace_port: '1234',
        workspace_home: '/home/test',
        workspace_graded_files: 'test_file.txt',
        workspace_args: 'test --test',
        workspace_environment: '{"test": "value"}',
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(response.url, `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`);

    const questionInfo = JSON.parse(await fs.readFile(questionLiveInfoPath, 'utf8'));
    assert.equal(questionInfo.workspaceOptions.image, 'test_image');
    assert.equal(questionInfo.workspaceOptions.port, 1234);
    assert.equal(questionInfo.workspaceOptions.home, '/home/test');
    assert.equal(questionInfo.workspaceOptions.gradedFiles, 'test_file.txt');
    assert.deepEqual(questionInfo.workspaceOptions.args, ['test', '--test']);
    assert.deepEqual(questionInfo.workspaceOptions.environment, { test: 'value' });
  });

  test.sequential('verify external grading changes with minimal configuration', async () => {
    const settingsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`,
    );
    assert.equal(settingsPageResponse.status, 200);

    const response = await fetch(`${siteUrl}/pl/course_instance/1/instructor/question/1/settings`, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'update_question',
        __csrf_token: settingsPageResponse.$('input[name=__csrf_token]').val() as string,
        orig_hash: settingsPageResponse.$('input[name=orig_hash]').val() as string,
        title: 'Test title - changed',
        qid: 'question2',
        topic: 'Test',
        grading_method: 'External',
        external_grading_image: 'test_image',
        external_grading_entrypoint: '',
        external_grading_files: '',
        external_grading_timeout: '',
        external_grading_enable_networking: '',
        external_grading_environment: '',
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(response.url, `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`);

    const questionInfo = JSON.parse(await fs.readFile(questionLiveInfoPath, 'utf8'));
    assert.equal(questionInfo.externalGradingOptions.image, 'test_image');
    assert.notExists(questionInfo.externalGradingOptions.enabled);
    assert.notExists(questionInfo.externalGradingOptions.entrypoint);
    assert.notExists(questionInfo.externalGradingOptions.files);
    assert.notExists(questionInfo.externalGradingOptions.timeout);
    assert.notExists(questionInfo.externalGradingOptions.enableNetworking);
    assert.notExists(questionInfo.externalGradingOptions.environment);
  });

  test.sequential('verify external grading changes with full configuration', async () => {
    const settingsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`,
    );
    assert.equal(settingsPageResponse.status, 200);

    const response = await fetch(`${siteUrl}/pl/course_instance/1/instructor/question/1/settings`, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'update_question',
        __csrf_token: settingsPageResponse.$('input[name=__csrf_token]').val() as string,
        orig_hash: settingsPageResponse.$('input[name=orig_hash]').val() as string,
        title: 'Test title - changed',
        qid: 'question2',
        topic: 'Test',
        grading_method: 'External',
        external_grading_image: 'test_image',
        external_grading_enabled: 'true',
        external_grading_entrypoint: '/test',
        external_grading_files: 'test_file.txt',
        external_grading_timeout: '10',
        external_grading_enable_networking: 'true',
        external_grading_environment: '{"test": "value"}',
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(response.url, `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`);

    const questionInfo = JSON.parse(await fs.readFile(questionLiveInfoPath, 'utf8'));
    assert.equal(questionInfo.externalGradingOptions.image, 'test_image');
    assert.equal(questionInfo.externalGradingOptions.enabled, true);
    assert.equal(questionInfo.externalGradingOptions.entrypoint, '/test');
    assert.equal(questionInfo.externalGradingOptions.serverFilesCourse, 'test_file.txt');
    assert.equal(questionInfo.externalGradingOptions.timeout, 10);
    assert.equal(questionInfo.externalGradingOptions.enableNetworking, true);
    assert.deepEqual(questionInfo.externalGradingOptions.environment, { test: 'value' });
  });
});
