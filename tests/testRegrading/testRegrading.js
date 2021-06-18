const ERR = require('async-stacktrace');
const fs = require('fs');
const _ = require('lodash');
const assert = require('chai').assert;
const request = require('request');
const cheerio = require('cheerio');
const path = require('path');

const config = require('../../lib/config');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

var res, page, elemList;

const helperClient = require('../helperClient');
const helperServer = require('../helperServer');
const helperQuestion = require('../helperQuestion');

const locals = {};

const examQuestionsArray = [
    {qid: 'addVectors', type: 'Calculation', maxPoints: 11},
    {qid: 'partialCredit3', type: 'Freeform', maxPoints: 13},
];
const hwQuestionsArray = [
    {qid: 'partialCredit3', type: 'Freeform', maxPoints: 6},
];

const examMaxPoints = examQuestionsArray.reduce(function(maxPointsSum, question) {
    return maxPointsSum + question.maxPoints;
}, 0);
const hwMaxPoints = hwQuestionsArray.reduce(function(maxPointsSum, question) {
    return maxPointsSum + question.maxPoints;
}, 0);

const addVectorsServerPath = path.resolve(__dirname, '../../testCourse/questions/addVectors/server.js');
const addVectorsCorrectedServerPath = path.resolve(__dirname, './serverFiles/addVectorsCorrectedServer.js');
const addVectorsIncorrectServerPath = path.resolve(__dirname, './serverFiles/addVectorsIncorrectServer.js');
const addVectorsServerCopyPath = path.resolve(__dirname, './serverFiles/addVectorsServerCopy.js');

const partialCredit3ServerPath = path.resolve(__dirname, '../../testCourse/questions/partialCredit3/server.py');
const partialCredit3CorrectedServerPath = path.resolve(__dirname, './serverFiles/partialCredit3CorrectedServer.py');
const partialCredit3IncorrectServerPath = path.resolve(__dirname, './serverFiles/partialCredit3IncorrectServer.py');
const partialCredit3ServerCopyPath = path.resolve(__dirname, './serverFiles/partialCredit3ServerCopy.js');

const examQuestions = _.keyBy(examQuestionsArray, 'qid');
const hwQuestions = _.keyBy(hwQuestionsArray, 'qid');

