const {assert} = require('chai');
const cheerio = require('cheerio');
const config = require('../lib/config');
const fetch = require('node-fetch');
const querystring = require('querystring');
const helperServer = require('./helperServer');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sqlDb = require('../prairielib/lib/sql-db');
const sql = sqlLoader.loadSqlEquiv(__filename);
const io = require('socket.io-client');

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const anyFileContent = 'any file content \n\n';
const defaultUser = {
    authUid: config.authUid,
    authName: config.authName,
    authUin: config.authUin,
};

let socket = null;

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

const waitForExternalGrader = async ($questionsPage, questionsPage) => {
    return new Promise((resolve, reject) => {

        try {
            socket = io.connect('http://localhost:3007/external-grading');
            socket.on('connect_error', (err) => {
                throw Error(err);
              });

            const handleStatusChange = (msg) => {
                msg.submissions.forEach(s => {
                    if (s.grading_job_status === 'graded') {
                        return resolve(msg);
                    }
                });
            };

            const variantId = $questionsPage('form > input[name="__variant_id"]').val();
            const variantTokenLine = questionsPage.match(/.*variantToken.*\n/)[0];

            let variantToken = variantTokenLine.match(/'(.*?)'/g)[0].replace("'", '');
            // hack, last ' not replaced on string
            variantToken = variantToken.substring(0, variantToken.length -1);

            socket.emit('init', {variant_id: variantId, variant_token: variantToken}, function(msg) {
                handleStatusChange(msg);
            });

            socket.on('change:status', function(msg) {
                handleStatusChange(msg);
            });
        } catch (err) {
            reject(err);
        }
    });
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

describe('Grading method(s)', function() {
    this.timeout(60000);

    let $hm1Body = null;
    let iqUrl = null;
    let gradeRes = null;
    let iqId  = null;
    let questionsPage = null;
    let $questionsPage = null;

    before('set up testing server', helperServer.before());
    after('shut down testing server', helperServer.after);

    after('reset default user', () => setUser(defaultUser));

    describe('`gradingMethod` configuration (deprecated, backwards compatible)', () => {

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
                        [{name: 'fib.py', 'contents': Buffer.from(anyFileContent).toString('base64')}],
                    );
                    assert.equal(gradeRes.status, 200);
                    questionsPage = await gradeRes.text();
                    $questionsPage = cheerio.load(questionsPage);

                    iqId = parseInstanceQuestionId(iqUrl);
                    await waitForExternalGrader($questionsPage, questionsPage);
                    // reload QuestionsPage since socket io cannot update without DOM
                    questionsPage = await (await fetch(iqUrl)).text();
                    $questionsPage =  cheerio.load(questionsPage);
                });
                after('close external grader socket', () => socket.close());

                it('should result in 1 grading jobs', async () => {
                    const grading_jobs = (await sqlDb.queryAsync(sql.get_grading_jobs_by_iq, {iqId})).rows;
                    assert.lengthOf(grading_jobs, 1);
                });
                it('should result in 1 "pastsubmission-block" component being rendered', () => {
                    assert.lengthOf($questionsPage('.pastsubmission-block'), 1);
                });
                it('should be given submission grade in "pastsubmission-block"', async () => {
                    assert.include(questionsPage, '<td>Awarded points:</td>\n          <td>\n\n\n<span class="badge badge-danger">\n\n0/6\n</span>');
                });
                it('should result in 1 "grading-block" component being rendered', () => {
                    assert.lengthOf($questionsPage('.grading-block'), 0);
                });
            });
            describe('"save" action', () => {
                before('load page as student and submit "grade" action to "External" type question', async () => {
                    const hm1Body = await loadHomeworkPage(mockStudents[1]);
                    $hm1Body = cheerio.load(hm1Body);
                    iqUrl = siteUrl + $hm1Body('a:contains("HW9.3. External Grading: Fibonacci function, file upload")').attr('href');
                    
                    gradeRes = await saveOrGrade(iqUrl, {}, 'save',
                        [{name: 'fib.py', 'contents': Buffer.from(anyFileContent).toString('base64')}],
                    );
                    assert.equal(gradeRes.status, 200);

                    questionsPage = await gradeRes.text();
                    $questionsPage = cheerio.load(questionsPage);

                    iqId = parseInstanceQuestionId(iqUrl);
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
    });
    
    describe('`gradingMethods` configuration (replaces `gradingMethod` implementation)', () => {
        describe('Internal, External, Manual combination', () => {
            describe('"save" action', () => {
                before('load page and post internal + external submission', async () => {
                    const hm1Body = await loadHomeworkPage(mockStudents[0]);
                    $hm1Body = cheerio.load(hm1Body);
                    iqUrl = siteUrl + $hm1Body('a:contains("HW9.4. Internal, External, Manual: Addition internal, code upload external, code upload manual grade")').attr('href');
    
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
            describe('"grade" action', () => {
                before('load page and post internal + external submission', async () => {
                    const hm1Body = await loadHomeworkPage(mockStudents[1]);
                    $hm1Body = cheerio.load(hm1Body);
                    iqUrl = siteUrl + $hm1Body('a:contains("HW9.4. Internal, External, Manual: Addition internal, code upload external, code upload manual grade")').attr('href');
    
                    // open page to produce variant because we want to get the correct answer
                    await fetch(iqUrl);
                    // get variant params
                    iqId = parseInstanceQuestionId(iqUrl);
                    const variant = (await sqlDb.queryOneRowAsync(sql.get_variant_by_iq, {iqId})).rows[0];
            
                    gradeRes = await saveOrGrade(iqUrl, {c: variant.params.a + variant.params.b}, 'grade', [{name: 'fib.py', 'contents': Buffer.from(anyFileContent).toString('base64')}]);
                    assert.equal(gradeRes.status, 200);
    
                    questionsPage = await gradeRes.text();
                    $questionsPage = cheerio.load(questionsPage);

                    await waitForExternalGrader($questionsPage, questionsPage);

                    // reload QuestionsPage since socket io cannot update without DOM
                    questionsPage = await (await fetch(iqUrl)).text();
                    $questionsPage =  cheerio.load(questionsPage);
                });
                it('should result in 3 grading jobs', async () => {
                    const grading_jobs = (await sqlDb.queryAsync(sql.get_grading_jobs_by_iq, {iqId})).rows;
                    assert.lengthOf(grading_jobs, 3);
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

            // TO DO: 
            // Cases: 
            // 1. Once Manual grading branch is merged, endpoint will trigger manual grading job. Thus, we should expect prior tests configured with all grading modes to produce 2 grading jobs automatically
            // and 1 grading job manually.
            // 2. Gather requirements for what the panels should display.
            // 3. Ensure that internal grading jobs complete before external grading jobs
            //    a. so results can be injected into external grading container.
            //    b. so internal grading results are not necessarily overwritten in submission score value, if we do not implement another spot for this score.

        // Behind the scenes, each gradingMethod enabled for a question will produce a grading job respectively. Ie. If grading_methods = ['internal', 'external', 'manual'], 
        // then 3x grading_jobs are produced for each submission.

        // ***Future 'gradingMethods' multiple grading methods type***
        //
        // grading-block component
        // Instead of showing one correct answer, it should show the correct answer available for each grading method
        // that has available scores on view render.
        // |------------------------------------------------------------------------------------------------|
        // |Correct Answer Internal - Whatever is computed to be answer in internal grading                 |
        // |Correct Answer External (optional) - Should be dispalyed based on nature external question      |
        // |Submitted answer manual (optional or not needed) - Whatever the faculty/TA feedback to the student is         |
        // |-------------------------------------------------------------------------------------------------

        // 'pastsubmission-block' component:
        // Past submission block should show past submission and available correct answers for last 5 submissions.
        // |----------------------------------------------------------------------------------------
        // |Submitted answer internal - ie. addNumbers                                              |
        // |Submitted answer external - ie. codeUpload editor to support internal answer            |
        // |Submitted answer manual - ie. codeUpload editor reused to be manually graded for syntax |
        // |----------------------------------------------------------------------------------------

        });

    
    });
});