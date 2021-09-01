const {assert, expect} = require('chai');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const querystring = require('querystring');
const config = require('../lib/config');
const helperServer = require('./helperServer');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sqlDb = require('../prairielib/lib/sql-db');
const sql = sqlLoader.loadSqlEquiv(__filename);

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';

const mockStudents = [
    {authUid: 'student1', authName: 'Student User 1', authUin: '00000001'},
    {authUid: 'student2', authName: 'Student User 2', authUin: '00000002'},
    {authUid: 'student3', authName: 'Student User 3', authUin: '00000003'},
    {authUid: 'student4', authName: 'Student User 4', authUin: '00000004'},
];

const defaultUser = {authUid: config.authUid, authName: config.authName, authUin: config.authUin}; // test suite default
const mockInstructors = [
    {authUid: 'instructor1@illinois.edu', authName: 'Instructor 1', authUin: '11111111'},
    {authUid: 'instructor2@illinois.edu', authName: 'Instructor 2', authUin: '22222222'},
];

const parseInstanceQuestionId = (url) => {
    const iqId = parseInt(
        url.match(/instance_question\/(\d+)/)[1],
    );
    assert.isNumber(iqId);
    return iqId;
};

const setUser = (user) => {
    config.authUid = user.authUid;
    config.authName = user.authName;
    config.authUin = user.authUin;
};

/**
 * Scrapes instructorQuestionManualGrading.ejs to make payload for POST 'add_manual_grade' action.
 * @param {object} $page Cheerio wrapped instance question manual grading page
 * @param {string} submissionNote Grading message instructor wants student to see.
 * @param {number} submissionScore Percentage below 100 divisible by 5.
 * @returns {object} json payload to send to endpoint
 */
const getManualGradePayload = ($page, submissionNote, submissionScore) => {
    return {
        instanceQuestionModifiedAt: $page('form > input[name="instanceQuestionModifiedAt"]').val(),
        __csrf_token: $page('form > input[name="__csrf_token"]').val(),
        __action: $page('form > div > button[name="__action"]').attr('value'),
        assessmentId: $page('form > input[name="assessmentId"]').val(),
        assessmentQuestionId: $page('form > input[name="assessmentQuestionId"]').val(),
        submissionNote,
        submissionScore,
    };
};

/**
 * Scrapes instructorQuestionManualGrading.ejs page to make payload for POST 'resolve_manual_grading_conflict' action.
 * 'Current' or 'Incoming' option takes current grade reflected for student or incoming grade that caused conflict.
 * @param {object} $page Cheerio wrapped instance question manual grading page
 * @param {string} type 'Current' or 'Incoming' enums.
 * @returns {object} json payload to send to endpoint
 */
const getConflictPayload = ($page, type) => {
    const wildcard = `${type} Grade`;
    return {
        submissionScore: $page(`div:contains("${wildcard}") > form input[name="submissionScore"]`).val(),
        submissionNote: $page(`div:contains("${wildcard}") > form textarea[name="submissionNote"]`).val(),
        instanceQuestionModifiedAt: $page(`div:contains("${wildcard}") > form > input[name="instanceQuestionModifiedAt"]`).val(),
        __csrf_token: $page(`div:contains("${wildcard}") > form > input[name="__csrf_token"]`).val(),
        __action: $page(`div:contains("${wildcard}") > form > div > button[name="__action"]`).attr('value'),
        assessmentId: $page(`div:contains("${wildcard}") > form > input[name="assessmentId"]`).val(),
        assessmentQuestionId: $page(`div:contains("${wildcard}") > form > input[name="assessmentQuestionId"]`).val(),

        // These only appear on conflict resolutions
        gradingJobId: $page(`div:contains("${wildcard}") > form > div > input[name="gradingJobId"]`).val(),
        conflictDataSource: $page(`div:contains("${wildcard}") > form > div > input[name="conflictDataSource"]`).val(),
    };
};

