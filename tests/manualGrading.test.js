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
const io = require('socket.io-client');
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
    siteUrl +
    $courseInstancePage(
      'a:contains("Homework for Internal, External, Manual grading methods")'
    ).attr('href');
  let res = await fetch(hm9InternalExternalManualUrl);
  assert.equal(res.ok, true);
  return res.text();
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

  let $hm1Body = null;
  let iqUrl = null;
  let gradeRes = null;
  let iqId = null;
  let questionsPage = null;
  let $questionsPage = null;

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  after('reset default user', () => setUser(defaultUser));

  describe('`gradingMethod` "Manual"', () => {
    describe('"grade" action', () => {
      before(
        'load page as student and submit "grade" action to "Manual" type question',
        async () => {
          const hm1Body = await loadHomeworkPage(mockStudents[0]);
          $hm1Body = cheerio.load(hm1Body);
          iqUrl =
            siteUrl +
            $hm1Body('a:contains("HW9.2. Manual Grading: Fibonacci function, file upload")').attr(
              'href'
            );
        }
      );
      it('should NOT result in any grading jobs', async () => {
        const grading_jobs = (await sqlDb.queryAsync(sql.get_grading_jobs_by_iq, { iqId })).rows;
        assert.lengthOf(grading_jobs, 0);
      });
      it('should display submission status', async () => {
        assert.equal(getLatestSubmissionStatus($questionsPage), 'saved, not graded');
      });
      it('should NOT result in "grading-block" component being rendered', () => {
        assert.lengthOf($questionsPage('.grading-block'), 0);
      });
    });
    describe('"save" action', () => {
      before(
        'load page as student and submit "grade" action to "Manual" type question',
        async () => {
          const hm1Body = await loadHomeworkPage(mockStudents[0]);
          $hm1Body = cheerio.load(hm1Body);
          iqUrl =
            siteUrl +
            $hm1Body('a:contains("HW9.2. Manual Grading: Fibonacci function, file upload")').attr(
              'href'
            );
        }
      );
      it('should be possible to submit a save action to "Manual" type question', async () => {
        gradeRes = await saveOrGrade(iqUrl, {}, 'save', [
          { name: 'fib.py', contents: Buffer.from(fibonacciSolution).toString('base64') },
        ]);
        assert.equal(gradeRes.status, 200);
      });
      it('should NOT result in any grading jobs', async () => {
        const grading_jobs = (await sqlDb.queryAsync(sql.get_grading_jobs_by_iq, { iqId })).rows;
        assert.lengthOf(grading_jobs, 0);
      });
      it('should display submission status', async () => {
        assert.equal(getLatestSubmissionStatus($questionsPage), 'saved, not graded');
      });
      it('should NOT result in "grading-block" component being rendered', () => {
        assert.lengthOf($questionsPage('.grading-block'), 0);
      });
    });
  });
});
