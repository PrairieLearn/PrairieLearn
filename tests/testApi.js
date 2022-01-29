// @ts-check
const _ = require('lodash');
const assert = require('chai').assert;
const cheerio = require('cheerio');
const fetch = require('node-fetch').default;
const { URLSearchParams } = require('url');
const { step } = require('mocha-steps');

const helperServer = require('./helperServer');
const helperQuestion = require('./helperQuestion');
const helperExam = require('./helperExam');

const locals = {};

const assessmentPoints = 5;

describe('API', function () {
  this.timeout(60000);

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  helperExam.startExam(locals);

  describe('grade correct answer to question addNumbers', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = helperExam.questions.addNumbers;
        locals.expectedResult = {
          submission_score: 1,
          submission_correct: true,
          instance_question_points: assessmentPoints,
          instance_question_score_perc: (assessmentPoints / 5) * 100,
          assessment_instance_points: assessmentPoints,
          assessment_instance_score_perc: (assessmentPoints / helperExam.assessmentMaxPoints) * 100,
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

  describe('settings page', function () {
    let settingsUrl;

    it('loads successfully', async function () {
      settingsUrl = locals.baseUrl + '/settings';
      const res = await fetch(settingsUrl);
      assert.isTrue(res.ok);
      const page$ = cheerio.load(await res.text());

      const button = page$('#generateTokenButton').get(0);

      // Load the popover content
      assert.isString(button.attribs['data-content']);
      const data$ = cheerio.load(button.attribs['data-content']);

      // Validate that the CSRF token is present
      const csrfInput = data$('form input[name="__csrf_token"]').get(0);
      const csrfToken = csrfInput.attribs.value;
      assert.isString(csrfToken);

      // Store CSRF token for later requests
      locals.__csrf_token = csrfToken;

      // Validate the action input
      const actionInput = data$('form input[name="__action"]').get(0);
      const action = actionInput.attribs.value;
      assert.equal(action, 'token_generate');

      // Persist the action for later
      // TODO: just hardcode this!
      locals.__action = action;

      // Validate that there's an input for the token name
      assert.lengthOf(data$('form input[name="token_name"]'), 1);

      // There shouldn't be an access token displayed on the page
      assert.lengthOf(page$('.new-access-token'), 0);
    });

    it('generates a token', async function () {
      const res = await fetch(settingsUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: locals.__action,
          __csrf_token: locals.__csrf_token,
          token_name: 'test',
        }),
        redirect: 'follow',
      });
      assert.isTrue(res.ok);

      // Extract the token from the response
      const page$ = cheerio.load(await res.text());
      const tokenContainer = page$('.new-access-token');
      assert.lengthOf(tokenContainer, 1);
      locals.api_token = tokenContainer.text().trim();

      // Check that the token has the correct format
      assert.ok(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(locals.api_token)
      );
    });
  });

  describe('API endpoints', function () {
    step('GET to API for assessments fails without token', async function () {
      locals.apiUrl = locals.baseUrl + '/api/v1';
      locals.apiCourseInstanceUrl = locals.apiUrl + '/course_instances/1';
      locals.apiAssessmentsUrl = locals.apiCourseInstanceUrl + '/assessments';
      const res = await fetch(locals.apiAssessmentsUrl);
      assert.equal(res.status, 401);
    });

    step('GET to API for assessments fails with an incorrect token', async function () {
      const res = await fetch(locals.apiAssessmentsUrl, {
        headers: {
          'Private-Token': '12345678-1234-1234-1234-1234567890ab',
        },
      });
      assert.equal(res.status, 401);
    });

    step('GET to API for assessments succeeds with the correct token', async function () {
      const res = await fetch(locals.apiAssessmentsUrl, {
        headers: {
          'Private-Token': locals.api_token,
        },
      });
      assert.equal(res.status, 200);

      locals.json = await res.json();

      const objectList = _.filter(
        locals.json,
        (o) => o.assessment_name === 'exam1-automaticTestSuite'
      );
      assert.lengthOf(objectList, 1);
      locals.assessment_id = objectList[0].assessment_id;
      assert.equal(objectList[0].assessment_label, 'E1');
    });

    step('GET to API for single assesment succeeds', async function () {
      locals.apiAssessmentUrl =
        locals.apiCourseInstanceUrl + `/assessments/${locals.assessment_id}`;

      const res = await fetch(locals.apiAssessmentUrl, {
        headers: {
          'Private-Token': locals.api_token,
        },
      });
      assert.equal(res.status, 200);

      locals.json = await res.json();
      assert.equal(locals.json.assessment_id, locals.assessment_id);
      assert.equal(locals.json.assessment_label, 'E1');
    });

    step('GET to API for assessment instances succeeds', async function () {
      locals.apiAssessmentInstancesUrl =
        locals.apiCourseInstanceUrl + `/assessments/${locals.assessment_id}/assessment_instances`;

      const res = await fetch(locals.apiAssessmentInstancesUrl, {
        headers: {
          'Private-Token': locals.api_token,
        },
      });
      assert.equal(res.status, 200);

      locals.json = await res.json();
      assert.lengthOf(locals.json, 1);

      locals.assessment_instance_id = locals.json[0].assessment_instance_id;
      assert.equal(locals.json[0].user_uid, 'dev@illinois.edu');
      assert.equal(locals.json[0].points, assessmentPoints);
      assert.equal(locals.json[0].max_points, helperExam.assessmentMaxPoints);
    });

    step('GET to API for a single assessment instance succeeds', async function () {
      locals.apiAssessmentInstanceUrl =
        locals.apiCourseInstanceUrl + `/assessment_instances/${locals.assessment_instance_id}`;

      const res = await fetch(locals.apiAssessmentInstanceUrl, {
        headers: {
          'Private-Token': locals.api_token,
        },
      });
      assert.equal(res.status, 200);

      locals.json = await res.json();
      assert.equal(locals.json.assessment_instance_id, locals.assessment_instance_id);
      assert.equal(locals.json.assessment_id, locals.assessment_id);
      assert.equal(locals.json.user_uid, 'dev@illinois.edu');
      assert.equal(locals.json.points, assessmentPoints);
      assert.equal(locals.json.max_points, helperExam.assessmentMaxPoints);
    });

    step('GET to API for assessment submissions succeeds', async function () {
      locals.apiSubmissionsUrl =
        locals.apiCourseInstanceUrl +
        `/assessment_instances/${locals.assessment_instance_id}/submissions`;

      const res = await fetch(locals.apiSubmissionsUrl, {
        headers: {
          'Private-Token': locals.api_token,
        },
      });
      assert.equal(res.status, 200);

      locals.json = await res.json();
      assert.lengthOf(locals.json, 1);

      locals.submission_id = locals.json[0].submission_id;
      assert.equal(locals.json[0].instance_question_points, assessmentPoints);
    });

    describe('GET to API for single submission succeeds', async function () {
      locals.apiSubmissionUrl =
        locals.apiCourseInstanceUrl + `/submissions/${locals.submission_id}`;

      const res = await fetch(locals.apiSubmissionUrl, {
        headers: {
          'Private-Token': locals.api_token,
        },
      });
      assert.equal(res.status, 200);

      locals.json = await res.json();
      assert.equal(locals.json.submission_id, locals.submission_id);
      assert.equal(locals.json.assessment_instance_id, locals.assessment_instance_id);
      assert.equal(locals.json.assessment_id, locals.assessment_id);
      assert.equal(locals.json.instance_question_points, assessmentPoints);
    });

    step('GET to API for gradebook', async function () {
      locals.apiGradebookUrl = locals.apiCourseInstanceUrl + `/gradebook`;
      const res = await fetch(locals.apiGradebookUrl, {
        headers: {
          'Private-Token': locals.api_token,
        },
      });
      assert.equal(res.status, 200);

      locals.json = await res.json();
      const users = _.filter(locals.json, (o) => o.user_uid === 'dev@illinois.edu');
      assert.lengthOf(users, 1);
      locals.devObject = users[0];

      const assessments = _.filter(
        locals.devObject.assessments,
        (o) => o.assessment_label === 'E1'
      );
      assert.lengthOf(assessments, 1);
      locals.gradebookEntry = assessments[0];
      assert.equal(locals.gradebookEntry.points, assessmentPoints);
      assert.equal(locals.gradebookEntry.max_points, helperExam.assessmentMaxPoints);
    });

    step('GET to API for assessment instance questions succeeds', async function () {
      locals.apiInstanceQuestionUrl =
        locals.apiCourseInstanceUrl +
        `/assessment_instances/${locals.assessment_instance_id}/instance_questions`;

      const res = await fetch(locals.apiInstanceQuestionUrl, {
        headers: {
          'Private-Token': locals.api_token,
        },
      });

      locals.json = await res.json();
      assert.lengthOf(locals.json, 7);
    });

    step('GET to API for assessment access rules succeeds', async function () {
      locals.apiAssessmentAccessRulesUrl =
        locals.apiCourseInstanceUrl +
        `/assessments/${locals.assessment_id}/assessment_access_rules`;

      const res = await fetch(locals.apiAssessmentAccessRulesUrl, {
        headers: {
          'Private-Token': locals.api_token,
        },
      });
      assert.equal(res.status, 200);

      locals.json = await res.json();
      assert.lengthOf(locals.json, 1);
    });

    step('GET to API for course instance access rules succeeds', async function () {
      locals.apiCourseInstanceAccessRulesUrl =
        locals.apiCourseInstanceUrl + `/course_instance_access_rules`;
      const res = await fetch(locals.apiCourseInstanceAccessRulesUrl, {
        headers: {
          'Private-Token': locals.api_token,
        },
      });
      assert.equal(res.status, 200);

      locals.json = await res.json();
      assert.lengthOf(locals.json, 1);
    });

    step('GET to API for course instance info succeeds', async function () {
      const res = await fetch(locals.apiCourseInstanceUrl, {
        headers: {
          'Private-Token': locals.api_token,
        },
      });
      assert.equal(res.status, 200);

      locals.json = await res.json();
      assert.exists(locals.json.course_instance_id);
      assert.exists(locals.json.course_title);
    });
  });
});
