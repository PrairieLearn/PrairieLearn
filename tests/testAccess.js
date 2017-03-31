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

    var user, res, page, $, elemList;
    var assessment_id, assessment_instance, instance_questions;
    var csrfToken, instance_question_1_id, instance_question_2_id;

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

    describe('GET to assessment URL as student', function() {
        it('should return 500', function(callback) {
            var cookies = makeCookies();
            request({url: assessmentUrl, jar: cookies}, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 500) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                callback(null);
            })
        });
    });

    describe('GET to assessment URL as student in Exam mode in 2015', function() {
        it('should return 500', function(callback) {
            var cookies = makeCookies();
            cookies.setCookie(request.cookie('pl_requested_mode=Exam'), siteUrl);
            cookies.setCookie(request.cookie('pl_requested_date=2015-06-13T13:12:00Z'), siteUrl);
            request({url: assessmentUrl, jar: cookies}, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 500) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                callback(null);
            })
        });
    });

    describe('GET to assessment URL as student in Exam mode in 2250', function() {
        it('should return 500', function(callback) {
            var cookies = makeCookies();
            cookies.setCookie(request.cookie('pl_requested_mode=Exam'), siteUrl);
            cookies.setCookie(request.cookie('pl_requested_date=2250-06-13T13:12:00Z'), siteUrl);
            request({url: assessmentUrl, jar: cookies}, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 500) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                callback(null);
            })
        });
    });

    describe('GET to assessment URL as student in Exam mode', function() {
        it('should load successfully', function(callback) {
            var cookies = makeCookies();
            cookies.setCookie(request.cookie('pl_requested_mode=Exam'), siteUrl);
            request({url: assessmentUrl, jar: cookies}, function (error, response, body) {
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

    describe('POST to assessment URL as student', function() {
        it('should return 500', function(callback) {
            var form = {
                postAction: 'newInstance',
                csrfToken: csrfToken,
            };
            var cookies = makeCookies();
            request.post({url: assessmentUrl, form: form, jar: cookies, followAllRedirects: true}, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 500) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                callback(null);
            })
        });
    });

    describe('POST to assessment URL as student in Exam mode in 2015', function() {
        it('should return 500', function(callback) {
            var form = {
                postAction: 'newInstance',
                csrfToken: csrfToken,
            };
            var cookies = makeCookies();
            cookies.setCookie(request.cookie('pl_requested_mode=Exam'), siteUrl);
            cookies.setCookie(request.cookie('pl_requested_date=2015-06-13T13:12:00Z'), siteUrl);
            request.post({url: assessmentUrl, form: form, jar: cookies, followAllRedirects: true}, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 500) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                callback(null);
            })
        });
    });

    describe('POST to assessment URL as student in Exam mode in 2250', function() {
        it('should return 500', function(callback) {
            var form = {
                postAction: 'newInstance',
                csrfToken: csrfToken,
            };
            var cookies = makeCookies();
            cookies.setCookie(request.cookie('pl_requested_mode=Exam'), siteUrl);
            cookies.setCookie(request.cookie('pl_requested_date=2250-06-13T13:12:00Z'), siteUrl);
            request.post({url: assessmentUrl, form: form, jar: cookies, followAllRedirects: true}, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 500) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                callback(null);
            })
        });
    });

    describe('POST to assessment URL as student in Exam mode', function() {
        it('should load successfully', function(callback) {
            var form = {
                postAction: 'newInstance',
                csrfToken: csrfToken,
            };
            var cookies = makeCookies();
            cookies.setCookie(request.cookie('pl_requested_mode=Exam'), siteUrl);
            request.post({url: assessmentUrl, form: form, jar: cookies, followAllRedirects: true}, function (error, response, body) {
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

    describe('GET to assessment_instance URL as student', function() {
        it('should return 500', function(callback) {
            var cookies = makeCookies();
            request({url: assessmentInstanceUrl, jar: cookies}, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 500) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                callback(null);
            })
        });
    });

    describe('GET to assessment_instance URL as student in Exam mode in 2015', function() {
        it('should return 500', function(callback) {
            var cookies = makeCookies();
            cookies.setCookie(request.cookie('pl_requested_mode=Exam'), siteUrl);
            cookies.setCookie(request.cookie('pl_requested_date=2015-06-13T13:12:00Z'), siteUrl);
            request({url: assessmentInstanceUrl, jar: cookies}, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 500) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                callback(null);
            })
        });
    });

    describe('GET to assessment_instance URL as student in Exam mode in 2250', function() {
        it('should return 500', function(callback) {
            var cookies = makeCookies();
            cookies.setCookie(request.cookie('pl_requested_mode=Exam'), siteUrl);
            cookies.setCookie(request.cookie('pl_requested_date=2250-06-13T13:12:00Z'), siteUrl);
            request({url: assessmentInstanceUrl, jar: cookies}, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 500) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                callback(null);
            })
        });
    });

    describe('GET to assessment_instance URL as student in Exam mode', function() {
        it('should load successfully', function(callback) {
            var cookies = makeCookies();
            cookies.setCookie(request.cookie('pl_requested_mode=Exam'), siteUrl);
            request({url: assessmentInstanceUrl, jar: cookies}, function (error, response, body) {
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
            assert.lengthOf(elemList, 1);
            assert.deepProperty(elemList[0], 'attribs.value');
            csrfToken = elemList[0].attribs.value;
            assert.isString(csrfToken);
        });
    });

    describe('POST to assessment_instance URL as student', function() {
        it('should return 500', function(callback) {
            var form = {
                postAction: 'grade',
                csrfToken: csrfToken,
            };
            var cookies = makeCookies();
            request.post({url: assessmentInstanceUrl, form: form, jar: cookies, followAllRedirects: true}, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 500) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                callback(null);
            })
        });
    });

    describe('POST to assessment_instance URL as student in Exam mode in 2015', function() {
        it('should return 500', function(callback) {
            var form = {
                postAction: 'grade',
                csrfToken: csrfToken,
            };
            var cookies = makeCookies();
            cookies.setCookie(request.cookie('pl_requested_mode=Exam'), siteUrl);
            cookies.setCookie(request.cookie('pl_requested_date=2015-06-13T13:12:00Z'), siteUrl);
            request.post({url: assessmentInstanceUrl, form: form, jar: cookies, followAllRedirects: true}, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 500) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                callback(null);
            })
        });
    });

    describe('POST to assessment_instance URL as student in Exam mode in 2250', function() {
        it('should return 500', function(callback) {
            var form = {
                postAction: 'grade',
                csrfToken: csrfToken,
            };
            var cookies = makeCookies();
            cookies.setCookie(request.cookie('pl_requested_mode=Exam'), siteUrl);
            cookies.setCookie(request.cookie('pl_requested_date=2250-06-13T13:12:00Z'), siteUrl);
            request.post({url: assessmentInstanceUrl, form: form, jar: cookies, followAllRedirects: true}, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 500) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                callback(null);
            })
        });
    });

    describe('POST to assessment_instance URL as student in Exam mode', function() {
        it('should load successfully', function(callback) {
            var form = {
                postAction: 'grade',
                csrfToken: csrfToken,
            };
            var cookies = makeCookies();
            cookies.setCookie(request.cookie('pl_requested_mode=Exam'), siteUrl);
            request.post({url: assessmentInstanceUrl, form: form, jar: cookies, followAllRedirects: true}, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 200) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                callback(null);
            })
        });
    });
});
