import { assert } from 'chai';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import fetchCookie from 'fetch-cookie';
import { config } from '../lib/config';
import { step } from 'mocha-steps';

import { queryAsync, queryOneRowAsync, queryRows, loadSqlEquiv } from '@prairielearn/postgres';
const sql = loadSqlEquiv(__filename);

import * as helperServer from './helperServer';
import { TEST_COURSE_PATH } from '../lib/paths';
import { UserSchema } from '../lib/db-types';

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const courseInstanceUrl = baseUrl + '/course_instance/1';

const storedConfig: any = {};

const GROUP_EXAM_1_TID = 'exam14-groupWork';
const GROUP_EXAM_2_TID = 'exam15-groupWorkRoles';
const GROUP_NAME = 'groupBB';
const GROUP_NAME_ALTERNATIVE = 'groupCC';

const StudentUserSchema = UserSchema.pick({
  user_id: true,
  uid: true,
  name: true,
  uin: true,
});

interface StudentUser {
  user_id: string | null;
  uid: string;
  name: string | null;
  uin: string | null;
}

async function generateThreeStudentUsers(): Promise<StudentUser[]> {
  const rows = await queryRows(sql.generate_and_enroll_3_users, StudentUserSchema);
  assert.lengthOf(rows, 3);
  return rows;
}

/**
 * Switches active user and loads assessment, returning the user's CSRF
 * token value from a form on the page
 */
async function switchUserAndLoadAssessment(
  studentUser: StudentUser,
  assessmentUrl: string,
  formName: string,
): Promise<{ $: cheerio.CheerioAPI; csrfToken: string }> {
  // Load config
  config.authUid = studentUser.uid;
  config.authName = studentUser.name;
  config.authUin = studentUser.uin;

  // Load assessment
  const res = await fetch(assessmentUrl);
  assert.isOk(res.ok);
  const page = await res.text();
  const $ = cheerio.load(page);

  // Check that the correct CSRF form exists
  const elementQuery = `form[name="${formName}"] input[name="__csrf_token"]`;
  const csrfTokenElement = $(elementQuery);
  assert.nestedProperty(csrfTokenElement[0], 'attribs.value');
  assert.isString(csrfTokenElement.attr('value'));
  const csrfToken = csrfTokenElement.attr('value') as string; // guaranteed to be string by assertion

  return { $, csrfToken };
}

/**
 * Creates a new group in the given assessment as the user with the given CSRF token
 */
async function createGroup(
  groupName: string,
  csrfToken: string,
  assessmentUrl: string,
): Promise<cheerio.CheerioAPI> {
  const res = await fetchCookie(fetch)(assessmentUrl, {
    method: 'POST',
    body: new URLSearchParams({
      __action: 'create_group',
      __csrf_token: csrfToken,
      groupName,
    }),
  });
  assert.isOk(res.ok);
  const $ = cheerio.load(await res.text());
  return $;
}

/**
 * Joins a group in an assessment using the provided join code as the user with the given CSRF token
 */
async function joinGroup(
  assessmentUrl: string,
  joinCode: string,
  csrfToken: string,
): Promise<cheerio.CheerioAPI> {
  const res = await fetchCookie(fetch)(assessmentUrl, {
    method: 'POST',
    body: new URLSearchParams({
      __action: 'join_group',
      __csrf_token: csrfToken,
      join_code: joinCode,
    }),
  });
  assert.isOk(res.ok);
  const $ = cheerio.load(await res.text());
  return $;
}

