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

const waitForExternalGrader = async ($questionsPage, questionsPage) => {
  const variantId = $questionsPage('form > input[name="__variant_id"]').val();

  // The variant token (used for a sort of authentication) is inlined into
  // a `<script>` tag. This regex will read it out of the page's raw HTML.
  const variantToken = questionsPage.match(/variantToken\s*=\s*['"](.*?)['"];/)[1];

  const socket = io(`http://localhost:${config.serverPort}/external-grading`);

  return new Promise((resolve, reject) => {
    socket.on('connect_error', (err) => {
      reject(new Error(err));
    });

    const handleStatusChange = (msg) => {
      msg.submissions.forEach((s) => {
        if (s.grading_job_status === 'graded') {
          resolve();
          return;
        }
      });
    };

    socket.emit('init', { variant_id: variantId, variant_token: variantToken }, function (msg) {
      handleStatusChange(msg);
    });

    socket.on('change:status', function (msg) {
      handleStatusChange(msg);
    });
  }).finally(() => {
    // Whether or not we actually got a valid result, we should close the
    // socket to allow the test process to exit.
    socket.close();
  });
};

/**
 * @param {object} student or instructor user to load page by
 * @returns string Returns "Homework for Internal, External, Manual grading methods" page text
 */
const loadHomeworkPage = async (user) => {
  setUser(user);
  const studentCourseInstanceUrl = baseUrl + '/course_instance/1';
  let hm9InternalExternalManaulUrl = null;
  const courseInstanceBody = await (await fetch(studentCourseInstanceUrl)).text();
  const $courseInstancePage = cheerio.load(courseInstanceBody);
  hm9InternalExternalManaulUrl =
    siteUrl +
    $courseInstancePage(
      'a:contains("Homework for Internal, External, Manual grading methods")'
    ).attr('href');
  let res = await fetch(hm9InternalExternalManaulUrl);
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

describe('Grading method(s)', function () {
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

  describe('`gradingMethod` configuration (deprecated, backwards compatible)', () => {
    describe('"Internal"', () => {
      describe('"grade" action', () => {
        before(
          'load page as student and submit "grade" action to "Internal" type question',
          async () => {
            const hm1Body = await loadHomeworkPage(mockStudents[0]);
            $hm1Body = cheerio.load(hm1Body);
            iqUrl =
              siteUrl +
              $hm1Body('a:contains("HW9.1. Internal Grading: Adding two numbers")').attr('href');

            // open page to produce variant because we want to get the correct answer
            await fetch(iqUrl);
            // get variant params
            iqId = parseInstanceQuestionId(iqUrl);
            const variant = (await sqlDb.queryOneRowAsync(sql.get_variant_by_iq, { iqId })).rows[0];

            gradeRes = await saveOrGrade(
              iqUrl,
              { c: variant.params.a + variant.params.b },
              'grade'
            );
            assert.equal(gradeRes.status, 200);

            questionsPage = await gradeRes.text();
            $questionsPage = cheerio.load(questionsPage);
          }
        );
        it('should result in 1 grading jobs', async () => {
          const grading_jobs = (await sqlDb.queryAsync(sql.get_grading_jobs_by_iq, { iqId })).rows;
          assert.lengthOf(grading_jobs, 1);
        });
        it('should result in 1 "pastsubmission-block" component being rendered', () => {
          assert.lengthOf($questionsPage('.pastsubmission-block'), 1);
        });
        it('should display submission status', async () => {
          assert.equal(getLatestSubmissionStatus($questionsPage), 'correct: 100%');
        });
        it('should result in 1 "grading-block" component being rendered', () => {
          assert.lengthOf($questionsPage('.grading-block'), 1);
        });
      });
      describe('"save" action', () => {
        before(
          'load page as student and submit "save" action to "Internal" type question',
          async () => {
            const hm1Body = await loadHomeworkPage(mockStudents[1]);
            $hm1Body = cheerio.load(hm1Body);
            iqUrl =
              siteUrl +
              $hm1Body('a:contains("HW9.1. Internal Grading: Adding two numbers")').attr('href');

            // open page to produce variant because we want to get the correct answer
            await fetch(iqUrl);
            // get variant params
            iqId = parseInstanceQuestionId(iqUrl);
            const variant = (await sqlDb.queryOneRowAsync(sql.get_variant_by_iq, { iqId })).rows[0];

            gradeRes = await saveOrGrade(iqUrl, { c: variant.params.a + variant.params.b }, 'save');
            assert.equal(gradeRes.status, 200);

            questionsPage = await gradeRes.text();
            $questionsPage = cheerio.load(questionsPage);
          }
        );
        it('should NOT result in any grading jobs', async () => {
          const grading_jobs = (await sqlDb.queryAsync(sql.get_grading_jobs_by_iq, { iqId })).rows;
          assert.lengthOf(grading_jobs, 0);
        });
        it('should result in 1 "pastsubmission-block" component being rendered', () => {
          assert.lengthOf($questionsPage('.pastsubmission-block'), 1);
        });
        it('should display submission status', async () => {
          assert.equal(getLatestSubmissionStatus($questionsPage), 'saved, not graded');
        });
        it('should NOT result in "grading-block" component being rendered', () => {
          assert.lengthOf($questionsPage('.grading-block'), 0);
        });
      });
    });

    describe('"Manual"', () => {
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

    describe('"External"', () => {
      describe('"grade" action', () => {
        before(
          'load page as student and submit "grade" action to "External" type question',
          async () => {
            const hm1Body = await loadHomeworkPage(mockStudents[0]);
            $hm1Body = cheerio.load(hm1Body);
            iqUrl =
              siteUrl +
              $hm1Body(
                'a:contains("HW9.3. External Grading: Fibonacci function, file upload")'
              ).attr('href');
            gradeRes = await saveOrGrade(iqUrl, {}, 'grade', [
              { name: 'fib.py', contents: Buffer.from(fibonacciSolution).toString('base64') },
            ]);
            assert.equal(gradeRes.status, 200);
            questionsPage = await gradeRes.text();
            $questionsPage = cheerio.load(questionsPage);

            iqId = parseInstanceQuestionId(iqUrl);
            await waitForExternalGrader($questionsPage, questionsPage);
            // reload QuestionsPage since socket io cannot update without DOM
            questionsPage = await (await fetch(iqUrl)).text();
            $questionsPage = cheerio.load(questionsPage);
          }
        );

        it('should result in 1 grading jobs', async () => {
          const grading_jobs = (await sqlDb.queryAsync(sql.get_grading_jobs_by_iq, { iqId })).rows;
          assert.lengthOf(grading_jobs, 1);
        });
        it('should result in 1 "pastsubmission-block" component being rendered', () => {
          assert.lengthOf($questionsPage('.pastsubmission-block'), 1);
        });
        it('should display submission status', async () => {
          assert.equal(getLatestSubmissionStatus($questionsPage), 'correct: 100%');
        });
        it('should result in 1 "grading-block" component being rendered', () => {
          assert.lengthOf($questionsPage('.grading-block'), 0);
        });
      });
      describe('"save" action', () => {
        before(
          'load page as student and submit "grade" action to "External" type question',
          async () => {
            const hm1Body = await loadHomeworkPage(mockStudents[1]);
            $hm1Body = cheerio.load(hm1Body);
            iqUrl =
              siteUrl +
              $hm1Body(
                'a:contains("HW9.3. External Grading: Fibonacci function, file upload")'
              ).attr('href');

            gradeRes = await saveOrGrade(iqUrl, {}, 'save', [
              { name: 'fib.py', contents: Buffer.from(fibonacciSolution).toString('base64') },
            ]);
            assert.equal(gradeRes.status, 200);

            questionsPage = await gradeRes.text();
            $questionsPage = cheerio.load(questionsPage);

            iqId = parseInstanceQuestionId(iqUrl);
          }
        );
        it('should NOT result in any grading jobs', async () => {
          const grading_jobs = (await sqlDb.queryAsync(sql.get_grading_jobs_by_iq, { iqId })).rows;
          assert.lengthOf(grading_jobs, 0);
        });
        it('should result in 1 "pastsubmission-block" component being rendered', () => {
          assert.lengthOf($questionsPage('.pastsubmission-block'), 1);
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
});
