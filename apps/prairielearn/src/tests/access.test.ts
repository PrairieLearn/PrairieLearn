import * as cheerio from 'cheerio';
import fetchCookie, { type CookieJar } from 'fetch-cookie';
import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import * as sqldb from '@prairielearn/postgres';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { config } from '../lib/config.js';
import { InstanceQuestionSchema, UserSchema } from '../lib/db-types.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { ensureUncheckedEnrollment } from '../models/enrollment.js';

import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const courseInstanceBaseUrl = baseUrl + '/course_instance/1';
const assessmentsUrl = courseInstanceBaseUrl + '/assessments';
const assessmentInstanceUrl = courseInstanceBaseUrl + '/assessment_instance/1';

describe('Access control', { timeout: 20000 }, function () {
  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  /*
      There are three nested time periods:
      reservation < assessment < course instance

      Times are:

      1890 before course instance
      1900 start course instance
      1910 before assessment
      1920 start assessment
      1930 before reservation
      1940 start reservation

      2200 end reservation
      2250 after reservation
      2300 end assessment
      2350 after assessment
      2400 end course instance
      2450 after course_instance
     */

  function cookiesStudent() {
    const cookies = new fetchCookie.toughCookie.CookieJar();
    cookies.setCookieSync('pl_test_user=test_student', siteUrl);
    cookies.setCookieSync('pl_test_date=2100-06-13T13:12:00Z', siteUrl);
    return cookies;
  }

  function cookiesStudentExam() {
    const cookies = cookiesStudent();
    cookies.setCookieSync('pl_test_mode=Exam', siteUrl);
    cookies.setCookieSync('pl_test_date=2100-06-13T13:12:00Z', siteUrl);
    return cookies;
  }

  function cookiesStudentExamBeforeCourseInstance() {
    const cookies = cookiesStudentExam();
    cookies.setCookieSync('pl_test_date=1750-06-13T13:12:00Z', siteUrl);
    return cookies;
  }

  function cookiesStudentExamBeforeAssessment() {
    const cookies = cookiesStudentExam();
    cookies.setCookieSync('pl_test_date=1910-06-13T13:12:00Z', siteUrl);
    return cookies;
  }

  function cookiesStudentExamAfterAssessment() {
    const cookies = cookiesStudentExam();
    cookies.setCookieSync('pl_test_date=2350-06-13T13:12:00Z', siteUrl);
    return cookies;
  }

  function cookiesStudentExamAfterCourseInstance() {
    const cookies = cookiesStudentExam();
    cookies.setCookieSync('pl_test_date=2450-06-13T13:12:00Z', siteUrl);
    return cookies;
  }

  let user, page, $, elemList;
  let assessment_id;
  let __csrf_token;
  let assessmentUrl, q1Url, questionData, variant, instance_question;

  /**********************************************************************/

  async function getPl(cookies: CookieJar, shouldContainQA101: boolean) {
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
      user = await sqldb.queryRow(sql.select_student_user, UserSchema);
    });
  });

  describe('3. Enroll student user into testCourse', function () {
    it('should succeed', async () => {
      const courseInstance = await selectCourseInstanceById('1');
      await ensureUncheckedEnrollment({
        userId: user.user_id,
        courseInstance,
        requestedRole: 'System',
        authzData: dangerousFullSystemAuthz(),
        actionDetail: 'implicit_joined',
      });
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
      const assessment = await selectAssessmentByTid({
        course_instance_id: '1',
        tid: 'exam1-automaticTestSuite',
      });
      assessment_id = assessment.id;
    });
  });

  /**********************************************************************/

  async function getAssessments(cookies: CookieJar, shouldContainE1: boolean) {
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

  async function getAssessment(cookies: CookieJar, expectedStatusCode: number) {
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

  async function postAssessment(
    cookies: CookieJar,
    includePassword: boolean,
    expectedStatusCode: number,
  ) {
    const body = new URLSearchParams({
      __action: 'new_instance',
      __csrf_token,
    });

    if (includePassword) {
      body.append('password', 'secret');
    }

    const res = await fetchCookie(fetch, cookies)(assessmentUrl, { method: 'POST', body });
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

  async function getAssessmentInstance(cookies: CookieJar, expectedStatusCode: number) {
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
      const rows = await sqldb.queryRows(
        sql.select_instance_question_addVectors,
        InstanceQuestionSchema,
      );
      if (rows.length === 0) {
        throw new Error('did not find addVectors instance question in DB');
      } else if (rows.length > 1) {
        throw new Error('multiple rows found: ' + JSON.stringify(rows, null, '    '));
      }
      instance_question = rows[0];
    });
    it('should link to addVectors question', function () {
      const urlTail = '/pl/course_instance/1/instance_question/' + instance_question.id + '/';
      q1Url = siteUrl + urlTail;
      elemList = $(`td a[href="${urlTail}"]`);
      assert.lengthOf(elemList, 1);
    });
  });

  /**********************************************************************/

  async function getInstanceQuestion(cookies: CookieJar, expectedStatusCode: number) {
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

  async function postInstanceQuestion(cookies: CookieJar, expectedStatusCode: number) {
    const submittedAnswer = {
      wx: 0,
      wy: 0,
    };
    const res = await fetchCookie(fetch, cookies)(q1Url, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'save',
        __csrf_token,
        postData: JSON.stringify({ variant, submittedAnswer }),
      }),
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
