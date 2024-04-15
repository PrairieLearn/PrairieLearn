import ERR = require('async-stacktrace');
import fetch from 'node-fetch';
import fetchCookie from 'fetch-cookie';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config';
import { assert } from 'chai';
import * as cheerio from 'cheerio';

import * as helperServer from './helperServer';
import { idsEqual } from '../lib/id';
import { TEST_COURSE_PATH } from '../lib/paths';
import { fetchCheerio } from './helperClient';

const sql = sqldb.loadSqlEquiv(__filename);

const locals: Record<string, any> = {};
locals.siteUrl = 'http://localhost:' + config.serverPort;
locals.baseUrl = locals.siteUrl + '/pl';
locals.courseInstanceUrl = locals.baseUrl + '/course_instance/1';
locals.assessmentsUrl = locals.courseInstanceUrl + '/assessments';

const storedConfig: Record<string, any> = {};

describe('Group based homework assess control on student side', function () {
  this.timeout(20000);
  before('set authenticated user', function (callback) {
    storedConfig.authUid = config.authUid;
    storedConfig.authName = config.authName;
    storedConfig.authUin = config.authUin;
    callback(null);
  });
  before('set up testing server', helperServer.before(TEST_COURSE_PATH));
  after('shut down testing server', helperServer.after);
  after('unset authenticated user', function (callback) {
    Object.assign(config, storedConfig);
    callback(null);
  });

  describe('1. the database', function () {
    it('should contain a group-based homework assessment', function (callback) {
      sqldb.query(sql.select_group_work_assessment, [], function (err, result) {
        if (ERR(err, callback)) return;
        assert.lengthOf(result.rows, 2);
        assert.notEqual(result.rows[0].id, undefined);
        locals.assessment_id = result.rows[0].id;
        locals.assessmentUrl = locals.courseInstanceUrl + '/assessment/' + locals.assessment_id;
        locals.instructorAssessmentsUrlGroupTab =
          locals.courseInstanceUrl + '/instructor/assessment/' + locals.assessment_id + '/groups';
        locals.assessment_id_2 = idsEqual(result.rows[1].id, locals.assessment_id)
          ? result.rows[0].id
          : result.rows[1].id;
        locals.assessmentUrl_2 = locals.courseInstanceUrl + '/assessment/' + locals.assessment_id_2;
        locals.instructorAssessmentsUrlGroupTab_2 =
          locals.courseInstanceUrl + '/instructor/assessment/' + locals.assessment_id_2 + '/groups';
        callback(null);
      });
    });
  });

  describe('2. GET to instructor assessments URL group tab for the first assessment', function () {
    it('should load successfully', async () => {
      const response = await fetch(locals.instructorAssessmentsUrlGroupTab);
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      const elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 4);
      // there are 6 occurrences of the same csrf, we will pick the first one
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
  });

  describe('3. Check if the config is correct', function () {
    it('should create the correct group configuration', function (callback) {
      const params = {
        assessment_id: locals.assessment_id,
      };
      sqldb.queryOneRow(sql.select_group_config, params, function (err, result) {
        if (ERR(err, callback)) return;
        const min = result.rows[0]['minimum'];
        const max = result.rows[0]['maximum'];
        assert.equal(min, 3);
        assert.equal(max, 3);
        callback(null);
      });
    });
  });

  describe('4. GET to instructor assessments URL group tab for the second assessment', function () {
    it('should load successfully', async () => {
      const response = await fetch(locals.instructorAssessmentsUrlGroupTab_2);
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      const elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 4);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
  });

  describe('5. Check if the config is correct', function () {
    it('should create the correct group configuration', function (callback) {
      const params = {
        assessment_id: locals.assessment_id_2,
      };
      sqldb.queryOneRow(sql.select_group_config, params, function (err, result) {
        if (ERR(err, callback)) return;
        const min = result.rows[0]['minimum'];
        const max = result.rows[0]['maximum'];
        assert.equal(min, 2);
        assert.equal(max, 5);
        callback(null);
      });
    });
  });

  describe('6. get 5 student user', function () {
    it('should insert/get 5 users into/from the DB', function (callback) {
      sqldb.query(sql.generate_and_enroll_5_users, [], function (err, result) {
        if (ERR(err, callback)) return;
        assert.lengthOf(result.rows, 5);
        locals.studentUsers = result.rows.slice(0, 3);
        locals.studentUserNotGrouped = result.rows[3];
        locals.studentUserInDiffGroup = result.rows[4];
        locals.groupCreator = locals.studentUsers[0];
        assert.lengthOf(locals.studentUsers, 3);
        callback(null);
      });
    });
    it('should be able to switch user', function () {
      config.authUid = locals.groupCreator.uid;
      config.authName = locals.groupCreator.name;
      config.authUin = '00000001';
    });
  });

  describe('7. POST to assessment page to create group', function () {
    it('should load assessment page successfully', async () => {
      const response = await fetch(locals.assessmentUrl);
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      const elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 2);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('should be able to create a group', async () => {
      locals.group_name = 'groupBB';
      const response = await fetch(locals.assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'create_group',
          __csrf_token: locals.__csrf_token,
          groupName: locals.group_name,
        }),
      });
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should not be able to create a second group', async () => {
      const response = await fetchCookie(fetchCheerio)(locals.assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'create_group',
          __csrf_token: locals.__csrf_token,
          groupName: 'secondgroup',
        }),
      });
      assert.equal(response.status, 200);
      assert.lengthOf(response.$('.alert:contains(already in another group)'), 1);
    });
  });

  describe('8. the group information after 1 user join the group', function () {
    it('should contain the correct group name', function () {
      const elemList = locals.$('#group-name');
      assert.equal(elemList.text(), locals.group_name);
    });
    it('should contain the 4-character join code', function () {
      const elemList = locals.$('#join-code');
      locals.joinCode = elemList.text();
      assert.lengthOf(locals.joinCode, locals.$('#group-name').text().length + 1 + 4);
    });
    it('should not be able to start assessment', function () {
      const elemList = locals.$('#start-assessment');
      assert.isTrue(elemList.is(':disabled'));
    });
    it('should be missing 2 more group members to start', function () {
      const elemList = locals.$('.text-center:contains(2 more)');
      assert.lengthOf(elemList, 1);
    });
  });

  describe('9. the second user can join the group using code', function () {
    it('should be able to switch user', function () {
      const student = locals.studentUsers[1];
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000002';
    });
    it('should load assessment page successfully', async () => {
      const response = await fetch(locals.assessmentUrl);
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      const elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 2);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('should be able to join group', async () => {
      const response = await fetch(locals.assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'join_group',
          __csrf_token: locals.__csrf_token,
          join_code: locals.joinCode,
        }),
      });
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
  });

  describe('10. the group information after 2 users join the group', function () {
    it('should contain the correct group name', function () {
      const elemList = locals.$('#group-name');
      assert.equal(elemList.text(), locals.group_name);
    });
    it('should contain the 4-character join code', function () {
      const elemList = locals.$('#join-code');
      assert.equal(locals.joinCode, elemList.text());
    });
    it('should not be able to start assessment', function () {
      const elemList = locals.$('#start-assessment');
      assert.isTrue(elemList.is(':disabled'));
    });
    it('should be missing 1 more group members to start', function () {
      const elemList = locals.$('.text-center:contains(1 more)');
      assert.lengthOf(elemList, 1);
    });
  });

  describe('11. the third user can join the group using code', function () {
    it('should be able to switch user', function () {
      const student = locals.studentUsers[2];
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000003';
    });
    it('should load assessment page successfully', async () => {
      const response = await fetch(locals.assessmentUrl);
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      const elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 2);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('should be able to join group', async () => {
      const response = await fetch(locals.assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'join_group',
          __csrf_token: locals.__csrf_token,
          join_code: locals.joinCode,
        }),
      });
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should have 3 students in group 1 in db', function (callback) {
      sqldb.query(sql.select_all_user_in_group, [], function (err, result) {
        if (ERR(err, callback)) return;
        assert.lengthOf(result.rows, 3);
        callback(null);
      });
    });
  });

  describe('12. the group information after 3 users join the group', function () {
    it('should contain the correct group name', function () {
      const elemList = locals.$('#group-name');
      assert.equal(elemList.text(), locals.group_name);
    });
    it('should contain the 4-character join code', function () {
      const elemList = locals.$('#join-code');
      assert.equal(locals.joinCode, elemList.text());
    });
  });
  describe('13. the fourth user can not join the already full group', function () {
    it('should be able to switch to the ungrouped student', function () {
      const student = locals.studentUserNotGrouped;
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000004';
    });
    it('should load assessment page successfully', async () => {
      const response = await fetch(locals.assessmentUrl);
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      const elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 2);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('should NOT be able to join group', async () => {
      const response = await fetchCookie(fetch)(locals.assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'join_group',
          __csrf_token: locals.__csrf_token,
          join_code: locals.joinCode,
        }),
      });
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should contain a prompt to inform the user that the group is full', function () {
      const elemList = locals.$('.alert:contains(is already full)');
      assert.lengthOf(elemList, 1);
    });
  });

  describe('13.5. The fourth user can create another group', () => {
    it('should be able to switch to the ungrouped student', function () {
      const student = locals.studentUserNotGrouped;
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000004';
    });
    it('should load assessment page successfully', async () => {
      const response = await fetch(locals.assessmentUrl);
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      const elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 2);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('should be able to create a group', async () => {
      locals.group_name = 'groupBBCCDD';
      const response = await fetch(locals.assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'create_group',
          __csrf_token: locals.__csrf_token,
          groupName: locals.group_name,
        }),
      });
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should contain the 4-character join code', function () {
      const elemList = locals.$('#join-code');
      locals.joinCode = elemList.text();
      assert.lengthOf(locals.joinCode, locals.$('#group-name').text().length + 1 + 4);
    });
  });

  describe('13.75. The first user cannot join the second group', () => {
    it('should be able to switch user', function () {
      const student = locals.studentUsers[0];
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000001';
    });
    it('should load assessment page successfully', async () => {
      const response = await fetch(locals.assessmentUrl);
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      const elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 2);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('should NOT be able to join group', async () => {
      const response = await fetchCookie(fetch)(locals.assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'join_group',
          __csrf_token: locals.__csrf_token,
          join_code: locals.joinCode,
        }),
      });
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
      assert.lengthOf(locals.$('.alert:contains(You are already in another group)'), 1);
    });
  });

  describe('14. start assessment as the third user', function () {
    it('should be able to switch user', function () {
      const student = locals.studentUsers[2];
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000003';
    });
    it('should load assessment page successfully', async () => {
      const response = await fetch(locals.assessmentUrl);
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      const elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 2);
      assert.nestedProperty(elemList[1], 'attribs.value');
      locals.__csrf_token = elemList[1].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('should have a non-disabled "start assessment" button', function () {
      const elemList = locals.$('#start-assessment');
      assert.isNotTrue(elemList.is(':disabled'));
    });
    it('should have three rows under group members list', function () {
      const elemList = locals.$('.col-sm li');
      assert.lengthOf(elemList, 3);
    });
    it('should have 0 assessment instance in db', function (callback) {
      sqldb.query(sql.select_all_assessment_instance, [], function (err, result) {
        if (ERR(err, callback)) return;
        assert.lengthOf(result.rows, 0);
        callback(null);
      });
    });
    it('should be able to start the assessment', async () => {
      const response = await fetch(locals.assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'new_instance',
          __csrf_token: locals.__csrf_token,
        }),
      });
      assert.equal(response.status, 200);
    });
    it('should have 1 assessment instance in db', function (callback) {
      sqldb.query(sql.select_all_assessment_instance, [], function (err, result) {
        if (ERR(err, callback)) return;
        assert.lengthOf(result.rows, 1);
        locals.assessment_instance_id = result.rows[0].id;
        locals.assessmentInstanceURL =
          locals.courseInstanceUrl + '/assessment_instance/' + locals.assessment_instance_id;
        assert.equal(result.rows[0].group_id, 1);
        callback(null);
      });
    });
  });

  describe('15. access control of all members of group 1', function () {
    it('should be able to access the assessment instance 1 as the 1st group member', async () => {
      const response = await fetch(locals.assessmentInstanceURL);
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should be able to switch to 2nd group member', function () {
      const student = locals.studentUsers[1];
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000002';
    });
    it('should be able to access the assessment instance 1 as the 2nd group member', async () => {
      const response = await fetch(locals.assessmentInstanceURL);
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should be able to switch to 3rd group member', function () {
      const student = locals.studentUsers[0];
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000001';
    });
    it('should be able to access the assessment instance 1 as the 3rd group member', async () => {
      const response = await fetch(locals.assessmentInstanceURL);
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
  });

  describe('16. access control of student who used to be in group 1 but not in any group now', function () {
    it('should have a CSRF token', function () {
      const elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 3);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('should be able to Leave the group', async () => {
      const response = await fetch(locals.assessmentInstanceURL, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'leave_group',
          __csrf_token: locals.__csrf_token,
        }),
      });
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should NOT be able to access the assessment instance 1 as a ungrouped student', async () => {
      const response = await fetch(locals.assessmentInstanceURL);
      assert.equal(response.status, 403);
    });
  });
  describe('17. access control of student who used to be in group 1 but in a different group now', function () {
    it('should have a CSRF token', function () {
      const elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 2);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('should be able to create a group', async () => {
      locals.group_name_alternative1 = 'groupCC';
      const response = await fetch(locals.assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'create_group',
          __csrf_token: locals.__csrf_token,
          groupName: locals.group_name_alternative1,
        }),
      });
      assert.equal(response.status, 200);
    });
    it('should NOT be able to access the assessment instance 1 as a student from a different group', async () => {
      const response = await fetch(locals.assessmentInstanceURL);
      assert.equal(response.status, 403);
    });
  });

  describe('18. access control of student who are not in any group', function () {
    it('should be able to switch to the ungrouped student', function () {
      const student = locals.studentUserNotGrouped;
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000004';
    });
    it('should NOT be able to access the assessment instance 1 as a ungrouped student', async () => {
      const response = await fetch(locals.assessmentInstanceURL);
      assert.equal(response.status, 403);
    });
  });

  describe('19. access control of student who are in a different group', function () {
    it('should be able to switch to the student in the different group', function () {
      const student = locals.studentUserInDiffGroup;
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000005';
    });
    it('should load assessment page successfully', async () => {
      const response = await fetch(locals.assessmentUrl);
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      const elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 2);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('should be able to create a group', async () => {
      locals.group_name_alternative2 = 'groupBBCC';
      const response = await fetch(locals.assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'create_group',
          __csrf_token: locals.__csrf_token,
          groupName: locals.group_name_alternative2,
        }),
      });
      assert.equal(response.status, 200);
    });
    it('should NOT be able to access the assessment instance 1 as a student from a different group', async () => {
      const response = await fetch(locals.assessmentInstanceURL);
      assert.equal(response.status, 403);
    });
  });

  describe('20. cross assessment grouping', function () {
    it('should contain a second group-based homework assessment', function (callback) {
      sqldb.query(sql.select_group_work_assessment, [], function (err, result) {
        if (ERR(err, callback)) return;
        assert.lengthOf(result.rows, 2);
        assert.notEqual(result.rows[1].id, undefined);
        callback(null);
      });
    });
    it('should load the second assessment page successfully', async () => {
      const response = await fetch(locals.assessmentUrl_2);
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      const elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 2);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('should NOT be able to join group using the join code from a different assessment', async () => {
      const response = await fetchCookie(fetch)(locals.assessmentUrl_2, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'join_group',
          __csrf_token: locals.__csrf_token,
          join_code: locals.joinCode,
        }),
      });
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should contain a prompt to inform the user that the group is invalid', function () {
      const elemList = locals.$('.alert:contains(does not exist)');
      assert.lengthOf(elemList, 1);
    });
  });
});
