import * as cheerio from 'cheerio';
import { keyBy } from 'es-toolkit';
import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { config } from '../lib/config.js';
import { AssessmentInstanceSchema, SubmissionSchema, VariantSchema } from '../lib/db-types.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';

import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const locals: Record<string, any> = { siteUrl: 'http://localhost:' + config.serverPort };
locals.baseUrl = locals.siteUrl + '/pl';
locals.courseInstanceUrl = locals.baseUrl + '/course_instance/1';
locals.courseInstanceBaseUrl = locals.baseUrl + '/course_instance/1';

let page: string;
let elemList;

const question = [{ qid: 'addNumbers', type: 'Freeform', maxPoints: 5 }];
const questions = keyBy(question, (question) => question.qid);

describe('assessment instance group synchronization test', function () {
  const storedConfig: Record<string, any> = {};

  beforeAll(() => {
    storedConfig.authUid = config.authUid;
    storedConfig.authName = config.authName;
    storedConfig.authUin = config.authUin;
  });

  afterAll(() => {
    Object.assign(config, storedConfig);
  });

  beforeAll(helperServer.before());

  afterAll(helperServer.after);
  describe('1. database initialization', function () {
    it('get group-based homework assessment id', async () => {
      const assessment_ids = await sqldb.queryRows(sql.select_group_work_assessment, IdSchema);
      assert.notEqual(assessment_ids.length, 0);
      locals.assessment_id = assessment_ids[0];
      locals.assessmentUrl = locals.courseInstanceBaseUrl + '/assessment/' + locals.assessment_id;
      locals.instructorAssessmentsUrlGroupTab =
        locals.courseInstanceBaseUrl + '/instructor/assessment/' + locals.assessment_id + '/groups';
      locals.questionBaseUrl = locals.courseInstanceBaseUrl + '/instance_question';
      locals.assessmentsUrl = locals.courseInstanceBaseUrl + '/assessments';
    });
  });
  describe('2. GET to instructor assessments URL group tab for the first assessment', function () {
    it('should load successfully', async () => {
      const res = await fetch(locals.instructorAssessmentsUrlGroupTab);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 4);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
  });
  describe('3. user and group initialization', function () {
    it('create 3 users', async () => {
      locals.studentUsers = await generateAndEnrollUsers({ count: 3, course_instance_id: '1' });
      assert.lengthOf(locals.studentUsers, 3);
      locals.groupCreator = locals.studentUsers[0];
    });
    it('put 3 users in a group', async () => {
      const res = await fetch(locals.instructorAssessmentsUrlGroupTab, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'add_group',
          __csrf_token: locals.__csrf_token,
          group_name: 'testgroup',
          uids:
            locals.studentUsers[0].uid +
            ',' +
            locals.studentUsers[1].uid +
            ',' +
            locals.studentUsers[2].uid,
        }),
      });
      assert.equal(res.status, 200);
    });
    it('should create the correct group configuration', async () => {
      const rowCount = await sqldb.execute(sql.select_group_users, {
        assessment_id: locals.assessment_id,
        group_name: 'testgroup',
      });
      assert.equal(rowCount, 3);
    });
  });

  describe('4. assessment_instance initialization', function () {
    it('should be able to switch user we generated', function () {
      const student = locals.studentUsers[1];
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000001';
    });
    it('should load assessment page successfully', async () => {
      const res = await fetch(locals.assessmentUrl);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      elemList = locals.$('form input[name="__csrf_token"]');
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });

    it('should be able to start the assessment', async () => {
      const res = await fetch(locals.assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'new_instance',
          __csrf_token: locals.__csrf_token,
        }),
      });
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should have 1 assessment instance in db', async () => {
      const assessment_instance = await sqldb.queryRow(
        sql.select_all_assessment_instance,
        AssessmentInstanceSchema,
      );
      locals.assessment_instance_id = assessment_instance.id;
      locals.assessment_instance = assessment_instance;
      locals.assessmentInstanceUrl =
        locals.courseInstanceUrl + '/assessment_instance/' + locals.assessment_instance_id;
      assert.equal(assessment_instance.team_id, '1');
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      elemList = locals.$('form input[name="__csrf_token"]');
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
  });
  describe('5. question submission', function () {
    it('should be able to enter question page', async () => {
      const questionUrl = locals.$('a:contains("HW6.2")').attr('href');
      locals.questionUrl = `${locals.siteUrl}${questionUrl}`;
      const res = await fetch(locals.questionUrl);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should have a variant_id input', function () {
      elemList = locals.$('.question-form input[name="__variant_id"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.variant_id = elemList[0].attribs.value;
      locals.variant_id = Number.parseInt(locals.variant_id);
    });
    it('should have the variant in the DB if has grade or save button', async () => {
      locals.variant = await sqldb.queryRow(
        sql.select_variant,
        { variant_id: locals.variant_id },
        VariantSchema,
      );
    });
    it('should have a CSRF token if has grade or save button', function () {
      elemList = locals.$('.question-form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    describe('setting up the submission data', function () {
      locals.postAction = 'grade';
      locals.question = questions.addNumbers;
      locals.expectedResult = {
        submission_score: 1,
        submission_correct: true,
        instance_question_points: 1,
        instance_question_score_perc: (1 / 5) * 100,
        assessment_instance_points: 1,
        assessment_instance_score_perc: (1 / 10) * 100,
      };
      locals.getSubmittedAnswer = function (variant: any) {
        return {
          F: variant.true_answer.F,
        };
      };
    });
    it('should generate the submittedAnswer', async () => {
      locals.submittedAnswer = locals.getSubmittedAnswer(locals.variant);
      const res = await fetch(locals.questionUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: locals.postAction,
          __csrf_token: locals.__csrf_token,
          __variant_id: locals.variant.id,
          ...locals.submittedAnswer,
        }),
      });
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
  });
  describe('6. check Score for current student', function () {
    it('should have the submission', async () => {
      locals.submission = await sqldb.queryRow(
        sql.select_last_submission_for_variants,
        { variant_id: locals.variant.id },
        SubmissionSchema,
      );
    });
    it('should be graded with expected score', function () {
      assert.equal(locals.submission.score, locals.expectedResult.submission_score);
    });
    it('should be graded with expected correctness', function () {
      assert.equal(locals.submission.correct, locals.expectedResult.submission_correct);
    });
    it('should still have the assessment_instance', async () => {
      locals.assessment_instance = await sqldb.queryRow(
        sql.select_assessment_instance,
        AssessmentInstanceSchema,
      );
    });
  });
  describe('7. check Score for another student', function () {
    it('should be able to switch user we generated', function () {
      const student = locals.studentUsers[2];
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000002';
    });
    it('should load assessment page successfully', async () => {
      const res = await fetch(locals.assessmentUrl);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      elemList = locals.$('form input[name="__csrf_token"]');
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('should still have the only assessment instance in db', async () => {
      const result = await sqldb.queryRow(
        sql.select_all_assessment_instance,
        AssessmentInstanceSchema,
      );
      assert.equal(result.id, locals.assessment_instance_id);
      locals.assessment_instance = result;
    });
  });
});
