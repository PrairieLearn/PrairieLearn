import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { dangerousFullSystemAuthz } from '../lib/authzData.js';
import { config } from '../lib/config.js';
import { selectOptionalCourseInstanceById } from '../models/course-instances.js';
import { ensureEnrollment } from '../models/enrollment.js';

import * as helperServer from './helperServer.js';
import { type AuthUser, getOrCreateUser, withUser } from './utils/auth.js';

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

describe('Test workspace authorization access', { timeout: 20_000 }, function () {
  beforeAll(function () {
    config.workspaceEnable = false;
  });
  afterAll(function () {
    config.workspaceEnable = true;
  });

  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  beforeAll(async function () {
    const studentOneUser = await getOrCreateUser(studentOne);
    const courseInstance = await selectOptionalCourseInstanceById('1');
    assert.isNotNull(courseInstance);
    await ensureEnrollment({
      userId: studentOneUser.user_id,
      courseInstance,
      requestedRole: 'System',
      authzData: dangerousFullSystemAuthz(),
      actionDetail: 'implicit_joined',
    });

    const studentTwoUser = await getOrCreateUser(studentTwo);
    await ensureEnrollment({
      userId: studentTwoUser.user_id,
      courseInstance,
      requestedRole: 'System',
      authzData: dangerousFullSystemAuthz(),
      actionDetail: 'implicit_joined',
    });

    await getOrCreateUser(studentNotEnrolled);
  });

  describe('workspaces created by instructors in a course instance', function () {
    let workspace_id: string | undefined;
    test.sequential('create instructor workspace', async () => {
      const questionId = await sqldb.queryRow(sql.get_test_question, IdSchema);
      const workspace_url =
        baseUrl + `/course_instance/1/instructor/question/${questionId}/preview`;
      const response = await fetch(workspace_url);

      const $ = cheerio.load(await response.text());
      const workspace_btns = $('a:contains("Open workspace")');
      assert.equal(workspace_btns.length, 1);

      workspace_id = workspace_btns.attr('href')?.match('/pl/workspace/([0-9]+)')?.[1];
      assert.isDefined(workspace_id);
    });
    test.sequential('can be accessed by the instructor', async () => {
      const url = baseUrl + `/workspace/${workspace_id}`;
      const response = await fetch(url);
      assert.equal(response.status, 200);
    });
    test.sequential("can't be accessed by enrolled student one", async () => {
      await withUser(studentOne, async () => {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 403);
      });
    });
    test.sequential("can't be accessed by enrolled student two", async () => {
      await withUser(studentTwo, async () => {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 403);
      });
    });
    test.sequential("can't be accessed by an unenrolled user", async () => {
      await withUser(studentNotEnrolled, async () => {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 403);
      });
    });
  });

  describe('workspaces created by instructors in a course (no instance)', function () {
    beforeAll(async () => {
      // Make the user a course owner.
      await sqldb.execute(sql.give_owner_access_to_uid, {
        uid: config.authUid,
      });
    });
    afterAll(async () => {
      // Remove owner permissions.
      await sqldb.execute(sql.revoke_owner_access);
    });

    let workspace_id: string | undefined;
    test.sequential('create instructor workspace', async () => {
      const questionId = await sqldb.queryRow(sql.get_test_question, IdSchema);
      const workspace_url = baseUrl + `/course/1/question/${questionId}/preview`;
      const response = await fetch(workspace_url);

      const $ = cheerio.load(await response.text());
      const workspace_btns = $('a:contains("Open workspace")');
      assert.equal(workspace_btns.length, 1);

      workspace_id = workspace_btns.attr('href')?.match('/pl/workspace/([0-9]+)')?.[1];
      assert.isDefined(workspace_id);
    });
    test.sequential('can be accessed by the instructor', async () => {
      const url = baseUrl + `/workspace/${workspace_id}`;
      const response = await fetch(url);
      assert.equal(response.status, 200);
    });
    test.sequential("can't be accessed by enrolled student one", async () => {
      await withUser(studentOne, async () => {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 403);
      });
    });
    test.sequential("can't be accessed by enrolled student two", async () => {
      await withUser(studentTwo, async () => {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 403);
      });
    });
    test.sequential("can't be accessed by an unenrolled user", async () => {
      await withUser(studentNotEnrolled, async () => {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 403);
      });
    });
  });

  describe('workspaces created by students', function () {
    let workspace_id: string | undefined;
    test.sequential('create student workspace', async () => {
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
    test.sequential('can be accessed by the instructor', async () => {
      const url = baseUrl + `/workspace/${workspace_id}`;
      const response = await fetch(url);
      assert.equal(response.status, 200);
    });
    test.sequential('can be accessed by the student owner', async () => {
      await withUser(studentOne, async () => {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 200);
      });
    });
    test.sequential("can't be accessed by another enrolled student", async () => {
      await withUser(studentTwo, async () => {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 403);
      });
    });
    test.sequential("can't be accessed by an unenrolled user", async () => {
      await withUser(studentNotEnrolled, async () => {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 403);
      });
    });
  });
});
