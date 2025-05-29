import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config.js';

import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);
interface Question {
  qid: string;
  type: string;
  id?: number;
  url?: string;
  points?: number;
}

const locals: {
  [key: string]: any;
  siteUrl?: string;
  baseUrl?: string;
  courseBaseUrl?: string;
  courseInstanceBaseUrl?: string;
  instructorBaseUrl?: string;
  instructorAssessmentsUrl?: string;
  instructorGradebookUrl?: string;
  questionBaseUrl?: string;
  assessmentsUrl?: string;
  isStudentPage?: boolean;
  totalPoints?: number;
  questions?: Question[];
  assessment_id?: string;
  assessmentInstanceUrl?: string;
  assessmentUrl?: string;
  instance_questions?: Question[];
  assessment_instance?: any;
  $?: cheerio.CheerioAPI;
} = {};

locals.siteUrl = `http://localhost:${config.serverPort}`;
locals.baseUrl = `${locals.siteUrl}/pl`;
locals.courseBaseUrl = `${locals.baseUrl}/course/1`;
locals.courseInstanceBaseUrl = `${locals.baseUrl}/course_instance/1`;
locals.instructorBaseUrl = `${locals.courseInstanceBaseUrl}/instructor`;
locals.instructorAssessmentsUrl = `${locals.instructorBaseUrl}/instance_admin/assessments`;
locals.instructorGradebookUrl = `${locals.instructorBaseUrl}/instance_admin/gradebook`;
locals.questionBaseUrl = `${locals.courseInstanceBaseUrl}/instance_question`;
locals.assessmentsUrl = `${locals.courseInstanceBaseUrl}/assessments`;
locals.isStudentPage = true;

const questionsArray: Question[] = [{ qid: 'addNumbersParameterized', type: 'Freeform' }];

describe('Parameterized questions', { timeout: 40_000 }, function () {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  it('should verify database contains expected questions', async function () {
    const result = await sqldb.queryAsync(sql.select_questions, []);
    assert.notEqual(result.rowCount, 0, 'No questions found in DB');
    locals.questions = result.rows.map((row) => ({
      qid: row.directory,
      id: row.id,
      url: `${locals.questionBaseUrl}/${row.id}/`,
      type: 'Freeform',
    }));
    questionsArray.forEach((question) => {
      const foundQuestion = locals.questions?.find((q) => q.qid === question.qid);
      assert.isDefined(foundQuestion, `Question ${question.qid} not found`);
      Object.assign(question, foundQuestion);
    });
  });

  describe('Assessment inheritance tests', function () {
    beforeAll(async function () {
      // Get assessment data from database.
      const hwResult = await sqldb.queryOneRowAsync(sql.select_hw, []);
      locals.assessment_id = hwResult.rows[0].id;
      locals.assessmentUrl = `${locals.courseInstanceBaseUrl}/assessment/${locals.assessment_id}/`;

      // Load the assessment page to trigger creation of an assessment instance.
      const response = await fetch(locals.assessmentUrl);
      assert.equal(response.status, 200);
      // The response URL should be that of the assessment instance.
      locals.assessmentInstanceUrl = response.url;
      // Parse the assessment page.
      locals.$ = cheerio.load(await response.text());
    });

    describe('GET to assessment_instance URL', function () {
      let page = '';
      beforeAll(async function () {
        if (!locals.assessmentInstanceUrl) {
          throw new Error('assessmentInstanceUrl is undefined');
        }
        const res = await fetch(locals.assessmentInstanceUrl);
        assert.equal(res.status, 200);
        page = await res.text();
        locals.$ = cheerio.load(page);
      });

      it('should create one assessment_instance', async function () {
        const result = await sqldb.queryAsync(sql.select_assessment_instances, []);
        if (result.rowCount !== 1) {
          throw new Error('expected one assessment_instance, got: ' + result.rowCount);
        }
        locals.assessment_instance = result.rows[0];
      });

      it('should have the correct assessment_instance.assessment_id', function () {
        assert.equal(locals.assessment_instance.assessment_id, locals.assessment_id);
      });

      it(`should create ${questionsArray.length} instance_questions`, async function () {
        const result = await sqldb.queryAsync(sql.select_instance_questions, []);
        if (result.rowCount !== questionsArray.length) {
          throw new Error(
            `expected ${questionsArray.length} instance_questions, got: ` + result.rowCount,
          );
        }
        locals.instance_questions = result.rows;
      });

      questionsArray.forEach(function (question, i) {
        it(`should have question #${i + 1} as QID ${question.qid}`, function () {
          if (!locals.instance_questions) {
            throw new Error('assessmentInstanceUrl is undefined');
          }
          question.id = locals.instance_questions[i].id;
          assert.equal(locals.instance_questions[i].qid, question.qid);
          const urlTail = `/pl/course_instance/1/instance_question/${question.id}/`;
          question.url = locals.siteUrl + urlTail;
          if (!locals.$) {
            throw new Error("'locals.$' is undefined");
          }
          const elemList = locals.$(`td a[href="${urlTail}"]`);
          assert.lengthOf(elemList, 1, `Link for question ${question.qid} not found`);
        });
      });
    });

    questionsArray.forEach((question, index) => {
      describe('Verify question parameters', () => {
        it(`should verify question #${index + 1} (${question.qid}) has correct parameters`, async function () {
          if (!question.url) {
            throw new Error(`URL for question #${index + 1} (${question.qid}) is undefined`);
          }
          console.log(`Fetching instance question URL: ${question.url}`);
          const response = await fetch(question.url);
          assert.equal(response.status, 200);
          const $ = cheerio.load(await response.text());
          const expectedRange = '[30, 50]';
          const elemList = $('span').filter(function () {
            return $(this).text().trim() === expectedRange;
          });
          assert.lengthOf(
            elemList,
            1,
            `Expected range ${expectedRange} not found for question ${question.qid}`,
          );
        });
      });
    });
  });
});
