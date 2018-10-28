const _ = require('lodash');
const assert = require('chai').assert;
const request = require('request');
const cheerio = require('cheerio');

const helperServer = require('./helperServer');
const helperQuestion = require('./helperQuestion');
const helperExam = require('./helperExam');

const locals = {};

const assessmentPoints = 5;

describe('API', function() {
    this.timeout(60000);

    before('set up testing server', helperServer.before);
    after('shut down testing server', helperServer.after);

    let elemList, page;

    helperExam.startExam(locals);

    describe('1. grade correct answer to question addNumbers', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = helperExam.questions.addNumbers;
                locals.expectedResult = {
                    submission_score: 1,
                    submission_correct: true,
                    instance_question_points: assessmentPoints,
                    instance_question_score_perc: assessmentPoints/5 * 100,
                    assessment_instance_points: assessmentPoints,
                    assessment_instance_score_perc: assessmentPoints/helperExam.assessmentMaxPoints * 100,
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
        it('should not contain a new token', function() {
            elemList = locals.$('.new-access-token');
            assert.lengthOf(elemList, 0);
        });
   });

    describe('4. POST to generate token', function() {
        it('should load successfully', function(callback) {
            const form = {
                __action: locals.__action,
                __csrf_token: locals.__csrf_token,
                token_name: 'test',
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
            locals.api_token = elemList.text().trim();
        });
        it('the new token should have the correct format', function() {
            assert.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(locals.api_token));
        });
    });

    describe('5. GET to API for assessments', function() {
        it('should fail without token', function(callback) {
            locals.apiUrl = locals.baseUrl + '/api/v1';
            locals.apiCourseInstanceUrl = locals.apiUrl + '/course_instances/1';
            locals.apiAssessmentsUrl = locals.apiCourseInstanceUrl + '/assessments';
            request(locals.apiAssessmentsUrl, function (error, response, _body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 401) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                callback(null);
            });
        });
        it('should fail with an incorrect token', function(callback) {
            const options = {
                url: locals.apiAssessmentsUrl,
                headers: {
                    'Private-Token': '12345678-1234-1234-1234-1234567890ab',
                },
            };
            request(options, function (error, response, _body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 401) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                callback(null);
            });
        });
        it('should load successfully with the correct token', function(callback) {
            const options = {
                url: locals.apiAssessmentsUrl,
                headers: {
                    'Private-Token': locals.api_token,
                },
            };
            request(options, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 200) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                page = body;
                callback(null);
            });
        });
        it('should parse as JSON', function() {
            locals.json = JSON.parse(page);
        });
        it('should contain E1', function() {
            const objectList = _.filter(locals.json, o => o.tid == 'exam1');
            assert.lengthOf(objectList, 1);
            locals.assessment_id = objectList[0].id;
            assert.equal(objectList[0].label, 'E1');
        });
    });

    describe('6. GET to API for Exam 1 assessment instances', function() {
        it('should load successfully', function(callback) {
            locals.apiAssessmentInstancesUrl = locals.apiCourseInstanceUrl + `/assessments/${locals.assessment_id}/assessment_instances`;
            const options = {
                url: locals.apiAssessmentInstancesUrl,
                headers: {
                    'Private-Token': locals.api_token,
                },
            };
            request(options, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 200) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                page = body;
                callback(null);
            });
        });
        it('should parse as JSON', function() {
            locals.json = JSON.parse(page);
        });
        it('should have one assessment instance', function() {
            assert.lengthOf(locals.json, 1);
            locals.assessment_instance_id = locals.json[0].id;
        });
        it('should belong to the dev user', function() {
            assert.equal(locals.json[0].user.uid, 'dev@illinois.edu');
        });
        it('should have the correct points', function() {
            assert.equal(locals.json[0].points, assessmentPoints);
            assert.equal(locals.json[0].max_points, helperExam.assessmentMaxPoints);
        });
    });

    describe('7. GET to API for Exam 1 submissions', function() {
        it('should load successfully', function(callback) {
            locals.apiSubmissionsUrl = locals.apiCourseInstanceUrl + `/assessment_instances/${locals.assessment_instance_id}/submissions`;
            const options = {
                url: locals.apiSubmissionsUrl,
                headers: {
                    'Private-Token': locals.api_token,
                },
            };
            request(options, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 200) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                page = body;
                callback(null);
            });
        });
        it('should parse as JSON', function() {
            locals.json = JSON.parse(page);
        });
        it('should have one submission', function() {
            assert.lengthOf(locals.json, 1);
        });
        it('should have the correct points', function() {
            assert.equal(locals.json[0].points, assessmentPoints);
        });
    });

    describe('8. GET to API for the gradebook', function() {
        it('should load successfully', function(callback) {
            locals.apiGradebookUrl = locals.apiCourseInstanceUrl + `/gradebook`;
            const options = {
                url: locals.apiGradebookUrl,
                headers: {
                    'Private-Token': locals.api_token,
                },
            };
            request(options, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 200) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                page = body;
                callback(null);
            });
        });
        it('should parse as JSON', function() {
            locals.json = JSON.parse(page);
        });
        it('should have one entry for the dev user', function() {
            const objectList = _.filter(locals.json, o => o.uid == 'dev@illinois.edu');
            assert.lengthOf(objectList, 1);
            locals.devObject = objectList[0];
        });
        it('should contain Exam 1', function() {
            const objectList = _.filter(locals.devObject.assessments, o => o.label == 'E1');
            assert.lengthOf(objectList, 1);
            locals.gradebookEntry = objectList[0];
        });
        it('should have the correct points', function() {
            assert.equal(locals.gradebookEntry.points, assessmentPoints);
            assert.equal(locals.gradebookEntry.max_points, helperExam.assessmentMaxPoints);
        });
    });
});
