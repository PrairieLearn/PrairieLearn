const { assert } = require('chai');
const cheerio = require('cheerio');
const fs = require('fs-extra');
const path = require('path');

const config = require('../lib/config');
const fetch = require('node-fetch');
const helperServer = require('./helperServer');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sqlDb = require('../prairielib/lib/sql-db');
const sql = sqlLoader.loadSqlEquiv(__filename);
const { setUser, parseInstanceQuestionId, saveOrGrade } = require('./helperClient');

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const defaultUser = {
  authUid: config.authUid,
  authName: config.authName,
  authUin: config.authUin,
};

const fibonacciSolution = fs.readFileSync(
  path.resolve(
    __dirname,
    '..',
    'testCourse',
    'questions',
    'externalGrade',
    'codeUpload',
    'tests',
    'ans.py'
  )
);

const mockStudents = [
  { authUid: 'student1', authName: 'Student User 1', authUin: '00000001' },
  { authUid: 'student2', authName: 'Student User 2', authUin: '00000002' },
  { authUid: 'student3', authName: 'Student User 3', authUin: '00000003' },
  { authUid: 'student4', authName: 'Student User 4', authUin: '00000004' },
];

const assessmentTitle = 'Homework for Internal, External, Manual grading methods';
const manualGradingQuestionTitle = 'Manual Grading: Fibonacci function, file upload';

/**
 * @param {object} student or instructor user to load page by
 * @returns string Returns "Homework for Internal, External, Manual grading methods" page text
 */
const loadHomeworkPage = async (user) => {
  setUser(user);
  const studentCourseInstanceUrl = baseUrl + '/course_instance/1';
  const courseInstanceBody = await (await fetch(studentCourseInstanceUrl)).text();
  const $courseInstancePage = cheerio.load(courseInstanceBody);
  const hm9InternalExternalManualUrl =
    siteUrl + $courseInstancePage(`a:contains("${assessmentTitle}")`).attr('href');
  let res = await fetch(hm9InternalExternalManualUrl);
  assert.equal(res.ok, true);
  return res.text();
};

const loadHomeworkQuestionUrl = async (user) => {
  const hm1Body = await loadHomeworkPage(user);
  const $hm1Body = cheerio.load(hm1Body);
  return siteUrl + $hm1Body(`a:contains("${manualGradingQuestionTitle}")`).attr('href');
};

/**
 * Gets the score text for the first submission panel on the page.
 *
 * @param {import('cheerio')} $
 * @returns {string}
 */
function getLatestSubmissionStatus($) {
  return $('.card[id^="submission"] .card-header .badge').first().text();
}

