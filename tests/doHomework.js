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
var assessmentsUrl = baseUrl + '/course_instance/1/assessments';
var assessmentUrl, assessmentInstanceUrl, q1Url, q2Url;

describe('Homework assessment', function() {

    before("set up testing server", testHelperServer.before);
    after("shut down testing server", testHelperServer.after);

    var res, page, $, elemList;
    var assessment_id, assessment_instance, instance_questions, variant, submission;
    var csrfToken, instance_question;

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
            })
        });
        it('should parse', function() {
            $ = cheerio.load(page);
        });
        it('should contain HW1', function() {
            elemList = $('td a:contains("HW1")');
            assert.ok(elemList.length);
        });
        it('should have the correct link for HW1', function() {
            assessmentUrl = siteUrl + elemList[0].attribs.href;
            assert.equal(assessmentUrl, baseUrl + '/course_instance/1/assessment/' + assessment_id + '/');
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
        });
        it('should have the correct second question', function() {
            assert.equal(instance_questions[1].qid, 'fossilFuelsRadio');
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
            assert.equal(elemList.length, 1);
            q1Url = siteUrl + elemList[0].attribs.href;
            assert.equal(q1Url, baseUrl + '/course_instance/1/instance_question/' + instance_questions[0].id + '/');
        });
        it('should link to fossilFuelsRadio question', function() {
            elemList = $('td a:contains("Advantages of fossil fuels (radio)")');
            assert.equal(elemList.length, 1);
            q2Url = siteUrl + elemList[0].attribs.href;
            assert.equal(q2Url, baseUrl + '/course_instance/1/instance_question/' + instance_questions[1].id + '/');
        });
    });

    describe('GET to question 1 URL', function() {
        it('should load successfully', function(callback) {
            request(q1Url, function (error, response, body) {
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
        it('should create one variant', function(callback) {
            sqldb.query(sql.select_variants, [], function(err, result) {
                if (ERR(err, callback)) return;
                if (result.rowCount != 1) {
                    return callback(new Error('expected one variant, got: ' + result.rowCount));
                }
                variant = result.rows[0];
                callback(null);
            });
        });
        it('should have the correct variant.instance_question_id', function() {
            assert.equal(variant.instance_question_id, instance_questions[0].id);
        });
        it('should have a CSRF token', function() {
            elemList = $('.question-form input[name="csrfToken"]');
            assert.equal(elemList.length, 1);
            elemList[0].should.have.property('attribs');
            elemList[0].attribs.should.have.property('value');
            csrfToken = elemList[0].attribs.value;
            csrfToken.should.be.a.String();
            csrfToken.length.should.be.above(10);
        });
    });

    describe('POST to question 1 URL with correct answer', function() {
        it('should load successfully', function(callback) {
            var form = {
                postAction: 'submitQuestionAnswer',
                csrfToken: csrfToken,
                postData: JSON.stringify({
                    variant: variant,
                    submittedAnswer: {
                        wx: variant.true_answer.wx,
                        wy: variant.true_answer.wy,
                    },
                }),
            };
            request.post({url: q1Url, form: form}, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 302) {
                    return callback(new Error('bad status (expected 302): ' + response.statusCode));
                }
                res = response;
                page = body;
                callback(null);
            })
        });
        it('should parse', function() {
            $ = cheerio.load(page);
        });
        it('should create one submission', function(callback) {
            sqldb.query(sql.select_submissions, [], function(err, result) {
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
        it('should be graded with max score', function() {
            assert.equal(submission.score, 1);
        });
        it('should be graded correct', function() {
            assert.equal(submission.correct, true);
        });
        it('should still have the instance_question', function(callback) {
            var params = {
                instance_question_id: instance_questions[0].id,
            };
            sqldb.queryOneRow(sql.select_instance_question, params, function(err, result) {
                if (ERR(err, callback)) return;
                instance_question = result.rows[0];
                callback(null);
            });
        });
        it('should update instance_question points', function() {
            instance_question.points.should.equal(1);
        });
        it('should update instance_question score_perc', function() {
            instance_question.score_perc.should.be.approximately(1/5 * 100, 0.001);
        });
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
        it('should update assessment_instance points', function() {
            assessment_instance.points.should.equal(1);
        });
        it('should update assessment_instance score_perc', function() {
            assessment_instance.score_perc.should.be.approximately(1/15 * 100, 0.001);
        });
    });
});
