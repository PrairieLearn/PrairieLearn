import * as _ from 'lodash';
import * as util from 'util';
import { assert } from 'chai';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import FormData = require('form-data');
import { setTimeout as sleep } from 'timers/promises';

import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(__filename);

export function waitForJobSequence(locals: {
  job_sequence_id?: string;
  job_sequence?: { status: 'Running' | 'Success' };
}) {
  describe('The job sequence', function () {
    it('should have an id', async function () {
      const result = await sqldb.queryOneRowAsync(sql.select_last_job_sequence, []);
      locals.job_sequence_id = result.rows[0].id;
    });
    it('should be successful', async function () {
      do {
        await sleep(10);
        const result = await sqldb.queryOneRowAsync(sql.select_job_sequence, {
          job_sequence_id: locals.job_sequence_id,
        });
        locals.job_sequence = result.rows[0];
        assert(locals.job_sequence);
      } while (locals.job_sequence.status === 'Running');
    });
    it('should be successful', async () => {
      assert(locals.job_sequence);
      if (locals.job_sequence.status !== 'Success') {
        console.log(locals.job_sequence);
        const params = { job_sequence_id: locals.job_sequence_id };
        const result = await sqldb.queryAsync(sql.select_jobs, params);
        console.log(result.rows);
      }
      assert.equal(locals.job_sequence.status, 'Success');
    });
  });
}

