// @ts-check
const { assert } = require('chai');
const cheerio = require('cheerio');
const fs = require('fs-extra');
const path = require('path');
const { step } = require('mocha-steps');

const config = require('../lib/config');
const fetch = require('node-fetch').default;
const helperServer = require('./helperServer');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sqldb = require('../prairielib/lib/sql-db');
const sql = sqlLoader.loadSqlEquiv(__filename);
const { setUser, parseInstanceQuestionId, saveOrGrade } = require('./helperClient');

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const defaultUser = {
  authUid: config.authUid,
  authName: config.authName,
  authUin: config.authUin,
};


// const mockStudents = [
//   { authUid: 'student1', authName: 'Student User 1', authUin: '00000001' },
//   { authUid: 'student2', authName: 'Student User 2', authUin: '00000002' },
//   { authUid: 'student3', authName: 'Student User 3', authUin: '00000003' },
//   { authUid: 'student4', authName: 'Student User 4', authUin: '00000004' },
// ];

const mockStaff = [
  { authUid: 'staff1', authName: 'Staff User 1', authUin: 'STAFF001' },
  { authUid: 'staff2', authName: 'Staff User 2', authUin: 'STAFF002' },
];

// const assessmentTitle = 'Homework for Internal, External, Manual grading methods';
// const manualGradingQuestionTitle = 'Manual Grading: Fibonacci function, file upload';

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
        assert.equal(form.find('input[name=score_manual_percent]').val(), score_percent);
        assert.equal(form.find('input[name=score_manual_points]').val(), score_points);
        assert.equal(form.find('textarea').text(), feedback_note);
      }
    );

  });
});
