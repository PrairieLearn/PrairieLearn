import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { io } from 'socket.io-client';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config.js';
import { VariantSchema } from '../lib/db-types.js';

import { type User, parseInstanceQuestionId, saveOrGrade, setUser } from './helperClient.js';
import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

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

async function waitForExternalGrader($questionsPage): Promise<void> {
  const { variantId, variantToken } = $questionsPage('.question-container').data();
  const socket = io(`http://localhost:${config.serverPort}/external-grading`);

  return new Promise<void>((resolve, reject) => {
    socket.on('connect_error', (err) => reject(err));

    function handleStatusChange(msg: any) {
      for (const submission of msg.submissions) {
        if (submission.grading_job_status === 'graded') {
          resolve();
          return;
        }
      }
    }

    socket.emit(
      'init',
      { variant_id: variantId.toString(), variant_token: variantToken.toString() },
      (msg: any) => {
        if (!msg) return reject(new Error('Socket initialization failed'));
        handleStatusChange(msg);
      },
    );

    socket.on('change:status', (msg) => handleStatusChange(msg));
  }).finally(() => {
    // Whether or not we actually got a valid result, we should close the
    // socket to allow the test process to exit.
    socket.close();
  });
}

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
  return $('[data-testid="submission-status"] .badge').first().text().trim();
}

