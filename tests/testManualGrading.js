const assert = require('chai').assert;
// const { step } = require('mocha-steps');

const cheerio = require('cheerio');
const fetch = require('node-fetch');
const querystring = require('querystring');
const config = require('../lib/config');
const helperServer = require('./helperServer');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);


const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';

// student flow entry points
const courseInstanceUrl = baseUrl + '/course_instance/1';
let hm1AutomaticTestSuiteUrl = null;

// instructor flow entry points
const instructorCourseInstanceUrl = baseUrl + '/course_instance/1/instructor/instance_admin/assessments';
let manualGradingUrl = null;

let storedConfig = null;
let ciBody = null;
let iciBody = null;
let hm1Body = null;
let manualGradingBody = null;

const mockStudents = [
    {authUid: 'student1', authName: 'Student User 1', authUin: '00000001'},
    {authUid: 'student2', authName: 'Student User 2', authUin: '00000002'},
    {authUid: 'student3', authName: 'Student User 3', authUin: '00000003'},
];

const setInstructor = () => {
    if (storedConfig) {
        config.authUid = storedConfig.authUid;
        config.authName = storedConfig.authName;
        config.authUin = storedConfig.authUin;
    }
};

const setStudent = (student) => {
    if (!storedConfig) {
        storedConfig = {
            authUid: config.authUid,
            authName: config.authName, 
            authUin: config.authUin,
        };
    }
    config.authUid = student.authUid;
    config.authName = student.authName;
    config.authUin = student.authUin;
};

const saveSubmission = async (student, instanceQuestionUrl, payload) => {
    // scrape each variant id and csrf token for homework instance question
    const $instanceQuestionPage = cheerio.load(await (await fetch(instanceQuestionUrl)).text());
    const token = $instanceQuestionPage('form > input[name="__csrf_token"]').val();
    const variantId = $instanceQuestionPage('form > input[name="__variant_id"]').val();

    assert.isString(token);
    assert.isString(variantId);

    // HACK: __variant_id should exist inside postData on only some instance questions submissions
    if (payload && payload.postData && payload.postData) {
        payload.postData = JSON.parse(payload.postData);
        payload.postData.variant.id = variantId;
        payload.postData = JSON.stringify(payload.postData);
    }

    const res = await fetch(instanceQuestionUrl, {
        method: 'POST',
        headers: {
            'Content-type': 'application/x-www-form-urlencoded',
        },
        body: [
            '__variant_id=' + variantId,
            '__action=save',
            '__csrf_token=' + token,
            querystring.encode(payload),
        ].join('&'),
    });
    console.log(res.status);
    assert.equal(res.status, 200);
};

