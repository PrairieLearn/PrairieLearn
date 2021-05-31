const ERR = require('async-stacktrace');
const fs = require('fs');
const _ = require('lodash');
const assert = require('chai').assert;
const request = require('request');
const cheerio = require('cheerio');

const config = require('../../lib/config');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

var res, page, elemList;

const helperClient = require('../helperClient');
const helperServer = require('../helperServer');
const helperQuestion = require('../helperQuestion');

const locals = {};

const questionsArray = [
    {qid: 'addVectors', type: 'Calculation', maxPoints: 11},
    {qid: 'partialCredit3', type: 'Freeform', maxPoints: 13},
];

const assessmentMaxPoints = questionsArray.reduce(function(maxPointsSum, question) {
    return maxPointsSum + question.maxPoints;
});

const partialCredit3ServerPath = '../../testCourse/questions/partialCredit3/server.py';
const addVectorsServerPath = '../../testCourse/questions/addVectors/server.js';
const partialCredit3CorrectServerPath = './partialCredit3CorrectServer.py';
const addVectorsCorrectServerPath = './addVectorsCorrectServer.js';
const partialCredit3IncorrectServerPath = './partialCredit3IncorrectServer.py';
const addVectorsIncorrectServerPath = './addVectorsIncorrectServer.js';

const questions = _.keyBy(questionsArray, 'qid');