describe('Grading method(s)', { timeout: 80_000 }, function () {
  let $hm1Body;
  let iqUrl;
  let gradeRes;
  let iqId;
  let questionsPage;
  let $questionsPage;

  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  afterAll(() => setUser(defaultUser));

  describe('`gradingMethod` configuration', () => {
    describe('"Internal"', () => {
      describe('"grade" action', () => {
        it('should load page as student', async () => {
          const hm1Body = await loadHomeworkPage(mockStudents[0]);
          $hm1Body = cheerio.load(hm1Body);
          iqUrl =
            siteUrl + $hm1Body('a:contains("Internal Grading: Adding two numbers")').attr('href');

          // open page to produce variant because we want to get the correct answer
          questionsPage = await (await fetch(iqUrl)).text();
          $questionsPage = cheerio.load(questionsPage);
          assert.lengthOf($questionsPage('button[value="grade"]'), 1);
          // get variant params
          iqId = parseInstanceQuestionId(iqUrl);
        });
        it('should submit "grade" action', async () => {
          const variant = await sqldb.queryRow(sql.get_variant_by_iq, { iqId }, VariantSchema);
          assert.ok(variant.params);

          gradeRes = await saveOrGrade(iqUrl, { c: variant.params.a + variant.params.b }, 'grade');
          assert.equal(gradeRes.status, 200);

          questionsPage = await gradeRes.text();
          $questionsPage = cheerio.load(questionsPage);
        });
        it('should result in 1 grading jobs', async () => {
          const rowCount = await sqldb.execute(sql.get_grading_jobs_by_iq, { iqId });
          assert.equal(rowCount, 1);
        });
        it('should result in 1 "submission-block" component being rendered', () => {
          assert.lengthOf($questionsPage('[data-testid="submission-block"]'), 1);
        });
        it('should display submission status', () => {
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
            siteUrl + $hm1Body('a:contains("Internal Grading: Adding two numbers")').attr('href');

          // open page to produce variant because we want to get the correct answer
          await fetch(iqUrl);
          // get variant params
          iqId = parseInstanceQuestionId(iqUrl);
          const variant = await sqldb.queryRow(sql.get_variant_by_iq, { iqId }, VariantSchema);
          assert.ok(variant.params);

          gradeRes = await saveOrGrade(iqUrl, { c: variant.params.a + variant.params.b }, 'save');
          assert.equal(gradeRes.status, 200);

          questionsPage = await gradeRes.text();
          $questionsPage = cheerio.load(questionsPage);
        });
        it('should NOT result in any grading jobs', async () => {
          const gradingJobsRowCount = await sqldb.execute(sql.get_grading_jobs_by_iq, { iqId });
          assert.equal(gradingJobsRowCount, 0);
        });
        it('should result in 1 "submission-block" component being rendered', () => {
          assert.lengthOf($questionsPage('[data-testid="submission-block"]'), 1);
        });
        it('should display submission status', () => {
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
            $hm1Body('a:contains("Manual Grading: Fibonacci function, file upload")').attr('href');
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
          const gradingJobsRowCount = await sqldb.execute(sql.get_grading_jobs_by_iq, { iqId });
          assert.equal(gradingJobsRowCount, 0);
        });
        it('should display submission status', () => {
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
            $hm1Body('a:contains("Manual Grading: Fibonacci function, file upload")').attr('href');
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
          const gradingJobsRowCount = await sqldb.execute(sql.get_grading_jobs_by_iq, { iqId });
          assert.equal(gradingJobsRowCount, 0);
        });
        it('should display submission status', () => {
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
            $hm1Body('a:contains("External Grading: Alpine Linux smoke test")').attr('href');
          questionsPage = await (await fetch(iqUrl)).text();
          $questionsPage = cheerio.load(questionsPage);
          assert.lengthOf($questionsPage('button[value="grade"]'), 1);
        });
        it('should submit "grade" action', async () => {
          gradeRes = await saveOrGrade(iqUrl, {}, 'grade', [
            { name: 'answer.txt', contents: Buffer.from('correct').toString('base64') },
          ]);
          assert.equal(gradeRes.status, 200);
        });
        it('should wait for results and render the updated panels', async () => {
          questionsPage = await gradeRes.text();
          $questionsPage = cheerio.load(questionsPage);

          iqId = parseInstanceQuestionId(iqUrl);
          await waitForExternalGrader($questionsPage);

          // Now that the grading job is done, we can check the results.
          const submissionBody = $questionsPage('.js-submission-body').first();
          const dynamicRenderUrl = new URL(submissionBody.attr('data-dynamic-render-url'), siteUrl);
          dynamicRenderUrl.searchParams.set('render_score_panels', 'true');
          const dynamicRenderPanels = await fetch(dynamicRenderUrl).then((res) => {
            assert.ok(res.ok);
            return res.json() as any;
          });

          assert.ok(dynamicRenderPanels.submissionPanel);
          const $submissionPanel = cheerio.load(dynamicRenderPanels.submissionPanel);
          assert.lengthOf($submissionPanel('[data-testid="submission-block"]'), 1);
          assert.equal(getLatestSubmissionStatus($submissionPanel), '100%');
          assert.lengthOf($submissionPanel('.pl-external-grader-results'), 1);
          assert.lengthOf($submissionPanel('.grading-block:not(.d-none)'), 0);
        });

        it('should result in 1 grading jobs', async () => {
          const gradingJobsRowCount = await sqldb.execute(sql.get_grading_jobs_by_iq, { iqId });
          assert.equal(gradingJobsRowCount, 1);
        });
        it('should result in 1 "submission-block" component being rendered', async () => {
          // reload QuestionsPage to also check behaviour when results are ready on load
          questionsPage = await (await fetch(iqUrl)).text();
          $questionsPage = cheerio.load(questionsPage);
          assert.lengthOf($questionsPage('[data-testid="submission-block"]'), 1);
        });
        it('should display submission status', () => {
          assert.equal(getLatestSubmissionStatus($questionsPage), '100%');
        });
        it('should NOT result in "grading-block" component being displayed', () => {
          assert.lengthOf($questionsPage('.grading-block:not(.d-none)'), 0);
        });
      });
      describe('"save" action', () => {
        it('should load page as student and submit "grade" action', async () => {
          const hm1Body = await loadHomeworkPage(mockStudents[1]);
          $hm1Body = cheerio.load(hm1Body);
          iqUrl =
            siteUrl +
            $hm1Body('a:contains("External Grading: Alpine Linux smoke test")').attr('href');

          gradeRes = await saveOrGrade(iqUrl, {}, 'save', [
            { name: 'answer.txt', contents: Buffer.from('correct').toString('base64') },
          ]);
          assert.equal(gradeRes.status, 200);

          questionsPage = await gradeRes.text();
          $questionsPage = cheerio.load(questionsPage);

          iqId = parseInstanceQuestionId(iqUrl);
        });
        it('should NOT result in any grading jobs', async () => {
          const gradingJobsRowCount = await sqldb.execute(sql.get_grading_jobs_by_iq, { iqId });
          assert.equal(gradingJobsRowCount, 0);
        });
        it('should result in 1 "submission-block" component being rendered', () => {
          assert.lengthOf($questionsPage('[data-testid="submission-block"]'), 1);
        });
        it('should display submission status', () => {
          assert.equal(getLatestSubmissionStatus($questionsPage), 'saved, not graded');
        });
        it('should NOT result in "grading-block" component being displayed', () => {
          assert.lengthOf($questionsPage('.grading-block:not(.d-none)'), 0);
        });
      });
      describe('"grade" action with entrypoint arguments', () => {
        it('should load page as student', async () => {
          const hm1Body = await loadHomeworkPage(mockStudents[0]);
          $hm1Body = cheerio.load(hm1Body);
          iqUrl =
            siteUrl +
            $hm1Body('a:contains("External Grading: Alpine Linux with arguments")').attr('href');
          questionsPage = await (await fetch(iqUrl)).text();
          $questionsPage = cheerio.load(questionsPage);
          assert.lengthOf($questionsPage('button[value="grade"]'), 1);
        });
        it('should submit "grade" action', async () => {
          gradeRes = await saveOrGrade(iqUrl, {}, 'grade', [
            { name: 'answer.txt', contents: Buffer.from('answer with space').toString('base64') },
          ]);
          assert.equal(gradeRes.status, 200);
        });
        it('should retrieve results via socket', async () => {
          questionsPage = await gradeRes.text();
          $questionsPage = cheerio.load(questionsPage);

          iqId = parseInstanceQuestionId(iqUrl);
          await waitForExternalGrader($questionsPage);

          // Now that the grading job is done, we can check the results.
          const submissionBody = $questionsPage('.js-submission-body').first();
          const dynamicRenderUrl = new URL(submissionBody.attr('data-dynamic-render-url'), siteUrl);
          dynamicRenderUrl.searchParams.set('render_score_panels', 'true');
          const dynamicRenderPanels = await fetch(dynamicRenderUrl).then((res) => {
            assert.ok(res.ok);
            return res.json() as any;
          });

          assert.ok(dynamicRenderPanels.submissionPanel);
          const $submissionPanel = cheerio.load(dynamicRenderPanels.submissionPanel);
          assert.lengthOf($submissionPanel('[data-testid="submission-block"]'), 1);
          assert.equal(getLatestSubmissionStatus($submissionPanel), '100%');
          assert.lengthOf($submissionPanel('.pl-external-grader-results'), 1);
          assert.lengthOf($submissionPanel('.grading-block:not(.d-none)'), 0);
        });

        it('should result in 1 grading jobs', async () => {
          const gradingJobsRowCount = await sqldb.execute(sql.get_grading_jobs_by_iq, { iqId });
          assert.equal(gradingJobsRowCount, 1);
        });
        it('should result in 1 "submission-block" component being rendered', async () => {
          // reload QuestionsPage to also check behaviour when results are ready on load
          questionsPage = await (await fetch(iqUrl)).text();
          $questionsPage = cheerio.load(questionsPage);
          assert.lengthOf($questionsPage('[data-testid="submission-block"]'), 1);
        });
        it('should display submission status', () => {
          assert.equal(getLatestSubmissionStatus($questionsPage), '100%');
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
            $hm1Body('a:contains("Manual Grading: Adding two numbers (with auto points)")').attr(
              'href',
            );

          // open page to produce variant because we want to get the correct answer
          questionsPage = await (await fetch(iqUrl)).text();
          $questionsPage = cheerio.load(questionsPage);
          assert.lengthOf($questionsPage('button[value="grade"]'), 1);
          // get variant params
          iqId = parseInstanceQuestionId(iqUrl);
        });
        it('should submit "grade" action', async () => {
          const variant = await sqldb.queryRow(sql.get_variant_by_iq, { iqId }, VariantSchema);
          assert.ok(variant.params);

          gradeRes = await saveOrGrade(iqUrl, { c: variant.params.a + variant.params.b }, 'grade');
          assert.equal(gradeRes.status, 200);

          questionsPage = await gradeRes.text();
          $questionsPage = cheerio.load(questionsPage);
        });
        it('should result in 1 grading jobs', async () => {
          const gradingJobsRowCount = await sqldb.execute(sql.get_grading_jobs_by_iq, { iqId });
          assert.equal(gradingJobsRowCount, 1);
        });
        it('should result in 1 "submission-block" component being rendered', () => {
          assert.lengthOf($questionsPage('[data-testid="submission-block"]'), 1);
        });
        it('should display submission status', () => {
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
            $hm1Body('a:contains("Manual Grading: Adding two numbers (with auto points)")').attr(
              'href',
            );

          // open page to produce variant because we want to get the correct answer
          await fetch(iqUrl);
          // get variant params
          iqId = parseInstanceQuestionId(iqUrl);
          const variant = await sqldb.queryRow(sql.get_variant_by_iq, { iqId }, VariantSchema);
          assert.ok(variant.params);

          gradeRes = await saveOrGrade(iqUrl, { c: variant.params.a + variant.params.b }, 'save');
          assert.equal(gradeRes.status, 200);

          questionsPage = await gradeRes.text();
          $questionsPage = cheerio.load(questionsPage);
        });
        it('should NOT result in any grading jobs', async () => {
          const gradingJobsRowCount = await sqldb.execute(sql.get_grading_jobs_by_iq, { iqId });
          assert.equal(gradingJobsRowCount, 0);
        });
        it('should result in 1 "submission-block" component being rendered', () => {
          assert.lengthOf($questionsPage('[data-testid="submission-block"]'), 1);
        });
        it('should display submission status', () => {
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
              'a:contains("Internal Grading: Adding two numbers (with manual points)")',
            ).attr('href');

          // open page to produce variant because we want to get the correct answer
          questionsPage = await (await fetch(iqUrl)).text();
          $questionsPage = cheerio.load(questionsPage);
          assert.lengthOf($questionsPage('button[value="grade"]'), 0);

          // get variant params
          iqId = parseInstanceQuestionId(iqUrl);
        });
        it('should be possible to submit a grade action to "Manual" type question', async () => {
          const variant = await sqldb.queryRow(sql.get_variant_by_iq, { iqId }, VariantSchema);
          assert.ok(variant.params);

          gradeRes = await saveOrGrade(iqUrl, { c: variant.params.a + variant.params.b }, 'grade');
          assert.equal(gradeRes.status, 200);

          questionsPage = await gradeRes.text();
          $questionsPage = cheerio.load(questionsPage);
        });
        it('should NOT result in any grading jobs', async () => {
          const gradingJobsRowCount = await sqldb.execute(sql.get_grading_jobs_by_iq, { iqId });
          assert.equal(gradingJobsRowCount, 0);
        });
        it('should display submission status', () => {
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
              'a:contains("Internal Grading: Adding two numbers (with manual points)")',
            ).attr('href');

          // open page to produce variant because we want to get the correct answer
          await fetch(iqUrl);
          // get variant params
          iqId = parseInstanceQuestionId(iqUrl);
        });
        it('should be possible to submit a save action', async () => {
          const variant = await sqldb.queryRow(sql.get_variant_by_iq, { iqId }, VariantSchema);
          assert.ok(variant.params);

          gradeRes = await saveOrGrade(iqUrl, { c: variant.params.a + variant.params.b }, 'save');
          assert.equal(gradeRes.status, 200);

          questionsPage = await gradeRes.text();
          $questionsPage = cheerio.load(questionsPage);
        });
        it('should NOT result in any grading jobs', async () => {
          const gradingJobsRowCount = await sqldb.execute(sql.get_grading_jobs_by_iq, { iqId });
          assert.equal(gradingJobsRowCount, 0);
        });
        it('should display submission status', () => {
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
          iqUrl = siteUrl + $hm1Body('a:contains("Add two numbers")').attr('href');

          // open page to produce variant because we want to get the correct answer
          questionsPage = await (await fetch(iqUrl)).text();
          $questionsPage = cheerio.load(questionsPage);
          assert.lengthOf($questionsPage('button[value="grade"]'), 1);
          // get variant params
          iqId = parseInstanceQuestionId(iqUrl);
        });
        it('should submit "grade" action', async () => {
          const variant = await sqldb.queryRow(sql.get_variant_by_iq, { iqId }, VariantSchema);
          assert.ok(variant.params);

          gradeRes = await saveOrGrade(iqUrl, { c: variant.params.a + variant.params.b }, 'grade');
          assert.equal(gradeRes.status, 200);

          questionsPage = await gradeRes.text();
          $questionsPage = cheerio.load(questionsPage);
        });
        it('should result in 1 grading jobs', async () => {
          const gradingJobsRowCount = await sqldb.execute(sql.get_grading_jobs_by_iq, { iqId });
          assert.equal(gradingJobsRowCount, 1);
        });
        it('should result in 1 "submission-block" component being rendered', () => {
          assert.lengthOf($questionsPage('[data-testid="submission-block"]'), 1);
        });
        it('should display submission status', () => {
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
          iqUrl = siteUrl + $hm1Body('a:contains("Add two numbers")').attr('href');

          // open page to produce variant because we want to get the correct answer
          await fetch(iqUrl);
          // get variant params
          iqId = parseInstanceQuestionId(iqUrl);
          const variant = await sqldb.queryRow(sql.get_variant_by_iq, { iqId }, VariantSchema);
          assert.ok(variant.params);

          gradeRes = await saveOrGrade(iqUrl, { c: variant.params.a + variant.params.b }, 'save');
          assert.equal(gradeRes.status, 200);

          questionsPage = await gradeRes.text();
          $questionsPage = cheerio.load(questionsPage);
        });
        it('should NOT result in any grading jobs', async () => {
          const gradingJobsRowCount = await sqldb.execute(sql.get_grading_jobs_by_iq, { iqId });
          assert.equal(gradingJobsRowCount, 0);
        });
        it('should result in 1 "submission-block" component being rendered', () => {
          assert.lengthOf($questionsPage('[data-testid="submission-block"]'), 1);
        });
        it('should display submission status', () => {
          assert.equal(getLatestSubmissionStatus($questionsPage), 'saved, not graded');
        });
        it('should NOT result in "grading-block" component being displayed', () => {
          assert.lengthOf($questionsPage('.grading-block:not(.d-none)'), 0);
        });
      });
    });
  });
});