describe('Group based exam assessments', function () {
  this.timeout(20000);

  before('set up testing server', helperServer.before(TEST_COURSE_PATH));
  before('set authenticated user', function (callback) {
    storedConfig.authUid = config.authUid;
    storedConfig.authName = config.authName;
    storedConfig.authUin = config.authUin;
    callback(null);
  });

  after('shut down testing server', helperServer.after);
  after('unset authenticated user', function (callback) {
    Object.assign(config, storedConfig);
    callback(null);
  });

  describe('instructor access for exam assessment', function () {
    step("should load the group tab for the first assessment's instructor URL", async function () {
      // Get exam assessment URL using ids from database
      const result = await queryOneRowAsync(sql.select_group_exam_by_tid, {
        assessment_tid: GROUP_EXAM_1_TID,
      });
      assert.lengthOf(result.rows, 1);
      const assessmentId = result.rows[0].id;
      assert.isDefined(assessmentId);
      const instructorAssessmentsUrlGroupTab =
        courseInstanceUrl + '/instructor/assessment/' + assessmentId + '/groups';

      // Page should load successfully
      const res = await fetch(instructorAssessmentsUrlGroupTab);
      assert.isOk(res.ok);
    });

    step("should load the group tab for the second assessment's instructor URL", async function () {
      // Get exam assessment URLs using ids from database
      const result = await queryOneRowAsync(sql.select_group_exam_by_tid, {
        assessment_tid: GROUP_EXAM_2_TID,
      });
      assert.lengthOf(result.rows, 1);
      const assessmentId = result.rows[0].id;
      assert.isDefined(assessmentId);
      const instructorAssessmentsUrlGroupTab =
        courseInstanceUrl + '/instructor/assessment/' + assessmentId + '/groups';

      // Page should load successfully
      const res = await fetch(instructorAssessmentsUrlGroupTab);
      assert.isOk(res.ok);
    });
  });

  describe('group config correctness', function () {
    step('first assessment group config in database is correct', async function () {
      const result = await queryOneRowAsync(sql.select_group_exam_by_tid, {
        assessment_tid: GROUP_EXAM_1_TID,
      });
      assert.lengthOf(result.rows, 1);
      const assessmentId = result.rows[0].id;
      assert.isDefined(assessmentId);

      const groupConfigResult = await queryOneRowAsync(sql.select_group_config, {
        assessment_id: assessmentId,
      });
      const min = groupConfigResult.rows[0]['minimum'];
      const max = groupConfigResult.rows[0]['maximum'];
      assert.equal(min, 2);
      assert.equal(max, 2);
    });

    step('second assessment group config in database is correct', async function () {
      const result = await queryOneRowAsync(sql.select_group_exam_by_tid, {
        assessment_tid: GROUP_EXAM_2_TID,
      });
      assert.lengthOf(result.rows, 1);
      const assessmentId = result.rows[0].id;
      assert.isDefined(assessmentId);

      const groupConfigResult = await queryOneRowAsync(sql.select_group_config, {
        assessment_id: assessmentId,
      });
      const min = groupConfigResult.rows[0]['minimum'];
      const max = groupConfigResult.rows[0]['maximum'];
      assert.equal(min, 2);
      assert.equal(max, 4);
    });
  });

  describe('exam group creation, joining, and starting', function () {
    it('allows group creation, joining, and starting', async function () {
      // Get exam assessment URL using id from database
      const result = await queryOneRowAsync(sql.select_group_exam_by_tid, {
        assessment_tid: GROUP_EXAM_1_TID,
      });
      assert.lengthOf(result.rows, 1);
      const assessmentId = result.rows[0].id;
      assert.isDefined(assessmentId);
      const assessmentUrl = courseInstanceUrl + '/assessment/' + assessmentId;

      // Generate students
      const studentUsers = await generateThreeStudentUsers();

      // Load exam assessment page as first student
      const { csrfToken: firstUserCsrfToken } = await switchUserAndLoadAssessment(
        studentUsers[0],
        assessmentUrl,
        'create-form',
      );

      // As first user, create group, load the page, and check group information
      let $ = await createGroup(GROUP_NAME, firstUserCsrfToken, assessmentUrl);
      assert.equal(
        $('#group-name').text(),
        GROUP_NAME,
        'The group info should contain the correct group name',
      );

      let joinCode = $('#join-code').text();
      assert.lengthOf(
        joinCode,
        $('#group-name').text().length + 1 + 4,
        'Page must contain the 4-character join code',
      );
      assert.isTrue($('#start-assessment').is(':disabled'), 'Start button must be disabled');
      assert.lengthOf(
        $('.text-center:contains(1 more)'),
        1,
        'Page must show the group to be missing 1 more member',
      );

      // Join group as second user and check group info
      const { csrfToken: secondUserCsrfToken } = await switchUserAndLoadAssessment(
        studentUsers[1],
        assessmentUrl,
        'joingroup-form',
      );
      $ = await joinGroup(assessmentUrl, joinCode, secondUserCsrfToken);
      assert.equal(
        $('#group-name').text(),
        GROUP_NAME,
        'The group info should contain the correct group name',
      );

      joinCode = $('#join-code').text();
      assert.lengthOf(
        joinCode,
        $('#group-name').text().length + 1 + 4,
        'Page must contain the 4-character join code',
      );
      assert.isTrue($('#start-assessment').is(':disabled'), 'Start button must be disabled');
      assert.lengthOf(
        $('.text-center:contains(1 more)'),
        0,
        'Page should not show a warning for more members',
      );

      // Switch to third user and attempt to join group
      const { csrfToken: thirdUserCsrfToken } = await switchUserAndLoadAssessment(
        studentUsers[2],
        assessmentUrl,
        'joingroup-form',
      );
      $ = await joinGroup(assessmentUrl, joinCode, thirdUserCsrfToken);
      const elemList = $('.alert:contains(Group is already full)');
      assert.lengthOf(elemList, 1, 'Page should show that group is already full');

      // Switch to second user and start assessment
      const { $: $secondUser } = await switchUserAndLoadAssessment(
        studentUsers[1],
        assessmentUrl,
        'confirm-form',
      );
      $ = $secondUser;
      assert.isNotTrue($('#certify-pledge').prop('checked'), 'Honor code must be unchecked');
      assert.isTrue($('#start-assessment').is(':disabled'), 'Start button must be disabled');

      // Manually check the class honor code before starting the assessment
      $('#certify-pledge').attr('checked', '');
      assert.isTrue($('#certify-pledge').prop('checked'), 'Honor code should be checked');

      // Should have a non-disabled "start assessment" button
      $('#start-assessment').removeAttr('disabled');
      assert.isNotTrue($('#start-assessment').is(':disabled'));

      // Should have no assessment instances in database
      let assessmentInstancesResult = await queryAsync(sql.select_all_assessment_instance, []);
      assert.lengthOf(assessmentInstancesResult.rows, 0);

      // Start assessment
      const response = await fetch(assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'new_instance',
          __csrf_token: secondUserCsrfToken,
        }),
        follow: 1,
      });
      assert.isOk(response.ok);
      $ = cheerio.load(await response.text());

      // Check there is now one assessment instance in database
      assessmentInstancesResult = await queryAsync(sql.select_all_assessment_instance, []);
      assert.lengthOf(assessmentInstancesResult.rows, 1);
      assert.equal(assessmentInstancesResult.rows[0].group_id, 1);
      const assessmentInstanceId = assessmentInstancesResult.rows[0].id;
      const assessmentInstanceURL =
        courseInstanceUrl + '/assessment_instance/' + assessmentInstanceId;

      // Ensure all group members can access the assessment instance correctly
      await switchUserAndLoadAssessment(studentUsers[0], assessmentUrl, 'leave-group-form');
      const firstMemberResponse = await fetch(assessmentInstanceURL);
      assert.isOk(firstMemberResponse.ok);

      await switchUserAndLoadAssessment(studentUsers[1], assessmentUrl, 'leave-group-form');
      const secondMemberResponse = await fetch(assessmentInstanceURL);
      assert.isOk(secondMemberResponse.ok);
    });
  });
});

