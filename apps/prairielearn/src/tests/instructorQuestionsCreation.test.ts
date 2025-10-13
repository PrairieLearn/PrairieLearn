import * as path from 'path';

import { execa } from 'execa';
import * as fs from 'node:fs/promises';
import { copy } from 'fs-extra';
import * as tmp from 'tmp';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import { config } from '../lib/config.js';
import { EXAMPLE_COURSE_PATH } from '../lib/paths.js';

import { fetchCheerio } from './helperClient.js';
import * as helperServer from './helperServer.js';

const siteUrl = `http://localhost:${config.serverPort}`;

const sql = loadSqlEquiv(import.meta.url);

const baseDir = tmp.dirSync().name;

const courseOriginDir = path.join(baseDir, 'courseOrigin');
const courseLiveDir = path.join(baseDir, 'courseLive');
const questionsLiveDir = path.join(courseLiveDir, 'questions');

const courseDevDir = path.join(baseDir, 'courseDev');
const courseTemplateDir = path.join(import.meta.dirname, 'testFileEditor', 'courseTemplate');

describe('Creating a question', () => {
  beforeAll(async () => {
    // Clone the course template for testing
    await execa('git', ['-c', 'init.defaultBranch=master', 'init', '--bare', courseOriginDir], {
      cwd: '.',
      env: process.env,
    });

    await execa('git', ['clone', courseOriginDir, courseLiveDir], {
      cwd: '.',
      env: process.env,
    });

    await copy(courseTemplateDir, courseLiveDir);

    const execOptions = { cwd: courseLiveDir, env: process.env };
    await execa('git', ['add', '-A'], execOptions);
    await execa('git', ['commit', '-m', 'Initial commit'], execOptions);
    await execa('git', ['push', 'origin', 'master'], execOptions);
    await execa('git', ['clone', courseOriginDir, courseDevDir], { cwd: '.', env: process.env });

    await helperServer.before(courseLiveDir)();

    await execute(sql.update_course_repo, { repo: courseOriginDir });
  });

  afterAll(helperServer.after);

  test.sequential('create a new empty question', async () => {
    // Fetch the questions page for the course instance
    const questionsResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/course_admin/questions`,
    );

    assert.equal(questionsResponse.status, 200);

    // Create the new empty question
    const createQuestionResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/course_admin/questions`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'add_question',
          __csrf_token: questionsResponse.$('input[name=__csrf_token]').val() as string,
          orig_hash: questionsResponse.$('input[name=orig_hash]').val() as string,
          title: 'Test Question',
          qid: 'test-question',
          start_from: 'empty',
        }),
      },
    );

    assert.equal(createQuestionResponse.status, 200);

    assert.equal(
      createQuestionResponse.url,
      `${siteUrl}/pl/course_instance/1/instructor/question/2/file_edit/questions/test-question/question.html`,
    );
  });

  test.sequential('verify that the new empty question has the correct info', async () => {
    const questionLiveInfoPath = path.join(
      questionsLiveDir,
      'test-question', // Verify that the qid was used as the question folder's name
      'info.json',
    );
    const questionInfo = JSON.parse(await fs.readFile(questionLiveInfoPath, 'utf8'));

    assert.equal(questionInfo.title, 'Test Question');
    assert.equal(questionInfo.topic, 'Default');
    assert.isUndefined(questionInfo.shareSourcePublicly);
  });

  test.sequential('create a new question from the example course templates', async () => {
    // Fetch the questions page for the course instance
    const questionsResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/course_admin/questions`,
    );

    assert.equal(questionsResponse.status, 200);

    // Create the new template question based on the random graph template question
    const createQuestionResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/course_admin/questions`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'add_question',
          __csrf_token: questionsResponse.$('input[name=__csrf_token]').val() as string,
          orig_hash: questionsResponse.$('input[name=orig_hash]').val() as string,
          title: 'Test Random Graph',
          qid: 'test-random-graph',
          start_from: 'example',
          template_qid: 'template/matrix-component-input/random-graph',
        }),
      },
    );

    assert.equal(createQuestionResponse.status, 200);

    assert.equal(
      createQuestionResponse.url,
      `${siteUrl}/pl/course_instance/1/instructor/question/3/preview`,
    );
  });

  test.sequential('verify that the new question has the correct info', async () => {
    const questionLivePath = path.join(questionsLiveDir, 'test-random-graph');
    const questionLiveInfoPath = path.join(questionLivePath, 'info.json');
    const questionInfo = JSON.parse(await fs.readFile(questionLiveInfoPath, 'utf8'));

    assert.equal(questionInfo.title, 'Test Random Graph');
    assert.equal(questionInfo.topic, 'Default');
    assert.isUndefined(questionInfo.shareSourcePublicly);

    // Check that the server.py file has the correct contents
    const newQuestionServerFilePath = path.join(questionLivePath, 'server.py');
    const originalQuestionServerFilePath = path.join(
      EXAMPLE_COURSE_PATH,
      'questions',
      'template',
      'matrix-component-input',
      'random-graph',
      'server.py',
    );

    const newQuestionServerFileContent = await fs.readFile(newQuestionServerFilePath, 'utf8');
    const originalQuestionServerFileContent = await fs.readFile(
      originalQuestionServerFilePath,
      'utf8',
    );

    assert.equal(newQuestionServerFileContent, originalQuestionServerFileContent);

    // Check that the question.html file has the correct contents
    const newQuestionHtmlFilePath = path.join(questionLivePath, 'question.html');
    const originalQuestionHtmlFilePath = path.join(
      EXAMPLE_COURSE_PATH,
      'questions',
      'template',
      'matrix-component-input',
      'random-graph',
      'question.html',
    );

    const newQuestionHtmlFileContent = await fs.readFile(newQuestionHtmlFilePath, 'utf8');
    const originalQuestionHtmlFileContent = await fs.readFile(originalQuestionHtmlFilePath, 'utf8');

    assert.equal(newQuestionHtmlFileContent, originalQuestionHtmlFileContent);
  });

  test.sequential('create a new question to be used as template', async () => {
    // Fetch the questions page for the course instance
    const questionsResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/course_admin/questions`,
    );

    assert.equal(questionsResponse.status, 200);

    // Create the new empty question
    const createQuestionResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/course_admin/questions`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'add_question',
          __csrf_token: questionsResponse.$('input[name=__csrf_token]').val() as string,
          orig_hash: questionsResponse.$('input[name=orig_hash]').val() as string,
          title: 'Test Template Question',
          qid: 'template/courseTemplate',
          start_from: 'empty',
        }),
      },
    );

    assert.equal(createQuestionResponse.status, 200);

    assert.equal(
      createQuestionResponse.url,
      `${siteUrl}/pl/course_instance/1/instructor/question/4/file_edit/questions/template/courseTemplate/question.html`,
    );

    const questionLivePath = path.join(questionsLiveDir, 'template/courseTemplate');
    const newQuestionHtmlFilePath = path.join(questionLivePath, 'question.html');
    await fs.writeFile(
      newQuestionHtmlFilePath,
      '<pl-question-panel>Test Course Template</pl-question-panel>\n',
    );
    const newQuestionServerFilePath = path.join(questionLivePath, 'server.py');
    await fs.writeFile(newQuestionServerFilePath, 'def grade(data):\n    data["score"] = 0.5\n');
  });

  test.sequential('create a new question from the new course-specific template', async () => {
    // Fetch the questions page for the course instance
    const questionsResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/course_admin/questions`,
    );

    assert.equal(questionsResponse.status, 200);

    // Create the new template question based on the course-specific template question
    const createQuestionResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/course_admin/questions`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'add_question',
          __csrf_token: questionsResponse.$('input[name=__csrf_token]').val() as string,
          orig_hash: questionsResponse.$('input[name=orig_hash]').val() as string,
          title: 'Test Course-specific Template',
          qid: 'test-course-template',
          start_from: 'course',
          template_qid: 'template/courseTemplate',
        }),
      },
    );

    assert.equal(createQuestionResponse.status, 200);

    assert.equal(
      createQuestionResponse.url,
      `${siteUrl}/pl/course_instance/1/instructor/question/5/preview`,
    );
  });

  test.sequential('verify that the new question has the correct info', async () => {
    const questionLivePath = path.join(questionsLiveDir, 'test-course-template');
    const questionLiveInfoPath = path.join(questionLivePath, 'info.json');
    const questionInfo = JSON.parse(await fs.readFile(questionLiveInfoPath, 'utf8'));

    assert.equal(questionInfo.title, 'Test Course-specific Template');
    assert.equal(questionInfo.topic, 'Default');
    assert.isUndefined(questionInfo.shareSourcePublicly);

    // Check that the server.py file has the correct contents
    const newQuestionServerFilePath = path.join(questionLivePath, 'server.py');
    const originalQuestionServerFilePath = path.join(
      questionsLiveDir,
      'template',
      'courseTemplate',
      'server.py',
    );

    const newQuestionServerFileContent = await fs.readFile(newQuestionServerFilePath, 'utf8');
    const originalQuestionServerFileContent = await fs.readFile(
      originalQuestionServerFilePath,
      'utf8',
    );

    assert.equal(newQuestionServerFileContent, originalQuestionServerFileContent);

    // Check that the question.html file has the correct contents
    const newQuestionHtmlFilePath = path.join(questionLivePath, 'question.html');
    const originalQuestionHtmlFilePath = path.join(
      questionsLiveDir,
      'template',
      'courseTemplate',
      'question.html',
    );

    const newQuestionHtmlFileContent = await fs.readFile(newQuestionHtmlFilePath, 'utf8');
    const originalQuestionHtmlFileContent = await fs.readFile(originalQuestionHtmlFilePath, 'utf8');

    assert.equal(newQuestionHtmlFileContent, originalQuestionHtmlFileContent);
  });

  test.sequential('create new question with duplicate qid, title', async () => {
    // Fetch the questions page for the course instance
    const questionsResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/course_admin/questions`,
    );
    assert.equal(questionsResponse.status, 200);

    // Create the new empty question with the same qid and title as the first question
    const createQuestionResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/course_admin/questions`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'add_question',
          __csrf_token: questionsResponse.$('input[name=__csrf_token]').val() as string,
          orig_hash: questionsResponse.$('input[name=orig_hash]').val() as string,
          title: 'Test Question',
          qid: 'test-question',
          start_from: 'empty',
        }),
      },
    );
    assert.equal(createQuestionResponse.status, 200);
    assert.equal(
      createQuestionResponse.url,
      `${siteUrl}/pl/course_instance/1/instructor/question/6/file_edit/questions/test-question_2/question.html`,
    );
  });

  test.sequential('verify that the title and qid had 2 appended to them', async () => {
    const questionLiveInfoPath = path.join(
      questionsLiveDir,
      'test-question_2', // Verify that the qid with 2 appended to it was used as the name of the question folder
      'info.json',
    );
    const questionInfo = JSON.parse(await fs.readFile(questionLiveInfoPath, 'utf8'));
    assert.equal(questionInfo.title, 'Test Question (2)'); // Verify that the title had (2) appended to it
    assert.equal(questionInfo.topic, 'Default');
    assert.isUndefined(questionInfo.shareSourcePublicly);
  });

  test.sequential('should not be able to create a question without a title or qid', async () => {
    // Fetch the questions page for the course instance
    const questionsResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/course_admin/questions`,
    );
    assert.equal(questionsResponse.status, 200);

    // Create a new empty question without a title or qid
    const createQuestionResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/course_admin/questions`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'add_question',
          __csrf_token: questionsResponse.$('input[name=__csrf_token]').val() as string,
          orig_hash: questionsResponse.$('input[name=orig_hash]').val() as string,
          start_from: 'empty',
        }),
      },
    );
    assert.equal(createQuestionResponse.status, 400);
  });

  test.sequential(
    'should not be able to create a question without specifying start_from',
    async () => {
      // Fetch the questions page for the course instance
      const questionsResponse = await fetchCheerio(
        `${siteUrl}/pl/course_instance/1/instructor/course_admin/questions`,
      );
      assert.equal(questionsResponse.status, 200);

      // Create a new empty question without specifying start_from
      const createQuestionResponse = await fetchCheerio(
        `${siteUrl}/pl/course_instance/1/instructor/course_admin/questions`,
        {
          method: 'POST',
          body: new URLSearchParams({
            __action: 'add_question',
            __csrf_token: questionsResponse.$('input[name=__csrf_token]').val() as string,
            orig_hash: questionsResponse.$('input[name=orig_hash]').val() as string,
            title: 'New Test Question',
            qid: 'new-test-question',
          }),
        },
      );
      assert.equal(createQuestionResponse.status, 400);
    },
  );

  test.sequential(
    'should not be able to create a question with qid not contained in the root directory',
    async () => {
      // Fetch the questions page for the course instance
      const questionsResponse = await fetchCheerio(
        `${siteUrl}/pl/course_instance/1/instructor/course_admin/questions`,
      );
      assert.equal(questionsResponse.status, 200);

      // Create a new empty question with a qid not contained in the root directory
      const createQuestionResponse = await fetchCheerio(
        `${siteUrl}/pl/course_instance/1/instructor/course_admin/questions`,
        {
          method: 'POST',
          body: new URLSearchParams({
            __action: 'add_question',
            __csrf_token: questionsResponse.$('input[name=__csrf_token]').val() as string,
            orig_hash: questionsResponse.$('input[name=orig_hash]').val() as string,
            title: 'New Test Question',
            qid: '../new-test-question',
            start_from: 'empty',
          }),
        },
      );

      assert.equal(createQuestionResponse.status, 400);
    },
  );

  test.sequential(
    'should not be able to create a question from a non-existent template question',
    async () => {
      // Fetch the questions page for the course instance
      const questionsResponse = await fetchCheerio(
        `${siteUrl}/pl/course_instance/1/instructor/course_admin/questions`,
      );
      assert.equal(questionsResponse.status, 200);

      // Create a new empty question with a non-existent template question qid
      const createQuestionResponse = await fetchCheerio(
        `${siteUrl}/pl/course_instance/1/instructor/course_admin/questions`,
        {
          method: 'POST',
          body: new URLSearchParams({
            __action: 'add_question',
            __csrf_token: questionsResponse.$('input[name=__csrf_token]').val() as string,
            orig_hash: questionsResponse.$('input[name=orig_hash]').val() as string,
            title: 'New Test Question',
            qid: 'new-test-question',
            start_from: 'example',
            template_qid: 'template/non-existent-template',
          }),
        },
      );

      assert.equal(createQuestionResponse.status, 200);
      assert.match(
        createQuestionResponse.url,
        /\/pl\/course_instance\/1\/instructor\/edit_error\/\d+$/,
      );
    },
  );

  test.sequential(
    'should not be able to create a question with template_qid not contained in the root directory',
    async () => {
      // Fetch the questions page for the course instance
      const questionsResponse = await fetchCheerio(
        `${siteUrl}/pl/course_instance/1/instructor/course_admin/questions`,
      );
      assert.equal(questionsResponse.status, 200);

      // Create a new question from a template with a template_qid not contained in the correct root directory
      const createQuestionResponse = await fetchCheerio(
        `${siteUrl}/pl/course_instance/1/instructor/course_admin/questions`,
        {
          method: 'POST',
          body: new URLSearchParams({
            __action: 'add_question',
            __csrf_token: questionsResponse.$('input[name=__csrf_token]').val() as string,
            orig_hash: questionsResponse.$('input[name=orig_hash]').val() as string,
            title: 'New Test Question',
            qid: 'new-test-question',
            start_from: 'example',
            template_qid: '../template/matrix-component-input/random-graph',
          }),
        },
      );

      assert.equal(createQuestionResponse.status, 200);
      assert.match(
        createQuestionResponse.url,
        /\/pl\/course_instance\/1\/instructor\/edit_error\/\d+$/,
      );
    },
  );
});
