import * as cheerio from 'cheerio';
import fetchCookie from 'fetch-cookie';
import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, it, test } from 'vitest';
import z from 'zod';

import { loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { config } from '../lib/config.js';
import { AssessmentInstanceSchema } from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';

import { assertAlert } from './helperClient.js';
import * as helperServer from './helperServer.js';
import { switchUserAndLoadAssessment } from './utils/team.js';

const sql = loadSqlEquiv(import.meta.url);

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const courseInstanceUrl = baseUrl + '/course_instance/1';

const storedConfig: any = {};

const GROUP_EXAM_1_TID = 'exam14-groupWork';
const GROUP_EXAM_2_TID = 'exam16-groupWorkRoles';
const TEAM_NAME = 'teamBB';
const TEAM_NAME_ALTERNATIVE = 'groupCC';

async function generateThreeStudentUsers() {
  const rows = await generateAndEnrollUsers({ count: 3, course_instance_id: '1' });
  assert.lengthOf(rows, 3);
  return rows;
}

/**
 * Creates a new group in the given assessment as the user with the given CSRF token
 */
async function createTeam(
  team_name: string,
  csrfToken: string,
  assessmentUrl: string,
): Promise<cheerio.CheerioAPI> {
  const res = await fetchCookie(fetch)(assessmentUrl, {
    method: 'POST',
    body: new URLSearchParams({
      __action: 'create_team',
      __csrf_token: csrfToken,
      team_name,
    }),
  });
  assert.isOk(res.ok);
  const $ = cheerio.load(await res.text());
  return $;
}

/**
 * Joins a group in an assessment using the provided join code as the user with the given CSRF token
 */
async function joinTeam(
  assessmentUrl: string,
  joinCode: string,
  csrfToken: string,
): Promise<cheerio.CheerioAPI> {
  const res = await fetchCookie(fetch)(assessmentUrl, {
    method: 'POST',
    body: new URLSearchParams({
      __action: 'join_team',
      __csrf_token: csrfToken,
      join_code: joinCode,
    }),
  });
  assert.isOk(res.ok);
  const $ = cheerio.load(await res.text());
  return $;
}

describe('Group based exam assessments', { timeout: 20_000 }, function () {
  beforeAll(helperServer.before(TEST_COURSE_PATH));

  beforeAll(function () {
    storedConfig.authUid = config.authUid;
    storedConfig.authName = config.authName;
    storedConfig.authUin = config.authUin;
  });

  afterAll(helperServer.after);

  afterAll(function () {
    Object.assign(config, storedConfig);
  });

  describe('instructor access for exam assessment', function () {
    test.sequential(
      "should load the group tab for the first assessment's instructor URL",
      async function () {
        // Get exam assessment URL using ids from database
        const assessmentId = await queryRow(
          sql.select_team_exam_by_tid,
          { assessment_tid: GROUP_EXAM_1_TID },
          IdSchema,
        );
        const instructorAssessmentsUrlGroupTab =
          courseInstanceUrl + '/instructor/assessment/' + assessmentId + '/groups';

        // Page should load successfully
        const res = await fetch(instructorAssessmentsUrlGroupTab);
        assert.isOk(res.ok);
      },
    );

    test.sequential(
      "should load the group tab for the second assessment's instructor URL",
      async function () {
        // Get exam assessment URLs using ids from database
        const assessmentId = await queryRow(
          sql.select_team_exam_by_tid,
          { assessment_tid: GROUP_EXAM_2_TID },
          IdSchema,
        );
        const instructorAssessmentsUrlGroupTab =
          courseInstanceUrl + '/instructor/assessment/' + assessmentId + '/groups';

        // Page should load successfully
        const res = await fetch(instructorAssessmentsUrlGroupTab);
        assert.isOk(res.ok);
      },
    );
  });

  describe('group config correctness', function () {
    test.sequential('first assessment group config in database is correct', async function () {
      const assessmentId = await queryRow(
        sql.select_team_exam_by_tid,
        { assessment_tid: GROUP_EXAM_1_TID },
        IdSchema,
      );

      const teamConfigResult = await queryRow(
        sql.select_team_config,
        { assessment_id: assessmentId },
        z.object({ minimum: z.number(), maximum: z.number() }),
      );
      const min = teamConfigResult.minimum;
      const max = teamConfigResult.maximum;
      assert.equal(min, 2);
      assert.equal(max, 2);
    });

    test.sequential('second assessment group config in database is correct', async function () {
      const assessmentId = await queryRow(
        sql.select_team_exam_by_tid,
        { assessment_tid: GROUP_EXAM_2_TID },
        IdSchema,
      );

      const teamConfigResult = await queryRow(
        sql.select_team_config,
        { assessment_id: assessmentId },
        z.object({ minimum: z.number(), maximum: z.number() }),
      );
      const min = teamConfigResult.minimum;
      const max = teamConfigResult.maximum;
      assert.equal(min, 2);
      assert.equal(max, 4);
    });
  });

  describe('exam group creation, joining, and starting', function () {
    it('allows group creation, joining, and starting', async function () {
      // Get exam assessment URL using id from database
      const assessmentId = await queryRow(
        sql.select_team_exam_by_tid,
        { assessment_tid: GROUP_EXAM_1_TID },
        IdSchema,
      );
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
      let $ = await createTeam(TEAM_NAME, firstUserCsrfToken, assessmentUrl);
      assert.equal(
        $('#team-name').text(),
        TEAM_NAME,
        'The group info should contain the correct group name',
      );

      let joinCode = $('#join-code').text();
      assert.lengthOf(
        joinCode,
        $('#team-name').text().length + 1 + 4,
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
        'jointeam-form',
      );
      $ = await joinTeam(assessmentUrl, joinCode, secondUserCsrfToken);
      assert.equal(
        $('#team-name').text(),
        TEAM_NAME,
        'The group info should contain the correct group name',
      );

      joinCode = $('#join-code').text();
      assert.lengthOf(
        joinCode,
        $('#team-name').text().length + 1 + 4,
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
        'jointeam-form',
      );
      $ = await joinTeam(assessmentUrl, joinCode, thirdUserCsrfToken);
      assertAlert($, 'Group is already full');

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
      let assessmentInstancesResult = await queryRows(
        sql.select_all_assessment_instance,
        AssessmentInstanceSchema,
      );
      assert.lengthOf(assessmentInstancesResult, 0);

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
      assessmentInstancesResult = await queryRows(
        sql.select_all_assessment_instance,
        AssessmentInstanceSchema,
      );
      assert.lengthOf(assessmentInstancesResult, 1);
      assert.equal(assessmentInstancesResult[0].team_id, '1');
      const assessmentInstanceId = assessmentInstancesResult[0].id;
      const assessmentInstanceURL =
        courseInstanceUrl + '/assessment_instance/' + assessmentInstanceId;

      // Ensure all group members can access the assessment instance correctly
      await switchUserAndLoadAssessment(studentUsers[0], assessmentUrl, null, '#leaveTeamModal');
      const firstMemberResponse = await fetch(assessmentInstanceURL);
      assert.isOk(firstMemberResponse.ok);

      await switchUserAndLoadAssessment(studentUsers[1], assessmentUrl, null, '#leaveTeamModal');
      const secondMemberResponse = await fetch(assessmentInstanceURL);
      assert.isOk(secondMemberResponse.ok);
    });
  });
});

describe('cross group exam access', { timeout: 20_000 }, function () {
  beforeAll(helperServer.before(TEST_COURSE_PATH));

  beforeAll(function () {
    storedConfig.authUid = config.authUid;
    storedConfig.authName = config.authName;
    storedConfig.authUin = config.authUin;
  });

  afterAll(helperServer.after);

  afterAll(function () {
    Object.assign(config, storedConfig);
  });

  it("prevents unauthorized users from accessing other groups' assessment instances", async function () {
    // Get exam assessment URL using id from database
    const assessmentId = await queryRow(
      sql.select_team_exam_by_tid,
      { assessment_tid: GROUP_EXAM_1_TID },
      IdSchema,
    );
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
    let $ = await createTeam(TEAM_NAME, firstUserCsrfToken, assessmentUrl);
    const joinCode = $('#join-code').text();

    // Join group as second user
    const { csrfToken: secondUserCsrfToken } = await switchUserAndLoadAssessment(
      studentUsers[1],
      assessmentUrl,
      'jointeam-form',
    );
    $ = await joinTeam(assessmentUrl, joinCode, secondUserCsrfToken);

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
    const assessmentInstancesResult = await queryRow(
      sql.select_all_assessment_instance,
      AssessmentInstanceSchema,
    );
    assert.equal(assessmentInstancesResult.team_id, '1');
    const assessmentInstanceId = assessmentInstancesResult.id;
    const assessmentInstanceURL =
      courseInstanceUrl + '/assessment_instance/' + assessmentInstanceId;

    // Second user should be able to access assessment instance
    const { csrfToken: secondUserInstanceCsrfToken } = await switchUserAndLoadAssessment(
      studentUsers[1],
      assessmentUrl, // redirects to instance URL
      null,
      '#leaveTeamModal',
    );

    // Leave exam group as second user
    const leaveResponse = await fetch(assessmentInstanceURL, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'leave_team',
        __csrf_token: secondUserInstanceCsrfToken,
      }),
    });
    assert.isOk(leaveResponse.ok);
    $ = cheerio.load(await leaveResponse.text());

    // Attempt to access exam assessment instance as a non-grouped user should be unsuccessful
    const accessResponse = await fetch(assessmentInstanceURL);
    assert.equal(accessResponse.status, 403, 'status should be forbidden');

    // As second user, create an entirely new group
    await createTeam(TEAM_NAME_ALTERNATIVE, secondUserCsrfToken, assessmentUrl);

    // Attempt to access previous exam assessment instance while in a new group should be unsuccessful
    const secondAccessResponse = await fetch(assessmentInstanceURL);
    assert.equal(secondAccessResponse.status, 403, 'status should be forbidden');
  });
});