describe('cross group exam access', function () {
  this.timeout(20000);
  before('set up testing server', helperServer.before(TEST_COURSE_PATH));
  before('set authenticated user', function (callback) {
    storedConfig.authUid = config.authUid;
    storedConfig.authName = config.authName;
    storedConfig.authUin = config.authUin;
    callback(null);
  });

  after('shut down testing server', helperServer.after);
  after('unset authenticated user', function (callback) {
    Object.assign(config, storedConfig);
    callback(null);
  });

  it("prevents unauthorized users from accessing other groups' assessment instances", async function () {
    // Get exam assessment URL using id from database
    const result = await queryOneRowAsync(sql.select_group_exam_by_tid, {
      assessment_tid: GROUP_EXAM_1_TID,
    });
    assert.lengthOf(result.rows, 1);
    const assessmentId = result.rows[0].id;
    assert.isDefined(assessmentId);
    const assessmentUrl = courseInstanceUrl + '/assessment/' + assessmentId;

    // Generate students
    const studentUsers = await generateThreeStudentUsers();

    // Load exam assessment page as first student
    const { csrfToken: firstUserCsrfToken } = await switchUserAndLoadAssessment(
      studentUsers[0],
      assessmentUrl,
      'create-form',
    );

    // As first user, create group, load the page, and check group information
    let $ = await createGroup(GROUP_NAME, firstUserCsrfToken, assessmentUrl);
    const joinCode = $('#join-code').text();

    // Join group as second user
    const { csrfToken: secondUserCsrfToken } = await switchUserAndLoadAssessment(
      studentUsers[1],
      assessmentUrl,
      'joingroup-form',
    );
    $ = await joinGroup(assessmentUrl, joinCode, secondUserCsrfToken);

    // Start assessment
    const response = await fetch(assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'new_instance',
        __csrf_token: secondUserCsrfToken,
      }),
      follow: 1,
    });
    assert.isOk(response.ok);
    $ = cheerio.load(await response.text());

    // Check there is now one assessment instance in database
    const assessmentInstancesResult = await queryAsync(sql.select_all_assessment_instance, []);
    assert.lengthOf(assessmentInstancesResult.rows, 1);
    assert.equal(assessmentInstancesResult.rows[0].group_id, 1);
    const assessmentInstanceId = assessmentInstancesResult.rows[0].id;
    const assessmentInstanceURL =
      courseInstanceUrl + '/assessment_instance/' + assessmentInstanceId;

    // Second user should be able to access assessment instance
    const { csrfToken: secondUserInstanceCsrfToken } = await switchUserAndLoadAssessment(
      studentUsers[1],
      assessmentUrl, // redirects to instance URL
      'leave-group-form',
    );

    // Leave exam group as second user
    const leaveResponse = await fetch(assessmentInstanceURL, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'leave_group',
        __csrf_token: secondUserInstanceCsrfToken,
      }),
    });
    assert.isOk(leaveResponse.ok);
    $ = cheerio.load(await leaveResponse.text());

    // Attempt to access exam assessment instance as a non-grouped user should be unsuccessful
    const accessResponse = await fetch(assessmentInstanceURL);
    assert.equal(accessResponse.status, 403, 'status should be forbidden');

    // As second user, create an entirely new group
    await createGroup(GROUP_NAME_ALTERNATIVE, secondUserCsrfToken, assessmentUrl);

    // Attempt to access previous exam assessment instance while in a new group should be unsuccessful
    const secondAccessResponse = await fetch(assessmentInstanceURL);
    assert.equal(secondAccessResponse.status, 403, 'status should be forbidden');
  });
});

