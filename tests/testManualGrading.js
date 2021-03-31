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

// student role pages
const courseInstanceUrl = baseUrl + '/course_instance/1';
let hm1AutomaticTestSuiteUrl = null;

// instructor role pages
const instructorCourseInstanceUrl = baseUrl + '/course_instance/1/instructor/instance_admin/assessments';

let storedConfig = null;
let ciBody = null;
let hm1Body = null;
let manualGradingBody = null;

const mockStudents = [
    {authUid: 'student1', authName: 'Student User 1', authUin: '00000001'},
    {authUid: 'student2', authName: 'Student User 2', authUin: '00000002'},
    {authUid: 'student3', authName: 'Student User 3', authUin: '00000003'},
];
const mockInstructor = {authUid: 'mwest@illinois.edu', authName: '', uin: ''};

const setInstructor = (instructor) => {
    if (instructor) {
        config.authUid = instructor.authUid;
        config.authName = instructor.authName;
        config.authUin = instructor.authUin;
    } else {
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
    assert.equal(res.status, 200);
};

describe('Manual grading', function() {
    this.timeout(20000);

    before('set up testing server', helperServer.before());
    after('shut down testing server', helperServer.after);

    before('set any student as default user role', () => setStudent(mockStudents[0]));

    describe('students should find hw1 assessments in QA 101, Sp15 course instance', () => {
        it('students should have access to the assessments page', async () => {
            const res = await fetch(courseInstanceUrl);
            assert.equal(res.ok, true);

            ciBody = await res.text();
            assert.isString(ciBody);
            assert.include(ciBody, 'Homework for automatic test suite');
        });
        it('students should find all hw1 "Homework for automatic test suite" testing links', async () => {
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
            const hm1AddTwoNumbersUrl = siteUrl + $hm1Page('a:contains("HW1.1. Add two numbers")').attr('href');
            const hm1AddVectorsCartesianUrl = siteUrl + $hm1Page('a:contains("HW1.2. Addition of vectors in Cartesian coordinates")').attr('href');
            const hm1AdvantagesFossilFuelsUrl = siteUrl + $hm1Page('a:contains("HW1.3. Advantages of fossil fuels (radio)")').attr('href');

            // ensure href URLs were found
            assert.notInclude(hm1AddTwoNumbersUrl, 'undefined');
            assert.notInclude(hm1AddVectorsCartesianUrl, 'undefined');
            assert.notInclude(hm1AdvantagesFossilFuelsUrl, 'undefined');
        });
    });

    describe('students can save and instructors can view manual grading submissions', () => {
        this.timeout(20000);
        it('students should be able to save submissions on instance questions', async () => {
            // 'save' 1 answer for each question for each mock students; 1 x 3 x 3 = 9 submissions
            for await(const student of mockStudents) {
                setStudent(student);

                const res = await fetch(hm1AutomaticTestSuiteUrl);
                assert.equal(res.ok, true);
        
                const hm1Body = await res.text();
                assert.isString(hm1Body);

                const $hm1Body = cheerio.load(hm1Body);
                const hm1AddTwoNumbersUrl = siteUrl + $hm1Body('a:contains("HW1.1. Add two numbers")').attr('href');
                const hm1AddVectorsCartesianUrl = siteUrl + $hm1Body('a:contains("HW1.2. Addition of vectors in Cartesian coordinates")').attr('href');
                const hm1AdvantagesFossilFuelsUrl = siteUrl + $hm1Body('a:contains("HW1.3. Advantages of fossil fuels (radio)")').attr('href');
                
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
        });
        it('submissions table should contain 9x ungraded student submissions', async () => {
            const context = await sqldb.queryAsync(sql.get_all_submissions, []);
            const groupedByStudent = {};

            context.rows.forEach((submission) => {
                assert.isNull(submission.graded_at);

                if (!groupedByStudent[submission.auth_user_id]) {groupedByStudent[submission.auth_user_id] = [];}
                groupedByStudent[submission.auth_user_id].push(submission);
            });

            assert.equal(context.rowCount, 9);
            assert.lengthOf(Object.keys(groupedByStudent), 3);
            Object.keys(groupedByStudent).forEach((student) => assert.lengthOf(groupedByStudent[student], 3, 'array has length of 3'));
        });
    });

    describe('Instructors can grade submissions', () => {
        let iciBody = null;
        let manualGradingUrl = null;
        let $manualGradingPage = null;
        let $addNumbersRow = null;
        let $addVectorsRow = null;
        let $fossilFuelsRow = null;

        before('set instructor user role', () => setInstructor());
        before('get instructor URLS and rows', async () => {
            iciBody = await (await fetch(instructorCourseInstanceUrl)).text();
            assert.isString(iciBody);
            manualGradingUrl = siteUrl + cheerio.load(iciBody)('a:contains("Homework for automatic test suite")').attr('href') + 'manual_grading';
            manualGradingBody = await (await fetch(manualGradingUrl)).text();
            $manualGradingPage = cheerio.load(manualGradingBody);

            // get manual grading table row for each question
            $addNumbersRow = cheerio.load(
                $manualGradingPage('.qid-value:contains("addNumbers")').parent().html(),
            );
            $addVectorsRow = cheerio.load(
                $manualGradingPage('.qid-value:contains("addVectors")').parent().html(),
            );
            $fossilFuelsRow = cheerio.load(
                $manualGradingPage('.qid-value:contains("fossilFuelsRadio")').parent().html(),
            );
        });

        it('instructors should be able to see 9 ungraded submissions', async () => {
            assert.equal($addNumbersRow('.ungraded-value').text(), 3);
            assert.equal($addVectorsRow('.ungraded-value').text(), 3);
            assert.equal($fossilFuelsRow('.ungraded-value').text(), 3);
            assert.equal($addNumbersRow('.graded-value').text(), 0);
            assert.equal($addVectorsRow('.graded-value').text(), 0);
            assert.equal($fossilFuelsRow('.graded-value').text(), 0);
        });
        it('instructor should see "Grade Next" option for 3 testing questions', () => {
            assert.isNotNull($addNumbersRow('.grade-next-value').attr('href'));
            assert.isNotNull($addVectorsRow('.grade-next-value').attr('href'));
            assert.isNotNull($fossilFuelsRow('.grade-next-value').attr('href'));
        });
        it('instructor user id should be added to instance question when submission opened for manual grading', async () => {
            const gradeNextAddNumbersURL = siteUrl + $addNumbersRow('.grade-next-value').attr('href');
            const redirectUrl = (await fetch(gradeNextAddNumbersURL)).url;

            const instanceQuestionId = parseInt(
                // get param following 'instance_question/'
                redirectUrl.match(/instance_question\/(\d+)/)[1],
            );
            assert.isNumber(instanceQuestionId);

            const instanceQuestion = (await sqldb.queryOneRowAsync(sql.get_instance_question, {id: instanceQuestionId})).rows[0];
            const user = (await sqldb.queryOneRowAsync(sql.get_user_by_uin, {uin: storedConfig.authUin})).rows[0];
            assert.equal(instanceQuestion.manual_grading_user, user.user_id);
        });
        it('instructor should see warning message when loading instance_question being manually graded by another instructor', async () => {
            const gradeNextAddNumbersURL = siteUrl + $addNumbersRow('.grade-next-value').attr('href');

            // iq is set with manual grading user (Dev User) on open
            const iqManualGradingUrl = (await fetch(gradeNextAddNumbersURL)).url;

            setInstructor(mockInstructor);
            const iqManualGradingBody = await (await fetch(iqManualGradingUrl)).text();
            assert.include(iqManualGradingBody, 'Dev User (dev@illinois.edu) is currently grading this question');
        });
        it('instructor should see grading conflict view if view open for both users and both users submit manual grade', async () => {

        });
    });
});
