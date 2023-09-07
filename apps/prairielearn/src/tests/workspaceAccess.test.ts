import * as cheerio from 'cheerio';
import { assert } from 'chai';
import fetch from 'node-fetch';

import { Config, config } from '../lib/config';
import * as helperServer from './helperServer';

import * as sqldb from '@prairielearn/postgres';
const sql = sqldb.loadSqlEquiv(__filename);

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const storedConfig: Partial<Config> = {};

interface UserConfig {
  uid: string;
  uin: string;
  name: string;
}

const studentOne: UserConfig = {
  uid: 'student1@illinois.edu',
  uin: '000000001',
  name: 'Student One',
};
const studentTwo: UserConfig = {
  uid: 'student2@illinois.edu',
  uin: '000000002',
  name: 'Student Two',
};
const studentNotEnrolled: UserConfig = {
  uid: 'student_not_enrolled@illinois.edu',
  uin: '000000003',
  name: 'Not Enrolled',
};

function setStudent(student: UserConfig) {
  config.authUid = student.uid;
  config.authUin = student.uin;
  config.authName = student.name;
}
function restoreUser() {
  Object.assign(config, storedConfig);
}

describe('Test workspace authorization access', function () {
  this.timeout(20000);

  before('save existing user', async function () {
    storedConfig.authUid = config.authUid;
    storedConfig.authUin = config.authUin;
    storedConfig.authName = config.authName;
  });
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
    it('create instructor workspace', async function () {
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
    describe('can be accessed by the instructor', function () {
      it('try to access with the instructor', async function () {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 200);
      });
    });
    describe("can't be accessed by enrolled student one", function () {
      before('set student role', async function () {
        setStudent(studentOne);
      });
      after('restore previous role', async function () {
        restoreUser();
      });
      it('try to access with the student', async function () {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 403);
      });
    });
    describe("can't be accessed by enrolled student two", function () {
      before('set student role', async function () {
        setStudent(studentTwo);
      });
      after('restore previous role', async function () {
        restoreUser();
      });
      it('try to access with the student', async function () {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 403);
      });
    });
    describe("can't be accessed by an unenrolled user", function () {
      before('set student role', async function () {
        setStudent(studentNotEnrolled);
      });
      after('restore previous role', async function () {
        restoreUser();
      });
      it('try to access with the student', async function () {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 403);
      });
    });
  });

  describe('workspaces created by instructors in a course (no instance)', function () {
    before('give the instructor owner access', async function () {
      await sqldb.queryAsync(sql.give_owner_access_to_uid, {
        uid: storedConfig.authUid,
      });
    });
    after('revoke owner access from the instructor', async function () {
      await sqldb.queryAsync(sql.revoke_owner_access, {});
    });

    let workspace_id: string | undefined;
    it('create instructor workspace', async function () {
      const result = (await sqldb.queryOneRowAsync(sql.get_test_question, {})).rows[0];
      const workspace_url = baseUrl + `/course/1/question/${result.question_id}/preview`;
      const response = await fetch(workspace_url);

      const $ = cheerio.load(await response.text());
      const workspace_btns = $('a:contains("Open workspace")');
      assert.equal(workspace_btns.length, 1);

      workspace_id = workspace_btns.attr('href')?.match('/pl/workspace/([0-9]+)')?.[1];
      assert.isDefined(workspace_id);
    });
    describe('can be accessed by the instructor', function () {
      it('try to access with the instructor', async function () {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 200);
      });
    });
    describe("can't be accessed by enrolled student one", function () {
      before('set student role', async function () {
        setStudent(studentOne);
      });
      after('restore previous role', async function () {
        restoreUser();
      });
      it('try to access with the student', async function () {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 403);
      });
    });
    describe("can't be accessed by enrolled student two", function () {
      before('set student role', async function () {
        setStudent(studentTwo);
      });
      after('restore previous role', async function () {
        restoreUser();
      });
      it('try to access with the student', async function () {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 403);
      });
    });
    describe("can't be accessed by an unenrolled user", function () {
      before('set student role', async function () {
        setStudent(studentNotEnrolled);
      });
      after('restore previous role', async function () {
        restoreUser();
      });
      it('try to access with the student', async function () {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 403);
      });
    });
  });

  describe('workspaces created by students', function () {
    let workspace_id: string | undefined;
    describe('create student workspace', function () {
      before('set student role', async function () {
        setStudent(studentOne);
      });
      after('restore previous role', async function () {
        restoreUser();
      });
      it('create the workspace', async function () {
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
    describe('can be accessed by the instructor', function () {
      it('try to access with the instructor', async function () {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 200);
      });
    });
    describe('can be accessed by the student owner', function () {
      before('set student role', async function () {
        setStudent(studentOne);
      });
      after('restore previous role', async function () {
        restoreUser();
      });
      it('try to access with the student', async function () {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 200);
      });
    });
    describe("can't be accessed by another enrolled student", function () {
      before('set student role', async function () {
        setStudent(studentTwo);
      });
      after('restore previous role', async function () {
        restoreUser();
      });
      it('try to access with the student', async function () {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 403);
      });
    });
    describe("can't be accessed by an unenrolled user", function () {
      before('set student role', async function () {
        setStudent(studentNotEnrolled);
      });
      after('restore previous role', async function () {
        restoreUser();
      });
      it('try to access with the student', async function () {
        const url = baseUrl + `/workspace/${workspace_id}`;
        const response = await fetch(url);
        assert.equal(response.status, 403);
      });
    });
  });
});