describe('Regrading', function() {
    this.timeout(60000);

    before('set up testing server', helperServer.before());
    after('shut down testing server', helperServer.after);

    /**
     * Restarts the testing server, then creates a new assessment instance for the assessment
     * with the given number (note: the isExam parameter indicates whether the assessment is 
     * an exam or not). If isExam is false, the assessment is assumed to be a homework.
     * 
     * @param {number} assessmentNumber the number of the assessment to create an assessment instance for
     * @param {boolean} isExam true if the asseessment is an exam, false otherwise.
     */
    var startAssessment = function(assessmentNumber, isExam) {
        const assessmentCode = isExam ? `E${assessmentNumber}` : `HW${assessmentNumber}`;
        const questionsArray = isExam ? examQuestionsArray : hwQuestionsArray;

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

        describe('startAssessment-1. the locals object', function() {
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

        describe('startAssessment-2. the questions', function() {
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

        describe('startAssessment-3. the database', function() {
            it(`should contain ${assessmentCode}`, function(callback) {
                const params = {
                    assessment_number: assessmentNumber.toString(),
                    abbreviation: isExam ? 'E' : 'HW',
                };
                sqldb.queryOneRow(sql.select_assessment, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    locals.assessment_id = result.rows[0].id;
                    callback(null);
                });
            });
        });

        describe('startAssessment-4. GET to assessments URL', function() {
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
            it(`should contain ${assessmentCode}`, function() {
                if (assessmentCode == 'HW8') {
                    elemList = locals.$('td a:contains("Test Regrading for Homework Assessment")');
                } else if (assessmentCode == 'E11') {
                    elemList = locals.$('td a:contains("Test regrading with real-time grading enabled")');
                } else { // assessmentCode == 'E12'
                    elemList = locals.$('td a:contains("Test regrading with real-time grading disabled")');
                }
                assert.lengthOf(elemList, 1);
            });
            it(`should have the correct link for ${assessmentCode}`, function() {
                locals.assessmentUrl = locals.siteUrl + elemList[0].attribs.href;
                assert.equal(locals.assessmentUrl, locals.courseInstanceBaseUrl + '/assessment/' + locals.assessment_id + '/');
            });
        });

        describe('startAssessment-5. GET to assessment URL', function() {
            it('should load successfully', function(callback) {
                // We assign values to locals.preStartTime and locals.postStartTime for homework assessments.
                // If the requested assessment is an exam, locals.preStartTime and locals.postStartTime will
                // be overriden in the "startAssessment-6" describe block.

                locals.preStartTime = Date.now();
                request(locals.assessmentUrl, function(error, response, body) {
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

            if (isExam) {
                const examString = `"Exam ${assessmentNumber}"`;

                it('should parse', function() {
                    locals.$ = cheerio.load(page);
                });
                it(`should contain ${examString}`, function() {
                    elemList = locals.$(`p.lead strong:contains(${examString})`);
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
            }
        });

        describe('startAssessment-6. the assessment', function() {
            if (isExam) {
                it('should successfully POST to assessment URL to create an assessment instance', function(callback) {
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
            }
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

        describe('startAssessment-7. GET to assessment_instance URL', function() {
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
     * @param {string[]} buttons an array of button names (e.g. 'save' or 'grade') that should appear when viewing the question
     * @param {string} postAction a string indicating what action to perform with the submission (e.g. 'save' or 'grade')
     * @param {*} question the instance question to submit an answer to
     * @param {*} expectedResult the expected result of the submission
     * @param {Function} getSubmittedAnswer a function that returns the answer to be submitted
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
    var useIncorrectServerFiles = function() {
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
     * Replaces the server.js and server.py files for addVectors and partialCredit3 with files
     * that have corrected grade functions.
     */
    var useCorrectedServerFiles = function() {
        describe('Replace server files for addVectors and partialCredit3 with files that have corrected grade functions', function() {
            it('should succeed for addVectors', function(callback) {
                fs.copyFile(addVectorsCorrectedServerPath, addVectorsServerPath, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            });

            it('should succeed for partialCredit3', function(callback) {
                fs.copyFile(partialCredit3CorrectedServerPath, partialCredit3ServerPath, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            });
        });
    };

    /**
     * Ensures that the regrade buttons are either visible (if canRegrade is true) or not
     * visible (if canRegrade is false) on the instructor assessment instance page.
     *
     * @param {boolean} canRegrade whether the "Questions" table on the instructor assessment instance
     * page should have a column containing regrade buttons
     * @param {boolean} isExam true if the current assessment instance is an exam, false otherwise
     */
    var checkRegradeButtons = function(canRegrade, isExam) {
        const questionsArray = isExam ? examQuestionsArray : hwQuestionsArray;

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
            if (canRegrade) {
                it('should contain a "Regrade" column', function() {
                    elemList = locals.$('tr th:contains("Regrade")');
                    assert.lengthOf(elemList, 1);
                });
                it(`should contain ${questionsArray.length} "Regrade" buttons`, function() {
                    elemList = locals.$('td button:contains("Regrade")');
                    assert.lengthOf(elemList, questionsArray.length);
                });
            } else {
                it('should not contain a "Regrade" column', function() {
                    elemList = locals.$('tr th:contains("Regrade")');
                    assert.lengthOf(elemList, 0);
                });
                it('should not contain any "Regrade" buttons', function() {
                    elemList = locals.$('td button:contains("Regrade")');
                    assert.lengthOf(elemList, 0);
                });
            }
        });
    };

    /**
     * Closes the current assessment instance. Assumes that the startAssessment function has been called.
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
                helperClient.extractAndSaveCSRFToken(locals, locals.$, 'form[name="finish-form"]');
            });
            it('should close the assessment instance', function(callback) {
                const form = {
                    __action: 'finish',
                    __csrf_token: locals.__csrf_token,
                };
                request.post({url: locals.assessmentInstanceUrl, form: form, followAllRedirects: true}, function(error, _response, _body) {
                    if (error) {
                        return callback(error);
                    }
                    callback(null);
                });
            });
            it('should ensure that the assessment instance is closed', function(callback) {
                const params = {
                    id: locals.assessment_instance.id,
                };
                sqldb.queryOneRow(sql.select_assessment_instance_open, params, (err, result) => {
                    if (ERR(err, callback)) return;
                    assert.equal(result.rows[0].open, false);
                    callback(null);
                });
            });
        });
    };

    /**
     * Makes a POST request to regrade the given instance question in the current assessment instance.
     * If keepHighestScore is true, then the regrade will only change the question's score if the
     * regrade results in a higher score. If keepHighestScore is false, then the question's score will
     * always be updated with the regraded score, even if the regrade results in a lower score.
     * 
     * Assumes that the instance question can be regraded, i.e. config.regradeActive is true and the
     * assessment instance is closed.
     *
     * @param {*} question the instance question to regrade
     * @param {boolean} keepHighestScore whether we should keep the question's original score if the 
     * regraded score is lower
     */
    var postRegradeForm = function(question, keepHighestScore) {
        describe('Start regrade', function() {
            it('should access the instructor assessment instance page', function(callback) {
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
            it('should extract a CSRF token', function() {
                const regradeFormHTML = locals.$('td button:contains("Regrade")')[0].attribs['data-content'];
                locals.$ = cheerio.load(regradeFormHTML);
                helperClient.extractAndSaveCSRFToken(locals, locals.$);
            });
            it('should successfully POST regrade form and redirect to grading job page', function(callback) {
                const form = {
                    __action: 'regrade_question',
                    __csrf_token: locals.__csrf_token,
                    update_method: keepHighestScore ? 'highest-score-update' : 'allow-decrease',
                    instance_question_id: question.id,
                };
                request.post({url: locals.instructorAssessmentInstanceUrl, form: form, followAllRedirects: true}, function(error, response, _body) {
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
        });
    };

    describe('Copy original server files for addVectors and partialCredit3 into temp files', function() {
        it('should succeed for addVectors', function(callback) {
            fs.copyFile(addVectorsServerPath, addVectorsServerCopyPath, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });

        it('should succeed for partialCredit3', function(callback) {
            fs.copyFile(partialCredit3ServerPath, partialCredit3ServerCopyPath, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    });

    describe('Regrading questions on exam with real-time grading enabled', function() {
        useIncorrectServerFiles();
        startAssessment(11, true);

        describe('Make submissions for addVectors', function() {
            describe('Save an incorrect answer', function() {
                const expectedResult = {
                    submission_score: null,
                    submission_correct: null,
                    instance_question_points: 0,
                    instance_question_score_perc: 0,
                    assessment_instance_points: 0,
                    assessment_instance_score_perc: 0,
                };

                submitAnswer(['grade', 'save'], 'save', examQuestions.addVectors, expectedResult, function(_variant) {
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

                submitAnswer(['grade', 'save'], 'grade', examQuestions.addVectors, expectedResult, function(variant) {
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
                    assessment_instance_score_perc: (8 / examMaxPoints) * 100,
                };
    
                submitAnswer(['grade', 'save'], 'grade', examQuestions.addVectors, expectedResult, function(variant) {
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
                    instance_question_points: points,
                    instance_question_score_perc: (points / 13) * 100,
                    assessment_instance_points: 8 + points,   // the 8 points are from the previous submissions for addVectors
                    assessment_instance_score_perc: ((8 + points) / examMaxPoints) * 100,
                };

                submitAnswer(['grade', 'save'], 'grade', examQuestions.partialCredit3, expectedResult, function(_variant) {
                    return {
                        s: 70,
                    };
                });
            });

            describe('Save and grade an answer of "50", which mistakenly gives 100% of the available points', function() {
                const points = 13 * 0.7 + 12 * 0.3;
                const expectedResult = {
                    submission_score: 1,
                    submission_correct: true,
                    instance_question_points: points,
                    instance_question_score_perc: (points / 13) * 100,
                    assessment_instance_points: 8 + points,     // the 8 points are from the previous submissions for addVectors
                    assessment_instance_score_perc: ((8 + points) / examMaxPoints) * 100,
                };

                submitAnswer(['grade', 'save'], 'grade', examQuestions.partialCredit3, expectedResult, function(_variant) {
                    return {
                        s: 50,
                    };
                });
            });
        });
        
        describe('Set config.regradeActive to false', function() {
            it('should succeed', function() {
                config.regradeActive = false;
            });
        });

        describe('When config.regradeActive is false', function() {
            checkRegradeButtons(false, true);
        });

        closeAssessmentInstance();

        describe('Set expected assessment instance score in locals.expectedResult', function() {
            it('should succeed', function() {
                locals.expectedResult = {
                    assessment_instance_points: 8 + 13 * 0.7 + 12 * 0.3,
                    assessment_instance_score_perc: ((8 + 13 * 0.7 + 12 * 0.3) / examMaxPoints) * 100,
                };
            });
        });
        
        helperQuestion.checkAssessmentScore(locals);
        useCorrectedServerFiles();

        describe('Set config.regradeActive to true', function() {
            it('should succeed', function() {
                config.regradeActive = true;
            });
        });

        describe('When config.regradeActive is true', function() {
            checkRegradeButtons(true, true);
        });

        describe('Regrading addVectors and keeping the highest score', function() {
            describe('Set question and expected scores in locals object', function() {
                it('should succeed', function() {
                    locals.question = examQuestions.addVectors;
                    const instanceQuestionPoints = 11;
                    const assessmentPoints = instanceQuestionPoints + 13 * 0.7 + 12 * 0.3;

                    locals.expectedResult = {
                        instance_question_points: instanceQuestionPoints,
                        instance_question_score_perc: (instanceQuestionPoints / 11) * 100,
                        assessment_instance_points: assessmentPoints,
                        assessment_instance_score_perc: (assessmentPoints / examMaxPoints) * 100,
                    };
                });
            });

            // For some reason, we cannot pass in locals.question to postRegradeForm, because
            // apparently locals.question evaluates to undefined. Why?
            postRegradeForm(examQuestions.addVectors, true);
            helperQuestion.waitForJobSequence(locals);
            helperQuestion.checkQuestionPointsAndPercentage(locals);
            helperQuestion.checkAssessmentScore(locals);
        });

        describe('Regrading partialCredit3 and keeping the highest score', function() {
            describe('Set question and expected scores in locals object', function() {
                it('should succeed', function() {
                    locals.question = examQuestions.partialCredit3;
                    const instanceQuestionPoints = 13 * 0.7 + 12 * 0.3; // The regraded score is lower, so we keep the original score
                    const assessmentPoints = instanceQuestionPoints + 11;

                    locals.expectedResult = {
                        instance_question_points: instanceQuestionPoints,
                        instance_question_score_perc: (instanceQuestionPoints / 13) * 100,
                        assessment_instance_points: assessmentPoints,
                        assessment_instance_score_perc: (assessmentPoints / examMaxPoints) * 100,
                    };
                });
            });

            postRegradeForm(examQuestions.partialCredit3, true);
            helperQuestion.waitForJobSequence(locals);
            helperQuestion.checkQuestionPointsAndPercentage(locals);
            helperQuestion.checkAssessmentScore(locals);
        });

        describe('Regrading addVectors and keeping the regraded score', function() {
            describe('Set question and expected scores in locals object', function() {
                it('should succeed', function() {
                    locals.question = examQuestions.addVectors;
                    const instanceQuestionPoints = 11;
                    const assessmentPoints = instanceQuestionPoints + 13 * 0.7 + 12 * 0.3;

                    locals.expectedResult = {
                        instance_question_points: instanceQuestionPoints,
                        instance_question_score_perc: (instanceQuestionPoints / 11) * 100,
                        assessment_instance_points: assessmentPoints,
                        assessment_instance_score_perc: (assessmentPoints / examMaxPoints) * 100,
                    };
                });
            });

            postRegradeForm(examQuestions.addVectors, false);
            helperQuestion.waitForJobSequence(locals);
            helperQuestion.checkQuestionPointsAndPercentage(locals);
            helperQuestion.checkAssessmentScore(locals);
        });

        describe('Regrading partialCredit3 and keeping the regraded score', function() {
            describe('Set question and expected scores in locals object', function() {
                it('should succeed', function() {
                    locals.question = examQuestions.partialCredit3;
                    const instanceQuestionPoints = 13 * 0.7;
                    const assessmentPoints = instanceQuestionPoints + 11;
                    
                    locals.expectedResult = {
                        instance_question_points: instanceQuestionPoints,
                        instance_question_score_perc: (instanceQuestionPoints / 13) * 100,
                        assessment_instance_points: assessmentPoints,
                        assessment_instance_score_perc: (assessmentPoints / examMaxPoints) * 100,
                    };
                });
            });

            postRegradeForm(examQuestions.partialCredit3, false);
            helperQuestion.waitForJobSequence(locals);
            helperQuestion.checkQuestionPointsAndPercentage(locals);
            helperQuestion.checkAssessmentScore(locals);
        });
    });

    describe('Regrading questions on exam with real-time grading disabled', function() {
        useIncorrectServerFiles();
        startAssessment(12, true);

        describe('Make submissions for addVectors', function() {
            describe('Save an incorrect answer', function() {
                const expectedResult = {
                    submission_score: null,
                    submission_correct: null,
                    instance_question_points: 0,
                    instance_question_score_perc: 0,
                    assessment_instance_points: 0,
                    assessment_instance_score_perc: 0,
                };

                submitAnswer(['save'], 'save', examQuestions.addVectors, expectedResult, function(variant) {
                    return {
                        wx: variant.true_answer.wx,
                        wy: variant.true_answer.wy,
                    };
                });
            });

            describe('Save the true correct answer', function() {
                const expectedResult = {
                    submission_score: null,
                    submission_correct: null,
                    instance_question_points: 0,
                    instance_question_score_perc: 0,
                    assessment_instance_points: 0,
                    assessment_instance_score_perc: 0,
                };

                submitAnswer(['save'], 'save', examQuestions.addVectors, expectedResult, function(variant) {
                    return {
                        wx: variant.params.ux + variant.params.vx,
                        wy: variant.params.uy + variant.params.vy,
                    };
                });
            });

            describe('Save an incorrect answer which will mistakenly be marked as correct when the exam closes', function() {
                const expectedResult = {
                    submission_score: null,
                    submission_correct: null,
                    instance_question_points: 0,
                    instance_question_score_perc: 0,
                    assessment_instance_points: 0,
                    assessment_instance_score_perc: 0,
                };

                submitAnswer(['save'], 'save', examQuestions.addVectors, expectedResult, function(variant) {
                    return {
                        wx: variant.true_answer.wx,
                        wy: variant.true_answer.wy,
                    };
                });
            });
        });

        describe('Make submissions for partialCredit3', function() {
            describe('Save an answer of "70"', function() {
                const expectedResult = {
                    submission_score: null,
                    submission_correct: null,
                    instance_question_points: 0,
                    instance_question_score_perc: 0,
                    assessment_instance_points: 0,
                    assessment_instance_score_perc: 0,
                };

                submitAnswer(['save'], 'save', examQuestions.partialCredit3, expectedResult, function(_variant) {
                    return {
                        s: 70,
                    };
                });
            });

            describe('Save an answer of "50", which will mistakenly give 100% of the available points when graded', function() {
                const expectedResult = {
                    submission_score: null,
                    submission_correct: null,
                    instance_question_points: 0,
                    instance_question_score_perc: 0,
                    assessment_instance_points: 0,
                    assessment_instance_score_perc: 0,
                };

                submitAnswer(['save'], 'save', examQuestions.partialCredit3, expectedResult, function(_variant) {
                    return {
                        s: 50,
                    };
                });
            });
        });
        
        describe('Set config.regradeActive to false', function() {
            it('should succeed', function() {
                config.regradeActive = false;
            });
        });

        describe('When config.regradeActive is false', function() {
            checkRegradeButtons(false, true);
        });
        
        closeAssessmentInstance();

        describe('Set expected assessment instance score in locals.expectedResult', function() {
            it('should succeed', function() {
                locals.expectedResult = {
                    assessment_instance_points: 24,
                    assessment_instance_score_perc: 100,
                };
            });
        });

        helperQuestion.checkAssessmentScore(locals);
        useCorrectedServerFiles();

        describe('Set config.regradeActive to true', function() {
            it('should succeed', function() {
                config.regradeActive = true;
            });
        });

        describe('When config.regradeActive is true', function() {
            checkRegradeButtons(true, true);
        });

        describe('Regrading addVectors and keeping the highest score', function() {
            describe('Set question and expected scores in locals object', function() {
                it('should succeed', function() {
                    locals.question = examQuestions.addVectors;

                    // Regrading the question gives a score of 0, which is lower than the original score, so we
                    // keep the original score.
                    locals.expectedResult = {
                        instance_question_points: 11,
                        instance_question_score_perc: 100,
                        assessment_instance_points: 24,
                        assessment_instance_score_perc: 100,
                    };
                });
            });
            
            postRegradeForm(examQuestions.addVectors, true);
            helperQuestion.waitForJobSequence(locals);
            helperQuestion.checkQuestionPointsAndPercentage(locals);
            helperQuestion.checkAssessmentScore(locals);
        });

        describe('Regrading partialCredit3 and keeping the highest score', function() {
            describe('Set question and expected scores in locals object', function() {
                it('should succeed', function() {
                    locals.question = examQuestions.partialCredit3;

                    // Regrading the question gives a score of 0, which is lower than the original score, so we
                    // keep the original score.
                    locals.expectedResult = {
                        instance_question_points: 13,
                        instance_question_score_perc: 100,
                        assessment_instance_points: 24,
                        assessment_instance_score_perc: 100,
                    };
                });
            });
            
            postRegradeForm(examQuestions.partialCredit3, true);
            helperQuestion.waitForJobSequence(locals);
            helperQuestion.checkQuestionPointsAndPercentage(locals);
            helperQuestion.checkAssessmentScore(locals);
        });

        describe('Regrading addVectors and keeping the regraded score', function() {
            describe('Set question and expected scores in locals object', function() {
                it('should succeed', function() {
                    locals.question = examQuestions.addVectors;
                    
                    // Regrading the question gives a score of 0, and we keep this score.
                    locals.expectedResult = {
                        instance_question_points: 0,
                        instance_question_score_perc: 0,
                        assessment_instance_points: 13, // we still have 13 points from partialCredit3
                        assessment_instance_score_perc: (13 / examMaxPoints) * 100,
                    };
                });
            });

            postRegradeForm(examQuestions.addVectors, false);
            helperQuestion.waitForJobSequence(locals);
            helperQuestion.checkQuestionPointsAndPercentage(locals);
            helperQuestion.checkAssessmentScore(locals);
        });

        describe('Regrading partialCredit3 and keeping the regraded score', function() {
            describe('Set question and expected scores in locals object', function() {
                it('should succeed', function() {
                    locals.question = examQuestions.partialCredit3;

                    // Regrading the question gives a score of 50%, and we keep this score.
                    locals.expectedResult = {
                        instance_question_points: 6.5,
                        instance_question_score_perc: 50,
                        assessment_instance_points: 6.5,
                        assessment_instance_score_perc: (6.5 / examMaxPoints) * 100,
                    };
                });
            });

            postRegradeForm(examQuestions.partialCredit3, false);
            helperQuestion.waitForJobSequence(locals);
            helperQuestion.checkQuestionPointsAndPercentage(locals);
            helperQuestion.checkAssessmentScore(locals);
        });
    });

    describe('Regrading questions on homework assessment', function() {
        useIncorrectServerFiles();
        startAssessment(8, false);
        
        // Here, we test how regrading handles multiple variants in one instance question.
        // We especially want to test what happens if a variant closes early when regrading,
        // or if the instance question closes early.

        describe('Make some submissions for partialCredit3', function() {
            for (let j = 0; j < 2; j++) {   // submit the same answer twice
                describe('Save and grade an answer of "100", which mistakenly gives 0% of the available points', function() {
                    const expectedResult = {
                        submission_score: 0,
                        submission_correct: false,
                        instance_question_points: 0,
                        instance_question_score_perc: 0,
                        assessment_instance_points: 0,
                        assessment_instance_score_perc: 0,
                    };
    
                    submitAnswer(['grade', 'save'], 'grade', hwQuestions.partialCredit3, expectedResult, function(_variant) {
                        return {
                            s: 100,
                        };
                    });
                });
            }

            describe('Generate a new variant', function() {
                // At this point, the previous variant is closed, so making a GET request to the instance 
                // question URL will generate a new variant.
                describe('setting up the locals object', function() {
                    it('should succeed', function() {
                        locals.question = hwQuestions.partialCredit3;
                        locals.shouldHaveButtons = ['grade', 'save'];
                    });
                });
                helperQuestion.getInstanceQuestion(locals);
            });

            for (let j = 0; j < 2; j++) {   // submit the same answer twice
                describe('Save and grade an answer of "100", which mistakenly gives 0% of the available points', function() {
                    const expectedResult = {
                        submission_score: 0,
                        submission_correct: false,
                        instance_question_points: 0,
                        instance_question_score_perc: 0,
                        assessment_instance_points: 0,
                        assessment_instance_score_perc: 0,
                    };
    
                    submitAnswer(['grade', 'save'], 'grade', hwQuestions.partialCredit3, expectedResult, function(_variant) {
                        return {
                            s: 100,
                        };
                    });
                });
            }
        });

        describe('Set config.regradeActive to false', function() {
            it('should succeed', function() {
                config.regradeActive = false;
            });
        });

        describe('When config.regradeActive is false', function() {
            checkRegradeButtons(false, false);
        });

        describe('Set config.regradeActive to true', function() {
            it('should succeed', function() {
                config.regradeActive = true;
            });
        });

        describe('When config.regradeActive is true', function() {
            checkRegradeButtons(true, false);
        });

        useCorrectedServerFiles();

        describe('Regrading current submissions for partialCredit3 and keeping the highest score', function() {
            describe('Set question and expected scores in locals object', function() {
                it('should succeed', function() {
                    locals.question = hwQuestions.partialCredit3;
                    locals.expectedResult = {
                        instance_question_points: 3,    // 1 point for first variant + 2 points for second variant
                        instance_question_score_perc: (3 / 6) * 100,
                        assessment_instance_points: 3,
                        assessment_instance_score_perc: (3 / hwMaxPoints) * 100,
                    };
                });
            });

            postRegradeForm(hwQuestions.partialCredit3, true);
            helperQuestion.waitForJobSequence(locals);
            helperQuestion.checkQuestionPointsAndPercentage(locals);
            helperQuestion.checkAssessmentScore(locals);
        });

        useIncorrectServerFiles();

        describe('Make more submissions for partialCredit3', function() {
            // At this point, we only need to earn 100% on one more variant in 
            // order to earn the maximum number of points for partialCredit3.
            // We now generate two more variants, and we submit the answer "100" twice
            // per variant.

            for (let i = 0; i < 2; i++) {   // Go through 2 more variants
                describe('Generate a new variant', function() {
                    // At this point, the previous variant is closed, so making a GET request to the instance 
                    // question URL will generate a new variant.
                    describe('setting up the locals object', function() {
                        it('should succeed', function() {
                            locals.question = hwQuestions.partialCredit3;
                            locals.shouldHaveButtons = ['grade', 'save'];
                        });
                    });
                    helperQuestion.getInstanceQuestion(locals);
                });

                for (let j = 0; j < 2; j++) {   // We get 2 tries per variant.
                    describe('Save and grade an answer of "100", which mistakenly gives 0% of the available points', function() {
                        const expectedResult = {
                            submission_score: 0,
                            submission_correct: false,
                            instance_question_points: 3,
                            instance_question_score_perc: (3 / 6) * 100,
                            assessment_instance_points: 3,
                            assessment_instance_score_perc: (3 / hwMaxPoints) * 100,
                        };
        
                        submitAnswer(['grade', 'save'], 'grade', hwQuestions.partialCredit3, expectedResult, function(_variant) {
                            return {
                                s: 100,
                            };
                        });
                    });
                }
            }
        });

        useCorrectedServerFiles();

        describe('Regrading current submissions for partialCredit3 and keeping the highest score', function() {
            // We have now generated four variants of the partialCredit3 question in total.
            // Each variant will earn 100% under the corrected grade function. However, we
            // expect that the score for the instance question is capped at 6 (the maxPoints
            // for the question). Essentially, the last variant should not contribute to the
            // score for the question because the first three variants already give 6 points 
            // in total.

            describe('Set question and expected scores in locals object', function() {
                it('should succeed', function() {
                    locals.question = hwQuestions.partialCredit3;
                    locals.expectedResult = {
                        instance_question_points: 6,
                        instance_question_score_perc: 100,
                        assessment_instance_points: 6,
                        assessment_instance_score_perc: (6 / hwMaxPoints) * 100,
                    };
                });
            });

            postRegradeForm(hwQuestions.partialCredit3, true);
            helperQuestion.waitForJobSequence(locals);
            helperQuestion.checkQuestionPointsAndPercentage(locals);
            helperQuestion.checkAssessmentScore(locals);
        });
    });

    describe('Restore the original server files for addVectors and partialCredit3', function() {
        it('should succeed for addVectors', function(callback) {
            fs.copyFile(addVectorsServerCopyPath, addVectorsServerPath, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });

        it('should succeed for partialCredit3', function(callback) {
            fs.copyFile(partialCredit3ServerCopyPath, partialCredit3ServerPath, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    });

    describe('Delete copies of server files for addVectors and partialCredit3', function() {
        it('should succeed for addVectors', function(callback) {
            fs.unlink(addVectorsServerCopyPath, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });

        it('should succeed for partialCredit3', function(callback) {
            fs.unlink(partialCredit3ServerCopyPath, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    });
});
