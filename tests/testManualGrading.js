const assert = require('chai').assert;
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

const mockStudents = [
    {authUid: 'student1', authName: 'Student User 1', authUin: '00000001'},
    {authUid: 'student2', authName: 'Student User 2', authUin: '00000002'},
    {authUid: 'student3', authName: 'Student User 3', authUin: '00000003'},
];
const mockInstructors = [
    {authUid: config.authUid, authName: config.authName, authUin: config.authUin}, // testing default
    {authUid: 'mwest@illinois.edu', authName: '', uin: ''},
];

const setUser = (user) => {
    config.authUid = user.authUid;
    config.authName = user.authName;
    config.authUin = user.authUin;
};

const gradeSubmission = async (iqManualGradeUrl, submissionScore, submissionNote) => {

    const $gradingPage = cheerio.load(
        await (await fetch(iqManualGradeUrl)).text(),
    );
    const payload = {
        instanceQuestionModifiedAt: $gradingPage('form > input[name="instanceQuestionModifiedAt"]').val(),
        __csrf_token: $gradingPage('form > input[name="__csrf_token"]').val(),
        __action: $gradingPage('form > div > button[name="__action"]').attr('value'),
        assessmentId: $gradingPage('form > input[name="assessmentId"]').val(),
        assessmentQuestionId: $gradingPage('form > input[name="assessmentQuestionId"]').val(),
        submissionNote,
        submissionScore,
    };
    return fetch(iqManualGradeUrl, {
            method: 'POST',
            headers: {'Content-type': 'application/x-www-form-urlencoded'},
            body: querystring.encode(payload),
        });
};

