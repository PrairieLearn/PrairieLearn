import { assert } from 'chai';
import * as cheerio from 'cheerio';

import { config } from '../lib/config';
import fetch from 'node-fetch';
import * as helperServer from './helperServer';
import * as sqldb from '@prairielearn/postgres';
import { io } from 'socket.io-client';
import { setUser, parseInstanceQuestionId, saveOrGrade, User } from './helperClient';

const sql = sqldb.loadSqlEquiv(__filename);

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const defaultUser = {
  authUid: config.authUid,
  authName: config.authName,
  authUin: config.authUin,
};

const mockStudents = [
  { authUid: 'student1', authName: 'Student User 1', authUin: '00000001' },
  { authUid: 'student2', authName: 'Student User 2', authUin: '00000002' },
  { authUid: 'student3', authName: 'Student User 3', authUin: '00000003' },
  { authUid: 'student4', authName: 'Student User 4', authUin: '00000004' },
];

const waitForExternalGrader = async ($questionsPage) => {
  const { variantId, variantToken } = $questionsPage('.question-container').data();
  const socket = io(`http://localhost:${config.serverPort}/external-grading`);

  return new Promise((resolve, reject) => {
    socket.on('connect_error', (err) => reject(err));

    const handleStatusChange = (msg) => {
      msg.submissions.forEach((s) => {
        if (s.grading_job_status === 'graded') {
          resolve(undefined);
          return;
        }
      });
    };

    socket.emit(
      'init',
      { variant_id: variantId.toString(), variant_token: variantToken.toString() },
      function (msg) {
        if (!msg) return reject(new Error('Socket initialization failed'));
        handleStatusChange(msg);
      },
    );

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
 * @param user - user to load page by
 * @returns string Returns "Homework for Internal, External, Manual grading methods" page text
 */
const loadHomeworkPage = async (user: User) => {
  setUser(user);
  const studentCourseInstanceUrl = baseUrl + '/course_instance/1';
  const courseInstanceBody = await (await fetch(studentCourseInstanceUrl)).text();
  const $courseInstancePage = cheerio.load(courseInstanceBody);
  const hm9InternalExternalManualUrl =
    siteUrl +
    $courseInstancePage(
      'a:contains("Homework for Internal, External, Manual grading methods")',
    ).attr('href');
  const res = await fetch(hm9InternalExternalManualUrl);
  assert.equal(res.ok, true);
  return res.text();
};

/**
 * Gets the score text for the first submission panel on the page.
 */
function getLatestSubmissionStatus($: cheerio.CheerioAPI): string {
  return $('[data-testid="submission-status"] .badge').first().text();
}

describe('Grading method(s)', function () {
  this.timeout(80000);

  let $hm1Body;
  let iqUrl;
  let gradeRes;
  let iqId;
  let questionsPage;
  let $questionsPage;

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  after('reset default user', () => setUser(defaultUser));

  describe('`gradingMethod` configuration', () => {
    describe('"Internal"', () => {
      describe('"grade" action', () => {
        it('should load page as student', async () => {
          const hm1Body = await loadHomeworkPage(mockStudents[0]);
          $hm1Body = cheerio.load(hm1Body);
          iqUrl =
            siteUrl +
            $hm1Body('a:contains("HW9.1. Internal Grading: Adding two numbers")').attr('href');

          // open page to produce variant because we want to get the correct answer
          questionsPage = await (await fetch(iqUrl)).text();
          $questionsPage = cheerio.load(questionsPage);
          assert.lengthOf($questionsPage('button[value="grade"]'), 1);
          // get variant params
          iqId = parseInstanceQuestionId(iqUrl);
        });
        it('should submit "grade" action', async () => {
          const variant = (await sqldb.queryOneRowAsync(sql.get_variant_by_iq, { iqId })).rows[0];

          gradeRes = await saveOrGrade(iqUrl, { c: variant.params.a + variant.params.b }, 'grade');
          assert.equal(gradeRes.status, 200);

          questionsPage = await gradeRes.text();
          $questionsPage = cheerio.load(questionsPage);
        });
        it('should result in 1 grading jobs', async () => {
          const grading_jobs = (await sqldb.queryAsync(sql.get_grading_jobs_by_iq, { iqId })).rows;
          assert.lengthOf(grading_jobs, 1);
        });
        it('should result in 1 "submission-block" component being rendered', () => {
          assert.lengthOf($questionsPage('[data-testid="submission-block"]'), 1);
        });
        it('should display submission status', async () => {
          assert.equal(getLatestSubmissionStatus($questionsPage), '100%');
        });
        it('should result in 1 "grading-block" component being displayed', () => {
          assert.lengthOf($questionsPage('.grading-block:not(.d-none)'), 1);
        });
      });
      describe('"save" action', () => {
        it('should load page as student and submit "save" action', async () => {
          const hm1Body = await loadHomeworkPage(mockStudents[1]);
          $hm1Body = cheerio.load(hm1Body);
          iqUrl =
            siteUrl +
            $hm1Body('a:contains("HW9.1. Internal Grading: Adding two numbers")').attr('href');

          // open page to produce variant because we want to get the correct answer
          await fetch(iqUrl);
          // get variant params
          iqId = parseInstanceQuestionId(iqUrl);
          const variant = (await sqldb.queryOneRowAsync(sql.get_variant_by_iq, { iqId })).rows[0];

          gradeRes = await saveOrGrade(iqUrl, { c: variant.params.a + variant.params.b }, 'save');
          assert.equal(gradeRes.status, 200);

          questionsPage = await gradeRes.text();
          $questionsPage = cheerio.load(questionsPage);
        });
        it('should NOT result in any grading jobs', async () => {
          const grading_jobs = (await sqldb.queryAsync(sql.get_grading_jobs_by_iq, { iqId })).rows;
          assert.lengthOf(grading_jobs, 0);
        });
        it('should result in 1 "submission-block" component being rendered', () => {
          assert.lengthOf($questionsPage('[data-testid="submission-block"]'), 1);
        });
        it('should display submission status', async () => {
          assert.equal(getLatestSubmissionStatus($questionsPage), 'saved, not graded');
        });
        it('should NOT result in "grading-block" component being displayed', () => {
          assert.lengthOf($questionsPage('.grading-block:not(.d-none)'), 0);
        });
      });
    });

    describe('"Manual"', () => {
      describe('"grade" action', () => {
        it('should load page as student to "Manual" type question', async () => {
          const hm1Body = await loadHomeworkPage(mockStudents[0]);
          $hm1Body = cheerio.load(hm1Body);
          iqUrl =
            siteUrl +
            $hm1Body('a:contains("HW9.2. Manual Grading: Fibonacci function, file upload")').attr(
              'href',
            );
          questionsPage = await (await fetch(iqUrl)).text();
          $questionsPage = cheerio.load(questionsPage);
          assert.lengthOf($questionsPage('button[value="grade"]'), 0);
        });
        it('should be possible to submit a grade action to "Manual" type question', async () => {
          gradeRes = await saveOrGrade(iqUrl, {}, 'grade', [
            { name: 'fib.py', contents: Buffer.from('solution').toString('base64') },
          ]);
          assert.equal(gradeRes.status, 200);

          questionsPage = await gradeRes.text();
          $questionsPage = cheerio.load(questionsPage);
        });
        it('should NOT result in any grading jobs', async () => {
          const grading_jobs = (await sqldb.queryAsync(sql.get_grading_jobs_by_iq, { iqId })).rows;
          assert.lengthOf(grading_jobs, 0);
        });
        it('should display submission status', async () => {
          assert.equal(
            getLatestSubmissionStatus($questionsPage),
            'manual grading: waiting for grading',
          );
        });
        it('should NOT result in "grading-block" component being displayed', () => {
          assert.lengthOf($questionsPage('.grading-block:not(.d-none)'), 0);
        });
      });

      describe('"save" action', () => {
        it('should load page as student', async () => {
          const hm1Body = await loadHomeworkPage(mockStudents[0]);
          $hm1Body = cheerio.load(hm1Body);
          iqUrl =
            siteUrl +
            $hm1Body('a:contains("HW9.2. Manual Grading: Fibonacci function, file upload")').attr(
              'href',
            );
        });
        it('should be possible to submit a save action to "Manual" type question', async () => {
          gradeRes = await saveOrGrade(iqUrl, {}, 'save', [
            { name: 'fib.py', contents: Buffer.from('solution').toString('base64') },
          ]);
          assert.equal(gradeRes.status, 200);

          questionsPage = await gradeRes.text();
          $questionsPage = cheerio.load(questionsPage);
        });
        it('should NOT result in any grading jobs', async () => {
          const grading_jobs = (await sqldb.queryAsync(sql.get_grading_jobs_by_iq, { iqId })).rows;
          assert.lengthOf(grading_jobs, 0);
        });
        it('should display submission status', async () => {
          assert.equal(
            getLatestSubmissionStatus($questionsPage),
            'manual grading: waiting for grading',
          );
        });
        it('should NOT result in "grading-block" component being displayed', () => {
          assert.lengthOf($questionsPage('.grading-block:not(.d-none)'), 0);
        });
      });
    });

    describe('"External"', () => {
      describe('"grade" action', () => {
        it('should load page as student', async () => {
          const hm1Body = await loadHomeworkPage(mockStudents[0]);
          $hm1Body = cheerio.load(hm1Body);
          iqUrl =
            siteUrl +
            $hm1Body('a:contains("HW9.3. External Grading: Alpine Linux smoke test")').attr('href');
          questionsPage = await (await fetch(iqUrl)).text();
          $questionsPage = cheerio.load(questionsPage);
          assert.lengthOf($questionsPage('button[value="grade"]'), 1);
        });
        it('should submit "grade" action', async () => {
          gradeRes = await saveOrGrade(iqUrl, {}, 'grade', [
            { name: 'answer.txt', contents: Buffer.from('correct').toString('base64') },
          ]);
          assert.equal(gradeRes.status, 200);
          questionsPage = await gradeRes.text();
          $questionsPage = cheerio.load(questionsPage);

          iqId = parseInstanceQuestionId(iqUrl);
          await waitForExternalGrader($questionsPage);
          // reload QuestionsPage since socket io cannot update without DOM
          questionsPage = await (await fetch(iqUrl)).text();
          $questionsPage = cheerio.load(questionsPage);
        });

        it('should result in 1 grading jobs', async () => {
          const grading_jobs = (await sqldb.queryAsync(sql.get_grading_jobs_by_iq, { iqId })).rows;
          assert.lengthOf(grading_jobs, 1);
        });
        it('should result in 1 "submission-block" component being rendered', () => {
          assert.lengthOf($questionsPage('[data-testid="submission-block"]'), 1);
        });
        it('should display submission status', async () => {
          assert.equal(getLatestSubmissionStatus($questionsPage), '100%');
        });
        it('should result in 1 "grading-block" component being displayed', () => {
          assert.lengthOf($questionsPage('.grading-block:not(.d-none)'), 0);
        });
      });
      describe('"save" action', () => {
        it('should load page as student and submit "grade" action', async () => {
          const hm1Body = await loadHomeworkPage(mockStudents[1]);
          $hm1Body = cheerio.load(hm1Body);
          iqUrl =
            siteUrl +
            $hm1Body('a:contains("HW9.3. External Grading: Alpine Linux smoke test")').attr('href');

          gradeRes = await saveOrGrade(iqUrl, {}, 'save', [
            { name: 'answer.txt', contents: Buffer.from('correct').toString('base64') },
          ]);
          assert.equal(gradeRes.status, 200);

          questionsPage = await gradeRes.text();
          $questionsPage = cheerio.load(questionsPage);

          iqId = parseInstanceQuestionId(iqUrl);
        });
        it('should NOT result in any grading jobs', async () => {
          const grading_jobs = (await sqldb.queryAsync(sql.get_grading_jobs_by_iq, { iqId })).rows;
          assert.lengthOf(grading_jobs, 0);
        });
        it('should result in 1 "submission-block" component being rendered', () => {
          assert.lengthOf($questionsPage('[data-testid="submission-block"]'), 1);
        });
        it('should display submission status', async () => {
          assert.equal(getLatestSubmissionStatus($questionsPage), 'saved, not graded');
        });
        it('should NOT result in "grading-block" component being displayed', () => {
          assert.lengthOf($questionsPage('.grading-block:not(.d-none)'), 0);
        });
      });
    });

    describe('"Manual" with auto points only (treat as "Internal")', () => {
      describe('"grade" action', () => {
        it('should load page as student', async () => {
          const hm1Body = await loadHomeworkPage(mockStudents[0]);
          $hm1Body = cheerio.load(hm1Body);
          iqUrl =
            siteUrl +
            $hm1Body(
              'a:contains("HW9.5. Manual Grading: Adding two numbers (with auto points)")',
            ).attr('href');

          // open page to produce variant because we want to get the correct answer
          questionsPage = await (await fetch(iqUrl)).text();
          $questionsPage = cheerio.load(questionsPage);
          assert.lengthOf($questionsPage('button[value="grade"]'), 1);
          // get variant params
          iqId = parseInstanceQuestionId(iqUrl);
        });
        it('should submit "grade" action', async () => {
          const variant = (await sqldb.queryOneRowAsync(sql.get_variant_by_iq, { iqId })).rows[0];

          gradeRes = await saveOrGrade(iqUrl, { c: variant.params.a + variant.params.b }, 'grade');
          assert.equal(gradeRes.status, 200);

          questionsPage = await gradeRes.text();
          $questionsPage = cheerio.load(questionsPage);
        });
        it('should result in 1 grading jobs', async () => {
          const grading_jobs = (await sqldb.queryAsync(sql.get_grading_jobs_by_iq, { iqId })).rows;
          assert.lengthOf(grading_jobs, 1);
        });
        it('should result in 1 "submission-block" component being rendered', () => {
          assert.lengthOf($questionsPage('[data-testid="submission-block"]'), 1);
        });
        it('should display submission status', async () => {
          assert.equal(getLatestSubmissionStatus($questionsPage), '100%');
        });
        it('should result in 1 "grading-block" component being displayed', () => {
          assert.lengthOf($questionsPage('.grading-block:not(.d-none)'), 1);
        });
      });
      describe('"save" action', () => {
        it('should load page as student and submit "save" action', async () => {
          const hm1Body = await loadHomeworkPage(mockStudents[1]);
          $hm1Body = cheerio.load(hm1Body);
          iqUrl =
            siteUrl +
            $hm1Body(
              'a:contains("HW9.5. Manual Grading: Adding two numbers (with auto points)")',
            ).attr('href');

          // open page to produce variant because we want to get the correct answer
          await fetch(iqUrl);
          // get variant params
          iqId = parseInstanceQuestionId(iqUrl);
          const variant = (await sqldb.queryOneRowAsync(sql.get_variant_by_iq, { iqId })).rows[0];

          gradeRes = await saveOrGrade(iqUrl, { c: variant.params.a + variant.params.b }, 'save');
          assert.equal(gradeRes.status, 200);

          questionsPage = await gradeRes.text();
          $questionsPage = cheerio.load(questionsPage);
        });
        it('should NOT result in any grading jobs', async () => {
          const grading_jobs = (await sqldb.queryAsync(sql.get_grading_jobs_by_iq, { iqId })).rows;
          assert.lengthOf(grading_jobs, 0);
        });
        it('should result in 1 "submission-block" component being rendered', () => {
          assert.lengthOf($questionsPage('[data-testid="submission-block"]'), 1);
        });
        it('should display submission status', async () => {
          assert.equal(getLatestSubmissionStatus($questionsPage), 'saved, not graded');
        });
        it('should NOT result in "grading-block" component being displayed', () => {
          assert.lengthOf($questionsPage('.grading-block:not(.d-none)'), 0);
        });
      });
    });

    describe('"Internal" with manual points only (treat as "Manual")', () => {
      describe('"grade" action', () => {
        it('should load page as student', async () => {
          const hm1Body = await loadHomeworkPage(mockStudents[0]);
          $hm1Body = cheerio.load(hm1Body);
          iqUrl =
            siteUrl +
            $hm1Body(
              'a:contains("HW9.4. Internal Grading: Adding two numbers (with manual points)")',
            ).attr('href');

          // open page to produce variant because we want to get the correct answer
          questionsPage = await (await fetch(iqUrl)).text();
          $questionsPage = cheerio.load(questionsPage);
          assert.lengthOf($questionsPage('button[value="grade"]'), 0);

          // get variant params
          iqId = parseInstanceQuestionId(iqUrl);
        });
        it('should be possible to submit a grade action to "Manual" type question', async () => {
          const variant = (await sqldb.queryOneRowAsync(sql.get_variant_by_iq, { iqId })).rows[0];
          gradeRes = await saveOrGrade(iqUrl, { c: variant.params.a + variant.params.b }, 'grade');
          assert.equal(gradeRes.status, 200);

          questionsPage = await gradeRes.text();
          $questionsPage = cheerio.load(questionsPage);
        });
        it('should NOT result in any grading jobs', async () => {
          const grading_jobs = (await sqldb.queryAsync(sql.get_grading_jobs_by_iq, { iqId })).rows;
          assert.lengthOf(grading_jobs, 0);
        });
        it('should display submission status', async () => {
          assert.equal(
            getLatestSubmissionStatus($questionsPage),
            'manual grading: waiting for grading',
          );
        });
        it('should NOT result in "grading-block" component being displayed', () => {
          assert.lengthOf($questionsPage('.grading-block:not(.d-none)'), 0);
        });
      });

      describe('"save" action', () => {
        it('should load page as student to "Manual" type question', async () => {
          const hm1Body = await loadHomeworkPage(mockStudents[0]);
          $hm1Body = cheerio.load(hm1Body);
          iqUrl =
            siteUrl +
            $hm1Body(
              'a:contains("HW9.4. Internal Grading: Adding two numbers (with manual points)")',
            ).attr('href');

          // open page to produce variant because we want to get the correct answer
          await fetch(iqUrl);
          // get variant params
          iqId = parseInstanceQuestionId(iqUrl);
        });
        it('should be possible to submit a save action', async () => {
          const variant = (await sqldb.queryOneRowAsync(sql.get_variant_by_iq, { iqId })).rows[0];
          gradeRes = await saveOrGrade(iqUrl, { c: variant.params.a + variant.params.b }, 'save');
          assert.equal(gradeRes.status, 200);

          questionsPage = await gradeRes.text();
          $questionsPage = cheerio.load(questionsPage);
        });
        it('should NOT result in any grading jobs', async () => {
          const grading_jobs = (await sqldb.queryAsync(sql.get_grading_jobs_by_iq, { iqId })).rows;
          assert.lengthOf(grading_jobs, 0);
        });
        it('should display submission status', async () => {
          assert.equal(
            getLatestSubmissionStatus($questionsPage),
            'manual grading: waiting for grading',
          );
        });
        it('should NOT result in "grading-block" component being displayed', () => {
          assert.lengthOf($questionsPage('.grading-block:not(.d-none)'), 0);
        });
      });
    });

    describe('Zero total points (treat as "Internal")', () => {
      describe('"grade" action', () => {
        it('should load page as student', async () => {
          const hm1Body = await loadHomeworkPage(mockStudents[0]);
          $hm1Body = cheerio.load(hm1Body);
          iqUrl = siteUrl + $hm1Body('a:contains("HW9.6. Add two numbers")').attr('href');

          // open page to produce variant because we want to get the correct answer
          questionsPage = await (await fetch(iqUrl)).text();
          $questionsPage = cheerio.load(questionsPage);
          assert.lengthOf($questionsPage('button[value="grade"]'), 1);
          // get variant params
          iqId = parseInstanceQuestionId(iqUrl);
        });
        it('should submit "grade" action', async () => {
          const variant = (await sqldb.queryOneRowAsync(sql.get_variant_by_iq, { iqId })).rows[0];

          gradeRes = await saveOrGrade(iqUrl, { c: variant.params.a + variant.params.b }, 'grade');
          assert.equal(gradeRes.status, 200);

          questionsPage = await gradeRes.text();
          $questionsPage = cheerio.load(questionsPage);
        });
        it('should result in 1 grading jobs', async () => {
          const grading_jobs = (await sqldb.queryAsync(sql.get_grading_jobs_by_iq, { iqId })).rows;
          assert.lengthOf(grading_jobs, 1);
        });
        it('should result in 1 "submission-block" component being rendered', () => {
          assert.lengthOf($questionsPage('[data-testid="submission-block"]'), 1);
        });
        it('should display submission status', async () => {
          assert.equal(getLatestSubmissionStatus($questionsPage), '100%');
        });
        it('should result in 1 "grading-block" component being displayed', () => {
          assert.lengthOf($questionsPage('.grading-block:not(.d-none)'), 1);
        });
      });
      describe('"save" action', () => {
        it('should load page as student and submit "save" action', async () => {
          const hm1Body = await loadHomeworkPage(mockStudents[1]);
          $hm1Body = cheerio.load(hm1Body);
          iqUrl = siteUrl + $hm1Body('a:contains("HW9.6. Add two numbers")').attr('href');

          // open page to produce variant because we want to get the correct answer
          await fetch(iqUrl);
          // get variant params
          iqId = parseInstanceQuestionId(iqUrl);
          const variant = (await sqldb.queryOneRowAsync(sql.get_variant_by_iq, { iqId })).rows[0];

          gradeRes = await saveOrGrade(iqUrl, { c: variant.params.a + variant.params.b }, 'save');
          assert.equal(gradeRes.status, 200);

          questionsPage = await gradeRes.text();
          $questionsPage = cheerio.load(questionsPage);
        });
        it('should NOT result in any grading jobs', async () => {
          const grading_jobs = (await sqldb.queryAsync(sql.get_grading_jobs_by_iq, { iqId })).rows;
          assert.lengthOf(grading_jobs, 0);
        });
        it('should result in 1 "submission-block" component being rendered', () => {
          assert.lengthOf($questionsPage('[data-testid="submission-block"]'), 1);
        });
        it('should display submission status', async () => {
          assert.equal(getLatestSubmissionStatus($questionsPage), 'saved, not graded');
        });
        it('should NOT result in "grading-block" component being displayed', () => {
          assert.lengthOf($questionsPage('.grading-block:not(.d-none)'), 0);
        });
      });
    });
  });
});
