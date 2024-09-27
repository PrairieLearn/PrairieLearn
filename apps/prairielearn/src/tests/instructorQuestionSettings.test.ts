import * as path from 'path';

import { assert } from 'chai';
import { execa } from 'execa';
import fs from 'fs-extra';
import { step } from 'mocha-steps';
import * as tmp from 'tmp';

import { loadSqlEquiv, queryAsync } from '@prairielearn/postgres';

import { config } from '../lib/config.js';
import { insertCoursePermissionsByUserUid } from '../models/course-permissions.js';
import { selectQuestionById } from '../models/question.js';

import { fetchCheerio } from './helperClient.js';
import * as helperServer from './helperServer.js';
import { getOrCreateUser, withUser } from './utils/auth.js';

const sql = loadSqlEquiv(import.meta.url);

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

  step('access the test question info file', async () => {
    const questionInfo = JSON.parse(await fs.readFile(questionLiveInfoPath, 'utf8'));
    assert.equal(questionInfo.title, 'Test question');
  });

  step('change question info', async () => {
    const settingsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`,
    );
    assert.equal(settingsPageResponse.status, 200);

    const response = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`,
      {
        method: 'POST',
        form: {
          __action: 'update_question',
          __csrf_token: settingsPageResponse.$('input[name=__csrf_token]').val(),
          orig_hash: settingsPageResponse.$('input[name=orig_hash]').val(),
          title: 'New title',
          qid: 'question',
        },
      },
    );

    assert.equal(response.status, 200);
    assert.equal(response.url, `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`);
  });

  step('verify question info change', async () => {
    questionLiveInfoPath = path.join(questionLiveDir, 'question', 'info.json');
    const questionLiveInfo = JSON.parse(await fs.readFile(questionLiveInfoPath, 'utf8'));
    assert.equal(questionLiveInfo.title, 'New title');
  });

  step('verify nesting a question id', async () => {
    const settingsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`,
    );
    assert.equal(settingsPageResponse.status, 200);

    const response = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`,
      {
        method: 'POST',
        form: {
          __action: 'update_question',
          __csrf_token: settingsPageResponse.$('input[name=__csrf_token]').val(),
          orig_hash: settingsPageResponse.$('input[name=orig_hash]').val(),
          title: 'New title',
          qid: 'test/question1',
        },
      },
    );

    assert.equal(response.status, 200);
    assert.equal(response.url, `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`);
  });

  step('verify changing qid did not leave any empty directories', async () => {
    const questionDir = path.join(courseLiveDir, 'question');
    assert.equal(await fs.pathExists(questionDir), false);
  });

  step('pull and verify changes', async () => {
    await execa('git', ['pull'], { cwd: courseDevDir, env: process.env });
    questionDevInfoPath = path.join(courseDevDir, 'questions', 'test', 'question1', 'info.json');
    const questionDevInfo = JSON.parse(await fs.readFile(questionDevInfoPath, 'utf8'));
    assert.equal(questionDevInfo.title, 'New title');
  });

  step('verify question info change in db', async () => {
    const question = await selectQuestionById('1');
    assert.equal(question.title, 'New title');
  });

  step('should not be able to submit without being an authorized user', async () => {
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

      const response = await fetchCheerio(
        `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`,
        {
          method: 'POST',
          form: {
            __action: 'update_question',
            __csrf_token: settingsPageResponse.$('input[name="__csrf_token"]').val(),
            orig_hash: settingsPageResponse.$('input[name="orig_hash"]').val(),
            title: 'Test Title - Unauthorized',
            qid: 'test/question',
          },
        },
      );
      assert.equal(response.status, 403);
    });
  });

  step('should not be able to submit without question info file', async () => {
    questionLiveInfoPath = path.join(questionLiveDir, 'test', 'question1', 'info.json');
    await fs.move(questionLiveInfoPath, `${questionLiveInfoPath}.bak`);
    try {
      const settingsPageResponse = await fetchCheerio(
        `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`,
      );
      assert.equal(settingsPageResponse.status, 200);

      const response = await fetchCheerio(
        `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`,
        {
          method: 'POST',
          form: {
            __action: 'update_question',
            __csrf_token: settingsPageResponse.$('input[name="__csrf_token"]').val(),
            orig_hash: settingsPageResponse.$('input[name="orig_hash"]').val(),
            title: 'Test title - no info file',
            qid: 'test/question',
          },
        },
      );
      assert.equal(response.status, 400);
    } finally {
      await fs.move(`${questionLiveInfoPath}.bak`, questionLiveInfoPath);
    }
  });

  step('should not be able to submit if repo question info file has been changed', async () => {
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

    const response = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/question/1/settings`,
      {
        method: 'POST',
        form: {
          __action: 'update_question',
          __csrf_token: settingsPageResponse.$('input[name="__csrf_token"]').val(),
          orig_hash: settingsPageResponse.$('input[name="orig_hash"]').val(),
          title: 'Test title - changed',
          qid: 'test/question',
        },
      },
    );
    assert.equal(response.status, 200);
    assert.match(response.url, /\/pl\/course_instance\/1\/instructor\/edit_error\/\d+$/);
  });
});
