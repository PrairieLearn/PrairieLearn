import { assert } from 'chai';
import * as cheerio from 'cheerio';
import fetchCookie from 'fetch-cookie';
import fetch from 'node-fetch';

import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config.js';
import { ensureEnrollment } from '../models/enrollment.js';

import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

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
    const cookies = new fetchCookie.toughCookie.CookieJar();
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

  async function getPl(cookies, shouldContainQA101) {
    const res = await fetchCookie(fetch, cookies)(siteUrl);
    assert.equal(res.status, 200);
    const page = await res.text();
    $ = cheerio.load(page);
    elemList = $('#content td a:contains("QA 101")');
    assert.lengthOf(elemList, shouldContainQA101 ? 1 : 0);
  }

  describe('1. GET /pl', function () {
    it('as student should not contain QA 101', async () => {
      await getPl(cookiesStudent(), false);
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
    it('as student should contain QA 101', async () => {
      await getPl(cookiesStudent(), true);
    });
    it('as student in Exam mode before course instance time period should not contain QA 101', async () => {
      await getPl(cookiesStudentExamBeforeCourseInstance(), false);
    });
    it('as student in Exam mode after course instance time period should not contain QA 101', async () => {
      await getPl(cookiesStudentExamAfterCourseInstance(), false);
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

  async function getAssessments(cookies, shouldContainE1) {
    const res = await fetchCookie(fetch, cookies)(assessmentsUrl);
    assert.equal(res.status, 200);
    const page = await res.text();
    $ = cheerio.load(page);
    elemList = $('td a:contains("Exam for automatic test suite")');
    assert.lengthOf(elemList, shouldContainE1 ? 1 : 0);
  }

  describe('6. GET /pl/assessments', function () {
    it('as student should not contain E1', async () => {
      await getAssessments(cookiesStudent(), false);
    });
    it('as student in Exam mode before time period should not contain E1', async () => {
      await getAssessments(cookiesStudentExamBeforeAssessment(), false);
    });
    it('as student in Exam mode after time period should not contain E1', async () => {
      await getAssessments(cookiesStudentExamAfterAssessment(), false);
    });
    it('as student in Exam mode should contain E1', async () => {
      await getAssessments(cookiesStudentExam(), true);
    });
    it('should have the correct link for E1', function () {
      assert.nestedProperty(elemList[0], 'attribs.href');
      assessmentUrl = siteUrl + elemList[0].attribs.href;
      assert.equal(assessmentUrl, courseInstanceBaseUrl + '/assessment/' + assessment_id + '/');
    });
  });

  /**********************************************************************/

  async function getAssessment(cookies, expectedStatusCode) {
    const res = await fetchCookie(fetch, cookies)(assessmentUrl);
    assert.equal(res.status, expectedStatusCode);
    page = await res.text();
  }

  describe('7. GET to assessment URL', function () {
    it('as student should return 403', async () => {
      await getAssessment(cookiesStudent(), 403);
    });
    it('as student in Exam mode before time period should return 403', async () => {
      await getAssessment(cookiesStudentExamBeforeAssessment(), 403);
    });
    it('as student in Exam mode after time period should return 403', async () => {
      await getAssessment(cookiesStudentExamAfterAssessment(), 403);
    });
    it('as student in Exam mode should load successfully', async () => {
      await getAssessment(cookiesStudentExam(), 200);
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

  async function postAssessment(cookies, includePassword, expectedStatusCode) {
    const form: Record<string, string> = {
      __action: 'new_instance',
      __csrf_token,
    };
    if (includePassword) form.password = 'secret';
    const res = await fetchCookie(fetch, cookies)(assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams(form),
    });
    assert.equal(res.status, expectedStatusCode);
    page = await res.text();
  }

  describe('8. POST to assessment URL', function () {
    it('as student should return 403', async () => {
      await postAssessment(cookiesStudent(), true, 403);
    });
    it('as student in Exam mode before time period should return 403', async () => {
      await postAssessment(cookiesStudentExamBeforeAssessment(), true, 403);
    });
    it('as student in Exam mode after time period should return 403', async () => {
      await postAssessment(cookiesStudentExamAfterAssessment(), true, 403);
    });
    it('as student in Exam mode should load successfully', async () => {
      await postAssessment(cookiesStudentExam(), true, 200);
    });
  });

  /**********************************************************************/

  async function getAssessmentInstance(cookies, expectedStatusCode) {
    const res = await fetchCookie(fetch, cookies)(assessmentInstanceUrl);
    assert.equal(res.status, expectedStatusCode);
    page = await res.text();
  }

  describe('9. GET to assessment_instance URL', function () {
    it('as student should return 403', async () => {
      await getAssessmentInstance(cookiesStudent(), 403);
    });
    it('as student in Exam mode before time period should return 403', async () => {
      await getAssessmentInstance(cookiesStudentExamBeforeAssessment(), 403);
    });
    it('as student in Exam mode after time period should return 403', async () => {
      await getAssessmentInstance(cookiesStudentExamAfterAssessment(), 403);
    });
    it('as student in Exam mode should load successfully', async () => {
      await getAssessmentInstance(cookiesStudentExam(), 200);
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

  async function getInstanceQuestion(cookies, expectedStatusCode) {
    const res = await fetchCookie(fetch, cookies)(q1Url);
    assert.equal(res.status, expectedStatusCode);
    page = await res.text();
  }

  describe('11. GET to instance_question URL', function () {
    it('as student should return 403', async () => {
      await getInstanceQuestion(cookiesStudent(), 403);
    });
    it('as student in Exam mode before time period should return 403', async () => {
      await getInstanceQuestion(cookiesStudentExamBeforeAssessment(), 403);
    });
    it('as student in Exam mode after time period should return 403', async () => {
      await getInstanceQuestion(cookiesStudentExamAfterAssessment(), 403);
    });
    it('as student in Exam mode should load successfully', async () => {
      await getInstanceQuestion(cookiesStudentExam(), 200);
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

  async function postInstanceQuestion(cookies, expectedStatusCode) {
    const submittedAnswer = {
      wx: 0,
      wy: 0,
    };
    const form = {
      __action: 'save',
      __csrf_token,
      postData: JSON.stringify({ variant, submittedAnswer }),
    };
    const res = await fetchCookie(fetch, cookies)(q1Url, {
      method: 'POST',
      body: new URLSearchParams(form),
    });
    assert.equal(res.status, expectedStatusCode);
  }

  describe('12. POST to instance_question URL', function () {
    it('as student should return 403', async () => {
      await postInstanceQuestion(cookiesStudent(), 403);
    });
    it('as student in Exam mode before time period should return 403', async () => {
      await postInstanceQuestion(cookiesStudentExamBeforeAssessment(), 403);
    });
    it('as student in Exam mode after time period should return 403', async () => {
      await postInstanceQuestion(cookiesStudentExamAfterAssessment(), 403);
    });
    it('as student in Exam mode should load successfully', async () => {
      await postInstanceQuestion(cookiesStudentExam(), 200);
    });
  });
});
