import * as cheerio from 'cheerio';
import fetchCookie from 'fetch-cookie';
import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { config } from '../lib/config.js';
import { AssessmentInstanceSchema, TeamConfigSchema } from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';

import { assertAlert, fetchCheerio } from './helperClient.js';
import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const locals: Record<string, any> = { siteUrl: 'http://localhost:' + config.serverPort };
locals.baseUrl = locals.siteUrl + '/pl';
locals.courseInstanceUrl = locals.baseUrl + '/course_instance/1';
locals.assessmentsUrl = locals.courseInstanceUrl + '/assessments';

const storedConfig: Record<string, any> = {};

describe('Team based homework assess control on student side', { timeout: 20_000 }, function () {
  beforeAll(() => {
    storedConfig.authUid = config.authUid;
    storedConfig.authName = config.authName;
    storedConfig.authUin = config.authUin;
  });

  beforeAll(helperServer.before(TEST_COURSE_PATH));

  afterAll(helperServer.after);

  afterAll(() => {
    Object.assign(config, storedConfig);
  });

  describe('1. the database', function () {
    it('should contain a team-based homework assessment', async () => {
      const assessment_ids = await sqldb.queryRows(sql.select_team_work_assessment, IdSchema);
      assert.lengthOf(assessment_ids, 2);
      assert.isDefined(assessment_ids[0]);
      assert.isDefined(assessment_ids[1]);

      locals.assessment_id = assessment_ids[0];
      locals.assessmentUrl = locals.courseInstanceUrl + '/assessment/' + locals.assessment_id;
      locals.instructorAssessmentsUrlTeamTab =
        locals.courseInstanceUrl + '/instructor/assessment/' + locals.assessment_id + '/groups';

      locals.assessment_id_2 = assessment_ids[1];
      locals.assessmentUrl_2 = locals.courseInstanceUrl + '/assessment/' + locals.assessment_id_2;
      locals.instructorAssessmentsUrlTeamTab_2 =
        locals.courseInstanceUrl + '/instructor/assessment/' + locals.assessment_id_2 + '/groups';
    });
  });

  describe('2. GET to instructor assessments URL team tab for the first assessment', function () {
    it('should load successfully', async () => {
      const response = await fetch(locals.instructorAssessmentsUrlTeamTab);
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
    it('should create the correct team configuration', async () => {
      const result = await sqldb.queryRow(
        sql.select_team_config,
        { assessment_id: locals.assessment_id },
        z.object({
          minimum: TeamConfigSchema.shape.minimum,
          maximum: TeamConfigSchema.shape.maximum,
        }),
      );
      const min = result.minimum;
      const max = result.maximum;
      assert.equal(min, 3);
      assert.equal(max, 3);
    });
  });

  describe('4. GET to instructor assessments URL team tab for the second assessment', function () {
    it('should load successfully', async () => {
      const response = await fetch(locals.instructorAssessmentsUrlTeamTab_2);
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
    it('should create the correct team configuration', async () => {
      const result = await sqldb.queryRow(
        sql.select_team_config,
        { assessment_id: locals.assessment_id_2 },
        z.object({
          minimum: TeamConfigSchema.shape.minimum,
          maximum: TeamConfigSchema.shape.maximum,
        }),
      );
      const min = result.minimum;
      const max = result.maximum;
      assert.equal(min, 2);
      assert.equal(max, 5);
    });
  });

  describe('6. get 5 student user', function () {
    it('should insert/get 5 users into/from the DB', async () => {
      const result = await generateAndEnrollUsers({ count: 5, course_instance_id: '1' });
      assert.lengthOf(result, 5);
      locals.studentUsers = result.slice(0, 3);
      locals.studentUserNotInTeam = result[3];
      locals.studentUserInDiffTeam = result[4];
      locals.teamCreator = locals.studentUsers[0];
      assert.lengthOf(locals.studentUsers, 3);
    });
    it('should be able to switch user', function () {
      config.authUid = locals.teamCreator.uid;
      config.authName = locals.teamCreator.name;
      config.authUin = '00000001';
    });
  });

  describe('7. POST to assessment page to create team', function () {
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
    it('should be able to create a team', async () => {
      locals.team_name = 'teamBB';
      const response = await fetch(locals.assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'create_team',
          __csrf_token: locals.__csrf_token,
          team_name: locals.team_name,
        }),
      });
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should not be able to create a second team', async () => {
      const response = await fetchCookie(fetchCheerio)(locals.assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'create_team',
          __csrf_token: locals.__csrf_token,
          team_name: 'secondteam',
        }),
      });
      assert.equal(response.status, 200);
      assertAlert(response.$, 'already in another team');
    });
  });

  describe('8. the team information after 1 user join the team', function () {
    it('should contain the correct team name', function () {
      const elemList = locals.$('#team-name');
      assert.equal(elemList.text(), locals.team_name);
    });
    it('should contain the 4-character join code', function () {
      const elemList = locals.$('#join-code');
      locals.joinCode = elemList.text();
      assert.lengthOf(locals.joinCode, locals.$('#team-name').text().length + 1 + 4);
    });
    it('should not be able to start assessment', function () {
      const elemList = locals.$('#start-assessment');
      assert.isTrue(elemList.is(':disabled'));
    });
    it('should be missing 2 more team members to start', function () {
      const elemList = locals.$('.text-center:contains(2 more)');
      assert.lengthOf(elemList, 1);
    });
  });

  describe('9. the second user can join the team using code', function () {
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
    it('should be able to join team', async () => {
      const response = await fetch(locals.assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'join_team',
          __csrf_token: locals.__csrf_token,
          join_code: locals.joinCode,
        }),
      });
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
  });

  describe('10. the team information after 2 users join the team', function () {
    it('should contain the correct team name', function () {
      const elemList = locals.$('#team-name');
      assert.equal(elemList.text(), locals.team_name);
    });
    it('should contain the 4-character join code', function () {
      const elemList = locals.$('#join-code');
      assert.equal(locals.joinCode, elemList.text());
    });
    it('should not be able to start assessment', function () {
      const elemList = locals.$('#start-assessment');
      assert.isTrue(elemList.is(':disabled'));
    });
    it('should be missing 1 more team members to start', function () {
      const elemList = locals.$('.text-center:contains(1 more)');
      assert.lengthOf(elemList, 1);
    });
  });

  describe('11. the third user can join the team using code', function () {
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
    it('should be able to join team', async () => {
      const response = await fetch(locals.assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'join_team',
          __csrf_token: locals.__csrf_token,
          join_code: locals.joinCode,
        }),
      });
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should have 3 students in team 1 in db', async () => {
      const rowCount = await sqldb.execute(sql.select_all_user_in_team);
      assert.equal(rowCount, 3);
    });
  });

  describe('12. the team information after 3 users join the team', function () {
    it('should contain the correct team name', function () {
      const elemList = locals.$('#team-name');
      assert.equal(elemList.text(), locals.team_name);
    });
    it('should contain the 4-character join code', function () {
      const elemList = locals.$('#join-code');
      assert.equal(locals.joinCode, elemList.text());
    });
  });
  describe('13. the fourth user can not join the already full team', function () {
    it('should be able to switch to the unteamed student', function () {
      const student = locals.studentUserNotInTeam;
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
    it('should NOT be able to join team', async () => {
      const response = await fetchCookie(fetch)(locals.assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'join_team',
          __csrf_token: locals.__csrf_token,
          join_code: locals.joinCode,
        }),
      });
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should contain a prompt to inform the user that the team is full', function () {
      assertAlert(locals.$, 'is already full');
    });
  });

  describe('13.5. The fourth user can create another team', () => {
    it('should be able to switch to the student not in team', function () {
      const student = locals.studentUserNotInTeam;
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
    it('should be able to create a team without a name', async () => {
      const response = await fetch(locals.assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'create_team',
          __csrf_token: locals.__csrf_token,
        }),
      });
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should contain the 4-character join code', function () {
      const elemList = locals.$('#join-code');
      locals.joinCode = elemList.text();
      assert.lengthOf(locals.joinCode, locals.$('#team-name').text().length + 1 + 4);
    });
  });

  describe('13.75. The first user cannot join the second team', () => {
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
    it('should NOT be able to join team', async () => {
      const response = await fetchCookie(fetch)(locals.assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'join_team',
          __csrf_token: locals.__csrf_token,
          join_code: locals.joinCode,
        }),
      });
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
      assertAlert(locals.$, 'You are already in another team');
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
    it('should have three rows under team members list', function () {
      const elemList = locals.$('.col-sm li');
      assert.lengthOf(elemList, 3);
    });
    it('should have 0 assessment instance in db', async () => {
      const rowCount = await sqldb.execute(sql.select_all_assessment_instance);
      assert.equal(rowCount, 0);
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
    it('should have 1 assessment instance in db', async () => {
      const result = await sqldb.queryRow(
        sql.select_all_assessment_instance,
        AssessmentInstanceSchema,
      );
      locals.assessment_instance_id = result.id;
      locals.assessmentInstanceURL =
        locals.courseInstanceUrl + '/assessment_instance/' + locals.assessment_instance_id;
      assert.equal(result.team_id, '1');
    });
  });

  describe('15. access control of all members of team 1', function () {
    it('should be able to access the assessment instance 1 as the 1st team member', async () => {
      const response = await fetch(locals.assessmentInstanceURL);
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should be able to switch to 2nd team member', function () {
      const student = locals.studentUsers[1];
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000002';
    });
    it('should be able to access the assessment instance 1 as the 2nd team member', async () => {
      const response = await fetch(locals.assessmentInstanceURL);
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should be able to switch to 3rd team member', function () {
      const student = locals.studentUsers[0];
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000001';
    });
    it('should be able to access the assessment instance 1 as the 3rd team member', async () => {
      const response = await fetch(locals.assessmentInstanceURL);
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
  });

  describe('16. access control of student who used to be in team 1 but not in any team now', function () {
    it('should have a CSRF token', function () {
      const elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 3);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('should be able to Leave the team', async () => {
      const response = await fetch(locals.assessmentInstanceURL, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'leave_team',
          __csrf_token: locals.__csrf_token,
        }),
      });
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should NOT be able to access the assessment instance 1 as a student not in team', async () => {
      const response = await fetch(locals.assessmentInstanceURL);
      assert.equal(response.status, 403);
    });
  });
  describe('17. access control of student who used to be in team 1 but in a different team now', function () {
    it('should have a CSRF token', function () {
      const elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 2);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('should be able to create a team', async () => {
      locals.team_name_alternative1 = 'teamCC';
      const response = await fetch(locals.assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'create_team',
          __csrf_token: locals.__csrf_token,
          team_name: locals.team_name_alternative1,
        }),
      });
      assert.equal(response.status, 200);
    });
    it('should NOT be able to access the assessment instance 1 as a student from a different team', async () => {
      const response = await fetch(locals.assessmentInstanceURL);
      assert.equal(response.status, 403);
    });
  });

  describe('18. access control of student who are not in any team', function () {
    it('should be able to switch to the student not in team', function () {
      const student = locals.studentUserNotInTeam;
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000004';
    });
    it('should NOT be able to access the assessment instance 1 as a student not in team', async () => {
      const response = await fetch(locals.assessmentInstanceURL);
      assert.equal(response.status, 403);
    });
  });

  describe('19. access control of student who are in a different team', function () {
    it('should be able to switch to the student in the different team', function () {
      const student = locals.studentUserInDiffTeam;
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
    it('should be able to create a team', async () => {
      locals.team_name_alternative2 = 'teamBBCC';
      const response = await fetch(locals.assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'create_team',
          __csrf_token: locals.__csrf_token,
          team_name: locals.team_name_alternative2,
        }),
      });
      assert.equal(response.status, 200);
    });
    it('should NOT be able to access the assessment instance 1 as a student from a different team', async () => {
      const response = await fetch(locals.assessmentInstanceURL);
      assert.equal(response.status, 403);
    });
  });

  describe('20. cross assessment teaming', function () {
    it('should contain a second team-based homework assessment', async () => {
      const rowCount = await sqldb.execute(sql.select_team_work_assessment);
      assert.equal(rowCount, 2);
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
    it('should NOT be able to join team using the join code from a different assessment', async () => {
      const response = await fetchCookie(fetch)(locals.assessmentUrl_2, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'join_team',
          __csrf_token: locals.__csrf_token,
          join_code: locals.joinCode,
        }),
      });
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should contain a prompt to inform the user that the team is invalid', function () {
      assertAlert(locals.$, 'does not exist');
    });
  });
});