export function getInstanceQuestion(locals: {
  questionBaseUrl: string;
  questionPreviewTabUrl?: string;
  question?: { id: string; type: 'Calculation' | 'Freeform' };
  shouldHaveButtons?: ('save' | 'grade' | 'newVariant' | 'tryAgain')[];
  isStudentPage: boolean;

  questionData?: { variant: { id: string } };
  variant_id?: string;
  $?: cheerio.CheerioAPI;
  variant?: { id: string; instance_question_id: string; question_id: string; broken: false };
  __csrf_token?: string;
}) {
  describe('GET to instance_question URL', function () {
    it('should load successfully', async function () {
      assert(locals.question);
      const questionUrl =
        locals.questionBaseUrl + '/' + locals.question.id + (locals.questionPreviewTabUrl || '');
      const response = await fetch(questionUrl);
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should contain parsable question data if Calculation', function () {
      if (locals.question?.type !== 'Calculation') return;
      assert(locals.$);
      const elemList = locals.$('.question-data');
      assert.lengthOf(elemList, 1);
      assert(elemList.text());
      locals.questionData = JSON.parse(
        decodeURIComponent(Buffer.from(elemList.text(), 'base64').toString()),
      );
    });
    it('should have a variant_id in the questionData if Calculation', function () {
      if (locals.question?.type !== 'Calculation') return;
      assert.nestedProperty(locals.questionData, 'variant.id');
      locals.variant_id = locals.questionData?.variant.id;
    });
    it('should have a variant_id input if Freeform with grade or save buttons', function () {
      if (locals.question?.type !== 'Freeform') return;
      if (
        !locals.shouldHaveButtons?.includes('grade') &&
        !locals.shouldHaveButtons?.includes('save')
      ) {
        return;
      }
      assert(locals.$);
      const elemList = locals.$('.question-form input[name="__variant_id"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.variant_id = elemList[0].attribs.value;
    });
    it('should have the variant in the DB if has grade or save button', async function () {
      if (
        !locals.shouldHaveButtons?.includes('grade') &&
        !locals.shouldHaveButtons?.includes('save')
      ) {
        return;
      }
      const result = await sqldb.queryOneRowAsync(sql.select_variant, {
        variant_id: locals.variant_id,
      });
      locals.variant = result.rows[0];
    });
    it('should have the correct variant.instance_question.id if has grade or save button and is student page', function () {
      if (!locals.isStudentPage) return;
      if (
        !locals.shouldHaveButtons?.includes('grade') &&
        !locals.shouldHaveButtons?.includes('save')
      ) {
        return;
      }
      assert.equal(locals.variant?.instance_question_id, locals.question?.id);
    });
    it('should have the correct variant.question.id if has grade or save button and is instructor page', function () {
      if (locals.isStudentPage) return;
      if (
        !locals.shouldHaveButtons?.includes('grade') &&
        !locals.shouldHaveButtons?.includes('save')
      ) {
        return;
      }
      assert.equal(locals.variant?.question_id, locals.question?.id);
    });

    it('should not be a broken variant if Freeform with grade or save button', function () {
      if (locals.question?.type !== 'Freeform') return;
      if (
        !locals.shouldHaveButtons?.includes('grade') &&
        !locals.shouldHaveButtons?.includes('save')
      ) {
        return;
      }
      assert.equal(locals.variant?.broken, false);
    });

    it('should have a CSRF token if has grade or save button', function () {
      if (
        !locals.shouldHaveButtons?.includes('grade') &&
        !locals.shouldHaveButtons?.includes('save')
      ) {
        return;
      }
      assert(locals.$);
      const elemList = locals.$('.question-form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('should have or not have grade button', function () {
      assert(locals.$);
      const elemList =
        locals.question?.type === 'Freeform'
          ? locals.$('button[name="__action"][value="grade"]')
          : locals.$('button.question-grade');
      if (locals.shouldHaveButtons?.includes('grade')) {
        assert.lengthOf(elemList, 1);
      } else {
        assert.lengthOf(elemList, 0);
      }
    });
    it('should have or not have save button', function () {
      assert(locals.$);
      const elemList =
        locals.question?.type === 'Freeform'
          ? locals.$('button[name="__action"][value="save"]')
          : locals.$('button.question-save');
      if (locals.shouldHaveButtons?.includes('save')) {
        assert.lengthOf(elemList, 1);
      } else {
        assert.lengthOf(elemList, 0);
      }
    });
    it('should have or not have newVariant button', function () {
      assert(locals.$);
      const elemList = locals.$('a:contains(New variant)');
      if (locals.shouldHaveButtons?.includes('newVariant')) {
        assert.lengthOf(elemList, 1);
      } else {
        assert.lengthOf(elemList, 0);
      }
    });
    it('should have or not have tryAgain button', function () {
      assert(locals.$);
      const elemList = locals.$('a:contains(Try a new variant)');
      if (locals.shouldHaveButtons?.includes('tryAgain')) {
        assert.lengthOf(elemList, 1);
      } else {
        assert.lengthOf(elemList, 0);
      }
    });
  });
}

export function postInstanceQuestion(locals: {
  questionBaseUrl: string;
  questionPreviewTabUrl: string;
  getSubmittedAnswer: (variant: {
    id: string;
    true_answer: Record<string, any>;
  }) => Record<string, any>;
  variant: { id: string; true_answer: Record<string, any> };
  postAction: string;
  question: { id: string; type: 'Calculation' | 'Freeform' };
  __csrf_token: string;
  isStudentPage: boolean;
  assessment_instance_duration: number;
  preStartTime: number;
  postStartTime: number;

  submittedAnswer?: Record<string, any>;
  preEndTime?: number;
  postEndTime?: number;
  submission: { variant_id: string; broken: boolean };

  $?: cheerio.CheerioAPI;
}) {
  describe('POST to instance_question URL', function () {
    it('should generate the submittedAnswer', function () {
      locals.submittedAnswer = locals.getSubmittedAnswer(locals.variant);
    });
    it('should load successfully', async function () {
      let form;
      if (locals.question.type === 'Calculation') {
        form = {
          __action: locals.postAction,
          __csrf_token: locals.__csrf_token,
          postData: JSON.stringify({
            variant: locals.variant,
            submittedAnswer: locals.submittedAnswer,
          }),
        };
      } else if (locals.question.type === 'Freeform') {
        form = {
          __action: locals.postAction,
          __csrf_token: locals.__csrf_token,
          __variant_id: locals.variant.id,
        };
        _.assign(form, locals.submittedAnswer);
      } else {
        assert.fail('bad question.type:' + locals.question.type);
      }
      const questionUrl =
        locals.questionBaseUrl + '/' + locals.question.id + (locals.questionPreviewTabUrl || '');
      locals.preEndTime = Date.now();
      const response = await fetch(questionUrl, {
        method: 'POST',
        body: new URLSearchParams(form),
      });
      locals.postEndTime = Date.now();
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should create a submission', async function () {
      const result = await sqldb.queryAsync(sql.select_last_submission, {
        variant_id: locals.variant.id,
      });
      assert.equal(result.rowCount, 1);
      locals.submission = result.rows[0];
    });
    it('should have the correct submission.variant_id', function () {
      assert.equal(locals.submission.variant_id, locals.variant.id);
    });
    it('should not be broken if Freeform', function () {
      if (locals.question.type === 'Freeform') {
        assert.equal(locals.submission.broken, false);
      }
    });
    it('should select the assessment_instance duration from the DB if student page', async function () {
      if (locals.isStudentPage) {
        const result = await sqldb.queryAsync(sql.select_assessment_instance_durations, []);
        assert.equal(result.rowCount, 1);
        locals.assessment_instance_duration = result.rows[0].duration;
      }
    });
    it('should have the correct assessment_instance duration if student page', function () {
      if (locals.isStudentPage) {
        assert(locals.preEndTime);
        assert(locals.postEndTime);
        const min_duration = (locals.preEndTime - locals.postStartTime) / 1000;
        const max_duration = (locals.postEndTime - locals.preStartTime) / 1000;
        assert.isAbove(locals.assessment_instance_duration, min_duration);
        assert.isBelow(locals.assessment_instance_duration, max_duration);
      }
    });
  });
}

export function postInstanceQuestionAndFail(locals: {
  getSubmittedAnswer: (variant: {
    id: string;
    true_answer: Record<string, any>;
  }) => Record<string, any>;
  variant: { id: string; true_answer: Record<string, any> };
  question: { id: string; type: 'Freeform' | 'Calculation' };
  postAction: string;
  __csrf_token: string;
  questionBaseUrl: string;
  questionPreviewTabUrl?: string;

  submittedAnswer?: Record<string, any>;
}) {
  describe('POST to instance_question URL', function () {
    it('should generate the submittedAnswer', function () {
      locals.submittedAnswer = locals.getSubmittedAnswer(locals.variant);
    });
    it('should error', async function () {
      let form;
      if (locals.question.type === 'Calculation') {
        form = {
          __action: locals.postAction,
          __csrf_token: locals.__csrf_token,
          postData: JSON.stringify({
            variant: locals.variant,
            submittedAnswer: locals.submittedAnswer,
          }),
        };
      } else if (locals.question.type === 'Freeform') {
        form = {
          __action: locals.postAction,
          __csrf_token: locals.__csrf_token,
          variant_id: locals.variant.id,
        };
        _.assign(form, locals.submittedAnswer);
      } else {
        assert.fail('bad question.type:' + locals.question.type);
      }
      const questionUrl =
        locals.questionBaseUrl + '/' + locals.question.id + (locals.questionPreviewTabUrl || '');
      const response = await fetch(questionUrl, {
        method: 'POST',
        body: new URLSearchParams(form),
      });
      assert.include([400, 500], response.status);
    });
  });
}

export function checkSubmissionScore(locals: {
  question: {
    id: string;
  };
  expectedResult: { submission_score: number; submission_correct: boolean };
  submission?: { score: number; correct: boolean };
}) {
  describe('check submission score', function () {
    it('should have the submission', async function () {
      const result = await sqldb.queryOneRowAsync(sql.select_last_submission_for_question, {
        question_id: locals.question.id,
      });
      locals.submission = result.rows[0];
    });
    it('should be graded with expected score', function () {
      assert.equal(locals.submission?.score, locals.expectedResult.submission_score);
    });
    it('should be graded with expected correctness', function () {
      assert.equal(locals.submission?.correct, locals.expectedResult.submission_correct);
    });
  });
}

export function checkQuestionScore(locals: {
  question: { id: string };
  expectedResult: {
    submission_score?: number;
    submission_correct?: boolean;
    instance_question_points: number;
    instance_question_score_perc: number;
    instance_question_auto_points?: number;
    instance_question_manual_points?: number;
  };

  submission?: { score: number; correct: boolean };
  instance_question?: {
    points: number;
    score_perc: number;
    auto_points: number;
    manual_points: number;
  };
}) {
  describe('check question score', function () {
    it('should have the submission', async function () {
      if (_.has(locals.expectedResult, 'submission_score')) {
        const result = await sqldb.queryOneRowAsync(
          sql.select_last_submission_for_instance_question,
          {
            instance_question_id: locals.question.id,
          },
        );
        locals.submission = result.rows[0];
      }
    });
    it('should be graded with expected score', function () {
      if (_.has(locals.expectedResult, 'submission_score')) {
        assert.equal(locals.submission?.score, locals.expectedResult.submission_score);
      }
    });
    it('should be graded with expected correctness', function () {
      if (_.has(locals.expectedResult, 'submission_correct')) {
        assert.equal(locals.submission?.correct, locals.expectedResult.submission_correct);
      }
    });

    it('should still have the instance_question', async function () {
      const result = await sqldb.queryOneRowAsync(sql.select_instance_question, {
        instance_question_id: locals.question.id,
      });
      locals.instance_question = result.rows[0];
    });
    it('should have the correct instance_question points', function () {
      assert(locals.instance_question);
      assert.approximately(
        locals.instance_question?.points,
        locals.expectedResult.instance_question_points,
        1e-6,
      );
    });
    it('should have the correct instance_question score_perc', function () {
      assert(locals.instance_question);
      assert.approximately(
        locals.instance_question?.score_perc,
        locals.expectedResult.instance_question_score_perc,
        1e-6,
      );
    });
    it('should have the correct instance_question auto_points', function () {
      if (typeof locals.expectedResult.instance_question_auto_points !== 'undefined') {
        assert(locals.instance_question);
        assert.approximately(
          locals.instance_question?.auto_points,
          locals.expectedResult.instance_question_auto_points,
          1e-6,
        );
      }
    });
    it('should have the correct instance_question manual_points', function () {
      if (typeof locals.expectedResult.instance_question_manual_points !== 'undefined') {
        assert(locals.instance_question);
        assert.approximately(
          locals.instance_question?.manual_points,
          locals.expectedResult.instance_question_manual_points,
          1e-6,
        );
      }
    });
  });
}

export function checkAssessmentScore(locals: {
  assessment_instance: { id: string; points: number; score_perc: number };
  expectedResult: { assessment_instance_points: number; assessment_instance_score_perc: number };
}) {
  describe('check assessment score', function () {
    it('should still have the assessment_instance', async function () {
      const result = await sqldb.queryOneRowAsync(sql.select_assessment_instance, {
        assessment_instance_id: locals.assessment_instance.id,
      });
      locals.assessment_instance = result.rows[0];
    });
    it('should have the correct assessment_instance points', function () {
      assert.approximately(
        locals.assessment_instance.points,
        locals.expectedResult.assessment_instance_points,
        1e-6,
      );
    });
    it('should have the correct assessment_instance score_perc', function () {
      assert.approximately(
        locals.assessment_instance.score_perc,
        locals.expectedResult.assessment_instance_score_perc,
        1e-6,
      );
    });
  });
}

export function checkQuestionFeedback(locals: {
  assessment_instance: { id: string };
  expectedFeedback: { qid: string; submission_id?: string; feedback: Record<string, any> };

  question_feedback?: { feedback: Record<string, any> };
}) {
  describe('check question feedback', function () {
    it('should still have question feedback', async function () {
      const result = await sqldb.queryOneRowAsync(sql.select_question_feedback, {
        assessment_instance_id: locals.assessment_instance.id,
        qid: locals.expectedFeedback.qid,
        submission_id: locals.expectedFeedback.submission_id || null,
      });
      locals.question_feedback = result.rows[0];
    });
    it('should have the correct feedback', function () {
      for (const p in locals.expectedFeedback.feedback) {
        assert.deepEqual(
          locals.question_feedback?.feedback[p],
          locals.expectedFeedback.feedback[p],
        );
      }
    });
  });
}

export function regradeAssessment(locals: {
  courseInstanceBaseUrl: string;
  assessment_id: string;
  __csrf_token: string;
  instructorAssessmentRegradingUrl?: string;
  $?: cheerio.CheerioAPI;
  job_sequence_id?: string;
  job_sequence?: { status: 'Running' | 'Success' };
}) {
  describe('GET to instructorAssessmentRegrading URL', async function () {
    it('should succeed', async function () {
      locals.instructorAssessmentRegradingUrl =
        locals.courseInstanceBaseUrl +
        '/instructor/assessment/' +
        locals.assessment_id +
        '/regrading';
      const response = await fetch(locals.instructorAssessmentRegradingUrl);
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      assert(locals.$);
      const elemList = locals.$('form[name="regrade-all-form"] input[name="__csrf_token"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
  });
  describe('POST to instructorAssessmentRegrading URL for regrading', function () {
    it('should succeed', async function () {
      assert(locals.instructorAssessmentRegradingUrl);
      const response = await fetch(locals.instructorAssessmentRegradingUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'regrade_all',
          __csrf_token: locals.__csrf_token,
        }),
      });
      assert.equal(response.status, 200);
    });
  });
  waitForJobSequence(locals);
}

export function uploadInstanceQuestionScores(locals: {
  courseInstanceBaseUrl: string;
  assessment_id: string;
  csvData: string | Uint8Array;
  instructorAssessmentUploadsUrl?: string;
  __csrf_token?: string;
  $?: cheerio.CheerioAPI;
  job_sequence_id?: string;
  job_sequence?: { status: 'Running' | 'Success' };
}) {
  describe('GET to instructorAssessmentUploads URL', function () {
    it('should succeed', async function () {
      locals.instructorAssessmentUploadsUrl =
        locals.courseInstanceBaseUrl +
        '/instructor/assessment/' +
        locals.assessment_id +
        '/uploads';
      const response = await fetch(locals.instructorAssessmentUploadsUrl);
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      assert(locals.$);
      const elemList = locals.$(
        'form[name="upload-instance-question-scores-form"] input[name="__csrf_token"]',
      );
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
  });
  describe('POST to instructorAssessmentUploads URL for upload', function () {
    it('should succeed', async function () {
      const formData = new FormData();
      formData.append('__action', 'upload_instance_question_scores');
      formData.append('__csrf_token', locals.__csrf_token);
      formData.append('file', Buffer.from(locals.csvData), {
        filename: 'data.csv',
        contentType: 'text/csv',
      });
      assert(locals.instructorAssessmentUploadsUrl);
      const response = await fetch(locals.instructorAssessmentUploadsUrl, {
        method: 'POST',
        body: formData,
      });
      assert.equal(response.status, 200);
    });
  });
  waitForJobSequence(locals);
}

export function uploadAssessmentInstanceScores(locals: {
  courseInstanceBaseUrl: string;
  assessment_id: string;
  csvData: string | Uint8Array;
  instructorAssessmentUploadsUrl?: string;
  __csrf_token: string;
  $?: cheerio.CheerioAPI;
  job_sequence_id?: string;
  job_sequence?: { status: 'Running' | 'Success' };
}) {
  describe('GET to instructorAssessmentUploads URL', function () {
    it('should succeed', async function () {
      locals.instructorAssessmentUploadsUrl =
        locals.courseInstanceBaseUrl +
        '/instructor/assessment/' +
        locals.assessment_id +
        '/uploads';
      const response = await fetch(locals.instructorAssessmentUploadsUrl);
      assert.equal(response.status, 200);
      const page = await response.text();
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      assert(locals.$);
      const elemList = locals.$(
        'form[name="upload-assessment-instance-scores-form"] input[name="__csrf_token"]',
      );
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
  });
  describe('POST to instructorAssessmentUploads URL for upload', function () {
    it('should succeed', async function () {
      const formData = new FormData();
      formData.append('__action', 'upload_assessment_instance_scores');
      formData.append('__csrf_token', locals.__csrf_token);
      formData.append('file', Buffer.from(locals.csvData), {
        filename: 'data.csv',
        contentType: 'text/csv',
      });
      assert(locals.instructorAssessmentUploadsUrl);
      const response = await fetch(locals.instructorAssessmentUploadsUrl, {
        method: 'POST',
        body: formData,
      });
      assert.equal(response.status, 200);
    });
  });
  waitForJobSequence(locals);
}

export function autoTestQuestion(
  locals: {
    questionBaseUrl: string;
    isStudentPage: boolean;
    question?: { id: string; type: 'Freeform' | 'Calculation' };
    shouldHaveButtons?: ['grade', 'save', 'newVariant'];
    postAction?: string;
    $?: cheerio.CheerioAPI;
    __csrf_token?: string;
    job_sequence_id?: string;
    job_sequence?: { status: 'Running' | 'Success' };
  },
  qid: string,
) {
  describe('auto-testing question ' + qid, function () {
    describe('the setup', function () {
      it('should find the question in the database', async function () {
        const result = await sqldb.queryZeroOrOneRowAsync(sql.select_question_by_qid, { qid });
        assert.equal(result.rowCount, 1);
        locals.question = result.rows[0];
      });
      it('should be a Freeform question', function () {
        assert.equal(locals.question?.type, 'Freeform');
      });
      it('should have submission data', function () {
        locals.shouldHaveButtons = ['grade', 'save', 'newVariant'];
        locals.postAction = 'grade';
      });
    });
    getInstanceQuestion(locals);
    describe('the question variant', function () {
      it('should produce no issues', async function () {
        const result = await sqldb.queryAsync(sql.select_issues_for_last_variant, []);
        assert.equal(
          result.rowCount,
          0,
          `found ${result.rowCount} issues (expected zero issues):\n` +
            JSON.stringify(result.rows, null, '    '),
        );
      });
    });
    describe('GET to instructor question settings URL', function () {
      it('should load successfully', async function () {
        assert(locals.question);
        const questionUrl = locals.questionBaseUrl + '/' + locals.question.id + '/settings';
        const response = await fetch(questionUrl);
        assert.equal(response.status, 200);
        const page = await response.text();
        locals.$ = cheerio.load(page);
      });
      it('should have a CSRF token', function () {
        assert(locals.$);
        const elemList = locals.$('form[name="question-tests-form"] input[name="__csrf_token"]');
        assert.lengthOf(elemList, 1);
        assert.nestedProperty(elemList[0], 'attribs.value');
        locals.__csrf_token = elemList[0].attribs.value;
        assert.isString(locals.__csrf_token);
      });
    });
    describe('the test job sequence', function () {
      it('should start with POST to instructor question settings URL for test_once', async function () {
        assert(locals.question);
        assert(locals.__csrf_token);
        const questionUrl = locals.questionBaseUrl + '/' + locals.question.id + '/settings/test';
        const response = await fetch(questionUrl, {
          method: 'POST',
          body: new URLSearchParams({
            __action: 'test_once',
            __csrf_token: locals.__csrf_token,
          }),
        });
        assert.equal(response.status, 200);
      });
      it('should have an id', async function () {
        const result = await sqldb.queryOneRowAsync(sql.select_last_job_sequence, []);
        locals.job_sequence_id = result.rows[0].id;
      });
      it('should complete', async function () {
        do {
          await sleep(10);
          const result = await sqldb.queryOneRowAsync(sql.select_job_sequence, {
            job_sequence_id: locals.job_sequence_id,
          });
          locals.job_sequence = result.rows[0];
          assert(locals.job_sequence);
        } while (locals.job_sequence.status === 'Running');
      });
      it('should be successful and produce no issues', async function () {
        assert(locals.job_sequence);
        const issues = await sqldb.queryAsync(sql.select_issues_for_last_variant, []);

        // To aid in debugging, if the job failed, we'll fetch the logs from
        // all child jobs and print them out. We'll also log any issues. We
        // do this before making assertions to ensure that they're printed.
        if (locals.job_sequence.status !== 'Success') {
          console.log(locals.job_sequence);
          const params = { job_sequence_id: locals.job_sequence_id };
          const result = await sqldb.queryAsync(sql.select_jobs, params);
          console.log(result.rows);
        }
        if (issues.rows.length > 0) {
          console.log(issues.rows);
        }

        assert.equal(locals.job_sequence.status, 'Success');
        assert.lengthOf(issues.rows, 0);
      });
    });
  });
}

export async function checkNoIssuesForLastVariantAsync() {
  const result = await sqldb.queryAsync(sql.select_issues_for_last_variant, []);
  assert.equal(
    result.rowCount,
    0,
    `found ${result.rowCount} issues (expected zero issues):\n` +
      JSON.stringify(result.rows, null, '    '),
  );
}

export const checkNoIssuesForLastVariant = util.callbackify(checkNoIssuesForLastVariantAsync);
