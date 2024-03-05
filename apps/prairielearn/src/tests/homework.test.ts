import _ = require('lodash');
import { assert } from 'chai';
import request = require('request');
import * as cheerio from 'cheerio';

import { config } from '../lib/config';
import * as sqldb from '@prairielearn/postgres';

import * as helperServer from './helperServer';
import * as helperQuestion from './helperQuestion';
import * as helperAttachFiles from './helperAttachFiles';

const sql = sqldb.loadSqlEquiv(__filename);

const locals: Record<string, any> = {};

interface TestQuestion {
  qid: string;
  type: string;
  maxPoints: number;
  points?: number;
  id?: number | string;
  url?: string;
}

const questionsArray: TestQuestion[] = [
  { qid: 'addNumbers', type: 'Freeform', maxPoints: 5 },
  { qid: 'addVectors', type: 'Calculation', maxPoints: 11 },
  { qid: 'fossilFuelsRadio', type: 'Calculation', maxPoints: 14 },
  { qid: 'downloadFile', type: 'Freeform', maxPoints: 17 },
  { qid: 'partialCredit1', type: 'Freeform', maxPoints: 6 },
  { qid: 'partialCredit2', type: 'Freeform', maxPoints: 7 },
  { qid: 'partialCredit3', type: 'Freeform', maxPoints: 11 },
  { qid: 'partialCredit4_v2', type: 'Calculation', maxPoints: 13 },
  { qid: 'partialCredit5_v2_partial', type: 'Calculation', maxPoints: 12 },
  { qid: 'partialCredit6_no_partial', type: 'Freeform', maxPoints: 8 },
  { qid: 'brokenGrading', type: 'Freeform', maxPoints: 4 },
];

const questions = _.keyBy(questionsArray, 'qid');

const assessmentMaxPoints = 108;

