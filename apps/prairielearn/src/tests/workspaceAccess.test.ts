import { assert } from 'chai';
import * as cheerio from 'cheerio';
import { step } from 'mocha-steps';
import fetch from 'node-fetch';

import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config.js';

import * as helperServer from './helperServer.js';
import { type AuthUser, withUser } from './utils/auth.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';

const studentOne: AuthUser = {
  uid: 'student1@example.com',
  uin: '000000001',
  name: 'Student One',
};
const studentTwo: AuthUser = {
  uid: 'student2@example.com',
  uin: '000000002',
  name: 'Student Two',
};
const studentNotEnrolled: AuthUser = {
  uid: 'student_not_enrolled@example.com',
  uin: '000000003',
  name: 'Not Enrolled',
};

describe('Test workspace authorization access', function () {
  this.timeout(20000);

  before('disable workspace containers', async function () {
    config.workspaceEnable = false;
  });
  after('enable workspace containers', async function () {
    config.workspaceEnable = true;
  });
  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);
  before('add students to test course', async function () {
    await sqldb.queryAsync(sql.create_user, studentOne);
    await sqldb.queryAsync(sql.enroll_student_by_uid, { uid: studentOne.uid });

    await sqldb.queryAsync(sql.create_user, studentTwo);
    await sqldb.queryAsync(sql.enroll_student_by_uid, { uid: studentTwo.uid });

    await sqldb.queryAsync(sql.create_user, studentNotEnrolled);
  });

  describe('workspaces created by instructors in a course instance', function () {
    let workspace_id: string | undefined;
    step('create instructor workspace', async () => {
      const result = (await sqldb.queryOneRowAsync(sql.get_test_question, {})).rows[0];
      const workspace_url =
        baseUrl + `/course_instance/1/instructor/question/${result.question_id}/preview`;
      const response = await fetch(workspace_url);

      const $ = cheerio.load(await response.text());
      const workspace_btns = $('a:contains("Open workspace")');
      assert.equal(workspace_btns.length, 1);

      workspace_id = workspace_btns.attr('href')?.match('/pl/workspace/([0-9]+)')?.[1];
      assert.isDefined(workspace_id);
    });
    step('can be accessed by the instructor', async () => {
      const url = baseUrl + `/workspace/${workspace_id}`;
      const response = await fetch(url);
      assert.equal(response.status, 200);
    });
    step("can't be accessed by enrolled student one", async () => {
      await withUser(studentOne, async () => {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 403);
      });
    });
    step("can't be accessed by enrolled student two", async () => {
      await withUser(studentTwo, async () => {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 403);
      });
    });
    step("can't be accessed by an unenrolled user", async () => {
      await withUser(studentNotEnrolled, async () => {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 403);
      });
    });
  });

  describe('workspaces created by instructors in a course (no instance)', function () {
    before('give the instructor owner access', async () => {
      await sqldb.queryAsync(sql.give_owner_access_to_uid, {
        uid: config.authUid,
      });
    });
    after('revoke owner access from the instructor', async () => {
      await sqldb.queryAsync(sql.revoke_owner_access, {});
    });

    let workspace_id: string | undefined;
    step('create instructor workspace', async () => {
      const result = (await sqldb.queryOneRowAsync(sql.get_test_question, {})).rows[0];
      const workspace_url = baseUrl + `/course/1/question/${result.question_id}/preview`;
      const response = await fetch(workspace_url);

      const $ = cheerio.load(await response.text());
      const workspace_btns = $('a:contains("Open workspace")');
      assert.equal(workspace_btns.length, 1);

      workspace_id = workspace_btns.attr('href')?.match('/pl/workspace/([0-9]+)')?.[1];
      assert.isDefined(workspace_id);
    });
    step('can be accessed by the instructor', async () => {
      const url = baseUrl + `/workspace/${workspace_id}`;
      const response = await fetch(url);
      assert.equal(response.status, 200);
    });
    step("can't be accessed by enrolled student one", async () => {
      await withUser(studentOne, async () => {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 403);
      });
    });
    step("can't be accessed by enrolled student two", async () => {
      await withUser(studentTwo, async () => {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 403);
      });
    });
    step("can't be accessed by an unenrolled user", async () => {
      await withUser(studentNotEnrolled, async () => {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 403);
      });
    });
  });

  describe('workspaces created by students', function () {
    let workspace_id: string | undefined;
    step('create student workspace', async () => {
      await withUser(studentOne, async () => {
        const assessments_url = baseUrl + '/course_instance/1/assessments';
        const assessments_response = await fetch(assessments_url);
        const $assessments = cheerio.load(await assessments_response.text());

        const hw2_url = siteUrl + $assessments('a:contains("Miscellaneous homework")').attr('href');
        const hw2_response = await fetch(hw2_url);
        const $hw2 = cheerio.load(await hw2_response.text());

        const workspace_question_url = siteUrl + $hw2('a:contains("Workspace test")').attr('href');
        const question_response = await fetch(workspace_question_url);
        const $question = cheerio.load(await question_response.text());

        const workspace_btns = $question('a:contains("Open workspace")');
        assert.equal(workspace_btns.length, 1);
        workspace_id = workspace_btns.attr('href')?.match('/pl/workspace/([0-9]+)')?.[1];
        assert.isDefined(workspace_id);
      });
    });
    step('can be accessed by the instructor', async () => {
      const url = baseUrl + `/workspace/${workspace_id}`;
      const response = await fetch(url);
      assert.equal(response.status, 200);
    });
    step('can be accessed by the student owner', async () => {
      await withUser(studentOne, async () => {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 200);
      });
    });
    step("can't be accessed by another enrolled student", async () => {
      await withUser(studentTwo, async () => {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 403);
      });
    });
    step("can't be accessed by an unenrolled user", async () => {
      await withUser(studentNotEnrolled, async () => {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 403);
      });
    });
  });
});
