import * as _ from 'lodash';
import { assert } from 'chai';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

import { config } from '../lib/config';
import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(__filename);

// sorted alphabetically by qid
export const questionsArray: {
  qid: string;
  type: 'Freeform' | 'Calculation';
  maxPoints: number;
  points?: number;
  id?: string;
  url?: string;
}[] = [
  { qid: 'addNumbers', type: 'Freeform', maxPoints: 5 },
  { qid: 'addVectors', type: 'Calculation', maxPoints: 11 },
  { qid: 'brokenGeneration', type: 'Freeform', maxPoints: 10 },
  { qid: 'fossilFuelsRadio', type: 'Calculation', maxPoints: 17 },
  { qid: 'partialCredit1', type: 'Freeform', maxPoints: 19 },
  { qid: 'partialCredit2', type: 'Freeform', maxPoints: 9 },
  { qid: 'partialCredit3', type: 'Freeform', maxPoints: 13 },
];

export const questions = _.keyBy(questionsArray, 'qid');

// must be the sum of maxPoints in questionsArray, but we hard-code it for reference
export const assessmentMaxPoints = 94;

export function startExam(locals: Record<string, any>) {
  describe('startExam-1. the locals object', function () {
    it('should be cleared', function () {
      for (const prop in locals) {
        delete locals[prop];
      }
    });
    it('should be initialized', function () {
      locals.siteUrl = 'http://localhost:' + config.serverPort;
      locals.baseUrl = locals.siteUrl + '/pl';
      locals.courseInstanceBaseUrl = locals.baseUrl + '/course_instance/1';
      locals.instructorBaseUrl = locals.courseInstanceBaseUrl + '/instructor';
      locals.instructorAssessmentsUrl = locals.instructorBaseUrl + '/instance_admin/assessments';
      locals.instructorGradebookUrl = locals.instructorBaseUrl + '/instance_admin/gradebook';
      locals.questionBaseUrl = locals.courseInstanceBaseUrl + '/instance_question';
      locals.assessmentsUrl = locals.courseInstanceBaseUrl + '/assessments';
      locals.isStudentPage = true;
      locals.totalPoints = 0;
    });
  });

  describe('startExam-2. the questions', function () {
    it('should have cleared data', function () {
      questionsArray.forEach(function (question) {
        for (const prop in question) {
          if (prop !== 'qid' && prop !== 'type' && prop !== 'maxPoints') {
            delete question[prop];
          }
        }
        question.points = 0;
      });
    });
  });

  describe('startExam-3. the database', function () {
    it('should contain E1', async function () {
      const result = await sqldb.queryOneRowAsync(sql.select_e1, []);
      locals.assessment_id = result.rows[0].id;
    });
  });

  describe('startExam-4. GET to assessments URL', function () {
    it('should load successfully', async function () {
      assert(locals.assessmentsUrl);
      const response = await fetch(locals.assessmentsUrl);
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should contain E1 and have the correct link', function () {
      assert(locals.$);
      const elemList = locals.$('td a:contains("Exam for automatic test suite")');
      assert.lengthOf(elemList, 1);
      locals.assessmentUrl = locals.siteUrl + elemList[0].attribs.href;
      assert.equal(
        locals.assessmentUrl,
        locals.courseInstanceBaseUrl + '/assessment/' + locals.assessment_id + '/',
      );
    });
  });

  describe('startExam-5. GET to assessment URL', function () {
    it('should load successfully', async function () {
      assert(locals.assessmentUrl);
      const response = await fetch(locals.assessmentUrl);
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should contain "Exam 1"', function () {
      assert(locals.$);
      const elemList = locals.$('p.lead strong:contains("Exam 1")');
      assert.lengthOf(elemList, 1);
    });
    it('should contain "QA 101"', function () {
      assert(locals.$);
      const elemList = locals.$('p.lead strong:contains("QA 101")');
      assert.lengthOf(elemList, 1);
    });
    it('should have a CSRF token', function () {
      assert(locals.$);
      const elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
  });

  describe('startExam-6. POST to assessment URL', function () {
    it('should load successfully', async function () {
      assert(locals.assessmentUrl);
      assert(locals.__csrf_token);
      const form = {
        __action: 'new_instance',
        __csrf_token: locals.__csrf_token,
      };
      locals.preStartTime = Date.now();
      const response = await fetch(locals.assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams(form),
      });
      locals.postStartTime = Date.now();
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
      locals.assessmentInstanceUrl = response.url;
      assert.equal(new URL(response.url).pathname, '/pl/course_instance/1/assessment_instance/1');
    });
    it('should create one assessment_instance', async function () {
      const result = await sqldb.queryAsync(sql.select_assessment_instances, []);
      assert.equal(result.rowCount, 1);
      locals.assessment_instance = result.rows[0];
    });
    it('should have the correct assessment_instance.assessment_id', function () {
      assert.equal(locals.assessment_instance?.assessment_id, locals.assessment_id);
    });
    it(`should create ${questionsArray.length} instance_questions`, async function () {
      const result = await sqldb.queryAsync(sql.select_instance_questions, []);
      assert.equal(result.rowCount, questionsArray.length);
      locals.instance_questions = result.rows;
    });
    questionsArray.forEach(function (question, i) {
      it(`should have question #${i + 1} as QID ${question.qid}`, function () {
        assert(locals.instance_questions);
        question.id = locals.instance_questions[i].id;
        assert.equal(locals.instance_questions[i].qid, question.qid);
      });
    });
  });

  describe('startExam-7. GET to assessment_instance URL', function () {
    it('should load successfully', async function () {
      assert(locals.assessmentInstanceUrl);
      const response = await fetch(locals.assessmentInstanceUrl);
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    questionsArray.forEach(function (question) {
      it(`should link to ${question.qid} question`, function () {
        assert(locals.$);
        const urlTail = '/pl/course_instance/1/instance_question/' + question.id + '/';
        question.url = locals.siteUrl + urlTail;
        const elemList = locals.$(`td a[href="${urlTail}"]`);
        assert.lengthOf(elemList, 1);
      });
    });
  });
}
