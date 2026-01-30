import * as cheerio from 'cheerio';
import { keyBy } from 'es-toolkit';
import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config.js';
import {
  type AssessmentInstance,
  AssessmentInstanceSchema,
  type InstanceQuestion,
  InstanceQuestionSchema,
  type Question,
  QuestionSchema,
} from '../lib/db-types.js';
import { selectAssessmentByTid } from '../models/assessment.js';

import * as helperQuestion from './helperQuestion.js';
import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const locals = {} as {
  siteUrl: string;
  baseUrl: string;
  courseInstanceBaseUrl: string;
  questionBaseUrl: string;
  assessmentsUrl: string;
  isStudentPage: boolean;
  totalPoints: number;
  assessment_id: string;
  assessmentUrl: string;
  $: cheerio.CheerioAPI;
  preStartTime: number;
  postStartTime: number;
  assessmentInstanceUrl: string;
  assessment_instance: AssessmentInstance;
  instance_questions: (InstanceQuestion & { qid: Question['qid'] })[];
  shouldHaveButtons: string[];
  postAction: string;
  question: TestQuestion;
  expectedResult: {
    submission_score: number;
    submission_correct: boolean;
    instance_question_points: number;
    instance_question_score_perc: number;
    instance_question_auto_points: number;
    instance_question_manual_points: number;
    assessment_instance_points: number;
    assessment_instance_score_perc: number;
  };
  getSubmittedAnswer: () => Record<string, string>;
};

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
  submission_score?: number;
}

const questionsArray: TestQuestion[] = [
  { qid: 'partialCredit1', type: 'Freeform', maxPoints: 5 },
  { qid: 'partialCredit2', type: 'Freeform', maxPoints: 13 },
  { qid: 'partialCredit3', type: 'Freeform', maxPoints: 10 },
  { qid: 'partialCredit4_v2', type: 'Calculation', maxPoints: 10 },
  { qid: 'partialCredit6_no_partial', type: 'Freeform', maxPoints: 11 },
];

const questions = keyBy(questionsArray, (question) => question.qid);

const assessmentMaxPoints = 49;

// score: value to submit, will be the percentage score for the submission
// sub_points: additional awarded points for this submission
const questionGradingTests: TestZone[][] = [
  [
    { qid: 'partialCredit1', score: 100, sub_points: 1 },
    { qid: 'partialCredit2', score: 100, sub_points: 2 },
    { qid: 'partialCredit2', score: 100, sub_points: 2 },
    { qid: 'partialCredit1', score: 0, sub_points: 0 },
    { qid: 'partialCredit4_v2', score: 100, sub_points: 3 },
    { qid: 'partialCredit3', score: 100, sub_points: 2 },
    { qid: 'partialCredit3', score: 100, sub_points: 2 },
    { qid: 'partialCredit3', score: 40, sub_points: 2 * 0.4 },
    { qid: 'partialCredit4_v2', score: 100, sub_points: 3 },
    { qid: 'partialCredit4_v2', score: 100, sub_points: 3 },
    { qid: 'partialCredit4_v2', score: 100, sub_points: 1 }, // reached max points
    { qid: 'partialCredit1', score: 100, sub_points: 1 },
    { qid: 'partialCredit1', score: 100, sub_points: 1 },
    { qid: 'partialCredit1', score: 100, sub_points: 1 },
    { qid: 'partialCredit2', score: 100, sub_points: 2 },
    { qid: 'partialCredit1', score: 100, sub_points: 1 }, // reached max points
    { qid: 'partialCredit1', score: 100, sub_points: 0 },
    { qid: 'partialCredit3', score: 100, sub_points: 2 * (1 - 0.4) },
    { qid: 'partialCredit3', score: 100, sub_points: 2 },
    { qid: 'partialCredit3', score: 100, sub_points: 2 }, // reached max auto points (has manual points)
    { qid: 'partialCredit3', score: 100, sub_points: 0 },
  ],
];

describe('Homework assessment with constant question values', { timeout: 60_000 }, function () {
  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  function startAssessment() {
    describe('the locals object', function () {
      it('should be cleared', function () {
        for (const prop in locals) {
          delete locals[prop as keyof typeof locals];
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
      it('should contain HW3', async () => {
        const { id: assessmentId } = await selectAssessmentByTid({
          course_instance_id: '1',
          tid: 'hw3-partialCredit',
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
      it('should have correct link for "Homework to test partial credit"', function () {
        const elemList = locals.$('td a:contains("Homework to test partial credit")');
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

  questionGradingTests.forEach(function (questionGradingTest, iQuestionGradingTest) {
    describe(`question grading test #${iQuestionGradingTest + 1}`, function () {
      describe('server', function () {
        it('should shut down', async function () {
          await helperServer.after();
        });
        it('should start up', async function () {
          await helperServer.before()();
        });
      });

      startAssessment();

      questionGradingTest.forEach(function (questionTest, iQuestionTest) {
        describe(`grade answer number #${iQuestionTest + 1} for question ${
          questionTest.qid
        } with score ${questionTest.score}`, function () {
          describe('setting up the submission data', function () {
            it('should succeed', function () {
              locals.shouldHaveButtons = ['grade', 'save'];
              locals.postAction = 'grade';
              locals.question = questions[questionTest.qid];
              locals.question.points = (locals.question.points ?? 0) + questionTest.sub_points;
              locals.totalPoints += questionTest.sub_points;
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
              locals.getSubmittedAnswer = () => ({ s: String(questionTest.score) });
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
