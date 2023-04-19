// @ts-check
const { assert } = require('chai');
const cheerio = require('cheerio');
const fs = require('fs-extra');
const path = require('path');
const { step } = require('mocha-steps');

const { config } = require('../lib/config');
const fetch = require('node-fetch').default;
const helperServer = require('./helperServer');
const sqldb = require('@prairielearn/postgres');
const sql = sqldb.loadSqlEquiv(__filename);
const { setUser, parseInstanceQuestionId, saveOrGrade } = require('./helperClient');

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const defaultUser = {
  authUid: config.authUid,
  authName: config.authName,
  authUin: config.authUin,
};

const fibonacciSolution = fs.readFileSync(
  path.resolve(__dirname, '../testCourse/questions/externalGrade/codeUpload/tests/ans.py')
);

const mockStudents = [
  { authUid: 'student1', authName: 'Student User 1', authUin: '00000001' },
  { authUid: 'student2', authName: 'Student User 2', authUin: '00000002' },
  { authUid: 'student3', authName: 'Student User 3', authUin: '00000003' },
  { authUid: 'student4', authName: 'Student User 4', authUin: '00000004' },
];

const mockStaff = [
  { authUid: 'staff1', authName: 'Staff User 1', authUin: 'STAFF001' },
  { authUid: 'staff2', authName: 'Staff User 2', authUin: 'STAFF002' },
  { authUid: 'staff3', authName: 'Staff User 3', authUin: 'STAFF003' },
  { authUid: 'staff4', authName: 'Staff User 4', authUin: 'STAFF004' },
];

const assessmentTitle = 'Homework for Internal, External, Manual grading methods';
const manualGradingQuestionTitle = 'Manual Grading: Fibonacci function, file upload';

/**
 * @param {object} user student or instructor user to load page by
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

/**
 * @param {object} user student or instructor user to load page by
 * @returns string student URL for manual grading question
 */
const loadHomeworkQuestionUrl = async (user) => {
  const hm1Body = await loadHomeworkPage(user);
  const $hm1Body = cheerio.load(hm1Body);
  return siteUrl + $hm1Body(`a:contains("${manualGradingQuestionTitle}")`).attr('href');
};

/**
 * Gets the score text for the first submission panel on the page.
 *
 * @param {cheerio.Root} $
 * @returns {string}
 */
const getLatestSubmissionStatus = ($) => {
  return $('[data-testid="submission-status"] .badge').first().text();
};