// each outer entry is a whole exam session
// each inner entry is a list of question submissions
//     score: value to submit, will be the percentage score for the submission
//     action: 'save', 'grade', 'store', 'save-stored-fail', 'grade-stored-fail'
//     sub_points: additional points awarded for this submission (NOT total points for the question)
//     open: true or false
const partialCreditTests = [
  [
    // answer every question correctly
    { qid: 'partialCredit1', action: 'grade', score: 100, sub_points: 1 },
    { qid: 'partialCredit2', action: 'grade', score: 100, sub_points: 2 },
    { qid: 'partialCredit3', action: 'grade', score: 100, sub_points: 3 },
    { qid: 'partialCredit1', action: 'grade', score: 100, sub_points: 2 },
    { qid: 'partialCredit2', action: 'grade', score: 100, sub_points: 4 },
    { qid: 'partialCredit3', action: 'grade', score: 100, sub_points: 6 },
    { qid: 'partialCredit1', action: 'grade', score: 100, sub_points: 3 },
    { qid: 'partialCredit2', action: 'grade', score: 100, sub_points: 1 },
    { qid: 'partialCredit3', action: 'grade', score: 100, sub_points: 2 },
    { qid: 'partialCredit1', action: 'grade', score: 100, sub_points: 0 },
    { qid: 'partialCredit2', action: 'grade', score: 100, sub_points: 0 },
    { qid: 'partialCredit3', action: 'grade', score: 100, sub_points: 0 },
  ],
  [
    // mix 100% and 0% submissions
    { qid: 'partialCredit1', action: 'grade', score: 100, sub_points: 1 },
    { qid: 'partialCredit2', action: 'grade', score: 100, sub_points: 2 },
    { qid: 'partialCredit3', action: 'grade', score: 100, sub_points: 3 },
    { qid: 'partialCredit1', action: 'grade', score: 0, sub_points: 0 },
    { qid: 'partialCredit2', action: 'grade', score: 0, sub_points: 0 },
    { qid: 'partialCredit3', action: 'grade', score: 0, sub_points: 0 },
    { qid: 'partialCredit1', action: 'grade', score: 0, sub_points: 0 },
    { qid: 'partialCredit2', action: 'grade', score: 0, sub_points: 0 },
    { qid: 'partialCredit3', action: 'grade', score: 0, sub_points: 0 },
    { qid: 'partialCredit1', action: 'grade', score: 100, sub_points: 1 },
    { qid: 'partialCredit2', action: 'grade', score: 100, sub_points: 2 },
    { qid: 'partialCredit3', action: 'grade', score: 100, sub_points: 3 },
    { qid: 'partialCredit1', action: 'grade', score: 100, sub_points: 2 },
    { qid: 'partialCredit2', action: 'grade', score: 100, sub_points: 3 },
    { qid: 'partialCredit3', action: 'grade', score: 100, sub_points: 5 },
    { qid: 'partialCredit1', action: 'grade', score: 0, sub_points: 0 },
    { qid: 'partialCredit2', action: 'grade', score: 0, sub_points: 0 },
    { qid: 'partialCredit3', action: 'grade', score: 0, sub_points: 0 },
    { qid: 'partialCredit1', action: 'grade', score: 100, sub_points: 1 },
    { qid: 'partialCredit2', action: 'grade', score: 100, sub_points: 0 },
    { qid: 'partialCredit3', action: 'grade', score: 100, sub_points: 0 },
    { qid: 'partialCredit1', action: 'grade', score: 100, sub_points: 1 },
    { qid: 'partialCredit2', action: 'grade', score: 100, sub_points: 0 },
    { qid: 'partialCredit3', action: 'grade', score: 100, sub_points: 0 },
    { qid: 'partialCredit1', action: 'grade', score: 100, sub_points: 0 },
    { qid: 'partialCredit2', action: 'grade', score: 100, sub_points: 0 },
    { qid: 'partialCredit3', action: 'grade', score: 100, sub_points: 0 },
  ],
  [
    // test partial credit on question without retries
    { qid: 'partialCredit1', action: 'grade', score: 15, sub_points: 0.15 },
    { qid: 'partialCredit1', action: 'grade', score: 11, sub_points: 0 },
    {
      qid: 'partialCredit1',
      action: 'grade',
      score: 34,
      sub_points: 0.34 - 0.15,
    },
    {
      qid: 'partialCredit1',
      action: 'grade',
      score: 99,
      sub_points: 0.99 - 0.34,
    },
    { qid: 'partialCredit1', action: 'grade', score: 87, sub_points: 0 },
    {
      qid: 'partialCredit1',
      action: 'grade',
      score: 100,
      sub_points: 1 - 0.99,
    },
    { qid: 'partialCredit1', action: 'grade', score: 85, sub_points: 0.85 },
    { qid: 'partialCredit1', action: 'grade', score: 85, sub_points: 0 },
    { qid: 'partialCredit1', action: 'grade', score: 84, sub_points: 0 },
    {
      qid: 'partialCredit1',
      action: 'grade',
      score: 100,
      sub_points: 1 - 0.85,
    },
    { qid: 'partialCredit1', action: 'grade', score: 100, sub_points: 2 }, // doubled, previous was new variant
    { qid: 'partialCredit1', action: 'grade', score: 0, sub_points: 0 },
    { qid: 'partialCredit1', action: 'grade', score: 100, sub_points: 1 },
    { qid: 'partialCredit1', action: 'grade', score: 53, sub_points: 0.53 },
    {
      qid: 'partialCredit1',
      action: 'grade',
      score: 100,
      sub_points: 1 - 0.53,
    },
    { qid: 'partialCredit1', action: 'grade', score: 100, sub_points: 0 },
  ],
  /* FIXME: temporarily disabled, re-enable after current_value update change
    [
        // test partial credit on question with retries
        {qid: 'partialCredit2', action: 'grade',             score: 71,  sub_points: 2*0.71},
        {qid: 'partialCredit2', action: 'grade',             score: 56,  sub_points: 0},
        {qid: 'partialCredit2', action: 'grade',             score: 78,  sub_points: 2*(0.78-0.71)},
        {qid: 'partialCredit2', action: 'grade',             score: 94,  sub_points: 2*(0.94-0.78)},
        {qid: 'partialCredit2', action: 'grade',             score: 100, sub_points: 2*(1-0.94)},
        {qid: 'partialCredit2', action: 'grade',             score: 100, sub_points: 2},  // not doubled, previous was old variant
        {qid: 'partialCredit2', action: 'grade',             score: 100, sub_points: 3},  // doubled, previous was new variant
        {qid: 'partialCredit2', action: 'grade',             score: 82,  sub_points: 0},
        {qid: 'partialCredit2', action: 'grade',             score: 100, sub_points: 0},
    ],
    */
  [
    // FIXME: temporarily enabled, remove after current_value update change

    // test partial credit on question with retries
    { qid: 'partialCredit2', action: 'grade', score: 71, sub_points: 2 * 0.71 },
    { qid: 'partialCredit2', action: 'grade', score: 56, sub_points: 0 },
    {
      qid: 'partialCredit2',
      action: 'grade',
      score: 78,
      sub_points: 2 * (0.78 - 0.71),
    },
    {
      qid: 'partialCredit2',
      action: 'grade',
      score: 94,
      sub_points: 2 * (0.94 - 0.78),
    },
    {
      qid: 'partialCredit2',
      action: 'grade',
      score: 100,
      sub_points: 2 * (1 - 0.94),
    },
    { qid: 'partialCredit2', action: 'grade', score: 100, sub_points: 4 }, // doubled, although previous was old variant
    { qid: 'partialCredit2', action: 'grade', score: 82, sub_points: 1 },
    { qid: 'partialCredit2', action: 'grade', score: 100, sub_points: 0 },
    { qid: 'partialCredit2', action: 'grade', score: 100, sub_points: 0 },
  ],
  [
    // test partial credit on v2 questions
    {
      qid: 'partialCredit4_v2',
      action: 'grade',
      score: 34,
      submission_score: 0,
      sub_points: 0,
    },
    {
      qid: 'partialCredit4_v2',
      action: 'grade',
      score: 68,
      submission_score: 100,
      sub_points: 4,
    },
    {
      qid: 'partialCredit5_v2_partial',
      action: 'grade',
      score: 27,
      sub_points: 5 * 0.27,
    },
    {
      qid: 'partialCredit5_v2_partial',
      action: 'grade',
      score: 56,
      sub_points: 5 * (0.56 - 0.27),
    },
  ],
];

