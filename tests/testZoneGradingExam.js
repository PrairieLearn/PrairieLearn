var ERR = require('async-stacktrace');
var _ = require('lodash');
var assert = require('chai').assert;
var request = require('request');
var cheerio = require('cheerio');

var config = require('../lib/config');
var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');
var sql = sqlLoader.loadSqlEquiv(__filename);

var res, page, elemList;

var helperServer = require('./helperServer');
var helperQuestion = require('./helperQuestion');

const locals = {};

const questionsArray = [
    {qid: 'partialCredit1', type: 'Freeform', maxPoints: 10},
    {qid: 'partialCredit2', type: 'Freeform', maxPoints: 10},
    {qid: 'partialCredit3', type: 'Freeform', maxPoints: 15},
    {qid: 'partialCredit4_v2', type: 'Calculation', maxPoints: 20},
];

const questions = _.keyBy(questionsArray, 'qid');

const assessmentMaxPoints = 20;

//     action: 'save', 'grade', 'store', 'save-stored-fail', 'grade-stored-fail'
//     score: value to submit, will be the percentage score for the submission
//     sub_points: additional awarded points for this submission
//     sub_total_points: additional total points for this submission
const zoneGradingTests = [
    [
        {qid: 'partialCredit1',     action: 'grade',    score: 80, sub_points: 8, sub_total_points: 5},
        {qid: 'partialCredit2',     action: 'grade',    score: 60, sub_points: 6, sub_total_points: 6},
        {qid: 'partialCredit4_v2',  action: 'grade',    score: 0, sub_points: 0, sub_total_points: 0},
        {qid: 'partialCredit1',     action: 'grade',    score: 100, sub_points: 1, sub_total_points: 0},
        {qid: 'partialCredit2',     action: 'grade',    score: 0, sub_points: 0, sub_total_points: 0},
        {qid: 'partialCredit3',     action: 'grade',    score: 0, sub_points: 0, sub_total_points: 0},
        {qid: 'partialCredit4_v2',  action: 'grade',    score: 0, sub_points: 0, sub_total_points: 0},
        {qid: 'partialCredit4_v2',  action: 'grade',    score: 0, sub_points: 0, sub_total_points: 0},
        {qid: 'partialCredit4_v2',  action: 'grade',    score: 100, sub_points: 5, sub_total_points: 5},
        {qid: 'partialCredit3',     action: 'grade',    score: 100, sub_points: 10, sub_total_points: 4},
    ],
];

describe('Zone grading exam assessment', function() {
    this.timeout(60000);

    before('set up testing server', helperServer.before());
    after('shut down testing server', helperServer.after);

    var startAssessment = function() {
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
            it('should contain E5', function(callback) {
                sqldb.queryOneRow(sql.select_e5, [], function(err, result) {
                    if (ERR(err, callback)) return;
                    locals.assessment_id = result.rows[0].id;
                    callback(null);
                });
            });
        });

        describe('startExam-4. GET to assessments URL', function() {
            it('should load successfully', function(callback) {
                request(locals.assessmentsUrl, function (error, response, body) {
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
            it('should contain E5', function() {
                elemList = locals.$('td a:contains("Exam to test per-zone grading")');
                assert.lengthOf(elemList, 1);
            });
            it('should have the correct link for E5', function() {
                locals.assessmentUrl = locals.siteUrl + elemList[0].attribs.href;
                assert.equal(locals.assessmentUrl, locals.courseInstanceBaseUrl + '/assessment/' + locals.assessment_id + '/');
            });
        });

        describe('startExam-5. GET to assessment URL', function() {
            it('should load successfully', function(callback) {
                request(locals.assessmentUrl, function (error, response, body) {
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
            it('should contain "Exam 5"', function() {
                elemList = locals.$('p.lead strong:contains("Exam 5")');
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
                request.post({url: locals.assessmentUrl, form: form, followAllRedirects: true}, function (error, response, body) {
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
                request(locals.assessmentInstanceUrl, function (error, response, body) {
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

    zoneGradingTests.forEach(function(zoneGradingTest, iZoneGradingTest) {

        describe(`zone grading test #${iZoneGradingTest+1}`, function() {
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

            startAssessment();

            zoneGradingTest.forEach(function(questionTest, iQuestionTest) {
                describe(`${questionTest.action} answer number #${iQuestionTest+1} for question ${questionTest.qid} with score ${questionTest.score}`, function() {
                    describe('setting up the submission data', function() {
                        it('should succeed', function() {
                            if (questionTest.action == 'check-closed') {
                                locals.shouldHaveButtons = [];
                            } else {
                                locals.shouldHaveButtons = ['grade', 'save'];
                            }
                            locals.postAction = questionTest.action;
                            locals.question = questions[questionTest.qid];
                            locals.question.points += questionTest.sub_points;
                            locals.totalPoints += questionTest.sub_total_points;
                            const submission_score = (questionTest.submission_score == null) ? questionTest.score : questionTest.submission_score;
                            locals.expectedResult = {
                                submission_score: (questionTest.action == 'save') ? null : (submission_score / 100),
                                submission_correct: (questionTest.action == 'save') ? null : (submission_score == 100),
                                instance_question_points: locals.question.points,
                                instance_question_score_perc: locals.question.points/locals.question.maxPoints * 100,
                                assessment_instance_points: locals.totalPoints,
                                assessment_instance_score_perc: locals.totalPoints/assessmentMaxPoints * 100,
                            };
                            locals.getSubmittedAnswer = function(_variant) {
                                return {
                                    s: String(questionTest.score),
                                };
                            };
                        });
                    });
                    if (questionTest.action == 'store') {
                        helperQuestion.getInstanceQuestion(locals);
                        describe('saving submission data', function() {
                            it('should succeed', function() {
                                locals.question.savedVariant = _.clone(locals.variant);
                                locals.question.questionSavedCsrfToken = locals.__csrf_token;
                            });
                        });
                    } else if (questionTest.action == 'save-stored-fail') {
                        describe('restoring submission data', function() {
                            it('should succeed', function() {
                                locals.postAction = 'save';
                                locals.variant = _.clone(locals.question.savedVariant);
                                locals.__csrf_token = locals.question.questionSavedCsrfToken;
                            });
                        });
                        helperQuestion.postInstanceQuestionAndFail(locals);
                    } else if (questionTest.action == 'grade-stored-fail') {
                        describe('restoring submission data', function() {
                            it('should succeed', function() {
                                locals.postAction = 'grade';
                                locals.variant = _.clone(locals.question.savedVariant);
                                locals.__csrf_token = locals.question.questionSavedCsrfToken;
                            });
                        });
                        helperQuestion.postInstanceQuestionAndFail(locals);
                    } else if (questionTest.action == 'check-closed') {
                        helperQuestion.getInstanceQuestion(locals);
                    } else if (questionTest.action == 'save' || questionTest.action == 'grade') {
                        helperQuestion.getInstanceQuestion(locals);
                        helperQuestion.postInstanceQuestion(locals);
                        helperQuestion.checkQuestionScore(locals);
                        helperQuestion.checkAssessmentScore(locals);
                    } else {
                        throw Error('unknown action: ' + questionTest.action);
                    }
                });
            });
        });
    });
});
