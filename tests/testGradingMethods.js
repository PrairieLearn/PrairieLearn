const {assert} = require('chai');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const querystring = require('querystring');
const config = require('../lib/config');
const helperServer = require('./helperServer');
// const sqlLoader = require('../prairielib/lib/sql-loader');
// const sqlDb = require('../prairielib/lib/sql-db');
// const sql = sqlLoader.loadSqlEquiv(__filename);

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';

const anyFileContent = 'any file content \n\n';

const setUser = (user) => {
    config.authUid = user.authUid;
    config.authName = user.authName;
    config.authUin = user.authUin;
};

const mockStudents = [
    {authUid: 'student1', authName: 'Student User 1', authUin: '00000001'},
    {authUid: 'student2', authName: 'Student User 2', authUin: '00000002'},
    {authUid: 'student3', authName: 'Student User 3', authUin: '00000003'},
    {authUid: 'student4', authName: 'Student User 4', authUin: '00000004'},
];

const getFileUploadSuffix = ($instanceQuestionPage) => {
    return $instanceQuestionPage('input[name^=_file_upload]').attr('name');
};

/**
 * Acts as 'save' or 'save and grade' button click on student instance question page.
 * @param {string} instanceQuestionUrl the instance question url the student is answering the question on.
 * @param {object} payload json data structure type formed on the basis of the question
 * @param {string} 'save' or 'grade' enums
 */
 const saveOrGrade = async (instanceQuestionUrl, payload, action, fileData) => {
    const $instanceQuestionPage = cheerio.load(await (await fetch(instanceQuestionUrl)).text());
    const token = $instanceQuestionPage('form > input[name="__csrf_token"]').val();
    const variantId = $instanceQuestionPage('form > input[name="__variant_id"]').val();

    // handles case where __variant_id should exist inside postData on only some instance questions submissions
    if (payload && payload.postData) {
        payload.postData = JSON.parse(payload.postData);
        payload.postData.variant.id = variantId;
        payload.postData = JSON.stringify(payload.postData);
    }

    const uploadSuffix = getFileUploadSuffix($instanceQuestionPage);

    return fetch(instanceQuestionUrl, {
        method: 'POST',
        headers: {'Content-type': 'application/x-www-form-urlencoded'},
        body: [
            '__variant_id=' + variantId,
            '__action=' + action,
            '__csrf_token=' + token,
            fileData ? uploadSuffix + '=' + encodeURIComponent(JSON.stringify(fileData)) : '',
            querystring.encode(payload),
        ].join('&'),
    });
};

const loadHomeworkPage = async (user) => {
    setUser(user);
    const studentCourseInstanceUrl = baseUrl + '/course_instance/1';
    let hm1AutomaticTestSuiteUrl = null;
    const courseInstanceBody = await (await fetch(studentCourseInstanceUrl)).text();
    const $courseInstancePage = cheerio.load(courseInstanceBody);
    hm1AutomaticTestSuiteUrl = siteUrl + $courseInstancePage('a:contains("Homework for automatic test suite")').attr('href');
    let res = await fetch(hm1AutomaticTestSuiteUrl);
    assert.equal(res.ok, true);
    const hm1Body = await res.text();
    return hm1Body;
};

describe('Grading methods', function() {
    this.timeout(20000);

    before('set up testing server', helperServer.before());
    after('shut down testing server', helperServer.after);

    describe('infoQuestion.json `gradingMethod` single method grading (deprecated)', () => {

        it('internal grading submission can be "save and graded"', async () => {
            // so many internal graded submissions elsewhere, that we will assume this passes
        });

        // External grading occurs async, but we should expect the answer was submitted syncronously
        // TO DO: test out socket io connection if possible.

        it('external grading submission can be "save and graded"', async () => {
            const hm1Body = await loadHomeworkPage(mockStudents[0]);
            const $hm1Body = cheerio.load(hm1Body);
            const externalGradingQuestionUrl = siteUrl + $hm1Body('a:contains("HW1.13. External Grading: Fibonacci function, file upload")').attr('href');

            const gradeRes = await saveOrGrade(externalGradingQuestionUrl, {}, 'grade', [{name: 'fib.py', 'contents': Buffer.from(anyFileContent).toString('base64')}]);
            assert.equal(gradeRes.status, 200);

            const questionsPage = await gradeRes.text();
            assert.include(questionsPage, 'Submitted answer\n          \n        </span>\n        <span>\n    \n        \n            <span class="badge badge-secondary">waiting for grading</span>');
        });

        it('external grading submission can be "saved"', async () => {
            const hm1Body = await loadHomeworkPage(mockStudents[1]);
            const $hm1Body = cheerio.load(hm1Body);
            const externalGradingQuestionUrl = siteUrl + $hm1Body('a:contains("HW1.13. External Grading: Fibonacci function, file upload")').attr('href');

            const saveRes = await saveOrGrade(externalGradingQuestionUrl, {}, 'save', 
                [{name: 'fib.py', 'contents': Buffer.from(anyFileContent).toString('base64')}],
            );
            assert.equal(saveRes.status, 200);

            const questionsPage = await saveRes.text();
            assert.include(questionsPage, 'Submitted answer\n          \n        </span>\n        <span>\n    \n        \n            <span class="badge badge-info">saved, not graded</span>');
        });

        it('manual grading submission can be "saved"', async () => {
            const hm1Body = await loadHomeworkPage(mockStudents[1]);
            const $hm1Body = cheerio.load(hm1Body);
            const externalGradingQuestionUrl = siteUrl + $hm1Body('a:contains("HW1.12. Manual Grading: Fibonacci function, file upload")').attr('href');

            const saveRes = await saveOrGrade(externalGradingQuestionUrl, {}, 'save',
                [{name: 'fib.py', 'contents': Buffer.from(anyFileContent).toString('base64')}],
            );
            assert.equal(saveRes.status, 200);

            const questionsPage = await saveRes.text();
            assert.include(questionsPage, 'Submitted answer\n          \n        </span>\n        <span>\n    \n        \n            <span class="badge badge-info">saved, not graded</span>');
            });

        it('manual grading submission CANNOT be "save and graded"', async () => {
            const hm1Body = await loadHomeworkPage(mockStudents[0]);
            const $hm1Body = cheerio.load(hm1Body);
            const externalGradingQuestionUrl = siteUrl + $hm1Body('a:contains("HW1.12. Manual Grading: Fibonacci function, file upload")').attr('href');

            const saveOrGradeRes = await saveOrGrade(externalGradingQuestionUrl, {}, 'grade', [{name: 'fib.py', 'contents': Buffer.from(anyFileContent).toString('base64')}]);
            assert.equal(saveOrGradeRes.status, 500);

            const questionsPage = await saveOrGradeRes.text();

            // kind of a weird error message, but we did want an error here. May want to look into deeper.
            assert.include(questionsPage, 'grading_method is not External for submission_id');
        });

    });
});