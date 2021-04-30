const util = require('util');
const config = require('../lib/config');
const assert = require('chai').assert;

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

const helperServer = require('./helperServer');
const helperClient = require('./helperClient');
const { step } = require('mocha-steps');

describe('Exam assessment with submittable rule', function() {
    this.timeout(20000);

    const storedConfig = {};
    const context = {};
    context.siteUrl = `http://localhost:${config.serverPort}`;
    context.baseUrl = `${context.siteUrl}/pl`;
    context.courseInstanceBaseUrl= `${context.baseUrl}/course_instance/1`;
    context.assessmentListUrl = `${context.courseInstanceBaseUrl}/assessments`;
    context.gradeBookUrl = `${context.courseInstanceBaseUrl}/gradebook`;

    const headers = {};

    before('set authenticated user', function(callback) {
        storedConfig.authUid = config.authUid;
        storedConfig.authName = config.authName;
        storedConfig.authUin = config.authUin;
        config.authUid = 'student@illinois.edu';
        config.authName = 'Student User';
        config.authUin = '00000001';
        callback(null);
    });
    before('set up testing server', async function() {
        await util.promisify(helperServer.before().bind(this))();
        const results = await sqldb.queryOneRowAsync(sql.select_exam11, []);
        context.assessmentId = results.rows[0].id;
        context.assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${context.assessmentId}/`;
    });
    after('shut down testing server', helperServer.after);
    after('unset authenticated user', function(callback) {
        Object.assign(config, storedConfig);
        callback(null);
    });

    step('visit home page', async () => {
        const response = await helperClient.fetchCheerio(context.baseUrl, { headers });
        assert.isTrue(response.ok);
    });

    step('enroll the test student user in the course', async () => {
        await sqldb.queryOneRowAsync(sql.enroll_student_in_course, []);
    });

    step('ensure that the assessment is not visible on the assessments page when no access rule applies', async () => {
        headers.cookie = 'pl_requested_date=1850-06-01T00:00:01';
        
        const response = await helperClient.fetchCheerio(context.assessmentListUrl, { headers });
        assert.isTrue(response.ok);

        assert.lengthOf(response.$('a:contains("Test Submittable Access Rule")'), 0);
    });

    step('try to access the assessment when no access rule applies', async () => {
        headers.cookie = 'pl_requested_date=1850-06-01T00:00:01';
        
        const response = await helperClient.fetchCheerio(context.assessmentUrl, { headers });
        assert.equal(response.status, 403);
    });

    step('ensure that the assessment is visible on the assessments page if submittable is false', async () => {
        headers.cookie = 'pl_requested_date=2000-06-01T00:00:01';
        
        const response = await helperClient.fetchCheerio(context.assessmentListUrl, { headers });
        assert.isTrue(response.ok);

        assert.lengthOf(response.$('a:contains("Test Submittable Access Rule")'), 1);
    });

    step('try to access the assessment when it is not submittable', async () => {
        headers.cookie = 'pl_requested_date=2000-06-01T00:00:01';

        const response = await helperClient.fetchCheerio(context.assessmentUrl, { headers });
        assert.equal(response.status, 403);

        const msg = response.$('div.test-suite-assessment-closed-message');
        assert.lengthOf(msg, 1);
        assert.match(msg.text(), /Assessment is not available at this time./);
    });

    step('check that an assessment instance was not created', async () => {
        const results = await sqldb.queryAsync(sql.select_assessment_instances, []);
        assert.equal(results.rowCount, 0);
    });

    step('visit start exam page when the assessment is submittable', async () => {
        headers.cookie = 'pl_requested_date=2010-01-01T00:45:01';

        const response = await helperClient.fetchCheerio(context.assessmentUrl, { headers });
        assert.isTrue(response.ok);

        assert.equal(response.$('#start-assessment').text(), 'Start assessment');

        helperClient.extractAndSaveCSRFToken(context, response.$, 'form');
    });

    step('start the exam', async () => {
        const form = {
            __action: 'new_instance',
            __csrf_token: context.__csrf_token,
        };
        const response = await helperClient.fetchCheerio(context.assessmentUrl, { method: 'POST', form , headers});
        assert.isTrue(response.ok);

        // We should have been redirected to the assessment instance
        const assessmentInstanceUrl = response.url;
        assert.include(assessmentInstanceUrl, '/assessment_instance/');
        context.assessmentInstanceUrl = assessmentInstanceUrl;

        // save the questionUrl for later
        const questionUrl = response.$('a:contains("Question 1")').attr('href');
        context.questionUrl = `${context.siteUrl}${questionUrl}`;

        helperClient.extractAndSaveCSRFToken(context, response.$, 'form[name="time-limit-finish-form"]');
    });

    step('access assessment when it is no longer submittable', async () => {
        headers.cookie = 'pl_requested_date=2010-01-01T23:50:01';

        const response = await helperClient.fetchCheerio(context.assessmentUrl, { headers });
        console.log(response.$.html());
        assert.equal(response.$.html(), '');
        assert.isTrue(response.ok);

        const msg = response.$('p[class="small mb-0"]');
        assert.lengthOf(msg, 1);
        assert.match(msg.text(), /Attachments can't be added or deleted because the assessment is closed./);
    });

    step('access question when assessment is no longer submittable', async () => {
        headers.cookie = 'pl_requested_date=2010-01-02T00:00:01';

        const response = await helperClient.fetchCheerio(context.questionUrl, { headers });
        assert.isTrue(response.ok);

        const msg = response.$('div#question-panel-footer');
        assert.lengthOf(msg, 1);
        assert.match(msg.text(), /This question is complete and cannot be answered again./);
    });

    step('simulate a time limit expiration', async () => {
        const form = {
            __action: 'timeLimitFinish',
            __csrf_token: context.__csrf_token,
        };
        const response = await helperClient.fetchCheerio(context.assessmentInstanceUrl, { method: 'POST', form , headers});
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

    step('check that the assessment instance is closed', async () => {
        const results = await sqldb.queryAsync(sql.select_assessment_instances, []);
        assert.equal(results.rowCount, 1);
        assert.equal(results.rows[0].open, false);
    });

    step('access the assessment when submittable and showClosedAssessment are false', async () => {
        headers.cookie = 'pl_requested_date=2020-06-01T00:00:01';

        const response = await helperClient.fetchCheerio(context.assessmentInstanceUrl, { headers });
        assert.equal(response.status, 403);

        assert.lengthOf(response.$('div.test-suite-assessment-closed-message'), 1);
        assert.lengthOf(response.$('div.progress'), 1); // score should be shown
    });

    step('access the assessment when submittable, showClosedAssessment, and showClosedAssessmentScore are false', async () => {
        headers.cookie = 'pl_requested_date=2030-06-01T00:00:01';

        const response = await helperClient.fetchCheerio(context.assessmentInstanceUrl, { headers });
        assert.equal(response.status, 403);

        assert.lengthOf(response.$('div.test-suite-assessment-closed-message'), 1);
        assert.lengthOf(response.$('div.progress'), 0); // score should NOT be shown
    });
});
