var ERR = require('async-stacktrace');
var _ = require('lodash');
var assert = require('assert');
var should = require('should');
var request = require('request');
var cheerio = require('cheerio');

var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');
var sql = sqlLoader.loadSqlEquiv(__filename);

var testHelperServer = require('./testHelperServer');

var siteUrl = 'http://localhost:3000';
var baseUrl = siteUrl + '/pl';
var courseInstanceBaseUrl = baseUrl + '/course_instance/1';
var assessmentsUrl = courseInstanceBaseUrl + '/assessments';
var assessmentUrl, assessmentInstanceUrl, q1Url, q2Url;

describe('Exam assessment', function() {

    before("set up testing server", testHelperServer.before);
    after("shut down testing server", testHelperServer.after);

    var res, page, $, elemList;
    var assessment_id, assessment_instance, instance_questions, variant, submission;
    var csrfToken, instance_question, instance_question_1_id, instance_question_2_id;
    var locals = {}, savedVariant, questionSavedCsrfToken;
    var assessmentGradeSavedCsrfToken, assessmentFinishSavedCsrfToken;

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
            })
        });
        it('should parse', function() {
            $ = cheerio.load(page);
        });
        it('should contain E1', function() {
            elemList = $('td a:contains("E1")');
            assert.ok(elemList.length);
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
            })
        });
        it('should parse', function() {
            $ = cheerio.load(page);
        });
        it('should contain "Please wait"', function() {
            elemList = $('p.lead:contains("Please wait")');
            assert.ok(elemList.length);
        });
        it('should contain "Exam 1"', function() {
            elemList = $('p.lead strong:contains("Exam 1")');
            assert.ok(elemList.length);
        });
        it('should contain "TPL 101"', function() {
            elemList = $('p.lead strong:contains("TPL 101")');
            assert.ok(elemList.length);
        });
        it('should have a CSRF token', function() {
            elemList = $('form input[name="csrfToken"]');
            elemList.length.should.equal(1);
            elemList[0].should.have.property('attribs');
            elemList[0].attribs.should.have.property('value');
            csrfToken = elemList[0].attribs.value;
            csrfToken.should.be.a.String();
            csrfToken.length.should.be.above(10);
        });
    });

    describe('POST to assessment URL', function() {
        it('should load successfully', function(callback) {
            var form = {
                postAction: 'newInstance',
                csrfToken: csrfToken,
            };
            request.post({url: assessmentUrl, form: form, followAllRedirects: true}, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 200) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                res = response;
                page = body;
                callback(null);
            })
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
                if (result.rowCount != 2) {
                    return callback(new Error('expected two instance_questions, got: ' + result.rowCount));
                }
                instance_questions = result.rows;
                callback(null);
            });
        });
        it('should have the correct first question', function() {
            assert.equal(instance_questions[0].qid, 'addVectors');
            instance_question_1_id = instance_questions[0].id;
        });
        it('should have the correct second question', function() {
            assert.equal(instance_questions[1].qid, 'fossilFuelsRadio');
            instance_question_2_id = instance_questions[1].id;
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
            })
        });
        it('should parse', function() {
            $ = cheerio.load(page);
        });
        it('should link to addVectors question', function() {
            elemList = $('td a:contains("Addition of vectors in Cartesian coordinates")');
            elemList.length.should.equal(1);
            q1Url = siteUrl + elemList[0].attribs.href;
            assert.equal(q1Url, courseInstanceBaseUrl + '/instance_question/' + instance_questions[0].id + '/');
        });
        it('should link to fossilFuelsRadio question', function() {
            elemList = $('td a:contains("Advantages of fossil fuels (radio)")');
            elemList.length.should.equal(1);
            q2Url = siteUrl + elemList[0].attribs.href;
            assert.equal(q2Url, courseInstanceBaseUrl + '/instance_question/' + instance_questions[1].id + '/');
        });
    });

    var getInstanceQuestion = function() {
        describe('GET to instance_question URL', function() {
            it('should load successfully', function(callback) {
                var instanceQuestionUrl = courseInstanceBaseUrl + '/instance_question/' + locals.instance_question_id;
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
                })
            });
            it('should parse', function() {
                $ = cheerio.load(page);
            });
            it('should contain question-data', function() {
                elemList = $('.question-data');
                elemList.length.should.equal(1);
            });
            it('question-data should contain base64 data', function() {
                should.exist(elemList[0].children);
                should.exist(elemList[0].children[0]);
                should.exist(elemList[0].children[0].data);
            });
            it('base64 data should parse to JSON', function() {
                questionData = JSON.parse(new Buffer(elemList[0].children[0].data, 'base64').toString());
            });
            it('should have a variant_id in the questionData', function() {
                questionData.should.have.property('variant');
                variant = questionData.variant;
                variant.should.have.property('id');
            });
            it('should have the variant in the DB', function(callback) {
                var params = {
                    variant_id: variant.id,
                    instance_question_id: variant.instance_question_id,
                };
                sqldb.queryOneRow(sql.select_variant, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    variant = result.rows[0];
                    callback(null);
                });
            });
            it('should have the correct variant.instance_question_id', function() {
                assert.equal(variant.instance_question_id, locals.instance_question_id);
            });
            it('should have a CSRF token', function() {
                elemList = $('.question-form input[name="csrfToken"]');
                elemList.length.should.equal(1);
                elemList[0].should.have.property('attribs');
                elemList[0].attribs.should.have.property('value');
                csrfToken = elemList[0].attribs.value;
                csrfToken.should.be.a.String();
                csrfToken.length.should.be.above(10);
            });
        });
    };

    var postInstanceQuestion = function() {
        describe('POST to instance_question URL', function() {
            it('should generate the submittedAnswer', function() {
                submittedAnswer = locals.getSubmittedAnswer(variant);
            });
            it('should load successfully', function(callback) {
                var instanceQuestionUrl = courseInstanceBaseUrl + '/instance_question/' + locals.instance_question_id;
                var form = {
                    postAction: 'submitQuestionAnswer',
                    csrfToken: csrfToken,
                    postData: JSON.stringify({variant, submittedAnswer}),
                };
                request.post({url: instanceQuestionUrl, form: form, followAllRedirects: true}, function (error, response, body) {
                    if (error) {
                        return callback(error);
                    }
                    if (response.statusCode != 200) {
                        return callback(new Error('bad status: ' + response.statusCode));
                    }
                    res = response;
                    page = body;
                    callback(null);
                })
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
        });
    };

    var postInstanceQuestionAndFail = function() {
        describe('POST to instance_question URL', function() {
            it('should generate the submittedAnswer', function() {
                submittedAnswer = locals.getSubmittedAnswer(variant);
            });
            it('should error', function(callback) {
                var instanceQuestionUrl = courseInstanceBaseUrl + '/instance_question/' + locals.instance_question_id;
                var form = {
                    postAction: 'submitQuestionAnswer',
                    csrfToken: csrfToken,
                    postData: JSON.stringify({variant, submittedAnswer}),
                };
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
                })
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
                })
            });
            it('should parse', function() {
                $ = cheerio.load(page);
            });
            it('should have a CSRF token', function() {
                elemList = $('form[name="grade-form"] input[name="csrfToken"]');
                elemList.length.should.equal(1);
                elemList[0].should.have.property('attribs');
                elemList[0].attribs.should.have.property('value');
                csrfToken = elemList[0].attribs.value;
                csrfToken.should.be.a.String();
                csrfToken.length.should.be.above(10);
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
                })
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
                })
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
                })
            });
            it('should parse', function() {
                $ = cheerio.load(page);
            });
            it('should have a CSRF token', function() {
                elemList = $('form[name="finish-form"] input[name="csrfToken"]');
                elemList.length.should.equal(1);
                elemList[0].should.have.property('attribs');
                elemList[0].attribs.should.have.property('value');
                csrfToken = elemList[0].attribs.value;
                csrfToken.should.be.a.String();
                csrfToken.length.should.be.above(10);
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
                })
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
                })
            });
        });
    };

    var checkQuestionScore = function() {
        describe('check question score', function() {
            it('should have the submission', function(callback) {
                var params = {
                    instance_question_id: locals.instance_question_id,
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
                    instance_question_id: locals.instance_question_id,
                };
                sqldb.queryOneRow(sql.select_instance_question, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    instance_question = result.rows[0];
                    callback(null);
                });
            });
            it('should have the correct instance_question points', function() {
                instance_question.points.should.equal(locals.expectedResult.instance_question_points);
            });
            it('should have the correct instance_question score_perc', function() {
                instance_question.score_perc.should.be.approximately(locals.expectedResult.instance_question_score_perc, 1e-6);
            });
        });
    };

    var checkAssessmentScore = function() {
        describe('check question score', function() {
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
                assessment_instance.points.should.equal(locals.expectedResult.assessment_instance_points);
            });
            it('should have the correct assessment_instance score_perc', function() {
                assessment_instance.score_perc.should.be.approximately(locals.expectedResult.assessment_instance_score_perc, 1e-6);
            });
        });
    };

    describe('1. submit correct answer to question 1', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    instance_question_id: instance_questions[0].id,
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

    describe('2. submit incorrect answer to question 1', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    instance_question_id: instance_questions[0].id,
                    getSubmittedAnswer: function(variant) {
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

    describe('3. submit incorrect answer to question 2', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    instance_question_id: instance_questions[1].id,
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

    describe('4. grade exam', function() {
        getGradeAssessmentInstance();
        postGradeAssessmentInstance();
        describe('setting up the expected question 1 results', function() {
            it('should succeed', function() {
                locals = {
                    instance_question_id: instance_questions[0].id,
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
        describe('setting up the expected question 2 results', function() {
            it('should succeed', function() {
                locals = {
                    instance_question_id: instance_questions[1].id,
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

    describe('5. submit correct answer to question 2', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    instance_question_id: instance_questions[1].id,
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
    });

    describe('6. load question 2 page and save data for later submission', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    instance_question_id: instance_questions[1].id,
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

    describe('7. grade exam', function() {
        getGradeAssessmentInstance();
        postGradeAssessmentInstance();
        describe('setting up the expected question 1 results', function() {
            it('should succeed', function() {
                locals = {
                    instance_question_id: instance_questions[0].id,
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
        describe('setting up the expected question 2 results', function() {
            it('should succeed', function() {
                locals = {
                    instance_question_id: instance_questions[1].id,
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
        describe('setting up the expected assessment results', function() {
            it('should succeed', function() {
                locals = {
                    expectedResult: {
                        assessment_instance_points: 5,
                        assessment_instance_score_perc: 5/20 * 100,
                    },
                };
            });
        });
        checkAssessmentScore();
    });

    describe('8. submit correct answer to saved question 2 page', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    instance_question_id: instance_questions[1].id,
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

    describe('9. submit incorrect answer to question 1', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    instance_question_id: instance_questions[0].id,
                    getSubmittedAnswer: function(variant) {
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

    describe('10. load question 1 page and save data for later submission', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    instance_question_id: instance_questions[0].id,
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

    describe('11. grade exam', function() {
        getGradeAssessmentInstance();
        postGradeAssessmentInstance();
        describe('setting up the expected question 1 results', function() {
            it('should succeed', function() {
                locals = {
                    instance_question_id: instance_questions[0].id,
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
        describe('setting up the expected question 2 results', function() {
            it('should succeed', function() {
                locals = {
                    instance_question_id: instance_questions[1].id,
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
        describe('setting up the expected assessment results', function() {
            it('should succeed', function() {
                locals = {
                    expectedResult: {
                        assessment_instance_points: 5,
                        assessment_instance_score_perc: 5/20 * 100,
                    },
                };
            });
        });
        checkAssessmentScore();
    });

    describe('12. submit correct answer to saved question 1 page', function() {
        describe('setting up the submission data', function() {
            it('should succeed', function() {
                locals = {
                    instance_question_id: instance_questions[0].id,
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

    describe('13. load assessment instance page and save data for later grade', function() {
        getGradeAssessmentInstance();
        describe('save data for later grade', function() {
            it('should succeed', function() {
                assessmentGradeSavedCsrfToken = csrfToken;
            });
        });
    });

    describe('14. load assessment instance page and save data for later finish', function() {
        getFinishAssessmentInstance();
        describe('save data for later finish', function() {
            it('should succeed', function() {
                assessmentFinishSavedCsrfToken = csrfToken;
            });
        });
    });

    describe('15. finish exam', function() {
        getFinishAssessmentInstance();
        postFinishAssessmentInstance();
        describe('setting up the expected question 1 results', function() {
            it('should succeed', function() {
                locals = {
                    instance_question_id: instance_questions[0].id,
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
        describe('setting up the expected question 2 results', function() {
            it('should succeed', function() {
                locals = {
                    instance_question_id: instance_questions[1].id,
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
        describe('setting up the expected assessment results', function() {
            it('should succeed', function() {
                locals = {
                    expectedResult: {
                        assessment_instance_points: 5,
                        assessment_instance_score_perc: 5/20 * 100,
                    },
                };
            });
        });
        checkAssessmentScore();
    });

    describe('16. grade exam', function() {
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
});
