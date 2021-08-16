const {assert} = require('chai');
const cheerio = require('cheerio');
const config = require('../lib/config');
const fetch = require('node-fetch');
const fs = require('fs');
const querystring = require('querystring');
const helperServer = require('./helperServer');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sqlDb = require('../prairielib/lib/sql-db');
const sql = sqlLoader.loadSqlEquiv(__filename);

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const anyFileContent = 'any file content \n\n';
const defaultUser = {
    authUid: config.authUid,
    authName: config.authName,
    authUin: config.authUin,
};

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

const parseInstanceQuestionId = (url) => {
    const iqId = parseInt(
        url.match(/instance_question\/(\d+)/)[1],
    );
    assert.isNumber(iqId);
    return iqId;
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

/**
 * @param {object} student or instructor user to load page by 
 * @returns string Returns "Homework for Internal, External, Manual grading methods" page text
 */
const loadHomeworkPage = async (user) => {
    setUser(user);
    const studentCourseInstanceUrl = baseUrl + '/course_instance/1';
    let hm9InternalExternalManaulUrl = null;
    const courseInstanceBody = await (await fetch(studentCourseInstanceUrl)).text();
    const $courseInstancePage = cheerio.load(courseInstanceBody);
    hm9InternalExternalManaulUrl = siteUrl + $courseInstancePage('a:contains("Homework for Internal, External, Manual grading methods")').attr('href');
    let res = await fetch(hm9InternalExternalManaulUrl);
    assert.equal(res.ok, true);
    return res.text();
};

describe('Grading methods', function() {
    this.timeout(20000);

    before('set up testing server', helperServer.before());
    after('shut down testing server', helperServer.after);

    after('reset default user', () => setUser(defaultUser));

    // want to test against new 'Homework for internal, external, manual grading methods' for internal, external, manual grading methods, as testHomework and testAssessment calculates on
    // basis of internal grading.

    // TO DO: Possibly integrate with testHomework and testAssessment with these tests, but it would be difficult to read the intended internal, manual, and external grading logic
    // because those tests are already very complex. Hence, a new file here.

    describe('single grading method on question `gradingMethod` (TO BE DEPRECATED)', () => {
        let $hm1Body = null;
        let iqUrl = null;
        let gradeRes = null;
        let iqId  = null;
        let questionsPage = null;
        let $questionsPage = null;
        describe('"Internal"', () => {
            describe('"grade" action', () => {
                before('load page as student and submit "grade" action to "Internal" type question', async () => {
                    const hm1Body = await loadHomeworkPage(mockStudents[0]);
                    $hm1Body = cheerio.load(hm1Body);
                    iqUrl = siteUrl + $hm1Body('a:contains("HW9.1. Internal Grading: Adding two numbers")').attr('href');

                    // open page to produce variant because we want to get the correct answer
                    await fetch(iqUrl);
                    // get variant params
                    iqId = parseInstanceQuestionId(iqUrl);
                    const variant = (await sqlDb.queryOneRowAsync(sql.get_variant_by_iq, {iqId})).rows[0];
            
                    gradeRes = await saveOrGrade(iqUrl, {c: variant.params.a + variant.params.b}, 'grade');
                    assert.equal(gradeRes.status, 200);

                    questionsPage = await gradeRes.text();
                    $questionsPage = cheerio.load(questionsPage);
                });
                it('should result in 1 grading jobs', async () => {
                    const grading_jobs = (await sqlDb.queryAsync(sql.get_grading_jobs_by_iq, {iqId})).rows;
                    assert.lengthOf(grading_jobs, 1);
                });
                it('should result in 1 "pastsubmission-block" component being rendered', () => {
                    assert.lengthOf($questionsPage('.pastsubmission-block'), 1);
                });
                it('should be given submission grade in "pastsubmission-block"', async () => {
                    assert.include(questionsPage, 'Submitted answer\n          \n        </span>\n        <span>\n    \n        <span class="badge badge-success">correct: 100%</span>');
                });
                it('should result in 1 "grading-block" component being rendered', () => {
                    assert.lengthOf($questionsPage('.grading-block'), 1);
                });
            });
            describe('"save" action', () => {
                before('load page as student and submit "save" action to "Internal" type question', async () => {
                    const hm1Body = await loadHomeworkPage(mockStudents[1]);
                    $hm1Body = cheerio.load(hm1Body);
                    iqUrl = siteUrl + $hm1Body('a:contains("HW9.1. Internal Grading: Adding two numbers")').attr('href');

                    // open page to produce variant because we want to get the correct answer
                    await fetch(iqUrl);
                    // get variant params
                    iqId = parseInstanceQuestionId(iqUrl);
                    const variant = (await sqlDb.queryOneRowAsync(sql.get_variant_by_iq, {iqId})).rows[0];
            
                    gradeRes = await saveOrGrade(iqUrl, {c: variant.params.a + variant.params.b}, 'save');
                    assert.equal(gradeRes.status, 200);

                    questionsPage = await gradeRes.text();
                    $questionsPage = cheerio.load(questionsPage);
                });
                it('should NOT result in any grading jobs', async () => {
                    const grading_jobs = (await sqlDb.queryAsync(sql.get_grading_jobs_by_iq, {iqId})).rows;
                    assert.lengthOf(grading_jobs, 0);
                });
                it('should result in 1 "pastsubmission-block" component being rendered', () => {
                    assert.lengthOf($questionsPage('.pastsubmission-block'), 1);
                });
                it('should NOT be given submission grade in "pastsubmission-block"', async () => {
                    assert.notInclude(questionsPage, 'Submitted answer\n          \n        </span>\n        <span>\n    \n        <span class="badge badge-success">correct: 100%</span>');
                });
                it('should NOT result in "grading-block" component being rendered', () => {
                    assert.lengthOf($questionsPage('.grading-block'), 0);
                });
            });
        });

        describe('"Manual"', () => {
            describe('"grade" action', () => {
                before('load page as student and submit "grade" action to "Manual" type question', async () => {
                    const hm1Body = await loadHomeworkPage(mockStudents[0]);
                    $hm1Body = cheerio.load(hm1Body);
                    iqUrl = siteUrl + $hm1Body('a:contains("HW9.2. Manual Grading: Fibonacci function, file upload")').attr('href');
                });
                it('should NOT be possible to submit a grade action to "Manual" type question', async () => {
                    gradeRes = await saveOrGrade(iqUrl, {}, 'grade',
                        [{name: 'fib.py', 'contents': Buffer.from(anyFileContent).toString('base64')}],
                    );
                    assert.equal(gradeRes.status, 500);
                });
                it('should NOT result in any grading jobs', async () => {
                    const grading_jobs = (await sqlDb.queryAsync(sql.get_grading_jobs_by_iq, {iqId})).rows;
                    assert.lengthOf(grading_jobs, 0);
                });
                it('should result in 1 "pastsubmission-block" component being rendered', async () => {
                    questionsPage = await gradeRes.text();
                    $questionsPage = cheerio.load(questionsPage);
                    assert.lengthOf($questionsPage('.pastsubmission-block'), 0);
                });
                it('should NOT be given submission grade in "pastsubmission-block"', async () => {
                    assert.notInclude(questionsPage, 'Submitted answer\n          \n        </span>\n        <span>\n    \n        <span class="badge badge-success">correct: 100%</span>');
                });
                it('should NOT result in "grading-block" component being rendered', () => {
                    assert.lengthOf($questionsPage('.grading-block'), 0);
                });
            });
            describe('"save" action', () => {
                before('load page as student and submit "grade" action to "Manual" type question', async () => {
                    const hm1Body = await loadHomeworkPage(mockStudents[0]);
                    $hm1Body = cheerio.load(hm1Body);
                    iqUrl = siteUrl + $hm1Body('a:contains("HW9.2. Manual Grading: Fibonacci function, file upload")').attr('href');
                });
                it('should be possible to submit a save action to "Manual" type question', async () => {
                    gradeRes = await saveOrGrade(iqUrl, {}, 'save',
                        [{name: 'fib.py', 'contents': Buffer.from(anyFileContent).toString('base64')}],
                    );
                    assert.equal(gradeRes.status, 200);
                });
                it('should NOT result in any grading jobs', async () => {
                    const grading_jobs = (await sqlDb.queryAsync(sql.get_grading_jobs_by_iq, {iqId})).rows;
                    assert.lengthOf(grading_jobs, 0);
                });
                it('should result in 1 "pastsubmission-block" component being rendered', async () => {
                    questionsPage = await gradeRes.text();
                    $questionsPage = cheerio.load(questionsPage);
                    assert.lengthOf($questionsPage('.pastsubmission-block'), 1);
                });
                it('should NOT be given submission grade in "pastsubmission-block"', async () => {
                    assert.notInclude(questionsPage, 'Submitted answer\n          \n        </span>\n        <span>\n    \n        <span class="badge badge-success">correct: 100%</span>');
                });
                it('should NOT result in "grading-block" component being rendered', () => {
                    assert.lengthOf($questionsPage('.grading-block'), 0);
                });
            });
        });

        describe('"External"', () => {
            describe('"grade" action', () => {
                before('load page as student and submit "grade" action to "External" type question', async () => {
                    const hm1Body = await loadHomeworkPage(mockStudents[0]);
                    $hm1Body = cheerio.load(hm1Body);
                    iqUrl = siteUrl + $hm1Body('a:contains("HW9.3. External Grading: Fibonacci function, file upload")').attr('href');
            
                    gradeRes = await saveOrGrade(iqUrl, {}, 'grade',
                        [{name: 'fib.py', 'contents': Buffer.from(anyFileContent).toString('base64')}]
                    );
                    assert.equal(gradeRes.status, 200);

                    questionsPage = await gradeRes.text();
                    $questionsPage = cheerio.load(questionsPage);
                });
                it('should result in 1 grading jobs', async () => {
                    const grading_jobs = (await sqlDb.queryAsync(sql.get_grading_jobs_by_iq, {iqId})).rows;
                    assert.lengthOf(grading_jobs, 1);
                });
                it('should result in 1 "pastsubmission-block" component being rendered', () => {
                    assert.lengthOf($questionsPage('.pastsubmission-block'), 1);
                });
                it('should be given submission grade in "pastsubmission-block"', async () => {
                    assert.include(questionsPage, 'Submitted answer\n          \n        </span>\n        <span>\n    \n        <span class="badge badge-success">correct: 100%</span>');
                });
                it('should result in 1 "grading-block" component being rendered', () => {
                    assert.lengthOf($questionsPage('.grading-block'), 1);
                });
            });
            describe('"save" action', () => {
                before('load page as student and submit "grade" action to "External" type question', async () => {
                    const hm1Body = await loadHomeworkPage(mockStudents[0]);
                    $hm1Body = cheerio.load(hm1Body);
                    iqUrl = siteUrl + $hm1Body('a:contains("HW9.3. External Grading: Fibonacci function, file upload")').attr('href');
            
                    gradeRes = await saveOrGrade(iqUrl, {}, 'save',
                        [{name: 'fib.py', 'contents': Buffer.from(anyFileContent).toString('base64')}]
                    );
                    assert.equal(gradeRes.status, 200);

                    questionsPage = await gradeRes.text();
                    $questionsPage = cheerio.load(questionsPage);
                });
                it('should NOT result in any grading jobs', async () => {
                    const grading_jobs = (await sqlDb.queryAsync(sql.get_grading_jobs_by_iq, {iqId})).rows;
                    assert.lengthOf(grading_jobs, 0);
                });
                it('should result in 1 "pastsubmission-block" component being rendered', () => {
                    assert.lengthOf($questionsPage('.pastsubmission-block'), 1);
                });
                it('should NOT be given submission grade in "pastsubmission-block"', async () => {
                    assert.notInclude(questionsPage, 'Submitted answer\n          \n        </span>\n        <span>\n    \n        <span class="badge badge-success">correct: 100%</span>');
                });
                it('should NOT result in "grading-block" component being rendered', () => {
                    assert.lengthOf($questionsPage('.grading-block'), 0);
                });
            });
        });

        // External grading occurs async, but we should expect the answer was submitted syncronously
        // TO DO: test out socket io connection if possible.

        // it('external grading submission can be "save and graded"', async () => {
        //     const hm1Body = await loadHomeworkPage(mockStudents[0]);
        //     const $hm1Body = cheerio.load(hm1Body);
        //     const iqUrl = siteUrl + $hm1Body('a:contains("HW9.3. External Grading: Fibonacci function, file upload")').attr('href');

        //     const gradeRes = await saveOrGrade(iqUrl, {}, 'grade',
        //         [{name: 'fib.py', 'contents': Buffer.from(anyFileContent).toString('base64')}],
        //     );
        //     assert.equal(gradeRes.status, 200);

        //     const iqId = parseInstanceQuestionId(iqUrl);
        //     const grading_jobs = (await sqlDb.queryAsync(sql.get_grading_jobs_by_iq, {iqId})).rows;
        //     assert.lengthOf(grading_jobs, 1);

        //     const questionsPage = await gradeRes.text();
        //     assert.include(questionsPage, 'Submitted answer\n          \n        </span>\n        <span>\n    \n        \n            <span class="badge badge-secondary">waiting for grading</span>');
        // });

        // it('external grading submission can be "saved"', async () => {
        //     const hm1Body = await loadHomeworkPage(mockStudents[1]);
        //     const $hm1Body = cheerio.load(hm1Body);
        //     const iqUrl = siteUrl + $hm1Body('a:contains("HW9.3. External Grading: Fibonacci function, file upload")').attr('href');

            
        //     const saveRes = await saveOrGrade(iqUrl, {}, 'save', 
        //         [{name: 'fib.py', 'contents': Buffer.from(anyFileContent).toString('base64')}],
        //     );
        //     assert.equal(saveRes.status, 200);

        //     const iqId = parseInstanceQuestionId(iqUrl);
        //     const grading_jobs = (await sqlDb.queryAsync(sql.get_grading_jobs_by_iq, {iqId})).rows;
        //     assert.lengthOf(grading_jobs, 0);

        //     const questionsPage = await saveRes.text();
        //     assert.include(questionsPage, 'Submitted answer\n          \n        </span>\n        <span>\n    \n        \n            <span class="badge badge-info">saved, not graded</span>');
        // });

        // it('manual grading submission can be "saved"', async () => {
        //     const hm1Body = await loadHomeworkPage(mockStudents[1]);
        //     const $hm1Body = cheerio.load(hm1Body);
        //     const iqUrl = siteUrl + $hm1Body('a:contains("HW9.2. Manual Grading: Fibonacci function, file upload")').attr('href');

        //     const saveRes = await saveOrGrade(iqUrl, {}, 'save',
        //         [{name: 'fib.py', 'contents': Buffer.from(anyFileContent).toString('base64')}],
        //     );
        //     assert.equal(saveRes.status, 200);

        //     const iqId = parseInstanceQuestionId(iqUrl);
        //     const grading_jobs = (await sqlDb.queryAsync(sql.get_grading_jobs_by_iq, {iqId})).rows;
        //     assert.lengthOf(grading_jobs, 0);

        //     const questionsPage = await saveRes.text();
        //     assert.include(questionsPage, 'Submitted answer\n          \n        </span>\n        <span>\n    \n        \n            <span class="badge badge-info">saved, not graded</span>');
        //     });

        // it('manual grading submission CANNOT be "save and graded"', async () => {
        //     const hm1Body = await loadHomeworkPage(mockStudents[0]);
        //     const $hm1Body = cheerio.load(hm1Body);
        //     const iqUrl = siteUrl + $hm1Body('a:contains("HW9.2. Manual Grading: Fibonacci function, file upload")').attr('href');

        //     const saveOrGradeRes = await saveOrGrade(iqUrl, {}, 'grade',
        //         [{name: 'fib.py', 'contents': Buffer.from(anyFileContent).toString('base64')}],
        //     );
        //     assert.equal(saveOrGradeRes.status, 500);

        //     const iqId = parseInstanceQuestionId(iqUrl);
        //     const grading_jobs = (await sqlDb.queryAsync(sql.get_grading_jobs_by_iq, {iqId})).rows;
        //     assert.lengthOf(grading_jobs, 0);

        //     const questionsPage = await saveOrGradeRes.text();

        //     // kind of a weird error message, but we did want an error here. This error should be manual specific on manual grading branch.
        //     assert.include(questionsPage, 'grading_method is not External for submission_id');
        // });
    });
    describe('multiple grading methods configured on `gradingMethods` property (TO BECOME ACTIVE)', () => {
        // IMPORTANT: We can only test that the front-end view displays the correct answer for a single grading_job grading_method configuration
        // until we have a way to display all grading_jobs produced per a submission within the 'grading-block' and 'pastsubmission-block' components.

        // Behind the scenes, each gradingMethod enabled for a question will produce a grading job respectively. Ie. If grading_methods = ['internal', 'external', 'manual'], 
        // then 3x grading_jobs are produced for each submission.

        // ***Current 'gradingMethod' single grading method type***
        //

        // ***Future 'gradingMethods' multiple grading methods type***
        //
        // grading-block component
        // |------------------------------------------------------------------------------------------------|
        // |Correct Answer Internal - Whatever is computed to be answer in internal grading                 |
        // |Correct Answer External (optional) - Should be dispalyed based on nature external question      |
        // |Submitted answer manual (optional or not needed) - Whatever the faculty/TA feedback to the student is         |
        // |-------------------------------------------------------------------------------------------------

        // 'pastsubmission-block' component:
        // |----------------------------------------------------------------------------------------
        // |Submitted answer internal - ie. addNumbers                                              |
        // |Submitted answer external - ie. codeUpload editor to support internal answer            |
        // |Submitted answer manual - ie. codeUpload editor reused to be manually graded for syntax |
        // |----------------------------------------------------------------------------------------


        // const gradingMethods = ['Internal', 'External', 'Manual'];

        it('"Internal" grading method combinations', () => {
            // want to use the original gradingMethod original.
            // we would always expect to see an 'Internal' past submission block with each additional configured possibility
        });
        it('"External" grading method combinations', () => {
            // we would always expect to see an 'External' past submission block with each additional configured possibility
        });
        it('"Manual" grading method combinations', () => {
            // we would always expect to see an 'Manual' past submission block with each additional configured possibility
        });
    });
});