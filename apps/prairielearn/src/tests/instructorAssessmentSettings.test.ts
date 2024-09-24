import * as path from 'path';

import { assert } from 'chai';
import { execa } from 'execa';
import fs from 'fs-extra';
import { step } from 'mocha-steps';
import * as tmp from 'tmp';
import { z } from 'zod';

import { loadSqlEquiv, queryAsync, queryRow } from '@prairielearn/postgres';

import { config } from '../lib/config.js';
import { AssessmentSchema } from '../lib/db-types.js';
import { insertCoursePermissionsByUserUid } from '../models/course-permissions.js';

import { fetchCheerio } from './helperClient.js';
import * as helperServer from './helperServer.js';
import { getOrCreateUser, withUser } from './utils/auth.js';

const sql = loadSqlEquiv(import.meta.url);

const courseTemplateDir = path.join(import.meta.dirname, 'testFileEditor', 'courseTemplate');
const baseDir = tmp.dirSync().name;
const courseOriginDir = path.join(baseDir, 'courseOrigin');
const courseLiveDir = path.join(baseDir, 'courseLive');
const courseDevDir = path.join(baseDir, 'courseDev');
const assessmentLiveDir = path.join(courseLiveDir, 'courseInstances', 'Fa18', 'assessments');
let assessmentLiveInfoPath = path.join(assessmentLiveDir, 'HW1', 'infoAssessment.json');
const assessmentDevDir = path.join(courseDevDir, 'courseInstances', 'Fa18', 'assessments');
let assessmentDevInfoPath = path.join(assessmentDevDir, 'HW1', 'infoAssessment.json');

const siteUrl = `http://localhost:${config.serverPort}`;

