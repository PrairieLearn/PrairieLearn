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

var siteUrl = 'http://localhost:' + config.serverPort;
var baseUrl = siteUrl + '/pl';
var courseInstanceBaseUrl = baseUrl + '/course_instance/1';
var assessmentsUrl = courseInstanceBaseUrl + '/assessments';
var assessmentUrl, assessmentInstanceUrl, instructorAssessmentUrl;

const addNumbers = {qid: 'addNumbers', type: 'Freeform'};
const addVectors = {qid: 'addVectors', type: 'Calculation'};
const fossilFuelsRadio = {qid: 'fossilFuelsRadio', type: 'Calculation'};

describe('Homework assessment', function() {

    before('set up testing server', helperServer.before);
    after('shut down testing server', helperServer.after);

    var res, page, $, elemList;
    var assessment_id, assessment_instance, instance_questions, variant, submission;
    var questionData, submittedAnswer;
    var csrfToken, instance_question;
    var locals = {}, savedVariant, questionSavedCsrfToken;
    var assessmentGradeSavedCsrfToken, assessmentFinishSavedCsrfToken;
    var preStartTime, postStartTime, preEndTime, postEndTime, assessment_instance_duration;
    var job_sequence_id, job_sequence_status;

    describe('database', function() {
        it('should contain HW1', function(callback) {
            sqldb.queryOneRow(sql.select_hw1, [], function(err, result) {
                if (ERR(err, callback)) return;
                assessment_id = result.rows[0].id;
                callback(null);
            });
        });
    });

    describe('GET /pl/assessments', function() {
        it('should load successfully', function(callback) {
            request(assessmentsUrl, function (error, response, body) {
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
            $ = cheerio.load(page);
        });
        it('should contain HW1', function() {
            elemList = $('td a:contains("Homework for automatic test suite")');
            assert.lengthOf(elemList, 1);
        });
        it('should have the correct link for HW1', function() {
            assessmentUrl = siteUrl + elemList[0].attribs.href;
            assert.equal(assessmentUrl, courseInstanceBaseUrl + '/assessment/' + assessment_id + '/');
        });
    });

    describe('GET to assessment URL', function() {
        it('should load successfully', function(callback) {
            preStartTime = Date.now();
            request(assessmentUrl, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                postStartTime = Date.now();
                if (response.statusCode != 200) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                res = response;
                page = body;
                callback(null);
            });
        });
        it('should redirect to the correct path', function() {
            assessmentInstanceUrl = siteUrl + res.req.path;
            assert.equal(res.req.path, '/pl/course_instance/1/assessment_instance/1');
        });
        it('should create one assessment_instance', function(callback) {
            sqldb.query(sql.select_assessment_instances, [], function(err, result) {
                if (ERR(err, callback)) return;
                if (result.rowCount != 1) {
                    return callback(new Error('expected one assessment_instance, got: ' + result.rowCount));
                }
                assessment_instance = result.rows[0];
                callback(null);
            });
        });
        it('should have the correct assessment_instance.assessment_id', function() {
            assert.equal(assessment_instance.assessment_id, assessment_id);
        });
        it('should create three instance_questions', function(callback) {
            sqldb.query(sql.select_instance_questions, [], function(err, result) {
                if (ERR(err, callback)) return;
                if (result.rowCount != 3) {
                    return callback(new Error('expected three instance_questions, got: ' + result.rowCount));
                }
                instance_questions = result.rows;
                callback(null);
            });
        });
        it('should have the correct first question', function() {
            addNumbers.id = instance_questions[0].id;
            assert.equal(instance_questions[0].qid, addNumbers.qid);
        });
        it('should have the correct second question', function() {
            addVectors.id = instance_questions[1].id;
            assert.equal(instance_questions[1].qid, addVectors.qid);
        });
        it('should have the correct third question', function() {
            fossilFuelsRadio.id = instance_questions[2].id;
            assert.equal(instance_questions[2].qid, fossilFuelsRadio.qid);
        });
    });

    describe('GET to assessment_instance URL', function() {
        it('should load successfully', function(callback) {
            request(assessmentInstanceUrl, function (error, response, body) {
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
            $ = cheerio.load(page);
        });
        it('should link to addNumbers question', function() {
            elemList = $('td a:contains("Add two numbers")');
            assert.lengthOf(elemList, 1);
            addNumbers.url = siteUrl + elemList[0].attribs.href;
            assert.equal(addNumbers.url, courseInstanceBaseUrl + '/instance_question/' + addNumbers.id + '/');
        });
        it('should link to addVectors question', function() {
            elemList = $('td a:contains("Addition of vectors in Cartesian coordinates")');
            assert.lengthOf(elemList, 1);
            addVectors.url = siteUrl + elemList[0].attribs.href;
            assert.equal(addVectors.url, courseInstanceBaseUrl + '/instance_question/' + addVectors.id + '/');
        });
        it('should link to fossilFuelsRadio question', function() {
            elemList = $('td a:contains("Advantages of fossil fuels (radio)")');
            assert.lengthOf(elemList, 1);
            fossilFuelsRadio.url = siteUrl + elemList[0].attribs.href;
            assert.equal(fossilFuelsRadio.url, courseInstanceBaseUrl + '/instance_question/' + fossilFuelsRadio.id + '/');
        });
    });

    var getInstanceQuestion = function() {
        describe('GET to instance_question URL', function() {
            it('should load successfully', function(callback) {
                var instanceQuestionUrl = courseInstanceBaseUrl + '/instance_question/' + locals.question.id;
                request(instanceQuestionUrl, function (error, response, body) {
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
                $ = cheerio.load(page);
            });
            it('should contain question-data if Calculation', function() {
                if (locals.question.type != 'Calculation') return;
                elemList = $('.question-data');
                assert.lengthOf(elemList, 1);
            });
            it('question-data should contain base64 data if Calculation', function() {
                if (locals.question.type != 'Calculation') return;
                assert.deepProperty(elemList[0], 'children.0.data');
                assert.lengthOf(elemList[0].children, 1);
                assert.property(elemList[0].children[0], 'data');
            });
            it('base64 data should parse to JSON if Calculation', function() {
                if (locals.question.type != 'Calculation') return;
                questionData = JSON.parse(decodeURIComponent(new Buffer(elemList[0].children[0].data, 'base64').toString()));
            });
            it('should have a variant_id in the questionData if Calculation', function() {
                if (locals.question.type != 'Calculation') return;
                assert.deepProperty(questionData, 'variant.id');
                variant_id = questionData.variant.id;
            });
            it('should have a variant_id input if Freeform', function() {
                if (locals.question.type != 'Freeform') return;
                elemList = $('.question-form input[name="variant_id"]');
                assert.lengthOf(elemList, 1);
                assert.deepProperty(elemList[0], 'attribs.value');
                variant_id = elemList[0].attribs.value;
                variant_id = Number.parseInt(variant_id);
            });
            it('should have the variant in the DB', function(callback) {
                var params = {
                    variant_id: variant_id
                };
                sqldb.queryOneRow(sql.select_variant, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    variant = result.rows[0];
                    callback(null);
                });
            });
            it('should have the correct variant.question.id', function() {
                assert.equal(variant.instance_question_id, locals.question.id);
            });
            it('should not be a broken variant if Freeform', function() {
                if (locals.question.type != 'Freeform') return;
                assert.equal(variant.broken, false);
            });
            it('should have a CSRF token', function() {
                elemList = $('.question-form input[name="csrfToken"]');
                assert.lengthOf(elemList, 1);
                assert.deepProperty(elemList[0], 'attribs.value');
                csrfToken = elemList[0].attribs.value;
                assert.isString(csrfToken);
            });
        });
    };

    var postInstanceQuestion = function() {
        describe('POST to instance_question URL', function() {
            it('should generate the submittedAnswer', function() {
                submittedAnswer = locals.getSubmittedAnswer(variant);
            });
            it('should load successfully', function(callback) {
                let form;
                if (locals.question.type == 'Calculation') {
                    form = {
                        postAction: 'submitQuestionAnswer',
                        csrfToken: csrfToken,
                        postData: JSON.stringify({variant, submittedAnswer}),
                    };
                } else if (locals.question.type == 'Freeform') {
                    form = {
                        postAction: 'submitQuestionAnswer',
                        csrfToken: csrfToken,
                        variant_id: variant.id,
                    };
                    _.assign(form, submittedAnswer);
                } else {
                    throw Error('bad question.type:' + locals.question.type);
                }
                var instanceQuestionUrl = courseInstanceBaseUrl + '/instance_question/' + locals.question.id;
                preEndTime = Date.now();
                request.post({url: instanceQuestionUrl, form: form, followAllRedirects: true}, function (error, response, body) {
                    if (error) {
                        return callback(error);
                    }
                    postEndTime = Date.now();
                    if (response.statusCode != 200) {
                        return callback(new Error('bad status: ' + response.statusCode));
                    }
                    res = response;
                    page = body;
                    callback(null);
                });
            });
            it('should parse', function() {
                $ = cheerio.load(page);
            });
            it('should create a submission', function(callback) {
                var params = {variant_id: variant.id};
                sqldb.query(sql.select_last_submission, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    if (result.rowCount != 1) {
                        return callback(new Error('expected one submission, got: ' + result.rowCount));
                    }
                    submission = result.rows[0];
                    callback(null);
                });
            });
            it('should have the correct submission.variant_id', function() {
                assert.equal(submission.variant_id, variant.id);
            });
            it('should not be graded', function() {
                assert.equal(submission.points, null);
                assert.equal(submission.score_perc, null);
            });
            it('should not be broken if Freeform', function() {
                if (locals.question.type != 'Freeform') return;
                assert.equal(submission.broken, false);
            });
            it('should select the assessment_instance duration from the DB', function(callback) {
                sqldb.query(sql.select_assessment_instance_durations, [], function(err, result) {
                    if (ERR(err, callback)) return;
                    if (result.rowCount != 1) {
                        return callback(new Error('expected one row, got: ' + result.rowCount));
                    }
                    assessment_instance_duration = result.rows[0].duration;
                    callback(null);
                });
            });
            it('should have the correct assessment_instance duration', function() {
                var min_duration = (preEndTime - postStartTime) / 1000;
                var max_duration = (postEndTime - preStartTime) / 1000;
                assert.isAbove(assessment_instance_duration, min_duration);
                assert.isBelow(assessment_instance_duration, max_duration);
            });
        });
    };

    var postInstanceQuestionAndFail = function() {
        describe('POST to instance_question URL', function() {
            it('should generate the submittedAnswer', function() {
                submittedAnswer = locals.getSubmittedAnswer(variant);
            });
            it('should error', function(callback) {
                let form;
                if (locals.question.type == 'Calculation') {
                    form = {
                        postAction: 'submitQuestionAnswer',
                        csrfToken: csrfToken,
                        postData: JSON.stringify({variant, submittedAnswer}),
                    };
                } else if (locals.question.type == 'Freeform') {
                    form = {
                        postAction: 'submitQuestionAnswer',
                        csrfToken: csrfToken,
                        variant_id: variant.id,
                    };
                    _.assign(form, submittedAnswer);
                } else {
                    throw Error('bad question.type:' + locals.question.type);
                }
                var instanceQuestionUrl = courseInstanceBaseUrl + '/instance_question/' + locals.question.id;
                request.post({url: instanceQuestionUrl, form: form, followAllRedirects: true}, function (error, response, body) {
                    if (error) {
                        return callback(error);
                    }
                    if (response.statusCode != 400) {
                        return callback(new Error('bad status (expected 400): ' + response.statusCode));
                    }
                    res = response;
                    page = body;
                    callback(null);
                });
            });
        });
    };

    var checkQuestionScore = function() {
        describe('check question score', function() {
            it('should have the submission', function(callback) {
                var params = {
                    instance_question_id: locals.question.id,
                };
                sqldb.queryOneRow(sql.select_last_submission_for_instance_question, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    submission = result.rows[0];
                    callback(null);
                });
            });
            it('should be graded with expected score', function() {
                assert.equal(submission.score, locals.expectedResult.submission_score);
            });
            it('should be graded with expected correctness', function() {
                assert.equal(submission.correct, locals.expectedResult.submission_correct);
            });
            it('should still have the instance_question', function(callback) {
                var params = {
                    instance_question_id: locals.question.id,
                };
                sqldb.queryOneRow(sql.select_instance_question, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    instance_question = result.rows[0];
                    callback(null);
                });
            });
            it('should have the correct instance_question points', function() {
                assert.approximately(instance_question.points, locals.expectedResult.instance_question_points, 1e-6);
            });
            it('should have the correct instance_question score_perc', function() {
                assert.approximately(instance_question.score_perc, locals.expectedResult.instance_question_score_perc, 1e-6);
            });
        });
    };

    var checkAssessmentScore = function() {
        describe('check assessment score', function() {
            it('should still have the assessment_instance', function(callback) {
                var params = {
                    assessment_instance_id: assessment_instance.id,
                };
                sqldb.queryOneRow(sql.select_assessment_instance, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    assessment_instance = result.rows[0];
                    callback(null);
                });
            });
            it('should have the correct assessment_instance points', function() {
                assert.approximately(assessment_instance.points, locals.expectedResult.assessment_instance_points, 1e-6);
            });
            it('should have the correct assessment_instance score_perc', function() {
                assert.approximately(assessment_instance.score_perc, locals.expectedResult.assessment_instance_score_perc, 1e-6);
            });
        });
    };

    describe('1. submit correct answer to question addVectors', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    question: addVectors,
                    expectedResult: {
                        submission_score: 1,
                        submission_correct: true,
                        instance_question_points: 2,
                        instance_question_score_perc: 2/11 * 100,
                        assessment_instance_points: 2,
                        assessment_instance_score_perc: 2/30 * 100,
                    },
                    getSubmittedAnswer: function(variant) {
                        return {
                            wx: variant.true_answer.wx,
                            wy: variant.true_answer.wy,
                        };
                    },
                };
            });
        });
        getInstanceQuestion();
        postInstanceQuestion();
        checkQuestionScore();
        checkAssessmentScore();
    });

    describe('2. submit correct answer to question fossilFuelsRadio', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    question: fossilFuelsRadio,
                    expectedResult: {
                        submission_score: 1,
                        submission_correct: true,
                        instance_question_points: 3,
                        instance_question_score_perc: 3/14 * 100,
                        assessment_instance_points: 5,
                        assessment_instance_score_perc: 5/30 * 100,
                    },
                    getSubmittedAnswer: function(variant) {
                        return {
                            key: variant.true_answer.key,
                        };
                    },
                };
            });
        });
        getInstanceQuestion();
        postInstanceQuestion();
        checkQuestionScore();
        checkAssessmentScore();
    });

    describe('3. submit incorrect answer to question addVectors', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    question: addVectors,
                    expectedResult: {
                        submission_score: 0,
                        submission_correct: false,
                        instance_question_points: 2,
                        instance_question_score_perc: 2/11 * 100,
                        assessment_instance_points: 5,
                        assessment_instance_score_perc: 5/30 * 100,
                    },
                    getSubmittedAnswer: function(_variant) {
                        return {
                            wx: 400,
                            wy: -700,
                        };
                    },
                };
            });
        });
        getInstanceQuestion();
        postInstanceQuestion();
        checkQuestionScore();
        checkAssessmentScore();
    });

    describe('4. submit correct answer to question addVectors', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    question: addVectors,
                    expectedResult: {
                        submission_score: 1,
                        submission_correct: true,
                        instance_question_points: 4,
                        instance_question_score_perc: 4/11 * 100,
                        assessment_instance_points: 7,
                        assessment_instance_score_perc: 7/30 * 100,
                    },
                    getSubmittedAnswer: function(variant) {
                        return {
                            wx: variant.true_answer.wx,
                            wy: variant.true_answer.wy,
                        };
                    },
                };
            });
        });
        getInstanceQuestion();
        postInstanceQuestion();
        checkQuestionScore();
        checkAssessmentScore();
    });

    describe('5. submit correct answer to question addVectors', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    question: addVectors,
                    expectedResult: {
                        submission_score: 1,
                        submission_correct: true,
                        instance_question_points: 8,
                        instance_question_score_perc: 8/11 * 100,
                        assessment_instance_points: 11,
                        assessment_instance_score_perc: 11/30 * 100,
                    },
                    getSubmittedAnswer: function(variant) {
                        return {
                            wx: variant.true_answer.wx,
                            wy: variant.true_answer.wy,
                        };
                    },
                };
            });
        });
        getInstanceQuestion();
        postInstanceQuestion();
        checkQuestionScore();
        checkAssessmentScore();
    });

    describe('6. submit correct answer to question addVectors', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    question: addVectors,
                    expectedResult: {
                        submission_score: 1,
                        submission_correct: true,
                        instance_question_points: 11,
                        instance_question_score_perc: 11/11 * 100,
                        assessment_instance_points: 14,
                        assessment_instance_score_perc: 14/30 * 100,
                    },
                    getSubmittedAnswer: function(variant) {
                        return {
                            wx: variant.true_answer.wx,
                            wy: variant.true_answer.wy,
                        };
                    },
                };
            });
        });
        getInstanceQuestion();
        postInstanceQuestion();
        checkQuestionScore();
        checkAssessmentScore();
    });

    describe('7. submit correct answer to question addVectors', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    question: addVectors,
                    expectedResult: {
                        submission_score: 1,
                        submission_correct: true,
                        instance_question_points: 11,
                        instance_question_score_perc: 11/11 * 100,
                        assessment_instance_points: 14,
                        assessment_instance_score_perc: 14/30 * 100,
                    },
                    getSubmittedAnswer: function(variant) {
                        return {
                            wx: variant.true_answer.wx,
                            wy: variant.true_answer.wy,
                        };
                    },
                };
            });
        });
        getInstanceQuestion();
        postInstanceQuestion();
        checkQuestionScore();
        checkAssessmentScore();
    });

    describe('8. submit correct answer to question fossilFuelsRadio', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    question: fossilFuelsRadio,
                    expectedResult: {
                        submission_score: 1,
                        submission_correct: true,
                        instance_question_points: 9,
                        instance_question_score_perc: 9/14 * 100,
                        assessment_instance_points: 20,
                        assessment_instance_score_perc: 20/30 * 100,
                    },
                    getSubmittedAnswer: function(variant) {
                        return {
                            key: variant.true_answer.key,
                        };
                    },
                };
            });
        });
        getInstanceQuestion();
        postInstanceQuestion();
        checkQuestionScore();
        checkAssessmentScore();
    });

    describe('9. submit incorrect answer to question fossilFuelsRadio', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    question: fossilFuelsRadio,
                    expectedResult: {
                        submission_score: 0,
                        submission_correct: false,
                        instance_question_points: 9,
                        instance_question_score_perc: 9/14 * 100,
                        assessment_instance_points: 20,
                        assessment_instance_score_perc: 20/30 * 100,
                    },
                    getSubmittedAnswer: function(variant) {
                        return {
                            key: (variant.true_answer.key == 'a') ? 'b' : 'a',
                        };
                    },
                };
            });
        });
        getInstanceQuestion();
        postInstanceQuestion();
        checkQuestionScore();
        checkAssessmentScore();
    });

    describe('10. submit correct answer to question fossilFuelsRadio', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    question: fossilFuelsRadio,
                    expectedResult: {
                        submission_score: 1,
                        submission_correct: true,
                        instance_question_points: 12,
                        instance_question_score_perc: 12/14 * 100,
                        assessment_instance_points: 23,
                        assessment_instance_score_perc: 23/30 * 100,
                    },
                    getSubmittedAnswer: function(variant) {
                        return {
                            key: variant.true_answer.key,
                        };
                    },
                };
            });
        });
        getInstanceQuestion();
        postInstanceQuestion();
        checkQuestionScore();
        checkAssessmentScore();
    });

    describe('11. submit incorrect answer to question fossilFuelsRadio', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    question: fossilFuelsRadio,
                    expectedResult: {
                        submission_score: 0,
                        submission_correct: false,
                        instance_question_points: 12,
                        instance_question_score_perc: 12/14 * 100,
                        assessment_instance_points: 23,
                        assessment_instance_score_perc: 23/30 * 100,
                    },
                    getSubmittedAnswer: function(variant) {
                        return {
                            key: (variant.true_answer.key == 'a') ? 'b' : 'a',
                        };
                    },
                };
            });
        });
        getInstanceQuestion();
        postInstanceQuestion();
        checkQuestionScore();
        checkAssessmentScore();
    });

    describe('12. regrading', function() {
        describe('change max_points', function() {
            it('should succeed', function(callback) {
                sqldb.query(sql.update_max_points, [], function(err, _result) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            });
        });
        describe('GET to instructorAssessment URL', function() {
            it('should succeed', function(callback) {
                instructorAssessmentUrl = courseInstanceBaseUrl + '/instructor/assessment/' + assessment_id + '/';
                request({url: instructorAssessmentUrl}, function (error, response, body) {
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
                $ = cheerio.load(page);
            });
            it('should have a CSRF token', function() {
                elemList = $('form[name="regrade-all-form"] input[name="csrfToken"]');
                assert.lengthOf(elemList, 1);
                assert.deepProperty(elemList[0], 'attribs.value');
                csrfToken = elemList[0].attribs.value;
                assert.isString(csrfToken);
            });
        });
        describe('POST to instructorAssessment URL for regrading', function() {
            it('should succeed', function(callback) {
                var form = {
                    postAction: 'regrade_all',
                    assessment_id: assessment_id,
                    csrfToken: csrfToken,
                };
                request.post({url: instructorAssessmentUrl, form: form, followAllRedirects: true}, function (error, response) {
                    if (error) {
                        return callback(error);
                    }
                    if (response.statusCode != 200) {
                        return callback(new Error('bad status: ' + response.statusCode));
                    }
                    callback(null);
                });
            });
        });
        describe('The regrading job sequence', function() {
            it('should have an id', function(callback) {
                sqldb.queryOneRow(sql.select_last_job_sequence, [], (err, result) => {
                    if (ERR(err, callback)) return;
                    job_sequence_id = result.rows[0].id;
                    callback(null);
                });
            });
            it('should complete', function(callback) {
                var checkComplete = function() {
                    var params = {job_sequence_id};
                    sqldb.queryOneRow(sql.select_job_sequence, params, (err, result) => {
                        if (ERR(err, callback)) return;
                        job_sequence_status = result.rows[0].status;
                        if (job_sequence_status == 'Running') {
                            setTimeout(checkComplete, 10);
                        } else {
                            callback(null);
                        }
                    });
                };
                setTimeout(checkComplete, 10);
            });
            it('should be successful', function() {
                assert.equal(job_sequence_status, 'Success');
            });
        });
        describe('check the regrading succeeded', function() {
            describe('setting up the expected question addVectors results', function() {
                it('should succeed', function() {
                    locals = {
                        question: addVectors,
                        expectedResult: {
                            submission_score: 1,
                            submission_correct: true,
                            instance_question_points: 11,
                            instance_question_score_perc: 11/11 * 100,
                        },
                    };
                });
            });
            checkQuestionScore();
            describe('setting up the expected question fossilFuelsRadio results', function() {
                it('should succeed', function() {
                    locals = {
                        question: fossilFuelsRadio,
                        expectedResult: {
                            submission_score: 0,
                            submission_correct: false,
                            instance_question_points: 12,
                            instance_question_score_perc: 12/14 * 100,
                        },
                    };
                });
            });
            checkQuestionScore();
            describe('setting up the expected assessment results', function() {
                it('should succeed', function() {
                    locals = {
                        expectedResult: {
                            assessment_instance_points: 13,
                            assessment_instance_score_perc: 13/13 * 100,
                        },
                    };
                });
            });
            checkAssessmentScore();
        });
    });
});