describe('cross exam assessment access', function () {
  this.timeout(20000);
  before('set up testing server', helperServer.before(TEST_COURSE_PATH));
  before('set authenticated user', function (callback) {
    storedConfig.authUid = config.authUid;
    storedConfig.authName = config.authName;
    storedConfig.authUin = config.authUin;
    callback(null);
  });

  after('shut down testing server', helperServer.after);
  after('unset authenticated user', function (callback) {
    Object.assign(config, storedConfig);
    callback(null);
  });

  it("prevents unauthorized users from accessing other groups' assessment instances", async function () {
    // Get exam assessment URL using ids from database
    const firstAssessmentResult = await queryOneRowAsync(sql.select_group_exam_by_tid, {
      assessment_tid: GROUP_EXAM_1_TID,
    });
    assert.lengthOf(firstAssessmentResult.rows, 1);
    const firstAssessmentId = firstAssessmentResult.rows[0].id;
    assert.isDefined(firstAssessmentId);
    const firstAssessmentUrl = courseInstanceUrl + '/assessment/' + firstAssessmentId;

    const secondAssessmentResult = await queryOneRowAsync(sql.select_group_exam_by_tid, {
      assessment_tid: GROUP_EXAM_2_TID,
    });
    assert.lengthOf(secondAssessmentResult.rows, 1);
    const secondAssessmentId = secondAssessmentResult.rows[0].id;
    assert.isDefined(secondAssessmentId);
    const secondAssessmentUrl = courseInstanceUrl + '/assessment/' + secondAssessmentId;

    // Generate students
    const studentUsers = await generateThreeStudentUsers();

    // Load exam assessment page as first student
    const { csrfToken: firstUserCsrfToken } = await switchUserAndLoadAssessment(
      studentUsers[0],
      firstAssessmentUrl,
      'create-form',
    );

    // As first user, create group, load the page, and check group information
    let $ = await createGroup(GROUP_NAME, firstUserCsrfToken, firstAssessmentUrl);
    const firstAssessmentJoinCode = $('#join-code').text();

    // Join group as second user
    const { csrfToken: secondUserCsrfToken } = await switchUserAndLoadAssessment(
      studentUsers[1],
      firstAssessmentUrl,
      'joingroup-form',
    );
    $ = await joinGroup(firstAssessmentUrl, firstAssessmentJoinCode, secondUserCsrfToken);

    // Join the second exam assessment as a third user
    const { csrfToken: thirdUserCsrfToken } = await switchUserAndLoadAssessment(
      studentUsers[2],
      secondAssessmentUrl,
      'joingroup-form',
    );

    // Attempt to join a first assessment group from the second assessment
    const crossAssessmentJoinResponse = await fetchCookie(fetch)(secondAssessmentUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'join_group',
        __csrf_token: thirdUserCsrfToken,
        join_code: firstAssessmentJoinCode,
      }),
    });
    assert.isOk(crossAssessmentJoinResponse.ok);
    $ = cheerio.load(await crossAssessmentJoinResponse.text());

    // Error message should show
    const elemList = $('.alert:contains(Group does not exist)');
    assert.lengthOf(elemList, 1);
  });
});