describe('Manual Grading', function () {
  this.timeout(80000);

  let iqUrl, iqId;
  let instancesAssessmentUrl;
  let manualGradingAssessmentUrl;
  let manualGradingAssessmentQuestionUrl;
  let manualGradingIQUrl;
  let manualGradingNextUngradedUrl;
  let $manualGradingPage;
  let score_percent, score_points;
  let feedback_note;

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  before('ensure course has manual grading enabled', async () => {
    await sqldb.queryAsync(sql.enable_manual_grading, {});
  });

  before('build assessment manual grading page URL', async () => {
    const assessments = (await sqldb.queryAsync(sql.get_assessment, {})).rows;
    assert.lengthOf(assessments, 1);
    manualGradingAssessmentUrl = `${baseUrl}/course_instance/1/instructor/assessment/${assessments[0].id}/manual_grading`;
    instancesAssessmentUrl = `${baseUrl}/course_instance/1/instructor/assessment/${assessments[0].id}/instances`;
  });

  before('add staff users', async () => {
    await Promise.all(
      mockStaff.map(async (staff) => {
        const courseStaffParams = [1, staff.authUid, 'None', 1];
        const courseStaffResult = await sqldb.callAsync(
          'course_permissions_insert_by_user_uid',
          courseStaffParams
        );
        assert.equal(courseStaffResult.rowCount, 1);
        staff.user_id = courseStaffResult.rows[0].user_id;
        const ciStaffParams = [1, staff.user_id, 1, 'Student Data Editor', 1];
        const ciStaffResult = await sqldb.callAsync(
          'course_instance_permissions_insert',
          ciStaffParams
        );
        assert.equal(ciStaffResult.rowCount, 1);
      })
    );
  });

  after('reset default user', () => setUser(defaultUser));

  describe('Submit and grade a manually graded question', () => {
    step('load page as student', async () => {
      iqUrl = await loadHomeworkQuestionUrl(mockStudents[0]);
      iqId = parseInstanceQuestionId(iqUrl);
      manualGradingIQUrl = `${manualGradingAssessmentUrl}/instance_question/${iqId}`;

      const instance_questions = (await sqldb.queryAsync(sql.get_instance_question, { iqId })).rows;
      assert.lengthOf(instance_questions, 1);
      assert.equal(instance_questions[0].requires_manual_grading, false);
    });

    step('submit an answer to the question', async () => {
      const gradeRes = await saveOrGrade(iqUrl, {}, 'save', [
        { name: 'fib.py', contents: Buffer.from(fibonacciSolution).toString('base64') },
      ]);
      const questionsPage = await gradeRes.text();
      const $questionsPage = cheerio.load(questionsPage);

      assert.equal(gradeRes.status, 200);
      assert.equal(
        getLatestSubmissionStatus($questionsPage),
        'manual grading: waiting for grading'
      );
    });

    step('should tag question as requiring grading', async () => {
      const instanceQuestions = (await sqldb.queryAsync(sql.get_instance_question, { iqId })).rows;
      assert.lengthOf(instanceQuestions, 1);
      assert.equal(instanceQuestions[0].requires_manual_grading, true);
    });

    step('manual grading page should warn about an open instance', async () => {
      setUser(defaultUser);
      const manualGradingPage = await (await fetch(manualGradingAssessmentUrl)).text();
      $manualGradingPage = cheerio.load(manualGradingPage);
      const row = $manualGradingPage('div.alert:contains("has one open instance")');
      assert.equal(row.length, 1);
    });

    step('manual grading page should list one question requiring grading', async () => {
      const row = $manualGradingPage(`tr:contains("${manualGradingQuestionTitle}")`);
      assert.equal(row.length, 1);
      const count = row.find('td[data-testid="iq-to-grade-count"]').text().replace(/\s/g, '');
      assert.equal(count, '1/1');
      const nextButton = row.find('.btn:contains("next submission")');
      assert.equal(nextButton.length, 1);
      manualGradingAssessmentQuestionUrl =
        siteUrl + row.find(`a:contains("${manualGradingQuestionTitle}")`).attr('href');
      manualGradingNextUngradedUrl = manualGradingAssessmentQuestionUrl + '/next_ungraded';
    });

    step(
      'manual grading page for assessment question should warn about an open instance',
      async () => {
        setUser(defaultUser);
        const manualGradingAQPage = await (await fetch(manualGradingAssessmentQuestionUrl)).text();
        const $manualGradingAQPage = cheerio.load(manualGradingAQPage);
        const row = $manualGradingAQPage('div.alert:contains("has one open instance")');
        assert.equal(row.length, 1);
      }
    );

    step('manual grading page for assessment question should list one instance', async () => {
      setUser(defaultUser);
      const manualGradingAQData = await (
        await fetch(manualGradingAssessmentQuestionUrl + '/instances.json')
      ).text();
      const instanceList = JSON.parse(manualGradingAQData)?.instance_questions;
      assert(instanceList);
      assert.lengthOf(instanceList, 1);
      assert.equal(instanceList[0].id, iqId);
      assert.isOk(instanceList[0].requires_manual_grading);
      assert.isNotOk(instanceList[0].assigned_grader);
      assert.isNotOk(instanceList[0].assigned_grader_name);
      assert.isNotOk(instanceList[0].last_grader);
      assert.isNotOk(instanceList[0].last_grader_name);
    });

    step(
      'manual grading page for instance question should warn about an open instance',
      async () => {
        setUser(defaultUser);
        const manualGradingIQPage = await (await fetch(manualGradingIQUrl)).text();
        const $manualGradingIQPage = cheerio.load(manualGradingIQPage);
        const row = $manualGradingIQPage('div.alert:contains("is still open")');
        assert.equal(row.length, 1);
      }
    );

    step('close assessment', async () => {
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

    step('manual grading page should NOT warn about an open instance', async () => {
      setUser(defaultUser);
      const manualGradingPage = await (await fetch(manualGradingAssessmentUrl)).text();
      $manualGradingPage = cheerio.load(manualGradingPage);
      const row = $manualGradingPage('div.alert:contains("has one open instance")');
      assert.equal(row.length, 0);
    });

    step(
      'manual grading page for assessment question should NOT warn about an open instance',
      async () => {
        setUser(defaultUser);
        const manualGradingAQPage = await (await fetch(manualGradingAssessmentQuestionUrl)).text();
        const $manualGradingAQPage = cheerio.load(manualGradingAQPage);
        const row = $manualGradingAQPage('div.alert:contains("has one open instance")');
        assert.equal(row.length, 0);
      }
    );

    step(
      'manual grading page for instance question should NOT warn about an open instance',
      async () => {
        setUser(defaultUser);
        const manualGradingIQPage = await (await fetch(manualGradingIQUrl)).text();
        const $manualGradingIQPage = cheerio.load(manualGradingIQPage);
        const row = $manualGradingIQPage('div.alert:contains("is still open")');
        assert.equal(row.length, 0);
      }
    );

    step('next ungraded button should point to existing instance for all graders', async () => {
      setUser(defaultUser);
      let nextUngraded = await fetch(manualGradingNextUngradedUrl, { redirect: 'manual' });
      assert.equal(nextUngraded.status, 302);
      assert.equal(nextUngraded.headers.get('location'), manualGradingIQUrl);
      setUser(mockStaff[0]);
      nextUngraded = await fetch(manualGradingNextUngradedUrl, { redirect: 'manual' });
      assert.equal(nextUngraded.status, 302);
      assert.equal(nextUngraded.headers.get('location'), manualGradingIQUrl);
      setUser(mockStaff[1]);
      nextUngraded = await fetch(manualGradingNextUngradedUrl, { redirect: 'manual' });
      assert.equal(nextUngraded.status, 302);
      assert.equal(nextUngraded.headers.get('location'), manualGradingIQUrl);
    });

    step('tag question to specific grader', async () => {
      setUser(defaultUser);
      const manualGradingAQPage = await (await fetch(manualGradingAssessmentQuestionUrl)).text();
      const $manualGradingAQPage = cheerio.load(manualGradingAQPage);
      const token = $manualGradingAQPage('form[name=grading-form]')
        .find('input[name=__csrf_token]')
        .val();

      await fetch(manualGradingAssessmentQuestionUrl, {
        method: 'POST',
        headers: { 'Content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          __action: 'batch_action',
          __csrf_token: token,
          batch_action_data: JSON.stringify({ assigned_grader: mockStaff[0].user_id }),
          instance_question_id: iqId,
        }).toString(),
      });
    });

    step('manual grading page for assessment question should list tagged grader', async () => {
      setUser(defaultUser);
      const manualGradingAQData = await (
        await fetch(manualGradingAssessmentQuestionUrl + '/instances.json')
      ).text();
      const instanceList = JSON.parse(manualGradingAQData)?.instance_questions;
      assert(instanceList);
      assert.lengthOf(instanceList, 1);
      assert.equal(instanceList[0].id, iqId);
      assert.isOk(instanceList[0].requires_manual_grading);
      assert.equal(instanceList[0].assigned_grader, mockStaff[0].user_id);
      assert.equal(instanceList[0].assigned_grader_name, mockStaff[0].authName);
      assert.isNotOk(instanceList[0].last_grader);
      assert.isNotOk(instanceList[0].last_grader_name);
    });

    step('manual grading page should show next ungraded button for assigned grader', async () => {
      setUser(mockStaff[0]);
      const manualGradingPage = await (await fetch(manualGradingAssessmentUrl)).text();
      $manualGradingPage = cheerio.load(manualGradingPage);
      const row = $manualGradingPage(`tr:contains("${manualGradingQuestionTitle}")`);
      assert.equal(row.length, 1);
      const count = row.find('td[data-testid="iq-to-grade-count"]').text().replace(/\s/g, '');
      assert.equal(count, '1/1');
      const nextButton = row.find('.btn:contains("next submission")');
      assert.equal(nextButton.length, 1);
    });

    step(
      'manual grading page should NOT show next ungraded button for non-assigned grader',
      async () => {
        setUser(mockStaff[1]);
        const manualGradingPage = await (await fetch(manualGradingAssessmentUrl)).text();
        $manualGradingPage = cheerio.load(manualGradingPage);
        const row = $manualGradingPage(`tr:contains("${manualGradingQuestionTitle}")`);
        assert.equal(row.length, 1);
        const count = row.find('td[data-testid="iq-to-grade-count"]').text().replace(/\s/g, '');
        assert.equal(count, '1/1');
        const nextButton = row.find('.btn:contains("next submission")');
        assert.equal(nextButton.length, 0);
      }
    );

    step('next ungraded button should point to existing instance for assigned grader', async () => {
      setUser(mockStaff[0]);
      const nextUngraded = await fetch(manualGradingNextUngradedUrl, { redirect: 'manual' });
      assert.equal(nextUngraded.status, 302);
      assert.equal(nextUngraded.headers.get('location'), manualGradingIQUrl);
    });

    step('next ungraded button should point to general page for non-assigned graders', async () => {
      setUser(mockStaff[1]);
      const nextUngraded = await fetch(manualGradingNextUngradedUrl, { redirect: 'manual' });
      assert.equal(nextUngraded.status, 302);
      assert.equal(nextUngraded.headers.get('location'), manualGradingAssessmentQuestionUrl);
    });

    step('submit a grade using percentage', async () => {
      setUser(mockStaff[2]);
      const manualGradingIQPage = await (await fetch(manualGradingIQUrl)).text();
      const $manualGradingIQPage = cheerio.load(manualGradingIQPage);
      const form = $manualGradingIQPage('form[name=instance_question-manual-grade-update-form]');
      score_percent = 30;
      score_points = (score_percent * 6) / 100;
      feedback_note = 'Test feedback note';

      await fetch(manualGradingIQUrl, {
        method: 'POST',
        headers: { 'Content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          __action: 'add_manual_grade',
          __csrf_token: form.find('input[name=__csrf_token]').val(),
          assessment_id: form.find('input[name=assessment_id]').val(),
          assessment_question_id: form.find('input[name=assessment_question_id]').val(),
          modified_at: form.find('input[name=modified_at]').val(),
          use_score_perc: 'on',
          score_manual_percent: score_percent.toString(),
          // Set points to invalid value to ensure score is the one being considered, points should
          // be ignored
          score_manual_points: (score_points + 1).toString(),
          submission_note: feedback_note,
        }).toString(),
      });
    });

    step(
      'manual grading page for instance question should list updated score and feedback',
      async () => {
        setUser(defaultUser);
        const manualGradingIQPage = await (await fetch(manualGradingIQUrl)).text();
        const $manualGradingIQPage = cheerio.load(manualGradingIQPage);
        const form = $manualGradingIQPage('form[name=instance_question-manual-grade-update-form]');
        const actualPercent = parseFloat(form.find('input[name=score_manual_percent]').val());
        const actualPoints = parseFloat(form.find('input[name=score_manual_points]').val());
        // Postgres 12 changed the default `extra_float_digits` from 0 to 1, which
        // subtly changed the rounding behavior of some of the calculations involved
        // here. We use `approximately()` to allow for a small difference.
        //
        // In the future, we'll explicitly round these values to a fixed number of
        // decimals, at which point we can replace this with an exact comparison.
        assert.approximately(actualPercent, score_percent, 0.0001);
        assert.approximately(actualPoints, score_points, 0.0001);
        assert.equal(form.find('textarea').text(), feedback_note);
      }
    );

    step(
      'manual grading page for assessment question should list updated score and status',
      async () => {
        setUser(defaultUser);
        const manualGradingAQData = await (
          await fetch(manualGradingAssessmentQuestionUrl + '/instances.json')
        ).text();
        const instanceList = JSON.parse(manualGradingAQData)?.instance_questions;
        assert(instanceList);
        assert.lengthOf(instanceList, 1);
        assert.equal(instanceList[0].id, iqId);
        assert.isNotOk(instanceList[0].requires_manual_grading);
        assert.equal(instanceList[0].assigned_grader, mockStaff[0].user_id);
        assert.equal(instanceList[0].assigned_grader_name, mockStaff[0].authName);
        assert.equal(instanceList[0].last_grader, mockStaff[2].user_id);
        assert.equal(instanceList[0].last_grader_name, mockStaff[2].authName);
        assert.equal(instanceList[0].score_perc, score_percent);
        // Postgres 12 changed the default `extra_float_digits` from 0 to 1, which
        // subtly changed the rounding behavior of some of the calculations involved
        // here. We use `approximately()` to allow for a small difference.
        //
        // In the future, we'll explicitly round these values to a fixed number of
        // decimals, at which point we can replace this with an exact comparison.
        assert.approximately(instanceList[0].points, score_points, 0.0001);
        assert.approximately(instanceList[0].manual_points, score_points, 0.0001);
        assert.equal(instanceList[0].auto_points, 0);
      }
    );

    step(
      'manual grading page for assessment should NOT show graded instance for grading',
      async () => {
        setUser(mockStaff[0]);
        const manualGradingPage = await (await fetch(manualGradingAssessmentUrl)).text();
        $manualGradingPage = cheerio.load(manualGradingPage);
        const row = $manualGradingPage(`tr:contains("${manualGradingQuestionTitle}")`);
        assert.equal(row.length, 1);
        const count = row.find('td[data-testid="iq-to-grade-count"]').text().replace(/\s/g, '');
        assert.equal(count, '0/1');
        const nextButton = row.find('.btn:contains("next submission")');
        assert.equal(nextButton.length, 0);
      }
    );

    step('next ungraded button should point to general page after grading', async () => {
      setUser(mockStaff[0]);
      let nextUngraded = await fetch(manualGradingNextUngradedUrl, { redirect: 'manual' });
      assert.equal(nextUngraded.status, 302);
      assert.equal(nextUngraded.headers.get('location'), manualGradingAssessmentQuestionUrl);
      setUser(mockStaff[1]);
      nextUngraded = await fetch(manualGradingNextUngradedUrl, { redirect: 'manual' });
      assert.equal(nextUngraded.status, 302);
      assert.equal(nextUngraded.headers.get('location'), manualGradingAssessmentQuestionUrl);
    });

    step('student view should have the new score', async () => {
      iqUrl = await loadHomeworkQuestionUrl(mockStudents[0]);
      const questionsPage = await (await fetch(iqUrl)).text();
      const $questionsPage = cheerio.load(questionsPage);

      // Postgres 12 changed the default `extra_float_digits` from 0 to 1, which
      // subtly changed the rounding behavior of some of the calculations involved
      // here. Because we use `Math.floor` to display the score to the student, we'll
      // be off by 1 in some cases. We use `approximately()` to allow for that.
      //
      // In the future, we'll explicitly round these values to a fixed number of
      // decimals, at which point we can replace this with an exact comparison.
      const submissionStatus = getLatestSubmissionStatus($questionsPage);
      assert.match(submissionStatus, /^manual grading: \d+%/);
      const percent = parseInt(submissionStatus.match(/(\d+)%/)?.[1] ?? '', 10);
      assert.approximately(percent, score_percent, 1);
      const actualPoints = parseFloat(
        $questionsPage(
          '#question-score-panel tr:contains("Total points") [data-testid="awarded-points"]'
        )
          .first()
          .text()
          .trim()
      );
      // Postgres 12 changed the default `extra_float_digits` from 0 to 1, which
      // subtly changed the rounding behavior of some of the calculations involved
      // here. We use `approximately()` to allow for a small difference.
      //
      // In the future, we'll explicitly round these values to a fixed number of
      // decimals, at which point we can replace this with an exact comparison.
      assert.approximately(actualPoints, score_points, 0.1);
      assert.equal(
        $questionsPage('[data-testid="feedback-body"]').first().text().trim(),
        feedback_note
      );
    });

    step('submit a grade using points', async () => {
      setUser(mockStaff[2]);
      const manualGradingIQPage = await (await fetch(manualGradingIQUrl)).text();
      const $manualGradingIQPage = cheerio.load(manualGradingIQPage);
      const form = $manualGradingIQPage('form[name=instance_question-manual-grade-update-form]');
      score_points = 4.5;
      score_percent = (score_points / 6) * 100;
      feedback_note = 'Test feedback note updated';

      await fetch(manualGradingIQUrl, {
        method: 'POST',
        headers: { 'Content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          __action: 'add_manual_grade',
          __csrf_token: form.find('input[name=__csrf_token]').val(),
          assessment_id: form.find('input[name=assessment_id]').val(),
          assessment_question_id: form.find('input[name=assessment_question_id]').val(),
          modified_at: form.find('input[name=modified_at]').val(),
          // use_score_perc not set, so that points are used instead of percentage
          score_manual_points: score_points.toString(),
          // Set percentage to invalid value to ensure points is the one being considered,
          // percentage should be ignored
          score_manual_percent: (score_percent - 10).toString(),
          submission_note: feedback_note,
        }).toString(),
      });
    });

    step(
      'manual grading page for instance question should list updated score and feedback',
      async () => {
        setUser(defaultUser);
        const manualGradingIQPage = await (await fetch(manualGradingIQUrl)).text();
        const $manualGradingIQPage = cheerio.load(manualGradingIQPage);
        const form = $manualGradingIQPage('form[name=instance_question-manual-grade-update-form]');
        assert.equal(form.find('input[name=score_manual_percent]').val(), score_percent);
        assert.equal(form.find('input[name=score_manual_points]').val(), score_points);
        assert.equal(form.find('textarea').text(), feedback_note);
      }
    );

    step(
      'manual grading page for assessment question should list updated score and status',
      async () => {
        setUser(defaultUser);
        const manualGradingAQData = await (
          await fetch(manualGradingAssessmentQuestionUrl + '/instances.json')
        ).text();
        const instanceList = JSON.parse(manualGradingAQData)?.instance_questions;
        assert(instanceList);
        assert.lengthOf(instanceList, 1);
        assert.equal(instanceList[0].id, iqId);
        assert.isNotOk(instanceList[0].requires_manual_grading);
        assert.equal(instanceList[0].assigned_grader, mockStaff[0].user_id);
        assert.equal(instanceList[0].assigned_grader_name, mockStaff[0].authName);
        assert.equal(instanceList[0].last_grader, mockStaff[2].user_id);
        assert.equal(instanceList[0].last_grader_name, mockStaff[2].authName);
        assert.equal(instanceList[0].score_perc, score_percent);
        assert.equal(instanceList[0].points, score_points);
        assert.equal(instanceList[0].manual_points, score_points);
        assert.equal(instanceList[0].auto_points, 0);
      }
    );

    step(
      'manual grading page for assessment should NOT show graded instance for grading',
      async () => {
        setUser(mockStaff[0]);
        const manualGradingPage = await (await fetch(manualGradingAssessmentUrl)).text();
        $manualGradingPage = cheerio.load(manualGradingPage);
        const row = $manualGradingPage(`tr:contains("${manualGradingQuestionTitle}")`);
        assert.equal(row.length, 1);
        const count = row.find('td[data-testid="iq-to-grade-count"]').text().replace(/\s/g, '');
        assert.equal(count, '0/1');
        const nextButton = row.find('.btn:contains("next submission")');
        assert.equal(nextButton.length, 0);
      }
    );

    step('next ungraded button should point to general page after grading', async () => {
      setUser(mockStaff[0]);
      let nextUngraded = await fetch(manualGradingNextUngradedUrl, { redirect: 'manual' });
      assert.equal(nextUngraded.status, 302);
      assert.equal(nextUngraded.headers.get('location'), manualGradingAssessmentQuestionUrl);
      setUser(mockStaff[1]);
      nextUngraded = await fetch(manualGradingNextUngradedUrl, { redirect: 'manual' });
      assert.equal(nextUngraded.status, 302);
      assert.equal(nextUngraded.headers.get('location'), manualGradingAssessmentQuestionUrl);
    });

    step('student view should have the new score', async () => {
      iqUrl = await loadHomeworkQuestionUrl(mockStudents[0]);
      const questionsPage = await (await fetch(iqUrl)).text();
      const $questionsPage = cheerio.load(questionsPage);

      assert.equal(getLatestSubmissionStatus($questionsPage), `manual grading: ${score_percent}%`);
      assert.equal(
        $questionsPage(
          '#question-score-panel tr:contains("Total points") [data-testid="awarded-points"]'
        )
          .first()
          .text()
          .trim(),
        `${score_points}`
      );
      assert.equal(
        $questionsPage('[data-testid="feedback-body"]').first().text().trim(),
        feedback_note
      );
    });
  });
});
