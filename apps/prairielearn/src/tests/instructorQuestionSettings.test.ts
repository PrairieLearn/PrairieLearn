import * as path from 'path';

import { execa } from 'execa';
import fs from 'fs-extra';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { config } from '../lib/config.js';
import { features } from '../lib/features/index.js';
import {
  deleteCoursePermissions,
  insertCoursePermissionsByUserUid,
} from '../models/course-permissions.js';
import { selectQuestionById, updateQuestion } from '../models/question.js';

import { assertEditError, fetchCheerio } from './helperClient.js';
import {
  type CourseRepoFixture,
  createCourseRepoFixture,
  updateCourseRepository,
} from './helperCourse.js';
import * as helperServer from './helperServer.js';
import { getOrCreateUser, withUser } from './utils/auth.js';

const courseTemplateDir = path.join(import.meta.dirname, 'testFileEditor', 'courseTemplate');
const siteUrl = `http://localhost:${config.serverPort}`;

let courseRepo: CourseRepoFixture;
let questionLiveInfoPath: string;
let questionDevInfoPath: string;

describe('Editing question settings', { concurrent: false }, () => {
  beforeAll(async () => {
    courseRepo = await createCourseRepoFixture(courseTemplateDir);
    questionLiveInfoPath = path.join(
      courseRepo.courseLiveDir,
      'questions',
      'test',
      'question',
      'info.json',
    );
    questionDevInfoPath = path.join(
      courseRepo.courseDevDir,
      'questions',
      'test',
      'question',
      'info.json',
    );
    await helperServer.before(courseRepo.courseLiveDir)();
    await updateCourseRepository({ courseId: '1', repository: courseRepo.courseOriginDir });
  });

  afterAll(helperServer.after);

  test('access the test question info file', async () => {
    const questionInfo = JSON.parse(await fs.readFile(questionLiveInfoPath, 'utf8'));
    assert.equal(questionInfo.title, 'Test question');
  });

  test('converts legacy authors on save and resolves names only for course staff', async () => {
    const staff = await getOrCreateUser({
      uid: 'author-staff',
      name: 'Visible Staff Name',
      uin: null,
      email: null,
    });
    await getOrCreateUser({
      uid: 'author-nonstaff',
      name: 'Private Nonstaff Name',
      uin: null,
      email: null,
    });
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: staff.uid,
      course_role: 'Viewer',
      authn_user_id: '1',
    });
    const info = await fs.readJSON(questionLiveInfoPath);
    info.authors = [
      { name: 'Old name', email: staff.uid },
      'author-nonstaff',
      'author-unknown',
      { name: 'Unconvertible author' },
    ];
    await fs.writeJSON(
      path.join(courseRepo.courseOriginDir, 'questions/test/question/info.json'),
      info,
    );
    await execa('git', ['add', '-A'], { cwd: courseRepo.courseOriginDir });
    await execa('git', ['commit', '-m', 'Add legacy authors'], { cwd: courseRepo.courseOriginDir });
    await execa('git', ['pull'], { cwd: courseRepo.courseLiveDir });
    const url = `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`;
    const settings = await fetchCheerio(url);
    assert.equal(settings.status, 200);
    assert.include(settings.$('body').text(), staff.name!);
    assert.notInclude(settings.$('body').text(), 'Private Nonstaff Name');
    assert.include(settings.$('body').text(), 'Unconvertible author');
    assert.include(
      settings.$('body').text(),
      'Saving these settings will replace the legacy metadata',
    );
    const authors = JSON.parse(settings.$('input[name=authors]').val() as string);
    assert.deepEqual(authors, ['author-staff', 'author-nonstaff', 'author-unknown']);
    const response = await fetch(url, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'update_question',
        __csrf_token: settings.$('input[name=__csrf_token]').val() as string,
        orig_hash: settings.$('input[name=orig_hash]').val() as string,
        qid: 'test/question',
        title: info.title,
        topic: info.topic,
        authors: JSON.stringify(authors),
      }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.url, url);
    assert.deepEqual((await fs.readJSON(questionLiveInfoPath)).authors, authors);
    await deleteCoursePermissions({ course_id: '1', user_id: staff.id, authn_user_id: '1' });
    const afterRemoval = await fetchCheerio(url);
    assert.include(afterRemoval.$('body').text(), staff.uid);
    assert.notInclude(afterRemoval.$('body').text(), staff.name!);
    assert.notInclude(afterRemoval.$('body').text(), 'Not on course staff');
    assert.include(afterRemoval.$('body').text(), 'author-nonstaff');
    assert.include(afterRemoval.$('body').text(), 'author-unknown');
  });

  test('rejects invalid author input before writing files', async () => {
    const url = `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`;
    const original = await fs.readFile(questionLiveInfoPath, 'utf8');
    const settings = await fetchCheerio(url);
    for (const authors of [
      '[""]',
      '["   "]',
      JSON.stringify(['x'.repeat(256)]),
      '[{"email":"legacy"}]',
      'invalid json',
    ]) {
      const response = await fetch(url, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'update_question',
          __csrf_token: settings.$('input[name=__csrf_token]').val() as string,
          orig_hash: settings.$('input[name=orig_hash]').val() as string,
          qid: 'test/question',
          title: 'Invalid change',
          authors,
        }),
      });
      assert.equal(response.status, 400);
      assert.equal(await fs.readFile(questionLiveInfoPath, 'utf8'), original);
    }
  });

  test('change question info', async () => {
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

  test('verify question info change', async () => {
    questionLiveInfoPath = path.join(
      courseRepo.courseLiveDir,
      'questions',
      'question',
      'info.json',
    );
    const questionLiveInfo = JSON.parse(await fs.readFile(questionLiveInfoPath, 'utf8'));
    assert.equal(questionLiveInfo.title, 'New title');
    assert.deepEqual(questionLiveInfo.authors, [
      'author-staff',
      'author-nonstaff',
      'author-unknown',
    ]);
  });

  test('verify nesting a question id', async () => {
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

  test('verify changing qid did not leave any empty directories', async () => {
    const questionDir = path.join(courseRepo.courseLiveDir, 'question');
    assert.notOk(await fs.pathExists(questionDir));
  });

  test('pull and verify changes', async () => {
    await execa('git', ['pull'], { cwd: courseRepo.courseDevDir, env: process.env });
    questionDevInfoPath = path.join(
      courseRepo.courseDevDir,
      'questions',
      'test',
      'question1',
      'info.json',
    );
    const questionDevInfo = JSON.parse(await fs.readFile(questionDevInfoPath, 'utf8'));
    assert.equal(questionDevInfo.title, 'New title');
  });

  test('verify question info change in db', async () => {
    const question = await selectQuestionById('1');
    assert.equal(question.title, 'New title');
  });

  test('should not be able to submit without being an authorized user', async () => {
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

  test('should not be able to submit without question info file', async () => {
    questionLiveInfoPath = path.join(
      courseRepo.courseLiveDir,
      'questions',
      'test',
      'question1',
      'info.json',
    );
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

  test('should not be able to submit if repo question info file has been changed', async () => {
    const settingsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`,
    );
    assert.equal(settingsPageResponse.status, 200);

    const questionInfo = JSON.parse(await fs.readFile(questionLiveInfoPath, 'utf8'));
    const newQuestionInfo = { ...questionInfo, title: 'New title - changed' };
    await fs.writeFile(questionLiveInfoPath, JSON.stringify(newQuestionInfo, null, 2));
    await execa('git', ['add', '-A'], { cwd: courseRepo.courseLiveDir, env: process.env });
    await execa('git', ['commit', '-m', 'Change question info'], {
      cwd: courseRepo.courseLiveDir,
      env: process.env,
    });
    await execa('git', ['push', 'origin', 'master'], {
      cwd: courseRepo.courseLiveDir,
      env: process.env,
    });

    const response = await fetch(`${siteUrl}/pl/course_instance/1/instructor/question/1/settings`, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'update_question',
        __csrf_token: settingsPageResponse.$('input[name="__csrf_token"]').val() as string,
        orig_hash: settingsPageResponse.$('input[name="orig_hash"]').val() as string,
        title: 'Test title - changed',
        qid: 'test/question',
        grading_method: 'Internal',
      }),
    });
    assert.equal(response.status, 200);
    assert.match(response.url, /\/pl\/course_instance\/1\/instructor\/edit_error\/\d+$/);
  });

  test('change question id', async () => {
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

  test('verify question id changed', async () => {
    questionLiveInfoPath = path.join(
      courseRepo.courseLiveDir,
      'questions',
      'question2', // The new question id
      'info.json',
    );

    // If the file at path questionLiveInfoPath exists, then the question id was successfully changed
    assert.ok(await fs.pathExists(questionLiveInfoPath));
  });

  test('should not be able to submit if changed question id is not in the root directory', async () => {
    const settingsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`,
    );
    assert.equal(settingsPageResponse.status, 200);

    // Change the question id to one that is not contained within the root directory. Leave the title, qid, and topic unchanged.
    const response = await fetch(`${siteUrl}/pl/course_instance/1/instructor/question/1/settings`, {
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
    });

    assert.equal(response.status, 400);
  });

  test.each(['workspace_image', 'external_grading_image'])(
    'rejects an unsupported registry in %s',
    async (field) => {
      const settingsUrl = `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`;
      const { $ } = await fetchCheerio(settingsUrl);
      const originalInfo = await fs.readFile(questionLiveInfoPath, 'utf8');
      const response = await fetch(settingsUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'update_question',
          __csrf_token: $('input[name=__csrf_token]').val() as string,
          orig_hash: $('input[name=orig_hash]').val() as string,
          title: 'Test title',
          qid: 'question2',
          [field]: 'internal-host:5000/team/image:tag',
        }),
      });

      assert.equal(response.status, 400);
      assert.equal(await fs.readFile(questionLiveInfoPath, 'utf8'), originalInfo);
    },
  );

  test('verify workspace settings changes with minimal configuration', async () => {
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
        workspace_image: 'ghcr.io/org/workspace:tag',
        workspace_port: '',
        workspace_home: '',
        workspace_graded_files: 'test_file.txt',
        workspace_args: '',
        workspace_environment: '',
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(response.url, `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`);

    const questionInfo = JSON.parse(await fs.readFile(questionLiveInfoPath, 'utf8'));
    assert.equal(questionInfo.workspaceOptions.image, 'ghcr.io/org/workspace:tag');
    assert.notExists(questionInfo.workspaceOptions.port);
    assert.notExists(questionInfo.workspaceOptions.home);
    assert.equal(questionInfo.workspaceOptions.gradedFiles, 'test_file.txt');
    assert.notExists(questionInfo.workspaceOptions.args);
    assert.notExists(questionInfo.workspaceOptions.environment);
  });

  test('verify workspace settings changes with full configuration', async () => {
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

  test('verify external grading changes with minimal configuration', async () => {
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
    assert.notExists(questionInfo.externalGradingOptions.entrypoint);
    assert.notExists(questionInfo.externalGradingOptions.files);
    assert.notExists(questionInfo.externalGradingOptions.timeout);
    assert.notExists(questionInfo.externalGradingOptions.enableNetworking);
    assert.notExists(questionInfo.externalGradingOptions.environment);
  });

  test('verify external grading changes with full configuration', async () => {
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
    assert.equal(questionInfo.externalGradingOptions.entrypoint, '/test');
    assert.equal(questionInfo.externalGradingOptions.serverFilesCourse, 'test_file.txt');
    assert.equal(questionInfo.externalGradingOptions.timeout, 10);
    assert.equal(questionInfo.externalGradingOptions.enableNetworking, true);
    assert.deepEqual(questionInfo.externalGradingOptions.environment, { test: 'value' });
  });

  test('create a second question for nesting tests', async () => {
    const createPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/course_admin/questions/create`,
    );
    assert.equal(createPageResponse.status, 200);

    const response = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/course_admin/questions/create`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'add_question',
          __csrf_token: createPageResponse.$('input[name=__csrf_token]').val() as string,
          orig_hash: createPageResponse.$('input[name=orig_hash]').val() as string,
          title: 'Second question',
          qid: 'secondQuestion',
          start_from: 'empty',
        }),
      },
    );
    assert.equal(response.status, 200);
  });

  test('should not be able to rename a question to a subdirectory of an existing question', async () => {
    // Question 1 has QID "question2", question 2 has QID "secondQuestion".
    // Try to rename question 1 to "secondQuestion/nested" — this would nest
    // it inside question 2's directory, making it invisible during sync.
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
        qid: 'secondQuestion/nested',
        topic: 'Test',
        grading_method: 'Internal',
      }),
    });

    await assertEditError(response, 'is a subdirectory of the existing question');
  });

  test('rename question 1 to a nested QID for parent directory test', async () => {
    // Rename question 1 from "question2" to "parent/child" so we can test
    // that renaming question 2 to "parent" is blocked.
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
        qid: 'parent/child',
        topic: 'Test',
        grading_method: 'Internal',
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(response.url, `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`);
  });

  test('should not be able to rename a question to a parent directory of an existing question', async () => {
    // Question 1 now has QID "parent/child". Try to rename question 2
    // ("secondQuestion") to "parent" — this would make question 1 invisible
    // during sync because "parent/info.json" would stop recursion.
    const settingsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/question/2/settings`,
    );
    assert.equal(settingsPageResponse.status, 200);

    const response = await fetch(`${siteUrl}/pl/course_instance/1/instructor/question/2/settings`, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'update_question',
        __csrf_token: settingsPageResponse.$('input[name=__csrf_token]').val() as string,
        orig_hash: settingsPageResponse.$('input[name=orig_hash]').val() as string,
        title: 'Second question',
        qid: 'parent',
        topic: 'Default',
        grading_method: 'Internal',
      }),
    });

    await assertEditError(response, 'would be a parent directory of the existing question');
  });

  describe('public link for shared questions', () => {
    const settingsUrl = `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`;

    beforeAll(async () => {
      await features.enable('question-sharing');
    });

    test('hides the public link when the question is not shared publicly', async () => {
      const response = await fetchCheerio(settingsUrl);
      assert.equal(response.status, 200);
      assert.lengthOf(response.$('#publicLink'), 0);
    });

    test('shows the public link once the question is shared publicly', async () => {
      await updateQuestion({ question_id: '1', patch: { share_publicly: true } });

      const response = await fetchCheerio(settingsUrl);
      assert.equal(response.status, 200);
      assert.equal(
        response.$('#publicLink').val(),
        `${siteUrl}/pl/public/course/1/question/1/preview`,
      );
    });
  });
});