describe('Editing assessment settings', () => {
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

  step('access the test assessment info file', async () => {
    const assessmentInfo = JSON.parse(await fs.readFile(assessmentLiveInfoPath, 'utf8'));
    assert.equal(assessmentInfo.title, 'Homework for file editor test');
  });

  step('change assessment info', async () => {
    const settingsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/assessment/1/settings`,
    );
    assert.equal(settingsPageResponse.status, 200);

    const response = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/assessment/1/settings`,
      {
        method: 'POST',
        form: {
          __action: 'update_assessment',
          __csrf_token: settingsPageResponse.$('input[name="__csrf_token"]').val(),
          orig_hash: settingsPageResponse.$('input[name="orig_hash"]').val(),
          title: 'Test Title',
          type: 'Homework',
          set: 'Practice Quiz',
          number: '1',
          module: 'Module2',
          aid: 'HW2',
        },
      },
    );

    assert.equal(response.status, 200);
    assert.equal(response.url, `${siteUrl}/pl/course_instance/1/instructor/assessment/1/settings`);
  });

  step('verify assessment info change', async () => {
    assessmentLiveInfoPath = path.join(assessmentLiveDir, 'HW2', 'infoAssessment.json');
    const assessmentLiveInfo = JSON.parse(await fs.readFile(assessmentLiveInfoPath, 'utf8'));
    assert.equal(assessmentLiveInfo.title, 'Test Title');
    assert.equal(assessmentLiveInfo.type, 'Homework');
    assert.equal(assessmentLiveInfo.set, 'Practice Quiz');
    assert.equal(assessmentLiveInfo.number, '1');
    assert.equal(assessmentLiveInfo.module, 'Module2');
  });

  step('verify nesting an assessment id', async () => {
    const settingsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/assessment/1/settings`,
    );
    assert.equal(settingsPageResponse.status, 200);

    const response = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/assessment/1/settings`,
      {
        method: 'POST',
        form: {
          __action: 'update_assessment',
          __csrf_token: settingsPageResponse.$('input[name="__csrf_token"]').val(),
          orig_hash: settingsPageResponse.$('input[name="orig_hash"]').val(),
          title: 'Test Title',
          type: 'Homework',
          set: 'Practice Quiz',
          number: '1',
          module: 'Module2',
          aid: 'nestedPath/HW2',
        },
      },
    );

    assert.equal(response.status, 200);
    assert.equal(response.url, `${siteUrl}/pl/course_instance/1/instructor/assessment/1/settings`);
  });

  step('verify changing aid did not leave empty directories', async () => {
    const assessmentDir = path.join(assessmentLiveDir, 'HW2');
    assert.equal(await fs.pathExists(assessmentDir), false);
  });

  step('verify reverting a nested assessment id works correctly', async () => {
    const settingsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/assessment/1/settings`,
    );
    assert.equal(settingsPageResponse.status, 200);

    const response = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/assessment/1/settings`,
      {
        method: 'POST',
        form: {
          __action: 'update_assessment',
          __csrf_token: settingsPageResponse.$('input[name="__csrf_token"]').val(),
          orig_hash: settingsPageResponse.$('input[name="orig_hash"]').val(),
          title: 'Test Title',
          type: 'Homework',
          set: 'Practice Quiz',
          number: '1',
          module: 'Module2',
          aid: 'HW2',
        },
      },
    );

    assert.equal(response.status, 200);
    assert.equal(response.url, `${siteUrl}/pl/course_instance/1/instructor/assessment/1/settings`);
  });

  step('pull and verify changes', async () => {
    await execa('git', ['pull'], { cwd: courseDevDir, env: process.env });
    assessmentDevInfoPath = path.join(assessmentDevDir, 'HW2', 'infoAssessment.json');
    const assessmentDevInfo = JSON.parse(await fs.readFile(assessmentDevInfoPath, 'utf8'));
    assert.equal(assessmentDevInfo.title, 'Test Title');
    assert.equal(assessmentDevInfo.type, 'Homework');
    assert.equal(assessmentDevInfo.set, 'Practice Quiz');
    assert.equal(assessmentDevInfo.number, '1');
    assert.equal(assessmentDevInfo.module, 'Module2');
  });

  step('verify assessment info change in db', async () => {
    const assessment = await queryRow(
      sql.select_assessment_by_id,
      { id: 1 },
      AssessmentSchema.extend({
        assessment_set_name: z.string(),
        assessment_module_name: z.string(),
      }),
    );
    assert.equal(assessment.title, 'Test Title');
    assert.equal(assessment.type, 'Homework');
    assert.equal(assessment.assessment_set_name, 'Practice Quiz');
    assert.equal(assessment.number, '1');
    assert.equal(assessment.assessment_module_name, 'Module2');
    assert.equal(assessment.tid, 'HW2');
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
        `${siteUrl}/pl/course_instance/1/instructor/assessment/1/settings`,
      );
      assert.equal(settingsPageResponse.status, 200);

      const response = await fetchCheerio(
        `${siteUrl}/pl/course_instance/1/instructor/assessment/1/settings`,
        {
          method: 'POST',
          form: {
            __action: 'update_assessment',
            __csrf_token: settingsPageResponse.$('input[name="__csrf_token"]').val(),
            orig_hash: settingsPageResponse.$('input[name="orig_hash"]').val(),
            title: 'Test Title - Unauthorized',
            type: 'Homework',
            set: 'Homework',
            number: '1',
            module: 'Module1',
            aid: 'HW1',
          },
        },
      );
      assert.equal(response.status, 403);
    });
  });

  step('should not be able to submit without assessment info file', async () => {
    await fs.move(assessmentLiveInfoPath, `${assessmentLiveInfoPath}.bak`);
    try {
      const settingsPageResponse = await fetchCheerio(
        `${siteUrl}/pl/course_instance/1/instructor/assessment/1/settings`,
      );
      assert.equal(settingsPageResponse.status, 200);

      const response = await fetchCheerio(
        `${siteUrl}/pl/course_instance/1/instructor/assessment/1/settings`,
        {
          method: 'POST',
          form: {
            __action: 'update_assessment',
            __csrf_token: settingsPageResponse.$('input[name="__csrf_token"]').val(),
            orig_hash: settingsPageResponse.$('input[name="orig_hash"]').val(),
            title: 'Test Title - No Course Info',
            type: 'Homework',
            set: 'Homework',
            number: '1',
            module: 'Module1',
            aid: 'HW1',
          },
        },
      );
      assert.equal(response.status, 400);
    } finally {
      await fs.move(`${assessmentLiveInfoPath}.bak`, assessmentLiveInfoPath);
    }
  });

  step('should be able to submit without any changes', async () => {
    const assessmentInfo = JSON.parse(await fs.readFile(assessmentLiveInfoPath, 'utf8'));
    const settingsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/assessment/1/settings`,
    );
    const response = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/assessment/1/settings`,
      {
        method: 'POST',
        form: {
          __action: 'update_assessment',
          __csrf_token: settingsPageResponse.$('input[name="__csrf_token"]').val(),
          orig_hash: settingsPageResponse.$('input[name="orig_hash"]').val(),
          title: assessmentInfo.title,
          type: assessmentInfo.type,
          set: assessmentInfo.set,
          number: assessmentInfo.number,
          module: assessmentInfo.module,
          aid: 'HW2',
        },
      },
    );
    assert.equal(response.status, 200);
    assert.match(response.url, /\/pl\/course_instance\/1\/instructor\/assessment\/1\/settings$/);
  });

  step('should not be able to submit if repo course info file has been changed', async () => {
    const settingsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/assessment/1/settings`,
    );

    const assessmentInfo = JSON.parse(await fs.readFile(assessmentDevInfoPath, 'utf8'));
    const newAssessmentInfo = { ...assessmentInfo, title: 'Test Title - Changed' };
    await fs.writeFile(assessmentDevInfoPath, JSON.stringify(newAssessmentInfo, null, 2));
    await execa('git', ['add', '-A'], { cwd: courseDevDir, env: process.env });
    await execa('git', ['commit', '-m', 'Change assessment info'], {
      cwd: courseDevDir,
      env: process.env,
    });
    await execa('git', ['push', 'origin', 'master'], { cwd: courseDevDir, env: process.env });

    const response = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/assessment/1/settings`,
      {
        method: 'POST',
        form: {
          __action: 'update_assessment',
          __csrf_token: settingsPageResponse.$('input[name="__csrf_token"]').val(),
          orig_hash: settingsPageResponse.$('input[name="orig_hash"]').val(),
          title: 'Test Title2',
          type: 'Homework',
          set: 'Homework',
          number: '1',
          module: 'Module1',
          aid: 'HW1',
        },
      },
    );
    assert.equal(response.status, 200);
    assert.match(response.url, /\/pl\/course_instance\/1\/instructor\/edit_error\/\d+$/);
  });
});
