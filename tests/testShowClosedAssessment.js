const util = require('util');
const assert = require('chai').assert;
const { step } = require('mocha-steps');

const config = require('../lib/config');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

const helperServer = require('./helperServer');
const helperClient = require('./helperClient');

/**
 * This test validates the behavior of exams with real-time grading disabled.
 * It was deliberately written separately from `testExam.js` as a start to
 * breaking tests out of that monolith. It does not reuse existing conventions
 * from `testExam.js` in favor of experimenting with a different way of writing
 * PrairieLearn tests.
 */
describe('Exam assessment with real-time grading disabled', function() {
    this.timeout(60000);

    const context = {};
    context.siteUrl = `http://localhost:${config.serverPort}`;
    context.baseUrl = `${context.siteUrl}/pl`;
    context.courseInstanceBaseUrl= `${context.baseUrl}/course_instance/1`;

    before('set up testing server', async function() {
        await util.promisify(helperServer.before().bind(this))();
        const results = await sqldb.queryOneRowAsync(sql.select_exam8, []);
        context.assessmentId = results.rows[0].id;
        context.assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${context.assessmentId}/`;
    });
    after('shut down testing server', helperServer.after);

    step('visit start exam page', async () => {
        const response = await helperClient.fetchCheerio(context.assessmentUrl);
        assert.isTrue(response.ok);

        assert.equal(response.$('#start-assessment').text(), 'Start assessment');

        helperClient.extractAndSaveCSRFToken(context, response.$, 'form');
    });

    step('start the exam', async () => {
        const form = {
            __action: 'newInstance',
            __csrf_token: context.__csrf_token,
        };
        const response = await helperClient.fetchCheerio(context.assessmentUrl, { method: 'POST', form });
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

    step('simulate a time limit expiration', async () => {
        const form = {
            __action: 'timeLimitFinish',
            __csrf_token: context.__csrf_token,
        };
        const response = await helperClient.fetchCheerio(context.assessmentInstanceUrl, { method: 'POST', form });
        assert.isTrue(response.ok);

        // We should have been redirected back to the same assessment instance
        assert.equal(response.url, context.assessmentInstanceUrl);

        // we should not have any questions
        assert.lengthOf(response.$('a:contains("Question 1")'), 0);

        // we should have the "assessment closed" message
        const msg = response.$('div.assessment-closed-message');
        assert.lengthOf(msg, 1);
        assert.match(msg[0].text(), /Assessment .* is no longer available/);
    });

    step('check the assessment instance is closed', async () {
        const results = await sqldb.queryAsync(sql.select_assessment_instances, []);
        assert.equal(results.rowCount, 1);
        assert.equal(results.rows[0].open, false);
    });

    step('check that accessing a question gives the "assessment closed" message', async () => {
        const response = await helperClient.fetchCheerio(context.questionUrl);
        assert.isTrue(response.ok);

        assert.lengthOf(response.$('div.assessment-closed-message'), 1);
    });
});
