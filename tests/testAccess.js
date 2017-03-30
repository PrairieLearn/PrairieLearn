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
var assessmentUrl, assessmentInstanceUrl, q1Url, q2Url;

describe('Access control as a student', function() {

    before("set up testing server", helperServer.before);
    after("shut down testing server", helperServer.after);

    var makeCookies = function() {
        var cookies = request.jar();
        var cookie = request.cookie('pl_test_user=test_student');
        cookies.setCookie(cookie, siteUrl);
        return cookies;
    };

    var user;

    describe('GET /pl as student', function() {
        it('should load successfully', function(callback) {
            var cookies = makeCookies();
            request({url: baseUrl, jar: cookies}, function (error, response, body) {
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
        it('should not contain any courses', function() {
            elemList = $('#content td a');
            assert.lengthOf(elemList, 0);
        });
    });

    describe('the student user', function() {
        it('should select from the DB', function(callback) {
            sqldb.queryOneRow(sql.select_student_user, [], function(err, result) {
                if (ERR(err, callback)) return;
                user = result.rows[0];
                callback(null);
            });
        });
    });

    describe('Enroll student user into exampleCourse', function() {
        it('should succeed', function(callback) {
            var params = {user_id: user.user_id};
            sqldb.query(sql.insert_student_enrollment, params, function(err, result) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    });

    describe('GET /pl as student', function() {
        it('should load successfully', function(callback) {
            var cookies = makeCookies();
            request({url: baseUrl, jar: cookies}, function (error, response, body) {
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
        it('should contain TPL 101', function() {
            elemList = $('#content td a:contains("TPL 101")');
            assert.lengthOf(elemList, 1);
            
        });
        it('should have the correct link for TPL 101', function() {
            assert.deepPropertyVal(elemList[0], 'attribs.href', '/pl/course_instance/1');
        });
    });

    describe('GET /pl as student in 2014', function() {
        it('should load successfully', function(callback) {
            var cookies = makeCookies();
            cookies.setCookie(request.cookie('pl_requested_date=2014-06-13T13:12:00Z'), siteUrl);
            request({url: baseUrl, jar: cookies}, function (error, response, body) {
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
        it('should not contain any courses', function() {
            elemList = $('#content td a');
            assert.lengthOf(elemList, 0);
        });
    });

    describe('GET /pl as student in 2400', function() {
        it('should load successfully', function(callback) {
            var cookies = makeCookies();
            cookies.setCookie(request.cookie('pl_requested_date=2400-06-13T13:12:00Z'), siteUrl);
            request({url: baseUrl, jar: cookies}, function (error, response, body) {
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
        it('should not contain any courses', function() {
            elemList = $('#content td a');
            assert.lengthOf(elemList, 0);
        });
    });

    describe('database', function() {
        it('should contain E1', function(callback) {
            sqldb.queryOneRow(sql.select_e1, [], function(err, result) {
                if (ERR(err, callback)) return;
                assessment_id = result.rows[0].id;
                callback(null);
            });
        });
    });

    describe('GET /pl/assessments as student', function() {
        it('should load successfully', function(callback) {
            var cookies = makeCookies();
            request({url: assessmentsUrl, jar: cookies}, function (error, response, body) {
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
        it('should not contain E1', function() {
            elemList = $('td a:contains("Exam for automatic test suite")');
            assert.lengthOf(elemList, 0);
        });
    });

    describe('GET /pl/assessments as student in Exam mode', function() {
        it('should load successfully', function(callback) {
            var cookies = makeCookies();
            cookies.setCookie(request.cookie('pl_requested_mode=Exam'), siteUrl);
            request({url: assessmentsUrl, jar: cookies}, function (error, response, body) {
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
            elemList = $('td a:contains("Exam for automatic test suite")');
            assert.lengthOf(elemList, 1);
        });
        it('should have the correct link for E1', function() {
            assessmentUrl = siteUrl + elemList[0].attribs.href;
            assert.equal(assessmentUrl, courseInstanceBaseUrl + '/assessment/' + assessment_id + '/');
        });
    });

    describe('GET /pl/assessments as student in Exam mode in 2015', function() {
        it('should load successfully', function(callback) {
            var cookies = makeCookies();
            cookies.setCookie(request.cookie('pl_requested_mode=Exam'), siteUrl);
            cookies.setCookie(request.cookie('pl_requested_date=2015-06-13T13:12:00Z'), siteUrl);
            request({url: assessmentsUrl, jar: cookies}, function (error, response, body) {
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
        it('should not contain E1', function() {
            elemList = $('td a:contains("Exam for automatic test suite")');
            assert.lengthOf(elemList, 0);
        });
    });

    describe('GET /pl/assessments as student in Exam mode in 2250', function() {
        it('should load successfully', function(callback) {
            var cookies = makeCookies();
            cookies.setCookie(request.cookie('pl_requested_mode=Exam'), siteUrl);
            cookies.setCookie(request.cookie('pl_requested_date=2250-06-13T13:12:00Z'), siteUrl);
            request({url: assessmentsUrl, jar: cookies}, function (error, response, body) {
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
        it('should not contain E1', function() {
            elemList = $('td a:contains("Exam for automatic test suite")');
            assert.lengthOf(elemList, 0);
        });
    });
});
