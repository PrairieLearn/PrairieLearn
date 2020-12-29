const assert = require('chai').assert;

const ERR = require('async-stacktrace');
const _ = require('lodash');

const config = require('../lib/config');
var request = require('request');
var cheerio = require('cheerio');

const helperServer = require('./helperServer');
const helperQuestion = require('./helperQuestion');

var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');
var sql = sqlLoader.loadSqlEquiv(__filename);

const locals = {};

const questionsArray = [
    {qid: 'addNumbers', type: 'Freeform', maxPoints: 5},
    {qid: 'addVectors', type: 'Calculation', maxPoints: 11},
    {qid: 'fossilFuelsRadio', type: 'Calculation', maxPoints: 14},
    {qid: 'downloadFile', type: 'Freeform', maxPoints: 17},
    {qid: 'partialCredit1', type: 'Freeform', maxPoints: 6},
    {qid: 'partialCredit2', type: 'Freeform', maxPoints: 7},
    {qid: 'partialCredit3', type: 'Freeform', maxPoints: 11},
    {qid: 'partialCredit4_v2', type: 'Calculation', maxPoints: 13},
    {qid: 'partialCredit5_v2_partial', type: 'Calculation', maxPoints: 12},
    {qid: 'partialCredit6_no_partial', type: 'Freeform', maxPoints: 8},
    {qid: 'brokenGrading', type: 'Freeform', maxPoints: 4},
];

const questions = _.keyBy(questionsArray, 'qid');

const assessmentMaxPoints = 108;


config.regradeActive = true;