describe('Manual Grading', function () {
  this.timeout(80000);

  let iqUrl, iqId;
  let instancesAssessmentUrl;
  let manualGradingAssessmentUrl;
  let manualGradingAssessmentQuestionUrl;
  let manualGradingIQUrl;
  let $manualGradingPage;

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  before('build assessment manual grading page URL', async () => {
    const assessments = (await sqlDb.queryAsync(sql.get_assessment, {})).rows;
    assert.lengthOf(assessments, 1);
    manualGradingAssessmentUrl = `${baseUrl}/course_instance/1/instructor/assessment/${assessments[0].id}/manual_grading`;
    instancesAssessmentUrl = `${baseUrl}/course_instance/1/instructor/assessment/${assessments[0].id}/instances`;
  });

  after('reset default user', () => setUser(defaultUser));

  describe('Submit and grade a manually graded question', () => {
    it('load page as student', async () => {
      iqUrl = await loadHomeworkQuestionUrl(mockStudents[0]);
      iqId = parseInstanceQuestionId(iqUrl);

      const instance_questions = (await sqlDb.queryAsync(sql.get_instance_question, { iqId })).rows;
      assert.lengthOf(instance_questions, 1);
      assert.equal(instance_questions[0].requires_manual_grading, false);
    });
    it('submit an answer to the question', async () => {
      const gradeRes = await saveOrGrade(iqUrl, {}, 'save', [
        { name: 'fib.py', contents: Buffer.from(fibonacciSolution).toString('base64') },
      ]);
      const questionsPage = await gradeRes.text();
      const $questionsPage = cheerio.load(questionsPage);

      assert.equal(gradeRes.status, 200);
      assert.equal(getLatestSubmissionStatus($questionsPage), 'saved, not graded');
    });
    it('should tag question as requiring grading', async () => {
      const instanceQuestions = (await sqlDb.queryAsync(sql.get_instance_question, { iqId })).rows;
      assert.lengthOf(instanceQuestions, 1);
      assert.equal(instanceQuestions[0].requires_manual_grading, true);
    });
    it('manual grading page should warn about an open instance', async () => {
      setUser(defaultUser);
      const manualGradingPage = await (await fetch(manualGradingAssessmentUrl)).text();
      $manualGradingPage = cheerio.load(manualGradingPage);
      const row = $manualGradingPage('div.alert:contains("has one open instance")');
      assert.equal(row.length, 1);
    });
    it('manual grading page should list one question requiring grading', async () => {
      const row = $manualGradingPage(`tr:contains("${manualGradingQuestionTitle}")`);
      assert.equal(row.length, 1);
      const count = row.find('td:nth-child(4)').text().replace(/\s/g, '');
      assert.equal(count, '1/1');
      manualGradingAssessmentQuestionUrl =
        siteUrl + row.find(`a:contains("${manualGradingQuestionTitle}")`).attr('href');
    });
    it('manual grading page for assessment question should warn about an open instance', async () => {
      setUser(defaultUser);
      const manualGradingAQPage = await (await fetch(manualGradingAssessmentQuestionUrl)).text();
      const $manualGradingAQPage = cheerio.load(manualGradingAQPage);
      const row = $manualGradingAQPage('div.alert:contains("has one open instance")');
      assert.equal(row.length, 1);
    });
    it('manual grading page for assessment question should list one instance', async () => {
      setUser(defaultUser);
      const manualGradingAQData = await (
        await fetch(manualGradingAssessmentQuestionUrl + '/instances.json')
      ).text();
      const instanceList = JSON.parse(manualGradingAQData)?.instance_questions;
      assert(instanceList);
      assert.lengthOf(instanceList, 1);
      assert.equal(instanceList[0].id, iqId);
      assert.equal(instanceList[0].requires_manual_grading, true);
      manualGradingIQUrl = `${manualGradingAssessmentUrl}/instance_question/${iqId}`;
    });
    it('manual grading page for instance question should warn about an open instance', async () => {
      setUser(defaultUser);
      const manualGradingIQPage = await (await fetch(manualGradingIQUrl)).text();
      const $manualGradingIQPage = cheerio.load(manualGradingIQPage);
      const row = $manualGradingIQPage('div.alert:contains("is still open")');
      assert.equal(row.length, 1);
    });
    it('close assessment', async () => {
      setUser(defaultUser);
      const instancesBody = await (await fetch(instancesAssessmentUrl)).text();
      const $instancesBody = cheerio.load(instancesBody);
      const token = $instancesBody('form[name=grade-all-form]')
        .find('input[name=__csrf_token]')
        .val();
      await fetch(instancesAssessmentUrl, {
        method: 'POST',
        headers: { 'Content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          __action: 'close_all',
          __csrf_token: token,
        }).toString(),
      });
    });
    it('manual grading page should NOT warn about an open instance', async () => {
      setUser(defaultUser);
      const manualGradingPage = await (await fetch(manualGradingAssessmentUrl)).text();
      $manualGradingPage = cheerio.load(manualGradingPage);
      const row = $manualGradingPage('div.alert:contains("has one open instance")');
      assert.equal(row.length, 0);
    });
    it('manual grading page for assessment question should NOT warn about an open instance', async () => {
      setUser(defaultUser);
      const manualGradingAQPage = await (await fetch(manualGradingAssessmentQuestionUrl)).text();
      const $manualGradingAQPage = cheerio.load(manualGradingAQPage);
      const row = $manualGradingAQPage('div.alert:contains("has one open instance")');
      assert.equal(row.length, 0);
    });
    it('manual grading page for instance question should NOT warn about an open instance', async () => {
      setUser(defaultUser);
      const manualGradingIQPage = await (await fetch(manualGradingIQUrl)).text();
      const $manualGradingIQPage = cheerio.load(manualGradingIQPage);
      const row = $manualGradingIQPage('div.alert:contains("is still open")');
      assert.equal(row.length, 0);
    });
  });
});