describe('Regrading', function() {
    this.timeout(60000);

    before('set up testing server', helperServer.before());
    after('shut down testing server', helperServer.after);

    /**
     * Restarts the testing server, then creates a new assessment instance for the exam with
     * the given exam number.
     * 
     * @param {*} examNumber the unique number of the exam to create an assessment instance for
     */
    var startExam = function(examNumber) {
        describe('server', function() {
            it('should shut down', function(callback) {
                var that = this;
                // pass "this" explicitly to enable this.timeout() calls
                helperServer.after.call(that, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            });
            it('should start up', function(callback) {
                var that = this;
                // pass "this" explicitly to enable this.timeout() calls
                helperServer.before().call(that, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            });
        });

        describe('startExam-1. the locals object', function() {
            it('should be cleared', function() {
                for (var prop in locals) {
                    delete locals[prop];
                }
            });
            it('should be initialized', function() {
                locals.siteUrl = 'http://localhost:' + config.serverPort;
                locals.baseUrl = locals.siteUrl + '/pl';
                locals.courseInstanceBaseUrl = locals.baseUrl + '/course_instance/1';
                locals.instructorBaseUrl = locals.courseInstanceBaseUrl + '/instructor';
                locals.instructorAssessmentsUrl = locals.instructorBaseUrl + '/assessments';
                locals.instructorGradebookUrl = locals.instructorBaseUrl + '/gradebook';
                locals.questionBaseUrl = locals.courseInstanceBaseUrl + '/instance_question';
                locals.assessmentsUrl = locals.courseInstanceBaseUrl + '/assessments';
                locals.isStudentPage = true;
                locals.totalPoints = 0;
            });
        });

        describe('startExam-2. the questions', function() {
            it('should have cleared data', function() {
                questionsArray.forEach(function(question) {
                    for (var prop in question) {
                        if (prop != 'qid' && prop != 'type' && prop != 'maxPoints') {
                            delete question[prop];
                        }
                    }
                    question.points = 0;
                });
            });
        });

        describe('startExam-3. the database', function() {
            it('should contain E' + examNumber, function(callback) {
                const params = {
                    exam_number: examNumber,
                }
                sqldb.queryOneRow(sql.select_exam, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    locals.assessment_id = result.rows[0].id;
                    callback(null);
                });
            });
        });

        describe('startExam-4. GET to assessments URL', function() {
            it('should load successfully', function(callback) {
                request(locals.assessmentsUrl, function(error, response, body) {
                    if (error) {
                        return callback(error);
                    }
                    if (response.statusCode != 200) {
                        return callback(new Error('bad status: ' + response.statusCode));
                    }
                    res = response;
                    page = body;
                    callback(null);
                });
            });
            it('should parse', function() {
                locals.$ = cheerio.load(page);
            });
            it('should contain E' + examNumber, function() {
                if (examNumber == '11') {
                    elemList = locals.$('td a:contains("Test regrading with real-time grading enabled")');
                } else {  // exam_number == '12'
                    elemList = locals.$('td a:contains("Test regrading with real-time grading disabled")');
                }
                assert.lengthOf(elemList, 1);
            });
            it('should have the correct link for E' + examNumber, function() {
                locals.assessmentUrl = locals.siteUrl + elemList[0].attribs.href;
                assert.equal(locals.assessmentUrl, locals.courseInstanceBaseUrl + '/assessment/' + locals.assessment_id + '/');
            });
        });

        describe('startExam-5. GET to assessment URL', function() {
            const examString = `"Exam ${examNumber}"`;

            it('should load successfully', function(callback) {
                request(locals.assessmentUrl, function(error, response, body) {
                    if (error) {
                        return callback(error);
                    }
                    if (response.statusCode != 200) {
                        return callback(new Error('bad status: ' + response.statusCode));
                    }
                    res = response;
                    page = body;
                    callback(null);
                });
            });
            it('should parse', function() {
                locals.$ = cheerio.load(page);
            });
            it('should contain ' + examString, function() {
                elemList = locals.$('p.lead strong:contains(' + examString + ')');
                assert.lengthOf(elemList, 1);
            });
            it('should contain "QA 101"', function() {
                elemList = locals.$('p.lead strong:contains("QA 101")');
                assert.lengthOf(elemList, 1);
            });
            it('should have a CSRF token', function() {
                elemList = locals.$('form input[name="__csrf_token"]');
                assert.lengthOf(elemList, 1);
                assert.nestedProperty(elemList[0], 'attribs.value');
                locals.__csrf_token = elemList[0].attribs.value;
                assert.isString(locals.__csrf_token);
            });
        });

        describe('startExam-6. POST to assessment URL', function() {
            it('should load successfully', function(callback) {
                var form = {
                    __action: 'new_instance',
                    __csrf_token: locals.__csrf_token,
                };
                locals.preStartTime = Date.now();
                request.post({url: locals.assessmentUrl, form: form, followAllRedirects: true}, function(error, response, body) {
                    if (error) {
                        return callback(error);
                    }
                    locals.postStartTime = Date.now();
                    if (response.statusCode != 200) {
                        return callback(new Error('bad status: ' + response.statusCode));
                    }
                    res = response;
                    page = body;
                    callback(null);
                });
            });
            it('should parse', function() {
                locals.$ = cheerio.load(page);
            });
            it('should redirect to the correct path', function() {
                locals.assessmentInstanceUrl = locals.siteUrl + res.req.path;
                assert.equal(res.req.path, '/pl/course_instance/1/assessment_instance/1');
                locals.instructorAssessmentInstanceUrl = locals.siteUrl + '/pl/course_instance/1/instructor/assessment_instance/1';
            });
            it('should create one assessment_instance', function(callback) {
                sqldb.query(sql.select_assessment_instances, [], function(err, result) {
                    if (ERR(err, callback)) return;
                    if (result.rowCount != 1) {
                        return callback(new Error('expected one assessment_instance, got: ' + result.rowCount));
                    }
                    locals.assessment_instance = result.rows[0];
                    callback(null);
                });
            });
            it('should have the correct assessment_instance.assessment_id', function() {
                assert.equal(locals.assessment_instance.assessment_id, locals.assessment_id);
            });
            it(`should create ${questionsArray.length} instance_questions`, function(callback) {
                sqldb.query(sql.select_instance_questions, [], function(err, result) {
                    if (ERR(err, callback)) return;
                    if (result.rowCount != questionsArray.length) {
                        return callback(new Error(`expected ${questionsArray.length} instance_questions, got: ` + result.rowCount));
                    }
                    locals.instance_questions = result.rows;
                    callback(null);
                });
            });
            questionsArray.forEach(function(question, i) {
                it(`should have question #${i+1} as QID ${question.qid}`, function() {
                    question.id = locals.instance_questions[i].id;
                    assert.equal(locals.instance_questions[i].qid, question.qid);
                });
            });
        });

        describe('startExam-7. GET to assessment_instance URL', function() {
            it('should load successfully', function(callback) {
                request(locals.assessmentInstanceUrl, function(error, response, body) {
                    if (error) {
                        return callback(error);
                    }
                    if (response.statusCode != 200) {
                        return callback(new Error('bad status: ' + response.statusCode));
                    }
                    res = response;
                    page = body;
                    callback(null);
                });
            });
            it('should parse', function() {
                locals.$ = cheerio.load(page);
            });
            questionsArray.forEach(function(question) {
                it(`should link to ${question.qid} question`, function() {
                    const urlTail = '/pl/course_instance/1/instance_question/' + question.id + '/';
                    question.url = locals.siteUrl + urlTail;
                    elemList = locals.$(`td a[href="${urlTail}"]`);
                    assert.lengthOf(elemList, 1);
                });
            });
        });
    };

    /**
     * Submits an answer to the given instance question.
     * 
     * @param {*} buttons an array of button names (e.g. 'save' or 'grade') that should appear when viewing the question
     * @param {*} postAction a string indicating what action to perform with the submission (e.g. 'save' or 'grade')
     * @param {*} question the instance question to submit an answer to
     * @param {*} expectedResult the expected result of the submission
     * @param {*} getSubmittedAnswer a function that returns the answer to be submitted
     */
    var submitAnswer = function(buttons, postAction, question, expectedResult, getSubmittedAnswer) {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = buttons;
                locals.postAction = postAction;
                locals.question = question;
                locals.expectedResult = expectedResult;
                locals.getSubmittedAnswer = getSubmittedAnswer;
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        helperQuestion.postInstanceQuestion(locals);
        helperQuestion.checkQuestionScore(locals);
        helperQuestion.checkAssessmentScore(locals);
    };

    /**
     * Replaces the server.js and server.py files for addVectors and partialCredit3 with files that have
     * incorrect grade functions.
     */
    var useIncorrectGradeFunctions = function() {
        describe('Replace server files for addVectors and partialCredit3 with files that have incorrect grade functions', function() {
            it('should succeed for addVectors', function(callback) {
                fs.copyFile(addVectorsIncorrectServerPath, addVectorsServerPath, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            });

            it('should succeed for partialCredit3', function(callback) {
                fs.copyFile(partialCredit3IncorrectServerPath, partialCredit3ServerPath, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            });
        });
    };

    /**
     * Restores the original server.py or server.js files for addVectors and partialCredit3.
     */
    var restoreServerFiles = function() {
        describe('Restore the original server files for addVectors and partialCredit3', function() {
            it('should succeed for addVectors', function(callback) {
                fs.copyFile(addVectorsCorrectServerPath, addVectorsServerPath, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            });

            it('should succeed for partialCredit3', function(callback) {
                fs.copyFile(partialCredit3CorrectServerPath, partialCredit3ServerPath, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            });
        });
    };

    /**
     * Ensures that the instructor assessment instance page for the current assessment instance
     * contains no regrade buttons. Assumes that startExam(examNumber) has been called.
     */
    var ensureNoRegradeButtons = function() {
        describe('The instructor assessment instance page', function() {
            it('should load successfully', function(callback) {
                request(locals.instructorAssessmentInstanceUrl, function(error, response, body) {
                    if (error) {
                        return callback(error);
                    }
                    if (response.statusCode != 200) {
                        return callback(new Error('bad status: ' + response.statusCode));
                    }
                    res = response;
                    page = body;
                    callback(null);
                });
            });
            it('should parse', function() {
                locals.$ = cheerio.load(page);
            });
            it('should not contain a "Regrade" column', function() {
                elemList = locals.$('tr th:contains("Regrade")');
                assert.lengthOf(elemList, 0);
            });
            it('should not contain any "Regrade" buttons', function() {
                elemList = locals.$('td button:contains("Regrade")');
                assert.lengthOf(elemList, 0);
            });
        });
    };

    /**
     * Closes the current assessment instance. Assumes that startExam(examNumber) has been called.
     */
    var closeAssessmentInstance = function() {
        describe('Close the assessment instance', function() {
            it('should successfully access the assessment instance', function(callback) {
                request(locals.assessmentInstanceUrl, function(error, response, body) {
                    if (error) {
                        return callback(error);
                    }
                    if (response.statusCode != 200) {
                        return callback(new Error('bad status: ' + response.statusCode));
                    }
                    res = response;
                    page = body;
                    callback(null);
                });
            });
            it('should extract the CSRF token into locals.__csrf_token', function() {
                locals.$ = cheerio.load(page);
                elemList = locals.$('form input[name="__csrf_token"]');
                assert.lengthOf(elemList, 1);
                assert.nestedProperty(elemList[0], 'attribs.value');
                locals.__csrf_token = elemList[0].attribs.value;
                assert.isString(locals.__csrf_token);
            });
            it('should simulate a time-limit expiration to close the assessment instance', function() {
                const form = {
                    __action: 'timeLimitFinish',
                    __csrf_token: locals.__csrf_token,
                };
                const response = await helperClient.fetchCheerio(locals.assessmentInstanceUrl, { method: 'POST', form });
                assert.equal(response.status, 403);
        
                // We should have been redirected back to the same assessment instance
                assert.equal(response.url, locals.assessmentInstanceUrl + '?timeLimitExpired=true');
        
                // we should not have any questions
                assert.lengthOf(response.$('a:contains("Question 1")'), 0);
        
                // we should have the "assessment closed" message
                const msg = response.$('div.test-suite-assessment-closed-message');
                assert.lengthOf(msg, 1);
                assert.match(msg.text(), /Assessment .* is no longer available/);
            });
            it('should ensure that the assessment instance is closed', function() {
                const params = {
                    assessment_id: locals.assessment_id,
                }
                const results = await sqldb.queryAsync(sql.select_assessment_instances_with_assessment_id, params);
                assert.equal(results.rowCount, 1);
                assert.equal(results.rows[0].open, false);
            });
        });
    };

    /**
     * Makes a POST request to regrade the given instance question in the current assessment instance.
     * If keepHighestScore is true, then the regrade will only change the question's score if the
     * regrade results in a higher score. If keepHighestScore is false, then the question's score will
     * always be updated with the regraded score, even if the regrade results in a lower score.
     * 
     * @param {*} question the instance question to regrade
     * @param {*} keepHighestScore whether we should keep the question's original score if the regraded
     * score is lower
     */
    var postRegradeForm = function(question, keepHighestScore) {
        it('should successfully POST regrade form and redirect to grading job page', function(callback) {
            const form = {
                __action: 'regrade_question',
                __csrf_token: locals.__csrf_token,
                update_method: keepHighestScore ? 'highest-score-update' : 'allow-decrease',
                instance_question_id: question.id,
            };
            request.post({url: locals.instructorAssessmentInstanceUrl, form: form, followAllRedirects: true}, function(error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 200) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                assert.match(response.req.path, /\/pl\/course_instance\/1\/instructor\/jobSequence\/\d+/);
                callback(null);
            });
        });
    };

    describe('Copy original server files for addVectors and partialCredit3 into temp files', function() {
        it('should succeed for addVectors', function(callback) {
            fs.copyFile(addVectorsServerPath, addVectorsCorrectServerPath, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });

        it('should succeed for partialCredit3', function(callback) {
            fs.copyFile(partialCredit3ServerPath, partialCredit3CorrectServerPath, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    });

    describe('Regrading questions on assessment with real-time grading enabled', function() {
        startExam('11');
        useIncorrectGradeFunctions();

        describe('Make submissions for addVectors', function() {
            describe('Save an incorrect answer', function() {
                const expectedResult = {
                    submission_score: null,
                    submission_correct: null,
                    instance_question_points: 0,
                    instance_question_score_perc: (0 / 11) * 100,
                    assessment_instance_points: 0,
                    assessment_instance_score_perc: (0 / assessmentMaxPoints) * 100,
                };

                submitAnswer(['grade', 'save'], 'save', questions.addVectors, expectedResult, function(variant) {
                    return {
                        wx: -500,
                        wy: 700,
                    };
                });
            });

            describe('Save and grade the true correct answer, which will mistakenly be marked as incorrect', function() {
                const expectedResult = {
                    submission_score: 0,
                    submission_correct: false,
                    instance_question_points: 0,
                    instance_question_score_perc: 0,
                    assessment_instance_points: 0,
                    assessment_instance_score_perc: 0,
                };

                submitAnswer(['grade', 'save'], 'grade', questions.addVectors, expectedResult, function(variant) {
                    return {
                        wx: variant.params.ux + variant.params.vx,
                        wy: variant.params.uy + variant.params.vy,
                    };
                });
            });

            describe('Save and grade an incorrect answer which will mistakenly be marked as correct', function() {
                const expectedResult = {
                    submission_score: 1,
                    submission_correct: true,
                    instance_question_points: 8,
                    instance_question_score_perc: (8 / 11) * 100,
                    assessment_instance_points: 8,
                    assessment_instance_score_perc: (8 / assessmentMaxPoints) * 100,
                };
    
                submitAnswer(['grade', 'save'], 'grade', questions.addVectors, expectedResult, function(variant) {
                    return {
                        wx: variant.true_answer.wx,
                        wy: variant.true_answer.wy,
                    };
                });
            });
        });

        describe('Make submissions for partialCredit3', function() {
            describe('Save and grade an answer of "70", which gives 70% of the available points', function() {
                const points = 13 * 0.7;
                const expectedResult = {
                    submission_score: 0.7,
                    submission_correct: false,
                    instance_question_points: (points / 13) * 100,
                    instance_question_score_perc: 70,
                    assessment_instance_points: 8 + points,   // the 8 points are from the previous submissions for addVectors
                    assessment_instance_score_perc: ((8 + points) / assessmentMaxPoints) * 100,
                };

                submitAnswer(['grade', 'save'], 'grade', questions.partialCredit3, expectedResult, function(_variant) {
                    return {
                        s: 70,
                    };
                });
            });

            describe('Save and grade an answer of "50", which mistakenly gives 100% of the available points', function() {
                const points = 13 * 0.7 + 12 * 0.3;
                const expectedResult = {
                    submission_score: 0.7,
                    submission_correct: false,
                    instance_question_points: points,
                    instance_question_score_perc: (points / 13) * 100,
                    assessment_instance_points: 8 + points,     // the 8 points are from the previous submissions for addVectors
                    assessment_instance_score_perc: ((8 + points) / assessmentMaxPoints) * 100,
                };

                submitAnswer(['grade', 'save'], 'grade', questions.partialCredit3, expectedResult, function(_variant) {
                    return {
                        s: 50,
                    };
                });
            });
        });
        
        config.regradeActive = false;

        describe('When config.regradeActive is false', function() {
            ensureNoRegradeButtons();
        });

        config.regradeActive = true;

        describe('When config.regradeActive is true and the assessment instance is open', function() {
            ensureNoRegradeButtons();
        });

        closeAssessmentInstance();
        locals.expectedResult = {
            assessment_instance_points: 8 + 13 * 0.7 + 12 * 0.3,
            assessment_instance_score_perc: ((8 + 13 * 0.7 + 12 * 0.3) / assessmentMaxPoints) * 100,
        };
        helperQuestion.checkAssessmentScore(locals);
        
        restoreServerFiles();

        describe('When config.regradeActive is true and the assessment instance is closed', function() {
            describe('The instructor assessment instance page', function() {
                it('should load successfully', function(callback) {
                    request(locals.instructorAssessmentInstanceUrl, function(error, response, body) {
                        if (error) {
                            return callback(error);
                        }
                        if (response.statusCode != 200) {
                            return callback(new Error('bad status: ' + response.statusCode));
                        }
                        res = response;
                        page = body;
                        callback(null);
                    });
                });
                it('should parse', function() {
                    locals.$ = cheerio.load(page);
                });
                it('should contain a "Regrade" column', function() {
                    elemList = locals.$('tr th:contains("Regrade")');
                    assert.lengthOf(elemList, 0);
                });
                it(`should contain ${questionsArray.length} "Regrade" buttons`, function() {
                    elemList = locals.$('td button:contains("Regrade")');
                    assert.lengthOf(elemList, questionsArray.length);
                });
                it('should have a CSRF token', function() {
                    elemList = locals.$('form input[name="__csrf_token"]');
                    assert.lengthOf(elemList, 1);
                    assert.nestedProperty(elemList[0], 'attribs.value');
                    locals.__csrf_token = elemList[0].attribs.value;
                    assert.isString(locals.__csrf_token);
                });
            });

            describe('Regrading addVectors and keeping the highest score', function() {
                locals.question = questions.addVectors;
                postRegradeForm(locals.question, true);

                it('should wait for 10 seconds', function(callback) {
                    setTimeout(callback, 10000);
                });

                const totalPoints = 11 + 13 * 0.7 + 12 * 0.3;
                locals.expectedResult = {
                    instance_question_points: 11,
                    instance_question_score_perc: 100,
                    assessment_instance_points: totalPoints,
                    assessment_instance_score_perc: (totalPoints / assessmentMaxPoints) * 100,
                };

                it('should have updated question score correctly', function() {
                    helperQuestion.checkQuestionPointsAndPercentage(locals);
                });

                it('should have updated assessment score correctly', function() {
                    helperQuestion.checkAssessmentScore(locals);
                });
            });

            describe('Regrading partialCredit3 and keeping the highest score', function() {
                locals.question = questions.partialCredit3;
                postRegradeForm(locals.question, true);

                it('should wait for 10 seconds', function(callback) {
                    setTimeout(callback, 10000);
                });

                const totalPoints = 11 + 13 * 0.7 + 12 * 0.3;

                locals.expectedResult = {
                    instance_question_points: 13 * 0.7 + 12 * 0.3,  // The regraded score is lower, so we keep the original score
                    instance_question_score_perc: 70 + (12 / 13) * 30,
                    assessment_instance_points: totalPoints,
                    assessment_instance_score_perc: (totalPoints / assessmentMaxPoints) * 100,
                };

                it('should have updated question score correctly', function() {
                    helperQuestion.checkQuestionPointsAndPercentage(locals);
                });

                it('should have updated assessment score correctly', function() {
                    helperQuestion.checkAssessmentScore(locals);
                });
            });

            describe('Regrading addVectors and keeping the regraded score', function() {
                locals.question = questions.addVectors;
                postRegradeForm(locals.question, false);

                it('should wait for 10 seconds', function(callback) {
                    setTimeout(callback, 10000);
                });

                const totalPoints = 11 + 13 * 0.7 + 12 * 0.3;

                locals.expectedResult = {
                    instance_question_points: 11,
                    instance_question_score_perc: 100,
                    assessment_instance_points: totalPoints,
                    assessment_instance_score_perc: (totalPoints / assessmentMaxPoints) * 100,
                };

                it('should have updated question score correctly', function() {
                    helperQuestion.checkQuestionPointsAndPercentage(locals);
                });

                it('should have updated assessment score correctly', function() {
                    helperQuestion.checkAssessmentScore(locals);
                });
            });

            describe('Regrading partialCredit3 and keeping the regraded score', function() {
                locals.question = questions.partialCredit3;
                postRegradeForm(locals.question, false);

                it('should wait for 10 seconds', function(callback) {
                    setTimeout(callback, 10000);
                });

                const totalPoints = 11 + 13 * 0.7 + 12 * 0.15;

                locals.expectedResult = {
                    instance_question_points: 13 * 0.7 + 12 * 0.15,
                    instance_question_score_perc: 70 + (12 / 13) * 15,
                    assessment_instance_points: totalPoints,
                    assessment_instance_score_perc: (totalPoints / assessmentMaxPoints) * 100,
                };

                it('should have updated question score correctly', function() {
                    helperQuestion.checkQuestionPointsAndPercentage(locals);
                });

                it('should have updated assessment score correctly', function() {
                    helperQuestion.checkAssessmentScore(locals);
                });
            });
        });
    });

    describe('Regrading questions on assessment with real-time grading disabled', function() {
        startExam('12');
        useIncorrectGradeFunctions();

        locals.expectedResult = {
            submission_score: null,
            submission_correct: null,
            instance_question_points: 0,
            instance_question_score_perc: 0,
            assessment_instance_points: 0,
            assessment_instance_score_perc: 0,
        };

        describe('Make submissions for addVectors', function() {
            describe('Save an incorrect answer', function() {
                submitAnswer(['save'], 'save', questions.addVectors, locals.expectedResult, function(variant) {
                    return {
                        wx: variant.true_answer.wx,
                        wy: variant.true_answer.wy,
                    };
                });
            });

            describe('Save the true correct answer', function() {
                submitAnswer(['save'], 'save', questions.addVectors, locals.expectedResult, function(variant) {
                    return {
                        wx: variant.params.ux + variant.params.vx,
                        wy: variant.params.uy + variant.params.vy,
                    };
                });
            });

            describe('Save an incorrect answer which will mistakenly be marked as correct when the exam closes', function() {
                submitAnswer(['save'], 'save', questions.addVectors, locals.expectedResult, function(variant) {
                    return {
                        wx: variant.true_answer.wx,
                        wy: variant.true_answer.wy,
                    };
                });
            });
        });

        describe('Make submissions for partialCredit3', function() {
            describe('Save an answer of "70"', function() {
                submitAnswer(['grade', 'save'], 'grade', questions.partialCredit3, locals.expectedResult, function(_variant) {
                    return {
                        s: 70,
                    };
                });
            });

            describe('Save an answer of "50", which will mistakenly give 100% of the available points when graded', function() {
                submitAnswer(['grade', 'save'], 'grade', questions.partialCredit3, locals.expectedResult, function(_variant) {
                    return {
                        s: 50,
                    };
                });
            });
        });
        
        config.regradeActive = false;

        describe('When config.regradeActive is false', function() {
            ensureNoRegradeButtons();
        });

        config.regradeActive = true;

        describe('When config.regradeActive is true and the assessment instance is open', function() {
            ensureNoRegradeButtons();
        });

        closeAssessmentInstance();
        locals.expectedResult = {
            assessment_instance_points: 24,
            assessment_instance_score_perc: 100,
        };
        helperQuestion.checkAssessmentScore(locals);
        
        restoreServerFiles();

        describe('When config.regradeActive is true and the assessment instance is closed', function() {
            describe('The instructor assessment instance page', function() {
                it('should load successfully', function(callback) {
                    request(locals.instructorAssessmentInstanceUrl, function(error, response, body) {
                        if (error) {
                            return callback(error);
                        }
                        if (response.statusCode != 200) {
                            return callback(new Error('bad status: ' + response.statusCode));
                        }
                        res = response;
                        page = body;
                        callback(null);
                    });
                });
                it('should parse', function() {
                    locals.$ = cheerio.load(page);
                });
                it('should contain a "Regrade" column', function() {
                    elemList = locals.$('tr th:contains("Regrade")');
                    assert.lengthOf(elemList, 0);
                });
                it(`should contain ${questionsArray.length} "Regrade" buttons`, function() {
                    elemList = locals.$('td button:contains("Regrade")');
                    assert.lengthOf(elemList, questionsArray.length);
                });
                it('should have a CSRF token', function() {
                    elemList = locals.$('form input[name="__csrf_token"]');
                    assert.lengthOf(elemList, 1);
                    assert.nestedProperty(elemList[0], 'attribs.value');
                    locals.__csrf_token = elemList[0].attribs.value;
                    assert.isString(locals.__csrf_token);
                });
            });

            describe('Regrading addVectors and keeping the highest score', function() {
                locals.question = questions.addVectors;
                postRegradeForm(locals.question, true);

                it('should wait for 10 seconds', function(callback) {
                    setTimeout(callback, 10000);
                });

                // Regrading the question gives a score of 0, which is lower than the original score, so we
                // keep the original score.
                locals.expectedResult = {
                    instance_question_points: 11,
                    instance_question_score_perc: 100,
                    assessment_instance_points: 24,
                    assessment_instance_score_perc: 100,
                };

                it('should have updated question score correctly', function() {
                    helperQuestion.checkQuestionPointsAndPercentage(locals);
                });

                it('should have updated assessment score correctly', function() {
                    helperQuestion.checkAssessmentScore(locals);
                });
            });

            describe('Regrading partialCredit3 and keeping the highest score', function() {
                locals.question = questions.partialCredit3;
                postRegradeForm(locals.question, true);

                it('should wait for 10 seconds', function(callback) {
                    setTimeout(callback, 10000);
                });

                // Regrading the question gives a score of 0, which is lower than the original score, so we
                // keep the original score.
                locals.expectedResult = {
                    instance_question_points: 13,
                    instance_question_score_perc: 100,
                    assessment_instance_points: 24,
                    assessment_instance_score_perc: 100,
                };

                it('should have updated question score correctly', function() {
                    helperQuestion.checkQuestionPointsAndPercentage(locals);
                });

                it('should have updated assessment score correctly', function() {
                    helperQuestion.checkAssessmentScore(locals);
                });
            });

            describe('Regrading addVectors and keeping the regraded score', function() {
                locals.question = questions.addVectors;
                postRegradeForm(locals.question, false);

                it('should wait for 10 seconds', function(callback) {
                    setTimeout(callback, 10000);
                });

                // Regrading the question gives a score of 0, and we keep this score.
                locals.expectedResult = {
                    instance_question_points: 0,
                    instance_question_score_perc: 0,
                    assessment_instance_points: 13, // we still have 13 points from partialCredit3
                    assessment_instance_score_perc: (13 / assessmentMaxPoints) * 100,
                };

                it('should have updated question score correctly', function() {
                    helperQuestion.checkQuestionPointsAndPercentage(locals);
                });

                it('should have updated assessment score correctly', function() {
                    helperQuestion.checkAssessmentScore(locals);
                });
            });

            describe('Regrading partialCredit3 and keeping the regraded score', function() {
                locals.question = questions.partialCredit3;
                postRegradeForm(locals.question, false);

                it('should wait for 10 seconds', function(callback) {
                    setTimeout(callback, 10000);
                });

                // Regrading the question gives a score of 0, and we keep this score.
                locals.expectedResult = {
                    instance_question_points: 0,
                    instance_question_score_perc: 0,
                    assessment_instance_points: 0,
                    assessment_instance_score_perc: 0,
                };

                it('should have updated question score correctly', function() {
                    helperQuestion.checkQuestionPointsAndPercentage(locals);
                });

                it('should have updated assessment score correctly', function() {
                    helperQuestion.checkAssessmentScore(locals);
                });
            });
        });
    });

    describe('Delete copies of server files for addVectors and partialCredit3', function() {
        it('should succeed for addVectors', function(callback) {
            fs.unlink(addVectorsCorrectServerPath, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });

        it('should succeed for partialCredit3', function(callback) {
            fs.unlink(partialCredit3CorrectServerPath, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    });
});