describe('Homework assessment', function () {
  this.timeout(60000);

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  let res, page, elemList;

  const startAssessment = function () {
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
              delete question[prop];
            }
          }
          question.points = 0;
        });
      });
    });

    describe('the database', function () {
      it('should contain HW1', async () => {
        const result = await sqldb.queryOneRowAsync(sql.select_hw1, []);
        locals.assessment_id = result.rows[0].id;
      });
    });

    describe('GET ' + locals.assessmentsUrl, function () {
      it('should load successfully', function (callback) {
        request(locals.assessmentsUrl, function (error, response, body) {
          if (error) {
            return callback(error);
          }
          if (response.statusCode !== 200) {
            return callback(new Error('bad status: ' + response.statusCode));
          }
          res = response;
          page = body;
          callback(null);
        });
      });
      it('should parse', function () {
        locals.$ = cheerio.load(page);
      });
      it('should contain HW1', function () {
        elemList = locals.$('td a:contains("Homework for automatic test suite")');
        assert.lengthOf(elemList, 1);
      });
      it('should have the correct link for HW1', function () {
        locals.assessmentUrl = locals.siteUrl + elemList[0].attribs.href;
        assert.equal(
          locals.assessmentUrl,
          locals.courseInstanceBaseUrl + '/assessment/' + locals.assessment_id + '/',
        );
      });
    });

    describe('GET to assessment URL', function () {
      it('should load successfully', function (callback) {
        locals.preStartTime = Date.now();
        request(locals.assessmentUrl, function (error, response, body) {
          if (error) {
            return callback(error);
          }
          locals.postStartTime = Date.now();
          if (response.statusCode !== 200) {
            return callback(new Error('bad status: ' + response.statusCode));
          }
          res = response;
          page = body;
          callback(null);
        });
      });
      it('should redirect to the correct path', function () {
        locals.assessmentInstanceUrl = locals.siteUrl + res.req.path;
        assert.equal(res.req.path, '/pl/course_instance/1/assessment_instance/1');
      });
      it('should create one assessment_instance', async () => {
        const result = await sqldb.queryAsync(sql.select_assessment_instances, []);
        if (result.rowCount !== 1) {
          throw new Error('expected one assessment_instance, got: ' + result.rowCount);
        }
        locals.assessment_instance = result.rows[0];
      });
      it('should have the correct assessment_instance.assessment_id', function () {
        assert.equal(locals.assessment_instance.assessment_id, locals.assessment_id);
      });
      it(`should create ${questionsArray.length} instance_questions`, async () => {
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
          question.id = locals.instance_questions[i].id;
          assert.equal(locals.instance_questions[i].qid, question.qid);
        });
      });
    });

    describe('GET to assessment_instance URL', function () {
      it('should load successfully', function (callback) {
        request(locals.assessmentInstanceUrl, function (error, response, body) {
          if (error) {
            return callback(error);
          }
          if (response.statusCode !== 200) {
            return callback(new Error('bad status: ' + response.statusCode));
          }
          res = response;
          page = body;
          callback(null);
        });
      });
      it('should parse', function () {
        locals.$ = cheerio.load(page);
      });
      questionsArray.forEach(function (question) {
        it(`should link to ${question.qid} question`, function () {
          const urlTail = '/pl/course_instance/1/instance_question/' + question.id + '/';
          question.url = locals.siteUrl + urlTail;
          elemList = locals.$(`td a[href="${urlTail}"]`);
          assert.lengthOf(elemList, 1);
        });
      });
    });
  };

  startAssessment();

  describe('assessment_instance: set attach files page URL', function () {
    it('should succeed', function () {
      locals.attachFilesUrl = locals.assessmentInstanceUrl;
    });
  });

  describe('assessment_instance: attach text file', function () {
    const textFile = true;
    helperAttachFiles.attachFile(locals, textFile);
    helperAttachFiles.downloadAttachedFile(locals);
  });

  describe('assessment_instance: delete attached text file', function () {
    helperAttachFiles.deleteAttachedFile(locals);
    helperAttachFiles.checkNoAttachedFiles(locals);
  });

  describe('assessment_instance: attach uploaded file', function () {
    const textFile = false;
    helperAttachFiles.attachFile(locals, textFile);
    helperAttachFiles.downloadAttachedFile(locals);
  });

  describe('assessment_instance: delete attached uploaded file', function () {
    helperAttachFiles.deleteAttachedFile(locals);
    helperAttachFiles.checkNoAttachedFiles(locals);
  });

  describe('instance_question: attach files setup', function () {
    describe('setting up the question data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.question = questions.addVectors;
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    describe('set attach files page URL', function () {
      it('should succeed', function () {
        locals.attachFilesUrl = locals.questionBaseUrl + '/' + locals.question.id;
      });
    });
  });

  describe('instance_question: attach text file', function () {
    const textFile = true;
    helperAttachFiles.attachFile(locals, textFile);
    helperAttachFiles.downloadAttachedFile(locals);
  });

  describe('instance_question: delete attached text file', function () {
    helperAttachFiles.deleteAttachedFile(locals);
    helperAttachFiles.checkNoAttachedFiles(locals);
  });

  describe('instance_question: attach text file using file storage', function () {
    it('should set storage type to FileSystem', () => {
      config.fileStoreStorageTypeDefault = 'FileSystem';
    });
    const textFile = true;
    helperAttachFiles.attachFile(locals, textFile);
    helperAttachFiles.downloadAttachedFile(locals);
  });

  describe('instance_question: get file storage attached file while using S3 as default', function () {
    it('should set storage type to S3', () => {
      config.fileStoreStorageTypeDefault = 'S3';
    });
    helperAttachFiles.downloadAttachedFile(locals);
  });

  describe('instance_question: delete attached text file using file storage', function () {
    helperAttachFiles.deleteAttachedFile(locals);
    helperAttachFiles.checkNoAttachedFiles(locals);
  });

  describe('instance_question: attach uploaded file', function () {
    const textFile = false;
    helperAttachFiles.attachFile(locals, textFile);
    helperAttachFiles.downloadAttachedFile(locals);
  });

  describe('instance_question: delete attached uploaded file', function () {
    helperAttachFiles.deleteAttachedFile(locals);
    helperAttachFiles.checkNoAttachedFiles(locals);
  });

  describe('instance_question: attach uploaded file using file storage', function () {
    it('should set storage type to FileSystem', () => {
      config.fileStoreStorageTypeDefault = 'FileSystem';
    });
    const textFile = false;
    helperAttachFiles.attachFile(locals, textFile);
    helperAttachFiles.downloadAttachedFile(locals);
  });

  describe('instance_question: get file storage uploaded file while using S3 as default', function () {
    it('should set storage type to S3', () => {
      config.fileStoreStorageTypeDefault = 'S3';
    });
    helperAttachFiles.downloadAttachedFile(locals);
  });

  describe('instance_question: delete attached uploaded file', function () {
    helperAttachFiles.deleteAttachedFile(locals);
    helperAttachFiles.checkNoAttachedFiles(locals);
  });

  describe('submit correct answer to question addVectors', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = questions.addVectors;
        locals.expectedResult = {
          submission_score: 1,
          submission_correct: true,
          instance_question_points: 2,
          instance_question_score_perc: (2 / 11) * 100,
          instance_question_auto_points: 2,
          instance_question_manual_points: 0,
          assessment_instance_points: 2,
          assessment_instance_score_perc: (2 / assessmentMaxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (variant) {
          return {
            wx: variant.true_answer.wx,
            wy: variant.true_answer.wy,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('submit correct answer to question fossilFuelsRadio', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = questions.fossilFuelsRadio;
        locals.expectedResult = {
          submission_score: 1,
          submission_correct: true,
          instance_question_points: 3,
          instance_question_score_perc: (3 / 14) * 100,
          instance_question_auto_points: 3,
          instance_question_manual_points: 0,
          assessment_instance_points: 5,
          assessment_instance_score_perc: (5 / assessmentMaxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (variant) {
          return {
            key: variant.true_answer.key,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('submit incorrect answer to question addVectors', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = questions.addVectors;
        locals.expectedResult = {
          submission_score: 0,
          submission_correct: false,
          instance_question_points: 2,
          instance_question_score_perc: (2 / 11) * 100,
          instance_question_auto_points: 2,
          instance_question_manual_points: 0,
          assessment_instance_points: 5,
          assessment_instance_score_perc: (5 / assessmentMaxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (_variant) {
          return {
            wx: 400,
            wy: -700,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('submit correct answer to question addVectors', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = questions.addVectors;
        locals.expectedResult = {
          submission_score: 1,
          submission_correct: true,
          instance_question_points: 4,
          instance_question_score_perc: (4 / 11) * 100,
          instance_question_auto_points: 4,
          instance_question_manual_points: 0,
          assessment_instance_points: 7,
          assessment_instance_score_perc: (7 / assessmentMaxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (variant) {
          return {
            wx: variant.true_answer.wx,
            wy: variant.true_answer.wy,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('save incorrect answer to question addVectors', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'save';
        locals.question = questions.addVectors;
        locals.expectedResult = {
          submission_score: null,
          submission_correct: null,
          instance_question_points: 4,
          instance_question_score_perc: (4 / 11) * 100,
          instance_question_auto_points: 4,
          instance_question_manual_points: 0,
          assessment_instance_points: 7,
          assessment_instance_score_perc: (7 / assessmentMaxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (_variant) {
          return {
            wx: -600,
            wy: 700,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('submit correct answer to question addVectors', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = questions.addVectors;
        locals.expectedResult = {
          submission_score: 1,
          submission_correct: true,
          instance_question_points: 8,
          instance_question_score_perc: (8 / 11) * 100,
          instance_question_auto_points: 8,
          instance_question_manual_points: 0,
          assessment_instance_points: 11,
          assessment_instance_score_perc: (11 / assessmentMaxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (variant) {
          return {
            wx: variant.true_answer.wx,
            wy: variant.true_answer.wy,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('submit correct answer to question addVectors', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = questions.addVectors;
        locals.expectedResult = {
          submission_score: 1,
          submission_correct: true,
          instance_question_points: 11,
          instance_question_score_perc: (11 / 11) * 100,
          instance_question_auto_points: 11,
          instance_question_manual_points: 0,
          assessment_instance_points: 14,
          assessment_instance_score_perc: (14 / assessmentMaxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (variant) {
          return {
            wx: variant.true_answer.wx,
            wy: variant.true_answer.wy,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('submit correct answer to question addVectors', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = questions.addVectors;
        locals.expectedResult = {
          submission_score: 1,
          submission_correct: true,
          instance_question_points: 11,
          instance_question_score_perc: (11 / 11) * 100,
          instance_question_auto_points: 11,
          instance_question_manual_points: 0,
          assessment_instance_points: 14,
          assessment_instance_score_perc: (14 / assessmentMaxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (variant) {
          return {
            wx: variant.true_answer.wx,
            wy: variant.true_answer.wy,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('load question addNumbers page and save data for later submission', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = questions.addNumbers;
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    describe('save data for later submission', function () {
      it('should succeed', function () {
        locals.savedVariant = _.clone(locals.variant);
        locals.questionSavedCsrfToken = locals.__csrf_token;
      });
    });
  });

  describe('submit incorrect answer to question addNumbers', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = questions.addNumbers;
        locals.expectedResult = {
          submission_score: 0,
          submission_correct: false,
          instance_question_points: 0,
          instance_question_score_perc: (0 / 5) * 100,
          instance_question_auto_points: 0,
          instance_question_manual_points: 0,
          assessment_instance_points: 14,
          assessment_instance_score_perc: (14 / assessmentMaxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (variant) {
          return {
            c: variant.true_answer.c + 3,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('submit correct answer to saved question addNumbers page', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = questions.addNumbers;
        locals.getSubmittedAnswer = function (variant) {
          return {
            c: variant.true_answer.c,
          };
        };
      });
    });
    describe('restore saved data for submission', function () {
      it('should succeed', function () {
        locals.variant = _.clone(locals.savedVariant);
        locals.__csrf_token = locals.questionSavedCsrfToken;
      });
    });
    helperQuestion.postInstanceQuestionAndFail(locals);
  });

  describe('submit correct answer to question addNumbers', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = questions.addNumbers;
        locals.expectedResult = {
          submission_score: 1,
          submission_correct: true,
          instance_question_points: 1,
          instance_question_score_perc: (1 / 5) * 100,
          instance_question_auto_points: 1,
          instance_question_manual_points: 0,
          assessment_instance_points: 15,
          assessment_instance_score_perc: (15 / assessmentMaxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (variant) {
          return {
            c: variant.true_answer.c,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('submit invalid answer to question addNumbers', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = questions.addNumbers;
        locals.expectedResult = {
          submission_score: null,
          submission_correct: null,
          instance_question_points: 1,
          instance_question_score_perc: (1 / 5) * 100,
          instance_question_auto_points: 1,
          instance_question_manual_points: 0,
          assessment_instance_points: 15,
          assessment_instance_score_perc: (15 / assessmentMaxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (_variant) {
          return {
            c: '42c',
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
    describe('check the submission is not gradable', function () {
      it('should succeed', async () => {
        const result = await sqldb.queryOneRowAsync(sql.select_last_submission, []);
        const submission = result.rows[0];
        if (submission.gradable) throw new Error('submission.gradable is true');
      });
    });
    describe('the submission panel contents', function () {
      it('should contain "Invalid"', function () {
        elemList = locals.$('div.submission-body :contains("Invalid")');
        assert.isAtLeast(elemList.length, 1);
      });
    });
  });

  describe('submit correct answer to question addNumbers', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = questions.addNumbers;
        locals.expectedResult = {
          submission_score: 1,
          submission_correct: true,
          instance_question_points: 3,
          instance_question_score_perc: (3 / 5) * 100,
          instance_question_auto_points: 3,
          instance_question_manual_points: 0,
          assessment_instance_points: 17,
          assessment_instance_score_perc: (17 / assessmentMaxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (variant) {
          return {
            c: variant.true_answer.c,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('save incorrect answer to question addNumbers', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'save';
        locals.question = questions.addNumbers;
        locals.expectedResult = {
          submission_score: null,
          submission_correct: null,
          instance_question_points: 3,
          instance_question_score_perc: (3 / 5) * 100,
          instance_question_auto_points: 3,
          instance_question_manual_points: 0,
          assessment_instance_points: 17,
          assessment_instance_score_perc: (17 / assessmentMaxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (variant) {
          return {
            c: variant.true_answer.c + 2,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('submit correct answer to question fossilFuelsRadio', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = questions.fossilFuelsRadio;
        locals.expectedResult = {
          submission_score: 1,
          submission_correct: true,
          instance_question_points: 9,
          instance_question_score_perc: (9 / 14) * 100,
          instance_question_auto_points: 9,
          instance_question_manual_points: 0,
          assessment_instance_points: 23,
          assessment_instance_score_perc: (23 / assessmentMaxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (variant) {
          return {
            key: variant.true_answer.key,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('submit incorrect answer to question fossilFuelsRadio', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = questions.fossilFuelsRadio;
        locals.expectedResult = {
          submission_score: 0,
          submission_correct: false,
          instance_question_points: 9,
          instance_question_score_perc: (9 / 14) * 100,
          instance_question_auto_points: 9,
          instance_question_manual_points: 0,
          assessment_instance_points: 23,
          assessment_instance_score_perc: (23 / assessmentMaxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (variant) {
          return {
            key: variant.true_answer.key === 'a' ? 'b' : 'a',
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('submit correct answer to question fossilFuelsRadio', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = questions.fossilFuelsRadio;
        locals.expectedResult = {
          submission_score: 1,
          submission_correct: true,
          instance_question_points: 12,
          instance_question_score_perc: (12 / 14) * 100,
          instance_question_auto_points: 12,
          instance_question_manual_points: 0,
          assessment_instance_points: 26,
          assessment_instance_score_perc: (26 / assessmentMaxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (variant) {
          return {
            key: variant.true_answer.key,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('submit incorrect answer to question fossilFuelsRadio', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = questions.fossilFuelsRadio;
        locals.expectedResult = {
          submission_score: 0,
          submission_correct: false,
          instance_question_points: 12,
          instance_question_score_perc: (12 / 14) * 100,
          instance_question_auto_points: 12,
          instance_question_manual_points: 0,
          assessment_instance_points: 26,
          assessment_instance_score_perc: (26 / assessmentMaxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (variant) {
          return {
            key: variant.true_answer.key === 'a' ? 'b' : 'a',
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('submit incorrect answers to question partialCredit6_no_partial', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = questions.partialCredit6_no_partial;
        locals.expectedResult = {
          submission_score: 0,
          submission_correct: false,
          instance_question_points: 0,
          instance_question_score_perc: (0 / 8) * 100,
          instance_question_auto_points: 0,
          instance_question_manual_points: 0,
          assessment_instance_points: 26,
          assessment_instance_score_perc: (26 / assessmentMaxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (_variant) {
          return {
            s1: 45,
            s2: 80,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('submit first partially correct answers to question partialCredit6_no_partial', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = questions.partialCredit6_no_partial;
        locals.expectedResult = {
          submission_score: 0,
          submission_correct: false,
          instance_question_points: 0,
          instance_question_score_perc: (0 / 8) * 100,
          instance_question_auto_points: 0,
          instance_question_manual_points: 0,
          assessment_instance_points: 26,
          assessment_instance_score_perc: (26 / assessmentMaxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (_variant) {
          return {
            s1: 100,
            s2: 90,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('submit second partially correct answers to question partialCredit6_no_partial', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = questions.partialCredit6_no_partial;
        locals.expectedResult = {
          submission_score: 0,
          submission_correct: false,
          instance_question_points: 0,
          instance_question_score_perc: (0 / 8) * 100,
          instance_question_auto_points: 0,
          instance_question_manual_points: 0,
          assessment_instance_points: 26,
          assessment_instance_score_perc: (26 / assessmentMaxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (_variant) {
          return {
            s1: 37,
            s2: 100,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('submit correct answers to question partialCredit6_no_partial', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = questions.partialCredit6_no_partial;
        locals.expectedResult = {
          submission_score: 1,
          submission_correct: true,
          instance_question_points: 3,
          instance_question_score_perc: (3 / 8) * 100,
          instance_question_auto_points: 3,
          instance_question_manual_points: 0,
          assessment_instance_points: 29,
          assessment_instance_score_perc: (29 / assessmentMaxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (_variant) {
          return {
            s1: 100,
            s2: 100,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('test downloading files', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.question = questions.downloadFile;
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    describe('downloading course text file', function () {
      it('should contain a link to clientFilesCourse/data.txt', function () {
        elemList = locals.$('a[href*="clientFilesCourse"]');
        assert.lengthOf(elemList, 1);
      });
      it('should download something with the link to clientFilesCourse/data.txt', function (callback) {
        const fileUrl = locals.siteUrl + elemList[0].attribs.href;
        request(fileUrl, function (error, response, body) {
          if (error) {
            return callback(error);
          }
          if (response.statusCode !== 200) {
            return callback(new Error('bad status: ' + response.statusCode));
          }
          page = body;
          callback(null);
        });
      });
      it('should have downloaded a file with the contents of clientFilesCourse/data.txt', function () {
        assert.equal(page, 'This data is specific to the course.');
      });
    });
    describe('downloading question text files', function () {
      it('should contain a force-download link to clientFilesQuestion/data.txt', function () {
        elemList = locals.$('a[href*="clientFilesQuestion"][download]');
        assert.lengthOf(elemList, 1);
      });
      it('should download something with the force-download link to clientFilesQuestion/data.txt', function (callback) {
        const fileUrl = locals.siteUrl + elemList[0].attribs.href;
        request(fileUrl, function (error, response, body) {
          if (error) {
            return callback(error);
          }
          if (response.statusCode !== 200) {
            return callback(new Error('bad status: ' + response.statusCode));
          }
          page = body;
          callback(null);
        });
      });
      it('should have downloaded a file with the contents of clientFilesQuestion/data.txt', function () {
        assert.equal(page, 'This data is specific to the question.');
      });
      it('should contain a new tab link to clientFilesQuestion/data.txt', function () {
        elemList = locals.$('a[href*="clientFilesQuestion"][target="_blank"]:not([download])');
        assert.lengthOf(elemList, 1);
      });
      it('should download something with the new tab link to clientFilesQuestion/data.txt', function (callback) {
        const fileUrl = locals.siteUrl + elemList[0].attribs.href;
        request(fileUrl, function (error, response, body) {
          if (error) {
            return callback(error);
          }
          if (response.statusCode !== 200) {
            return callback(new Error('bad status: ' + response.statusCode));
          }
          page = body;
          callback(null);
        });
      });
      it('should have downloaded a file with the contents of clientFilesQuestion/data.txt', function () {
        assert.equal(page, 'This data is specific to the question.');
      });
    });
    describe('downloading dynamic text file', function () {
      it('should contain a link to generatedFilesQuestion/data.txt', function () {
        elemList = locals.$('a[href*="generatedFilesQuestion"][href$="data.txt"]');
        assert.lengthOf(elemList, 1);
      });
      it('should download something with the link to generatedFilesQuestion/data.txt', function (callback) {
        const fileUrl = locals.siteUrl + elemList[0].attribs.href;
        request(fileUrl, function (error, response, body) {
          if (error) {
            return callback(error);
          }
          if (response.statusCode !== 200) {
            return callback(new Error('bad status: ' + response.statusCode));
          }
          page = body;
          callback(null);
        });
      });
      it('should have downloaded a file with the contents of generatedFilesQuestion/data.txt', function () {
        assert.equal(page, 'This data is generated by code.');
      });
    });
    describe('downloading dynamic image file', function () {
      it('should contain a link to generatedFilesQuestion/figure.png', function () {
        elemList = locals.$('a[href*="generatedFilesQuestion"][href$="figure.png"]');
        assert.lengthOf(elemList, 1);
      });
      it('should download something with the link to generatedFilesQuestion/figure.png', function (callback) {
        const fileUrl = locals.siteUrl + elemList[0].attribs.href;
        request({ url: fileUrl, encoding: null }, function (error, response, body) {
          if (error) {
            return callback(error);
          }
          if (response.statusCode !== 200) {
            return callback(new Error('bad status: ' + response.statusCode));
          }
          page = body;
          callback(null);
        });
      });
      it('should have downloaded a file with the contents of generatedFilesQuestion/figure.png', function () {
        // assert.equal(page,'This data is generated by code.')
        assert.equal(page.slice(0, 8).toString('hex'), '89504e470d0a1a0a');
      });
    });
  });

  describe('regrading', function () {
    describe('change max_points', function () {
      it('should succeed', async () => {
        await sqldb.queryAsync(sql.update_max_points, []);
      });
    });
    helperQuestion.regradeAssessment(locals);
    describe('check the regrading succeeded', function () {
      describe('setting up the expected question addNumbers results', function () {
        it('should succeed', function () {
          locals.question = questions.addNumbers;
          locals.expectedResult = {
            submission_score: null,
            submission_correct: null,
            instance_question_points: 3,
            instance_question_score_perc: (3 / 5) * 100,
            instance_question_auto_points: 3,
            instance_question_manual_points: 0,
          };
        });
      });
      helperQuestion.checkQuestionScore(locals);
      describe('setting up the expected question addVectors results', function () {
        it('should succeed', function () {
          locals.question = questions.addVectors;
          locals.expectedResult = {
            submission_score: 1,
            submission_correct: true,
            instance_question_points: 11,
            instance_question_score_perc: (11 / 11) * 100,
            instance_question_auto_points: 11,
            instance_question_manual_points: 0,
          };
        });
      });
      helperQuestion.checkQuestionScore(locals);
      describe('setting up the expected question fossilFuelsRadio results', function () {
        it('should succeed', function () {
          locals.question = questions.fossilFuelsRadio;
          locals.expectedResult = {
            submission_score: 0,
            submission_correct: false,
            instance_question_points: 12,
            instance_question_score_perc: (12 / 14) * 100,
            instance_question_auto_points: 12,
            instance_question_manual_points: 0,
          };
        });
      });
      helperQuestion.checkQuestionScore(locals);
      describe('setting up the expected assessment results', function () {
        it('should succeed', function () {
          locals.expectedResult = {
            assessment_instance_points: 13,
            assessment_instance_score_perc: (13 / 13) * 100,
          };
        });
      });
      helperQuestion.checkAssessmentScore(locals);
    });
  });

  describe('student gradebook page', function () {
    it('should load successfully', function (callback) {
      const gradebookUrl = locals.courseInstanceBaseUrl + '/gradebook';
      request(gradebookUrl, function (error, response, body) {
        if (error) {
          return callback(error);
        }
        if (response.statusCode !== 200) {
          return callback(new Error('bad status: ' + response.statusCode));
        }
        res = response;
        page = body;
        callback(null);
      });
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should contain HW1', function () {
      elemList = locals.$('td:contains("Homework for automatic test suite")');
      assert.lengthOf(elemList, 1);
    });
  });

  partialCreditTests.forEach(function (partialCreditTest, iPartialCreditTest) {
    describe(`partial credit test #${iPartialCreditTest + 1}`, function () {
      describe('server', function () {
        it('should shut down', async function () {
          // pass "this" explicitly to enable this.timeout() calls
          await helperServer.after.call(this);
        });
        it('should start up', async function () {
          // pass "this" explicitly to enable this.timeout() calls
          await helperServer.before().call(this);
        });
      });

      startAssessment();

      partialCreditTest.forEach(function (questionTest, iQuestionTest) {
        describe(`${questionTest.action} answer number #${iQuestionTest + 1} for question ${
          questionTest.qid
        } with score ${questionTest.score}`, function () {
          describe('setting up the submission data', function () {
            it('should succeed', function () {
              if (questionTest.action === 'check-closed') {
                locals.shouldHaveButtons = [];
              } else {
                locals.shouldHaveButtons = ['grade', 'save'];
              }
              locals.postAction = questionTest.action;
              locals.question = questions[questionTest.qid];
              locals.question.points += questionTest.sub_points;
              locals.totalPoints += questionTest.sub_points;
              const submission_score =
                questionTest.submission_score == null
                  ? questionTest.score
                  : questionTest.submission_score;
              locals.expectedResult = {
                submission_score: questionTest.action === 'save' ? null : submission_score / 100,
                submission_correct:
                  questionTest.action === 'save' ? null : submission_score === 100,
                instance_question_points: locals.question.points,
                instance_question_score_perc:
                  (locals.question.points / locals.question.maxPoints) * 100,
                instance_question_auto_points: locals.question.points,
                instance_question_manual_points: 0,
                assessment_instance_points: locals.totalPoints,
                assessment_instance_score_perc: (locals.totalPoints / assessmentMaxPoints) * 100,
              };
              locals.getSubmittedAnswer = function (_variant) {
                return {
                  s: String(questionTest.score),
                };
              };
            });
          });
          if (questionTest.action === 'store') {
            helperQuestion.getInstanceQuestion(locals);
            describe('saving submission data', function () {
              it('should succeed', function () {
                locals.question.savedVariant = _.clone(locals.variant);
                locals.question.questionSavedCsrfToken = locals.__csrf_token;
              });
            });
          } else if (questionTest.action === 'save-stored-fail') {
            describe('restoring submission data', function () {
              it('should succeed', function () {
                locals.postAction = 'save';
                locals.variant = _.clone(locals.question.savedVariant);
                locals.__csrf_token = locals.question.questionSavedCsrfToken;
              });
            });
            helperQuestion.postInstanceQuestionAndFail(locals);
          } else if (questionTest.action === 'grade-stored-fail') {
            describe('restoring submission data', function () {
              it('should succeed', function () {
                locals.postAction = 'grade';
                locals.variant = _.clone(locals.question.savedVariant);
                locals.__csrf_token = locals.question.questionSavedCsrfToken;
              });
            });
            helperQuestion.postInstanceQuestionAndFail(locals);
          } else if (questionTest.action === 'check-closed') {
            helperQuestion.getInstanceQuestion(locals);
          } else if (questionTest.action === 'save' || questionTest.action === 'grade') {
            helperQuestion.getInstanceQuestion(locals);
            helperQuestion.postInstanceQuestion(locals);
            helperQuestion.checkQuestionScore(locals);
            helperQuestion.checkAssessmentScore(locals);
          } else {
            throw Error('unknown action: ' + questionTest.action);
          }
        });
      });
    });
  });
});