describe('Manual grading', function() {
    this.timeout(20000);

    before('set up testing server', helperServer.before());

    before('set authenticated user to student kind', () => {
        setStudent(mockStudents[0]);
    });

    after('remove submissions from db', async () => {
        await sqldb.queryAsync(sql.remove_all_submissions, []);
    });

    describe('Students should find hw1 assessments in QA 101, Sp15 course instance', () => {
        it('should have access to the assessments page', async () => {
            const res = await fetch(courseInstanceUrl);
            assert.equal(res.ok, true);

            ciBody = await res.text();
            assert.isString(ciBody);
            assert.include(ciBody, 'Homework for automatic test suite');
        });
        it('should find all hw1 "Homework for automatic test suite" testing links', async () => {
            const $ciPage = cheerio.load(ciBody);
            hm1AutomaticTestSuiteUrl = siteUrl + $ciPage('a:contains("Homework for automatic test suite")').attr('href');
            
            const res = await fetch(hm1AutomaticTestSuiteUrl);
            assert(res.ok);

            hm1Body = await res.text();
            assert.isString(hm1Body);
            assert.include(hm1Body, 'HW1.1. Add two numbers');
            assert.include(hm1Body, 'HW1.2. Addition of vectors in Cartesian coordinates');
            assert.include(hm1Body, 'HW1.3. Advantages of fossil fuels (radio)');

            const $hm1Page = cheerio.load(hm1Body);
            const hm1AddTwoNumbersUrl = siteUrl + $hm1Page('table > tbody > tr:nth-child(1) > td:nth-child(1) > a').attr('href');
            const hm1AddVectorsCartesianUrl = siteUrl + $hm1Page('table > tbody > tr:nth-child(2) > td:nth-child(1) > a').attr('href');
            const hm1AdvantagesFossilFuelsUrl = siteUrl + $hm1Page('table > tbody > tr:nth-child(3) > td:nth-child(1) > a').attr('href');

            // ensure href URLs were found
            assert.notInclude(hm1AddTwoNumbersUrl, 'undefined');
            assert.notInclude(hm1AddVectorsCartesianUrl, 'undefined');
            assert.notInclude(hm1AdvantagesFossilFuelsUrl, 'undefined');
        });
    });

    describe('Students can save and instructors can view manual grading submissions', () => {
        this.timeout(20000);
        it('Students should be able to save a submission for given users and questions', async () => {
            // 'save' 1 answer for each question for each mock students; 1 x 3 x 3 = 9 submissions
            for await(const student of mockStudents) {
                setStudent(student);

                const res = await fetch(hm1AutomaticTestSuiteUrl);
                assert.equal(res.ok, true);
        
                const hm1Body = await res.text();
                assert.isString(hm1Body);

                const $hm1Body = cheerio.load(hm1Body);
                const hm1AddTwoNumbersUrl = siteUrl + $hm1Body('table > tbody > tr:nth-child(1) > td:nth-child(1) > a').attr('href');
                const hm1AddVectorsCartesianUrl = siteUrl + $hm1Body('table > tbody > tr:nth-child(2) > td:nth-child(1) > a').attr('href');
                const hm1AdvantagesFossilFuelsUrl = siteUrl + $hm1Body('table > tbody > tr:nth-child(3) > td:nth-child(1) > a').attr('href');
                
                await saveSubmission(student, hm1AddTwoNumbersUrl, {c: 9999999});
                await saveSubmission(student, hm1AddVectorsCartesianUrl, {
                    postData: JSON.stringify({
                        submittedAnswer: { wx: '999999', wy: '999999' },
                        variant: { id: null },
                      },
                    ),
                });
                await saveSubmission(student, hm1AdvantagesFossilFuelsUrl, {
                    postData: JSON.stringify(
                        {
                            variant: { id: null },
                            submittedAnswer: { key: 'c' },
                        },
                    ),
                });
            }
            const context = await sqldb.queryAsync(sql.get_all_submissions, []);
            assert.equal(context.rowCount, 9);
        });
        it('Instructors should be able to see the 9 ungraded student submissions for manual grading', async () => {
            setInstructor();
            iciBody = await (await fetch(instructorCourseInstanceUrl)).text();
            assert.isString(iciBody);

            manualGradingUrl = siteUrl + cheerio.load(iciBody)('a:contains("Homework for automatic test suite")').attr('href') + 'manual_grading';
            manualGradingBody = await (await fetch(manualGradingUrl)).text();
            const $manualGradingPage = cheerio.load(manualGradingBody);

            // get manual grading table row for each question
            const $addNumbersRow = cheerio.load(
                $manualGradingPage('.qid-value:contains("addNumbers")').parent().html(),
            );
            const $addVectorsRow = cheerio.load(
                $manualGradingPage('.qid-value:contains("addVectors")').parent().html(),
            );
            const $fossilFuelsRow = cheerio.load(
                $manualGradingPage('.qid-value:contains("fossilFuelsRadio")').parent().html(),
            );

            assert.equal($addNumbersRow('.ungraded-value').text(), 3);
            assert.equal($addVectorsRow('.ungraded-value').text(), 3);
            assert.equal($fossilFuelsRow('.ungraded-value').text(), 3);
            assert.equal($addNumbersRow('.graded-value').text(), 0);
            assert.equal($addVectorsRow('.graded-value').text(), 0);
            assert.equal($fossilFuelsRow('.graded-value').text(), 0);
        });
    });

    describe('Instructors can navigate through manual grading submissions', () => {

    });
});