const saveSubmission = async (instanceQuestionUrl, payload) => {
    const $instanceQuestionPage = cheerio.load(await (await fetch(instanceQuestionUrl)).text());
    const token = $instanceQuestionPage('form > input[name="__csrf_token"]').val();
    const variantId = $instanceQuestionPage('form > input[name="__variant_id"]').val();

    // __variant_id should exist inside postData on only some instance questions submissions
    if (payload && payload.postData && payload.postData) {
        payload.postData = JSON.parse(payload.postData);
        payload.postData.variant.id = variantId;
        payload.postData = JSON.stringify(payload.postData);
    }

    const res = await fetch(instanceQuestionUrl, {
        method: 'POST',
        headers: {'Content-type': 'application/x-www-form-urlencoded'},
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

    before('set any student as default user role', () => setUser(mockStudents[0]));
    after('reset to default instructor user', () => setUser(mockInstructors[0]));

    describe('student role: saving student submissions', () => {
        const studentCourseInstanceUrl = baseUrl + '/course_instance/1';
        let hm1AutomaticTestSuiteUrl = null;

        before('fetch student "HW1: Homework for automatic test suite" URL', async () => {
            const courseInstanceBody = await (await fetch(studentCourseInstanceUrl)).text();
            const $courseInstancePage = cheerio.load(courseInstanceBody);
            hm1AutomaticTestSuiteUrl = siteUrl + $courseInstancePage('a:contains("Homework for automatic test suite")').attr('href');
        });

        it('students should be able to save submissions on instance questions', async () => {
            // 'save' 1 answer for each question for each mock students; 1 x 3 x 3 = 9 submissions
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
                
                await saveSubmission(hm1AddTwoNumbersUrl, {c: 9999999});
                await saveSubmission(hm1AddVectorsCartesianUrl, {
                    postData: JSON.stringify({
                        submittedAnswer: { wx: '999999', wy: '999999' },
                        variant: { id: null },
                      },
                    ),
                });
                await saveSubmission(hm1AdvantagesFossilFuelsUrl, {
                    postData: JSON.stringify(
                        {
                            variant: { id: null },
                            submittedAnswer: { key: 'c' },
                        },
                    ),
                });
            }
        });
        it('db should contain 9 submissions (1 per question x 3 students for 3 questions = 9 submissions)', async () => {
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

    describe('instructor role: grading student submissions', () => {
        let $addNumbersRow = null;
        let $addVectorsRow = null;
        let $fossilFuelsRow = null;
        let gradingConflictUrl = null;
        let manualGradingUrl = null;

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

        it('instructor role should see 9 ungraded submissions from student role tests', async () => {
            assert.equal($addNumbersRow('.ungraded-value').text(), 3);
            assert.equal($addVectorsRow('.ungraded-value').text(), 3);
            assert.equal($fossilFuelsRow('.ungraded-value').text(), 3);
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
            assert.equal($fossilFuelsRow('.ungraded-value').text(), 3);
            const gradeNextFossilFuelsUrl = siteUrl + $fossilFuelsRow('.grade-next-value').attr('href');

            for (let i = 1; i <= 3; i++) {
                const nextPage = await fetch(gradeNextFossilFuelsUrl);
                let $nextGradingPage = cheerio.load(
                    await (nextPage).text(),
                );
                const payload = {
                    submissionScore: 95,
                    submissionNote: 'Any note about the grade',
                    instanceQuestionModifiedAt: $nextGradingPage('form > input[name="instanceQuestionModifiedAt"]').val(),
                    __csrf_token: $nextGradingPage('form > input[name="__csrf_token"]').val(),
                    __action: $nextGradingPage('form > div > button[name="__action"]').attr('value'),
                    assessmentId: $nextGradingPage('form > input[name="assessmentId"]').val(),
                    assessmentQuestionId: $nextGradingPage('form > input[name="assessmentQuestionId"]').val(),
                };
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
                assert.equal(ungradedVal, 3 - i);
                assert.equal(gradedVal, i);
            }
        });
        it('instructor should NOT see "Grade Next" option when "Ungraded" column is 0', () => {
            assert.isUndefined($fossilFuelsRow('.grade-next-value').attr('href'));
        });
        it('instructor(s) should appear in "Grading Contributors" column if opened or submitted grade', async () => {
            const ungradedVal = parseInt($addVectorsRow('.ungraded-value').text());
            assert.equal(ungradedVal, 3);

            const contributorsCell = $addVectorsRow('.grading-contributors-value').text();
            assert.notInclude(contributorsCell, mockInstructors[0].authUid);
            assert.notInclude(contributorsCell, mockInstructors[1].authUid);

            for (const instructor of mockInstructors) {
                setUser(instructor);
                const gradeNextAddVectorsUrl = siteUrl + $addVectorsRow('.grade-next-value').attr('href');
                const iqManualGradingUrl = (await fetch(gradeNextAddVectorsUrl)).url;
                const nextPage = await gradeSubmission(iqManualGradingUrl, '90', 'Amazing work');
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
        it('instructor user id should be added to instance question when submission opened for grading', async () => {
            const gradeNextAddNumbersUrl = siteUrl + $addNumbersRow('.grade-next-value').attr('href');
            const redirectUrl = (await fetch(gradeNextAddNumbersUrl)).url;

            const instanceQuestionId = parseInt(
                redirectUrl.match(/instance_question\/(\d+)/)[1],
            );
            assert.isNumber(instanceQuestionId);

            const instanceQuestion = (await sqldb.queryOneRowAsync(sql.get_instance_question, {id: instanceQuestionId})).rows[0];
            const user = (await sqldb.queryOneRowAsync(sql.get_user_by_uin, {uin: mockInstructors[0].authUin})).rows[0];
            assert.equal(instanceQuestion.manual_grading_user, user.user_id);
        });
        it('instructor should see warning message when grading question also being graded by another instructor', async () => {
            const gradeNextAddNumbersURL = siteUrl + $addNumbersRow('.grade-next-value').attr('href');

            // instructor 1 opens question for grading
            const iqManualGradingUrl = (await fetch(gradeNextAddNumbersURL)).url;

            // instructor 2 opens question for grading
            setUser(mockInstructors[1]);
            const iqManualGradingBody = await (await fetch(iqManualGradingUrl)).text();
            assert.include(iqManualGradingBody, 'Dev User (dev@illinois.edu) is currently grading this question');
        });
        it('instructor should get grading conflict view if two instructors submit grades to same question when being graded by two instructors', async () => {
            const gradeNextAddNumbersURL = siteUrl + $addNumbersRow('.grade-next-value').attr('href');
            const iqManualGradingUrl = (await fetch(gradeNextAddNumbersURL)).url;

            // instructor 1 loads page for grading
            const iqManualGradingBody1 = await (await fetch(iqManualGradingUrl)).text();
            const $iqManualGradingPage1 = cheerio.load(iqManualGradingBody1);

            // instructor 2 loads page for grading
            setUser(mockInstructors[1]);
            const iqManualGradingBody2 = await (await fetch(iqManualGradingUrl)).text();
            const $iqManualGradingPage2 = cheerio.load(iqManualGradingBody2);

            const payload1 = {
                submissionScore: 5,
                submissionNote: 'First submission score of 5%',
                instanceQuestionModifiedAt: $iqManualGradingPage1('form > input[name="instanceQuestionModifiedAt"]').val(),
                __csrf_token: $iqManualGradingPage1('form > input[name="__csrf_token"]').val(),
                __action: $iqManualGradingPage1('form > div > button[name="__action"]').attr('value'),
                assessmentId: $iqManualGradingPage1('form > input[name="assessmentId"]').val(),
                assessmentQuestionId: $iqManualGradingPage1('form > input[name="assessmentQuestionId"]').val(),
            };
            const payload2 = {
                submissionScore: 95,
                submissionNote: 'Second submission score of 95%',
                instanceQuestionModifiedAt: $iqManualGradingPage2('form > input[name="instanceQuestionModifiedAt"]').val(),
                __csrf_token: $iqManualGradingPage2('form > input[name="__csrf_token"]').val(),
                __action: $iqManualGradingPage2('form > div > button[name="__action"]').attr('value'),
                assessmentId: $iqManualGradingPage2('form > input[name="assessmentId"]').val(),
                assessmentQuestionId: $iqManualGradingPage2('form > input[name="assessmentQuestionId"]').val(),
            };

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
            
            gradingConflictUrl = iqManualGradingUrl;

            const instanceQuestionId = parseInt(
                submission2.url.match(/instance_question\/(\d+)/)[1],
            );

            const instanceQuestion = (await sqldb.queryOneRowAsync(sql.get_instance_question, {id: instanceQuestionId})).rows[0];
            assert.isTrue(instanceQuestion.manual_grading_conflict);

            // instructor 1 sees a new question to grade
            const submission1Body = await submission1.text();
            assert.equal(submission1.status, 200);
            assert.notEqual(submission1.url, gradingConflictUrl);
            assert.include(submission1Body, 'Grading Panel');
            assert.notInclude(submission1Body, 'Submission Grade');
            assert.notInclude(submission1Body, 'Grading Job Grade');

            // instructor 2 redirects back to same page to resolve conflict
            const submission2Body = await submission2.text();
            assert.equal(submission2.status, 200);
            assert.include(submission2.url, gradingConflictUrl);
            assert.notInclude(submission2Body, 'Grading Panel');
            assert.include(submission2Body, 'Submission Grade');
            assert.include(submission2Body, 'Grading Job Grade');
            assert.include(submission2Body, 'Manual Grading Conflict: Another Grading Job Was Submitted While Grading');
        });
        it('grading conflict should persist when loaded by any instructor', async () => {
            console.log('URL  y', gradingConflictUrl);
            const gradingConflictBody = await (await fetch(gradingConflictUrl)).text();
            assert.include(gradingConflictBody, 'Manual Grading Conflict: Another Grading Job Was Submitted While Grading');
        });
        it('grading conflict should count as ungraded on main Assessment Manual Grading View', () => {
            assert.equal($addNumbersRow('.ungraded-value').text(), 3);
        });
        it('grading conflict can be resolved by any instructor', async () => {
            const $gradingConflictPage = cheerio.load(
                await (await fetch(gradingConflictUrl)).text(),
            );
            
            // could use Current Grade if one wanted
            const payload = {
                submissionScore: $gradingConflictPage('div:contains("Previous Grade") > form input[name="submissionScore"]').val(),
                submissionNote: $gradingConflictPage('div:contains("Previous Grade") > form textarea[name="submissionNote"]').val(),
                instanceQuestionModifiedAt: $gradingConflictPage('div:contains("Previous Grade") > form > input[name="instanceQuestionModifiedAt"]').val(),
                __csrf_token: $gradingConflictPage('div:contains("Previous Grade") > form > input[name="__csrf_token"]').val(),
                __action: $gradingConflictPage('div:contains("Previous Grade") > form > div > button[name="__action"]').attr('value'),
                assessmentId: $gradingConflictPage('div:contains("Previous Grade") > form > input[name="assessmentId"]').val(),
                assessmentQuestionId: $gradingConflictPage('div:contains("Previous Grade") > form > input[name="assessmentQuestionId"]').val(),
            };

            const nextPage = await fetch(gradingConflictUrl, {
                method: 'POST',
                headers: {'Content-type': 'application/x-www-form-urlencoded'},
                body: querystring.encode(payload),
            });

            assert.equal(nextPage.status, 200);

            const instanceQuestionId = parseInt(
                gradingConflictUrl.match(/instance_question\/(\d+)/)[1],
            );
            assert.isNumber(instanceQuestionId);

            const instanceQuestion = (await sqldb.queryOneRowAsync(sql.get_instance_question, {id: instanceQuestionId})).rows[0];
            const assessmentQuestion = (await sqldb.queryOneRowAsync(sql.get_assessment_question, {id: instanceQuestion.assessment_question_id})).rows[0];

            // application layer back-end will divide payload score by 100
            assert.equal(instanceQuestion.points, (payload.submissionScore / 100) * assessmentQuestion.max_points);
            assert.equal(instanceQuestion.score_perc, (payload.submissionScore / 100) * 100);
        });
        it('grading conflict resolution should count as graded on Assessment Manual Grading view', () => {
            assert.equal($addNumbersRow('.ungraded-value').text(), 2);
            assert.equal($addNumbersRow('.graded-value').text(), 1);
        });
    });
});
