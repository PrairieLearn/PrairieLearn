// const util = require('util');
const assert = require('chai').assert;
// const { step } = require('mocha-steps');

const cheerio = require('cheerio');
const fetch = require('node-fetch');
const querystring = require('querystring');
const config = require('../lib/config');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const courseInstanceUrl = baseUrl + '/course_instance/1';
const hm1ManualGradingUrl = baseUrl + '/course_instance/1/';

let storedConfig = null;
let ciBody = null;

let hm1Body = null;
let hm1AutomaticTestSuiteUrl = null;
let hm1AddTwoNumbersUrl = null;
let hm1AddVectorsCartesianUrl = null;
let hm1AdvantagesFossilFuelsUrl = null;

const mockStudents = [
    {authUid: 'student1', authName: 'Student User 1', authUin: '00000001'},
    {authUid: 'student2', authName: 'Student User 2', authUin: '00000002'},
    {authUid: 'student3', authName: 'Student User 3', authUin: '00000003'},
];

const setInstructor = () => {
    config.authUid = storedConfig.authUid;
    config.authName = storedConfig.authName;
    config.authUin = storedConfig.authUin;
};

const setStudent = (student) => {
    if(!storedConfig) {
        storedConfig = {authUid: config.authUid, authName: config.authName, authUin: config.authUin};
    }
    config.authUid = student.authUid;
    config.authName = student.authName;
    config.authUin = student.authUin;
};

const getQuestionRow = ($, question, className) => {
    const rows = $('#instance-question-grading-table > tbody > tr');
    const questionRow = rows.filter(() => $(this).find('.question-title-value').text().includes('question'))[0];
    if (!questionRow) {
        throw new Error('Question row not found');
    }
    return questionRow;
};

const saveSubmission = async (student, instanceQuestionUrl, payload) => {
    // scrape each variant id and csrf token for each homework instance question
    const token = cheerio.load(await (await fetch(instanceQuestionUrl)).text())('form > input[name="__csrf_token"]').val();
    const variantId = cheerio.load(await (await fetch(instanceQuestionUrl)).text())('form > input[name="__variant_id"]').val();

    assert(token);
    assert(variantId);

    // ensure href URLs were found
    assert.notInclude(hm1AddTwoNumbersUrl, 'undefined');
    assert.notInclude(hm1AddVectorsCartesianUrl, 'undefined');
    assert.notInclude(hm1AdvantagesFossilFuelsUrl, 'undefined');

    // HACK: __variant_id should exist inside postData on some instance questions
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

    before('set authenticated user to student kind', () => {
        setStudent(mockStudents[0]);
    });

    after('remove submissions from db', async () => {
        // await sqldb.queryAsync(sql.remove_all_submissions, []);
    });

    describe('Students should find hw1 assessments in QA 101, Sp15 course instance', () => {
        it('should have access to the assessments page', async () => {
            const res = await fetch(courseInstanceUrl);
            assert(res.ok);

            ciBody = await res.text();
            assert.isString(ciBody);
            assert.include(ciBody, 'Homework for automatic test suite');
        });
        it('should find all hw1 "Homework for automatic test suite" testing links', async () => {
            const $ciBody = cheerio.load(ciBody);
            hm1AutomaticTestSuiteUrl = siteUrl + $ciBody('#content > div > table > tbody > tr:nth-child(2) > td:nth-child(2) > a[href]').attr('href');
            
            const res = await fetch(hm1AutomaticTestSuiteUrl);
            assert(res.ok);

            hm1Body = await res.text();
            assert.isString(hm1Body);
            assert.include(hm1Body, 'HW1.1. Add two numbers');
            assert.include(hm1Body, 'HW1.2. Addition of vectors in Cartesian coordinates');
            assert.include(hm1Body, 'HW1.3. Advantages of fossil fuels (radio)');

            const $hm1Body = cheerio.load(hm1Body);
            hm1AddTwoNumbersUrl = siteUrl + $hm1Body('table > tbody > tr:nth-child(1) > td:nth-child(1) > a').attr('href');
            hm1AddVectorsCartesianUrl = siteUrl + $hm1Body('table > tbody > tr:nth-child(2) > td:nth-child(1) > a').attr('href');
            hm1AdvantagesFossilFuelsUrl = siteUrl + $hm1Body('table > tbody > tr:nth-child(3) > td:nth-child(1) > a').attr('href');
        });
    });

    describe('Students can save and instructors can view manual grading submissions', () => {
        this.timeout(20000);
        it('Students should be able to save a submission for given users and questions', async () => {
            // 'save' 1 answer for each question for each mock students; 1 x 3 x 3 = 9 submissions
            for await(const student of mockStudents) {
                setStudent(student);

                const res = await fetch(hm1AutomaticTestSuiteUrl);
                assert(res.ok);
        
                const hm1Body = await res.text();
                assert.isString(hm1Body);

                const $hm1Body = cheerio.load(hm1Body);
                hm1AddTwoNumbersUrl = siteUrl + $hm1Body('table > tbody > tr:nth-child(1) > td:nth-child(1) > a').attr('href');
                hm1AddVectorsCartesianUrl = siteUrl + $hm1Body('table > tbody > tr:nth-child(2) > td:nth-child(1) > a').attr('href');
                hm1AdvantagesFossilFuelsUrl = siteUrl + $hm1Body('table > tbody > tr:nth-child(3) > td:nth-child(1) > a').attr('href');
                
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
        it('Instructors should be able to see saved student submissions for manual grading', () => {
            //           graded - ungraded
            // addNumbers   0    -     3
            // addVectors   0    -     3
            // fossilFuelsRadio  0    -     3


        });
    });
});
