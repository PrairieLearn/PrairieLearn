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
var assessmentUrl, assessmentInstanceUrl, q1Url, q2Url, q3Url, instructorAssessmentUrl;

const addNumbers = {qid: 'addNumbers', type: 'Freeform'};
const addVectors = {qid: 'addVectors', type: 'Calculation'};
const fossilFuelsRadio = {qid: 'fossilFuelsRadio', type: 'Calculation'};

describe('Exam assessment', function() {

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
        it('should contain E1', function(callback) {
            sqldb.queryOneRow(sql.select_e1, [], function(err, result) {
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
        it('should contain E1', function() {
            elemList = $('td a:contains("Exam for automatic test suite")');
            assert.lengthOf(elemList, 1);
        });
        it('should have the correct link for E1', function() {
            assessmentUrl = siteUrl + elemList[0].attribs.href;
            assert.equal(assessmentUrl, courseInstanceBaseUrl + '/assessment/' + assessment_id + '/');
        });
    });

    describe('GET to assessment URL', function() {
        it('should load successfully', function(callback) {
            request(assessmentUrl, function (error, response, body) {
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
        it('should contain "Please wait"', function() {
            elemList = $('p.lead:contains("Please wait")');
            assert.lengthOf(elemList, 1);
        });
        it('should contain "Exam 1"', function() {
            elemList = $('p.lead strong:contains("Exam 1")');
            assert.lengthOf(elemList, 1);
        });
        it('should contain "TPL 101"', function() {
            elemList = $('p.lead strong:contains("TPL 101")');
            assert.lengthOf(elemList, 1);
        });
        it('should have a CSRF token', function() {
            elemList = $('form input[name="csrfToken"]');
            assert.lengthOf(elemList, 1);
            assert.deepProperty(elemList[0], 'attribs.value');
            csrfToken = elemList[0].attribs.value;
            assert.isString(csrfToken);
        });
    });

    describe('POST to assessment URL', function() {
        it('should load successfully', function(callback) {
            var form = {
                postAction: 'newInstance',
                csrfToken: csrfToken,
            };
            preStartTime = Date.now();
            request.post({url: assessmentUrl, form: form, followAllRedirects: true}, function (error, response, body) {
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
        it('should parse', function() {
            $ = cheerio.load(page);
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
        it('should create two instance_questions', function(callback) {
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
                    console.log('variant', variant);
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

    var getGradeAssessmentInstance = function() {
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
            it('should have a CSRF token', function() {
                elemList = $('form[name="grade-form"] input[name="csrfToken"]');
                assert.lengthOf(elemList, 1);
                assert.deepProperty(elemList[0], 'attribs.value');
                csrfToken = elemList[0].attribs.value;
                assert.isString(csrfToken);
            });
        });
    };

    var postGradeAssessmentInstance = function() {
        describe('POST to assessment_instance URL', function() {
            it('should load successfully', function(callback) {
                var form = {
                    postAction: 'grade',
                    csrfToken: csrfToken,
                };
                request.post({url: assessmentInstanceUrl, form: form, followAllRedirects: true}, function (error, response, body) {
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
        });
    };

    var postGradeAssessmentInstanceAndFail = function() {
        describe('POST to assessment_instance URL', function() {
            it('should error', function(callback) {
                var form = {
                    postAction: 'grade',
                    csrfToken: csrfToken,
                };
                request.post({url: assessmentInstanceUrl, form: form, followAllRedirects: true}, function (error, response, body) {
                    if (error) {
                        return callback(error);
                    }
                    if (response.statusCode != 500) {
                        return callback(new Error('bad status (expected 500): ' + response.statusCode));
                    }
                    res = response;
                    page = body;
                    callback(null);
                });
            });
        });
    };

    var getFinishAssessmentInstance = function() {
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
            it('should have a CSRF token', function() {
                elemList = $('form[name="finish-form"] input[name="csrfToken"]');
                assert.lengthOf(elemList, 1);
                assert.deepProperty(elemList[0], 'attribs.value');
                csrfToken = elemList[0].attribs.value;
                assert.isString(csrfToken);
            });
        });
    };

    var postFinishAssessmentInstance = function() {
        describe('POST to assessment_instance URL', function() {
            it('should load successfully', function(callback) {
                var form = {
                    postAction: 'finish',
                    csrfToken: csrfToken,
                };
                request.post({url: assessmentInstanceUrl, form: form, followAllRedirects: true}, function (error, response, body) {
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
        });
    };

    var postFinishAssessmentInstanceAndFail = function() {
        describe('POST to assessment_instance URL', function() {
            it('should error', function(callback) {
                var form = {
                    postAction: 'finish',
                    csrfToken: csrfToken,
                };
                request.post({url: assessmentInstanceUrl, form: form, followAllRedirects: true}, function (error, response, body) {
                    if (error) {
                        return callback(error);
                    }
                    if (response.statusCode != 500) {
                        return callback(new Error('bad status (expected 500): ' + response.statusCode));
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
    });

    describe('2. submit incorrect answer to question addVectors', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    question: addVectors,
                    getSubmittedAnswer: function(_variant) {
                        return {
                            wx: -500,
                            wy: 700,
                        };
                    },
                };
            });
        });
        getInstanceQuestion();
        postInstanceQuestion();
    });

    describe('3. submit incorrect answer to question addNumbers', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    question: addNumbers,
                    getSubmittedAnswer: function(variant) {
                        return {
                            c: variant.true_answer.c + 1,
                        };
                    },
                };
            });
        });
        getInstanceQuestion();
        postInstanceQuestion();
    });

    describe('4. submit incorrect answer to question fossilFuelsRadio', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    question: fossilFuelsRadio,
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
    });

    describe('5. grade exam', function() {
        getGradeAssessmentInstance();
        postGradeAssessmentInstance();
        describe('setting up the expected question addNumbers results', function() {
            it('should succeed', function() {
                locals = {
                    question: addNumbers,
                    expectedResult: {
                        submission_score: 0,
                        submission_correct: false,
                        instance_question_points: 0,
                        instance_question_score_perc: 0,
                    },
                };
            });
        });
        checkQuestionScore();
        describe('setting up the expected question addVectors results', function() {
            it('should succeed', function() {
                locals = {
                    question: addVectors,
                    expectedResult: {
                        submission_score: 0,
                        submission_correct: false,
                        instance_question_points: 0,
                        instance_question_score_perc: 0,
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
                        instance_question_points: 0,
                        instance_question_score_perc: 0,
                    },
                };
            });
        });
        checkQuestionScore();
        describe('setting up the expected assessment results', function() {
            it('should succeed', function() {
                locals = {
                    expectedResult: {
                        assessment_instance_points: 0,
                        assessment_instance_score_perc: 0,
                    },
                };
            });
        });
        checkAssessmentScore();
    });

    describe('6. submit correct answer to question addNumbers', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    question: addNumbers,
                    getSubmittedAnswer: function(variant) {
                        return {
                            c: variant.true_answer.c,
                        };
                    },
                };
            });
        });
        getInstanceQuestion();
        postInstanceQuestion();
    });

    describe('7. load question addNumbers page and save data for later submission', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    question: addNumbers,
                };
            });
        });
        getInstanceQuestion();
        describe('save data for later submission', function() {
            it('should succeed', function() {
                savedVariant = _.clone(variant);
                questionSavedCsrfToken = csrfToken;
            });
        });
    });

    describe('8. grade exam', function() {
        getGradeAssessmentInstance();
        postGradeAssessmentInstance();
        describe('setting up the expected question addNumbers results', function() {
            it('should succeed', function() {
                locals = {
                    question: addNumbers,
                    expectedResult: {
                        submission_score: 1,
                        submission_correct: true,
                        instance_question_points: 5,
                        instance_question_score_perc: 5/10 * 100,
                    },
                };
            });
        });
        checkQuestionScore();
        describe('setting up the expected question addVectors results', function() {
            it('should succeed', function() {
                locals = {
                    question: addVectors,
                    expectedResult: {
                        submission_score: 0,
                        submission_correct: false,
                        instance_question_points: 0,
                        instance_question_score_perc: 0,
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
                        instance_question_points: 0,
                        instance_question_score_perc: 0,
                    },
                };
            });
        });
        checkQuestionScore();
        describe('setting up the expected assessment results', function() {
            it('should succeed', function() {
                locals = {
                    expectedResult: {
                        assessment_instance_points: 5,
                        assessment_instance_score_perc: 5/30 * 100,
                    },
                };
            });
        });
        checkAssessmentScore();
    });

    describe('9. submit correct answer to saved question addNumbers page', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    question: addNumbers,
                    getSubmittedAnswer: function(variant) {
                        return {
                            c: variant.true_answer.c,
                        };
                    },
                };
            });
        });
        describe('restore saved data for submission', function() {
            it('should succeed', function() {
                variant = _.clone(savedVariant);
                csrfToken = questionSavedCsrfToken;
            });
        });
        postInstanceQuestionAndFail();
    });

    describe('10. submit incorrect answer to question fossilFuelsRadio', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    question: fossilFuelsRadio,
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
    });

    describe('11. submit incorrect answer to question addVectors', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    question: addVectors,
                    getSubmittedAnswer: function(_variant) {
                        return {
                            wx: 2000,
                            wy: -3000,
                        };
                    },
                };
            });
        });
        getInstanceQuestion();
        postInstanceQuestion();
    });

    describe('12. load question addVectors page and save data for later submission', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    question: addVectors,
                };
            });
        });
        getInstanceQuestion();
        describe('save data for later submission', function() {
            it('should succeed', function() {
                savedVariant = _.clone(variant);
                questionSavedCsrfToken = csrfToken;
            });
        });
    });

    describe('13. grade exam', function() {
        getGradeAssessmentInstance();
        postGradeAssessmentInstance();
        describe('setting up the expected question addNumbers results', function() {
            it('should succeed', function() {
                locals = {
                    question: addNumbers,
                    expectedResult: {
                        submission_score: 1,
                        submission_correct: true,
                        instance_question_points: 5,
                        instance_question_score_perc: 5/10 * 100,
                    },
                };
            });
        });
        checkQuestionScore();
        describe('setting up the expected question addVectors results', function() {
            it('should succeed', function() {
                locals = {
                    question: addVectors,
                    expectedResult: {
                        submission_score: 0,
                        submission_correct: false,
                        instance_question_points: 0,
                        instance_question_score_perc: 0,
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
                        instance_question_points: 0,
                        instance_question_score_perc: 0,
                    },
                };
            });
        });
        checkQuestionScore();
        describe('setting up the expected assessment results', function() {
            it('should succeed', function() {
                locals = {
                    expectedResult: {
                        assessment_instance_points: 5,
                        assessment_instance_score_perc: 5/30 * 100,
                    },
                };
            });
        });
        checkAssessmentScore();
    });

    describe('14. submit correct answer to saved question addVectors page', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    question: addVectors,
                    getSubmittedAnswer: function(variant) {
                        return {
                            wx: variant.true_answer.wx,
                            wy: variant.true_answer.wy,
                        };
                    },
                };
            });
        });
        describe('restore saved data for submission', function() {
            it('should succeed', function() {
                variant = _.clone(savedVariant);
                csrfToken = questionSavedCsrfToken;
            });
        });
        postInstanceQuestionAndFail();
    });

    describe('15. load question fossilFuelsRadio page and save data for later submission', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    question: fossilFuelsRadio,
                };
            });
        });
        getInstanceQuestion();
        describe('save data for later submission', function() {
            it('should succeed', function() {
                savedVariant = _.clone(variant);
                questionSavedCsrfToken = csrfToken;
            });
        });
    });

    describe('16. load assessment instance page and save data for later grade', function() {
        getGradeAssessmentInstance();
        describe('save data for later grade', function() {
            it('should succeed', function() {
                assessmentGradeSavedCsrfToken = csrfToken;
            });
        });
    });

    describe('17. load assessment instance page and save data for later finish', function() {
        getFinishAssessmentInstance();
        describe('save data for later finish', function() {
            it('should succeed', function() {
                assessmentFinishSavedCsrfToken = csrfToken;
            });
        });
    });

    describe('18. finish exam', function() {
        getFinishAssessmentInstance();
        postFinishAssessmentInstance();
        describe('setting up the expected question addNumbers results', function() {
            it('should succeed', function() {
                locals = {
                    question: addNumbers,
                    expectedResult: {
                        submission_score: 1,
                        submission_correct: true,
                        instance_question_points: 5,
                        instance_question_score_perc: 5/10 * 100,
                    },
                };
            });
        });
        checkQuestionScore();
        describe('setting up the expected question addVectors results', function() {
            it('should succeed', function() {
                locals = {
                    question: addVectors,
                    expectedResult: {
                        submission_score: 0,
                        submission_correct: false,
                        instance_question_points: 0,
                        instance_question_score_perc: 0,
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
                        instance_question_points: 0,
                        instance_question_score_perc: 0,
                    },
                };
            });
        });
        checkQuestionScore();
        describe('setting up the expected assessment results', function() {
            it('should succeed', function() {
                locals = {
                    expectedResult: {
                        assessment_instance_points: 5,
                        assessment_instance_score_perc: 5/30 * 100,
                    },
                };
            });
        });
        checkAssessmentScore();
    });

    describe('19. submit correct answer to saved question fossilFuelsRadio page', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    question: fossilFuelsRadio,
                    getSubmittedAnswer: function(variant) {
                        return {
                            key: variant.true_answer.key,
                        };
                    },
                };
            });
        });
        describe('restore saved data for submission', function() {
            it('should succeed', function() {
                variant = _.clone(savedVariant);
                csrfToken = questionSavedCsrfToken;
            });
        });
        postInstanceQuestionAndFail();
    });

    describe('20. grade exam', function() {
        describe('restore saved data for grade', function() {
            it('should succeed', function() {
                csrfToken = assessmentGradeSavedCsrfToken;
            });
        });
        postGradeAssessmentInstanceAndFail();
    });

    describe('17. finish exam', function() {
        describe('restore saved data for finish', function() {
            it('should succeed', function() {
                csrfToken = assessmentFinishSavedCsrfToken;
            });
        });
        postFinishAssessmentInstanceAndFail();
    });

    describe('21. regrading', function() {
        describe('set forceMaxPoints = true for question addVectors', function() {
            it('should succeed', function(callback) {
                sqldb.query(sql.update_question1_force_max_points, [], function(err, _result) {
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
            describe('setting up the expected question addNumbers results', function() {
                it('should succeed', function() {
                    locals = {
                        question: addNumbers,
                        expectedResult: {
                            submission_score: 1,
                            submission_correct: true,
                            instance_question_points: 5,
                            instance_question_score_perc: 5/10 * 100,
                        },
                    };
                });
            });
            checkQuestionScore();
            describe('setting up the expected question addVectors results', function() {
                it('should succeed', function() {
                    locals = {
                        question: addVectors,
                        expectedResult: {
                            submission_score: 0,
                            submission_correct: false,
                            instance_question_points: 10,
                            instance_question_score_perc: 10/10 * 100,
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
                            instance_question_points: 0,
                            instance_question_score_perc: 0,
                        },
                    };
                });
            });
            checkQuestionScore();
            describe('setting up the expected assessment results', function() {
                it('should succeed', function() {
                    locals = {
                        expectedResult: {
                            assessment_instance_points: 15,
                            assessment_instance_score_perc: 15/30 * 100,
                        },
                    };
                });
            });
            checkAssessmentScore();
        });
    });
});
