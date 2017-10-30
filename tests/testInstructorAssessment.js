var ERR = require('async-stacktrace');
var _ = require('lodash');
var assert = require('chai').assert;
var request = require('request');
var cheerio = require('cheerio');

var config = require('../lib/config');
var sqldb = require('../lib/sqldb');

var helperServer = require('./helperServer');
var helperQuestion = require('./helperQuestion');
var helperAssessment = require('./helperAssessment');

const locals = {};

// sorted alphabetically by qid
const questionsArray = [
    {qid: 'addNumbers', type: 'Freeform', maxPoints: 5},
    {qid: 'addVectors', type: 'Calculation', maxPoints: 11},
    {qid: 'fossilFuelsRadio', type: 'Calculation', maxPoints: 17},
    {qid: 'partialCredit1', type: 'Freeform', maxPoints: 19},
    {qid: 'partialCredit2', type: 'Freeform', maxPoints: 9},
    {qid: 'partialCredit3', type: 'Freeform', maxPoints: 13},
];

const questions = _.keyBy(questionsArray, 'qid');

const assessmentMaxPoints = 74;

describe('Instructor assessment editing', function() {
    this.timeout(5000);

    before('set up testing server', helperServer.before);
    after('shut down testing server', helperServer.after);

    var res, page, elemList;

    helperAssessment.startExam(locals, questionsArray);

    describe('1. grade incorrect answer to question addNumbers', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = questions.addNumbers;
                locals.expectedResult = {
                    submission_score: 0,
                    submission_correct: false,
                    instance_question_points: 0,
                    instance_question_score_perc: 0/5 * 100,
                    assessment_instance_points: 0,
                    assessment_instance_score_perc: 0/assessmentMaxPoints * 100,
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
        helperQuestion.checkQuestionScore(locals);
        helperQuestion.checkAssessmentScore(locals);
    });

    describe('2. grade correct answer to question addNumbers', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = questions.addNumbers;
                locals.expectedResult = {
                    submission_score: 1,
                    submission_correct: true,
                    instance_question_points: 3,
                    instance_question_score_perc: 3/5 * 100,
                    assessment_instance_points: 3,
                    assessment_instance_score_perc: 3/assessmentMaxPoints * 100,
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
        helperQuestion.checkQuestionScore(locals);
        helperQuestion.checkAssessmentScore(locals);
    });

    describe('3. grade correct answer to question addVectors', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = questions.addVectors;
                locals.expectedResult = {
                    submission_score: 1,
                    submission_correct: true,
                    instance_question_points: 11,
                    instance_question_score_perc: 11/11 * 100,
                    assessment_instance_points: 14,
                    assessment_instance_score_perc: 14/assessmentMaxPoints * 100,
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
        helperQuestion.checkQuestionScore(locals);
        helperQuestion.checkAssessmentScore(locals);
    });

    describe('4. GET to instructor assessments URL', function() {
        it('should load successfully', function(callback) {
            request(locals.instructorAssessmentsUrl, function (error, response, body) {
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
        it('should contain E1', function() {
            elemList = locals.$('td a:contains("Exam for automatic test suite")');
            assert.lengthOf(elemList, 1);
        });
        it('should have the correct link for E1', function() {
            locals.instructorAssessmentUrl = locals.siteUrl + elemList[0].attribs.href;
            assert.equal(locals.instructorAssessmentUrl, locals.instructorBaseUrl + '/assessment/' + locals.assessment_id + '/');
        });
    });

    describe('5. GET to instructor assessment URL', function() {
        it('should load successfully', function(callback) {
            request(locals.instructorAssessmentUrl, function (error, response, body) {
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
        it('should contain the assessment instance', function() {
            elemList = locals.$('#usersTable tr td:contains("dev@illinois.edu") ~ td a:contains("Details")');
            assert.lengthOf(elemList, 1);
        });
        it('should have the correct link for the assessment instance', function() {
            locals.instructorAssessmentInstanceUrl = locals.siteUrl + elemList[0].attribs.href;
            assert.equal(locals.instructorAssessmentInstanceUrl, locals.instructorBaseUrl + '/assessment_instance/1');
        });
    });
});
