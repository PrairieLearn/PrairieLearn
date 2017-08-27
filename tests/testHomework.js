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
locals.courseInstanceBaseUrl = locals.baseUrl + '/course_instance/1';
locals.questionBaseUrl = locals.courseInstanceBaseUrl + '/instance_question';
locals.assessmentsUrl = locals.courseInstanceBaseUrl + '/assessments';
locals.isStudentPage = true;

const addNumbers = {qid: 'addNumbers', type: 'Freeform'};
const addVectors = {qid: 'addVectors', type: 'Calculation'};
const fossilFuelsRadio = {qid: 'fossilFuelsRadio', type: 'Calculation'};
const downloadFile = {qid: 'downloadFile', type: 'Freeform'};

describe('Homework assessment', function() {
    this.timeout(5000);

    before('set up testing server', helperServer.before);
    after('shut down testing server', helperServer.after);

    var res, page, elemList;

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
        it('should create five instance_questions', function(callback) {
            sqldb.query(sql.select_instance_questions, [], function(err, result) {
                if (ERR(err, callback)) return;
                if (result.rowCount != 4) {
                    return callback(new Error('expected three instance_questions, got: ' + result.rowCount));
                }
                locals.instance_questions = result.rows;
                callback(null);
            });
        });
        it('should have the correct first question', function() {
            addNumbers.id = locals.instance_questions[0].id;
            assert.equal(locals.instance_questions[0].qid, addNumbers.qid);
        });
        it('should have the correct second question', function() {
            addVectors.id = locals.instance_questions[1].id;
            assert.equal(locals.instance_questions[1].qid, addVectors.qid);
        });
        it('should have the correct third question', function() {
            fossilFuelsRadio.id = locals.instance_questions[2].id;
            assert.equal(locals.instance_questions[2].qid, fossilFuelsRadio.qid);
        });
        it('should have the correct fourth question', function() {
            downloadFile.id = locals.instance_questions[3].id;
            assert.equal(locals.instance_questions[3].qid, downloadFile.qid);
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
        it('should link to addNumbers question', function() {
            elemList = locals.$('td a:contains("Add two numbers")');
            assert.lengthOf(elemList, 1);
            addNumbers.url = locals.siteUrl + elemList[0].attribs.href;
            assert.equal(addNumbers.url, locals.courseInstanceBaseUrl + '/instance_question/' + addNumbers.id + '/');
        });
        it('should link to addVectors question', function() {
            elemList = locals.$('td a:contains("Addition of vectors in Cartesian coordinates")');
            assert.lengthOf(elemList, 1);
            addVectors.url = locals.siteUrl + elemList[0].attribs.href;
            assert.equal(addVectors.url, locals.courseInstanceBaseUrl + '/instance_question/' + addVectors.id + '/');
        });
        it('should link to fossilFuelsRadio question', function() {
            elemList = locals.$('td a:contains("Advantages of fossil fuels (radio)")');
            assert.lengthOf(elemList, 1);
            fossilFuelsRadio.url = locals.siteUrl + elemList[0].attribs.href;
            assert.equal(fossilFuelsRadio.url, locals.courseInstanceBaseUrl + '/instance_question/' + fossilFuelsRadio.id + '/');
        });
        it('should link to downloadFile question', function() {
            elemList = locals.$('td a:contains("File download example question")');
            assert.lengthOf(elemList, 1);
            downloadFile.url = locals.siteUrl + elemList[0].attribs.href;
            assert.equal(downloadFile.url, locals.courseInstanceBaseUrl + '/instance_question/' + downloadFile.id + '/');
        });
    });

    describe('1. submit correct answer to question addVectors', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = addVectors;
                locals.expectedResult = {
                    submission_score: 1,
                    submission_correct: true,
                    instance_question_points: 2,
                    instance_question_score_perc: 2/11 * 100,
                    assessment_instance_points: 2,
                    assessment_instance_score_perc: 2/47 * 100,
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

    describe('2. submit correct answer to question fossilFuelsRadio', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = fossilFuelsRadio;
                locals.expectedResult = {
                    submission_score: 1,
                    submission_correct: true,
                    instance_question_points: 3,
                    instance_question_score_perc: 3/14 * 100,
                    assessment_instance_points: 5,
                    assessment_instance_score_perc: 5/47 * 100,
                };
                locals.getSubmittedAnswer = function(variant) {
                    return {
                        key: variant.true_answer.key,
                    };
                };
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        helperQuestion.postInstanceQuestion(locals);
        helperQuestion.checkQuestionScore(locals);
        helperQuestion.checkAssessmentScore(locals);
    });

    describe('3. submit incorrect answer to question addVectors', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = addVectors;
                locals.expectedResult = {
                    submission_score: 0,
                    submission_correct: false,
                    instance_question_points: 2,
                    instance_question_score_perc: 2/11 * 100,
                    assessment_instance_points: 5,
                    assessment_instance_score_perc: 5/47 * 100,
                };
                locals.getSubmittedAnswer = function(_variant) {
                    return {
                        wx: 400,
                        wy: -700,
                    };
                };
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        helperQuestion.postInstanceQuestion(locals);
        helperQuestion.checkQuestionScore(locals);
        helperQuestion.checkAssessmentScore(locals);
    });

    describe('4. submit correct answer to question addVectors', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = addVectors;
                locals.expectedResult = {
                    submission_score: 1,
                    submission_correct: true,
                    instance_question_points: 4,
                    instance_question_score_perc: 4/11 * 100,
                    assessment_instance_points: 7,
                    assessment_instance_score_perc: 7/47 * 100,
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

    describe('5. save incorrect answer to question addVectors', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'save';
                locals.question = addVectors;
                locals.expectedResult = {
                    submission_score: null,
                    submission_correct: null,
                    instance_question_points: 4,
                    instance_question_score_perc: 4/11 * 100,
                    assessment_instance_points: 7,
                    assessment_instance_score_perc: 7/47 * 100,
                };
                locals.getSubmittedAnswer = function(_variant) {
                    return {
                        wx: -600,
                        wy: 700,
                    };
                };
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        helperQuestion.postInstanceQuestion(locals);
        helperQuestion.checkQuestionScore(locals);
        helperQuestion.checkAssessmentScore(locals);
    });

    describe('6. submit correct answer to question addVectors', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = addVectors;
                locals.expectedResult = {
                    submission_score: 1,
                    submission_correct: true,
                    instance_question_points: 8,
                    instance_question_score_perc: 8/11 * 100,
                    assessment_instance_points: 11,
                    assessment_instance_score_perc: 11/47 * 100,
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

    describe('7. submit correct answer to question addVectors', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = addVectors;
                locals.expectedResult = {
                    submission_score: 1,
                    submission_correct: true,
                    instance_question_points: 11,
                    instance_question_score_perc: 11/11 * 100,
                    assessment_instance_points: 14,
                    assessment_instance_score_perc: 14/47 * 100,
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

    describe('8. submit correct answer to question addVectors', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = addVectors;
                locals.expectedResult = {
                    submission_score: 1,
                    submission_correct: true,
                    instance_question_points: 11,
                    instance_question_score_perc: 11/11 * 100,
                    assessment_instance_points: 14,
                    assessment_instance_score_perc: 14/47 * 100,
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

    describe('9. load question addNumbers page and save data for later submission', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = addNumbers;
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        describe('save data for later submission', function() {
            it('should succeed', function() {
                locals.savedVariant = _.clone(locals.variant);
                locals.questionSavedCsrfToken = locals.__csrf_token;
            });
        });
    });

    describe('10. submit incorrect answer to question addNumbers', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = addNumbers;
                locals.expectedResult = {
                    submission_score: 0,
                    submission_correct: false,
                    instance_question_points: 0,
                    instance_question_score_perc: 0/5 * 100,
                    assessment_instance_points: 14,
                    assessment_instance_score_perc: 14/47 * 100,
                };
                locals.getSubmittedAnswer = function(variant) {
                    return {
                        c: variant.true_answer.c + 3,
                    };
                };
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        helperQuestion.postInstanceQuestion(locals);
        helperQuestion.checkQuestionScore(locals);
        helperQuestion.checkAssessmentScore(locals);
    });

    describe('12. submit correct answer to saved question addNumbers page', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = addNumbers;
                locals.getSubmittedAnswer = function(variant) {
                    return {
                        c: variant.true_answer.c,
                    };
                };
            });
        });
        describe('restore saved data for submission', function() {
            it('should succeed', function() {
                locals.variant = _.clone(locals.savedVariant);
                locals.__csrf_token = locals.questionSavedCsrfToken;
            });
        });
        helperQuestion.postInstanceQuestionAndFail(locals);
    });

    describe('12. submit correct answer to question addNumbers', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = addNumbers;
                locals.expectedResult = {
                    submission_score: 1,
                    submission_correct: true,
                    instance_question_points: 1,
                    instance_question_score_perc: 1/5 * 100,
                    assessment_instance_points: 15,
                    assessment_instance_score_perc: 15/47 * 100,
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

    describe('13. submit invalid answer to question addNumbers', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = addNumbers;
                locals.expectedResult = {
                    submission_score: null,
                    submission_correct: null,
                    instance_question_points: 1,
                    instance_question_score_perc: 1/5 * 100,
                    assessment_instance_points: 15,
                    assessment_instance_score_perc: 15/47 * 100,
                };
                locals.getSubmittedAnswer = function(_variant) {
                    return {
                        c: '42c',
                    };
                };
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        helperQuestion.postInstanceQuestion(locals);
        helperQuestion.checkQuestionScore(locals);
        helperQuestion.checkAssessmentScore(locals);
        describe('check the submission is not gradable', function() {
            it('should succeed', function(callback) {
                sqldb.queryOneRow(sql.select_last_submission, [], function(err, result) {
                    if (ERR(err, callback)) return;
                    const submission = result.rows[0];
                    if (submission.gradable) return callback(new Error('submission.gradable is true'));
                    callback(null);
                });
            });
        });
        describe('the submission panel contents', function() {
            it('should contain "INVALID"', function() {
                elemList = locals.$('div.submission-body :contains("INVALID")');
                assert.isAtLeast(elemList.length, 1);
            });
        });
    });

    describe('14. submit correct answer to question addNumbers', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = addNumbers;
                locals.expectedResult = {
                    submission_score: 1,
                    submission_correct: true,
                    instance_question_points: 3,
                    instance_question_score_perc: 3/5 * 100,
                    assessment_instance_points: 17,
                    assessment_instance_score_perc: 17/47 * 100,
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

    describe('15. save incorrect answer to question addNumbers', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'save';
                locals.question = addNumbers;
                locals.expectedResult = {
                    submission_score: null,
                    submission_correct: null,
                    instance_question_points: 3,
                    instance_question_score_perc: 3/5 * 100,
                    assessment_instance_points: 17,
                    assessment_instance_score_perc: 17/47 * 100,
                };
                locals.getSubmittedAnswer = function(variant) {
                    return {
                        c: variant.true_answer.c + 2,
                    };
                };
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        helperQuestion.postInstanceQuestion(locals);
        helperQuestion.checkQuestionScore(locals);
        helperQuestion.checkAssessmentScore(locals);
    });

    describe('16. submit correct answer to question fossilFuelsRadio', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = fossilFuelsRadio;
                locals.expectedResult = {
                    submission_score: 1,
                    submission_correct: true,
                    instance_question_points: 9,
                    instance_question_score_perc: 9/14 * 100,
                    assessment_instance_points: 23,
                    assessment_instance_score_perc: 23/47 * 100,
                };
                locals.getSubmittedAnswer = function(variant) {
                    return {
                        key: variant.true_answer.key,
                    };
                };
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        helperQuestion.postInstanceQuestion(locals);
        helperQuestion.checkQuestionScore(locals);
        helperQuestion.checkAssessmentScore(locals);
    });

    describe('17. submit incorrect answer to question fossilFuelsRadio', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = fossilFuelsRadio;
                locals.expectedResult = {
                    submission_score: 0,
                    submission_correct: false,
                    instance_question_points: 9,
                    instance_question_score_perc: 9/14 * 100,
                    assessment_instance_points: 23,
                    assessment_instance_score_perc: 23/47 * 100,
                };
                locals.getSubmittedAnswer = function(variant) {
                    return {
                        key: (variant.true_answer.key == 'a') ? 'b' : 'a',
                    };
                };
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        helperQuestion.postInstanceQuestion(locals);
        helperQuestion.checkQuestionScore(locals);
        helperQuestion.checkAssessmentScore(locals);
    });

    describe('18. submit correct answer to question fossilFuelsRadio', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = fossilFuelsRadio;
                locals.expectedResult = {
                    submission_score: 1,
                    submission_correct: true,
                    instance_question_points: 12,
                    instance_question_score_perc: 12/14 * 100,
                    assessment_instance_points: 26,
                    assessment_instance_score_perc: 26/47 * 100,
                };
                locals.getSubmittedAnswer = function(variant) {
                    return {
                        key: variant.true_answer.key,
                    };
                };
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        helperQuestion.postInstanceQuestion(locals);
        helperQuestion.checkQuestionScore(locals);
        helperQuestion.checkAssessmentScore(locals);
    });

    describe('19. submit incorrect answer to question fossilFuelsRadio', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.postAction = 'grade';
                locals.question = fossilFuelsRadio;
                locals.expectedResult = {
                    submission_score: 0,
                    submission_correct: false,
                    instance_question_points: 12,
                    instance_question_score_perc: 12/14 * 100,
                    assessment_instance_points: 26,
                    assessment_instance_score_perc: 26/47 * 100,
                };
                locals.getSubmittedAnswer = function(variant) {
                    return {
                        key: (variant.true_answer.key == 'a') ? 'b' : 'a',
                    };
                };
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        helperQuestion.postInstanceQuestion(locals);
        helperQuestion.checkQuestionScore(locals);
        helperQuestion.checkAssessmentScore(locals);
    });

    describe('20. test downloading files', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals.shouldHaveButtons = ['grade', 'save'];
                locals.question = downloadFile;
            });
        });
        helperQuestion.getInstanceQuestion(locals);
        describe('downloading course text file', function() {
            it('should contain a link to clientFilesCourse/data.txt', function() {
                elemList = locals.$('a[href*="clientFilesCourse"]');
                assert.lengthOf(elemList, 1);
            });
            it('should download something with the link to clientFilesCourse/data.txt', function(callback) {
                const fileUrl = locals.siteUrl+elemList[0].attribs.href;
                request(fileUrl, function (error, response, body) {
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
            it('should have downloaded a file with the contents of clientFilesCourse/data.txt', function() {
                assert.equal(page,'This data is specific to the course.');
            });
        });
        describe('downloading question text file', function() {
            it('should contain a link to clientFilesQuestion/data.txt', function() {
                elemList = locals.$('a[href*="clientFilesQuestion"]');
                assert.lengthOf(elemList, 1);
            });
            it('should download something with the link to clientFilesQuestion/data.txt', function(callback) {
                const fileUrl = locals.siteUrl+elemList[0].attribs.href;
                request(fileUrl, function (error, response, body) {
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
            it('should have downloaded a file with the contents of clientFilesQuestion/data.txt', function() {
                assert.equal(page,'This data is specific to the question.');
            });
        });
        describe('downloading dynamic text file', function() {
            it('should contain a link to generatedFilesQuestion/data.txt', function() {
                elemList = locals.$('a[href*="generatedFilesQuestion"][href$="data.txt"]');
                assert.lengthOf(elemList, 1);
            });
            it('should download something with the link to generatedFilesQuestion/data.txt', function(callback) {
                const fileUrl = locals.siteUrl+elemList[0].attribs.href;
                request(fileUrl, function (error, response, body) {
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
            it('should have downloaded a file with the contents of generatedFilesQuestion/data.txt', function() {
                assert.equal(page,'This data is generated by code.');
            });
        });
        describe('downloading dynamic image file', function() {
            it('should contain a link to generatedFilesQuestion/figure.png', function() {
                elemList = locals.$('a[href*="generatedFilesQuestion"][href$="figure.png"]');
                assert.lengthOf(elemList, 1);
            });
            it('should download something with the link to generatedFilesQuestion/figure.png', function(callback) {
                const fileUrl = locals.siteUrl+elemList[0].attribs.href;
                request({url: fileUrl, encoding: null}, function (error, response, body) {
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
            it('should have downloaded a file with the contents of generatedFilesQuestion/figure.png', function() {
                // assert.equal(page,'This data is generated by code.')
                assert.equal(page.slice(0,8).toString('hex'),'89504e470d0a1a0a');
            });
        });
    });

    describe('21. regrading', function() {
        describe('change max_points', function() {
            it('should succeed', function(callback) {
                sqldb.query(sql.update_max_points, [], function(err, _result) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            });
        });
        helperQuestion.regradeAssessment(locals);
        describe('check the regrading succeeded', function() {
            describe('setting up the expected question addNumbers results', function() {
                it('should succeed', function() {
                    locals.question = addNumbers;
                    locals.expectedResult = {
                        submission_score: null,
                        submission_correct: null,
                        instance_question_points: 3,
                        instance_question_score_perc: 3/5 * 100,
                    };
                });
            });
            helperQuestion.checkQuestionScore(locals);
            describe('setting up the expected question addVectors results', function() {
                it('should succeed', function() {
                    locals.question = addVectors;
                    locals.expectedResult = {
                        submission_score: 1,
                        submission_correct: true,
                        instance_question_points: 11,
                        instance_question_score_perc: 11/11 * 100,
                    };
                });
            });
            helperQuestion.checkQuestionScore(locals);
            describe('setting up the expected question fossilFuelsRadio results', function() {
                it('should succeed', function() {
                    locals.question = fossilFuelsRadio;
                    locals.expectedResult = {
                        submission_score: 0,
                        submission_correct: false,
                        instance_question_points: 12,
                        instance_question_score_perc: 12/14 * 100,
                    };
                });
            });
            helperQuestion.checkQuestionScore(locals);
            describe('setting up the expected assessment results', function() {
                it('should succeed', function() {
                    locals.expectedResult = {
                        assessment_instance_points: 13,
                        assessment_instance_score_perc: 13/13 * 100,
                    };
                });
            });
            helperQuestion.checkAssessmentScore(locals);
        });
    });
});
