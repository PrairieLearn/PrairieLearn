var ERR = require('async-stacktrace');
var _ = require('lodash');
var assert = require('chai').assert;
var request = require('request');
var cheerio = require('cheerio');

var config = require('../lib/config');
var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');
var sql = sqlLoader.loadSqlEquiv(__filename);

var helperServer = require('./helperServer');
var helperQuestion = require('./helperQuestion');

const locals = {};

locals.siteUrl = 'http://localhost:' + config.serverPort;
locals.baseUrl = locals.siteUrl + '/pl';
locals.courseInstanceBaseUrl = locals.baseUrl + '/course_instance/1/instructor';
locals.questionBaseUrl = locals.courseInstanceBaseUrl + '/question';
locals.questionsUrl = locals.courseInstanceBaseUrl + '/questions';
locals.isStudentPage = false;

const addNumbers = {qid: 'addNumbers', type: 'Freeform'};
const addVectors = {qid: 'addVectors', type: 'Calculation'};

describe('Instructor questions', function() {

    before('set up testing server', helperServer.before);
    after('shut down testing server', helperServer.after);

    var res, page, elemList;

    describe('the database', function() {
        it('should contain questions', function(callback) {
            sqldb.query(sql.select_questions, [], function(err, result) {
                if (ERR(err, callback)) return;
                if (result.rowCount == 0) {
                    return callback(new Error('no questions in DB'));
                }
                locals.questions = result.rows;
                callback(null);
            });
        });
        it('should contain the addNumbers question', function() {
            const question = _.find(locals.questions, {directory: addNumbers.qid});
            assert.isDefined(question);
            addNumbers.id = question.id;
        });
        it('should contain the addVectors question', function() {
            const question = _.find(locals.questions, {directory: addVectors.qid});
            assert.isDefined(question);
            addVectors.id = question.id;
        });
    });

    describe('GET ' + locals.questionsUrl, function() {
        it('should load successfully', function(callback) {
            request(locals.questionsUrl, function (error, response, body) {
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
        it('should link to addNumbers question', function() {
            elemList = locals.$('td a:contains("Add two numbers")');
            assert.lengthOf(elemList, 1);
            addNumbers.url = locals.siteUrl + elemList[0].attribs.href;
            assert.equal(addNumbers.url, locals.courseInstanceBaseUrl + '/question/' + addNumbers.id + '/');
        });
        it('should link to addVectors question', function() {
            elemList = locals.$('td a:contains("Addition of vectors in Cartesian coordinates")');
            assert.lengthOf(elemList, 1);
            addVectors.url = locals.siteUrl + elemList[0].attribs.href;
            assert.equal(addVectors.url, locals.courseInstanceBaseUrl + '/question/' + addVectors.id + '/');
        });
    });

    describe('1. submit correct answer to question addVectors', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveSubmitButton = true;
                locals.question = addVectors;
                locals.expectedResult = {
                    submission_score: 1,
                    submission_correct: true,
                };
                locals.getSubmittedAnswer = function(variant) {
                    return {
                        wx: variant.true_answer.wx,
                        wy: variant.true_answer.wy,
                    };
                };
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        helperQuestion.postInstanceQuestion(locals);
        helperQuestion.checkSubmissionScore(locals);
    });

    describe('2. submit incorrect answer to question addVectors', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveSubmitButton = true;
                locals.question = addVectors;
                locals.expectedResult = {
                    submission_score: 0,
                    submission_correct: false,
                };
                locals.getSubmittedAnswer = function(variant) {
                    return {
                        wx: -300,
                        wy: 400,
                    };
                };
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        helperQuestion.postInstanceQuestion(locals);
        helperQuestion.checkSubmissionScore(locals);
    });

    describe('3. submit correct answer to question addNumbers', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveSubmitButton = true;
                locals.question = addNumbers;
                locals.expectedResult = {
                    submission_score: 1,
                    submission_correct: true,
                };
                locals.getSubmittedAnswer = function(variant) {
                    return {
                        c: variant.true_answer.c,
                    };
                };
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        helperQuestion.postInstanceQuestion(locals);
        helperQuestion.checkSubmissionScore(locals);
    });

    describe('4. submit incorrect answer to question addNumbers', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveSubmitButton = true;
                locals.question = addNumbers;
                locals.expectedResult = {
                    submission_score: 0,
                    submission_correct: false,
                };
                locals.getSubmittedAnswer = function(variant) {
                    return {
                        c: variant.true_answer.c + 1,
                    };
                };
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        helperQuestion.postInstanceQuestion(locals);
        helperQuestion.checkSubmissionScore(locals);
    });

    describe('5. submit invalid answer to question addNumbers', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveSubmitButton = true;
                locals.question = addNumbers;
                locals.expectedResult = {
                    submission_score: null,
                    submission_correct: null,
                };
                locals.getSubmittedAnswer = function(variant) {
                    return {
                        c: "not_a_number",
                    };
                };
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        helperQuestion.postInstanceQuestion(locals);
        helperQuestion.checkSubmissionScore(locals);
        describe('the submission panel contents', function() {
            it('should contain "INVALID"', function() {
                elemList = locals.$('div.submission-body :contains("INVALID")');
                assert.isAtLeast(elemList.length, 1);
            });
        });
    });
});