/**
 * Acts as 'save' or 'save and grade' button click on student instance question page.
 * @param {string} instanceQuestionUrl the instance question url the student is answering the question on.
 * @param {object} payload json data structure type formed on the basis of the question
 * @param {string} 'save' or 'grade' enums
 */
 let saveOrGrade = async (instanceQuestionUrl, payload, action) => {
    const $instanceQuestionPage = cheerio.load(await (await fetch(instanceQuestionUrl)).text());
    const token = $instanceQuestionPage('form > input[name="__csrf_token"]').val();
    const variantId = $instanceQuestionPage('form > input[name="__variant_id"]').val();

    // handles case where __variant_id should exist inside postData on only some instance questions submissions
    if (payload && payload.postData) {
        payload.postData = JSON.parse(payload.postData);
        payload.postData.variant.id = variantId;
        payload.postData = JSON.stringify(payload.postData);
    }

    const res = await fetch(instanceQuestionUrl, {
        method: 'POST',
        headers: {'Content-type': 'application/x-www-form-urlencoded'},
        body: [
            '__variant_id=' + variantId,
            '__action=' + action,
            '__csrf_token=' + token,
            querystring.encode(payload),
        ].join('&'),
    });
    assert.equal(res.status, 200);
};

const gradeSubmission = async (iqManualGradeUrl, submissionNote, submissionScore) => {
    const $gradingPage = cheerio.load(
        await (await fetch(iqManualGradeUrl)).text(),
    );
    const payload = getManualGradePayload($gradingPage, submissionNote, submissionScore);

    return fetch(iqManualGradeUrl, {
            method: 'POST',
            headers: {'Content-type': 'application/x-www-form-urlencoded'},
            body: querystring.encode(payload),
        });
};

const createGradingConflict = async (iqManualGradingUrl) => {
    // instructor 1 loads page for grading
    setUser(mockInstructors[0]);
    const iqManualGradingBody1 = await (await fetch(iqManualGradingUrl)).text();
    const $iqManualGradingPage1 = cheerio.load(iqManualGradingBody1);

    // instructor 2 loads page for grading
    setUser(mockInstructors[1]);
    const iqManualGradingBody2 = await (await fetch(iqManualGradingUrl)).text();
    const $iqManualGradingPage2 = cheerio.load(iqManualGradingBody2);

    const payload1 = getManualGradePayload($iqManualGradingPage1, 'Any message first grading job', 5);
    const payload2 = getManualGradePayload($iqManualGradingPage2, 'Any message second grading job', 95);

    // instructor 1 submits a grade
    setUser(mockInstructors[0]);
    const submission1 = await fetch(iqManualGradingUrl, {
        method: 'POST',
        headers: {'Content-type': 'application/x-www-form-urlencoded'},
        body: querystring.encode(payload1),
    });

    // instructor 2 submits a grade
    setUser(mockInstructors[1]);
    const submission2 = await fetch(iqManualGradingUrl, {
        method: 'POST',
        headers: {'Content-type': 'application/x-www-form-urlencoded'},
        body: querystring.encode(payload2),
    });

    return {submission1, submission2};
};

