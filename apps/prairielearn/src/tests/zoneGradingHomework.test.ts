import * as cheerio from 'cheerio';
import { keyBy } from 'es-toolkit';
import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config.js';
import {
  AssessmentInstanceSchema,
  InstanceQuestionSchema,
  QuestionSchema,
} from '../lib/db-types.js';
import { selectAssessmentByTid } from '../models/assessment.js';

import * as helperQuestion from './helperQuestion.js';
import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const locals: Record<string, any> = {};

interface TestQuestion {
  qid: string;
  type: string;
  maxPoints: number;
  points?: number;
  id?: number | string;
  url?: string;
  submission_score?: number;
}

interface TestZone {
  qid: string;
  score: number;
  sub_points: number;
  sub_total_points: number;
  submission_score?: number;
}

const questionsArray: TestQuestion[] = [
  { qid: 'partialCredit4_v2', type: 'Calculation', maxPoints: 8 },
  { qid: 'partialCredit1', type: 'Freeform', maxPoints: 30 },
  { qid: 'partialCredit2', type: 'Freeform', maxPoints: 40 },
  { qid: 'partialCredit3', type: 'Freeform', maxPoints: 50 },
];

const questions = keyBy(questionsArray, (question) => question.qid);

const assessmentMaxPoints = 57;

// score: value to submit, will be the percentage score for the submission
// sub_points: additional awarded points for this submission
// sub_total_points: additional total points for this submission
const zoneGradingTests: TestZone[][] = [
  [
    {
      qid: 'partialCredit1',
      score: 100,
      sub_points: 5,
      sub_total_points: 5,
    },
    {
      qid: 'partialCredit2',
      score: 100,
      sub_points: 5,
      sub_total_points: 0,
    },
    {
      qid: 'partialCredit2',
      score: 100,
      sub_points: 10,
      sub_total_points: 10,
    },
    {
      qid: 'partialCredit1',
      score: 0,
      sub_points: 0,
      sub_total_points: 0,
    },
    {
      qid: 'partialCredit4_v2',
      score: 100,
      sub_points: 4,
      sub_total_points: 4,
    },
    {
      qid: 'partialCredit3',
      score: 100,
      sub_points: 5,
      sub_total_points: 0,
    },
    {
      qid: 'partialCredit3',
      score: 100,
      sub_points: 10,
      sub_total_points: 0,
    },
    {
      qid: 'partialCredit3',
      score: 40,
      sub_points: 2,
      sub_total_points: 2,
    },
    {
      qid: 'partialCredit4_v2',
      score: 100,
      sub_points: 4,
      sub_total_points: 3,
    },
    {
      qid: 'partialCredit4_v2',
      score: 100,
      sub_points: 0,
      sub_total_points: 0,
    },
    {
      qid: 'partialCredit1',
      score: 100,
      sub_points: 5,
      sub_total_points: 0,
    },
    {
      qid: 'partialCredit1',
      score: 100,
      sub_points: 10,
      sub_total_points: 3,
    },
    {
      qid: 'partialCredit1',
      score: 100,
      sub_points: 10,
      sub_total_points: 10,
    },
    {
      qid: 'partialCredit2',
      score: 100,
      sub_points: 15,
      sub_total_points: 0,
    },
  ],
];

