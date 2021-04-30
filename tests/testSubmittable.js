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

    step('ensure that the assessment is not visible in the year 1850', async () => {
        headers.cookie = 'pl_requested_date=1850-06-01T00:00:01';
        
        const response = await helperClient.fetchCheerio(context.assessmentListUrl, { headers });
        assert.isTrue(response.ok);

        assert.lengthOf(response.$('a:contains("Test Submittable Access Rule")'), 0);
    });

    step('try to access the assessment in the year 1850', async () => {
        headers.cookie = 'pl_requested_date=1850-06-01T00:00:01';
        
        const response = await helperClient.fetchCheerio(context.assessmentUrl, { headers });
        assert.equal(response.status, 403);
    });

    step('ensure that the assessment is visible in the year 2000', async () => {
        headers.cookie = 'pl_requested_date=2000-06-01T00:00:01';
        
        const response = await helperClient.fetchCheerio(context.assessmentListUrl, { headers });
        assert.isTrue(response.ok);

        assert.lengthOf(response.$('a:contains("Test Submittable Access Rule")'), 1);
    });

    step('try to access the assessment in the year 2000', async () => {
        headers.cookie = 'pl_requested_date=2000-06-01T00:00:01';

        const response = await helperClient.fetchCheerio(context.assessmentUrl, { headers });
        assert.equal(response.status, 403);

        const msg = response.$('div.test-suite-assessment-closed-message');
        assert.lengthOf(msg, 1);
        assert.equal(msg.text(), 'Assessment is not available at this time.');
    });

    step('check that an assessment instance was not created', async () => {
        const results = await sqldb.queryAsync(sql.select_assessment_instances, []);
        assert.equal(results.rowCount, 0);
    });
});