const testManualGradingAction = (action) => {
    describe(`Manual grading: '${action}' action type`, function() {
        this.timeout(20000);

        before('set up testing server', helperServer.before());
        after('shut down testing server', helperServer.after);

        before('set any student as default user role', () => setUser(mockStudents[0]));
        after('reset to default instructor user', () => setUser(defaultUser));

        before('create instructors and students', async () => {
            const users = mockInstructors.concat(mockStudents);
            for (const user of users) {
                setUser(user);
                await fetch(baseUrl);
            }
            await sqlDb.callOneRowAsync('course_permissions_insert_by_user_uid', [1, mockInstructors[0].authUid, 'Owner', 2]);
            await sqlDb.callOneRowAsync('course_permissions_insert_by_user_uid', [1, mockInstructors[1].authUid, 'Owner', 3]);
            await sqlDb.callOneRowAsync('course_instance_permissions_insert', [1, 2, 1, 'Student Data Viewer', 2]);
            await sqlDb.callOneRowAsync('course_instance_permissions_insert', [1, 3, 1, 'Student Data Viewer', 3]);
        });

        describe('student role: saving student submissions', () => {
            const studentCourseInstanceUrl = baseUrl + '/course_instance/1';
            let hm1AutomaticTestSuiteUrl = null;

            before('fetch student "HW1: Homework for automatic test suite" URL', async () => {
                const courseInstanceBody = await (await fetch(studentCourseInstanceUrl)).text();
                const $courseInstancePage = cheerio.load(courseInstanceBody);
                hm1AutomaticTestSuiteUrl = siteUrl + $courseInstancePage('a:contains("Homework for automatic test suite")').attr('href');
            });

            it('students should be able to save submissions on instance questions', async () => {
                // 'save' or 'grade' 1 answer for each question for each mock students; 1 x 4 x 3 = 12 submissions
                for await(const student of mockStudents) {
                    setUser(student);

                    const res = await fetch(hm1AutomaticTestSuiteUrl);
                    assert.equal(res.ok, true);

                    const hm1Body = await res.text();
                    assert.isString(hm1Body);

                    assert.include(hm1Body, 'HW1.1. Add two numbers');
                    assert.include(hm1Body, 'HW1.2. Addition of vectors in Cartesian coordinates');
                    assert.include(hm1Body, 'HW1.3. Advantages of fossil fuels (radio)');

                    const $hm1Body = cheerio.load(hm1Body);
                    const hm1AddTwoNumbersUrl = siteUrl + $hm1Body('a:contains("HW1.1. Add two numbers")').attr('href');
                    const hm1AddVectorsCartesianUrl = siteUrl + $hm1Body('a:contains("HW1.2. Addition of vectors in Cartesian coordinates")').attr('href');
                    const hm1AdvantagesFossilFuelsUrl = siteUrl + $hm1Body('a:contains("HW1.3. Advantages of fossil fuels (radio)")').attr('href');

                    await saveOrGrade(hm1AddTwoNumbersUrl, {c: 9999999}, action);
                    await saveOrGrade(hm1AddVectorsCartesianUrl, {
                        postData: JSON.stringify({
                            submittedAnswer: { wx: '999999', wy: '999999' },
                            variant: { id: null },
                        },
                        ),
                    }, action);
                    await saveOrGrade(hm1AdvantagesFossilFuelsUrl, {
                        postData: JSON.stringify(
                            {
                                variant: { id: null },
                                submittedAnswer: { key: 'c' },
                            },
                        ),
                    }, action);
                }
            });
            it('db should contain 12 submissions (1 per question for each 4 students x 3 questions = 12 submissions)', async () => {
                const context = await sqlDb.queryAsync(sql.get_all_submissions, []);
                const groupedByStudent = {};

                context.rows.forEach((submission) => {
                    if (!groupedByStudent[submission.auth_user_id]) {groupedByStudent[submission.auth_user_id] = [];}
                    groupedByStudent[submission.auth_user_id].push(submission);
                });

                assert.equal(context.rowCount, 12);
                assert.lengthOf(Object.keys(groupedByStudent), 4);
                Object.keys(groupedByStudent).forEach((student) => assert.lengthOf(groupedByStudent[student], 3, 'array has length of 3'));
            });
        });

        describe('instructor role: grading student submissions', () => {
            let $addNumbersRow = null;
            let $addVectorsRow = null;
            let $fossilFuelsRow = null;
            let gradingConflictUrl = null;
            let manualGradingUrl = null;
            let manualGradingWarningUrl = null;

            beforeEach('set instructor user role', () => setUser(mockInstructors[0]));
            beforeEach('load manual grading page URL and get testing question rows', async () => {
                const instructorCourseInstanceUrl = baseUrl + '/course_instance/1/instructor/instance_admin/assessments';
                const instructorCourseInstanceBody = await (await fetch(instructorCourseInstanceUrl)).text();

                manualGradingUrl = siteUrl + cheerio.load(instructorCourseInstanceBody)('a:contains("Homework for automatic test suite")').attr('href') + 'manual_grading';
                const manualGradingBody = await (await fetch(manualGradingUrl)).text();
                const $manualGradingPage = cheerio.load(manualGradingBody);

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

            it('instructor role should see 12 ungraded submissions from student role tests', async () => {
                assert.equal($addNumbersRow('.ungraded-value').text(), 4);
                assert.equal($addVectorsRow('.ungraded-value').text(), 4);
                assert.equal($fossilFuelsRow('.ungraded-value').text(), 4);
                assert.equal($addNumbersRow('.graded-value').text(), 0);
                assert.equal($addVectorsRow('.graded-value').text(), 0);
                assert.equal($fossilFuelsRow('.graded-value').text(), 0);
            });
            it('instructor can see "Grade Next" option for the 3 questions with submissions', () => {
                assert.isNotNull($addNumbersRow('.grade-next-value').attr('href'));
                assert.isNotNull($addVectorsRow('.grade-next-value').attr('href'));
                assert.isNotNull($fossilFuelsRow('.grade-next-value').attr('href'));
            });
            it('instructor sees "Ungraded" and "Graded" columns increment -/+ by one for each manual grading job', async () => {
                assert.equal($fossilFuelsRow('.ungraded-value').text(), 4);
                const gradeNextFossilFuelsUrl = siteUrl + $fossilFuelsRow('.grade-next-value').attr('href');

                for (let i = 1; i <= mockStudents.length; i++) {
                    const nextPage = await fetch(gradeNextFossilFuelsUrl);
                    let $nextGradingPage = cheerio.load(
                        await (nextPage).text(),
                    );

                    const submissionScore = 55;
                    const submissionNote = 'Any note about the grade';
                    const payload = getManualGradePayload($nextGradingPage, submissionNote, submissionScore);

                    $nextGradingPage = cheerio.load(
                        await (await fetch(nextPage.url, {
                            method: 'POST',
                            headers: {'Content-type': 'application/x-www-form-urlencoded'},
                            body: querystring.encode(payload),
                        })).text(),
                    );

                    const $manualGradingPage = cheerio.load(
                        await (await fetch(manualGradingUrl)).text(),
                    );
                    $fossilFuelsRow = cheerio.load(
                        $manualGradingPage('.qid-value:contains("fossilFuelsRadio")').parent().html(),
                    );

                    const ungradedVal = parseInt($fossilFuelsRow('.ungraded-value').text());
                    const gradedVal = parseInt($fossilFuelsRow('.graded-value').text());
                    assert.equal(ungradedVal, mockStudents.length - i);
                    assert.equal(gradedVal, i);
                }
            });
            it('instructor should NOT see "Grade Next" option when "Ungraded" column is 0', () => {
                assert.isUndefined($fossilFuelsRow('.grade-next-value').attr('href'));
            });
            it('instructor(s) should appear in "Grading Contributors" column if has submitted manual grade', async () => {
                const ungradedVal = parseInt($addVectorsRow('.ungraded-value').text());
                assert.equal(ungradedVal, 4);

                const contributorsCell = $addVectorsRow('.grading-contributors-value').text();
                assert.notInclude(contributorsCell, mockInstructors[0].authUid);
                assert.notInclude(contributorsCell, mockInstructors[1].authUid);

                for (const instructor of mockInstructors) {
                    setUser(instructor);
                    const gradeNextAddVectorsUrl = siteUrl + $addVectorsRow('.grade-next-value').attr('href');
                    const iqManualGradingUrl = (await fetch(gradeNextAddVectorsUrl)).url;
                    const nextPage = await gradeSubmission(iqManualGradingUrl, 'Amazing work', '90');
                    assert.equal(nextPage.status, 200);

                    const $manualGradingPage = cheerio.load(
                        await (await fetch(manualGradingUrl)).text(),
                    );
                    $addVectorsRow = cheerio.load(
                        $manualGradingPage('.qid-value:contains("addVectors")').parent().html(),
                    );

                    const contributorsCell = $addVectorsRow('.grading-contributors-value').text().trim();
                    assert.include(contributorsCell, instructor.authUid);
                }
                const contributorUids = $addVectorsRow('.grading-contributors-value').text().trim().split(',');
                assert.lengthOf(contributorUids, 2);
            });
            it('instructor should see "currently grading" warning message when a manual grading user is already assigned/grading instance question', async () => {
                const gradeNextAddNumbersURL = siteUrl + $addNumbersRow('.grade-next-value').attr('href');

                // instructor 1 opens question for grading
                manualGradingWarningUrl = (await fetch(gradeNextAddNumbersURL)).url;

                // instructor 2 opens question for grading
                setUser(mockInstructors[1]);
                const iqManualGradingBody = await (await fetch(manualGradingWarningUrl)).text();
                assert.include(iqManualGradingBody, 'Instructor 1 (instructor1@illinois.edu) is currently grading this question');
            });
            it('instructor becomes the manual grading user when first within manual grading expiry time range', async () => {
                setUser(mockInstructors[1]);
                const instanceQuestionId = parseInstanceQuestionId(manualGradingWarningUrl);
                await sqlDb.queryAsync(sql.set_last_date_started_by_user, {
                    instanceQuestionId,
                    uid: mockInstructors[0].authUid,
                    dateTime: new Date('2999-01-01T01:00:00Z').toISOString(),
                });

                setUser(mockInstructors[0]);
                const iqManualGradingBody = await (await fetch(manualGradingWarningUrl)).text();
                assert.include(iqManualGradingBody, 'Instructor 2 (instructor2@illinois.edu) is currently grading this question');
            });
            it('instructor should get grading conflict view if another instructor submits grade to same question first (if both viewing question simaltaneously)', async () => {
                const gradeNextAddNumbersURL = siteUrl + $addNumbersRow('.grade-next-value').attr('href');
                const iqManualGradingUrl = (await fetch(gradeNextAddNumbersURL)).url;

                const {submission1, submission2} = await createGradingConflict(iqManualGradingUrl);
                gradingConflictUrl = iqManualGradingUrl;

                const instanceQuestionId = parseInstanceQuestionId(submission2.url);
                const gradingJob = (await sqlDb.queryOneRowAsync(sql.get_conflict_grading_jobs_by_iq, {id: instanceQuestionId})).rows[0];
                assert.isTrue(gradingJob.manual_grading_conflict);

                // instructor 1 sees a new question to grade
                const submission1Body = await submission1.text();
                assert.equal(submission1.status, 200);
                assert.notEqual(submission1.url, gradingConflictUrl);
                assert.include(submission1Body, 'Grading Panel');
                assert.notInclude(submission1Body, 'Current Grade');
                assert.notInclude(submission1Body, 'Incoming Grade');

                // instructor 2 redirects back to same page to resolve conflict
                const submission2Body = await submission2.text();
                assert.equal(submission2.status, 200);
                assert.include(submission2.url, gradingConflictUrl);
                assert.notInclude(submission2Body, 'Grading Panel');
                assert.include(submission2Body, 'Current Grade');
                assert.include(submission2Body, 'Incoming Grade');
                assert.include(submission2Body, 'Manual Grading Conflict: Another Grading Job Was Submitted While Grading');

                const grading_job_user = (await sqlDb.queryOneRowAsync(sql.get_grading_job_manual_grader, {gradingJobId: gradingJob.id})).rows[0];
                const auth_user = (await sqlDb.queryOneRowAsync(sql.get_user, {uid: mockInstructors[1].authUid})).rows[0];

                const $gradingConflictPage = cheerio.load(submission2Body);
                const existingGradePanelBody = $gradingConflictPage('div:contains("Current Grade")').parent().html();
                const incomingGradePanelBody = $gradingConflictPage('div:contains("Incoming Grade")').parent().html();

                // each panel draws upon different user sources
                assert.include(existingGradePanelBody, grading_job_user.uid);
                assert.include(incomingGradePanelBody, auth_user.uid);
            });
            it('instructor should be able to abort grading, which redirects to Instructor Assessment Manual Grading view', async () => {
                const gradeNextAddNumbersURL = siteUrl + $addNumbersRow('.grade-next-value').attr('href');
                const nextPage = await fetch(gradeNextAddNumbersURL);
                const $nextPage = cheerio.load(await nextPage.text());

                const abortRedirect = await fetch(nextPage.url, {
                    method: 'POST',
                    headers: {'Content-type': 'application/x-www-form-urlencoded'},
                    body: querystring.encode({
                        __csrf_token: $nextPage('form > input[name="__csrf_token"]').val(),
                        __action: 'abort_manual_grading',
                    }),
                });

                assert.equal(abortRedirect.url, manualGradingUrl);
            });
            it('instructor should get 500 error when invalid score or note payloads are given when adding manual grade', async () => {
                const gradeNextAddNumbersURL = siteUrl + $addNumbersRow('.grade-next-value').attr('href');
                const nextPage = await fetch(gradeNextAddNumbersURL);
                const $nextPage = cheerio.load(await nextPage.text());
                const payload = getManualGradePayload($nextPage, 'some valid note', 93);
                
                expect(async () => fetch(nextPage.url, {
                    method: 'POST',
                    headers: {'Content-type': 'application/x-www-form-urlencoded'},
                    body: querystring.encode(payload),
                }).to.be.rejected);

                delete payload.submissionNote;
                payload.submissionScore = 95;
                expect(async () => fetch(nextPage.url, {
                    method: 'POST',
                    headers: {'Content-type': 'application/x-www-form-urlencoded'},
                    body: querystring.encode(payload),
                }).to.be.rejected);
            });
            it('instructor should NOT see questions that are NOT configured for manual grading', async () => {
                const question = (await sqlDb.queryAsync(sql.get_question, {qid: 'partialCredit1'})).rows[0];
                assert.isFalse(question.grading_method_manual);

                const instructorCourseInstanceUrl = baseUrl + '/course_instance/1/instructor/instance_admin/assessments';
                const instructorCourseInstanceBody = await (await fetch(instructorCourseInstanceUrl)).text();

                manualGradingUrl = siteUrl + cheerio.load(instructorCourseInstanceBody)('a:contains("Homework for automatic test suite")').attr('href') + 'manual_grading';
                const manualGradingBody = await (await fetch(manualGradingUrl)).text();
                assert.notInclude(manualGradingBody, 'partialCredit1');
                });
            it('grading conflict should persist when loaded by any instructor (even beyond manual grading expiry time)', async () => {
                let gradingConflictBody = await (await fetch(gradingConflictUrl)).text();
                assert.include(gradingConflictBody, 'Manual Grading Conflict: Another Grading Job Was Submitted While Grading');

                const instanceQuestionId = parseInstanceQuestionId(gradingConflictUrl);
                await sqlDb.queryAsync(sql.set_all_date_started_by_iq, {
                    instanceQuestionId,
                    dateTime: new Date('1900-01-01T01:00:00Z').toISOString(),
                });

                gradingConflictBody = await (await fetch(gradingConflictUrl)).text();
                assert.include(gradingConflictBody, 'Manual Grading Conflict: Another Grading Job Was Submitted While Grading');
            });
            it('grading conflict should count as ungraded on main Assessment Manual Grading View', () => {
                assert.equal($addNumbersRow('.ungraded-value').text(), 4);
            });
            it('grading conflict can be resolved by any instructor', async () => {
                const $gradingConflictPage = cheerio.load(
                    await (await fetch(gradingConflictUrl)).text(),
                );
                
                // could use Current or Incoming Grade
                const payload = getConflictPayload($gradingConflictPage, 'Incoming'); 

                const nextPage = await fetch(gradingConflictUrl, {
                    method: 'POST',
                    headers: {'Content-type': 'application/x-www-form-urlencoded'},
                    body: querystring.encode(payload),
                });

                assert.equal(nextPage.status, 200);

                const instanceQuestionId = parseInstanceQuestionId(gradingConflictUrl);
                const instanceQuestion = (await sqlDb.queryOneRowAsync(sql.get_instance_question, {id: instanceQuestionId})).rows[0];
                const assessmentQuestion = (await sqlDb.queryOneRowAsync(sql.get_assessment_question, {id: instanceQuestion.assessment_question_id})).rows[0];

                // application layer back-end will divide payload score by 100
                assert.equal(instanceQuestion.points, (payload.submissionScore / 100) * assessmentQuestion.max_points);
                assert.equal(instanceQuestion.score_perc, (payload.submissionScore / 100) * 100);
            });
            it('grading conflict resolution should count as graded on Assessment Manual Grading view', () => {
                assert.equal($addNumbersRow('.ungraded-value').text(), 3);
                assert.equal($addNumbersRow('.graded-value').text(), 1);
            });
            it('grading conflict resolution containing `submission` obj score and feedback should resolve conflict and NOT produce new grading job', async () => {
                const gradeNextAddNumbersURL = siteUrl + $addNumbersRow('.grade-next-value').attr('href');
                const iqManualGradingUrl = (await fetch(gradeNextAddNumbersURL)).url;

                // two manual grade jobs result in conflict = 2 grading jobs;
                const {submission2} = await createGradingConflict(iqManualGradingUrl);

                const instanceQuestionId = parseInstanceQuestionId(iqManualGradingUrl);
                const numGradingJobsBefore = (await sqlDb.queryAsync(sql.get_grading_jobs_by_iq, {id: instanceQuestionId})).rows.length;


                const $gradingConflictPage = cheerio.load(await submission2.text());
                const payload = getConflictPayload($gradingConflictPage, 'Current');
                assert.equal(payload.conflictDataSource, 'submission');

                setUser(mockInstructors[1]);
                const response = await fetch(submission2.url, {
                    method: 'POST',
                    headers: {'Content-type': 'application/x-www-form-urlencoded'},
                    body: querystring.encode(payload),
                });

                assert.equal(response.status, 200);

                const numGradingJobsAfter = (await sqlDb.queryAsync(sql.get_grading_jobs_by_iq, {id: instanceQuestionId})).rows.length;
                assert.equal(numGradingJobsBefore - numGradingJobsAfter, 0); // no new grading jobs

                const instanceQuestion = (await sqlDb.queryOneRowAsync(sql.get_instance_question, {id: instanceQuestionId})).rows[0];
                const assessmentQuestion = (await sqlDb.queryOneRowAsync(sql.get_assessment_question, {id: instanceQuestion.assessment_question_id})).rows[0];
                assert.equal(instanceQuestion.points, (payload.submissionScore / 100) * assessmentQuestion.max_points);
                assert.equal(instanceQuestion.score_perc, (payload.submissionScore / 100) * 100);
            });
            it('grading conflict `submission` conflictDataSource resolution should count as graded on Assessment Manual Grading View', () => {
                assert.equal($addNumbersRow('.ungraded-value').text(), 2);
                assert.equal($addNumbersRow('.graded-value').text(), 2);
            });
            it('grading conflict resolution containing `grading_job` obj score and feedback should resolve conflict AND produce new grading job', async () => {
                const gradeNextAddNumbersURL = siteUrl + $addNumbersRow('.grade-next-value').attr('href');
                const iqManualGradingUrl = (await fetch(gradeNextAddNumbersURL)).url;
                
                // two manual grade jobs result in conflict = 2 grading jobs
                const {submission2} = await createGradingConflict(iqManualGradingUrl);

                const instanceQuestionId = parseInstanceQuestionId(iqManualGradingUrl);
                const numGradingJobsBefore = (await sqlDb.queryAsync(sql.get_grading_jobs_by_iq, {id: instanceQuestionId})).rows.length;

                const $gradingConflictPage = cheerio.load(await submission2.text());
                const payload = getConflictPayload($gradingConflictPage, 'Incoming'); 
                assert.equal(payload.conflictDataSource, 'grading_job');

                setUser(mockInstructors[1]);
                const response = await fetch(submission2.url, {
                    method: 'POST',
                    headers: {'Content-type': 'application/x-www-form-urlencoded'},
                    body: querystring.encode(payload),
                });

                assert.equal(response.status, 200);

                const numGradingJobsAfter = (await sqlDb.queryAsync(sql.get_grading_jobs_by_iq, {id: instanceQuestionId})).rows.length;
                assert.equal(numGradingJobsAfter - numGradingJobsBefore, 1); // should have one more grading job
                const instanceQuestion = (await sqlDb.queryOneRowAsync(sql.get_instance_question, {id: instanceQuestionId})).rows[0];
                const assessmentQuestion = (await sqlDb.queryOneRowAsync(sql.get_assessment_question, {id: instanceQuestion.assessment_question_id})).rows[0];
                assert.equal(instanceQuestion.points, (payload.submissionScore / 100) * assessmentQuestion.max_points);
                assert.equal(instanceQuestion.score_perc, (payload.submissionScore / 100) * 100);
            });
            it('grading conflict `grading_job` conflictDataSource resolution should count as graded on Assessment Manual Grading View', () => {
                assert.equal($addNumbersRow('.ungraded-value').text(), 1);
                assert.equal($addNumbersRow('.graded-value').text(), 3);
            });
            it('consecutive grading conflicts can be resolved on same instance question', async () => {
                // NOTE: Must use user returned URLs to meet CSRF token constraints
                const gradeNextAddNumbersURL = siteUrl + $addNumbersRow('.grade-next-value').attr('href');
                const iqManualGradingUrl = (await fetch(gradeNextAddNumbersURL)).url;
                
                // user 2 gets conflict
                const {submission2} = await createGradingConflict(iqManualGradingUrl);
                
                const submission2Body = await submission2.text();
                assert.equal(submission2.status, 200);
                assert.notInclude(submission2Body, 'Grading Panel');
                assert.include(submission2Body, 'Current Grade');
                assert.include(submission2Body, 'Incoming Grade');
                assert.include(submission2Body, 'Manual Grading Conflict: Another Grading Job Was Submitted While Grading');

                const $user2ConflictPage = cheerio.load(
                    submission2Body,
                );

                // user 1 loads page with conflict
                setUser(mockInstructors[0]);
                const submission3 = await fetch(iqManualGradingUrl);
                const submission3Body = await submission3.text();
                assert.equal(submission3.status, 200);
                assert.notInclude(submission3Body, 'Grading Panel');
                assert.include(submission3Body, 'Current Grade');
                assert.include(submission3Body, 'Incoming Grade');
                assert.include(submission3Body, 'Manual Grading Conflict: Another Grading Job Was Submitted While Grading');

                const $user1ConflictPage = cheerio.load(
                    submission3Body,
                );

                const user1Payload = getConflictPayload($user1ConflictPage, 'Incoming'); 
                const user2Payload = getConflictPayload($user2ConflictPage, 'Incoming'); 

                assert.equal(user1Payload.instanceQuestionModifiedAt, user2Payload.instanceQuestionModifiedAt);

                // user 2 submits successfully
                setUser(mockInstructors[1]);
                const resolution1Body = await (await fetch(submission2.url, {
                    method: 'POST',
                    headers: {'Content-type': 'application/x-www-form-urlencoded'},
                    body: querystring.encode(user2Payload),
                })).text();

                assert.notInclude(resolution1Body, 'Manual Grading Conflict');

                // user 1 receives new conflict page
                setUser(mockInstructors[0]);
                const resolution2Res = await fetch(submission3.url, {
                    method: 'POST',
                    headers: {'Content-type': 'application/x-www-form-urlencoded'},
                    body: querystring.encode(user1Payload),
                });
                const resolution2Url = resolution2Res.url;
                const resolution2Body = await resolution2Res.text();

                assert.include(resolution2Body, 'Manual Grading Conflict');

                const instanceQuestionId = parseInstanceQuestionId(iqManualGradingUrl);
                const conflictGradingJobs = (await sqlDb.queryAsync(sql.get_conflict_grading_jobs_by_iq, {id: instanceQuestionId})).rows;
                assert.lengthOf(conflictGradingJobs, 1);

                const $resolution2Page = cheerio.load(resolution2Body);
                const finalPayload = getConflictPayload($resolution2Page, 'Incoming'); 

                await fetch(resolution2Url, {
                    method: 'POST',
                    headers: {'Content-type': 'application/x-www-form-urlencoded'},
                    body: querystring.encode(finalPayload),
                });

                const instanceQuestion = (await sqlDb.queryOneRowAsync(sql.get_instance_question, {id: instanceQuestionId})).rows[0];
                const assessmentQuestion = (await sqlDb.queryOneRowAsync(sql.get_assessment_question, {id: instanceQuestion.assessment_question_id})).rows[0];

                assert.equal(instanceQuestion.points, (finalPayload.submissionScore / 100) * assessmentQuestion.max_points);
                assert.equal(instanceQuestion.score_perc, (finalPayload.submissionScore / 100) * 100);

                const gradingJobs = (await sqlDb.queryAsync(sql.get_grading_jobs_by_iq, {id: instanceQuestionId})).rows;
                gradingJobs.forEach((gj => {
                    assert.isFalse(gj.manual_grading_conflict);
                }));
            });
            it('grading conflict with consecutive conflict resolutions should count as graded on Assessment Manual Grading View', () => {
                assert.equal($addNumbersRow('.ungraded-value').text(), 0);
                assert.equal($addNumbersRow('.graded-value').text(), 4);
            });
        });
    });
};

// Run tests for both submission actions
testManualGradingAction('save');
testManualGradingAction('grade');
