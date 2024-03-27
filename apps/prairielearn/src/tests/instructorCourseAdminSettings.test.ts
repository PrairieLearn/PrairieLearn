import { config } from '../lib/config';
import * as path from 'path';
import * as fs from 'fs-extra';
import { loadSqlEquiv, queryRow, queryAsync } from '@prairielearn/postgres';
import { step } from 'mocha-steps';
import * as tmp from 'tmp';
import { exec } from 'child_process';
import execa = require('execa');

import * as helperServer from './helperServer';
import { fetchCheerio } from './helperClient';
import { assert } from 'chai';

const sql = loadSqlEquiv(__filename);

const courseTemplateDir = path.join(__dirname, 'testFileEditor', 'courseTemplate');
const baseDir = tmp.dirSync().name;
const courseLiveDir = path.join(baseDir, 'courseLive');
const courseInfoPath = path.join(courseLiveDir, 'infoCourse.json');
// console.log('courseInfoPath:', courseInfoPath);

const siteUrl = `http://localhost:${config.serverPort}`;
console.log('siteUrl:', siteUrl);

describe('Editing course settings', () => {
  before(async () => {
    // init git repo in directory
    await execa('git', ['-c', 'init.defaultBranch=master', 'init', '--bare', courseLiveDir], {
      cwd: '.',
      env: process.env,
    });

    // create course files
    await fs.copy(courseTemplateDir, courseLiveDir);

    const execOptions = { cwd: courseLiveDir, env: process.env };
    exec(`git add -A`, execOptions);
    exec(`git commit -m "Initial commit"`, execOptions);
    exec(`git push origin master`, execOptions);

    await helperServer.before(courseLiveDir)();

    // update db with course repo info
    await queryAsync(sql.update_course_repo, { repo: courseLiveDir });

    const course = await queryAsync(sql.get_courses, {});
    console.log('course:', course);
  });
  after(helperServer.after);

  step('access the test course info file', async () => {
    const courseInfo = JSON.parse(await fs.readFileSync(courseInfoPath, 'utf8'));
    assert.equal(courseInfo.name, 'TEST 101');
  });

  // Access the course settings page
  step('access the course settings page', async () => {
    const settingsPageResponse = await fetchCheerio(`${siteUrl}/pl/course/1/course_admin/settings`);
    console.log('settingsPageResponse:', settingsPageResponse);
    assert.equal(settingsPageResponse.status, 200);
  });

  // Change course short name
  // change course title
  // change course timezone
  step('change course info', async () => {
    const settingsPageResponse = await fetchCheerio(`${siteUrl}/pl/course/1/course_admin/settings`);
    console.log('settingsPageResponse:', await settingsPageResponse.text());

    // console.log('csrfToken:', settingsPageResponse.$('input[name="__csrf_token"]').val());
    // console.log('orig_hash:', settingsPageResponse.$('input[name="orig_hash"]').val());

    const response = await fetchCheerio(`${siteUrl}/pl/course/1/course_admin/settings`, {
      method: 'POST',
      form: {
        __action: 'update_configuration',
        __csrf_token: settingsPageResponse.$('input[name="__csrf_token"]').val(),
        orig_hash: settingsPageResponse.$('input[name="orig_hash"]').val(),
        short_name: 'TEST 102',
        title: 'Test Course 102',
        display_timezone: 'America/Los_Angeles',
      },
    });
    // console.log('response:', await response.text());

    // const newResponse = await fetchCheerio(response.url);
    // console.log('newResponse:', newResponse.$('main'));
    assert.equal(response.status, 200);
  });

  step('verify course info change', async () => {
    const courseInfo = JSON.parse(await fs.readFile(courseInfoPath, 'utf8'));
    // console.log('courseInfo:', courseInfo);
    assert.equal(courseInfo.short_name, 'TEST 102');
    assert.equal(courseInfo.title, 'Test Course 102');
    assert.equal(courseInfo.timezone, 'America/Los_Angeles');
  });
  // try submitting without being an authorized user

  // try submitting without course info file

  // try submitting without any changes

  // try submitting if local course info file has been changed

  // try submitting if github course info file has been changed
});
