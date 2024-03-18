import * as util from 'util';
import { assert } from 'chai';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { setTimeout as sleep } from 'timers/promises';
import * as _ from 'lodash';
import FormData = require('form-data');

import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(__filename);

export function waitForJobSequence(locals: Record<string, any>) {
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

export function getInstanceQuestion(locals: Record<string, any>) {
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
      assert.isNull(locals.variant?.broken_at);
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

export function postInstanceQuestion(locals: Record<string, any>) {
  describe('POST to instance_question URL', function () {
    it('should generate the submittedAnswer', function () {
      assert(locals.getSubmittedAnswer);
      locals.submittedAnswer = locals.getSubmittedAnswer(locals.variant);
    });
    it('should load successfully', async function () {
      let form;
      if (locals.question?.type === 'Calculation') {
        form = {
          __action: locals.postAction,
          __csrf_token: locals.__csrf_token,
          postData: JSON.stringify({
            variant: locals.variant,
            submittedAnswer: locals.submittedAnswer,
          }),
        };
      } else if (locals.question?.type === 'Freeform') {
        form = {
          __action: locals.postAction,
          __csrf_token: locals.__csrf_token,
          __variant_id: locals.variant?.id,
        };
        _.assign(form, locals.submittedAnswer);
      } else {
        assert.fail('bad question.type:' + locals.question?.type);
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
        variant_id: locals.variant?.id,
      });
      assert.equal(result.rowCount, 1);
      locals.submission = result.rows[0];
    });
    it('should have the correct submission.variant_id', function () {
      assert.equal(locals.submission?.variant_id, locals.variant?.id);
    });
    it('should not be broken if Freeform', function () {
      if (locals.question?.type === 'Freeform') {
        assert.equal(locals.submission?.broken, false);
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
        assert(locals.preStartTime);
        assert(locals.postStartTime);
        assert(locals.assessment_instance_duration);
        const min_duration = (locals.preEndTime - locals.postStartTime) / 1000;
        const max_duration = (locals.postEndTime - locals.preStartTime) / 1000;
        assert.isAbove(locals.assessment_instance_duration, min_duration);
        assert.isBelow(locals.assessment_instance_duration, max_duration);
      }
    });
  });
}

export function postInstanceQuestionAndFail(locals: Record<string, any>) {
  describe('POST to instance_question URL', function () {
    it('should generate the submittedAnswer', function () {
      assert(locals.getSubmittedAnswer);
      locals.submittedAnswer = locals.getSubmittedAnswer(locals.variant);
    });
    it('should error', async function () {
      let form;
      if (locals.question?.type === 'Calculation') {
        form = {
          __action: locals.postAction,
          __csrf_token: locals.__csrf_token,
          postData: JSON.stringify({
            variant: locals.variant,
            submittedAnswer: locals.submittedAnswer,
          }),
        };
      } else if (locals.question?.type === 'Freeform') {
        form = {
          __action: locals.postAction,
          __csrf_token: locals.__csrf_token,
          variant_id: locals.variant?.id,
        };
        _.assign(form, locals.submittedAnswer);
      } else {
        assert.fail('bad question.type:' + locals.question?.type);
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

export function checkSubmissionScore(locals: Record<string, any>) {
  describe('check submission score', function () {
    it('should have the submission', async function () {
      const result = await sqldb.queryOneRowAsync(sql.select_last_submission_for_question, {
        question_id: locals.question?.id,
      });
      locals.submission = result.rows[0];
    });
    it('should be graded with expected score', function () {
      assert.equal(locals.submission?.score, locals.expectedResult?.submission_score);
    });
    it('should be graded with expected correctness', function () {
      assert.equal(locals.submission?.correct, locals.expectedResult?.submission_correct);
    });
  });
}

export function checkQuestionScore(locals: Record<string, any>) {
  describe('check question score', function () {
    it('should have the submission', async function () {
      if (_.has(locals.expectedResult, 'submission_score')) {
        const result = await sqldb.queryOneRowAsync(
          sql.select_last_submission_for_instance_question,
          {
            instance_question_id: locals.question?.id,
          },
        );
        locals.submission = result.rows[0];
      }
    });
    it('should be graded with expected score', function () {
      if (_.has(locals.expectedResult, 'submission_score')) {
        assert.equal(locals.submission?.score, locals.expectedResult?.submission_score);
      }
    });
    it('should be graded with expected correctness', function () {
      if (_.has(locals.expectedResult, 'submission_correct')) {
        assert.equal(locals.submission?.correct, locals.expectedResult?.submission_correct);
      }
    });

    it('should still have the instance_question', async function () {
      const result = await sqldb.queryOneRowAsync(sql.select_instance_question, {
        instance_question_id: locals.question?.id,
      });
      locals.instance_question = result.rows[0];
    });
    it('should have the correct instance_question points', function () {
      assert(locals.instance_question);
      assert(locals.expectedResult);
      assert.approximately(
        locals.instance_question?.points,
        locals.expectedResult.instance_question_points,
        1e-6,
      );
    });
    it('should have the correct instance_question score_perc', function () {
      assert(locals.instance_question);
      assert(locals.expectedResult);
      assert.approximately(
        locals.instance_question?.score_perc,
        locals.expectedResult.instance_question_score_perc,
        1e-6,
      );
    });
    it('should have the correct instance_question auto_points', function () {
      if (typeof locals.expectedResult?.instance_question_auto_points !== 'undefined') {
        assert(locals.instance_question);
        assert.approximately(
          locals.instance_question?.auto_points,
          locals.expectedResult.instance_question_auto_points,
          1e-6,
        );
      }
    });
    it('should have the correct instance_question manual_points', function () {
      if (typeof locals.expectedResult?.instance_question_manual_points !== 'undefined') {
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

export function checkQuestionStats(locals: Record<string, any>) {
  describe('check question stats', function () {
    it('should have the correct stats', function () {
      Object.keys(locals.expectedResult.instance_question_stats ?? []).forEach((key) => {
        const expected_value = locals.expectedResult.instance_question_stats[key];
        assert.isDefined(locals.instance_question?.[key]);
        if (expected_value === null) {
          assert.isNull(locals.instance_question?.[key]);
        } else if (typeof expected_value === 'number') {
          assert.approximately(locals.instance_question?.[key], expected_value, 1e-6);
        } else if (_.isArray(expected_value)) {
          assert.lengthOf(locals.instance_question?.[key], expected_value.length);
          expected_value.forEach((item, i) => {
            if (item == null) {
              assert.isNull(locals.instance_question?.[key][i]);
            } else {
              assert.approximately(item, locals.instance_question?.[key][i], 1e-6);
            }
          });
        }
      });
    });
  });
}

export function checkAssessmentScore(locals: Record<string, any>) {
  describe('check assessment score', function () {
    it('should still have the assessment_instance', async function () {
      const result = await sqldb.queryOneRowAsync(sql.select_assessment_instance, {
        assessment_instance_id: locals.assessment_instance?.id,
      });
      locals.assessment_instance = result.rows[0];
    });
    it('should have the correct assessment_instance points', function () {
      assert(locals.assessment_instance);
      assert(locals.expectedResult);
      assert.approximately(
        locals.assessment_instance.points,
        locals.expectedResult.assessment_instance_points,
        1e-6,
      );
    });
    it('should have the correct assessment_instance score_perc', function () {
      assert(locals.assessment_instance);
      assert(locals.expectedResult);
      assert.approximately(
        locals.assessment_instance.score_perc,
        locals.expectedResult.assessment_instance_score_perc,
        1e-6,
      );
    });
  });
}

export function checkQuestionFeedback(locals: Record<string, any>) {
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

export function regradeAssessment(locals: Record<string, any>) {
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

export function uploadInstanceQuestionScores(locals: Record<string, any>) {
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

export function uploadAssessmentInstanceScores(locals: Record<string, any>) {
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

export function autoTestQuestion(locals: Record<string, any>, qid: string) {
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
