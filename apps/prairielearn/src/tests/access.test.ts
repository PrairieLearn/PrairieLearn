import { assert } from 'chai';
import request = require('request');
import * as cheerio from 'cheerio';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config';
import { ensureEnrollment } from '../models/enrollment';
import * as helperServer from './helperServer';

const sql = sqldb.loadSqlEquiv(__filename);

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const courseInstanceBaseUrl = baseUrl + '/course_instance/1';
const assessmentsUrl = courseInstanceBaseUrl + '/assessments';
const assessmentInstanceUrl = courseInstanceBaseUrl + '/assessment_instance/1';

describe('Access control', function () {
  this.timeout(20000);

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

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

  function cookiesStudent() {
    const cookies = request.jar();
    cookies.setCookie('pl_test_user=test_student', siteUrl);
    return cookies;
  }

  function cookiesStudentExam() {
    const cookies = cookiesStudent();
    cookies.setCookie('pl_test_mode=Exam', siteUrl);
    return cookies;
  }

  function cookiesStudentExamBeforeCourseInstance() {
    const cookies = cookiesStudentExam();
    cookies.setCookie('pl_test_date=1750-06-13T13:12:00Z', siteUrl);
    return cookies;
  }

  function cookiesStudentExamBeforeAssessment() {
    const cookies = cookiesStudentExam();
    cookies.setCookie('pl_test_date=1850-06-13T13:12:00Z', siteUrl);
    return cookies;
  }

  function cookiesStudentExamAfterAssessment() {
    const cookies = cookiesStudentExam();
    cookies.setCookie('pl_test_date=2350-06-13T13:12:00Z', siteUrl);
    return cookies;
  }

  function cookiesStudentExamAfterCourseInstance() {
    const cookies = cookiesStudentExam();
    cookies.setCookie('pl_test_date=2450-06-13T13:12:00Z', siteUrl);
    return cookies;
  }

  let user, page, $, elemList;
  let assessment_id;
  let __csrf_token;
  let assessmentUrl, q1Url, questionData, variant, instance_question;

  /**********************************************************************/

  const getPl = function (cookies, shouldContainQA101, callback) {
    request({ url: siteUrl, jar: cookies }, function (error, response, body) {
      if (error) {
        return callback(error);
      }
      if (response.statusCode !== 200) {
        return callback(new Error('bad status: ' + response.statusCode));
      }
      page = body;
      try {
        $ = cheerio.load(page);
        elemList = $('#content td a:contains("QA 101")');
        assert.lengthOf(elemList, shouldContainQA101 ? 1 : 0);
      } catch (err) {
        return callback(err);
      }
      callback(null);
    });
  };

  describe('1. GET /pl', function () {
    it('as student should not contain QA 101', function (callback) {
      getPl(cookiesStudent(), false, callback);
    });
  });

  describe('2. the student user', function () {
    it('should select from the DB', async () => {
      const result = await sqldb.queryOneRowAsync(sql.select_student_user, []);
      user = result.rows[0];
    });
  });

  describe('3. Enroll student user into testCourse', function () {
    it('should succeed', async () => {
      await ensureEnrollment({ user_id: user.user_id, course_instance_id: '1' });
    });
  });

  describe('4. GET /pl', function () {
    it('as student should contain QA 101', function (callback) {
      getPl(cookiesStudent(), true, callback);
    });
    it('as student in Exam mode before course instance time period should not contain QA 101', function (callback) {
      getPl(cookiesStudentExamBeforeCourseInstance(), false, callback);
    });
    it('as student in Exam mode after course instance time period should not contain QA 101', function (callback) {
      getPl(cookiesStudentExamAfterCourseInstance(), false, callback);
    });
  });

  /**********************************************************************/

  describe('5. database', function () {
    it('should contain E1', async () => {
      const result = await sqldb.queryOneRowAsync(sql.select_e1, []);
      assessment_id = result.rows[0].id;
    });
  });

  /**********************************************************************/

  const getAssessments = function (cookies, shouldContainE1, callback) {
    request({ url: assessmentsUrl, jar: cookies }, function (error, response, body) {
      if (error) {
        return callback(error);
      }
      if (response.statusCode !== 200) {
        return callback(new Error('bad status: ' + response.statusCode));
      }
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

  describe('6. GET /pl/assessments', function () {
    it('as student should not contain E1', function (callback) {
      getAssessments(cookiesStudent(), false, callback);
    });
    it('as student in Exam mode before time period should not contain E1', function (callback) {
      getAssessments(cookiesStudentExamBeforeAssessment(), false, callback);
    });
    it('as student in Exam mode after time period should not contain E1', function (callback) {
      getAssessments(cookiesStudentExamAfterAssessment(), false, callback);
    });
    it('as student in Exam mode should contain E1', function (callback) {
      getAssessments(cookiesStudentExam(), true, callback);
    });
    it('should have the correct link for E1', function () {
      assert.nestedProperty(elemList[0], 'attribs.href');
      assessmentUrl = siteUrl + elemList[0].attribs.href;
      assert.equal(assessmentUrl, courseInstanceBaseUrl + '/assessment/' + assessment_id + '/');
    });
  });

  /**********************************************************************/

  const getAssessment = function (cookies, expectedStatusCode, callback) {
    request({ url: assessmentUrl, jar: cookies }, function (error, response, body) {
      if (error) {
        return callback(error);
      }
      if (response.statusCode !== expectedStatusCode) {
        return callback(new Error('bad status: ' + response.statusCode));
      }
      page = body;
      callback(null);
    });
  };

  describe('7. GET to assessment URL', function () {
    it('as student should return 403', function (callback) {
      getAssessment(cookiesStudent(), 403, callback);
    });
    it('as student in Exam mode before time period should return 403', function (callback) {
      getAssessment(cookiesStudentExamBeforeAssessment(), 403, callback);
    });
    it('as student in Exam mode after time period should return 403', function (callback) {
      getAssessment(cookiesStudentExamAfterAssessment(), 403, callback);
    });
    it('as student in Exam mode should load successfully', function (callback) {
      getAssessment(cookiesStudentExam(), 200, callback);
    });
    it('should parse', function () {
      $ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      elemList = $('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      __csrf_token = elemList[0].attribs.value;
      assert.isString(__csrf_token);
    });
  });

  /**********************************************************************/

  const postAssessment = function (cookies, includePassword, expectedStatusCode, callback) {
    const form: Record<string, any> = {
      __action: 'new_instance',
      __csrf_token,
    };
    if (includePassword) form.password = 'secret';
    request.post(
      {
        url: assessmentUrl,
        form,
        jar: cookies,
        followAllRedirects: true,
      },
      function (error, response, body) {
        if (error) {
          return callback(error);
        }
        if (response.statusCode !== expectedStatusCode) {
          return callback(new Error('bad status: ' + response.statusCode));
        }
        page = body;
        callback(null);
      },
    );
  };

  describe('8. POST to assessment URL', function () {
    it('as student should return 403', function (callback) {
      postAssessment(cookiesStudent(), true, 403, callback);
    });
    it('as student in Exam mode before time period should return 403', function (callback) {
      postAssessment(cookiesStudentExamBeforeAssessment(), true, 403, callback);
    });
    it('as student in Exam mode after time period should return 403', function (callback) {
      postAssessment(cookiesStudentExamAfterAssessment(), true, 403, callback);
    });
    /*
        it('as student in Exam mode without password should return 403', function(callback) {
            postAssessment(cookiesStudentExam(), false, 403, callback);
        });
*/
    it('as student in Exam mode should load successfully', function (callback) {
      postAssessment(cookiesStudentExam(), true, 200, callback);
    });
  });

  /**********************************************************************/

  const getAssessmentInstance = function (cookies, expectedStatusCode, callback) {
    request({ url: assessmentInstanceUrl, jar: cookies }, function (error, response, body) {
      if (error) {
        return callback(error);
      }
      if (response.statusCode !== expectedStatusCode) {
        return callback(new Error('bad status: ' + response.statusCode));
      }
      page = body;
      callback(null);
    });
  };

  describe('9. GET to assessment_instance URL', function () {
    it('as student should return 403', function (callback) {
      getAssessmentInstance(cookiesStudent(), 403, callback);
    });
    it('as student in Exam mode before time period should return 403', function (callback) {
      getAssessmentInstance(cookiesStudentExamBeforeAssessment(), 403, callback);
    });
    it('as student in Exam mode after time period should return 403', function (callback) {
      getAssessmentInstance(cookiesStudentExamAfterAssessment(), 403, callback);
    });
    it('as student in Exam mode should load successfully', function (callback) {
      getAssessmentInstance(cookiesStudentExam(), 200, callback);
    });
    it('should parse', function () {
      $ = cheerio.load(page);
    });
    it('should produce an addVectors instance_question in the DB', async () => {
      const result = await sqldb.queryAsync(sql.select_instance_question_addVectors, []);
      if (result.rowCount == null || result.rowCount === 0) {
        throw new Error('did not find addVectors instance question in DB');
      } else if (result.rowCount > 1) {
        throw new Error('multiple rows found: ' + JSON.stringify(result.rows, null, '    '));
      }
      instance_question = result.rows[0];
    });
    it('should link to addVectors question', function () {
      const urlTail = '/pl/course_instance/1/instance_question/' + instance_question.id + '/';
      q1Url = siteUrl + urlTail;
      elemList = $(`td a[href="${urlTail}"]`);
      assert.lengthOf(elemList, 1);
    });
  });

  /**********************************************************************/

  const getInstanceQuestion = function (cookies, expectedStatusCode, callback) {
    request({ url: q1Url, jar: cookies }, function (error, response, body) {
      if (error) {
        return callback(error);
      }
      if (response.statusCode !== expectedStatusCode) {
        return callback(new Error('bad status: ' + response.statusCode));
      }
      page = body;
      callback(null);
    });
  };

  describe('11. GET to instance_question URL', function () {
    it('as student should return 403', function (callback) {
      getInstanceQuestion(cookiesStudent(), 403, callback);
    });
    it('as student in Exam mode before time period should return 403', function (callback) {
      getInstanceQuestion(cookiesStudentExamBeforeAssessment(), 403, callback);
    });
    it('as student in Exam mode after time period should return 403', function (callback) {
      getInstanceQuestion(cookiesStudentExamAfterAssessment(), 403, callback);
    });
    it('as student in Exam mode should load successfully', function (callback) {
      getInstanceQuestion(cookiesStudentExam(), 200, callback);
    });
    it('should parse', function () {
      $ = cheerio.load(page);
    });
    it('should contain question-data', function () {
      elemList = $('.question-data');
      assert.lengthOf(elemList, 1);
    });
    it('question-data should contain base64 data', function () {
      assert.nestedProperty(elemList[0], 'children.0.data');
      assert.lengthOf(elemList[0].children, 1);
      assert.property(elemList[0].children[0], 'data');
    });
    it('base64 data should parse to JSON', function () {
      questionData = JSON.parse(
        decodeURIComponent(Buffer.from(elemList[0].children[0].data, 'base64').toString()),
      );
    });
    it('should have a variant_id in the questionData', function () {
      assert.nestedProperty(questionData, 'variant.id');
      variant = questionData.variant;
    });
    it('should have a CSRF token', function () {
      elemList = $('.question-form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      __csrf_token = elemList[0].attribs.value;
      assert.isString(__csrf_token);
    });
  });

  /**********************************************************************/

  const postInstanceQuestion = function (cookies, expectedStatusCode, callback) {
    const submittedAnswer = {
      wx: 0,
      wy: 0,
    };
    const form = {
      __action: 'save',
      __csrf_token,
      postData: JSON.stringify({ variant, submittedAnswer }),
    };
    request.post(
      { url: q1Url, form, jar: cookies, followAllRedirects: true },
      function (error, response) {
        if (error) {
          return callback(error);
        }
        if (response.statusCode !== expectedStatusCode) {
          return callback(new Error('bad status: ' + response.statusCode));
        }
        callback(null);
      },
    );
  };

  describe('12. POST to instance_question URL', function () {
    it('as student should return 403', function (callback) {
      postInstanceQuestion(cookiesStudent(), 403, callback);
    });
    it('as student in Exam mode before time period should return 403', function (callback) {
      postInstanceQuestion(cookiesStudentExamBeforeAssessment(), 403, callback);
    });
    it('as student in Exam mode after time period should return 403', function (callback) {
      postInstanceQuestion(cookiesStudentExamAfterAssessment(), 403, callback);
    });
    it('as student in Exam mode should load successfully', function (callback) {
      postInstanceQuestion(cookiesStudentExam(), 200, callback);
    });
  });
});