describe('Zone grading homework assessment', { timeout: 60_000 }, function () {
  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  function startAssessment() {
    describe('the locals object', function () {
      it('should be cleared', function () {
        for (const prop in locals) {
          delete locals[prop];
        }
      });
      it('should be initialized', function () {
        locals.siteUrl = 'http://localhost:' + config.serverPort;
        locals.baseUrl = locals.siteUrl + '/pl';
        locals.courseInstanceBaseUrl = locals.baseUrl + '/course_instance/1';
        locals.questionBaseUrl = locals.courseInstanceBaseUrl + '/instance_question';
        locals.assessmentsUrl = locals.courseInstanceBaseUrl + '/assessments';
        locals.isStudentPage = true;
        locals.totalPoints = 0;
      });
    });

    describe('the questions', function () {
      it('should have cleared data', function () {
        questionsArray.forEach(function (question) {
          for (const prop in question) {
            if (prop !== 'qid' && prop !== 'type' && prop !== 'maxPoints') {
              delete question[prop as keyof TestQuestion];
            }
          }
          question.points = 0;
        });
      });
    });

    describe('the database', function () {
      it('should contain HW4', async () => {
        const { id: assessmentId } = await selectAssessmentByTid({
          course_instance_id: '1',
          tid: 'hw4-perzonegrading',
        });
        locals.assessment_id = assessmentId;
      });
    });

    describe('GET assessments list URL', function () {
      it('should load successfully', async () => {
        const res = await fetch(locals.assessmentsUrl);
        assert.equal(res.status, 200);
        const page = await res.text();
        locals.$ = cheerio.load(page);
      });
      it('should have correct link for "Homework to test per-zone grading"', function () {
        const elemList = locals.$('td a:contains("Homework to test per-zone grading")');
        assert.lengthOf(elemList, 1);

        locals.assessmentUrl = locals.siteUrl + elemList[0].attribs.href;
        assert.equal(
          locals.assessmentUrl,
          locals.courseInstanceBaseUrl + '/assessment/' + locals.assessment_id + '/',
        );
      });
    });

    describe('GET to assessment URL', function () {
      it('should load successfully', async () => {
        locals.preStartTime = Date.now();

        const res = await fetch(locals.assessmentUrl);
        assert.equal(res.status, 200);
        const page = await res.text();
        locals.$ = cheerio.load(page);

        // Check that we redirected to the correct URL
        const url = new URL(res.url);
        locals.assessmentInstanceUrl = locals.siteUrl + url.pathname;
        assert.equal(url.pathname, '/pl/course_instance/1/assessment_instance/1');

        locals.postStartTime = Date.now();
      });
      it('should create one assessment_instance', async () => {
        locals.assessment_instance = await sqldb.queryRow(
          sql.select_assessment_instances,
          AssessmentInstanceSchema,
        );
      });
      it('should have the correct assessment_instance.assessment_id', function () {
        assert.equal(locals.assessment_instance.assessment_id, locals.assessment_id);
      });
      it(`should create ${questionsArray.length} instance_questions`, async () => {
        const result = await sqldb.queryRows(
          sql.select_instance_questions,
          z.object({
            ...InstanceQuestionSchema.shape,
            qid: QuestionSchema.shape.qid,
          }),
        );
        if (result.length !== questionsArray.length) {
          throw new Error(
            `expected ${questionsArray.length} instance_questions, got: ` + result.length,
          );
        }
        locals.instance_questions = result;
      });
      questionsArray.forEach(function (question, i) {
        it(`should have question #${i + 1} as QID ${question.qid}`, function () {
          question.id = locals.instance_questions[i].id;
          assert.equal(locals.instance_questions[i].qid, question.qid);
        });
      });
    });

    describe('GET to assessment_instance URL', function () {
      it('should load successfully', async () => {
        const res = await fetch(locals.assessmentInstanceUrl);
        assert.equal(res.status, 200);
        const page = await res.text();
        locals.$ = cheerio.load(page);
      });
      questionsArray.forEach(function (question) {
        it(`should link to ${question.qid} question`, function () {
          const urlTail = '/pl/course_instance/1/instance_question/' + question.id + '/';
          question.url = locals.siteUrl + urlTail;
          const elemList = locals.$(`td a[href="${urlTail}"]`);
          assert.lengthOf(elemList, 1);
        });
      });
    });
  }

  zoneGradingTests.forEach(function (zoneGradingTest, iZoneGradingTest) {
    describe(`zone grading test #${iZoneGradingTest + 1}`, function () {
      describe('server', function () {
        it('should shut down', async function () {
          await helperServer.after();
        });
        it('should start up', async function () {
          await helperServer.before()();
        });
      });

      startAssessment();

      zoneGradingTest.forEach(function (questionTest, iQuestionTest) {
        describe(`grade answer number #${iQuestionTest + 1} for question ${
          questionTest.qid
        } with score ${questionTest.score}`, function () {
          describe('setting up the submission data', function () {
            it('should succeed', function () {
              locals.shouldHaveButtons = ['grade', 'save'];
              locals.postAction = 'grade';
              locals.question = questions[questionTest.qid];
              locals.question.points += questionTest.sub_points;
              locals.totalPoints += questionTest.sub_total_points;
              const submission_score =
                questionTest.submission_score == null
                  ? questionTest.score
                  : questionTest.submission_score;
              locals.expectedResult = {
                submission_score: submission_score / 100,
                submission_correct: submission_score === 100,
                instance_question_points: locals.question.points,
                instance_question_score_perc:
                  (locals.question.points / locals.question.maxPoints) * 100,
                instance_question_auto_points: locals.question.points,
                instance_question_manual_points: 0,
                assessment_instance_points: locals.totalPoints,
                assessment_instance_score_perc: (locals.totalPoints / assessmentMaxPoints) * 100,
              };
              locals.getSubmittedAnswer = function (_variant: any) {
                return {
                  s: String(questionTest.score),
                };
              };
            });
          });
          helperQuestion.getInstanceQuestion(locals);
          helperQuestion.postInstanceQuestion(locals);
          helperQuestion.checkQuestionScore(locals);
          helperQuestion.checkAssessmentScore(locals);
        });
      });
    });
  });
});