describe('cross exam assessment access', { timeout: 20_000 }, function () {
  beforeAll(helperServer.before(TEST_COURSE_PATH));

  beforeAll(function () {
    storedConfig.authUid = config.authUid;
    storedConfig.authName = config.authName;
    storedConfig.authUin = config.authUin;
  });

  afterAll(helperServer.after);

  afterAll(function () {
    Object.assign(config, storedConfig);
  });

  it("prevents unauthorized users from accessing other groups' assessment instances", async function () {
    // Get exam assessment URL using ids from database
    const firstAssessmentId = await queryRow(
      sql.select_team_exam_by_tid,
      { assessment_tid: GROUP_EXAM_1_TID },
      IdSchema,
    );
    const firstAssessmentUrl = courseInstanceUrl + '/assessment/' + firstAssessmentId;

    const secondAssessmentId = await queryRow(
      sql.select_team_exam_by_tid,
      { assessment_tid: GROUP_EXAM_2_TID },
      IdSchema,
    );
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
    let $ = await createTeam(TEAM_NAME, firstUserCsrfToken, firstAssessmentUrl);
    const firstAssessmentJoinCode = $('#join-code').text();

    // Join group as second user
    const { csrfToken: secondUserCsrfToken } = await switchUserAndLoadAssessment(
      studentUsers[1],
      firstAssessmentUrl,
      'jointeam-form',
    );
    $ = await joinTeam(firstAssessmentUrl, firstAssessmentJoinCode, secondUserCsrfToken);

    // Join the second exam assessment as a third user
    const { csrfToken: thirdUserCsrfToken } = await switchUserAndLoadAssessment(
      studentUsers[2],
      secondAssessmentUrl,
      'jointeam-form',
    );

    // Attempt to join a first assessment group from the second assessment
    const crossAssessmentJoinResponse = await fetchCookie(fetch)(secondAssessmentUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'join_team',
        __csrf_token: thirdUserCsrfToken,
        join_code: firstAssessmentJoinCode,
      }),
    });
    assert.isOk(crossAssessmentJoinResponse.ok);
    $ = cheerio.load(await crossAssessmentJoinResponse.text());

    // Error message should show
    assertAlert($, 'Group does not exist');
  });
});
