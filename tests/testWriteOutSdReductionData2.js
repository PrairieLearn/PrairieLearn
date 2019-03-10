var ERR = require('async-stacktrace');
var _ = require('lodash');
var assert = require('chai').assert;
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
var cheerio = require('cheerio');
var request = require('request');
var config = require('../lib/config');

var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');
var sql = sqlLoader.loadSqlEquiv(__filename);

var helperServer = require('./helperServer');
var helperQuestion = require('./helperQuestion');
var helperExam = require('./helperExam');

const locals = {};

const numAlternativeGroups = 2;

describe('Exam assessment', function() {
    this.timeout(60000);

    before('set up testing server', helperServer.before);
    after('shut down testing server', helperServer.after);

    describe('The locals object', function() {
        it('should be cleared', function() {
            for (var prop in locals) {
                delete locals[prop];
            }
        });
        it('Should be initialized', function() {
            locals.siteUrl = 'http://localhost:' + config.serverPort;
            locals.baseUrl = locals.siteUrl + '/pl';
            locals.courseInstanceBaseUrl = locals.baseUrl + '/course_instance/1';
            locals.instructorBaseUrl = locals.courseInstanceBaseUrl + '/instructor';
            locals.instructorAssessmentsUrl = locals.instructorBaseUrl + '/assessments';
            locals.instructorGradebookUrl = locals.instructorBaseUrl + '/gradebook';
            locals.questionBaseUrl = locals.courseInstanceBaseUrl + '/instance_question';
            locals.assessmentsUrl = locals.courseInstanceBaseUrl + '/assessments';
            locals.isStudentPage = true;
            locals.totalPoints = 0;
        });
    });

    // ensures that the database contains assessment E7
    describe('The database', function() {
        it('should contain E7', function(callback) {
            sqldb.queryOneRow(sql.select_e7, [], function(err, result) {
                if (ERR(err, callback)) return;
                locals.assessment_id = result.rows[0].id;
                callback(null);
            });
        });

        it('should have SD reduction enabled for E7', function(callback) {
            sqldb.queryOneRow(sql.select_e7, [], function(err, result) {
                if (ERR(err, callback)) return;
                locals.assessment_id = result.rows[0].id;
                callback(null);
            });
        });
    });

    describe('Mocked assessment statistics', function() {
        var quintiles = [1, 2, 3, 4, 5];
        var quintile_means = [0.4, 0.6, 0.8, 0.9, 1];
        quintiles.forEach(function(quintile) {

            it(`for quintile ${quintile} should be loaded into the DB.`, function(callback) {
                var params = {
                    'assessment_id': locals.assessment_id,
                    'quintile': quintile,
                    'mean_score': quintile_means[quintile],
                    'score_sd': 0.1
                }
                sqldb.query(sql.insert_assessment_quintile_statistics, params, function(err, _result) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            });
        });
    });

    // insert question stats
    describe('Mocked question stats', function() {
        it('should be loaded into the DB.', function(callback) {
            sqldb.query(sql.insert_addNumbers_question_statistics, [], function(err, _result) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    });
    // insert question stats
    describe('Mocked question stats', function() {
        it('should be loaded into the DB.', function(callback) {
            sqldb.query(sql.insert_addVectors_question_statistics, [], function(err, _result) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    });
    // insert question stats
    describe('Mocked question stats', function() {
        it('should be loaded into the DB.', function(callback) {
            sqldb.query(sql.insert_partialCredit1_question_statistics, [], function(err, _result) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    });
    // insert question stats
    describe('Mocked question stats', function() {
        it('should be loaded into the DB.', function(callback) {
            sqldb.query(sql.insert_partialCredit2_question_statistics, [], function(err, _result) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    });

    // create a bunch of test users
    describe('Test user', function() {
        var userNumbers = Array.apply(null, {length: 10}).map(Function.call, Number);
        userNumbers.forEach(function(i) {

            it(`${i} should be loaded into the DB.`, function(callback) {
                var params = {
                    'user_id': i + 100,
                    'uid': 'user-' + i + '@illinois.edu'
                }
                sqldb.query(sql.insert_test_users, params, function(err, _result) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            });
        });
    });

    // loads assessments page
    describe('GET to assessments URL', function() {
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
        it('should contain E7', function() {
            elemList = locals.$('td a:contains("Exam for automatic test suite with alternative groups")');
            assert.lengthOf(elemList, 1);
        });
        it('should have the correct link for E7', function() {
            console.log(elemList[0].attribs.href);
            locals.assessmentUrl = locals.siteUrl + elemList[0].attribs.href;
            assert.equal(locals.assessmentUrl, locals.courseInstanceBaseUrl + '/assessment/' + locals.assessment_id + '/');
        });
    });

    // loads E7 page
    describe('GET to assessment URL', function() {
        it('should load successfully', function(callback) {
            request(locals.assessmentUrl, function (error, response, body) {
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
        it('should contain "Please wait"', function() {
            elemList = locals.$('p.lead:contains("Please wait")');
            assert.lengthOf(elemList, 1);
        });
        it('should contain "Exam 7"', function() {
            elemList = locals.$('p.lead strong:contains("Exam 7")');
            assert.lengthOf(elemList, 1);
        });
        it('should contain "XC 101"', function() {
            elemList = locals.$('p.lead strong:contains("XC 101")');
            assert.lengthOf(elemList, 1);
        });
        it('should have a CSRF token', function() {
            elemList = locals.$('form input[name="__csrf_token"]');
            assert.lengthOf(elemList, 1);
            assert.nestedProperty(elemList[0], 'attribs.value');
            locals.__csrf_token = elemList[0].attribs.value;
            assert.isString(locals.__csrf_token);
        });
    });

    // generates assessment instance and redirects to assessment instance page
    describe('POST to assessment URL', function() {
        it('should load successfully', function(callback) {
            var form = {
                __action: 'newInstance',
                __csrf_token: locals.__csrf_token,
            };
            locals.preStartTime = Date.now();
            request.post({url: locals.assessmentUrl, form: form, followAllRedirects: true}, function (error, response, body) {
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
        it('should parse', function() {
            locals.$ = cheerio.load(page);
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
        it(`should create ${numAlternativeGroups} instance_questions`, function(callback) {
            sqldb.query(sql.select_instance_questions, [], function(err, result) {
                if (ERR(err, callback)) return;
                if (result.rowCount != numAlternativeGroups) {
                    return callback(new Error(`expected ${numAlternativeGroups} instance_questions, got: ` + result.rowCount));
                }
                locals.instance_questions = result.rows;
                callback(null);
            });
        });
        it('should select 2 questions', function(callback) {
            assert.equal(2, locals.instance_questions.length);
            callback(null);
        });
    });
});