describe('Regrade for one student', function() {
    this.timeout(60000);

    before('set up testing server', helperServer.before());
    after('shut down testing server', helperServer.after);

    var res, page, elemList;

    var startAssessment = function() {

        describe('the locals object', function() {
            it('should be cleared', function() {
                for (var prop in locals) {
                    delete locals[prop];
                }
            });
            it('should be initialized', function() {
                locals.siteUrl = 'http://localhost:' + config.serverPort;
                locals.baseUrl = locals.siteUrl + '/pl';
                locals.courseInstanceBaseUrl = locals.baseUrl + '/course_instance/1';
                locals.questionBaseUrl = locals.courseInstanceBaseUrl + '/instance_question';
                locals.assessmentsUrl = locals.courseInstanceBaseUrl + '/assessments';
                locals.instructorAssessmentInstanceUrl = locals.courseInstanceBaseUrl + '/instructor/assessment_instance/1';
                locals.isStudentPage = true;
                locals.totalPoints = 0;
            });
        });

        describe('the questions', function() {
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

        describe('the database', function() {
            it('should contain HW1', function(callback) {
                sqldb.queryOneRow(sql.select_hw1, [], function(err, result) {
                    if (ERR(err, callback)) return;
                    locals.assessment_id = result.rows[0].id;
                    callback(null);
                });
            });
        });

        describe('GET ' + locals.assessmentsUrl, function() {
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
            it('should contain HW1', function() {
                elemList = locals.$('td a:contains("Homework for automatic test suite")');
                assert.lengthOf(elemList, 1);
            });
            it('should have the correct link for HW1', function() {
                locals.assessmentUrl = locals.siteUrl + elemList[0].attribs.href;
                assert.equal(locals.assessmentUrl, locals.courseInstanceBaseUrl + '/assessment/' + locals.assessment_id + '/');
            });
        });

        describe('GET to assessment URL', function() {
            it('should load successfully', function(callback) {
                locals.preStartTime = Date.now();
                request(locals.assessmentUrl, function (error, response, body) {
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

        describe('GET to assessment_instance URL', function() {
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

    startAssessment();

    describe('1. submit correct answer to question addVectors', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = questions.addVectors;
                locals.expectedResult = {
                    submission_score: 1,
                    submission_correct: true,
                    instance_question_points: 2,
                    instance_question_score_perc: 2/11 * 100,
                    assessment_instance_points: 2,
                    assessment_instance_score_perc: 2/assessmentMaxPoints * 100,
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

    describe('2. GET to instructor assessment instance URL', function() {
        it('should load successfully', function(callback) {
            request(locals.instructorAssessmentInstanceUrl, function (error, response, body) {
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

    describe('3. edit-question-points form', function() {
        it('should exist', function() {
            elemList = locals.$('#instanceQuestionList td:contains("addVectors") ~ td .editQuestionPointsButton');
            assert.lengthOf(elemList, 1);
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
        it('data-content should have an instance_question_id', function() {
            elemList = locals.data$('form input[name="instance_question_id"]');
            assert.lengthOf(elemList, 1);
            assert.nestedProperty(elemList[0], 'attribs.value');
            locals.instance_question_id = Number.parseInt(elemList[0].attribs.value);
        });
        it('should have a total of two points', function() {
            elemList = locals.$('#total-points');
            assert.lengthOf(elemList, 1);
            const totalPoints = Number.parseFloat(elemList[0].children[0].data);
            assert.equal(totalPoints, 2);
        });
    });

    describe('4. POST to instructor assessment instance URL to set question points', function() {
        it('should load successfully', function(callback) {
            const form = {
                __action: 'edit_question_points',
                __csrf_token: locals.__csrf_token,
                instance_question_id: locals.instance_question_id,
                points: 0,
            };
            request.post({url: locals.instructorAssessmentInstanceUrl, form: form, followAllRedirects: true}, function (error, response, body) {
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
        it('should update the total points correctly', function() {
            elemList = locals.$('#total-points');
            assert.lengthOf(elemList, 1);
            const totalPoints = Number.parseFloat(elemList[0].children[0].data);
            assert.equal(totalPoints, 0);
        });
    });

    describe('5. POST to instructor assessment instance URL to regrade', function() {
        it('should load successfully', function(callback) {
            const form = {
                __action: 'regrade_question',
                __csrf_token: locals.__csrf_token,
                instance_question_id: locals.instance_question_id,
            };
            request.post({url: locals.instructorAssessmentInstanceUrl, form: form, followAllRedirects: true}, function (error, response, body) {
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
        it('should update the total points correctly', function() {
            elemList = locals.$('#total-points');
            assert.lengthOf(elemList, 1);
            const totalPoints = Number.parseFloat(elemList[0].children[0].data);
            assert.equal(totalPoints, 2);
        });
    });

    describe('6. submit correct answer to question addVectors', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = questions.addVectors;
                locals.expectedResult = {
                    submission_score: 1,
                    submission_correct: true,
                    instance_question_points: 6,
                    instance_question_score_perc: 6/11 * 100,
                    assessment_instance_points: 6,
                    assessment_instance_score_perc: 6/assessmentMaxPoints * 100,
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

    describe('7. GET to instructor assessment instance URL', function() {
        it('should load successfully', function(callback) {
            request(locals.instructorAssessmentInstanceUrl, function (error, response, body) {
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

    describe('8. edit-question-points form', function() {
        it('should exist', function() {
            elemList = locals.$('#instanceQuestionList td:contains("addVectors") ~ td .editQuestionPointsButton');
            assert.lengthOf(elemList, 1);
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
        it('should have a total of two points', function() {
            elemList = locals.$('#total-points');
            assert.lengthOf(elemList, 1);
            const totalPoints = Number.parseFloat(elemList[0].children[0].data);
            assert.equal(totalPoints, 6);
        });
    });

    describe('9. POST to instructor assessment instance URL to set question points', function() {
        it('should load successfully', function(callback) {
            const form = {
                __action: 'edit_question_points',
                __csrf_token: locals.__csrf_token,
                instance_question_id: locals.instance_question_id,
                points: 0,
            };
            request.post({url: locals.instructorAssessmentInstanceUrl, form: form, followAllRedirects: true}, function (error, response, body) {
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
        it('should update the total points correctly', function() {
            elemList = locals.$('#total-points');
            assert.lengthOf(elemList, 1);
            const totalPoints = Number.parseFloat(elemList[0].children[0].data);
            assert.equal(totalPoints, 0);
        });
    });

    describe('10. POST to instructor assessment instance URL to regrade', function() {
        it('should load successfully', function(callback) {
            const form = {
                __action: 'regrade_question',
                __csrf_token: locals.__csrf_token,
                instance_question_id: locals.instance_question_id,
            };
            request.post({url: locals.instructorAssessmentInstanceUrl, form: form, followAllRedirects: true}, function (error, response, body) {
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
        it('should update the total points correctly', function() {
            elemList = locals.$('#total-points');
            assert.lengthOf(elemList, 1);
            const totalPoints = Number.parseFloat(elemList[0].children[0].data);
            assert.equal(totalPoints, 6);
        });
    });


    describe('11. submit incorrect answer to question addVectors', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = questions.addVectors;
                locals.expectedResult = {
                    submission_score: 0,
                    submission_correct: false,
                    instance_question_points: 6,
                    instance_question_score_perc: 6/11 * 100,
                    assessment_instance_points: 6,
                    assessment_instance_score_perc: 6/assessmentMaxPoints * 100,
                };
                locals.getSubmittedAnswer = function(variant) {
                    return {
                        wx: variant.true_answer.wx + 1,
                        wy: variant.true_answer.wy + 1,
                    };
                };
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        helperQuestion.postInstanceQuestion(locals);
        helperQuestion.checkQuestionScore(locals);
        helperQuestion.checkAssessmentScore(locals);
    });

    describe('12. GET to instructor assessment instance URL', function() {
        it('should load successfully', function(callback) {
            request(locals.instructorAssessmentInstanceUrl, function (error, response, body) {
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

    describe('13. edit-question-points form', function() {
        it('should exist', function() {
            elemList = locals.$('#instanceQuestionList td:contains("addVectors") ~ td .editQuestionPointsButton');
            assert.lengthOf(elemList, 1);
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
        it('should have a total of two points', function() {
            elemList = locals.$('#total-points');
            assert.lengthOf(elemList, 1);
            const totalPoints = Number.parseFloat(elemList[0].children[0].data);
            assert.equal(totalPoints, 6);
        });
    });

    describe('14. POST to instructor assessment instance URL to set question points', function() {
        it('should load successfully', function(callback) {
            const form = {
                __action: 'edit_question_points',
                __csrf_token: locals.__csrf_token,
                instance_question_id: locals.instance_question_id,
                points: 0,
            };
            request.post({url: locals.instructorAssessmentInstanceUrl, form: form, followAllRedirects: true}, function (error, response, body) {
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
        it('should update the total points correctly', function() {
            elemList = locals.$('#total-points');
            assert.lengthOf(elemList, 1);
            const totalPoints = Number.parseFloat(elemList[0].children[0].data);
            assert.equal(totalPoints, 0);
        });
    });

    describe('15. POST to instructor assessment instance URL to regrade', function() {
        it('should load successfully', function(callback) {
            const form = {
                __action: 'regrade_question',
                __csrf_token: locals.__csrf_token,
                instance_question_id: locals.instance_question_id,
            };
            request.post({url: locals.instructorAssessmentInstanceUrl, form: form, followAllRedirects: true}, function (error, response, body) {
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
        it('should update the total points correctly', function() {
            elemList = locals.$('#total-points');
            assert.lengthOf(elemList, 1);
            const totalPoints = Number.parseFloat(elemList[0].children[0].data);
            assert.equal(totalPoints, 6);
        });
    });

});