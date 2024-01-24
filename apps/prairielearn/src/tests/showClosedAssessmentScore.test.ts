import { assert } from 'chai';
import { step } from 'mocha-steps';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config';
import * as helperServer from './helperServer';
import * as helperClient from './helperClient';

const sql = sqldb.loadSqlEquiv(__filename);

describe('Exam assessment with showClosedAssessment AND showClosedAssessmentScore access rules', function () {
  this.timeout(60000);

  const context: Record<string, any> = {};
  context.siteUrl = `http://localhost:${config.serverPort}`;
  context.baseUrl = `${context.siteUrl}/pl`;
  context.courseInstanceBaseUrl = `${context.baseUrl}/course_instance/1`;
  context.assessmentListUrl = `${context.courseInstanceBaseUrl}/assessments`;
  context.gradeBookUrl = `${context.courseInstanceBaseUrl}/gradebook`;

  const headers = {
    cookie: 'pl_test_user=test_student; pl_test_date=2000-01-19T00:00:01',
    // need student mode to get a timed exam (instructor override bypasses this)
  };
  const headersTimeLimit = {
    cookie: 'pl_test_user=test_student; pl_test_date=2000-01-19T12:00:01',
  };

  before('set up testing server', async function () {
    await helperServer.before().call(this);
    const results = await sqldb.queryOneRowAsync(sql.select_exam9, []);
    context.assessmentId = results.rows[0].id;
    context.assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${context.assessmentId}/`;
  });
  after('shut down testing server', helperServer.after);

  // we need to access the homepage to create the test_student user in the DB
  step('visit home page', async () => {
    const response = await helperClient.fetchCheerio(context.baseUrl, {
      headers,
    });
    assert.isTrue(response.ok);
  });

  step('enroll the test student user in the course', async () => {
    await sqldb.queryOneRowAsync(sql.enroll_student_in_course, []);
  });

  step('visit start exam page', async () => {
    const response = await helperClient.fetchCheerio(context.assessmentUrl, {
      headers,
    });
    assert.isTrue(response.ok);

    assert.equal(response.$('#start-assessment').text(), 'Start assessment');

    helperClient.extractAndSaveCSRFToken(context, response.$, 'form');
  });

  step('start the exam', async () => {
    const form = {
      __action: 'new_instance',
      __csrf_token: context.__csrf_token,
    };
    const response = await helperClient.fetchCheerio(context.assessmentUrl, {
      method: 'POST',
      form,
      headers,
    });
    assert.isTrue(response.ok);

    // We should have been redirected to the assessment instance
    const assessmentInstanceUrl = response.url;
    assert.include(assessmentInstanceUrl, '/assessment_instance/');
    context.assessmentInstanceUrl = assessmentInstanceUrl;

    // save the questionUrl for later
    const questionUrl = response.$('a:contains("Question 1")').attr('href');
    context.questionUrl = `${context.siteUrl}${questionUrl}`;

    context.__csrf_token = response.$('span[id=test_csrf_token]').text();
  });

  step('simulate a time limit expiration', async () => {
    const form = {
      __action: 'timeLimitFinish',
      __csrf_token: context.__csrf_token,
    };
    const response = await helperClient.fetchCheerio(context.assessmentInstanceUrl, {
      method: 'POST',
      form,
      headers: headersTimeLimit,
    });
    assert.equal(response.status, 403);

    // We should have been redirected back to the same assessment instance
    assert.equal(response.url, context.assessmentInstanceUrl + '?timeLimitExpired=true');

    // we should not have any questions
    assert.lengthOf(response.$('a:contains("Question 1")'), 0);

    // we should have the "assessment closed" message
    const msg = response.$('div.test-suite-assessment-closed-message');
    assert.lengthOf(msg, 1);
    assert.match(msg.text(), /Assessment .* is no longer available/);
  });

  step('check the assessment instance is closed', async () => {
    const results = await sqldb.queryAsync(sql.select_assessment_instances, []);
    assert.equal(results.rowCount, 1);
    assert.equal(results.rows[0].open, false);
  });

  step('check that accessing a question gives the "assessment closed" message', async () => {
    const response = await helperClient.fetchCheerio(context.questionUrl, {
      headers,
    });
    assert.equal(response.status, 403);

    assert.lengthOf(response.$('div.test-suite-assessment-closed-message'), 1);
    assert.lengthOf(response.$('div.progress'), 0); // score should NOT be shown
  });

  step('check that accessing assessment list shows score as withheld', async () => {
    const response = await helperClient.fetchCheerio(context.assessmentListUrl, { headers });
    assert.equal(response.status, 200);

    assert.lengthOf(response.$('td:contains("Score not shown")'), 1); // score withheld message should show
    assert.lengthOf(response.$('div.progress'), 0); // score should NOT be shown
  });

  step('check that accessing gradebook shows score as withheld', async () => {
    const response = await helperClient.fetchCheerio(context.assessmentListUrl, { headers });
    assert.equal(response.status, 200);

    assert.lengthOf(response.$('td:contains("Score not shown")'), 1); // score withheld message should show
    assert.lengthOf(response.$('div.progress'), 0); // score should NOT be shown
  });
});
