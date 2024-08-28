import { assert } from 'chai';
import * as cheerio from 'cheerio';
import _ from 'lodash';

import * as helperExam from './helperExam.js';
import * as helperQuestion from './helperQuestion.js';
import * as helperServer from './helperServer.js';

const locals: Record<string, any> = {};

const assessmentSetScorePerc = 37;
const assessmentSetScorePerc2 = 83;

describe('Instructor assessment editing', function () {
  this.timeout(20000);

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  let page, elemList;

  helperExam.startExam(locals);

  describe('1. grade incorrect answer to question addNumbers', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = helperExam.questions.addNumbers;
        locals.expectedResult = {
          submission_score: 0,
          submission_correct: false,
          instance_question_points: 0,
          instance_question_score_perc: (0 / 5) * 100,
          instance_question_auto_points: 0,
          instance_question_manual_points: 0,
          assessment_instance_points: 0,
          assessment_instance_score_perc: (0 / helperExam.assessmentMaxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (variant) {
          return {
            c: variant.true_answer.c + 1,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('2. grade correct answer to question addNumbers', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = helperExam.questions.addNumbers;
        locals.expectedResult = {
          submission_score: 1,
          submission_correct: true,
          instance_question_points: 3,
          instance_question_score_perc: (3 / 5) * 100,
          instance_question_auto_points: 3,
          instance_question_manual_points: 0,
          assessment_instance_points: 3,
          assessment_instance_score_perc: (3 / helperExam.assessmentMaxPoints) * 100,
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

  describe('3. grade correct answer to question addVectors', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = helperExam.questions.addVectors;
        locals.expectedResult = {
          submission_score: 1,
          submission_correct: true,
          instance_question_points: 11,
          instance_question_score_perc: (11 / 21) * 100,
          instance_question_auto_points: 11,
          instance_question_manual_points: 0,
          assessment_instance_points: 14,
          assessment_instance_score_perc: (14 / helperExam.assessmentMaxPoints) * 100,
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

  describe('4. GET to instructor assessments URL', function () {
    it('should load successfully', async () => {
      const res = await fetch(locals.instructorAssessmentsUrl);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should contain E1', function () {
      elemList = locals.$('td a:contains("Exam for automatic test suite")');
      assert.lengthOf(elemList, 1);
    });
    it('should have the correct link for E1', function () {
      locals.instructorAssessmentUrl = locals.siteUrl + elemList[0].attribs.href;
      assert.equal(
        locals.instructorAssessmentUrl,
        locals.instructorBaseUrl + '/assessment/' + locals.assessment_id + '/',
      );
    });
  });

  describe('5. GET to instructor assessment instances URL', function () {
    it('should load successfully', async () => {
      locals.instructorAssessmentInstancesUrl = locals.instructorAssessmentUrl + 'instances';
      const res = await fetch(locals.instructorAssessmentInstancesUrl);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should load raw data file successfully', async () => {
      locals.instructorAssessmentInstancesUrl =
        locals.instructorAssessmentUrl + 'instances/raw_data.json';
      const res = await fetch(locals.instructorAssessmentInstancesUrl);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should parse as JSON array of objects', function () {
      locals.pageData = JSON.parse(page);
      assert.isArray(locals.pageData);
      locals.pageData.forEach((obj) => assert.isObject(obj));
    });
    it('should contain the assessment instance', function () {
      elemList = _.filter(locals.pageData, (row) => row.uid === 'dev@example.com');
      assert.lengthOf(elemList, 1);
      locals.instructorAssessmentInstanceUrl =
        locals.instructorBaseUrl + '/assessment_instance/' + elemList[0].assessment_instance_id;
    });
  });

  describe('6. GET to instructor assessment instance URL', function () {
    it('should load successfully', async () => {
      const res = await fetch(locals.instructorAssessmentInstanceUrl);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
  });

  describe('7. edit-question-points form', function () {
    it('should exist', function () {
      elemList = locals.$(
        '#instanceQuestionList td:contains("addNumbers") ~ td button[data-testid="edit-question-points-score-button-points"]',
      );
      assert.lengthOf(elemList, 1);
    });
    it('should have data-content', function () {
      assert.isString(elemList[0].attribs['data-content']);
    });
    it('data-content should parse', function () {
      locals.data$ = cheerio.load(elemList[0].attribs['data-content']);
    });
    it('data-content should have a CSRF token', function () {
      elemList = locals.data$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('data-content should have an __action', function () {
      elemList = locals.data$('form input[name="__action"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__action = elemList[0].attribs.value;
      assert.isString(locals.__action);
      assert.equal(locals.__action, 'edit_question_points');
    });
    it('data-content should have an instance_question_id', function () {
      elemList = locals.data$('form input[name="instance_question_id"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.instance_question_id = Number.parseInt(elemList[0].attribs.value);
    });
    it('data-content should have a points input', function () {
      elemList = locals.data$('form input[name="points"]');
      assert.lengthOf(elemList, 1);
    });
  });

  describe('8. POST to instructor assessment instance URL to set question points', function () {
    it('should load successfully', async () => {
      const res = await fetch(locals.instructorAssessmentInstanceUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: locals.__action,
          __csrf_token: locals.__csrf_token,
          instance_question_id: locals.instance_question_id,
          points: '4',
        }),
      });
      locals.postEndTime = Date.now();
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should update the total points correctly', function () {
      elemList = locals.$('#total-points');
      assert.lengthOf(elemList, 1);
      const totalPoints = Number.parseFloat(elemList[0].children[0].data);
      assert.equal(totalPoints, 15);
    });
  });

  describe('9. edit-question-score-perc form', function () {
    it('should exist', function () {
      elemList = locals.$(
        '#instanceQuestionList td:contains("addNumbers") ~ td button[data-testid="edit-question-points-score-button-score_perc"]',
      );
      assert.lengthOf(elemList, 1);
    });
    it('should have data-content', function () {
      assert.isString(elemList[0].attribs['data-content']);
    });
    it('data-content should parse', function () {
      locals.data$ = cheerio.load(elemList[0].attribs['data-content']);
    });
    it('data-content should have a CSRF token', function () {
      elemList = locals.data$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('data-content should have an __action', function () {
      elemList = locals.data$('form input[name="__action"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__action = elemList[0].attribs.value;
      assert.isString(locals.__action);
      assert.equal(locals.__action, 'edit_question_points');
    });
    it('data-content should have an instance_question_id', function () {
      elemList = locals.data$('form input[name="instance_question_id"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.instance_question_id = Number.parseInt(elemList[0].attribs.value);
    });
    it('data-content should have a score_perc input', function () {
      elemList = locals.data$('form input[name="score_perc"]');
      assert.lengthOf(elemList, 1);
    });
  });

  describe('10. POST to instructor assessment instance URL to set question score_perc', function () {
    it('should load successfully', async () => {
      const res = await fetch(locals.instructorAssessmentInstanceUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: locals.__action,
          __csrf_token: locals.__csrf_token,
          instance_question_id: locals.instance_question_id,
          score_perc: '50',
        }),
      });
      locals.postEndTime = Date.now();
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should update the total points correctly', function () {
      elemList = locals.$('#total-points');
      assert.lengthOf(elemList, 1);
      const totalPoints = Number.parseFloat(elemList[0].children[0].data);
      assert.equal(totalPoints, 13.5);
    });
  });

  describe('11. edit-total-points form', function () {
    it('should exist', function () {
      elemList = locals.$('#editTotalPointsButton');
      assert.lengthOf(elemList, 1);
    });
    it('should have data-content', function () {
      assert.isString(elemList[0].attribs['data-content']);
    });
    it('data-content should parse', function () {
      locals.data$ = cheerio.load(elemList[0].attribs['data-content']);
    });
    it('data-content should have a CSRF token', function () {
      elemList = locals.data$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('data-content should have an __action', function () {
      elemList = locals.data$('form input[name="__action"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__action = elemList[0].attribs.value;
      assert.isString(locals.__action);
      assert.equal(locals.__action, 'edit_total_points');
    });
    it('data-content should have the correct assessment_instance_id', function () {
      elemList = locals.data$('form input[name="assessment_instance_id"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      const assessment_instance_id = Number.parseInt(elemList[0].attribs.value);
      assert.equal(assessment_instance_id, 1);
    });
    it('data-content should have a points input', function () {
      elemList = locals.data$('form input[name="points"]');
      assert.lengthOf(elemList, 1);
    });
  });

  describe('12. POST to instructor assessment instance URL to set total points', function () {
    it('should load successfully', async () => {
      const res = await fetch(locals.instructorAssessmentInstanceUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: locals.__action,
          __csrf_token: locals.__csrf_token,
          assessment_instance_id: '1',
          points: '7',
        }),
      });
      locals.postEndTime = Date.now();
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should update the total points correctly', function () {
      elemList = locals.$('#total-points');
      assert.lengthOf(elemList, 1);
      const totalPoints = Number.parseFloat(elemList[0].children[0].data);
      assert.equal(totalPoints, 7);
    });
  });

  describe('13. edit-total-score-perc form', function () {
    it('should exist', function () {
      elemList = locals.$('#editTotalScorePercButton');
      assert.lengthOf(elemList, 1);
    });
    it('should have data-content', function () {
      assert.isString(elemList[0].attribs['data-content']);
    });
    it('data-content should parse', function () {
      locals.data$ = cheerio.load(elemList[0].attribs['data-content']);
    });
    it('data-content should have a CSRF token', function () {
      elemList = locals.data$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('data-content should have an __action', function () {
      elemList = locals.data$('form input[name="__action"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__action = elemList[0].attribs.value;
      assert.isString(locals.__action);
      assert.equal(locals.__action, 'edit_total_score_perc');
    });
    it('data-content should have the correct assessment_instance_id', function () {
      elemList = locals.data$('form input[name="assessment_instance_id"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      const assessment_instance_id = Number.parseInt(elemList[0].attribs.value);
      assert.equal(assessment_instance_id, 1);
    });
    it('data-content should have a score_perc input', function () {
      elemList = locals.data$('form input[name="score_perc"]');
      assert.lengthOf(elemList, 1);
    });
  });

  describe('14. POST to instructor assessment instance URL to set total score_perc', function () {
    it('should load successfully', async () => {
      const res = await fetch(locals.instructorAssessmentInstanceUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: locals.__action,
          __csrf_token: locals.__csrf_token,
          assessment_instance_id: '1',
          score_perc: assessmentSetScorePerc.toString(),
        }),
      });
      locals.postEndTime = Date.now();
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should update the total points correctly', function () {
      elemList = locals.$('#total-points');
      assert.lengthOf(elemList, 1);
      const totalPoints = Number.parseFloat(elemList[0].children[0].data);
      assert.equal(totalPoints, (assessmentSetScorePerc / 100) * helperExam.assessmentMaxPoints);
    });
  });

  describe('15. GET to instructor gradebook URL', function () {
    it('should load successfully', async () => {
      const res = await fetch(locals.instructorGradebookUrl);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should have CSRF token for testing', function () {
      elemList = locals.$('#test_csrf_token');
      assert.lengthOf(elemList, 1);
      locals.__csrf_token = elemList.text();
      assert.isString(locals.__csrf_token);
    });
    it('should load raw data file successfully', async () => {
      const res = await fetch(locals.instructorGradebookUrl + '/raw_data.json');
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should parse as JSON array of objects', function () {
      locals.gradebookData = JSON.parse(page);
      assert.isArray(locals.gradebookData);
      locals.gradebookData.forEach((obj) => assert.isObject(obj));
    });
    it('should contain a row for the dev user', function () {
      locals.gradebookDataRow = _.filter(
        locals.gradebookData,
        (row) => row.uid === 'dev@example.com',
      );
      assert.lengthOf(locals.gradebookDataRow, 1);
    });
    it('should contain the correct score and assessment instance ID in the dev user row', function () {
      const score = locals.gradebookDataRow[0].scores[locals.assessment_id];
      assert.isObject(score);
      assert.equal(score.score_perc, assessmentSetScorePerc);
      assert.equal(score.assessment_instance_id, '1');
    });
  });

  describe('16. POST to instructor gradebook URL to set total score_perc', function () {
    it('should load successfully', async () => {
      const res = await fetch(locals.instructorGradebookUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: locals.__action,
          __csrf_token: locals.__csrf_token,
          assessment_instance_id: '1',
          score_perc: assessmentSetScorePerc2.toString(),
        }),
      });
      locals.postEndTime = Date.now();
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should parse', function () {
      locals.pageData = JSON.parse(page);
    });
    it('should contain the correctly updated score', function () {
      assert.lengthOf(locals.pageData, 1);
      assert.equal(locals.pageData[0].score_perc, assessmentSetScorePerc2);
    });
  });
});
