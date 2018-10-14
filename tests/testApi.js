const ERR = require('async-stacktrace');
const _ = require('lodash');
const assert = require('chai').assert;
const request = require('request');
const cheerio = require('cheerio');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const helperServer = require('./helperServer');
const helperQuestion = require('./helperQuestion');
const helperAssessment = require('./helperAssessment');

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

describe('API', function() {
    this.timeout(60000);

    before('set up testing server', helperServer.before);
    after('shut down testing server', helperServer.after);

    let elemList;

    helperAssessment.startExam(locals, questionsArray);

    describe('1. grade correct answer to question addNumbers', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = questions.addNumbers;
                locals.expectedResult = {
                    submission_score: 1,
                    submission_correct: true,
                    instance_question_points: 5,
                    instance_question_score_perc: 5/5 * 100,
                    assessment_instance_points: 5,
                    assessment_instance_score_perc: 5/assessmentMaxPoints * 100,
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

    describe('2. GET settings page', function() {
        it('should load successfully', function(callback) {
            locals.settingsUrl = locals.baseUrl + '/settings';
            request(locals.settingsUrl, function (error, response, body) {
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
    });

    describe('3. generate token button', function() {
        it('should exist', function() {
            elemList = locals.$('#generateTokenButton');
            assert.lengthOf(elemList, 1);
        });
        it('should have data-content', function() {
            assert.isString(elemList[0].attribs['data-content']);
        });
        it('data-content should parse', function() {
            locals.data$ = cheerio.load(elemList[0].attribs['data-content']);
        });
        it('data-content should have a CSRF token', function() {
            elemList = locals.data$('form input[name="__csrf_token"]');
            assert.lengthOf(elemList, 1);
            assert.nestedProperty(elemList[0], 'attribs.value');
            locals.__csrf_token = elemList[0].attribs.value;
            assert.isString(locals.__csrf_token);
        });
        it('data-content should have an __action', function() {
            elemList = locals.data$('form input[name="__action"]');
            assert.lengthOf(elemList, 1);
            assert.nestedProperty(elemList[0], 'attribs.value');
            locals.__action = elemList[0].attribs.value;
            assert.isString(locals.__action);
            assert.equal(locals.__action, 'token_generate');
        });
        it('data-content should have a token_name input', function() {
            elemList = locals.data$('form input[name="token_name"]');
            assert.lengthOf(elemList, 1);
        });
    });

    describe('4. POST to generate token', function() {
        it('should load successfully', function(callback) {
            const form = {
                __action: locals.__action,
                __csrf_token: locals.__csrf_token,
                token_name: 'test'
            };
            request.post({url: locals.settingsUrl, form: form, followAllRedirects: true}, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                locals.postEndTime = Date.now();
                if (response.statusCode != 200) {
                    return callback(new Error('bad status: ' + response.statusCode + '\n' + body));
                }
                page = body;
                callback(null);
            });
        });
        it('should parse', function() {
            locals.$ = cheerio.load(page);
        });
        it('should contain a new token', function() {
            elemList = locals.$('.new-access-token');
            assert.lengthOf(elemList, 1);
            const totalPoints = Number.parseFloat(elemList[0].children[0].data);
            assert.equal(totalPoints, 7);
        });
    });


});
