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
        diffType: $page(`div:contains("${wildcard}") > form > div > input[name="diffType"]`).val(),
    };
};

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

const gradeSubmission = async (iqManualGradeUrl, submissionScore, submissionNote) => {

    const $gradingPage = cheerio.load(
        await (await fetch(iqManualGradeUrl)).text(),
    );
    const payload = getManualGradePayload($gradingPage, submissionScore, submissionNote);

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

                const submissionScore = 95;
                const submissionNote = 'Any note about the grade';
                const payload = getManualGradePayload($nextGradingPage, submissionScore, submissionNote);

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
        it('instructor should see warning message when grading question and also being graded by another instructor', async () => {
            const gradeNextAddNumbersURL = siteUrl + $addNumbersRow('.grade-next-value').attr('href');

            // instructor 1 opens question for grading
            const iqManualGradingUrl = (await fetch(gradeNextAddNumbersURL)).url;

            // instructor 2 opens question for grading
            setUser(mockInstructors[1]);
            let iqManualGradingBody = await (await fetch(iqManualGradingUrl)).text();
            assert.include(iqManualGradingBody, 'Dev User (dev@illinois.edu) is currently grading this question');

            const instanceQuestionId = parseInstanceQuestionId(iqManualGradingUrl);
            await sqldb.queryAsync(sql.set_last_date_started_by_user, {
                instanceQuestionId,
                uid: mockInstructors[0].authUid,
                dateTime: new Date('2999-01-01T01:00:00Z').toISOString(),
            });

            iqManualGradingBody = await (await fetch(iqManualGradingUrl)).text();
            assert.include(iqManualGradingBody, '(mwest@illinois.edu) is currently grading this question');
        });
        it('instructor should get grading conflict view if two instructors submit grades to same question when being graded by two instructors', async () => {
            const gradeNextAddNumbersURL = siteUrl + $addNumbersRow('.grade-next-value').attr('href');
            const iqManualGradingUrl = (await fetch(gradeNextAddNumbersURL)).url;

            const {submission1, submission2} = await createGradingConflict(iqManualGradingUrl);

            gradingConflictUrl = iqManualGradingUrl;

            const instanceQuestionId = parseInstanceQuestionId(submission2.url);
            const gradingJob = (await sqldb.queryOneRowAsync(sql.get_conflict_grading_jobs_by_iq, {id: instanceQuestionId})).rows[0];
            assert.isTrue(gradingJob.manual_grading_conflict);

            // instructor 1 sees a new question to grade
            const submission1Body = await submission1.text();
            assert.equal(submission1.status, 200);
            assert.notEqual(submission1.url, gradingConflictUrl);
            assert.include(submission1Body, 'Grading Panel');
            assert.notInclude(submission1Body, 'Existing Grade');
            assert.notInclude(submission1Body, 'Incoming Grade');

            // instructor 2 redirects back to same page to resolve conflict
            const submission2Body = await submission2.text();
            assert.equal(submission2.status, 200);
            assert.include(submission2.url, gradingConflictUrl);
            assert.notInclude(submission2Body, 'Grading Panel');
            assert.include(submission2Body, 'Existing Grade');
            assert.include(submission2Body, 'Incoming Grade');
            assert.include(submission2Body, 'Manual Grading Conflict: Another Grading Job Was Submitted While Grading');
        });
        it('grading conflict should persist when loaded by any instructor', async () => {
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
            
            // could use Existing or Incoming Grade
            const payload = getConflictPayload($gradingConflictPage, 'Incoming'); 

            const nextPage = await fetch(gradingConflictUrl, {
                method: 'POST',
                headers: {'Content-type': 'application/x-www-form-urlencoded'},
                body: querystring.encode(payload),
            });

            assert.equal(nextPage.status, 200);

            const instanceQuestionId = parseInstanceQuestionId(gradingConflictUrl);
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
        it('grading conflict `submission` type post should resolve conflict and NOT produce new grading job', async () => {
            const gradeNextAddNumbersURL = siteUrl + $addNumbersRow('.grade-next-value').attr('href');
            const iqManualGradingUrl = (await fetch(gradeNextAddNumbersURL)).url;

            // two manual grade jobs result in conflict = 2 grading jobs
            const {submission2} = await createGradingConflict(iqManualGradingUrl);

            const instanceQuestionId = parseInstanceQuestionId(iqManualGradingUrl);
            let gradingJobs = (await sqldb.queryAsync(sql.get_grading_jobs_by_iq, {id: instanceQuestionId})).rows;
            assert.lengthOf(gradingJobs, 2);

            const $gradingConflictPage = cheerio.load(await submission2.text());
            const payload = getConflictPayload($gradingConflictPage, 'Existing'); 
            assert.equal(payload.diffType, 'submission');

            setUser(mockInstructors[1]);
            const response = await fetch(submission2.url, {
                method: 'POST',
                headers: {'Content-type': 'application/x-www-form-urlencoded'},
                body: querystring.encode(payload),
            });

            assert.equal(response.status, 200);

            gradingJobs = (await sqldb.queryAsync(sql.get_grading_jobs_by_iq, {id: instanceQuestionId})).rows;
            assert.lengthOf(gradingJobs, 2);

            const instanceQuestion = (await sqldb.queryOneRowAsync(sql.get_instance_question, {id: instanceQuestionId})).rows[0];
            const assessmentQuestion = (await sqldb.queryOneRowAsync(sql.get_assessment_question, {id: instanceQuestion.assessment_question_id})).rows[0];

            assert.equal(instanceQuestion.points, (payload.submissionScore / 100) * assessmentQuestion.max_points);
            assert.equal(instanceQuestion.score_perc, (payload.submissionScore / 100) * 100);
        });
        it('multiple grading conflicts can be resolved on same instance question', async () => {
            // NOTE: Must use user returned URLs to meet CSRF token constraints
            const gradeNextAddNumbersURL = siteUrl + $addNumbersRow('.grade-next-value').attr('href');
            const iqManualGradingUrl = (await fetch(gradeNextAddNumbersURL)).url;
            
            // user 2 gets conflict
            const {submission2} = await createGradingConflict(iqManualGradingUrl);
            
            const submission2Body = await submission2.text();
            assert.equal(submission2.status, 200);
            assert.notInclude(submission2Body, 'Grading Panel');
            assert.include(submission2Body, 'Existing Grade');
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
            assert.include(submission3Body, 'Existing Grade');
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
            const resolution2Body = await (await fetch(submission3.url, {
                method: 'POST',
                headers: {'Content-type': 'application/x-www-form-urlencoded'},
                body: querystring.encode(user1Payload),
            })).text();

            assert.include(resolution2Body, 'Manual Grading Conflict');

            const instanceQuestionId = parseInstanceQuestionId(iqManualGradingUrl);
            const conflictGradingJobs = (await sqldb.queryAsync(sql.get_conflict_grading_jobs_by_iq, {id: instanceQuestionId})).rows;
            assert.lengthOf(conflictGradingJobs, 1);

            const $resolution2Page = cheerio.load(resolution2Body);
            const finalPayload = getConflictPayload($resolution2Page, 'Incoming'); 

            await fetch(iqManualGradingUrl, {
                method: 'POST',
                headers: {'Content-type': 'application/x-www-form-urlencoded'},
                body: querystring.encode(user1Payload),
            });

            const instanceQuestion = (await sqldb.queryOneRowAsync(sql.get_instance_question, {id: instanceQuestionId})).rows[0];
            const assessmentQuestion = (await sqldb.queryOneRowAsync(sql.get_assessment_question, {id: instanceQuestion.assessment_question_id})).rows[0];

            assert.equal(instanceQuestion.points, (finalPayload.submissionScore / 100) * assessmentQuestion.max_points);
            assert.equal(instanceQuestion.score_perc, (finalPayload.submissionScore / 100) * 100);

            const gradingJobs = (await sqldb.queryAsync(sql.get_grading_jobs_by_iq, {id: instanceQuestionId})).rows;
            assert.lengthOf(gradingJobs, 5);
        });
    });
});
