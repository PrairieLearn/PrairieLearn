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

describe('Access control', function() {

    before("set up testing server", helperServer.before);
    after("shut down testing server", helperServer.after);

    var cookiesStudent = function() {
        var cookies = request.jar();
        cookies.setCookie(request.cookie('pl_test_user=test_student'), siteUrl);
        return cookies;
    };

    var cookiesStudentExam = function() {
        var cookies = cookiesStudent();
        cookies.setCookie(request.cookie('pl_requested_mode=Exam'), siteUrl);
        return cookies;
    };

    var cookiesStudentExamBefore = function() {
        var cookies = cookiesStudentExam();
        cookies.setCookie(request.cookie('pl_requested_date=2015-06-13T13:12:00Z'), siteUrl);
        return cookies;
    };

    var cookiesStudentExamAfter = function() {
        var cookies = cookiesStudentExam();
        cookies.setCookie(request.cookie('pl_requested_date=2250-06-13T13:12:00Z'), siteUrl);
        return cookies;
    };

    var cookiesStudentBeforeCourseInstance = function() {
        var cookies = cookiesStudent();
        cookies.setCookie(request.cookie('pl_requested_date=2014-06-13T13:12:00Z'), siteUrl);
        return cookies;
    };

    var cookiesStudentAfterCourseInstance = function() {
        var cookies = cookiesStudent();
        cookies.setCookie(request.cookie('pl_requested_date=2400-06-13T13:12:00Z'), siteUrl);
        return cookies;
    };

    var user, res, page, $, elemList;
    var assessment_id, assessment_instance, instance_questions;
    var csrfToken, instance_question_1_id, instance_question_2_id;

    /**********************************************************************/

    var getPl = function(cookies, shouldContainTPL101, callback) {
        request({url: baseUrl, jar: cookies}, function (error, response, body) {
            if (error) {
                return callback(error);
            }
            if (response.statusCode != 200) {
                return callback(new Error('bad status: ' + response.statusCode));
            }
            res = response;
            page = body;
            try {
                $ = cheerio.load(page);
                elemList = $('#content td a:contains("TPL 101")');
                assert.lengthOf(elemList, shouldContainTPL101 ? 1 : 0);
            } catch (err) {
                return callback(err);
            }
            callback(null);
        });
    };
    
    describe('GET /pl', function() {
        it('as student should not contain TPL 101', function(callback) {
            getPl(cookiesStudent(), false, callback);
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

    describe('GET /pl', function() {
        it('as student should contain TPL 101', function(callback) {
            getPl(cookiesStudent(), true, callback);
        });
        it('as student in Exam mode before course instance time period should contain TPL 101', function(callback) {
            getPl(cookiesStudentBeforeCourseInstance(), false, callback);
        });
        it('as student in Exam mode after course instance time period should contain TPL 101', function(callback) {
            getPl(cookiesStudentAfterCourseInstance(), false, callback);
        });
    });

    /**********************************************************************/

    describe('database', function() {
        it('should contain E1', function(callback) {
            sqldb.queryOneRow(sql.select_e1, [], function(err, result) {
                if (ERR(err, callback)) return;
                assessment_id = result.rows[0].id;
                callback(null);
            });
        });
    });

    /**********************************************************************/

    var getAssessments = function(cookies, shouldContainE1, callback) {
        request({url: assessmentsUrl, jar: cookies}, function (error, response, body) {
            if (error) {
                return callback(error);
            }
            if (response.statusCode != 200) {
                return callback(new Error('bad status: ' + response.statusCode));
            }
            res = response;
            page = body;
            try {
                $ = cheerio.load(page);
                elemList = $('td a:contains("Exam for automatic test suite")');
                assert.lengthOf(elemList, shouldContainE1 ? 1 : 0);
            } catch (err) {
                return callback(err);
            }
            callback(null);
        });
    };

    describe('GET /pl/assessments', function() {
        it('as student should not contain E1', function(callback) {
            getAssessments(cookiesStudent(), false, callback);
        });
        it('as student in Exam mode before time period should not contain E1', function(callback) {
            getAssessments(cookiesStudentExamBefore(), false, callback);
        });
        it('as student in Exam mode after time period should not contain E1', function(callback) {
            getAssessments(cookiesStudentExamAfter(), false, callback);
        });
        it('as student in Exam mode should contain E1', function(callback) {
            getAssessments(cookiesStudentExam(), true, callback);
        });
        it('should have the correct link for E1', function() {
            assert.deepProperty(elemList[0], 'attribs.href');
            assessmentUrl = siteUrl + elemList[0].attribs.href;
            assert.equal(assessmentUrl, courseInstanceBaseUrl + '/assessment/' + assessment_id + '/');
        });
    });

    /**********************************************************************/

    var getAssessment = function(cookies, expectedStatusCode, callback) {
        request({url: assessmentUrl, jar: cookies}, function (error, response, body) {
            if (error) {
                return callback(error);
            }
            if (response.statusCode != expectedStatusCode) {
                return callback(new Error('bad status: ' + response.statusCode));
            }
            res = response;
            page = body;
            callback(null);
        });
    };
    
    describe('GET to assessment URL', function() {
        it('as student should return 500', function(callback) {
            getAssessment(cookiesStudent(), 500, callback);
        });
        it('as student in Exam mode before time period should return 500', function(callback) {
            getAssessment(cookiesStudentExamBefore(), 500, callback);
        });
        it('as student in Exam mode after time period should return 500', function(callback) {
            getAssessment(cookiesStudentExamAfter(), 500, callback);
        });
        it('as student in Exam mode should load successfully', function(callback) {
            getAssessment(cookiesStudentExam(), 200, callback);
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

    /**********************************************************************/
    
    var postAssessment = function(cookies, expectedStatusCode, callback) {
        var form = {
            postAction: 'newInstance',
            csrfToken: csrfToken,
        };
        request.post({url: assessmentUrl, form: form, jar: cookies, followAllRedirects: true}, function (error, response, body) {
            if (error) {
                return callback(error);
            }
            if (response.statusCode != expectedStatusCode) {
                return callback(new Error('bad status: ' + response.statusCode));
            }
            res = response;
            page = body;
            callback(null);
        });
    };
    
    describe('POST to assessment URL', function() {
        it('as student should return 500', function(callback) {
            postAssessment(cookiesStudent(), 500, callback);
        });
        it('as student in Exam mode before time period should return 500', function(callback) {
            postAssessment(cookiesStudentExamBefore(), 500, callback);
        });
        it('in Exam mode after time period should return 500', function(callback) {
            postAssessment(cookiesStudentExamAfter(), 500, callback);
        });
        it('as student in Exam mode should load successfully', function(callback) {
            postAssessment(cookiesStudentExam(), 200, callback);
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

    /**********************************************************************/
    
    var getAssessmentInstance = function(cookies, expectedStatusCode, callback) {
        request({url: assessmentInstanceUrl, jar: cookies}, function (error, response, body) {
            if (error) {
                return callback(error);
            }
            if (response.statusCode != expectedStatusCode) {
                return callback(new Error('bad status: ' + response.statusCode));
            }
            res = response;
            page = body;
            callback(null);
        });
    };

    describe('GET to assessment_instance URL', function() {
        it('as student should return 500', function(callback) {
            getAssessmentInstance(cookiesStudent(), 500, callback);
        });
        it('as student in Exam mode before time period should return 500', function(callback) {
            getAssessmentInstance(cookiesStudentExamBefore(), 500, callback);
        });
        it('as student in Exam mode after time period should return 500', function(callback) {
            getAssessmentInstance(cookiesStudentExamAfter(), 500, callback);
        });
        it('as student in Exam mode should load successfully', function(callback) {
            getAssessmentInstance(cookiesStudentExam(), 200, callback);
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

    /**********************************************************************/
    
    var postAssessmentInstance = function(cookies, expectedStatusCode, callback) {
        var form = {
            postAction: 'grade',
            csrfToken: csrfToken,
        };
        request.post({url: assessmentInstanceUrl, form: form, jar: cookies, followAllRedirects: true}, function (error, response, body) {
            if (error) {
                return callback(error);
            }
            if (response.statusCode != expectedStatusCode) {
                return callback(new Error('bad status: ' + response.statusCode));
            }
            callback(null);
        });
    };
    
    describe('POST to assessment_instance URL', function() {
        it('as student should return 500', function(callback) {
            postAssessmentInstance(cookiesStudent(), 500, callback);
        });
        it('as student in Exam mode before time period should return 500', function(callback) {
            postAssessmentInstance(cookiesStudentExamBefore(), 500, callback);
        });
        it('as student in Exam mode after time period should return 500', function(callback) {
            postAssessmentInstance(cookiesStudentExamAfter(), 500, callback);
        });
        it('as student in Exam mode should load successfully', function(callback) {
            postAssessmentInstance(cookiesStudentExam(), 200, callback);
        });
    });

    /**********************************************************************/
    
});
