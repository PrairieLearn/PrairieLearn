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
var assessmentInstanceUrl = courseInstanceBaseUrl + '/assessment_instance/1';

describe('Access control', function() {

    before("set up testing server", helperServer.before);
    after("shut down testing server", helperServer.after);

    /*
      There are three nested time periods:
      reservation < assessment < course instance

      Times are:

      1750 before course instance
      1800 start course instance
      1850 before assessment
      1900 start assessment
      1950 before reservation
      2000 start reservation

      2200 end reservation
      2250 after reservation
      2300 end assessment
      2350 after assessment
      2400 end course instance
      2450 after course_instance
     */

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

    var cookiesStudentExamBeforeCourseInstance = function() {
        var cookies = cookiesStudentExam();
        cookies.setCookie(request.cookie('pl_requested_date=1750-06-13T13:12:00Z'), siteUrl);
        return cookies;
    };

    var cookiesStudentExamBeforeAssessment = function() {
        var cookies = cookiesStudentExam();
        cookies.setCookie(request.cookie('pl_requested_date=1850-06-13T13:12:00Z'), siteUrl);
        return cookies;
    };

    var cookiesStudentExamBeforeReservation = function() {
        var cookies = cookiesStudentExam();
        cookies.setCookie(request.cookie('pl_requested_date=1950-06-13T13:12:00Z'), siteUrl);
        return cookies;
    };

    var cookiesStudentExamAfterReservation = function() {
        var cookies = cookiesStudentExam();
        cookies.setCookie(request.cookie('pl_requested_date=2250-06-13T13:12:00Z'), siteUrl);
        return cookies;
    };

    var cookiesStudentExamAfterAssessment = function() {
        var cookies = cookiesStudentExam();
        cookies.setCookie(request.cookie('pl_requested_date=2350-06-13T13:12:00Z'), siteUrl);
        return cookies;
    };

    var cookiesStudentExamAfterCourseInstance = function() {
        var cookies = cookiesStudentExam();
        cookies.setCookie(request.cookie('pl_requested_date=2450-06-13T13:12:00Z'), siteUrl);
        return cookies;
    };

    var user, res, page, $, elemList;
    var assessment_id, assessment_instance, instance_questions;
    var csrfToken, instance_question_1_id, instance_question_2_id;
    var assessmentUrl, q1Url, questionData, variant;

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
        it('as student in Exam mode before course instance time period should not contain TPL 101', function(callback) {
            getPl(cookiesStudentExamBeforeCourseInstance(), false, callback);
        });
        it('as student in Exam mode after course instance time period should not contain TPL 101', function(callback) {
            getPl(cookiesStudentExamAfterCourseInstance(), false, callback);
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
            getAssessments(cookiesStudentExamBeforeAssessment(), false, callback);
        });
        it('as student in Exam mode after time period should not contain E1', function(callback) {
            getAssessments(cookiesStudentExamAfterAssessment(), false, callback);
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
            getAssessment(cookiesStudentExamBeforeAssessment(), 500, callback);
        });
        it('as student in Exam mode after time period should return 500', function(callback) {
            getAssessment(cookiesStudentExamAfterAssessment(), 500, callback);
        });
        it('as student in Exam mode should load successfully', function(callback) {
            getAssessment(cookiesStudentExam(), 200, callback);
        });
        it('should parse', function() {
            $ = cheerio.load(page);
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
            postAssessment(cookiesStudentExamBeforeAssessment(), 500, callback);
        });
        it('in Exam mode after time period should return 500', function(callback) {
            postAssessment(cookiesStudentExamAfterAssessment(), 500, callback);
        });
        it('as student in Exam mode should load successfully', function(callback) {
            postAssessment(cookiesStudentExam(), 200, callback);
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
            getAssessmentInstance(cookiesStudentExamBeforeAssessment(), 500, callback);
        });
        it('as student in Exam mode after time period should return 500', function(callback) {
            getAssessmentInstance(cookiesStudentExamAfterAssessment(), 500, callback);
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
        it('should link to addVectors question', function() {
            elemList = $('td a:contains("Addition of vectors in Cartesian coordinates")');
            assert.lengthOf(elemList, 1);
            assert.deepProperty(elemList[0], 'attribs.href');
            q1Url = siteUrl + elemList[0].attribs.href;
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
            postAssessmentInstance(cookiesStudentExamBeforeAssessment(), 500, callback);
        });
        it('as student in Exam mode after time period should return 500', function(callback) {
            postAssessmentInstance(cookiesStudentExamAfterAssessment(), 500, callback);
        });
        it('as student in Exam mode should load successfully', function(callback) {
            postAssessmentInstance(cookiesStudentExam(), 200, callback);
        });
    });

    /**********************************************************************/
    
    var getInstanceQuestion = function(cookies, expectedStatusCode, callback) {
        request({url: q1Url, jar: cookies}, function (error, response, body) {
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

    describe('GET to instance_question URL', function() {
        it('as student should return 500', function(callback) {
            getInstanceQuestion(cookiesStudent(), 500, callback);
        });
        it('as student in Exam mode before time period should return 500', function(callback) {
            getInstanceQuestion(cookiesStudentExamBeforeAssessment(), 500, callback);
        });
        it('as student in Exam mode after time period should return 500', function(callback) {
            getInstanceQuestion(cookiesStudentExamAfterAssessment(), 500, callback);
        });
        it('as student in Exam mode should load successfully', function(callback) {
            getInstanceQuestion(cookiesStudentExam(), 200, callback);
        });
        it('should parse', function() {
            $ = cheerio.load(page);
        });
        it('should contain question-data', function() {
            elemList = $('.question-data');
            assert.lengthOf(elemList, 1);
        });
        it('question-data should contain base64 data', function() {
            assert.deepProperty(elemList[0], 'children.0.data');
            assert.lengthOf(elemList[0].children, 1);
            assert.property(elemList[0].children[0], 'data');
        });
        it('base64 data should parse to JSON', function() {
            questionData = JSON.parse(decodeURIComponent(new Buffer(elemList[0].children[0].data, 'base64').toString()));
        });
        it('should have a variant_id in the questionData', function() {
            assert.deepProperty(questionData, 'variant.id');
            variant = questionData.variant;
        });
        it('should have a CSRF token', function() {
            elemList = $('.question-form input[name="csrfToken"]');
            assert.lengthOf(elemList, 1);
            assert.deepProperty(elemList[0], 'attribs.value');
            csrfToken = elemList[0].attribs.value;
            assert.isString(csrfToken);
        });
    });

    /**********************************************************************/
    
    var postInstanceQuestion = function(cookies, expectedStatusCode, callback) {
        var submittedAnswer = {
            wx: 0,
            wy: 0,
        };
        var form = {
            postAction: 'submitQuestionAnswer',
            csrfToken: csrfToken,
            postData: JSON.stringify({variant, submittedAnswer}),
        };
        request.post({url: q1Url, form: form, jar: cookies, followAllRedirects: true}, function (error, response, body) {
            if (error) {
                return callback(error);
            }
            if (response.statusCode != expectedStatusCode) {
                return callback(new Error('bad status: ' + response.statusCode));
            }
            callback(null);
        });
    };
    
    describe('POST to instance_question URL', function() {
        it('as student should return 500', function(callback) {
            postInstanceQuestion(cookiesStudent(), 500, callback);
        });
        it('as student in Exam mode before time period should return 500', function(callback) {
            postInstanceQuestion(cookiesStudentExamBeforeAssessment(), 500, callback);
        });
        it('as student in Exam mode after time period should return 500', function(callback) {
            postInstanceQuestion(cookiesStudentExamAfterAssessment(), 500, callback);
        });
        it('as student in Exam mode should load successfully', function(callback) {
            postInstanceQuestion(cookiesStudentExam(), 200, callback);
        });
    });

    /**********************************************************************/

    describe('insert PrairieSchedule course link', function() {
        it('should succeed', function(callback) {
            sqldb.query(sql.insert_ps_course_link, [], function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
        it('should block access to the assessment_instance', function(callback) {
            getAssessmentInstance(cookiesStudentExam(), 500, callback);
        });
    });

    describe('insert PrairieSchedule reservation', function() {
        it('should succeed', function(callback) {
            var params = {user_id: user.user_id};
            sqldb.query(sql.insert_ps_reservation, params, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
        it('should block access to the assessment_instance', function(callback) {
            getAssessmentInstance(cookiesStudentExam(), 500, callback);
        });
        it('should block access to the assessment_instance before the reservation', function(callback) {
            getAssessmentInstance(cookiesStudentExamBeforeReservation(), 500, callback);
        });
        it('should block access to the assessment_instance after the reservation', function(callback) {
            getAssessmentInstance(cookiesStudentExamAfterReservation(), 500, callback);
        });
    });

    describe('check in PrairieSchedule reservation', function() {
        it('should succeed', function(callback) {
            sqldb.query(sql.update_ps_reservation_to_checked_in, [], function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
        it('should enable access to the assessment_instance', function(callback) {
            getAssessmentInstance(cookiesStudentExam(), 200, callback);
        });
        it('should block access to the assessment_instance before the reservation', function(callback) {
            getAssessmentInstance(cookiesStudentExamBeforeReservation(), 500, callback);
        });
        it('should block access to the assessment_instance after the reservation', function(callback) {
            getAssessmentInstance(cookiesStudentExamAfterReservation(), 500, callback);
        });
    });

    /**********************************************************************/
    
});
